import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.NEO4J_HTTP_URL = "http://127.0.0.1:17474";
process.env.NEO4J_USER = "neo4j";
process.env.NEO4J_PASSWORD = "testpass123";
delete process.env.NEO4J_AUTH;

const mocks = vi.hoisted(() => ({ json: vi.fn((body, init) => ({ status: init?.status || 200, body })) }));
vi.mock("next/server", () => ({ NextResponse: { json: mocks.json } }));

const schema = await import("../../src/lib/identityMemory/schema.js");
const { GET } = await import("../../src/app/api/health/neo4j/route.js");

const originalFetch = global.fetch;
let calls;

function ok(body) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  calls = [];
  schema.resetSchemaGuard();
  global.fetch = vi.fn(async (url, init) => {
    const statements = JSON.parse(init.body).statements;
    calls.push({ url, statements });
    const first = statements[0].statement;
    if (first.startsWith("SHOW INDEXES")) {
      return ok({ results: [
        { columns: ["name", "type", "state", "labelsOrTypes", "properties"], data: [{ row: ["mem_bank", "RANGE", "ONLINE", ["Memory"], ["bank"]] }] },
        { columns: ["name", "type", "labelsOrTypes", "properties"], data: [{ row: ["mem_id", "UNIQUENESS", ["Memory"], ["id"]] }] },
      ] });
    }
    return ok({ results: [{ columns: [], data: [] }] });
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

describe("ensureNeo4jSchema", () => {
  it("emits the seven bootstrap declarations, all with IF NOT EXISTS", async () => {
    const result = await schema.ensureNeo4jSchema();
    const issued = calls.flatMap((call) => call.statements.map((s) => s.statement));

    expect(issued).toHaveLength(7);
    for (const statement of issued) expect(statement).toMatch(/ IF NOT EXISTS /);
    expect(result.failed).toEqual([]);
    expect(result.created).toEqual(["mem_id", "ent_name", "mem_bank", "ent_bank", "mem_fact_type", "mm_bank", "bank_id"]);

    expect(issued).toContain("CREATE CONSTRAINT mem_id IF NOT EXISTS FOR (m:Memory) REQUIRE m.id IS UNIQUE");
    expect(issued).toContain("CREATE CONSTRAINT ent_name IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE");
    expect(issued).toContain("CREATE INDEX mem_bank IF NOT EXISTS FOR (m:Memory) ON (m.bank)");
    expect(issued).toContain("CREATE INDEX ent_bank IF NOT EXISTS FOR (e:Entity) ON (e.bank)");
    expect(issued).toContain("CREATE INDEX mem_fact_type IF NOT EXISTS FOR (m:Memory) ON (m.fact_type)");
    expect(issued).toContain("CREATE INDEX mm_bank IF NOT EXISTS FOR (mm:MentalModel) ON (mm.bank)");
    expect(issued).toContain("CREATE INDEX bank_id IF NOT EXISTS FOR (b:Bank) ON (b.id)");
  });

  it("never issues a destructive statement", async () => {
    await schema.ensureNeo4jSchema();
    for (const statement of schema.SCHEMA_STATEMENTS) {
      expect(statement).not.toMatch(/\bDROP\b/i);
      expect(statement).not.toMatch(/\bDELETE\b/i);
      expect(statement).not.toMatch(/\bMATCH\b[\s\S]*\bSET\b/i);
      expect(statement.trim().split(" ")[0]).toBe("CREATE");
    }
  });

  it("survives Neo4j being unreachable and keeps the gateway booting", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = vi.fn(async () => { throw new Error("fetch failed"); });

    const result = await schema.ensureNeo4jSchema();
    expect(result.created).toEqual([]);
    expect(result.failed).toHaveLength(7);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("continues past a single failing statement", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = vi.fn(async (url, init) => {
      const statement = JSON.parse(init.body).statements[0].statement;
      if (statement.includes("mem_bank")) return { ok: false, status: 400, json: async () => ({}) };
      return ok({ results: [{ columns: [], data: [] }] });
    });

    const result = await schema.ensureNeo4jSchema();
    expect(result.failed.map((f) => f.statement)).toEqual(["CREATE INDEX mem_bank IF NOT EXISTS FOR (m:Memory) ON (m.bank)"]);
    expect(result.created).toHaveLength(6);
    warn.mockRestore();
  });

  it("runs once per process, second call is a no-op", async () => {
    const first = await schema.ensureNeo4jSchema();
    const fetchesAfterFirst = calls.length;
    const second = await schema.ensureNeo4jSchema();

    expect(calls.length).toBe(fetchesAfterFirst);
    expect(second).toBe(first);
  });
});

describe("GET /api/health/neo4j", () => {
  it("reports connected state without echoing credentials", async () => {
    const indexes = await schema.inspectNeo4jSchema();
    expect(indexes.missing).toEqual(["ent_name", "ent_bank", "mem_fact_type", "mm_bank", "bank_id"]);

    const response = await GET();
    expect(response.body.connected).toBe(true);
    expect(response.body.indexes[0].name).toBe("mem_bank");
    expect(response.body.constraints[0].name).toBe("mem_id");

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("testpass123");
    expect(serialized).not.toContain("127.0.0.1:17474");
  });

  it("reports disconnected instead of throwing", async () => {
    global.fetch = vi.fn(async () => { throw new Error("fetch failed"); });
    const response = await GET();
    expect(response.body).toEqual({ connected: false, indexes: [], constraints: [], missing: [] });
  });
});
