import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

function rowToCombo(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    models: parseJson(row.models, []),
    // Columns added by migration 005. Absent on a pre-migration row read from a
    // code path that bypassed the runner: fall back to the same defaults.
    type: row.type === "dynamic" ? "dynamic" : "static",
    config: parseJson(row.config, {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Validate 'config' at write time (dashboard/API), never at request time — a
// malformed config must not 500 a chat. Only the shape the router reads is
// enforced; unknown keys are kept as-is.
export function normalizeComboConfig(input) {
  if (input == null) return {};
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("config must be a JSON object");
  }
  const list = (v) => (Array.isArray(v) ? v.filter((m) => typeof m === "string" && m) : undefined);
  const out = { ...input };
  const map = input.routingMap;
  if (map !== undefined) {
    if (map === null || typeof map !== "object" || Array.isArray(map)) {
      throw new Error("config.routingMap must be a JSON object");
    }
    out.routingMap = { ...map };
  }
  const fb = list(input.fallbacks);
  if (fb) out.fallbacks = fb;
  if (input.defaultModel !== undefined && typeof input.defaultModel !== "string") {
    throw new Error("config.defaultModel must be a string");
  }
  return out;
}

function normalizeModelList(models) {
  if (models == null) return [];
  if (!Array.isArray(models)) throw new Error("models must be an array");
  return models.filter((m) => typeof m === "string" && m);
}

function normalizeType(type) {
  if (type == null) return "static";
  if (type !== "static" && type !== "dynamic") throw new Error("type must be 'static' or 'dynamic'");
  return type;
}

export async function getCombos() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM combos ORDER BY createdAt ASC`);
  return rows.map(rowToCombo);
}

export async function getComboById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM combos WHERE id = ?`, [id]);
  return rowToCombo(row);
}

export async function getComboByName(name) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM combos WHERE name = ?`, [name]);
  return rowToCombo(row);
}

export async function createCombo(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const combo = {
    id: uuidv4(),
    name: data.name,
    kind: data.kind || null,
    models: normalizeModelList(data.models),
    type: normalizeType(data.type),
    config: normalizeComboConfig(data.config),
    createdAt: now,
    updatedAt: now,
  };
  db.run(
    `INSERT INTO combos(id, name, kind, models, type, config, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
    [combo.id, combo.name, combo.kind, stringifyJson(combo.models), combo.type, stringifyJson(combo.config), combo.createdAt, combo.updatedAt]
  );
  return combo;
}

export async function updateCombo(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM combos WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToCombo(row), ...data, updatedAt: new Date().toISOString() };
    merged.models = normalizeModelList(merged.models);
    merged.type = normalizeType(merged.type);
    merged.config = normalizeComboConfig(merged.config);
    db.run(
      `UPDATE combos SET name = ?, kind = ?, models = ?, type = ?, config = ?, updatedAt = ? WHERE id = ?`,
      [merged.name, merged.kind, stringifyJson(merged.models), merged.type, stringifyJson(merged.config), merged.updatedAt, id]
    );
    result = merged;
  });
  return result;
}

export async function deleteCombo(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM combos WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}
