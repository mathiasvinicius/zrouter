// Migration apiKeys.sources — idempotency + legacy key preservation.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-sources-"));
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
});

async function bootDb() {
  const { getAdapter } = await import("@/lib/db/driver.js");
  return getAdapter();
}

describe("apiKeys.sources migration", () => {
  it("adds the sources column with default '{}' and runs idempotently (2×)", async () => {
    const db = await bootDb();
    const columns = db.all(`PRAGMA table_info(apiKeys)`).map((row) => row.name);
    expect(columns).toContain("sources");

    db.run(
      `INSERT INTO apiKeys(id, key, name, machineId, comboId, soul, createdAt, updatedAt)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
      ["legacy-1", "sk-legacy", "Legacy", "machine", null, "", new Date().toISOString(), new Date().toISOString()],
    );

    // Simulate a restart: re-run the full migration chain on the same file.
    db.close?.();
    delete global._dbAdapter;
    vi.resetModules();
    const db2 = await bootDb();

    // Migration #2 must be a no-op on the second run.
    const row = db2.get(`SELECT sources FROM apiKeys WHERE id = 'legacy-1'`);
    expect(row.sources).toBe("{}");
    const meta = db2.get(`SELECT value FROM _meta WHERE key='schemaVersion'`);
    // Entrega 2 appended migration #3 (custom-model-source); the contract is a
    // monotonic chain that includes #2, not a pinned version.
    expect(parseInt(meta.value, 10)).toBeGreaterThanOrEqual(2);

    // Third boot — still stable, no duplicate column errors.
    db2.close?.();
    delete global._dbAdapter;
    vi.resetModules();
    const db3 = await bootDb();
    expect(db3.get(`SELECT sources FROM apiKeys WHERE id = 'legacy-1'`).sources).toBe("{}");
  });

  it("preserves legacy keys and stores a real sources JSON round-trip via the repo", async () => {
    const db = await bootDb();
    db.run(
      `INSERT INTO apiKeys(id, key, name, machineId, comboId, soul, createdAt, updatedAt)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
      ["legacy-2", "sk-legacy-2", "Legacy 2", "machine", null, "soul text", new Date().toISOString(), new Date().toISOString()],
    );

    const { createApiKey, getApiKeyById, updateApiKey } = await import("@/lib/db/repos/apiKeysRepo.js");
    const created = await createApiKey("With sources", "machine", {
      sources: { "open-notebook": { enabled: true, notebooks: ["notebook:x"] } },
    });
    expect(created.sources).toMatchObject({ "open-notebook": { enabled: true, notebooks: ["notebook:x"] } });

    const fetched = await getApiKeyById(created.id);
    expect(fetched.sources["open-notebook"].enabled).toBe(true);

    await updateApiKey(created.id, { sources: { neo4j: { enabled: true, banks: ["eve"] } } });
    const updated = await getApiKeyById(created.id);
    expect(updated.sources.neo4j.banks).toEqual(["eve"]);

    // Legacy key untouched: works with sources='{}' (no source enabled).
    const legacy = await getApiKeyById("legacy-2");
    expect(legacy.sources).toEqual({});
    expect(legacy.soul).toBe("soul text");
  });

  it("normalizeKeySources keeps only valid scope shapes", async () => {
    const { normalizeKeySources } = await import("@/lib/db/repos/apiKeysRepo.js");
    expect(normalizeKeySources(undefined)).toEqual({
      notion: { enabled: false },
      "open-notebook": { enabled: false },
      neo4j: { enabled: false },
    });
    expect(normalizeKeySources({
      "open-notebook": { enabled: true, notebooks: [" a ", "", "a"] },
      neo4j: { enabled: false, banks: ["should-not-appear"] },
    })).toEqual({
      notion: { enabled: false },
      "open-notebook": { enabled: true, notebooks: ["a"] },
      neo4j: { enabled: false },
    });
  });
});
