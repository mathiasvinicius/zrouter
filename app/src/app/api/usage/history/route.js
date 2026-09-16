import { NextResponse } from "next/server";
import { getUsageStats } from "@/lib/usageDb";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = searchParams.get("apiKey") || "";
    // No period param → same "all" default as before.
    const period = searchParams.get("period") || undefined;
    const stats = await getUsageStats(period, { apiKey });
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching usage stats:", error);
    return NextResponse.json({ error: "Failed to fetch usage stats" }, { status: 500 });
  }
}
