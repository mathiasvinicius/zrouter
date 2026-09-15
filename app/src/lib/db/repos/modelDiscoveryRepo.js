// Model-discovery cache + per-provider auto-sync state, stored as kv rows.
// scope "modelDiscovery": key = provider alias or compatible node id,
// value = { models: [{id, name}], discoveredAt: ISO }.
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

const SCOPE = "modelDiscovery";

function key(providerAlias) {
  return `provider:${providerAlias}`;
}

export async function getDiscoveryCache(providerAlias) {
  const db = await getAdapter();
  const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, key(providerAlias)]);
  return row ? parseJson(row.value, null) : null;
}

export async function setDiscoveryCache(providerAlias, models) {
  const db = await getAdapter();
  db.run(
    `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
    [SCOPE, key(providerAlias), stringifyJson({ models, discoveredAt: new Date().toISOString() })]
  );
}

export async function getSyncState(providerAlias) {
  const db = await getAdapter();
  const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, `sync:${providerAlias}`]);
  return row ? parseJson(row.value, { lastSyncAt: null }) : { lastSyncAt: null };
}

export async function setSyncState(providerAlias, lastSyncAt) {
  const db = await getAdapter();
  db.run(
    `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
    [SCOPE, `sync:${providerAlias}`, stringifyJson({ lastSyncAt })]
  );
}
