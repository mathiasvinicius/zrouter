/**
 * Cache policy metrics — persistence without touching usageHistory's schema.
 *
 * What usageHistory cannot tell us is how many requests kept the client's own
 * markers, so the cache-policy counters live in the existing `kv` table (scope
 * "cacheMetrics"): one row for lifetime totals plus one `day:YYYY-MM-DD` row per
 * day. That survives restart and is queryable by period like the rest of usage.
 *
 * Writes are batched: one kv upsert per burst of requests, never per request.
 * ponytail: in-process batching only (no cross-process merge). Add a read-modify-write
 * inside a DB transaction if a second writer process ever appears.
 */

import { makeKv } from "@/lib/db/helpers/kvStore.js";

const kv = makeKv("cacheMetrics");
const FLUSH_MS = 2000;
const TOTALS_KEY = "totals";

let pending = null;
let flushTimer = null;

function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function blankProvider() {
  return { requests: 0, preservedRequests: 0, inputTokens: 0, cachedTokens: 0, cacheCreationTokens: 0, costSaved: 0 };
}

function blank() {
  return { requests: 0, preservedRequests: 0, inputTokens: 0, cachedTokens: 0, cacheCreationTokens: 0, costSaved: 0, byProvider: {} };
}

function addInto(target, provider, preserved, v) {
  target.requests++;
  if (preserved) target.preservedRequests++;
  target.inputTokens += v.inputTokens || 0;
  target.cachedTokens += v.cachedTokens || 0;
  target.cacheCreationTokens += v.cacheCreationTokens || 0;
  target.costSaved += v.costSaved || 0;
  const key = provider || "unknown";
  const p = target.byProvider[key] || (target.byProvider[key] = blankProvider());
  p.requests++;
  if (preserved) p.preservedRequests++;
  p.inputTokens += v.inputTokens || 0;
  p.cachedTokens += v.cachedTokens || 0;
  p.cacheCreationTokens += v.cacheCreationTokens || 0;
  p.costSaved += v.costSaved || 0;
}

function mergeInto(base, delta) {
  base.requests += delta.requests || 0;
  base.preservedRequests += delta.preservedRequests || 0;
  base.inputTokens += delta.inputTokens || 0;
  base.cachedTokens += delta.cachedTokens || 0;
  base.cacheCreationTokens += delta.cacheCreationTokens || 0;
  base.costSaved += delta.costSaved || 0;
  for (const [key, p] of Object.entries(delta.byProvider || {})) {
    const t = base.byProvider[key] || (base.byProvider[key] = blankProvider());
    t.requests += p.requests || 0;
    t.preservedRequests += p.preservedRequests || 0;
    t.inputTokens += p.inputTokens || 0;
    t.cachedTokens += p.cachedTokens || 0;
    t.cacheCreationTokens += p.cacheCreationTokens || 0;
    t.costSaved += p.costSaved || 0;
  }
  return base;
}

async function mergeKvRow(key, delta) {
  const merged = mergeInto({ ...blank(), ...(await kv.get(key, null) || {}) }, delta);
  await kv.set(key, merged);
}

async function flush() {
  flushTimer = null;
  const batch = pending;
  pending = null;
  if (!batch) return;
  try {
    await mergeKvRow(TOTALS_KEY, batch.totals);
    for (const [day, delta] of Object.entries(batch.days)) await mergeKvRow(`day:${day}`, delta);
  } catch (e) {
    // Metrics must never break a request.
    console.warn(`[CacheMetrics] flush failed: ${e.message}`);
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flush(); }, FLUSH_MS);
  if (flushTimer.unref) flushTimer.unref();
}

/** Record one request's cache outcome. Fire-and-forget; never throws. */
export function recordCacheOutcome({ provider, preserved, inputTokens, cachedTokens, cacheCreationTokens, costSaved } = {}) {
  try {
    pending ??= { totals: blank(), days: {} };
    const values = { inputTokens, cachedTokens, cacheCreationTokens, costSaved };
    addInto(pending.totals, provider, preserved === true, values);
    const day = localDateKey();
    pending.days[day] ??= blank();
    addInto(pending.days[day], provider, preserved === true, values);
    scheduleFlush();
  } catch (e) {
    console.warn(`[CacheMetrics] record failed: ${e.message}`);
  }
}

/**
 * Record cache usage for a completed request, pricing the cache-read discount
 * (cached tokens billed at the cached rate instead of the full input rate).
 * Fail-open: an unknown model records tokens with zero cost.
 */
export async function recordCacheUsage({ provider, model, preserved, tokens } = {}) {
  const t = tokens || {};
  const cachedTokens = t.cached_tokens || t.cache_read_input_tokens || 0;
  const inputTokens = t.prompt_tokens || t.input_tokens || 0;
  let costSaved = 0;
  if (cachedTokens > 0) {
    try {
      const { getPricingForModel } = await import("@/lib/db/repos/pricingRepo.js");
      const { calculateCostFromTokens } = await import("open-sse/providers/pricing.js");
      const pricing = await getPricingForModel(provider, model);
      if (pricing?.cached != null) {
        costSaved = cachedTokens * ((pricing.input - pricing.cached) / 1_000_000);
        if (costSaved < 0) costSaved = 0;
      }
    } catch { /* pricing is best-effort */ }
  }
  recordCacheOutcome({
    provider,
    preserved,
    inputTokens,
    cachedTokens,
    cacheCreationTokens: t.cache_creation_input_tokens || 0,
    costSaved,
  });
}

/** Flush pending counters immediately (tests / shutdown). */
export async function flushCacheMetrics() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  await flush();
}

const PERIOD_DAYS = { "24h": 1, today: 1, "7d": 7, "30d": 30, "60d": 60 };

/** Aggregated cache-policy metrics for a period (same period vocabulary as getUsageStats). */
export async function getCacheMetrics(period = "7d") {
  const maxDays = PERIOD_DAYS[period] ?? null;
  const all = await kv.getAll();
  const totals = { ...blank(), ...(all[TOTALS_KEY] || {}) };

  const result = blank();
  if (!maxDays) {
    mergeInto(result, totals);
  } else {
    const cutoffKey = localDateKey(new Date(Date.now() - (maxDays - 1) * 86400000));
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith("day:") || key.slice(4) < cutoffKey || !value) continue;
      mergeInto(result, value);
    }
  }

  return {
    period,
    ...result,
    // Cached tokens are reused rather than re-charged at the full input rate.
    tokensSaved: result.cachedTokens,
    estimatedCostSaved: result.costSaved,
    lifetime: { requests: totals.requests, tokensSaved: totals.cachedTokens, estimatedCostSaved: totals.costSaved },
  };
}
