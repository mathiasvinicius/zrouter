// Entrega 3 — a slow or broken source must never block inference (timeout + fail-open).
import { beforeEach, describe, expect, it, vi } from "vitest";

const searchSources = vi.fn(async () => []);
vi.mock("open-sse/sources/index.js", () => ({
  SOURCE_ORIGINS: ["notion", "open-notebook", "neo4j"],
  isSourceEnabled: (row, origin) => row?.sources?.[origin]?.enabled === true,
  searchSources: (...args) => searchSources(...args),
}));

const { recallSourcesForKey, sourcesQueryFromBody } = await import("@/lib/sources/context.js");
const { promptFor } = await import("open-sse/rtk/identity.js");

const KEY = {
  id: "key-1",
  sources: { "open-notebook": { enabled: true, notebooks: ["notebook:abc"] } },
};
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

beforeEach(() => {
  searchSources.mockReset();
  warnSpy.mockClear();
});

describe("sources recall — timeout and fail-open", () => {
  it("a backend that never resolves yields the full identity prompt within the timeout", async () => {
    searchSources.mockImplementation(() => new Promise(() => {}));
    const started = Date.now();
    const sources = await recallSourcesForKey(KEY, "zenith servidor", {
      sourcesRecallTimeoutMs: 120,
      sourcesRecallLimit: 6,
    });
    const elapsed = Date.now() - started;
    expect(sources).toEqual([]);
    expect(elapsed).toBeLessThan(2000); // bounded by the configured timeout, not the backend
    const prompt = promptFor({ id: KEY.id, bankId: "eve", sources, capabilities: "<!-- 9ROUTER_CAPABILITIES:v1 -->" });
    expect(prompt).toContain("<!-- 9ROUTER_IDENTITY:v1 -->");
    expect(prompt).not.toContain("9ROUTER_SOURCES");
    expect(warnSpy.mock.calls.some(([line]) => String(line).includes("recall-timeout"))).toBe(true);
  });

  it("a backend that throws is fail-open: no exception propagates, no excerpts, no query leak", async () => {
    searchSources.mockRejectedValue(new Error("connection refused"));
    await expect(recallSourcesForKey(KEY, "zenith servidor", { sourcesRecallTimeoutMs: 500 }))
      .resolves.toEqual([]);
    const logged = warnSpy.mock.calls.map(([line]) => String(line)).join("\n");
    expect(logged).toContain("recall-failed");
    expect(logged).toContain("\"channel\":\"sources\"");
    expect(logged).not.toContain("zenith servidor");
  });

  it("is a no-op (no backend call) for a key with no source enabled", async () => {
    await expect(recallSourcesForKey({ id: "k", sources: "{}" }, "q", {})).resolves.toEqual([]);
    expect(searchSources).not.toHaveBeenCalled();
  });

  it("never calls the backend for an empty query, and the derivation drops trivial text", async () => {
    await recallSourcesForKey(KEY, "", {});
    expect(searchSources).not.toHaveBeenCalled();
    // Same trivial-query rule the memory recall applies, so the chat path passes "".
    expect(sourcesQueryFromBody({ messages: [{ role: "user", content: "  olá! " }] })).toBe("");
    expect(sourcesQueryFromBody({ messages: [{ role: "user", content: "Zenith servidor" }] })).toBe("Zenith servidor");
  });

  it("clamps the limit and the timeout to their documented ranges", async () => {
    searchSources.mockResolvedValue([]);
    await recallSourcesForKey(KEY, "zenith", { sourcesRecallLimit: 999, sourcesRecallTimeoutMs: 0 });
    expect(searchSources).toHaveBeenCalledWith(KEY, "zenith", null, 20);
  });
});
