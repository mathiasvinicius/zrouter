// Entrega 1 — unit test of the common sources contract with mocked backends.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the three backends before importing the contract module.
const openNotebookSearch = vi.fn(async () => []);
const openNotebookGet = vi.fn(async () => null);
const neo4jSearch = vi.fn(async () => []);
const neo4jGet = vi.fn(async () => null);
const notionSearch = vi.fn(async () => []);
const notionGet = vi.fn(async () => null);

vi.mock("open-sse/sources/openNotebookBackend.js", () => ({
  searchOpenNotebook: (...args) => openNotebookSearch(...args),
  getOpenNotebookSource: (...args) => openNotebookGet(...args),
  isOpenNotebookConfigured: () => true,
}));
vi.mock("open-sse/sources/neo4jBackend.js", () => ({
  searchNeo4j: (...args) => neo4jSearch(...args),
  getNeo4jSource: (...args) => neo4jGet(...args),
  isNeo4jConfigured: () => true,
}));
vi.mock("open-sse/sources/notionBackend.js", () => ({
  searchNotion: (...args) => notionSearch(...args),
  getNotionSource: (...args) => notionGet(...args),
  isNotionConfigured: () => false,
}));

const { searchSources, getSource, SourcePermissionError, isSourceEnabled } =
  await import("open-sse/sources/index.js");

const KEY_NO_SOURCES = { id: "k-none", sources: "{}" };
const KEY_NOTEBOOK = {
  id: "k-onb",
  sources: JSON.stringify({
    "open-notebook": { enabled: true, notebooks: ["notebook:allowed"] },
  }),
};
const KEY_ALL = {
  id: "k-all",
  sources: {
    notion: { enabled: true, pages: ["page-1"], databases: [] },
    "open-notebook": { enabled: true, notebooks: ["notebook:allowed", "notebook:other"] },
    neo4j: { enabled: true, banks: ["eve"] },
  },
};

const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

beforeEach(() => {
  openNotebookSearch.mockReset().mockResolvedValue([]);
  openNotebookGet.mockReset().mockResolvedValue(null);
  neo4jSearch.mockReset().mockResolvedValue([]);
  neo4jGet.mockReset().mockResolvedValue(null);
  notionSearch.mockReset().mockResolvedValue([]);
  notionGet.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  warnSpy.mockClear();
});

describe("sources contract", () => {
  it("key with no sources enabled → empty results, no backend called", async () => {
    const results = await searchSources(KEY_NO_SOURCES, "zenith server", null, 10);
    expect(results).toEqual([]);
    expect(openNotebookSearch).not.toHaveBeenCalled();
    expect(neo4jSearch).not.toHaveBeenCalled();
    expect(notionSearch).not.toHaveBeenCalled();
  });

  it("key with an authorized notebook → only that backend is queried and only its results return", async () => {
    openNotebookSearch.mockResolvedValue([{
      sourceId: "open-notebook:source:abc",
      title: "Infra",
      excerpt: "O Zenith é o servidor…",
      url: "",
      bank: "notebook:allowed",
      score: 0.9,
    }]);
    const results = await searchSources(KEY_NOTEBOOK, "zenith", null, 10);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      sourceId: "open-notebook:source:abc",
      origin: "open-notebook",
      bank: "notebook:allowed",
      score: 0.9,
    });
    // Backend receives the key's scope entry.
    expect(openNotebookSearch).toHaveBeenCalledWith(
      "zenith",
      expect.objectContaining({ enabled: true, notebooks: ["notebook:allowed"] }),
      10,
    );
    expect(neo4jSearch).not.toHaveBeenCalled();
    expect(notionSearch).not.toHaveBeenCalled();
  });

  it("key explicitly requesting an unauthorized scope → SourcePermissionError (403), not silence", async () => {
    await expect(searchSources(KEY_NOTEBOOK, "q", ["neo4j"], 10))
      .rejects.toBeInstanceOf(SourcePermissionError);
    expect(neo4jSearch).not.toHaveBeenCalled();
  });

  it("key with all sources enabled queries only enabled origins and merges ranked results", async () => {
    openNotebookSearch.mockResolvedValue([{ sourceId: "open-notebook:source:1", title: "ONB", score: 0.4 }]);
    neo4jSearch.mockResolvedValue([{ sourceId: "neo4j:m1", title: "Neo", score: 0.8, bank: "eve" }]);
    notionSearch.mockResolvedValue([{ sourceId: "notion:p1", title: "Notion", score: 0.6 }]);
    const results = await searchSources(KEY_ALL, "query", null, 10);
    expect(results.map((r) => r.origin)).toEqual(["neo4j", "notion", "open-notebook"]);
    expect(results[0]).toMatchObject({ origin: "neo4j", score: 0.8, bank: "eve" });
  });

  it("a failing backend degrades to empty list instead of throwing (fail-open per backend)", async () => {
    openNotebookSearch.mockRejectedValue(new Error("connection refused"));
    const results = await searchSources(KEY_NOTEBOOK, "q", null, 10);
    expect(results).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    // Structured log: channel/event/origin only, never credentials or query.
    const logged = warnSpy.mock.calls[0][0];
    expect(logged).toContain("\"channel\":\"sources\"");
    expect(logged).toContain("\"event\":\"search-failed\"");
    expect(logged).toContain("\"origin\":\"open-notebook\"");
    expect(logged).not.toContain("Bearer");
  });

  it("empty query → no backend call", async () => {
    expect(await searchSources(KEY_ALL, "", null, 10)).toEqual([]);
    expect(openNotebookSearch).not.toHaveBeenCalled();
  });

  it("unknown origin in explicit scope → SourcePermissionError", async () => {
    await expect(searchSources(KEY_ALL, "q", ["dropbox"], 10))
      .rejects.toBeInstanceOf(SourcePermissionError);
  });

  it("getSource returns null for a disabled origin and delegates for an enabled one", async () => {
    expect(await getSource(KEY_NO_SOURCES, "open-notebook:source:abc")).toBeNull();
    openNotebookGet.mockResolvedValue({
      sourceId: "open-notebook:source:abc",
      title: "Infra",
      content: "full text",
      url: "",
      bank: "notebook:allowed",
      origin: "open-notebook",
    });
    const source = await getSource(KEY_NOTEBOOK, "open-notebook:source:abc");
    expect(source).toMatchObject({ origin: "open-notebook", bank: "notebook:allowed" });
    expect(await getSource(KEY_NOTEBOOK, "malformed-id")).toBeNull();
  });

  it("isSourceEnabled reads both JSON-string and object rows", () => {
    expect(isSourceEnabled(KEY_NO_SOURCES, "open-notebook")).toBe(false);
    expect(isSourceEnabled(KEY_NOTEBOOK, "open-notebook")).toBe(true);
    expect(isSourceEnabled(KEY_ALL, "neo4j")).toBe(true);
    expect(isSourceEnabled(null, "notion")).toBe(false);
  });

  it("limit is clamped to a sane ceiling", async () => {
    await searchSources(KEY_ALL, "q", null, 9999);
    expect(openNotebookSearch).toHaveBeenCalledWith("q", expect.anything(), 50);
  });
});
