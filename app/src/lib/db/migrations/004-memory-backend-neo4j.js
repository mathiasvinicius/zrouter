// Entrega 4 — Neo4j is the only identity-memory backend; the Hindsight
// implementation was removed. Rewrite any inherited value (including NULL, which
// used to mean "inherit the global default") to 'neo4j'.
// The `hindsightBankId` column keeps its name: it stores the memory bank id and
// renaming it would be a destructive migration for a column the recall reads.
// Idempotent: the WHERE clause matches nothing once every row is 'neo4j'.
const migration = {
  version: 4,
  name: "memory-backend-neo4j",
  up(db) {
    db.run(
      `UPDATE apiKeys SET memoryBackend = 'neo4j' WHERE memoryBackend IS NULL OR memoryBackend NOT IN ('neo4j')`
    );
  },
};

export default migration;
