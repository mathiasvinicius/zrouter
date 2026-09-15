// Discovery URL map + response parsers, extracted from
// src/app/api/providers/[id]/models/route.js (PROVIDER_MODELS_CONFIG).
// Only the URL/parse surface moved here — OAuth refresh flows stay in the
// /models route; discovery uses the connection's stored credential as-is.
import { resolveOllamaLocalHost } from "open-sse/config/providers.js";
import { PROVIDER_MEDIA } from "open-sse/providers/index.js";

export const MODELS_ROUTE_PROVIDERS = new Set([
  "claude", "gemini", "codex", "antigravity", "github", "openai", "openrouter",
  "anthropic", "alicode", "alicode-intl", "alims-intl", "volcengine-ark",
  "byteplus", "deepseek", "groq", "xai", "mistral", "perplexity",
  "perplexity-agent", "together", "fireworks", "cerebras", "cohere", "nebius",
  "siliconflow", "hyperbolic", "ollama", "ollama-local", "nanobanana",
  "chutes", "nvidia", "assemblyai", "vercel-ai-gateway",
  "api-airforce", "kilocode", "opencode", "tokenrouter", "venice",
  "mimo-free",
]);

export const parseOpenAIStyleModels = (data) => {
  if (Array.isArray(data)) return data;
  return data?.data || data?.models || data?.results || [];
};

export const parseAnthropicStyleModels = (data) => {
  if (Array.isArray(data?.models)) return data.models;
  return Array.isArray(data) ? data : [];
};

const openAIConfig = (url, extraHeaders = {}) => ({
  url,
  headers: { "Content-Type": "application/json", ...extraHeaders },
  parseResponse: parseOpenAIStyleModels,
});

const OPENAI_COMPAT_URLS = {
  deepseek: "https://api.deepseek.com/models",
  groq: "https://api.groq.com/openai/v1/models",
  xai: "https://api.x.ai/v1/models",
  mistral: "https://api.mistral.ai/v1/models",
  perplexity: "https://api.perplexity.ai/v1/models",
  "perplexity-agent": "https://api.perplexity.ai/v1/models",
  together: "https://api.together.xyz/v1/models",
  fireworks: "https://api.fireworks.ai/inference/v1/models",
  cerebras: "https://api.cerebras.ai/v1/models",
  cohere: "https://api.cohere.ai/v1/models",
  nebius: "https://api.studio.nebius.ai/v1/models",
  siliconflow: "https://api.siliconflow.com/v1/models",
  hyperbolic: "https://api.hyperbolic.xyz/v1/models",
  ollama: "https://ollama.com/api/tags",
  nanobanana: "https://api.nanobananaapi.ai/v1/models",
  chutes: "https://llm.chutes.ai/v1/models",
  nvidia: "https://integrate.api.nvidia.com/v1/models",
  assemblyai: "https://api.assemblyai.com/v1/models",
  "vercel-ai-gateway": "https://ai-gateway.vercel.sh/v1/models",
  openai: "https://api.openai.com/v1/models",
  openrouter: "https://openrouter.ai/api/v1/models",
};

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export async function resolveDiscoveryConfig(connection) {
  const provider = connection.provider;
  const specific = connection.providerSpecificData || {};
  const apiKey = connection.apiKey || connection.accessToken || null;

  // OpenAI-compatible custom nodes: baseUrl from the node, /models + Bearer key.
  if (provider.startsWith("openai-compatible-")) {
    const baseUrl = specific.baseUrl;
    if (!baseUrl) return { config: null, token: null };
    return {
      config: openAIConfig(`${baseUrl.replace(/\/$/, "")}/models`),
      token: connection.apiKey,
    };
  }

  // Anthropic-compatible custom nodes: same shape as the /models route.
  if (provider.startsWith("anthropic-compatible-")) {
    let baseUrl = specific.baseUrl || "";
    if (!baseUrl) return { config: null, token: null };
    baseUrl = baseUrl.replace(/\/$/, "");
    if (baseUrl.endsWith("/messages")) baseUrl = baseUrl.slice(0, -9);
    return {
      config: {
        url: `${baseUrl}/models`,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": connection.apiKey,
          "anthropic-version": "2023-06-01",
        },
        parseResponse: parseAnthropicStyleModels,
        openaiStyle: false,
      },
      token: connection.apiKey,
    };
  }

  switch (provider) {
    case "claude":
    case "anthropic":
      return {
        config: {
          url: "https://api.anthropic.com/v1/models",
          headers: { "Content-Type": "application/json", "Anthropic-Version": "2023-06-01" },
          parseResponse: parseAnthropicStyleModels,
          openaiStyle: false,
        },
        token: apiKey,
      };
    case "gemini":
      return {
        config: { url: `${GEMINI_URL}?key=${apiKey}`, headers: {}, parseResponse: (d) => d.models || [] },
        token: null,
      };
    case "ollama-local":
      return {
        config: openAIConfig(`${resolveOllamaLocalHost(connection)}/api/tags`),
        token: null,
      };
    default:
      break;
  }

  if (OPENAI_COMPAT_URLS[provider]) {
    return { config: openAIConfig(OPENAI_COMPAT_URLS[provider]), token: apiKey };
  }

  // Registry-declared fetchers (free catalogs): keyless GET, raw list.
  const fetcher = PROVIDER_MEDIA[provider]?.modelsFetcher;
  if (fetcher?.url) {
    return { config: openAIConfig(fetcher.url), token: null };
  }

  return { config: null, token: apiKey };
}
