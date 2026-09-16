// Per-key notebook authorization in the Open Notebook backend — the filter that
// already existed and must not regress, plus the additive "*" marker.
//
// Decision (requirements B2): an EMPTY notebooks list still means NOTHING is
// authorized ([] → 0 results, verified live). "*" is the explicit "all" marker.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { searchOpenNotebook, getOpenNotebookSource, ALL_NOTEBOOKS } =
  await import("open-sse/sources/openNotebookBackend.js");

const originalFetch = global.fetch;
const NOTEBOOK_A = "notebook:a";
const NOTEBOOK_B = "notebook:b";

// Two sources: one in notebook A, one in notebook B. The upstream search is global.
const SOURCES = {
  "source:1": { id: "source:1", title: "Doc do caderno A", full_text: "conteudo A", notebooks: [NOTEBOOK_A] },
  "source:2": { id: "source:2", title: "Doc do caderno B", full_text: "conteudo B", notebooks: [NOTEBOOK_B] },
};

beforeEach(() => {
  process.env.OPEN_NOTEBOOK_PASSWORD = "test-password";
  process.env.OPEN_NOTEBOOK_URL = "http://127.0.0.1:5055";
  global.fetch = vi.fn(async (url) => {
    const path = String(url).replace("http://127.0.0.1:5055", "");
    if (path === "/api/search") {
      return { ok: true, status: 200, json: async () => ({ results: [
        { id: "source:1", title: "Doc do caderno A", similarity: 0.9, matches: ["trecho A"] },
        { id: "source:2", title: "Doc do caderno B", similarity: 0.8, matches: ["trecho B"] },
      ] }) };
    }
    const id = decodeURIComponent(path.replace("/api/sources/", ""));
    const source = SOURCES[id];
    return source
      ? { ok: true, status: 200, json: async () => source }
      : { ok: false, status: 404, json: async () => ({ detail: "not found" }) };
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("open-notebook notebook scope", () => {
  it("an empty notebooks list authorizes NOTHING (unchanged behaviour)", async () => {
    expect(await searchOpenNotebook("doc", { enabled: true, notebooks: [] }, 10)).toEqual([]);
    expect(await getOpenNotebookSource("source:1", { enabled: true, notebooks: [] })).toBeNull();
  });

  it("a missing notebooks list authorizes NOTHING", async () => {
    expect(await searchOpenNotebook("doc", { enabled: true }, 10)).toEqual([]);
  });

  it("a key scoped to notebook A only sees notebook A content", async () => {
    const results = await searchOpenNotebook("doc", { enabled: true, notebooks: [NOTEBOOK_A] }, 10);
    expect(results.map((r) => r.sourceId)).toEqual(["open-notebook:source:1"]);
    expect(results[0].bank).toBe(NOTEBOOK_A);
    // …and cannot fetch the other notebook's document even with its id.
    expect(await getOpenNotebookSource("source:1", { enabled: true, notebooks: [NOTEBOOK_A] })).not.toBeNull();
    expect(await getOpenNotebookSource("source:2", { enabled: true, notebooks: [NOTEBOOK_A] })).toBeNull();
  });

  it("a key scoped to two notebooks sees both", async () => {
    const results = await searchOpenNotebook("doc", { enabled: true, notebooks: [NOTEBOOK_A, NOTEBOOK_B] }, 10);
    expect(results.map((r) => r.sourceId).sort()).toEqual(["open-notebook:source:1", "open-notebook:source:2"]);
  });

  it('the explicit "*" marker means "all notebooks"', async () => {
    expect(ALL_NOTEBOOKS).toBe("*");
    const results = await searchOpenNotebook("doc", { enabled: true, notebooks: [ALL_NOTEBOOKS] }, 10);
    expect(results.map((r) => r.sourceId).sort()).toEqual(["open-notebook:source:1", "open-notebook:source:2"]);
    expect(await getOpenNotebookSource("source:2", { enabled: true, notebooks: [ALL_NOTEBOOKS] })).not.toBeNull();
  });

  it('"*" wins over specific ids (additive marker, not a filter entry)', async () => {
    const results = await searchOpenNotebook("doc", { enabled: true, notebooks: [ALL_NOTEBOOKS, NOTEBOOK_A] }, 10);
    expect(results.length).toBe(2);
    // The marker itself never becomes a result attribute.
    expect(results.every((r) => r.bank !== ALL_NOTEBOOKS)).toBe(true);
  });

  it("an unauthorized notebook id returns nothing", async () => {
    expect(await searchOpenNotebook("doc", { enabled: true, notebooks: ["notebook:nope"] }, 10)).toEqual([]);
  });
});
