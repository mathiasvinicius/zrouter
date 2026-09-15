// Entrega 2 B/C — lazy sync: <12h não re-descobre; >12h descobre e persiste;
// modelos sumidos ficam disabled; customs do usuário ficam intactos.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-autosync-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function boot() {
  await import("@/lib/db/driver.js").then((m) => m.getAdapter());
  return {
    sync: await import("./../../src/lib/modelSync.js"),
    db: await import("@/lib/db/index.js"),
    syncRoute: await import("./../../src/app/api/providers/[id]/models/sync/route.js"),
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const UPSTREAM = { data: [{ id: "keep-1" }, { id: "gone-1" }, { id: "brand-new" }] };

async function seed(db, { discovered, manual }) {
  const conn = await db.createProviderConnection({
    provider: "deepseek", authType: "apikey", name: "c1", apiKey: "sk-x", isActive: true,
  });
  for (const id of discovered) {
    await db.addCustomModel({ providerAlias: "deepseek", id, type: "llm", source: "discovered" });
  }
  for (const id of manual) {
    await db.addCustomModel({ providerAlias: "deepseek", id, type: "llm" });
  }
  return conn;
}

const UPSTREAM_SHRUNK = { data: [{ id: "keep-1" }, { id: "brand-new" }] }; // gone-1 vanished

describe("maybeSyncProviderModels (lazy 12h)", () => {
  it("skips when lastSyncAt is < 12h old", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { sync, db } = await boot();
    const { setSyncState } = await import("@/lib/db/repos/modelDiscoveryRepo.js");
    const conn = await seed(db, { discovered: [], manual: [] });
    await setSyncState("deepseek", new Date(Date.now() - 3600e3).toISOString()); // 1h

    const result = await sync.maybeSyncProviderModels("deepseek", conn);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("discovers after >12h, persists state and adds new models", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(UPSTREAM_SHRUNK)));
    const { sync, db } = await boot();
    const { setSyncState } = await import("@/lib/db/repos/modelDiscoveryRepo.js");
    const conn = await seed(db, { discovered: ["keep-1", "gone-1"], manual: [] });
    await setSyncState("deepseek", new Date(Date.now() - 13 * 3600e3).toISOString()); // 13h

    const result = await sync.maybeSyncProviderModels("deepseek", conn);
    expect(result.added).toEqual(["brand-new"]);
    expect(result.disabled).toEqual(["gone-1"]);

    const state = await import("@/lib/db/repos/modelDiscoveryRepo.js");
    const s = await state.getSyncState("deepseek");
    expect(Date.now() - Date.parse(s.lastSyncAt)).toBeLessThan(60e3);

    const customs = await db.getCustomModels();
    expect(customs.map((m) => m.id).sort()).toEqual(["brand-new", "gone-1", "keep-1"]);
  });

  it("marks vanished discovered models disabled but keeps user custom models intact", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(UPSTREAM_SHRUNK)));
    const { sync, db } = await boot();
    const conn = await seed(db, { discovered: ["keep-1", "gone-1"], manual: ["my-manual-model"] });

    const result = await sync.maybeSyncProviderModels("deepseek", conn);
    expect(result.added).toEqual(["brand-new"]);
    expect(result.disabled).toEqual(["gone-1"]);

    const { getDisabledModels } = await import("@/lib/db/index.js");
    const disabled = await getDisabledModels();
    expect(disabled.deepseek).toContain("gone-1");
    expect(disabled.deepseek || []).not.toContain("my-manual-model");
    expect(disabled.deepseek || []).not.toContain("keep-1");

    const customs = await db.getCustomModels();
    expect(customs.some((m) => m.id === "my-manual-model")).toBe(true);
  });

  it("never deletes a custom model and never disables models present upstream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(UPSTREAM)));
    const { sync, db } = await boot();
    const conn = await seed(db, { discovered: ["keep-1"], manual: ["user-custom"] });
    await sync.maybeSyncProviderModels("deepseek", conn);
    const customs = await db.getCustomModels();
    const ids = customs.map((m) => m.id);
    expect(ids).toContain("keep-1");
    expect(ids).toContain("user-custom");
    expect(ids).toContain("brand-new");
  });

  it("keeps lastSyncAt when the upstream fails (no hot-loop)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "boom" }, 500)));
    const { sync, db } = await boot();
    const { setSyncState } = await import("@/lib/db/repos/modelDiscoveryRepo.js");
    const conn = await seed(db, { discovered: [], manual: [] });
    const before = new Date(Date.now() - 13 * 3600e3).toISOString();
    await setSyncState("deepseek", before);

    const result = await sync.maybeSyncProviderModels("deepseek", conn);
    expect(result).toBeNull();
    const s = await import("@/lib/db/repos/modelDiscoveryRepo.js");
    expect((await s.getSyncState("deepseek")).lastSyncAt).toBe(before);
  });
});

describe("POST /api/providers/[id]/models/sync (manual run)", () => {
  it("runs the sync outside the window and returns the diff", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(UPSTREAM)));
    const { db, syncRoute } = await boot();
    const conn = await seed(db, { discovered: ["keep-1", "gone-1"], manual: [] });

    const res = await syncRoute.POST(new Request("http://x", { method: "POST" }), {
      params: Promise.resolve({ id: "deepseek" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.added).toEqual(["brand-new"]);
  });

  it("PATCH persists per-provider toggles in settings", async () => {
    const { syncRoute, db } = await boot();
    const res = await syncRoute.PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ autoSyncModels: true }), headers: { "Content-Type": "application/json" } }),
      { params: Promise.resolve({ id: "deepseek" }) }
    );
    expect(res.status).toBe(200);
    const settings = await db.getSettings();
    expect(settings.autoSyncModels.deepseek).toBe(true);
  });
});
