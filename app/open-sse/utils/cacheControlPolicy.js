/**
 * Cache Control Policy (ported from OmniRoute v3.8.51 cacheControlPolicy.ts)
 *
 * Decides when to PRESERVE a client's own `cache_control` breakpoints instead of
 * rewriting them. Rewriting a caching-aware client's markers produces per-request
 * breakpoint positions that thrash the provider prompt cache: on quota-share
 * combos that showed up as ~200k cache_write tokens per turn. Preserving is never
 * worse — on a stable target the client's breakpoints advance deterministically,
 * on a target switch both approaches miss equally.
 *
 * The 4-marker Anthropic budget is NOT relaxed here: preserved markers still go
 * through capCacheControlBlocks(), and a tool carrying `defer_loading: true` never
 * keeps a marker (Anthropic rejects that combination — #3567).
 *
 * ponytail: no per-connection override bag (OmniRoute's provider_specific_data.cache);
 * add `providerSpecificData.cache.supportsPromptCaching` when a custom node needs it.
 */

import { countCacheControlBlocks, capCacheControlBlocks, lastCacheableToolIndex } from "../translator/formats/claude.js";

export const CACHE_CONTROL_MODES = ["auto", "always", "never"];
export const DEFAULT_CACHE_CONTROL_MODE = "auto";

/** Providers whose prompt cache honors client-supplied breakpoints. */
const CACHING_PROVIDERS = new Set([
  "claude",
  "anthropic",
  "zai",
  "deepseek",
  "kimi",
  "kimi-coding",
  "xiaomi-mimo",
  "xiaomi-tokenplan",
  "alibaba",
  "alicode",
  "alicode-intl",
  "alims-intl",
  "alitp-intl",
  "glm",
  "glm-cn",
  // Automatic prefix caching upstream (no explicit markers needed, but the
  // cacheable prefix must not be rewritten either).
  "openai",
  "codex",
  "azure",
]);

/** Normalize an unknown settings value to a valid mode. */
export function normalizeCacheControlMode(mode) {
  return CACHE_CONTROL_MODES.includes(mode) ? mode : DEFAULT_CACHE_CONTROL_MODE;
}

/**
 * Is the client a caching-aware one (Claude Code / its SDK) that ships its own
 * breakpoints? `clientTool === "claude"` is the in-fork equivalent of OmniRoute's
 * user-agent sniffing (detectClientTool already parses the same UAs).
 */
export function isCacheAwareClient({ userAgent, clientTool } = {}) {
  if (clientTool === "claude") return true;
  const ua = (userAgent || "").toLowerCase();
  if (!ua) return false;
  return ua.includes("claude-code")
    || ua.includes("claude_code")
    || ua.includes("claude-cli/")
    || ua.includes("sdk-cli")
    || (ua.includes("anthropic") && ua.includes("cli"));
}

/** Provider supports prompt caching (explicit list, or any Claude-protocol target). */
export function providerSupportsCaching(provider, targetFormat) {
  if (targetFormat === "claude") return true;
  if (!provider) return false;
  return CACHING_PROVIDERS.has(String(provider).toLowerCase());
}

/**
 * Should the client's cache_control markers be preserved?
 * always → yes; never → no; auto → cache-aware client + caching-capable provider.
 */
export function shouldPreserveCacheControl({ mode, userAgent, clientTool, targetProvider, targetFormat } = {}) {
  const resolved = normalizeCacheControlMode(mode);
  if (resolved === "always") return true;
  if (resolved === "never") return false;
  if (!isCacheAwareClient({ userAgent, clientTool })) return false;
  return providerSupportsCaching(targetProvider, targetFormat);
}

/**
 * Providers that honor EXPLICIT cache_control markers carried inside an
 * OpenAI-format body. Strict subset: `openai`/`codex`/`azure` use AUTOMATIC prefix
 * caching and reject an explicit cache_control field, so markers must still be
 * stripped for them even in preserve mode. Claude-format providers re-anchor or
 * preserve through prepareClaudeRequest and are not listed here.
 */
const OPENAI_FORMAT_CACHE_CONTROL_PROVIDERS = new Set([
  "alibaba", "alicode", "alicode-intl", "alims-intl", "alitp-intl",
  "xiaomi-mimo", "xiaomi-tokenplan",
]);

export function providerHonorsOpenAIFormatCacheControl(provider) {
  return !!provider && OPENAI_FORMAT_CACHE_CONTROL_PROVIDERS.has(String(provider).toLowerCase());
}

/**
 * Preserve the client's markers on a Claude-format body while holding the
 * invariants Anthropic enforces: no marker on a deferred tool, at most 4 markers.
 * Returns the number of markers kept.
 */
export function enforceClaudeCacheBudget(body) {
  if (!body || typeof body !== "object") return 0;
  if (Array.isArray(body.tools)) {
    for (const t of body.tools) {
      if (t?.defer_loading === true) delete t.cache_control;
    }
  }
  if (countCacheControlBlocks(body) > 4) capCacheControlBlocks(body);
  return countCacheControlBlocks(body);
}

export { countCacheControlBlocks, lastCacheableToolIndex };
