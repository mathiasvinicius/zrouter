// Neo4j backend — reuses the identity-memory Neo4j store (IDENTITY_MEMORY_BACKEND=neo4j),
// restricted to the key's authorized banks. Read-only. Same HTTP transaction endpoint
// as src/lib/identityMemory/neo4j.js but kept self-contained so open-sse/sources stays
// importable without the Next.js app tree.

const DEFAULT_HTTP_URL = "http://127.0.0.1:7474";
const BANK_ID_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const QUERY_TIMEOUT_MS = 5000;

function databaseUrl() {
  const root = String(process.env.NEO4J_HTTP_URL || DEFAULT_HTTP_URL).replace(/\/+$/, "");
  const database = encodeURIComponent(process.env.NEO4J_DATABASE || "neo4j");
  return `${root}/db/${database}/tx/commit`;
}

function authorizationHeader() {
  const combined = process.env.NEO4J_AUTH || "";
  const separator = combined.indexOf("/");
  const user = process.env.NEO4J_USER || (separator > 0 ? combined.slice(0, separator) : "");
  const password = process.env.NEO4J_PASSWORD || (separator > 0 ? combined.slice(separator + 1) : "");
  if (!user || !password) throw new Error("Neo4j credentials are not configured");
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

export function isNeo4jConfigured() {
  try {
    authorizationHeader();
    return true;
  } catch {
    return false;
  }
}

function validBanks(entry) {
  return (entry.banks || [])
    .map((bank) => String(bank || "").trim())
    .filter((bank) => BANK_ID_PATTERN.test(bank));
}

async function runQuery(statementText, parameters) {
  const response = await fetch(databaseUrl(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: authorizationHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      statements: [{ statement: statementText, parameters, resultDataContents: ["row"] }],
    }),
    signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Neo4j HTTP request failed (${response.status})`);
  const payload = await response.json();
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error(`Neo4j query failed: ${payload.errors[0]?.code || "unknown error"}`);
  }
  const data = payload?.results?.[0]?.data || [];
  return data.map((row) => row?.row || []);
}

function termsForQuery(query) {
  const matches = String(query).match(/[\p{L}\p{N}_.-]+/gu) || [];
  return [...new Set(matches.map((t) => t.toLocaleLowerCase()))].slice(0, 16);
}

export async function searchNeo4j(query, entry, limit = 10) {
  if (!isNeo4jConfigured()) return [];
  const banks = validBanks(entry);
  if (banks.length === 0) return [];
  const terms = termsForQuery(query);
  if (terms.length === 0) return [];
  const rows = await runQuery(`
    UNWIND $banks AS bank
    MATCH (m:Memory {bank: bank})
    WITH m, bank,
      reduce(score = 0.0, term IN $terms |
        score + CASE WHEN toLower(coalesce(m.text, '')) CONTAINS term THEN 1.0 ELSE 0.0 END
             + CASE WHEN toLower(coalesce(m.context, '')) CONTAINS term THEN 0.5 ELSE 0.0 END) AS score
    WHERE score > 0
    RETURN m.id AS id, m.text AS text, bank, coalesce(toString(m.date), toString(m.occurred_start), '') AS updated, score
    ORDER BY score DESC, updated DESC
    LIMIT $limit`, { banks, terms, limit: Math.min(100, limit) });
  return rows.map(([id, text, bank, updated, score]) => ({
    sourceId: `neo4j:${id}`,
    title: String(text || "").slice(0, 120),
    url: "",
    excerpt: String(text || "").slice(0, 2000),
    updatedAt: updated || null,
    bank,
    score,
  }));
}

export async function getNeo4jSource(sourceId, entry) {
  if (!isNeo4jConfigured()) return null;
  const banks = validBanks(entry);
  if (banks.length === 0 || !BANK_ID_PATTERN.test(sourceId)) return null;
  const rows = await runQuery(
    `MATCH (m:Memory) WHERE m.id = $id AND m.bank IN $banks RETURN m.text AS text, m.bank AS bank, coalesce(toString(m.date), toString(m.occurred_start), '') AS updated LIMIT 1`,
    { id: sourceId, banks },
  );
  const row = rows[0];
  if (!row) return null;
  return {
    sourceId: `neo4j:${sourceId}`,
    title: String(row[1] || "").slice(0, 120),
    content: String(row[0] || ""),
    url: "",
    bank: row[2] || "",
    origin: "neo4j",
  };
}
