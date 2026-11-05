import { execute, statement } from "@/lib/identityMemory/neo4j.js";
import { normalizeMemoryBackend } from "@/lib/identityMemory/profileConfig.js";
import { getApiKeyByValue } from "@/lib/localDb";
import { extractApiKey, isValidApiKey } from "@/sse/services/auth.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { errorResponse } from "open-sse/utils/error.js";

// Identity/memory signal for API keys (ADR 0383, mudança A).
//
// Answers "is memory active for THIS key" so callers (ZAlive, Hermes gateway,
// codex) can detect the memory profile instead of hand-marking it.
//
// Rules:
// - Requires the caller's own API key, same auth path as chat.js.
// - For a key without memory, or a service key, only `{ enabled: false }` is
//   returned — never another key's bank.
// - `live` is a process-wide cached reachability probe of the memory graph
//   (Neo4j HTTP endpoint); failures degrade to `live: false`, never 5xx.
// - Never returns graph URL, username, password, memory text or counts.

export const dynamic = "force-dynamic";

const LIVE_TTL_MS = 60_000;
let liveCache = { at: 0, live: false, latencyMs: 0 };

async function graphLive() {
  const now = Date.now();
  if (now - liveCache.at < LIVE_TTL_MS) return liveCache;
  const t0 = Date.now();
  try {
    await execute([statement("RETURN 1")], 4000);
    liveCache = { at: now, live: true, latencyMs: Date.now() - t0 };
  } catch {
    liveCache = { at: now, live: false, latencyMs: Date.now() - t0 };
  }
  return liveCache;
}

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request) {
  const apiKey = extractApiKey(request);
  if (!apiKey) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
  const profile = await getApiKeyByValue(apiKey);
  if (!profile || !(await isValidApiKey(apiKey))) {
    return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
  }

  if (profile.isService || !profile.memoryEnabled) {
    return Response.json({ object: "memory.status", memory: { enabled: false } }, { headers: NO_STORE });
  }

  const live = await graphLive();
  return Response.json(
    {
      object: "memory.status",
      memory: {
        enabled: true,
        bankId: profile.hindsightBankId || null,
        mentalModelId: profile.mentalModelId || null,
        backend: normalizeMemoryBackend(profile.memoryBackend) || "neo4j",
        live: live.live,
        latencyMs: live.latencyMs,
        injects: {
          soul: Boolean(profile.soul && String(profile.soul).trim()),
          mentalModel: Boolean(profile.mentalModelId),
          recall: true,
          sources: Boolean(profile.sources),
        },
      },
    },
    { headers: NO_STORE },
  );
}

export async function POST() {
  return errorResponse(405, "Method not allowed");
}
