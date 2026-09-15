import { NextResponse } from "next/server";
import { getApiKeyById, normalizeKeySources } from "@/lib/localDb";
import { getSourcesStatus } from "open-sse/sources/status.js";

export const dynamic = "force-dynamic";

// GET /api/sources/status?key=<id>
// → {notion: {configured, ok, latencyMs, status}, "open-notebook": {...}, neo4j: {...}}
// When ?key= is passed, the response also includes that key's per-source scope
// (enabled flags + configured scope lists) so the modal and the Fontes page
// render exactly what the key is allowed to query.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get("key");
    const status = await getSourcesStatus();

    if (keyId) {
      const key = await getApiKeyById(keyId);
      if (!key) {
        return NextResponse.json({ error: "Key not found" }, { status: 404 });
      }
      const normalized = normalizeKeySources(key.sources);
      for (const [origin, entry] of Object.entries(normalized)) {
        // Per-key scope merges into the flat spec shape: {notion, "open-notebook", neo4j}
        // each with configured/ok/latencyMs/status + enabled/scope lists.
        status[origin] = { ...status[origin], enabled: entry.enabled,
          ...(entry.enabled ? Object.fromEntries(Object.entries(entry).filter(([k]) => k !== "enabled")) : {}) };
      }
    }

    return NextResponse.json(status);
  } catch (error) {
    console.log("Error fetching sources status:", error);
    return NextResponse.json({ error: "Failed to fetch sources status" }, { status: 500 });
  }
}
