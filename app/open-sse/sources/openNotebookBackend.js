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
  const allowed = new Set((entry.notebooks || []).map(String));
  if (allowed.size === 0) return [];
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
    if (!notebooks.some((nb) => allowed.has(String(nb)))) return null;
    return {
      sourceId: `open-notebook:${sourceId}`,
      title: result.title || "",
      url: "",
      excerpt: excerptFrom(result),
      updatedAt: null,
      bank: notebooks.find((nb) => allowed.has(String(nb))) || "",
      score: typeof result.similarity === "number" ? result.similarity : 0,
    };
  }));
  return sources.filter(Boolean).slice(0, limit);
}

export async function getOpenNotebookSource(sourceId, entry) {
  if (!isOpenNotebookConfigured()) return null;
  const allowed = new Set((entry.notebooks || []).map(String));
  if (allowed.size === 0) return null;
  let source;
  try {
    source = await openNotebookFetch(`/api/sources/${encodeURIComponent(sourceId)}`);
  } catch {
    return null;
  }
  const notebooks = Array.isArray(source?.notebooks) ? source.notebooks : [];
  if (!notebooks.some((nb) => allowed.has(String(nb)))) return null;
  return {
    sourceId: `open-notebook:${sourceId}`,
    title: source.title || "",
    content: String(source.full_text || ""),
    url: source?.asset?.url || "",
    bank: notebooks[0] || "",
    origin: "open-notebook",
  };
}
