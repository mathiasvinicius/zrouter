// GET /api/sources/open-notebook/notebooks — normalization, no credential/URL leak,
// fail-open (HTTP 200 with an empty list) when Open Notebook is unreachable.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body, init) => ({ body, status: init?.status ?? 200, headers: init?.headers }),
  },
}));

const backend = await import("open-sse/sources/openNotebookBackend.js");
const { GET } = await import("../../src/app/api/sources/open-notebook/notebooks/route.js");

const PASSWORD = "super-secret-notebook-password";
const BASE_URL = "http://127.0.0.1:5055";
const originalFetch = global.fetch;

function upstream(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

beforeEach(() => {
  process.env.OPEN_NOTEBOOK_PASSWORD = PASSWORD;
  process.env.OPEN_NOTEBOOK_URL = BASE_URL;
  backend.resetNotebookCache();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("GET /api/sources/open-notebook/notebooks", () => {
  it("returns a normalized {id,name,description} list, not the raw upstream payload", async () => {
    global.fetch = vi.fn(async () => upstream([
      { id: "notebook:abc", name: "ArianeMathias", description: "Projeto Prevenção Escolar",
        archived: false, source_count: 4, created: "2026-09-16 15:58:32+00:00", embedding: "secret-vector" },
      { id: "notebook:def", name: "zrouter", description: "ZRouter gateway" },
    ]));

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
    expect(response.body.notebooks[0]).toEqual({
      id: "notebook:abc", name: "ArianeMathias", description: "Projeto Prevenção Escolar",
    });
    // Only the three fields survive — no upstream internals.
    expect(Object.keys(response.body.notebooks[0]).sort()).toEqual(["description", "id", "name"]);
    expect(JSON.stringify(response.body)).not.toContain("secret-vector");
  });

  it("never leaks the credential or the internal URL", async () => {
    global.fetch = vi.fn(async () => upstream([{ id: "notebook:abc", name: "n" }]));

    const response = await GET();
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain(BASE_URL);
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
  });

  it("fails open with HTTP 200 and an empty list when Open Notebook is down", async () => {
    global.fetch = vi.fn(async () => { throw new Error(`fetch failed: ${BASE_URL}/api/notebooks`); });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ notebooks: [], count: 0, error: "unavailable" });
  });

  it("fails open on a non-2xx upstream response too", async () => {
    global.fetch = vi.fn(async () => upstream({ detail: "boom" }, { ok: false, status: 500 }));

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ notebooks: [], count: 0, error: "unavailable" });
  });

  it("serves a repeated call from the short-lived cache", async () => {
    const fetchMock = vi.fn(async () => upstream([{ id: "notebook:abc", name: "ArianeMathias" }]));
    global.fetch = fetchMock;

    await GET();
    await GET();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
