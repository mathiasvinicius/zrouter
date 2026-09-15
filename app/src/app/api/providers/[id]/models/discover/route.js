import { NextResponse } from "next/server";
import {
  getProviderConnections,
  getProviderConnectionById,
} from "@/lib/db/index.js";
import { getProviderNodeById } from "@/lib/db/index.js";
import { getDiscoveryCache, setDiscoveryCache } from "@/lib/db/repos/modelDiscoveryRepo.js";
import { discoverProviderModels } from "@/lib/modelDiscovery.js";
import { shouldSync } from "@/lib/modelSync.js";
import { getSyncState, setSyncState } from "@/lib/db/repos/modelDiscoveryRepo.js";

const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // auto-discover refresh window
const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

async function resolveTarget(id, body) {
  // [id] is a connection id, a compatible node id, or a storage alias
  // (provider id) — resolved in that order; body.node_id forces a connection.
  if (body?.node_id) {
    const c = await getProviderConnectionById(body.node_id);
    return { connection: c, providerAlias: c?.provider };
  }
  {
    const byId = await getProviderConnectionById(id);
    if (byId) return { connection: byId, providerAlias: byId.provider };
    const node = await getProviderNodeById(id);
    if (node) {
      const firstActive = (await getProviderConnections({ provider: id, isActive: true }))[0]
        || (await getProviderConnections({ provider: id }))[0]
        || null;
      return { connection: firstActive, providerAlias: id };
    }
    const byProvider = await getProviderConnections({ provider: id, isActive: true });
    const first = byProvider[0] || (await getProviderConnections({ provider: id }))[0] || null;
    if (!first) return { connection: null, providerAlias: id };
    return { connection: first, providerAlias: first.provider };
  }
}

async function runDiscover(target, { ignoreCache }) {
  const { connection, providerAlias } = target;
  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  if (!ignoreCache) {
    const cache = await getDiscoveryCache(providerAlias);
    if (cache?.discoveredAt && Date.now() - Date.parse(cache.discoveredAt) < CACHE_MAX_AGE_MS) {
      return NextResponse.json({
        models: cache.models,
        discoveredAt: cache.discoveredAt,
        count: cache.models.length,
        fromCache: true,
      });
    }
  }

  const result = await discoverProviderModels(connection);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  await setDiscoveryCache(providerAlias, result.models);
  return NextResponse.json({
    models: result.models,
    discoveredAt: new Date().toISOString(),
    count: result.models.length,
    fromCache: false,
  });
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    let body = {};
    try { body = await request.json(); } catch {}
    const target = await resolveTarget(id, body);
    return await runDiscover(target, { ignoreCache: body?.ignoreCache === true });
  } catch (error) {
    console.log("[discover] error:", error.message);
    return NextResponse.json({ error: "Model discovery failed" }, { status: 500 });
  }
}

// GET /api/providers/[id]/models/discover — cache-first read for page-open
// auto-discover (contract B): ?ignoreCache=1 forces a fresh upstream fetch,
// ?sync=1 additionally runs the lazy auto-sync (contract C) and returns its
// diff so the UI can toast "+N novos / -M desabilitados".
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const ignoreCache = searchParams.get("ignoreCache") === "1";
    const doSync = searchParams.get("sync") === "1";
    const target = await resolveTarget(id, {});
    if (!target.connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    let syncResult = null;
    if (doSync) {
      const { maybeSyncProviderModels } = await import("@/lib/modelSync.js");
      syncResult = await maybeSyncProviderModels(target.providerAlias, {
        ...target.connection,
        staticModelIds: (await import("open-sse/config/providerModels.js"))
          .getModelsByProviderId(target.providerAlias)
          .map((m) => m.id),
      });
    }

    const response = await runDiscover(target, { ignoreCache });
    if (syncResult && response.status === 200) {
      const body = await response.json().catch(() => null);
      if (body) return NextResponse.json({ ...body, sync: syncResult });
    }
    return response;
  } catch (error) {
    console.log("[discover] error:", error.message);
    return NextResponse.json({ error: "Model discovery failed" }, { status: 500 });
  }
}
