// Entrega 4 — ensureBank/ensureMentalModel must actually MERGE nodes in Neo4j.
// The statements are asserted directly (no real server), and every failure path
// must stay fail-open: a broken bank registration cannot block creating a key.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureBank, ensureMentalModel } from "../../src/lib/identityMemory/neo4j.js";

const originalFetch = globalThis.fetch;
const originalUser = process.env.NEO4J_USER;
const originalPassword = process.env.NEO4J_PASSWORD;

function statementsFrom(call) {
  return JSON.parse(call[1].body).statements;
}

function okResponse(rows = []) {
  return { ok: true, status: 200, json: async () => ({ errors: [], results: [{ data: rows.map((row) => ({ row })) }] }) };
}

beforeEach(() => {
  process.env.NEO4J_USER = "test-user";
  process.env.NEO4J_PASSWORD = "test-password";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUser === undefined) delete process.env.NEO4J_USER;
  else process.env.NEO4J_USER = originalUser;
  if (originalPassword === undefined) delete process.env.NEO4J_PASSWORD;
  else process.env.NEO4J_PASSWORD = originalPassword;
  vi.restoreAllMocks();
});

describe("ensureBank (Neo4j)", () => {
  it("merges the bank with ON CREATE only, and never overwrites existing fields", async () => {
    globalThis.fetch = vi.fn(async () => okResponse([["ViniciusMathias", "ViniciusMathias", null]]));

    const bank = await ensureBank("ViniciusMathias", "ViniciusMathias");
    expect(bank.id).toBe("ViniciusMathias");

    const [stmt] = statementsFrom(globalThis.fetch.mock.calls[0]);
    expect(stmt.statement).toMatch(/MERGE \(b:Bank \{id: \$bank\}\)/);
    expect(stmt.statement).toMatch(/ON CREATE SET b\.name = \$name, b\.source = 'zrouter', b\.created_at = \$now/);
    expect(stmt.statement).not.toMatch(/ON MATCH/);
    // Pre-existing bank data (mission/background/disposition_json/...) is untouched.
    expect(stmt.statement).not.toMatch(/SET b\.mission/);
    expect(stmt.statement).not.toMatch(/SET b\.background/);
    expect(stmt.statement).not.toMatch(/SET b\.disposition_json/);
    expect(stmt.parameters).toMatchObject({ bank: "ViniciusMathias", name: "ViniciusMathias" });
    expect(typeof stmt.parameters.now).toBe("string");
  });

  it("passes through the bank id and rejects an invalid one before any query", async () => {
    globalThis.fetch = vi.fn(async () => okResponse([["eve", "EVE", "2026-01-01T00:00:00.000Z"]]));
    await ensureBank("eve", "EVE");
    expect(statementsFrom(globalThis.fetch.mock.calls[0])[0].parameters.name).toBe("EVE");

    globalThis.fetch = vi.fn();
    await expect(ensureBank("bad bank; DROP", "x")).rejects.toThrow(/Invalid memory bank ID/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("is fail-open when Neo4j rejects the query", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ errors: [{ code: "Neo.ClientError.Statement.SyntaxError" }], results: [] }) }));

    await expect(ensureBank("eve", "EVE")).resolves.toMatchObject({ id: "eve", name: "EVE" });
  });

  it("is fail-open when the transport fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => { throw new Error("ECONNREFUSED"); });

    await expect(ensureBank("eve", "EVE")).resolves.toMatchObject({ id: "eve", name: "EVE" });
  });
});

describe("ensureMentalModel (Neo4j)", () => {
  it("merges on bank+id with ON CREATE only", async () => {
    globalThis.fetch = vi.fn(async () => okResponse([["eve-1234abcd"]]));

    const model = await ensureMentalModel("eve", "eve-1234abcd");
    expect(model).toEqual({ id: "eve-1234abcd", disabled: false });

    const [stmt] = statementsFrom(globalThis.fetch.mock.calls[0]);
    expect(stmt.statement).toMatch(/MERGE \(mm:MentalModel \{bank: \$bank, id: \$id\}\)/);
    expect(stmt.statement).toMatch(/ON CREATE SET mm\.content = '', mm\.created_at = \$now, mm\.source = 'zrouter'/);
    expect(stmt.statement).not.toMatch(/ON MATCH/);
    expect(stmt.statement).not.toMatch(/SET mm\.content = \$/);
    expect(stmt.parameters).toMatchObject({ bank: "eve", id: "eve-1234abcd" });
  });

  it("does not touch Neo4j without a mental-model id, and stays fail-open on error", async () => {
    globalThis.fetch = vi.fn();
    await expect(ensureMentalModel("eve", "")).resolves.toEqual({ id: null, disabled: true });
    expect(globalThis.fetch).not.toHaveBeenCalled();

    vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    await expect(ensureMentalModel("eve", "eve-1")).resolves.toEqual({ id: "eve-1", disabled: false });
  });
});
