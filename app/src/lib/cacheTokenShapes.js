/** Normalize cache-token counters returned by Responses, Chat Completions and Anthropic-style APIs. */
export function extractCacheTokenCounts(tokens = {}) {
  return {
    cachedTokens: tokens.cached_tokens
      || tokens.cache_read_input_tokens
      || tokens.input_tokens_details?.cached_tokens
      || tokens.prompt_tokens_details?.cached_tokens
      || 0,
    cacheCreationTokens: tokens.cache_creation_input_tokens
      || tokens.input_tokens_details?.cache_creation_tokens
      || tokens.prompt_tokens_details?.cache_creation_tokens
      || 0,
  };
}
