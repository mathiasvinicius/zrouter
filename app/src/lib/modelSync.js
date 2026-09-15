// Lazy model sync: refresh a provider's compatible models from its upstream
// /models catalog. No cron/worker — the page-open path (route.js) calls
// maybeSyncModels() and pays the discover cost at most once per interval.
import { getCustomModels, addCustomModel, disableModels } from "@/lib/db/index.js";
import { getSyncState, setSyncState } from "@/lib/db/repos/modelDiscoveryRepo.js";
import { discoverProviderModels } from "@/lib/modelDiscovery.js";

const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

// ponytail: mark-instead-of-delete + interval constant here — swap for a
// dedicated job when >50 providers run with autoSyncModels ON.
export function shouldSync(syncState, now = Date.now()) {
  const last = syncState?.lastSyncAt ? Date.parse(syncState.lastSyncAt) : 0;
  return now - last > SYNC_INTERVAL_MS;
}

// Returns null (skipped) or the sync diff {added, disabled}.
export async function maybeSyncProviderModels(providerAlias, connection) {
  const syncState = await getSyncState(providerAlias);
  if (!shouldSync(syncState)) return null;

  const result = await discoverProviderModels(connection);
  if (result.error) {
    console.log(`[modelSync] discover failed for ${providerAlias}: ${result.error}`);
    return null; // keep lastSyncAt — a failing upstream must not hot-loop
  }

  const upstream = result.models.map((m) => m.id).filter(Boolean);
  const upstreamSet = new Set(upstream);
  const customs = (await getCustomModels()).filter(
    (m) => m.providerAlias === providerAlias && (m.type || m.kind || "llm") === "llm"
  );
  const known = new Set(customs.map((m) => m.id));
  const staticIds = new Set(
    (connection.staticModelIds || []).map(String)
  );

  const added = [];
  for (const id of upstream) {
    if (staticIds.has(id) || known.has(id)) continue;
    // Models sourced from a previous import carry source:"discovered"; manual
    // user models never get that flag, so they are never disabled here.
    await addCustomModel({ providerAlias, id, type: "llm", source: "discovered" });
    added.push(id);
  }

  const gone = customs
    .filter((m) => m.source === "discovered" && !upstreamSet.has(m.id))
    .map((m) => m.id);
  if (gone.length) await disableModels(providerAlias, gone);

  await setSyncState(providerAlias, new Date().toISOString());

  if (added.length || gone.length) {
    console.log(`[modelSync] ${providerAlias}: +${added.length} new / -${gone.length} disabled`);
  }
  return { added, disabled: gone };
}
