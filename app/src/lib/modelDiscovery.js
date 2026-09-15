// Shared provider model discovery: resolves the /models URL for a connection
// from the app's own discovery map (src/app/api/providers/[id]/models/route.js
// PROVIDER_MODELS_CONFIG) plus the registry modelsFetcher for free providers,
// fetches it with the connection's credential, normalizes to [{id, name}].
// Credentials are never included in error strings.
import {
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
} from "@/shared/constants/providers";
import { getModelsByProviderId } from "open-sse/config/providerModels.js";
import { PROVIDER_MEDIA } from "open-sse/providers/index.js";
import {
  parseOpenAIStyleModels,
  parseAnthropicStyleModels,
  resolveDiscoveryConfig,
  MODELS_ROUTE_PROVIDERS,
} from "@/shared/utils/providerDiscoveryConfig.js";

const TIMEOUT_MS = 10000;

const staticProviderModels = (providerId) =>
  getModelsByProviderId(providerId)
    .map((m) => ({ id: m.id, name: m.name || m.id, upstreamModelId: m.upstreamModelId || m.id }));

const registryModelsFetcher = (providerId) => PROVIDER_MEDIA[providerId]?.modelsFetcher || null;

// Normalizes a raw parsed entry to {id, name}. Returns null to drop the entry.
function normalizeEntry(entry) {
  if (typeof entry === "string") return { id: entry, name: entry };
  const id = entry?.id || entry?.model || entry?.name || entry?.slug;
  if (!id || typeof id !== "string") return null;
  if ((entry?.type || "llm") === "image" || id.toLowerCase().includes("embed")) return null;
  return { id, name: entry?.display_name || entry?.displayName || entry?.name || id };
}

function normalizeList(raw) {
  return (Array.isArray(raw) ? raw : (raw ? [raw] : []))
    .map(normalizeEntry)
    .filter(Boolean);
}

export function dedupeModels(list) {
  const seen = new Set();
  const out = [];
  for (const m of list) {
    if (!m?.id || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push({ id: m.id, name: m.name || m.id });
  }
  return out;
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    throw Object.assign(new Error(`Upstream ${url.replace(/\?.*$/, "")} returned ${response.status}`), { status: 502 });
  }
  return response.json();
}

export async function discoverProviderModels(connection) {
  const provider = connection.provider;
  const specific = connection.providerSpecificData || {};
  const { config, token } = await resolveDiscoveryConfig(connection);

  if (!config) {
    if (isOpenAICompatibleProvider(provider) || isAnthropicCompatibleProvider(provider) || MODELS_ROUTE_PROVIDERS.has(provider)) {
      return { models: dedupeModels(staticProviderModels(provider)) };
    }
    return { models: [], error: "Provider does not support model discovery" };
  }

  if (!token) {
    return { models: [], error: "Connection has no credential for model discovery" };
  }

  try {
    const data = await fetchJson(config.url, config.headers);
    const raw = config.parseResponse ? config.parseResponse(data) : parseOpenAIStyleModels(data);
    const list = config.openaiStyle === false ? parseAnthropicStyleModels(raw) : raw;
    const models = dedupeModels(normalizeList(list));
    if (models.length === 0) {
      return { models: dedupeModels(staticProviderModels(provider)) };
    }
    return { models };
  } catch (error) {
    const message = error.message || "Discovery failed";
    // ponytail: URL-only error message (status + host) — add per-provider
    // parse hints when a provider needs them. Never include the credential.
    console.log(`[modelDiscovery] ${provider} upstream error: ${message}`);
    return { models: [], error: "Upstream model discovery failed" };
  }
}
