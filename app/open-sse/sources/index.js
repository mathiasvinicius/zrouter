// Common sources contract — Entrega 1 (infusion-design.md item 0).
//
// searchSources(apiKeyRow, query, scope, limit) → [{sourceId, title, url, excerpt,
// updatedAt, bank, origin, score}]
// getSource(apiKeyRow, id) → {sourceId, title, content, url, bank, origin} | null
//
// Per-key permissions live in apiKeys.sources (JSON TEXT):
//   {"notion": {"enabled": bool, "pages": [...], "databases": [...]},
//    "open-notebook": {"enabled": bool, "notebooks": [...]},
//    "neo4j": {"enabled": bool, "banks": [...]}}
//
// Rules enforced here, not in the backends:
//   - a key only queries sources it has enabled
//   - out-of-scope notebooks/banks are never returned
//   - explicitly requesting an unauthorized scope is a SourcePermissionError (→ 403)
//
// Search never calls an LLM — it only returns citable snippets.

import { searchOpenNotebook, getOpenNotebookSource } from "./openNotebookBackend.js";
import { searchNeo4j, getNeo4jSource } from "./neo4jBackend.js";
import { searchNotion, getNotionSource } from "./notionBackend.js";

export const SOURCE_ORIGINS = ["notion", "open-notebook", "neo4j"];

export class SourcePermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = "SourcePermissionError";
  }
}

// apiKeys.sources may be an object, a JSON string, or absent (legacy rows = "{}").
export function parseSourcesConfig(raw) {
  const value = typeof raw === "string" ? safeParse(raw) : raw;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function sourceEntry(config, origin) {
  const entry = config?.[origin];
  if (!entry || typeof entry !== "object") return { enabled: false };
  return {
    enabled: entry.enabled === true,
    ...entry,
  };
}

function stringList(value) {
  return Array.isArray(value) ? value.map((v) => String(v)).filter(Boolean) : [];
}

export function isSourceEnabled(apiKeyRow, origin) {
  return sourceEntry(parseSourcesConfig(apiKeyRow?.sources), origin).enabled === true;
}

// Explicit scope requested by the caller: {origin, notebooks?, banks?, pages?, databases?}
// Unlisted origins → only those the key has enabled. Unknown origin → 403.
export function resolveRequestedOrigins(apiKeyRow, scope) {
  if (!scope) return SOURCE_ORIGINS.filter((origin) => isSourceEnabled(apiKeyRow, origin));
  const wanted = Array.isArray(scope) ? scope : String(scope).split(",");
  const normalized = [...new Set(wanted.map((origin) => String(origin).trim()).filter(Boolean))];
  const invalid = normalized.filter((origin) => !SOURCE_ORIGINS.includes(origin));
  if (invalid.length > 0) {
    throw new SourcePermissionError(`Unknown source origin: ${invalid.join(", ")}`);
  }
  if (normalized.length === 0) {
    return SOURCE_ORIGINS.filter((origin) => isSourceEnabled(apiKeyRow, origin));
  }
  // Explicit request for a disabled origin is a permission error, not silence.
  const unauthorized = normalized.filter((origin) => !isSourceEnabled(apiKeyRow, origin));
  if (unauthorized.length > 0) {
    throw new SourcePermissionError(`API key is not authorized for source: ${unauthorized.join(", ")}`);
  }
  return normalized;
}

const BACKENDS = {
  "notion": { search: searchNotion, get: getNotionSource },
  "open-notebook": { search: searchOpenNotebook, get: getOpenNotebookSource },
  "neo4j": { search: searchNeo4j, get: getNeo4jSource },
};

function normalizeResult(origin, item) {
  return {
    sourceId: item.sourceId,
    title: item.title,
    url: item.url || "",
    excerpt: item.excerpt || "",
    updatedAt: item.updatedAt || null,
    bank: item.bank || "",
    origin,
    score: typeof item.score === "number" ? item.score : 0,
  };
}

function dedupeBySourceId(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.origin}:${item.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchSources(apiKeyRow, query, scope, limit = 10) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const config = parseSourcesConfig(apiKeyRow?.sources);
  const origins = resolveRequestedOrigins(apiKeyRow, scope);
  const searchables = Array.isArray(query) ? query.join(" ") : String(query || "").trim();
  if (!searchables) return [];

  const searches = origins.map(async (origin) => {
    const entry = sourceEntry(config, origin);
    try {
      const results = await BACKENDS[origin].search(searchables, entry, safeLimit);
      return (Array.isArray(results) ? results : []).map((item) => normalizeResult(origin, item));
    } catch (error) {
      // Fail-open per backend: one broken source never kills the whole search.
      // Structured log only — no credential, no query payload beyond a short tag.
      console.warn(JSON.stringify({
        channel: "sources", event: "search-failed", origin,
        error: String(error?.message || error).slice(0, 200),
      }));
      return [];
    }
  });

  const grouped = await Promise.all(searches);
  return dedupeBySourceId(grouped.flat())
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, safeLimit);
}

export async function getSource(apiKeyRow, id) {
  if (!id || typeof id !== "string") return null;
  const sep = id.indexOf(":");
  if (sep <= 0) return null;
  const origin = id.slice(0, sep);
  const entry = sourceEntry(parseSourcesConfig(apiKeyRow?.sources), origin);
  if (!entry.enabled) return null;
  const backend = BACKENDS[origin];
  if (!backend) return null;
  try {
    return await backend.get(id.slice(sep + 1), entry);
  } catch (error) {
    console.warn(JSON.stringify({
      channel: "sources", event: "get-failed", origin,
      error: String(error?.message || error).slice(0, 200),
    }));
    return null;
  }
}
