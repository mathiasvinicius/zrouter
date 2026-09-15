// Add apiKeys.sources (TEXT, JSON) — per-key knowledge-source permissions.
// Default '{}' keeps legacy keys working with no source enabled.
// Idempotent: re-running never drops or overwrites existing values.
const migration = {
  version: 2,
  name: "api-key-sources",
  up(db) {
    const columns = db.all(`PRAGMA table_info(apiKeys)`).map((row) => row.name);
    if (!columns.includes("sources")) {
      db.exec(`ALTER TABLE apiKeys ADD COLUMN sources TEXT NOT NULL DEFAULT '{}'`);
    }
    // Normalize NULLs from any pre-existing rows (ADD COLUMN DEFAULT keeps them covered,
    // this is belt-and-braces for DBs touched by external tooling).
    db.run(`UPDATE apiKeys SET sources = '{}' WHERE sources IS NULL`);
  },
};

export default migration;
