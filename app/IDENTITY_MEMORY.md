# API-key identity and memory

Each regular API key owns one profile:

- one required combo;
- one `SOUL.md` body;
- one memory bank ID (`hindsightBankId` — historical column name, kept as-is);
- one automatically managed mental model, stored in Neo4j;
- memory enabled/disabled.

**Neo4j is the only identity-memory backend.** The Hindsight implementation was
removed: it synthesized and summarized memory through an LLM, which burned
tokens. A key that still carries `memoryBackend: "hindsight"` is coerced to
`neo4j` (one log line, never an error), and migration 004 rewrites those rows in
SQLite.

The requested model is replaced by the key's assigned combo. After Headroom
processing, ZRouter injects the key's SOUL and the recalled Neo4j context into
the provider-native request. The mental model, when the bank has one, is
injected between the SOUL and request-specific recall. A successful request
asynchronously retains the latest user message in the same bank.

Banks and mental models are created on demand with `MERGE ... ON CREATE`, so an
existing bank (`mission`, `background`, `disposition_json`, …) is never
overwritten. Creating a key or changing its bank registers the new bank.

## Neo4j schema bootstrap

A clean Neo4j has no indexes: recall would scan every `Memory` node. On the
first boot the gateway creates the schema it depends on — constraints
`mem_id` (Memory.id) and `ent_name` (Entity.name), plus the indexes
`mem_bank`, `ent_bank`, `mem_fact_type`, `mm_bank` and `bank_id`. All
statements use `IF NOT EXISTS` and none is destructive, so the bootstrap is
idempotent and safe against an existing database; it runs once per process,
off the boot path, and a failure is logged and ignored (recall is fail-open).

`GET /api/health/neo4j` reports `{ connected, indexes, constraints, missing }`
so an operator can confirm the schema landed. A freshly created index fills
in the background (`POPULATING` → `ONLINE`); recall stays correct meanwhile.

API authentication is mandatory for public inference routes. Internal callers
use an `isService` key. Service keys remain authenticated but do not force a
combo and skip identity, recall and retain — this prevents a recall → router →
recall loop. Service keys are intentionally hidden from the dashboard and cannot
be created there.

Create and edit regular profiles from Dashboard -> Endpoint -> API Keys. The
brain icon opens the assigned bank and allows an explicitly confirmed clear.

## Runtime memory signal and caller-side marker (ADR 0383, mudanças A e B)

`GET /v1/memory` (API key auth, same path as chat): answers whether memory is
active for THE CALLER's key. Key with memory: `{object:"memory.status", memory:{enabled, bankId, mentalModelId, backend, live, latencyMs, injects}}`,
with `live` from a 60s cached graph reachability probe (`RETURN 1`, 4s timeout;
graph down degrades to `live:false`, never 5xx). Key without memory or a
service key: `{"memory":{"enabled":false}}` only — never another key's bank.
Never returns graph URL, credentials or memory text; `Cache-Control: private, no-store`.

`<!-- ZALIVE_MEMORY:<bankId> ids=... -->` (bank optional) in the request body
(end of the latest user turn; also accepted in replayed history) tells ZRouter
the caller already injected recall for that bank: ZRouter skips its recall for
the request (mental model, sources and retention are unaffected). The marker
is untrusted input — it only skews the caller's own memory quality.
`userTextWithoutInjectedContext` strips a trailing ZALIVE_MEMORY block so
retention never persists it and recall never queries on it.

Callers should ask `GET /v1/memory` on connect (and periodically, not per
turn): if `enabled && live`, skip injecting lines that exist in `bankId`.
