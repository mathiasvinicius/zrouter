// Per-source connection status — used by the key modal "Testar conexão" and the
// Fontes page. No credential values ever leave this module; only booleans/latency.

import { isNotionConfigured } from "./notionBackend.js";
import { isOpenNotebookConfigured } from "./openNotebookBackend.js";
import { isNeo4jConfigured } from "./neo4jBackend.js";

// A status probe is a cheap reachability/config check per origin.
async function probeNotion() {
  if (!isNotionConfigured()) return { configured: false, ok: false, status: "not-configured" };
  // Real token exists → a real probe arrives with the Notion integration.
  return { configured: true, ok: true, status: "ok" };
}

async function probeOpenNotebook() {
  if (!isOpenNotebookConfigured()) return { configured: false, ok: false, status: "not-configured" };
  const base = String(process.env.OPEN_NOTEBOOK_URL || "http://127.0.0.1:5055").replace(/\/+$/, "");
  const response = await fetch(`${base}/api/notebooks`, {
    headers: { Authorization: `Bearer ${process.env.OPEN_NOTEBOOK_PASSWORD}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Open Notebook status failed (${response.status})`);
  return { configured: true, ok: true, status: "ok" };
}

async function probeNeo4j() {
  if (!isNeo4jConfigured()) return { configured: false, ok: false, status: "not-configured" };
  const base = String(process.env.NEO4J_HTTP_URL || "http://127.0.0.1:7474").replace(/\/+$/, "");
  const database = encodeURIComponent(process.env.NEO4J_DATABASE || "neo4j");
  const combined = process.env.NEO4J_AUTH || "";
  const separator = combined.indexOf("/");
  const user = process.env.NEO4J_USER || (separator > 0 ? combined.slice(0, separator) : "");
  const password = process.env.NEO4J_PASSWORD || (separator > 0 ? combined.slice(separator + 1) : "");
  const response = await fetch(`${base}/db/${database}/tx/commit`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ statements: [{ statement: "RETURN 1" }] }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Neo4j status failed (${response.status})`);
  return { configured: true, ok: true, status: "ok" };
}

const PROBES = {
  "notion": probeNotion,
  "open-notebook": probeOpenNotebook,
  "neo4j": probeNeo4j,
};

// {notion: {configured, ok, latencyMs, status}, "open-notebook": {...}, neo4j: {...}}
export async function getSourcesStatus() {
  const entries = await Promise.all(Object.entries(PROBES).map(async ([origin, probe]) => {
    const startedAt = Date.now();
    try {
      const result = await probe();
      return [origin, { ...result, latencyMs: Date.now() - startedAt }];
    } catch (error) {
      return [origin, {
        configured: true,
        ok: false,
        status: "error",
        latencyMs: Date.now() - startedAt,
        // Error message only — structured, no credentials.
        error: String(error?.message || error).slice(0, 200),
      }];
    }
  }));
  return Object.fromEntries(entries);
}

// ponytail: [per-key scope preview in status] → skipped: status is server-wide;
// add a per-key variant when a source starts being reachable per key.
