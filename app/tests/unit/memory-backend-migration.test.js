// Entrega 4 — migration 004 rewrites every non-Neo4j memoryBackend to 'neo4j'.
// The fixture is a legacy-shaped SQLite file (created before the CHECK only
// allowed NULL|'neo4j') with rows whose backend is 'hindsight' / NULL / 'neo4j'.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";

let tempDir;
let dbFile;
const originalDataDir = process.env.DATA_DIR;

// Old apiKeys shape: CHECK accepts 'hindsight', which a fresh DB no longer does.
function writeLegacyDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE apiKeys (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      name TEXT,
      machineId TEXT,
      comboId TEXT,
      soul TEXT DEFAULT '',
      hindsightBankId TEXT,
      memoryBackend TEXT CHECK (memoryBackend IS NULL OR memoryBackend IN ('hindsight', 'neo4j')),
      mentalModelId TEXT,
      memoryEnabled INTEGER DEFAULT 1,
      sources TEXT NOT NULL DEFAULT '{}',
      isService INTEGER DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT
    );
  `);
  db.exec(`INSERT INTO _meta(key, value) VALUES ('schemaVersion', '3')`);
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO apiKeys(id, key, name, machineId, soul, hindsightBankId, memoryBackend, mentalModelId, memoryEnabled, createdAt, updatedAt)
     VALUES(?, ?, ?, 'machine', '', ?, ?, ?, 1, ?, ?)`,
  );
  insert.run("legacy-hindsight", "sk-1", "Hindsight key", "ViniciusMathias", "hindsight", "mm-1", now, now);
  insert.run("legacy-null", "sk-2", "Null key", "eve", null, "mm-2", now, now);
  insert.run("already-neo4j", "sk-3", "Neo4j key", "ViniciusMathias", "neo4j", "mm-3", now, now);
  db.close();
}

async function bootDb() {
  const { getAdapter } = await import("@/lib/db/driver.js");
  return getAdapter();
}

function backends(db) {
  return Object.fromEntries(db.all(`SELECT id, memoryBackend, hindsightBankId FROM apiKeys`).map((r) => [r.id, r]));
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-membackend-"));
  process.env.DATA_DIR = tempDir;
  dbFile = path.join(tempDir, "db", "data.sqlite");
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  writeLegacyDb(dbFile);
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

describe("migration 004 — memory-backend-neo4j", () => {
  it("converts inherited backends to neo4j and preserves hindsightBankId", async () => {
    const db = await bootDb();
    const rows = backends(db);

    expect(rows["legacy-hindsight"].memoryBackend).toBe("neo4j");
    expect(rows["legacy-null"].memoryBackend).toBe("neo4j");
    expect(rows["already-neo4j"].memoryBackend).toBe("neo4j");

    // The bank id column keeps its historical name and its value.
    expect(rows["legacy-hindsight"].hindsightBankId).toBe("ViniciusMathias");
    expect(rows["legacy-null"].hindsightBankId).toBe("eve");

    expect(parseInt(db.get(`SELECT value FROM _meta WHERE key='schemaVersion'`).value, 10)).toBe(4);
  });

  it("is idempotent across restarts", async () => {
    const db = await bootDb();
    const before = backends(db);
    db.close?.();
    delete global._dbAdapter;
    vi.resetModules();

    const db2 = await bootDb();
    expect(backends(db2)).toEqual(before);
    expect(parseInt(db2.get(`SELECT value FROM _meta WHERE key='schemaVersion'`).value, 10)).toBe(4);
  });

  it("normalizes a memoryBackend: \"hindsight\" registration to neo4j without erroring", async () => {
    const { resolveMemoryProfile, normalizeMemoryBackend } = await import("@/lib/identityMemory/profileConfig.js");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(normalizeMemoryBackend("hindsight")).toBe("neo4j");
    const profile = resolveMemoryProfile({
      enabled: true,
      bankId: "ViniciusMathias",
      memoryBackend: "hindsight",
      name: "EVE",
    });
    expect(profile).toMatchObject({
      memoryEnabled: true,
      hindsightBankId: "ViniciusMathias",
      memoryBackend: "neo4j",
    });
    expect(warn).toHaveBeenCalled();

    // The repo write path stores NULL rather than an unsupported value.
    const db = await bootDb();
    const { getApiKeyById, updateApiKey } = await import("@/lib/db/repos/apiKeysRepo.js");
    const { createApiKey } = await import("@/lib/db/repos/apiKeysRepo.js");
    const created = await createApiKey("Legacy payload", "machine", {
      hindsightBankId: "ViniciusMathias", memoryBackend: "hindsight",
    });
    await updateApiKey(created.id, { memoryBackend: "hindsight" });
    const stored = db.get(`SELECT memoryBackend FROM apiKeys WHERE id = ?`, [created.id]);
    expect([null, "neo4j"]).toContain(stored.memoryBackend);
    expect((await getApiKeyById(created.id)).hindsightBankId).toBe("ViniciusMathias");
  });
});
