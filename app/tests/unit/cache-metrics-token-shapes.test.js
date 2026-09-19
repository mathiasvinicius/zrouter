import { describe, expect, it } from "vitest";
import { extractCacheTokenCounts } from "../../src/lib/cacheTokenShapes.js";

describe("cache metrics token shapes", () => {
  it("reads OpenAI Responses nested cached tokens", () => {
    expect(extractCacheTokenCounts({
      input_tokens_details: { cached_tokens: 1234, cache_creation_tokens: 56 },
    })).toEqual({ cachedTokens: 1234, cacheCreationTokens: 56 });
  });

  it("reads Chat Completions nested cached tokens", () => {
    expect(extractCacheTokenCounts({
      prompt_tokens_details: { cached_tokens: 789, cache_creation_tokens: 12 },
    })).toEqual({ cachedTokens: 789, cacheCreationTokens: 12 });
  });

  it("keeps direct provider fields authoritative", () => {
    expect(extractCacheTokenCounts({
      cached_tokens: 42,
      cache_read_input_tokens: 40,
      cache_creation_input_tokens: 8,
      input_tokens_details: { cached_tokens: 999, cache_creation_tokens: 999 },
    })).toEqual({ cachedTokens: 42, cacheCreationTokens: 8 });
  });
});
