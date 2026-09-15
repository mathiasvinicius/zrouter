import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDefaultMemoryBackend,
  getMemoryBackend,
  listBankMemories,
  mentalModelForProfile,
  recallForProfile,
} from "../../src/lib/identityMemory/index.js";

const originalBackend = process.env.IDENTITY_MEMORY_BACKEND;
const originalUser = process.env.NEO4J_USER;
const originalPassword = process.env.NEO4J_PASSWORD;
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalBackend === undefined) delete process.env.IDENTITY_MEMORY_BACKEND;
  else process.env.IDENTITY_MEMORY_BACKEND = originalBackend;
  if (originalUser === undefined) delete process.env.NEO4J_USER;
  else process.env.NEO4J_USER = originalUser;
  if (originalPassword === undefined) delete process.env.NEO4J_PASSWORD;
  else process.env.NEO4J_PASSWORD = originalPassword;
  globalThis.fetch = originalFetch;
});

describe("identity-memory backend selection", () => {
  it("uses Neo4j by default and coerces an inherited Hindsight value", () => {
    delete process.env.IDENTITY_MEMORY_BACKEND;
    expect(getDefaultMemoryBackend()).toBe("neo4j");

    process.env.IDENTITY_MEMORY_BACKEND = "neo4j";
    expect(getMemoryBackend({ memoryBackend: null })).toBe("neo4j");
    // Entrega 4 — Hindsight was removed; a legacy value is coerced, never an error.
    expect(getMemoryBackend({ memoryBackend: "hindsight" })).toBe("neo4j");
  });

  it("routes profile list operations to Neo4j", async () => {
    process.env.IDENTITY_MEMORY_BACKEND = "hindsight"; // legacy value must still route to Neo4j
    process.env.NEO4J_USER = "test-user";
    process.env.NEO4J_PASSWORD = "test-password";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        errors: [],
        results: [
          { data: [{ row: [1] }] },
          { data: [{ row: [{ id: "m1", bank: "eve", text: "Memory" }] }] },
        ],
      }),
    }));

    const data = await listBankMemories({
      id: "key-eve",
      hindsightBankId: "eve",
      memoryEnabled: true,
      memoryBackend: "neo4j",
    });

    expect(data.total).toBe(1);
    expect(data.items[0].id).toBe("m1");
    expect(globalThis.fetch.mock.calls[0][0]).toContain("/db/neo4j/tx/commit");
  });

  it("does not call either backend for a trivial recall", async () => {
    globalThis.fetch = vi.fn();
    const result = await recallForProfile({
      id: "key-eve",
      hindsightBankId: "eve",
      memoryEnabled: true,
      memoryBackend: "neo4j",
    }, { messages: [{ role: "user", content: "oi" }] });

    expect(result).toBe("");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("preserves an existing mental model from the Neo4j snapshot", async () => {
    process.env.NEO4J_USER = "test-user";
    process.env.NEO4J_PASSWORD = "test-password";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ errors: [], results: [{ data: [{ row: ["EVE identity model"] }] }] }),
    }));

    const content = await mentalModelForProfile({
      hindsightBankId: "eve", mentalModelId: "soberano",
      memoryBackend: "neo4j", memoryEnabled: true,
    });
    expect(content).toBe("EVE identity model");
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body).statements[0].parameters).toEqual({
      bank: "eve", id: "soberano",
    });
  });
});
