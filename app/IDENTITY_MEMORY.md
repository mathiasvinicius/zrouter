# API-key identity and memory

Each regular API key owns one profile:

- one required combo;
- one `SOUL.md` body;
- one Hindsight bank ID;
- one automatically managed Hindsight mental model;
- memory enabled/disabled.

The requested model is replaced by the key's assigned combo. After Headroom
processing, 9Router injects the key's SOUL and recalled Hindsight context into
the provider-native request. The synthesized mental model is injected between
the SOUL and request-specific recall. A successful request asynchronously
retains the latest user message in the same bank.

Mental models are created automatically in delta mode and refreshed every 15
minutes when Hindsight marks them stale. They are not manually editable from the 9Router
dashboard; source memories remain the authority.

API authentication is mandatory for public inference routes. Internal callers
such as Hindsight use an `isService` key. Service keys remain authenticated but
do not force a combo, inject identity, recall, or retain memory; this prevents a
Hindsight -> 9Router -> Hindsight loop. Service keys are intentionally hidden
from the dashboard and cannot be created there.

The production deployment uses `/opt/zion-router/data` and port 20131,
leaving the production deployment untouched. Its Hindsight service credential
is stored outside Git under:

`/opt/zion-router/data/service/hindsight-api-key`

When staging is promoted, configure Hindsight with:

- `HINDSIGHT_API_LLM_BASE_URL=http://127.0.0.1:20131/v1`
- `HINDSIGHT_API_LLM_API_KEY=<contents of hindsight-api-key>`

Create and edit regular profiles from Dashboard -> Endpoint -> API Keys. The
brain icon opens the assigned bank and allows an explicitly confirmed clear.

After promotion, disable Hermes' own memory integration
(`memory.memory_enabled: false`) so each conversation is retained only once by
9Router.
