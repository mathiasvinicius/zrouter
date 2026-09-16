// Entrega 7: per-API-key usage aggregation.
// Exercises the real SQLite layer (temp DATA_DIR) so the assertions cover the
// actual query paths, not just the source shape.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const KEY_EVE = "sk-eve-0000000000000000000000000000000000000000000000000000000000001111";
const KEY_OCR = "sk-ocr-2222222222222222222222222222222222222222222222222222222222222222";
const KEY_GONE = "sk-deleted-33333333333333333333333333333333333333333333333333333333333333";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-usage-by-key-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
  await db.initDb?.();

  const adapter = await (await import("@/lib/db/driver.js")).getAdapter();
  const now = new Date().toISOString();
  const insertKey = (id, name, key, bank) => adapter.run(
    `INSERT INTO apiKeys(id, key, name, machineId, comboId, soul, hindsightBankId, memoryBackend, mentalModelId, memoryEnabled, sources, isService, isActive, createdAt, updatedAt)
     VALUES(?, ?, ?, 'm1', NULL, '', ?, NULL, NULL, 1, '{}', 0, 1, ?, ?)`,
    [id, key, name, bank || null, now, now]
  );
  insertKey("id-eve", "eve", KEY_EVE, "eve");
  insertKey("id-ocr", "OCR", KEY_OCR, null);

  const usage = (apiKey, model, provider, prompt, completion) => db.saveRequestUsage({
    provider, model, apiKey, connectionId: "c-1", endpoint: "/v1/chat/completions",
    status: "ok", tokens: { prompt_tokens: prompt, completion_tokens: completion },
  });

  // eve: 2 requests on ollama, 1 on antigravity — one of them inside the last 10 minutes
  await usage(KEY_EVE, "deepseek-v4.1-flash", "ollama", 100_000, 1_000);
  await usage(KEY_EVE, "deepseek-v4.1-flash", "ollama", 200_000, 2_000);
  await usage(KEY_EVE, "gemini-x", "antigravity", 300_000, 3_000);
  // OCR: 1 request
  await usage(KEY_OCR, "gemma4:cloud", "ollama", 400_000, 4_000);
  // deleted key: 2 requests, still in history
  await usage(KEY_GONE, "deepseek-v4.1-flash", "ollama", 500_000, 5_000);
  await usage(KEY_GONE, "deepseek-v4.1-flash", "ollama", 600_000, 6_000);
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

const sumSummary = (stats, field) =>
  Object.values(stats.byApiKeySummary).reduce((sum, s) => sum + (s[field] || 0), 0);

describe("byApiKey aggregation", () => {
  it("groups by key at the row level and sums correctly into the summary", async () => {
    const stats = await db.getUsageStats("24h");
    const rows = Object.values(stats.byApiKey);

    // Rows stay grouped by (masked|model|provider): eve spans 2 combos, OCR 1, deleted 1.
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.apiKeyMasked !== undefined)).toBe(true);

    const byName = {};
    for (const r of rows) byName[r.keyName] = (byName[r.keyName] || 0) + r.requests;
    expect(byName.eve).toBe(3);
    expect(byName.OCR).toBe(1);

    // Summary: one row per key, tokens/cost summed across models+providers.
    const summary = stats.byApiKeySummary;
    expect(Object.keys(summary)).toHaveLength(3);
    expect(Object.keys(summary)).toEqual(expect.arrayContaining(["eve", "OCR"]));
    expect(summary.eve.name).toBe("eve");

    expect(summary.eve.requests).toBe(3);
    expect(summary.eve.promptTokens).toBe(600_000);
    expect(summary.eve.completionTokens).toBe(6_000);
    expect(summary.eve.keyId).toBe("id-eve");
    expect(summary.eve.memoryBankId).toBe("eve");
    expect(summary.eve.unknown).toBe(false);

    expect(summary.OCR.requests).toBe(1);
    expect(summary.OCR.promptTokens).toBe(400_000);
    expect(summary.OCR.lastUsed).toBeTruthy();
    expect(summary.OCR.firstUsed).toBeTruthy();

    const deleted = Object.entries(summary).find(([k]) => k.startsWith("desconhecida-"));
    expect(deleted).toBeTruthy();
    expect(deleted[1].requests).toBe(2);
    expect(deleted[1].unknown).toBe(true);

    // Summary totals reconcile with the per-provider totals.
    expect(sumSummary(stats, "requests")).toBe(stats.totalRequests);
    expect(sumSummary(stats, "promptTokens")).toBe(stats.totalPromptTokens);
    expect(sumSummary(stats, "completionTokens")).toBe(stats.totalCompletionTokens);
  });

  it("never returns the full key in the payload", async () => {
    const stats = await db.getUsageStats("24h");
    const payload = JSON.stringify(stats);
    for (const key of [KEY_EVE, KEY_OCR, KEY_GONE]) {
      expect(payload).not.toContain(key);
    }
    // No long sk- token survives anywhere in the response.
    expect(payload).not.toMatch(/sk-[A-Za-z0-9._-]{20,}/);
    // Masked prefixes are the only key-derived value allowed through. The mask is
    // key.slice(0,8) + "***" — the "***" stops it from reading as a full secret.
    // A mask is key.slice(0, 8) + "***". Every real ZRouter key starts with the
    // same 12+ machine prefix, so 8 chars identify a machine, not a key.
    for (const row of Object.values(stats.byApiKey)) {
      if (row.apiKeyMasked) expect(row.apiKeyMasked).toMatch(/^sk-[A-Za-z0-9._-]{1,5}\*\*\*$/);
    }
    for (const key of [KEY_EVE, KEY_OCR, KEY_GONE]) {
      expect(key.length).toBeGreaterThan(40);
      expect(payload).not.toContain(key.slice(0, 12));
    }
    // The summary rows are the payload the new UI reads — name/keyId only.
    expect(JSON.stringify(stats.byApiKeySummary)).not.toMatch(/sk-/);
  });

  it("labels a deleted key as desconhecida-<hash> and keeps it out of keyId", async () => {
    const stats = await db.getUsageStats("24h");
    const [label, s] = Object.entries(stats.byApiKeySummary).find(([k]) => k.startsWith("desconhecida-"));
    expect(label).toMatch(/^desconhecida-[0-9a-f]{8}$/);
    expect(s.keyId).toBeNull();
    expect(s.unknown).toBe(true);
    expect(s.name).toBe(label);
    // Two different deleted keys would get two different labels; this one is stable.
    const again = await db.getUsageStats("24h");
    expect(Object.keys(again.byApiKeySummary)).toContain(label);
  });

  it("filters every total down to one key", async () => {
    const all = await db.getUsageStats("24h");
    const filtered = await db.getUsageStats("24h", { apiKey: "eve" });

    expect(filtered.totalRequests).toBe(3);
    expect(filtered.totalRequests).toBeLessThan(all.totalRequests);
    expect(filtered.totalPromptTokens).toBe(600_000);
    expect(filtered.totalCompletionTokens).toBe(6_000);
    expect(Object.keys(filtered.byProvider).sort()).toEqual(["antigravity", "ollama"]);
    expect(Object.values(filtered.byProvider).reduce((s, p) => s + p.requests, 0)).toBe(3);
    expect(Object.keys(filtered.byApiKeySummary)).toEqual(["eve"]);
    expect(filtered.byApiKeySummary.eve.name).toBe("eve");
    expect(filtered.apiKeyFilter).toBe("eve");

    // Filtering by id resolves to the same key.
    const byId = await db.getUsageStats("24h", { apiKey: "id-eve" });
    expect(byId.totalRequests).toBe(3);

    // Filtering by the unknown-key label works too.
    const deleted = Object.keys(all.byApiKeySummary).find((k) => k.startsWith("desconhecida-"));
    const byDeleted = await db.getUsageStats("24h", { apiKey: deleted });
    expect(byDeleted.totalRequests).toBe(2);

    // An unmatched filter returns an empty-but-shaped payload, never the full set.
    const none = await db.getUsageStats("24h", { apiKey: "no-such-key" });
    expect(none.totalRequests).toBe(0);
    expect(none.byApiKeySummary).toEqual({});
    expect(none.byProvider).toEqual({});
    expect(none.apiKeyFilterUnmatched).toBe(true);
  });

  it("filters long periods too (daily rollup is re-keyed on the mask)", async () => {
    const stats = await db.getUsageStats("7d", { apiKey: "eve" });
    expect(stats.totalRequests).toBe(3);
    expect(Object.keys(stats.byApiKeySummary)).toEqual(["eve"]);
    const unfiltered = await db.getUsageStats("7d");
    expect(JSON.stringify(unfiltered)).not.toMatch(/sk-[A-Za-z0-9._-]{20,}/);
  });

  it("includes a key that has usage and omits one that has none", async () => {
    // Decision: keys with no usage do NOT appear. The table is a usage history,
    // not an inventory of configured keys; the endpoint page lists idle keys.
    const adapter = await (await import("@/lib/db/driver.js")).getAdapter();
    const now = new Date().toISOString();
    adapter.run(
      `INSERT INTO apiKeys(id, key, name, machineId, comboId, soul, hindsightBankId, memoryBackend, mentalModelId, memoryEnabled, sources, isService, isActive, createdAt, updatedAt)
       VALUES('id-idle', 'sk-idle-4444444444444444444444444444444444444444444444444444444444444444', 'idle-key', 'm1', NULL, '', NULL, NULL, NULL, 1, '{}', 0, 1, ?, ?)`,
      [now, now]
    );
    const stats = await db.getUsageStats("24h");
    expect(Object.keys(stats.byApiKeySummary)).not.toContain("idle-key");
  });

  it("getChartData filters by key and can emit one series per key", async () => {
    const filtered = await db.getChartData("24h", { apiKey: "OCR" });
    expect(Array.isArray(filtered)).toBe(true);
    expect(filtered.reduce((s, b) => s + b.tokens, 0)).toBe(404_000);

    const grouped = await db.getChartData("24h", { groupBy: "apiKey" });
    expect(Array.isArray(grouped.rows)).toBe(true);
    expect(grouped.groups.map((g) => g.name)).toEqual(expect.arrayContaining(["eve", "OCR"]));
    const eve = grouped.groups.find((g) => g.name === "eve");
    const total = grouped.rows.reduce((s, r) => s + r[`${eve.key}::tokens`], 0);
    expect(total).toBe(606_000);

    // A per-key series must not leak the raw key either.
    const deleted = grouped.groups.find((g) => g.unknown);
    expect(deleted.name).toMatch(/^desconhecida-[0-9a-f]{8}$/);
    expect(JSON.stringify(grouped)).not.toMatch(/sk-[A-Za-z0-9._-]{20,}/);
  });

  it("getUsageHistory masks the key and honours the apiKey filter", async () => {
    const hist = await db.getUsageHistory({ apiKey: "eve" });
    expect(hist).toHaveLength(3);
    expect(hist.every((h) => h.apiKeyMasked)).toBe(true);
    expect(JSON.stringify(hist)).not.toMatch(/sk-[A-Za-z0-9._-]{20,}/);
  });
});
