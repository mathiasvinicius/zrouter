// Read-only Notion source. Search is deliberately narrow: only pages shared
// with the integration and explicitly authorized by the API key are read.

const NOTION_BASE_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";
const REQUEST_TIMEOUT_MS = 5000;
const ALL = "*";

export function isNotionConfigured() {
  return Boolean(process.env.NOTION_TOKEN);
}

export async function probeNotionConnection() {
  if (!isNotionConfigured()) return false;
  await notionFetch("/users/me");
  return true;
}

function requestSignal(signal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function notionFetch(path, options = {}) {
  const response = await fetch(`${NOTION_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
      ...(options.headers || {}),
    },
    signal: requestSignal(options.signal),
  });
  if (!response.ok) throw new Error(`Notion ${path} failed (${response.status})`);
  return response.json();
}

const ids = (value) => new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean));

function scopeFor(entry) {
  const pages = ids(entry?.pages);
  const databases = ids(entry?.databases);
  const allowAll = pages.delete(ALL) || databases.delete(ALL);
  return { pages, databases, allowAll };
}

const parentDatabase = (page) => String(page?.parent?.database_id || page?.parent?.data_source_id || "");
const authorized = (page, scope) => scope.allowAll
  || scope.pages.has(String(page?.id || ""))
  || scope.databases.has(parentDatabase(page));
const richText = (value) => (Array.isArray(value) ? value : [])
  .map((item) => item?.plain_text || "").join("");

function pageTitle(page) {
  for (const property of Object.values(page?.properties || {})) {
    if (property?.type === "title") return richText(property.title);
  }
  return "Notion page";
}

function blockText(block) {
  const value = block?.[block?.type];
  return value ? richText(value.rich_text || value.caption) : "";
}

async function pageContent(pageId, signal) {
  const payload = await notionFetch(`/blocks/${encodeURIComponent(pageId)}/children?page_size=100`, { signal });
  return (payload?.results || []).map(blockText).filter(Boolean).join("\n").slice(0, 8000);
}

function relevance(query, title, content) {
  const terms = String(query).toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length > 2);
  const haystack = `${title}\n${content}`.toLowerCase();
  if (terms.length === 0) return 0.1;
  return terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0) / terms.length;
}

export async function searchNotion(query, entry, limit = 10, options = {}) {
  if (!isNotionConfigured()) return [];
  const scope = scopeFor(entry);
  if (!scope.allowAll && scope.pages.size === 0 && scope.databases.size === 0) return [];
  const payload = await notionFetch("/search", {
    method: "POST",
    body: JSON.stringify({
      query: String(query).slice(0, 100),
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: Math.min(100, Math.max(limit * 3, 10)),
    }),
    signal: options.signal,
  });
  const pages = (payload?.results || []).filter((page) => page?.object === "page" && authorized(page, scope));
  const results = await Promise.all(pages.slice(0, limit).map(async (page) => {
    const content = await pageContent(page.id, options.signal);
    const title = pageTitle(page);
    return {
      sourceId: `notion:${page.id}`,
      title,
      url: page.url || "",
      excerpt: content.slice(0, 2000),
      updatedAt: page.last_edited_time || null,
      bank: parentDatabase(page),
      score: relevance(query, title, content),
    };
  }));
  return results.filter((item) => item.excerpt).sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function getNotionSource(pageId, entry, options = {}) {
  if (!isNotionConfigured()) return null;
  const scope = scopeFor(entry);
  if (!scope.allowAll && scope.pages.size === 0 && scope.databases.size === 0) return null;
  const page = await notionFetch(`/pages/${encodeURIComponent(pageId)}`, { signal: options.signal });
  if (!authorized(page, scope)) return null;
  return {
    sourceId: `notion:${page.id}`,
    title: pageTitle(page),
    content: await pageContent(page.id, options.signal),
    url: page.url || "",
    bank: parentDatabase(page),
    origin: "notion",
  };
}
