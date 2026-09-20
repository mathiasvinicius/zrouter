// Per-key context injected on the chat path (Entrega 3): knowledge-source excerpts
// and the capability index. Lives app-side because it needs both the sources contract
// (open-sse) and the skills registry (src/shared/constants).
//
// Hard rules: a slow or broken source must never block inference (timeout + fail-open),
// and the query derivation is NOT duplicated here — the caller passes the same query
// the memory recall derived (lastUserText + userTextWithoutInjectedContext).

import { searchSources, isSourceEnabled, SOURCE_ORIGINS } from "open-sse/sources/index.js";
import { buildCapabilitiesBlock } from "@/shared/constants/capabilities.js";
import { lastUserText, userTextWithoutInjectedContext, isTrivialMemoryText } from "@/lib/identityMemory/common.js";

export const DEFAULT_SOURCES_RECALL_LIMIT = 6;
export const MAX_SOURCES_RECALL_LIMIT = 20;
export const DEFAULT_SOURCES_RECALL_TIMEOUT_MS = 2500;
export const MAX_SOURCES_RECALL_TIMEOUT_MS = 30000;
export const DEFAULT_SOURCES_RECALL_MAX_CHARS = 4000;
export const MAX_SOURCES_RECALL_MAX_CHARS = 20000;
const SOURCES_CACHE_TTL_MS = 60_000;
const SOURCES_CACHE_MAX = 256;
const recallCache = new Map();

function bounded(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

export const sourcesRecallLimit = (settings) =>
  bounded(settings?.sourcesRecallLimit, DEFAULT_SOURCES_RECALL_LIMIT, 1, MAX_SOURCES_RECALL_LIMIT);

export const sourcesRecallTimeoutMs = (settings) =>
  bounded(settings?.sourcesRecallTimeoutMs, DEFAULT_SOURCES_RECALL_TIMEOUT_MS, 1, MAX_SOURCES_RECALL_TIMEOUT_MS);

export const sourcesRecallMaxChars = (settings) =>
  bounded(settings?.sourcesRecallMaxChars, DEFAULT_SOURCES_RECALL_MAX_CHARS, 1, MAX_SOURCES_RECALL_MAX_CHARS);

/**
 * The query used for source recall — delegates to the same helpers the memory
 * recall uses (src/lib/identityMemory/common.js) instead of re-implementing them.
 * ponytail: recallForProfile does not export its text, so the two derivations stay
 * adjacent here; refactor into one exported helper if a third caller appears.
 */
export function sourcesQueryFromBody(body) {
  const text = userTextWithoutInjectedContext(lastUserText(body));
  return text && !isTrivialMemoryText(text) ? text : "";
}

// Only the origins this key enabled, in registry order.
export function effectiveSourcesRow(apiKeyRow) {
  const raw = typeof apiKeyRow?.sources === "string"
    ? (() => { try { return JSON.parse(apiKeyRow.sources); } catch { return {}; } })()
    : structuredClone(apiKeyRow?.sources || {});
  const memoryBank = apiKeyRow?.memoryEnabled && apiKeyRow?.hindsightBankId
    ? String(apiKeyRow.hindsightBankId)
    : "";
  const neo4j = raw?.neo4j;
  if (memoryBank && neo4j?.enabled && Array.isArray(neo4j.banks)) {
    neo4j.banks = neo4j.banks.map(String).filter((bank) => bank !== memoryBank);
    if (neo4j.banks.length === 0) neo4j.enabled = false;
  }
  return { ...apiKeyRow, sources: raw };
}

export function enabledSourceOrigins(apiKeyRow) {
  const effective = effectiveSourcesRow(apiKeyRow);
  return SOURCE_ORIGINS.filter((origin) => isSourceEnabled(effective, origin));
}

/**
 * Citable excerpts for the key's authorized sources.
 * @returns {Promise<object[]>} ranked items, or [] on timeout/error/no source enabled.
 */
export async function recallSourcesForKey(apiKeyRow, query, settings) {
  const effectiveRow = effectiveSourcesRow(apiKeyRow);
  const origins = SOURCE_ORIGINS.filter((origin) => isSourceEnabled(effectiveRow, origin));
  if (origins.length === 0) return [];
  if (!String(query || "").trim()) return [];
  const timeoutMs = sourcesRecallTimeoutMs(settings);
  const cacheKey = JSON.stringify([
    apiKeyRow?.id || "", effectiveRow.sources, String(query).trim(), sourcesRecallLimit(settings),
  ]);
  const now = Date.now();
  for (const [key, cached] of recallCache) {
    if (cached.expiresAt <= now) recallCache.delete(key);
  }
  const cached = recallCache.get(cacheKey);
  if (cached) {
    try { return await cached.value; } catch { return []; }
  }
  const controller = new AbortController();
  let timer = null;
  try {
    const pending = searchSources(
      effectiveRow, query, null, sourcesRecallLimit(settings), { signal: controller.signal },
    ).then((results) => Array.isArray(results) ? results : []);
    const bounded = Promise.race([
      pending,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(new Error("sources recall timeout"));
          reject(new Error("sources recall timeout"));
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
    recallCache.set(cacheKey, { expiresAt: now + SOURCES_CACHE_TTL_MS, value: bounded });
    while (recallCache.size > SOURCES_CACHE_MAX) recallCache.delete(recallCache.keys().next().value);
    return await bounded;
  } catch (error) {
    recallCache.delete(cacheKey);
    const timeout = controller.signal.aborted;
    warn(timeout ? "recall-timeout" : "recall-failed", {
      origins,
      ...(timeout ? { timeoutMs } : { error: String(error?.message || error).slice(0, 200) }),
    });
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Capability index for the key: registry-derived skills + the origins it may use. */
export function capabilitiesBlockForKey(apiKeyRow) {
  try {
    return buildCapabilitiesBlock(undefined, enabledSourceOrigins(apiKeyRow));
  } catch (error) {
    warn("capabilities-failed", { error: String(error?.message || error).slice(0, 200) });
    return "";
  }
}

// Structured log — same channel/event convention as open-sse/sources/index.js,
// and never the query text or a credential.
function warn(event, fields) {
  console.warn(JSON.stringify({ channel: "sources", event, ...fields }));
}
