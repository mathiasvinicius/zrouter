import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import { getUsageStats } from "@/lib/usageDb";
import { getCacheMetrics } from "@/lib/cacheMetrics.js";
import { normalizeCacheControlMode } from "open-sse/utils/cacheControlPolicy.js";

const VALID_PERIODS = new Set(["today", "24h", "7d", "30d", "60d", "all"]);

export const dynamic = "force-dynamic";

// GET /api/usage/cache-metrics?period=24h — prompt-cache policy mode + savings.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";
    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }
    const livePeriod = period === "24h" || period === "today";
    const [settings, metrics, usage] = await Promise.all([
      getSettings(),
      getCacheMetrics(period),
      livePeriod ? getUsageStats(period) : null,
    ]);
    // Daily KV rows preserve policy-only counters, but cannot represent a rolling
    // 24-hour boundary and older rows may predate nested cache-token support.
    // For live periods, use usageHistory as the authoritative token/request view.
    const byProvider = usage ? Object.fromEntries(Object.entries(usage.byProvider || {}).map(([provider, row]) => [
      provider,
      {
        ...(metrics.byProvider?.[provider] || {}),
        requests: row.requests || 0,
        inputTokens: row.promptTokens || 0,
        cachedTokens: row.cachedTokens || 0,
      },
    ])) : metrics.byProvider;
    const current = usage ? {
      ...metrics,
      requests: usage.totalRequests || 0,
      inputTokens: usage.totalPromptTokens || 0,
      cachedTokens: usage.totalCachedTokens || 0,
      tokensSaved: usage.totalCachedTokens || 0,
      byProvider,
    } : metrics;
    return NextResponse.json({
      ...current,
      // Policy counters have daily precision; do not present them as rolling 24h.
      policyPeriod: period === "24h" ? "today" : period,
      policyRequests: metrics.requests || 0,
      mode: normalizeCacheControlMode(settings.cacheControlMode),
    });
  } catch (error) {
    console.error("[API] Failed to get cache metrics:", error);
    return NextResponse.json({ error: "Failed to fetch cache metrics" }, { status: 500 });
  }
}
