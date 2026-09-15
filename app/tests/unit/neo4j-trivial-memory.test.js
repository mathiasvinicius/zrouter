// Entrega 4 — trivial-message filtering and dedup for the Neo4j identity
// backend (the Hindsight implementation was removed).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMemoryDedupCaches,
  isTrivialMemoryText,
  recallForProfile,
  retainForProfile,
} from "@/lib/identityMemory/neo4j.js";

const profile = {
  id: "eve",
  name: "EVE",
  memoryEnabled: true,
  hindsightBankId: "eve",
  memoryBackend: "neo4j",
};

function recallResponse(text) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      errors: [],
      results: [{ data: [{ row: ["m1", text, "observation", "2026-01-01", null, "ctx", 1, [], [], 3] }] }],
    }),
  };
}

const originalUser = process.env.NEO4J_USER;
const originalPassword = process.env.NEO4J_PASSWORD;

beforeEach(() => {
  process.env.NEO4J_USER = "test-user";
  process.env.NEO4J_PASSWORD = "test-password";
});

afterEach(() => {
  clearMemoryDedupCaches();
  vi.unstubAllGlobals();
  if (originalUser === undefined) delete process.env.NEO4J_USER;
  else process.env.NEO4J_USER = originalUser;
  if (originalPassword === undefined) delete process.env.NEO4J_PASSWORD;
  else process.env.NEO4J_PASSWORD = originalPassword;
});

describe("Neo4j trivial-message filtering", () => {
  it.each([
    "Oi?",
    "Olá!",
    "bom dia",
    "Tudo bem?",
    "ok",
    "valeu!",
  ])("recognizes %j as trivial", (text) => {
    expect(isTrivialMemoryText(text)).toBe(true);
  });

  it("ignores context injected after a greeting", () => {
    expect(isTrivialMemoryText("Oi?\n\n═══ EVE TEMPERAMENT\nstate: calm")).toBe(true);
  });

  it("does not classify meaningful messages as trivial", () => {
    expect(isTrivialMemoryText("Oi, procure as memórias da MILE")).toBe(false);
    expect(isTrivialMemoryText("Como vai funcionar a memória Neo4j?")).toBe(false);
  });

  it("skips recall and retain network calls for a greeting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const body = {
      messages: [{
        role: "user",
        content: "Oi?\n\n═══ EVE TEMPERAMENT\nstate: calm",
      }],
    };

    await expect(recallForProfile(profile, body)).resolves.toBe("");
    await expect(retainForProfile(profile, body, "conversation-test")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Neo4j agent-loop deduplication", () => {
  it("reuses recall for repeated internal calls with the same user message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(recallResponse("Prefiro respostas objetivas"));
    vi.stubGlobal("fetch", fetchMock);
    const body = { messages: [{ role: "user", content: "Continue a tarefa da GPU" }] };

    const first = await recallForProfile(profile, body);
    const second = await recallForProfile(profile, body);

    expect(first).toContain("Prefiro respostas objetivas");
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains repeated internal calls only once", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ errors: [], results: [{ data: [{ row: ["m1", "eve", "pending"] }] }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const body = { messages: [{ role: "user", content: "Continue a tarefa da GPU" }] };

    await retainForProfile(profile, body, "conversation-1");
    await retainForProfile(profile, body, "conversation-2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tags the memory with the api key that produced it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ errors: [], results: [{ data: [{ row: ["m1", "eve", "pending"] }] }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const body = { messages: [{ role: "user", content: "Prefiro respostas objetivas" }] };

    await retainForProfile(profile, body, "conversation-1");
    const [statement] = JSON.parse(fetchMock.mock.calls[0][1].body).statements;
    expect(statement.parameters.tags).toEqual(["api-key:eve"]);
    expect(statement.parameters.bank).toBe("eve");
    expect(statement.statement).toMatch(/MERGE \(m:Memory \{id: \$id\}\)/);
  });

  it("does not retain injected temperament as user memory", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ errors: [], results: [{ data: [{ row: ["m1", "eve", "pending"] }] }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const body = {
      messages: [{
        role: "user",
        content: "Continue a tarefa da GPU\n\n═══ EVE TEMPERAMENT\nstate: calm",
      }],
    };

    await retainForProfile(profile, body, "conversation-1");
    const [statement] = JSON.parse(fetchMock.mock.calls[0][1].body).statements;
    expect(statement.parameters.text).toBe("Continue a tarefa da GPU");
  });
});
