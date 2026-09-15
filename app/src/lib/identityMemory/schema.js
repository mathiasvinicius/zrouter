import { statement, execute, rows } from "./neo4j.js";

// Cypher the recall/MERGE paths depend on. Both constraints are the anchors the
// engine MERGEs on (Memory.id from retain, Entity.name from enrichment); the
// indexes are what keeps recall off a full scan.
//
// Order: constraints (which create their own backing indexes) before the plain
// indexes. Probed against neo4j:5.26-community — order is not load-bearing with
// IF NOT EXISTS, a re-run after a partial failure converges either way.
export const SCHEMA_STATEMENTS = [
  "CREATE CONSTRAINT mem_id IF NOT EXISTS FOR (m:Memory) REQUIRE m.id IS UNIQUE",
  "CREATE CONSTRAINT ent_name IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE",
  "CREATE INDEX mem_bank IF NOT EXISTS FOR (m:Memory) ON (m.bank)",
  "CREATE INDEX ent_bank IF NOT EXISTS FOR (e:Entity) ON (e.bank)",
  "CREATE INDEX mem_fact_type IF NOT EXISTS FOR (m:Memory) ON (m.fact_type)",
  "CREATE INDEX mm_bank IF NOT EXISTS FOR (mm:MentalModel) ON (mm.bank)",
  "CREATE INDEX bank_id IF NOT EXISTS FOR (b:Bank) ON (b.id)",
];

// Expected object names, split by kind — the health endpoint diffs live state
// against this list instead of against whatever happens to be in the store.
export const EXPECTED_CONSTRAINTS = ["mem_id", "ent_name"];
export const EXPECTED_INDEXES = ["mem_bank", "ent_bank", "mem_fact_type", "mm_bank", "bank_id"];

let attempted = null;

/**
 * Create any missing index/constraint. Idempotent (IF NOT EXISTS), never
 * destructive (no DROP/DELETE/SET) and fail-open: an unreachable or older Neo4j
 * must not take the gateway down — recall is already fail-open.
 */
export async function ensureNeo4jSchema({ force = false } = {}) {
  if (attempted && !force) return attempted;
  attempted = run();
  return attempted;
}

async function run() {
  const created = [];
  const failed = [];
  for (const cyper of SCHEMA_STATEMENTS) {
    try {
      await execute([statement(cyper)], 8000);
      created.push(nameOf(cyper));
    } catch (error) {
      failed.push({ statement: cyper, error: error.message });
      console.warn(`[IdentityMemory][schema] ${nameOf(cyper)} not applied: ${error.message}`);
    }
  }
  if (failed.length === 0) console.log(`[IdentityMemory][schema] ensured ${created.length} indexes/constraints`);
  return { created, failed };
}

function nameOf(cyper) {
  return cyper.split(" ")[2] || cyper;
}

/**
 * Live schema state, for the health endpoint. Read-only: SHOW only.
 * Returns null when Neo4j is unreachable, so callers can distinguish
 * "connected but empty" from "not connected".
 */
export async function inspectNeo4jSchema() {
  try {
    const results = await execute([
      statement("SHOW INDEXES YIELD name, type, state, labelsOrTypes, properties"),
      statement("SHOW CONSTRAINTS YIELD name, type, labelsOrTypes, properties"),
    ], 5000);
    const indexes = toObjects(results[0]);
    const constraints = toObjects(results[1]);
    const present = new Set([...indexes, ...constraints].map((entry) => entry.name));
    return {
      indexes,
      constraints,
      missing: [...EXPECTED_CONSTRAINTS, ...EXPECTED_INDEXES].filter((name) => !present.has(name)),
    };
  } catch (error) {
    console.warn(`[IdentityMemory][schema] inspection failed: ${error.message}`);
    return null;
  }
}

function toObjects(result) {
  const columns = Array.isArray(result?.columns) ? result.columns : [];
  return rows(result).map((row) => Object.fromEntries(columns.map((column, i) => [column, row[i]])));
}

// Test seam: the once-per-process guard is module state, so tests need to reset it.
export function resetSchemaGuard() {
  attempted = null;
}
