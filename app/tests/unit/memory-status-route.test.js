import { beforeEach, describe, expect, it, vi } from "vitest";

// Route under test: GET /v1/memory (ADR 0383, mudança A). Module state (the
// 60s liveness cache) is reset with resetModules so tests stay independent.

vi.mock("@/sse/services/auth.js", () => ({
  extractApiKey: vi.fn(),
  isValidApiKey: vi.fn(),
}));
vi.mock("@/lib/localDb", () => ({ getApiKeyByValue: vi.fn() }));
vi.mock("@/lib/identityMemory/neo4j.js", () => ({
  statement: vi.fn((text) => ({ statement: text, parameters: {} })),
  execute: vi.fn(),
}));
vi.mock("@/lib/identityMemory/profileConfig.js", () => ({
  normalizeMemoryBackend: vi.fn((value) => (value ? String(value) : "neo4j")),
}));

import { extractApiKey, isValidApiKey } from "@/sse/services/auth.js";
import { getApiKeyByValue } from "@/lib/localDb";
import { execute } from "@/lib/identityMemory/neo4j.js";

const loadRoute = async () => (await import("../../src/app/api/v1/memory/route.js")).GET;

const KEY_WITH_MEMORY = {
  name: "ViniciusMathias",
  isService: false,
  memoryEnabled: true,
  hindsightBankId: "ViniciusMathias",
  mentalModelId: "viniciusmathias-a60a2418",
  memoryBackend: "neo4j",
  soul: "# SOUL",
  sources: { "open-notebook": { enabled: true } },
};

const req = (apiKey) =>
  new Request("http://localhost/v1/memory", { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });

describe("GET /v1/memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    execute.mockReset();
  });

  it("401 without key", async () => {
    extractApiKey.mockReturnValue(null);
    const GET = await loadRoute();
    const res = await GET(req(null));
    expect(res.status).toBe(401);
  });

  it("401 with invalid key", async () => {
    extractApiKey.mockReturnValue("sk-bad");
    getApiKeyByValue.mockResolvedValue(null);
    const GET = await loadRoute();
    const res = await GET(req("sk-bad"));
    expect(res.status).toBe(401);
  });

  it("service key gets enabled:false only (no bank leak)", async () => {
    extractApiKey.mockReturnValue("sk-svc");
    isValidApiKey.mockResolvedValue(true);
    getApiKeyByValue.mockResolvedValue({ ...KEY_WITH_MEMORY, isService: true, insightBankId: "x" });
    const GET = await loadRoute();
    const res = await GET(req("sk-svc"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ object: "memory.status", memory: { enabled: false } });
  });

  it("key without memory gets enabled:false only", async () => {
    extractApiKey.mockReturnValue("sk-plain");
    isValidApiKey.mockResolvedValue(true);
    getApiKeyByValue.mockResolvedValue({ ...KEY_WITH_MEMORY, memoryEnabled: false, hindsightBankId: null });
    const GET = await loadRoute();
    const res = await GET(req("sk-plain"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ object: "memory.status", memory: { enabled: false } });
  });

  it("key with memory + graph reachable reports enabled/live with injects", async () => {
    extractApiKey.mockReturnValue("sk-good");
    isValidApiKey.mockResolvedValue(true);
    getApiKeyByValue.mockResolvedValue(KEY_WITH_MEMORY);
    execute.mockResolvedValue([{ columns: ["1"], data: [[1]] }]);
    const GET = await loadRoute();
    const res = await GET(req("sk-good"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.object).toBe("memory.status");
    expect(json.memory).toMatchObject({
      enabled: true,
      bankId: "ViniciusMathias",
      mentalModelId: "viniciusmathias-a60a2418",
      backend: "neo4j",
      live: true,
      injects: { soul: true, mentalModel: true, recall: true, sources: true },
    });
    expect(json.memory.injects.soul).toBe(true);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("graph unreachable degrades to live:false with HTTP 200", async () => {
    extractApiKey.mockReturnValue("sk-good");
    isValidApiKey.mockResolvedValue(true);
    getApiKeyByValue.mockResolvedValue(KEY_WITH_MEMORY);
    execute.mockRejectedValue(new Error("connection refused"));
    const GET = await loadRoute();
    const res = await GET(req("sk-good"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.memory.enabled).toBe(true);
    expect(json.memory.live).toBe(false);
  });

  it("never leaks secrets in body", async () => {
    extractApiKey.mockReturnValue("sk-good");
    isValidApiKey.mockResolvedValue(true);
    getApiKeyByValue.mockResolvedValue(KEY_WITH_MEMORY);
    execute.mockResolvedValue([{ columns: ["1"], data: [[1]] }]);
    const GET = await loadRoute();
    const res = await GET(req("sk-good"));
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/bolt:|neo4j:\/\/|password|nvapi|sk-/i);
  });
});
