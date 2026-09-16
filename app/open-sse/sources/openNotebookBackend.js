// Open Notebook backend — REST at http://127.0.0.1:5055 (roadmap item 3).
//
// POST /api/search {"query": q, "type": "vector", "limit": N}
// Results are filtered by the key's authorized notebook IDs BEFORE returning.
// 10s timeout; errors → empty list + structured log without credentials.

const DEFAULT_BASE_URL = "http://127.0.0.1:5055";
const SEARCH_TIMEOUT_MS = 10_000;

function baseUrl() {
  return String(process.env.OPEN_NOTEBOOK_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function password() {
  return process.env.OPEN_NOTEBOOK_PASSWORD || "";
}

// Explicit "all notebooks" marker for a key's open-notebook scope.
// An empty list still means NOTHING is authorized (existing keys keep that meaning);
// "*" is additive and says "no notebook restriction".
export const ALL_NOTEBOOKS = "*";

// → {allowAll, allowed: Set<string>}; empty allowed + !allowAll means "nothing authorized".
function notebookScope(entry) {
  const allowed = new Set((entry?.notebooks || []).map(String));
  const allowAll = allowed.delete(ALL_NOTEBOOKS);
  return { allowAll, allowed };
}

export function isOpenNotebookConfigured() {
  return Boolean(password());
}

async function openNotebookFetch(path, options = {}) {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${password()}`,
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(options.timeoutMs || SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Open Notebook ${path} failed (${response.status})`);
  }
  return response.json();
}

function excerptFrom(result) {
  const matches = Array.isArray(result?.matches) ? result.matches : [];
  return matches.filter((m) => typeof m === "string").join("\n").slice(0, 2000);
}

export async function searchOpenNotebook(query, entry, limit = 10) {
  if (!isOpenNotebookConfigured()) return [];
  const { allowAll, allowed } = notebookScope(entry);
  if (!allowAll && allowed.size === 0) return [];
  const payload = await openNotebookFetch("/api/search", {
    method: "POST",
    body: JSON.stringify({ query, type: "vector", limit: Math.min(100, limit * 4) }),
  });
  const results = Array.isArray(payload?.results) ? payload.results : [];
  // The upstream search is global: authorization filtering happens here, on our side.
  const sources = await Promise.all(results.map(async (result) => {
    const sourceId = result?.id || result?.parent_id;
    if (!sourceId) return null;
    let notebooks = null;
    try {
      const source = await openNotebookFetch(`/api/sources/${encodeURIComponent(sourceId)}`, { timeoutMs: 5000 });
      notebooks = Array.isArray(source?.notebooks) ? source.notebooks : [];
    } catch {
      // Source details unavailable → treat as unscoped and drop it (fail-closed).
      return null;
    }
    if (!allowAll && !notebooks.some((nb) => allowed.has(String(nb)))) return null;
    // Scope order (not upstream order) so the bank stays stable per key.
    const scoped = notebooks.filter((nb) => allowed.has(String(nb)));
    return {
      sourceId: `open-notebook:${sourceId}`,
      title: result.title || "",
      url: "",
      excerpt: excerptFrom(result),
      updatedAt: null,
      bank: scoped[0] || notebooks[0] || "",
      score: typeof result.similarity === "number" ? result.similarity : 0,
    };
  }));
  return sources.filter(Boolean).slice(0, limit);
}

export async function getOpenNotebookSource(sourceId, entry) {
  if (!isOpenNotebookConfigured()) return null;
  const { allowAll, allowed } = notebookScope(entry);
  if (!allowAll && allowed.size === 0) return null;
  let source;
  try {
    source = await openNotebookFetch(`/api/sources/${encodeURIComponent(sourceId)}`);
  } catch {
    return null;
  }
  const notebooks = Array.isArray(source?.notebooks) ? source.notebooks : [];
  if (!allowAll && !notebooks.some((nb) => allowed.has(String(nb)))) return null;
  return {
    sourceId: `open-notebook:${sourceId}`,
    title: source.title || "",
    content: String(source.full_text || ""),
    url: source?.asset?.url || "",
    bank: notebooks[0] || "",
    origin: "open-notebook",
  };
}

// Normalized notebook list for the dashboard picker (and only id/name/description —
// the raw upstream payload must never be forwarded). Cached briefly so opening a
// modal repeatedly does not hammer Open Notebook; fail-open returns [].
const NOTEBOOKS_TTL_MS = 60_000;
let notebookCache = { at: 0, notebooks: null };

export function resetNotebookCache() {
  notebookCache = { at: 0, notebooks: null };
}

export async function listOpenNotebooks({ ttlMs = NOTEBOOKS_TTL_MS } = {}) {
  if (!isOpenNotebookConfigured()) return { notebooks: [], error: "not-configured" };
  const now = Date.now();
  if (notebookCache.notebooks && now - notebookCache.at < ttlMs) {
    return { notebooks: notebookCache.notebooks };
  }
  try {
    const payload = await openNotebookFetch("/api/notebooks", { timeoutMs: 5000 });
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.notebooks) ? payload.notebooks : [];
    const notebooks = rows
      .map((row) => ({
        id: String(row?.id || "").trim(),
        name: String(row?.name || "").trim(),
        description: String(row?.description || "").trim(),
      }))
      .filter((row) => row.id);
    notebookCache = { at: now, notebooks };
    return { notebooks };
  } catch (error) {
    // Fail-open for the dashboard: a short service outage is not a modal crash.
    // Structured log only — the error is an upstream status, never a credential.
    console.warn(JSON.stringify({
      channel: "sources", event: "notebooks-list-failed",
      error: String(error?.message || error).slice(0, 200),
    }));
    return { notebooks: [], error: "unavailable" };
  }
}
