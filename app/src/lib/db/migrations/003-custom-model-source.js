// Entrega 2 — customModels gain a provenance flag (source: "discovered").
// Stored inside the kv JSON; migration backfills nothing (legacy = manual
// user models, exactly the "source" the sync must never disable).
// Idempotent: re-running never overwrites an existing source value.
const migration = {
  version: 3,
  name: "custom-model-source",
  up(db) {
    const rows = db.all(`SELECT key, value FROM kv WHERE scope = 'customModels'`);
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
        if (parsed.source !== undefined) continue;
        db.run(
          `UPDATE kv SET value = ? WHERE scope = 'customModels' AND key = ?`,
          [JSON.stringify({ ...parsed, source: "manual" }), row.key]
        );
      } catch {
        // malformed row — leave untouched
      }
    }
  },
};

export default migration;
