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
export function enabledSourceOrigins(apiKeyRow) {
  return SOURCE_ORIGINS.filter((origin) => isSourceEnabled(apiKeyRow, origin));
}

/**
 * Citable excerpts for the key's authorized sources.
 * @returns {Promise<object[]>} ranked items, or [] on timeout/error/no source enabled.
 */
export async function recallSourcesForKey(apiKeyRow, query, settings) {
  const origins = enabledSourceOrigins(apiKeyRow);
  if (origins.length === 0) return [];
  if (!String(query || "").trim()) return [];
  const timeoutMs = sourcesRecallTimeoutMs(settings);
  let timer = null;
  try {
    const results = await Promise.race([
      searchSources(apiKeyRow, query, null, sourcesRecallLimit(settings)),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
        timer.unref?.();
      }),
    ]);
    if (results === null) {
      warn("recall-timeout", { timeoutMs, origins });
      return [];
    }
    return Array.isArray(results) ? results : [];
  } catch (error) {
    warn("recall-failed", { origins, error: String(error?.message || error).slice(0, 200) });
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
