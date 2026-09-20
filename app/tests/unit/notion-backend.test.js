import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { searchNotion, getNotionSource, probeNotionConnection } =
  await import("open-sse/sources/notionBackend.js");

const originalFetch = global.fetch;
const PAGE = {
  object: "page",
  id: "page-1",
  url: "https://notion.so/page-1",
  last_edited_time: "2026-09-20T00:00:00Z",
  parent: { type: "data_source_id", data_source_id: "database-1" },
  properties: { Name: { type: "title", title: [{ plain_text: "Zenith" }] } },
};

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token";
  global.fetch = vi.fn(async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === "/v1/users/me") return { ok: true, json: async () => ({ object: "user" }) };
    if (path === "/v1/search") return { ok: true, json: async () => ({ results: [PAGE] }) };
    if (path === "/v1/pages/page-1") return { ok: true, json: async () => PAGE };
    if (path === "/v1/blocks/page-1/children") {
      return { ok: true, json: async () => ({ results: [
        { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Servidor Zenith operacional" }] } },
      ] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Notion read-only backend", () => {
  it("does no network I/O when the key has no authorized scope", async () => {
    expect(await searchNotion("Zenith", { enabled: true, pages: [], databases: [] })).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("searches and reads only a page in the authorized database", async () => {
    const results = await searchNotion("Zenith", { enabled: true, pages: [], databases: ["database-1"] });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ sourceId: "notion:page-1", title: "Zenith", bank: "database-1" });
    expect(results[0].excerpt).toContain("Servidor Zenith operacional");
  });

  it("rejects direct reads outside the key scope", async () => {
    await expect(getNotionSource("page-1", { enabled: true, pages: [], databases: ["other"] }))
      .resolves.toBeNull();
  });

  it("performs a real token probe", async () => {
    await expect(probeNotionConnection()).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/v1/users/me"), expect.any(Object));
  });
});
