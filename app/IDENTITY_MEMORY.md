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

API authentication is mandatory for public inference routes. Internal callers
use an `isService` key. Service keys remain authenticated but do not force a
combo and skip identity, recall and retain — this prevents a recall → router →
recall loop. Service keys are intentionally hidden from the dashboard and cannot
be created there.

Create and edit regular profiles from Dashboard -> Endpoint -> API Keys. The
brain icon opens the assigned bank and allows an explicitly confirmed clear.
