// Real read from Open Notebook (127.0.0.1:5055) through the backend — proves
// the authorized-notebook filter works against the actual server data.
//
// TIMEOUT NOTE: the first /api/search against a cold Open Notebook takes ~50s
// (embedding + vector search). The per-test budget is 90s for that reason —
// a 20s budget produced flaky failures that were NOT regressions.
import { describe, expect, it } from "vitest";

const { searchOpenNotebook, getOpenNotebookSource } = await import("open-sse/sources/openNotebookBackend.js");

const password = process.env.OPEN_NOTEBOOK_PASSWORD;
const real = Boolean(password);

const AUTHORIZED = ["notebook:rh0akzgaomdy61ii9s1l"]; // Base de Conhecimento EVE
const UNAUTHORIZED = ["notebook:does-not-exist"];

describe("open-notebook backend (real server)", () => {
  (real ? it : it.skip)("returns only results from the authorized notebook", async () => {
    const results = await searchOpenNotebook("Zenith servidor 9Router", { enabled: true, notebooks: AUTHORIZED }, 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].bank).toBe(AUTHORIZED[0]);
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].sourceId.startsWith("open-notebook:")).toBe(true);
  }, 90_000);

  (real ? it : it.skip)("returns empty for a key whose notebooks are not authorized", async () => {
    const results = await searchOpenNotebook("Zenith servidor 9Router", { enabled: true, notebooks: UNAUTHORIZED }, 10);
    expect(results).toEqual([]);
  }, 90_000);

  (real ? it : it.skip)("getSource returns full content only inside the authorized scope", async () => {
    const results = await searchOpenNotebook("Zenith", { enabled: true, notebooks: AUTHORIZED }, 1);
    expect(results.length).toBeGreaterThan(0);
    const id = results[0].sourceId.slice("open-notebook:".length);
    const source = await getOpenNotebookSource(id, { enabled: true, notebooks: AUTHORIZED });
    expect(source.content.length).toBeGreaterThan(0);
    expect(await getOpenNotebookSource(id, { enabled: true, notebooks: UNAUTHORIZED })).toBeNull();
  }, 30_000);
});
