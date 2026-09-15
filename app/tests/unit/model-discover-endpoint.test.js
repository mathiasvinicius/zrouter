// Entrega 2 A — POST /api/providers/[id]/models/discover: mock upstream /v1/models,
// invalid key → 502, cache hit returns fromCache: true.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-discover-"));
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
  return import("./../../src/app/api/providers/[id]/models/discover/route.js");
}

function seedConnection({ apiKey = "sk-test-123" } = {}) {
  return import("@/lib/db/index.js").then(async (db) => {
    const conn = await db.createProviderConnection({
      provider: "deepseek",
      authType: "apikey",
      name: "Test conn",
      apiKey,
      isActive: true,
    });
    return conn;
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const params = (id) => Promise.resolve({ id });

describe("POST /api/providers/[id]/models/discover", () => {
  it("discovers models from upstream /v1/models and caches them", async () => {
    const fetchMock = vi.fn(async (url) => {
      expect(String(url)).toBe("https://api.deepseek.com/models");
      return jsonResponse({ data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const route = await boot();
    const conn = await seedConnection();
    const res = await route.POST(new Request("http://x", { method: "POST" }), { params: params(conn.id) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fromCache).toBe(false);
    expect(body.count).toBe(2);
    expect(body.models.map((m) => m.id)).toEqual(["deepseek-chat", "deepseek-reasoner"]);
    expect(body.discoveredAt).toBeTruthy();

    const second = await route.POST(new Request("http://x", { method: "POST" }), { params: params(conn.id) });
    const secondBody = await second.json();
    expect(secondBody.fromCache).toBe(true);
    expect(secondBody.models.length).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 502 with a clean message (no key) when the upstream rejects the credential", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "Invalid API key sk-test-123" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    const route = await boot();
    const conn = await seedConnection({ apiKey: "sk-SECRET-key" });
    const res = await route.POST(new Request("http://x", { method: "POST" }), { params: params(conn.id) });
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe("Upstream model discovery failed");
    expect(JSON.stringify(body)).not.toContain("sk-SECRET");
  });

  it("falls back to static catalog when upstream returns an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ data: [] })));
    const route = await boot();
    const conn = await seedConnection();
    const res = await route.POST(new Request("http://x", { method: "POST" }), { params: params(conn.id) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.models.length).toBeGreaterThan(0); // static deepseek catalog
  });

  it("404s for unknown connection ids", async () => {
    const route = await boot();
    const res = await route.POST(new Request("http://x", { method: "POST" }), { params: params("nope") });
    expect(res.status).toBe(404);
  });

  it("GET returns cache and supports ignoreCache + sync flag plumbing", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [{ id: "m1" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const route = await boot();
    const conn = await seedConnection();

    const first = await route.GET(new Request("http://x"), { params: params(conn.provider) });
    const firstBody = await first.json();
    expect(firstBody.fromCache).toBe(false);

    const cached = await route.GET(new Request("http://x"), { params: params(conn.provider) });
    expect((await cached.json()).fromCache).toBe(true);

    const fresh = await route.GET(new Request("http://x?ignoreCache=1"), { params: params(conn.provider) });
    expect((await fresh.json()).fromCache).toBe(false);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
