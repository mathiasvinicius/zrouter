import { NextResponse } from "next/server";
import { getProviderConnections } from "@/lib/db/repos/connectionsRepo.js";
import { getHealthSnapshot, sweep } from "@/lib/credentialHealth/scheduler.js";

export const dynamic = "force-dynamic";

// GET /api/providers/health — per-connection credential health for the dashboard.
// Read-only: the scheduler owns the writes.
export async function GET() {
  try {
    const [connections, health] = await Promise.all([
      getProviderConnections({ isActive: true }),
      Promise.resolve(getHealthSnapshot()),
    ]);
    const rows = connections.map((c) => {
      const h = health[c.id] || null;
      return {
        id: c.id,
        provider: c.provider,
        name: c.name || c.email || c.id,
        status: h?.status || c.testStatus || "unknown",
        lastTestedAt: h?.lastTestedAt || c.lastTested || null,
        nextCheckAt: h?.nextCheckAt || null,
        lastError: h?.lastError ?? c.lastError ?? null,
        consecutiveFailures: h?.consecutiveFailures || 0,
        backoffLevel: h?.backoffLevel || 0,
      };
    });
    return NextResponse.json({ connections: rows });
  } catch (error) {
    console.error("[API] Failed to get credential health:", error);
    return NextResponse.json({ error: "Failed to fetch credential health" }, { status: 500 });
  }
}

// POST /api/providers/health — run one sweep now (manual trigger, same code path).
export async function POST() {
  try {
    const results = await sweep({ force: true });
    return NextResponse.json({ ok: true, tested: results.length, results, health: getHealthSnapshot() });
  } catch (error) {
    console.error("[API] Credential health sweep failed:", error);
    return NextResponse.json({ error: "Credential health sweep failed" }, { status: 500 });
  }
}
