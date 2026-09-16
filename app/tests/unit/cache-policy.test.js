// Entrega 8 (A) — prompt-cache policy + savings metrics.
// never rewrites, always preserves, auto preserves only for cache-aware clients on
// caching providers; the 4-marker Anthropic budget is never exceeded; metrics sum.
import { describe, it, expect } from "vitest";
import {
  shouldPreserveCacheControl,
  normalizeCacheControlMode,
  isCacheAwareClient,
  providerSupportsCaching,
  providerHonorsOpenAIFormatCacheControl,
  enforceClaudeCacheBudget,
} from "../../open-sse/utils/cacheControlPolicy.js";
import { anchorClaudeCache, prepareClaudeRequest, countCacheControlBlocks } from "../../open-sse/translator/formats/claude.js";
import { filterToOpenAIFormat } from "../../open-sse/translator/formats/openai.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const CLAUDE_CODE_UA = "claude-cli/2.0.30 (external, cli)";

const markedBody = () => ({
  model: "claude-sonnet-4-6",
  system: [
    { type: "text", text: "sys" },
    { type: "text", text: "tail", cache_control: { type: "ephemeral", ttl: "1h" } },
  ],
  tools: [
    { name: "a", description: "t", input_schema: { type: "object" }, cache_control: { type: "ephemeral" } },
    { name: "b", description: "t", input_schema: { type: "object" } },
  ],
  messages: [
    { role: "user", content: [{ type: "text", text: "hi", cache_control: { type: "ephemeral" } }] },
    { role: "assistant", content: [{ type: "tool_use", id: "1", name: "a", input: {}, cache_control: { type: "ephemeral" } }] },
  ],
});

const markersOf = (body) => ({
  system: body.system?.map((b) => !!b.cache_control) || [],
  tools: body.tools?.map((t) => !!t.cache_control) || [],
  messages: (body.messages || []).flatMap((m) => Array.isArray(m.content) ? m.content.map((b) => !!b.cache_control) : []),
});

describe("cache control policy — mode resolution", () => {
  it("normalizes unknown modes to auto", () => {
    expect(normalizeCacheControlMode("lol")).toBe("auto");
    expect(normalizeCacheControlMode(undefined)).toBe("auto");
    expect(normalizeCacheControlMode("never")).toBe("never");
  });

  it("shouldPreserveCacheControl: always preserves, never does not, even for a cache-aware client", () => {
    const base = { userAgent: CLAUDE_CODE_UA, clientTool: "claude", targetProvider: "claude", targetFormat: "claude" };
    expect(shouldPreserveCacheControl({ ...base, mode: "always" })).toBe(true);
    expect(shouldPreserveCacheControl({ ...base, mode: "never" })).toBe(false);
  });

  it("auto preserves only for a cache-aware client on a caching provider", () => {
    const base = { mode: "auto", targetFormat: "claude" };
    expect(shouldPreserveCacheControl({ ...base, clientTool: "claude", targetProvider: "claude" })).toBe(true);
    expect(shouldPreserveCacheControl({ ...base, userAgent: CLAUDE_CODE_UA, targetProvider: "deepseek" })).toBe(true);
    // not cache-aware
    expect(shouldPreserveCacheControl({ ...base, userAgent: "curl/8", clientTool: null, targetProvider: "claude" })).toBe(false);
    // cache-aware client, provider without prompt caching
    expect(shouldPreserveCacheControl({ ...base, clientTool: "claude", targetProvider: "groq", targetFormat: "openai" })).toBe(false);
  });

  it("client detection recognizes Claude Code UAs and the claude clientTool", () => {
    expect(isCacheAwareClient({ userAgent: CLAUDE_CODE_UA })).toBe(true);
    expect(isCacheAwareClient({ userAgent: "claude_code/1.0" })).toBe(true);
    expect(isCacheAwareClient({ userAgent: "node-fetch" })).toBe(false);
    expect(isCacheAwareClient({ clientTool: "claude" })).toBe(true);
  });

  it("providerSupportsCaching: any Claude-protocol target counts", () => {
    expect(providerSupportsCaching("anthropic-compatible-x", "claude")).toBe(true);
    expect(providerSupportsCaching("openai", "openai")).toBe(true);
    expect(providerSupportsCaching("groq", "openai")).toBe(false);
  });
});

describe("anchorClaudeCache — never rewrites, always preserves", () => {
  it("default (never) re-anchors: head system/tool pinned at 1h, over-budget client markers trimmed tail-most", () => {
    // 6 client markers (system 1 + tools 2 + messages 3) exceed the budget: the two
    // head anchors are pinned at 1h and the remaining 2 slots go to the tail-most
    // of the client's own markers — the leading ones are dropped.
    const body = anchorClaudeCache({
      model: "claude-sonnet-4-6",
      system: [
        { type: "text", text: "sys" },
        { type: "text", text: "tail", cache_control: { type: "ephemeral" } },
      ],
      tools: [
        { name: "a", description: "t", input_schema: { type: "object" }, cache_control: { type: "ephemeral" } },
        { name: "b", description: "t", input_schema: { type: "object" }, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        { role: "user", content: [{ type: "text", text: "m0", cache_control: { type: "ephemeral" } }] },
        { role: "user", content: [{ type: "text", text: "m1", cache_control: { type: "ephemeral" } }] },
        { role: "user", content: [{ type: "text", text: "m2", cache_control: { type: "ephemeral" } }] },
      ],
    });
    // head anchors pinned at 1h — the point of re-anchoring
    expect(body.system[1].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(body.tools[1].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(body.tools[0].cache_control).toBeUndefined();
    // the leading client marker is trimmed (the 2 remaining slots go tail-most)
    expect(body.messages[0].content[0].cache_control).toBeUndefined();
    expect(body.messages[1].content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.messages[2].content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(countCacheControlBlocks(body)).toBeLessThanOrEqual(4);

    // under budget: the client's assistant marker is dropped and an anchor added
    const simple = anchorClaudeCache({
      messages: [
        { role: "user", content: [{ type: "text", text: "hi", cache_control: { type: "ephemeral" } }] },
        { role: "assistant", content: [{ type: "tool_use", id: "1", name: "a", input: {} }] },
      ],
    });
    expect(simple.messages[0].content[0].cache_control).toBeUndefined();
    expect(simple.messages[1].content[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("preserve mode keeps the client's markers where the client put them", () => {
    const body = anchorClaudeCache(markedBody(), true);
    expect(body.messages[0].content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.messages[1].content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.tools[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.system[1].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(countCacheControlBlocks(body)).toBe(4);
    // re-anchoring would have moved system/tools to 1h and dropped the client's
    // message markers — assert preserve mode did NOT do that
    expect(body.messages[0].content[0].cache_control.ttl).toBeUndefined();
  });

  it("preserve mode still strips a marker on a deferred tool and caps at 4", () => {
    const body = anchorClaudeCache({
      messages: [
        { role: "user", content: [{ type: "text", text: "a", cache_control: { type: "ephemeral" } }] },
        { role: "user", content: [{ type: "text", text: "b", cache_control: { type: "ephemeral" } }] },
        { role: "user", content: [{ type: "text", text: "c", cache_control: { type: "ephemeral" } }] },
        { role: "user", content: [{ type: "text", text: "d", cache_control: { type: "ephemeral" } }] },
      ],
      tools: [{ name: "mcp__x", description: "t", input_schema: {}, defer_loading: true, cache_control: { type: "ephemeral" } }],
    }, true);
    expect(body.tools[0].cache_control).toBeUndefined();
    expect(countCacheControlBlocks(body)).toBeLessThanOrEqual(4);
  });
});

describe("prepareClaudeRequest — preserve mode (openai → claude translation)", () => {
  it("re-anchors by default: only the head/tail markers ZRouter picks", () => {
    const out = prepareClaudeRequest(markedBody(), "claude");
    expect(countCacheControlBlocks(out)).toBeLessThanOrEqual(4);
    expect(out.system[out.system.length - 1].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(out.messages[0].content[0].cache_control).toBeUndefined();
  });

  it("preserves the client markers when asked, and the 4-marker cap holds", () => {
    const out = prepareClaudeRequest(markedBody(), "claude", null, null, null, null, true);
    expect(out.messages[0].content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(out.tools[0].cache_control).toEqual({ type: "ephemeral" });
    expect(countCacheControlBlocks(out)).toBeLessThanOrEqual(4);
  });

  it("explicit 4-marker budget is never exceeded in either mode", () => {
    const heavy = () => ({
      model: "claude-sonnet-4-6",
      system: Array.from({ length: 3 }, (_, i) => ({ type: "text", text: `s${i}`, cache_control: { type: "ephemeral" } })),
      messages: Array.from({ length: 4 }, (_, i) => ({ role: "user", content: [{ type: "text", text: `m${i}`, cache_control: { type: "ephemeral" } }] })),
    });
    for (const preserve of [false, true]) {
      expect(countCacheControlBlocks(prepareClaudeRequest(heavy(), "claude", null, null, null, null, preserve))).toBeLessThanOrEqual(4);
      expect(countCacheControlBlocks(anchorClaudeCache(heavy(), preserve))).toBeLessThanOrEqual(4);
    }
  });

  it("enforceClaudeCacheBudget is the explicit invariant check", () => {
    const body = { system: [], tools: [], messages: [{ role: "user", content: [{ type: "text", text: "x", cache_control: {} }] }] };
    expect(enforceClaudeCacheBudget(body)).toBe(1);
  });
});

describe("translateRequest — preserveCacheControl is threaded end-to-end", () => {
  const claudeSource = () => ({
    model: "claude-sonnet-4-6",
    system: [{ type: "text", text: "sys", cache_control: { type: "ephemeral", ttl: "1h" } }],
    tools: [{ name: "a", description: "t", input_schema: { type: "object" }, cache_control: { type: "ephemeral" } }],
    messages: [
      { role: "user", content: [{ type: "text", text: "hi", cache_control: { type: "ephemeral" } }] },
      { role: "assistant", content: [{ type: "text", text: "reply", cache_control: { type: "ephemeral" } }] },
    ],
  });

  it("preserve=true keeps the client's own breakpoint offsets through translation", () => {
    // claude -> claude goes through the same prepareClaudeRequest path as the
    // openai->claude translation, which is where markers get rewritten today.
    const out = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, "claude-sonnet-4-6", claudeSource(), true, null, "claude", null, [], null, "claude", true);
    expect(out.messages[0].content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(out.messages[1].content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(out.system[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(countCacheControlBlocks(out)).toBeLessThanOrEqual(4);
  });

  it("preserve=false rewrites them (head anchors at 1h, client message markers dropped)", () => {
    const out = translateRequest(FORMATS.CLAUDE, FORMATS.CLAUDE, "claude-sonnet-4-6", claudeSource(), true, null, "claude", null, [], null, "claude", false);
    expect(out.messages[0].content[0].cache_control).toBeUndefined();
    expect(out.tools[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(out.system[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });
});

describe("OpenAI-format passthrough honors only the providers that accept explicit markers", () => {
  it("explicit-marker providers are listed, automatic-cache ones are not", () => {
    expect(providerHonorsOpenAIFormatCacheControl("alicode")).toBe(true);
    expect(providerHonorsOpenAIFormatCacheControl("xiaomi-mimo")).toBe(true);
    // OpenAI/Codex/Azure auto-cache and reject an explicit cache_control field.
    expect(providerHonorsOpenAIFormatCacheControl("openai")).toBe(false);
    expect(providerHonorsOpenAIFormatCacheControl("codex")).toBe(false);
    expect(providerHonorsOpenAIFormatCacheControl("azure")).toBe(false);
  });

  it("filterToOpenAIFormat keeps markers only when opted in", () => {
    const make = () => ({ messages: [{ role: "user", content: [{ type: "text", text: "x", cache_control: { type: "ephemeral" } }] }] });
    expect(filterToOpenAIFormat(make()).messages[0].content[0].cache_control).toBeUndefined();
    expect(filterToOpenAIFormat(make(), { preserveCacheControl: true }).messages[0].content[0].cache_control).toEqual({ type: "ephemeral" });
  });
});

describe("cache metrics", () => {
  it("sums tokens/cost per provider, tokensSaved == cached, by period", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zrouter-cachemetrics-"));
    const prev = process.env.DATA_DIR;
    process.env.DATA_DIR = dir;
    const { recordCacheOutcome, flushCacheMetrics, getCacheMetrics } = await import("../../src/lib/cacheMetrics.js");
    const { makeKv } = await import("../../src/lib/db/helpers/kvStore.js");
    try {
      await makeKv("cacheMetrics").clear();
      recordCacheOutcome({ provider: "claude", preserved: true, inputTokens: 1000, cachedTokens: 900, cacheCreationTokens: 100, costSaved: 0.00243 });
      recordCacheOutcome({ provider: "claude", preserved: false, inputTokens: 500, cachedTokens: 0, costSaved: 0 });
      recordCacheOutcome({ provider: "deepseek", preserved: true, inputTokens: 200, cachedTokens: 200, costSaved: 0.001 });
      await flushCacheMetrics();

      const m = await getCacheMetrics("24h");
      expect(m.requests).toBe(3);
      expect(m.preservedRequests).toBe(2);
      expect(m.inputTokens).toBe(1700);
      expect(m.cachedTokens).toBe(1100);
      expect(m.tokensSaved).toBe(1100);
      expect(m.cacheCreationTokens).toBe(100);
      expect(m.estimatedCostSaved).toBeCloseTo(0.00343, 10);
      expect(m.byProvider.claude.requests).toBe(2);
      expect(m.byProvider.claude.cachedTokens).toBe(900);
      expect(m.byProvider.deepseek.preservedRequests).toBe(1);
      expect(m.lifetime.tokensSaved).toBe(1100);

      // lifetime period includes every day row
      const all = await getCacheMetrics("all");
      expect(all.tokensSaved).toBe(1100);
    } finally {
      await flushCacheMetrics();
      if (prev === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prev;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
