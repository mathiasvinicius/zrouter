import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/db/index.js";
import { getSyncState, setSyncState } from "@/lib/db/repos/modelDiscoveryRepo.js";
import { getModelsByProviderId } from "open-sse/config/providerModels.js";
import { maybeSyncProviderModels } from "@/lib/modelSync.js";
import { getProviderConnections } from "@/lib/db/index.js";

const TOGGLE_KEYS = ["autoDiscoverModels", "autoSyncModels"];

// PATCH /api/providers/[id]/models/sync — persist the per-provider toggles
// { autoDiscoverModels, autoSyncModels } in settings.
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const updates = {};
    for (const key of TOGGLE_KEYS) {
      if (typeof body[key] === "boolean") updates[key] = body[key];
    }
    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: "No toggle fields provided" }, { status: 400 });
    }
    const settings = await getSettings();
    const merged = { ...(settings[TOGGLE_KEYS[0]] !== undefined ? {} : {}), ...updates };
    const patch = {};
    for (const key of Object.keys(updates)) {
      patch[key] = { ...(settings[key] || {}), [id]: updates[key] };
    }
    await updateSettings(patch);
    return NextResponse.json({ success: true, ...patch });
  } catch (error) {
    console.log("[sync] error:", error.message);
    return NextResponse.json({ error: "Failed to update sync settings" }, { status: 500 });
  }
}

// POST /api/providers/[id]/models/sync — run the lazy sync now (manual button /
// page-open path), even outside the 12h window. Returns the diff.
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const settings = await getSettings();
    const [connection] = await getProviderConnections({ provider: id, isActive: true })
      .then((list) => list)
      .catch(() => []);
    const conn = connection || (await getProviderConnections({ provider: id }))[0] || null;
    if (!conn) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    const staticModelIds = getModelsByProviderId(id).map((m) => m.id);
    const result = await maybeSyncProviderModels(id, { ...conn, staticModelIds });
    if (!result) {
      const state = await getSyncState(id);
      return NextResponse.json({ skipped: true, lastSyncAt: state.lastSyncAt });
    }
    return NextResponse.json({ ...result });
  } catch (error) {
    console.log("[sync] error:", error.message);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
