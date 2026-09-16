import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
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
    const [settings, metrics] = await Promise.all([getSettings(), getCacheMetrics(period)]);
    return NextResponse.json({
      ...metrics,
      mode: normalizeCacheControlMode(settings.cacheControlMode),
    });
  } catch (error) {
    console.error("[API] Failed to get cache metrics:", error);
    return NextResponse.json({ error: "Failed to fetch cache metrics" }, { status: 500 });
  }
}
