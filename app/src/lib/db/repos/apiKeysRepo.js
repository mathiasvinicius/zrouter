import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

function rowToKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    machineId: row.machineId,
    comboId: row.comboId || null,
    soul: row.soul || "",
    hindsightBankId: row.hindsightBankId || null,
    memoryBackend: row.memoryBackend || null,
    mentalModelId: row.mentalModelId || null,
    memoryEnabled: row.memoryEnabled === 1 || row.memoryEnabled === true,
    isService: row.isService === 1 || row.isService === true,
    isActive: row.isActive === 1 || row.isActive === true,
    sources: parseSources(row.sources),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt || row.createdAt,
  };
}

// sources column stores a JSON string ('{}' default). Keys get the parsed object.
function parseSources(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function serializeSources(sources) {
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) return "{}";
  return JSON.stringify(sources);
}

// Normalize incoming per-key source permissions (dashboard CRUD → DB shape).
// Always returns all three origins so the UI shape is deterministic.
export function normalizeKeySources(sources) {
  const clean = (value) => Array.isArray(value)
    ? [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))]
    : [];
  const entry = (raw, scopeKeys) => {
    const enabled = raw?.enabled === true;
    const result = { enabled };
    for (const scopeKey of scopeKeys) {
      if (enabled) result[scopeKey] = clean(raw?.[scopeKey]);
    }
    return result;
  };
  const input = sources && typeof sources === "object" && !Array.isArray(sources) ? sources : {};
  return {
    notion: entry(input.notion, ["pages", "databases"]),
    "open-notebook": entry(input["open-notebook"], ["notebooks"]),
    neo4j: entry(input.neo4j, ["banks"]),
  };
}

export async function getApiKeys() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys ORDER BY createdAt ASC`);
  return rows.map(rowToKey);
}

export async function getApiKeyById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  return rowToKey(row);
}

export async function createApiKey(name, machineId, profile = {}) {
  if (!machineId) throw new Error("machineId is required");
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    machineId,
    comboId: profile.comboId || null,
    soul: profile.soul || "",
    hindsightBankId: profile.hindsightBankId || null,
    memoryBackend: profile.memoryBackend || null,
    mentalModelId: profile.mentalModelId || null,
    memoryEnabled: profile.memoryEnabled !== false,
    isService: profile.isService === true,
    sources: parseSources(serializeSources(profile.sources)),
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, comboId, soul, hindsightBankId, memoryBackend, mentalModelId, memoryEnabled, sources, isService, isActive, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [apiKey.id, apiKey.key, apiKey.name, apiKey.machineId, apiKey.comboId, apiKey.soul,
      apiKey.hindsightBankId, apiKey.memoryBackend, apiKey.mentalModelId, apiKey.memoryEnabled ? 1 : 0, serializeSources(apiKey.sources),
      apiKey.isService ? 1 : 0, 1, apiKey.createdAt, apiKey.updatedAt]
  );
  return apiKey;
}

export async function updateApiKey(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToKey(row), ...data };
    merged.updatedAt = new Date().toISOString();
    db.run(
      `UPDATE apiKeys SET key = ?, name = ?, machineId = ?, comboId = ?, soul = ?,
       hindsightBankId = ?, memoryBackend = ?, mentalModelId = ?, memoryEnabled = ?, sources = ?, isService = ?, isActive = ?, updatedAt = ? WHERE id = ?`,
      [merged.key, merged.name, merged.machineId, merged.comboId || null, merged.soul || "",
        merged.hindsightBankId || null, merged.memoryBackend || null, merged.mentalModelId || null, merged.memoryEnabled ? 1 : 0, serializeSources(merged.sources),
        merged.isService ? 1 : 0, merged.isActive ? 1 : 0, merged.updatedAt, id]
    );
    result = merged;
  });
  return result;
}

export async function deleteApiKey(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM apiKeys WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}

export async function validateApiKey(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT isActive FROM apiKeys WHERE key = ?`, [key]);
  if (!row) return false;
  return row.isActive === 1 || row.isActive === true;
}

export async function getApiKeyByValue(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE key = ? AND isActive = 1`, [key]);
  return rowToKey(row);
}
