// Fase 2 — combos gain a `type` ('static' | 'dynamic') and a `config` JSON
// blob (routingMap / fallbacks / defaultModel for dynamic combos).
// Existing rows stay 'static' with an empty config: zero behaviour change.
// Idempotent: PRAGMA table_info is checked before every ALTER (SQLite errors
// on a duplicate ADD COLUMN), and re-running never rewrites existing values.
const migration = {
  version: 5,
  name: "dynamic-combos",
  up(db) {
    const columns = db.all(`PRAGMA table_info(combos)`).map((row) => row.name);
    if (!columns.includes("type")) {
      db.exec(`ALTER TABLE combos ADD COLUMN type TEXT NOT NULL DEFAULT 'static'`);
    }
    if (!columns.includes("config")) {
      db.exec(`ALTER TABLE combos ADD COLUMN config TEXT NOT NULL DEFAULT '{}'`);
    }
    // Belt-and-braces for rows touched by external tooling (ADD COLUMN DEFAULT
    // already covers them, but the repo parses these columns unconditionally).
    db.run(`UPDATE combos SET type = 'static' WHERE type IS NULL OR type NOT IN ('static', 'dynamic')`);
    db.run(`UPDATE combos SET config = '{}' WHERE config IS NULL OR config = ''`);
  },
};

export default migration;
