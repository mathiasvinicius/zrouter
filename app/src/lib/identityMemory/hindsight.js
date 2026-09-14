import { createHash } from "node:crypto";
import { isTrivialMemoryText, lastUserText, userTextWithoutInjectedContext } from "./common.js";

export { isTrivialMemoryText, userTextWithoutInjectedContext } from "./common.js";

const DEFAULT_HINDSIGHT_URL = "http://127.0.0.1:8888";
const DEFAULT_RECALL_DEDUP_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RETAIN_DEDUP_TTL_MS = 15 * 60 * 1000;
const MAX_DEDUP_ENTRIES = 2048;
const MENTAL_MODEL_TRIGGER = {
  mode: "delta",
  refresh_after_consolidation: false,
  refresh_cron: "*/15 * * * *",
  fact_types: ["world", "experience", "observation"],
  exclude_mental_models: true,
};

const recallCache = new Map();
const retainedMessages = new Map();

function baseUrl() {
  return String(process.env.HINDSIGHT_API_URL || DEFAULT_HINDSIGHT_URL).replace(/\/+$/, "");
}

export async function ensureBank(bankId, name) {
  const response = await fetch(`${baseUrl()}/v1/default/banks/${encodeURIComponent(bankId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name || bankId,
      mission: `Long-term memory for the 9Router identity ${name || bankId}.`,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Hindsight rejected bank ${bankId}`);
}

export async function ensureMentalModel(bankId, mentalModelId, name) {
  const itemUrl = `${baseUrl()}/v1/default/banks/${encodeURIComponent(bankId)}/mental-models/${encodeURIComponent(mentalModelId)}`;
  const current = await fetch(itemUrl, { signal: AbortSignal.timeout(5000) });
  if (current.ok) {
    const model = await current.json();
    const trigger = model?.trigger || {};
    if (
      trigger.mode === MENTAL_MODEL_TRIGGER.mode
      && trigger.refresh_after_consolidation === MENTAL_MODEL_TRIGGER.refresh_after_consolidation
      && trigger.refresh_cron === MENTAL_MODEL_TRIGGER.refresh_cron
      && trigger.exclude_mental_models === MENTAL_MODEL_TRIGGER.exclude_mental_models
      && JSON.stringify(trigger.fact_types || []) === JSON.stringify(MENTAL_MODEL_TRIGGER.fact_types)
    ) return model;

    const updated = await fetch(itemUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: MENTAL_MODEL_TRIGGER }),
      signal: AbortSignal.timeout(10000),
    });
    if (!updated.ok) throw new Error(`Failed to update mental model ${mentalModelId}`);
    return updated.json();
  }
  if (current.status !== 404) throw new Error(`Failed to inspect mental model ${mentalModelId}`);

  const response = await fetch(
    `${baseUrl()}/v1/default/banks/${encodeURIComponent(bankId)}/mental-models`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: mentalModelId,
        name: `Automatic profile: ${name || mentalModelId}`,
        source_query: `Build a current, internally consistent profile of ${name || "this identity"}: preferences, relationships, communication style, ongoing goals, important decisions and stable context. Resolve contradictions in favor of the most recent evidence. Do not invent facts.`,
        max_tokens: 3072,
        trigger: MENTAL_MODEL_TRIGGER,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new Error(`Hindsight rejected mental model ${mentalModelId}`);
  return response.json();
}

export async function mentalModelForProfile(profile) {
  if (!profile?.memoryEnabled || !profile?.hindsightBankId || !profile?.mentalModelId) return "";
  try {
    const response = await fetch(
      `${baseUrl()}/v1/default/banks/${encodeURIComponent(profile.hindsightBankId)}/mental-models/${encodeURIComponent(profile.mentalModelId)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return "";
    const payload = await response.json();
    return typeof payload?.content === "string" ? payload.content : "";
  } catch {
    return "";
  }
}

export async function listBankMemories(bankId, limit = 50, offset = 0) {
  const url = new URL(`${baseUrl()}/v1/default/banks/${encodeURIComponent(bankId)}/memories/list`);
  url.searchParams.set("limit", String(Math.min(100, Math.max(1, limit))));
  url.searchParams.set("offset", String(Math.max(0, offset)));
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Failed to list Hindsight memories");
  return response.json();
}

export async function clearBankMemories(bankId) {
  const response = await fetch(
    `${baseUrl()}/v1/default/banks/${encodeURIComponent(bankId)}/memories`,
    { method: "DELETE", signal: AbortSignal.timeout(10000) },
  );
  if (!response.ok) throw new Error("Failed to clear Hindsight memories");
  return response.json();
}

function ttlFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function memoryFingerprint(profile, content) {
  return createHash("sha256")
    .update(`${profile.hindsightBankId}\0${profile.id}\0${content}`)
    .digest("hex");
}

function pruneCache(cache, now) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size >= MAX_DEDUP_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

export function clearMemoryDedupCaches() {
  recallCache.clear();
  retainedMessages.clear();
}

/**
 * Greetings and acknowledgements carry no durable information. Sending them to
 * Hindsight adds recall latency and can trigger needless background
 * consolidation/model-refresh calls.
 */
export async function recallForProfile(profile, body) {
  if (!profile?.memoryEnabled || !profile?.hindsightBankId) return "";
  const query = userTextWithoutInjectedContext(lastUserText(body));
  if (!query || isTrivialMemoryText(query)) return "";
  const now = Date.now();
  const key = memoryFingerprint(profile, query);
  pruneCache(recallCache, now);
  const cached = recallCache.get(key);
  if (cached?.expiresAt > now) return cached.value;

  const value = (async () => {
    try {
      const response = await fetch(
        `${baseUrl()}/v1/default/banks/${encodeURIComponent(profile.hindsightBankId)}/memories/recall`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            types: ["world", "experience", "observation"],
            prefer_observations: true,
            budget: "low",
            max_tokens: 1400,
          }),
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!response.ok) return "";
      const payload = await response.json();
      if (typeof payload?.text === "string") return payload.text;
      if (typeof payload?.context === "string") return payload.context;
      const items = payload?.results || payload?.memories || [];
      return Array.isArray(items)
        ? items.map((item) => item?.text || item?.content || item?.fact || "").filter(Boolean).join("\n")
        : "";
    } catch {
      return "";
    }
  })();
  recallCache.set(key, {
    expiresAt: now + ttlFromEnv("HINDSIGHT_RECALL_DEDUP_TTL_MS", DEFAULT_RECALL_DEDUP_TTL_MS),
    value,
  });
  return value;
}

export async function retainForProfile(profile, body, documentId) {
  if (!profile?.memoryEnabled || !profile?.hindsightBankId) return;
  const content = userTextWithoutInjectedContext(lastUserText(body));
  if (!content || isTrivialMemoryText(content)) return;
  const now = Date.now();
  const key = memoryFingerprint(profile, content);
  pruneCache(retainedMessages, now);
  const existing = retainedMessages.get(key);
  if (existing?.expiresAt > now) return;

  retainedMessages.set(key, {
    expiresAt: now + ttlFromEnv("HINDSIGHT_RETAIN_DEDUP_TTL_MS", DEFAULT_RETAIN_DEDUP_TTL_MS),
  });
  try {
    const response = await fetch(
      `${baseUrl()}/v1/default/banks/${encodeURIComponent(profile.hindsightBankId)}/memories`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          async: true,
          items: [{
            content,
            context: `9Router conversation for ${profile.name || profile.id}`,
            document_id: documentId,
            tags: [`api-key:${profile.id}`],
            // Keep provenance tags on raw facts while consolidating durable
            // observations across sessions/API keys for this memory bank.
            observation_scopes: "shared",
          }],
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) retainedMessages.delete(key);
  } catch {
    retainedMessages.delete(key);
    // Memory is fail-open and must never break inference.
  }
}
