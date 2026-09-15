---
name: zrouter-web-fetch
description: Use para ler uma URL como texto ou markdown pelo endpoint /v1/web/fetch do ZRouter quando um provedor de fetch estiver disponível.
---

# ZRouter — Web Fetch

Leia a [skill de entrada](../zrouter/SKILL.md) para endereço e autenticação. Descubra o provedor antes de usar um exemplo abaixo.

## Discover

```bash
curl $ZROUTER_URL/v1/models/web | jq '.data[] | select(.kind=="webFetch") | .id'
# Per-provider params
curl "$ZROUTER_URL/v1/models/info?id=firecrawl/fetch"
```

IDs end in `/fetch` (e.g. `firecrawl/fetch`, `jina/fetch`). `fetch-combo` chains providers with auto-fallback.

## Endpoint

`POST $ZROUTER_URL/v1/web/fetch`

| Field | Required | Notes |
|---|---|---|
| `model` (or `provider`) | yes | from `/v1/models/web` (e.g. `firecrawl` or `jina-reader`) |
| `url` | yes | URL to extract |
| `format` | no | `markdown` (default) / `text` / `html` |
| `max_characters` | no | truncate output |

## Examples

### Jina Reader
```bash
curl -X POST $ZROUTER_URL/v1/web/fetch \
  -H "Authorization: Bearer $ZROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"jina-reader","url":"https://example.com","format":"markdown"}'
```

### Exa
```bash
curl -X POST $ZROUTER_URL/v1/web/fetch \
  -H "Authorization: Bearer $ZROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"exa","url":"https://example.com","format":"markdown","max_characters":0}'
```

### Firecrawl
```bash
curl -X POST $ZROUTER_URL/v1/web/fetch \
  -H "Authorization: Bearer $ZROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"firecrawl","url":"https://example.com","format":"markdown","max_characters":0}'
```

### Tavily
```bash
curl -X POST $ZROUTER_URL/v1/web/fetch \
  -H "Authorization: Bearer $ZROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"tavily","url":"https://example.com","format":"markdown","max_characters":0}'
```

### Ollama Cloud

Uses the API key from the existing `ollama` connection.

```bash
curl -X POST $ZROUTER_URL/v1/web/fetch \
  -H "Authorization: Bearer $ZROUTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"ollama","url":"https://example.com","format":"markdown"}'
```


JS:

```js
const r = await fetch(`${process.env.ZROUTER_URL}/v1/web/fetch`, {
  method: "POST",
  headers: { "Authorization": `Bearer ${process.env.ZROUTER_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "fetch-combo", url: "https://example.com", format: "markdown", max_characters: 5000 }),
});
const { data } = await r.json();
console.log(data.title, data.content.length);
```

## Response shape

```json
{
  "provider": "jina-reader",
  "url": "...",
  "title": "...",
  "content": { "format": "markdown", "text": "...", "length": 1234 },
  "links": ["https://example.com/related"],
  "metadata": { "author": null, "published_at": null, "language": null },
  "usage": { "fetch_cost_usd": 0 },
  "metrics": { "response_time_ms": 850, "upstream_latency_ms": 700 }
}
```

`links` is included when the upstream provider returns discovered page links (currently Ollama Cloud).

## Provider quirks

| Provider | Auth | Best for |
|---|---|---|
| `firecrawl` | Bearer | JS-rendered pages, `format=markdown/html` |
| `jina-reader` | Bearer (optional) | Free tier (~1M chars/mo); fastest plain markdown |
| `tavily` | Bearer | Bulk extract; returns `raw_content` |
| `exa` | `x-api-key` | Pre-indexed pages; fast text extraction |
| `ollama` | Bearer | Markdown plus page title and discovered links; uses the Ollama Cloud key |
