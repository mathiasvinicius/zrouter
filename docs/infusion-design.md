# Infusão OmniRoute → ZRouter — Documento de Design

**Escopo travado. Aprovação do Soberano obtida em 2026-09-14.**

## Princípio

ZRouter = roteador enxuto. O OmniRoute (113 executores, 40+ páginas, gamificação)
é catálogo de ideias, NÃO dependência. Toda infusão é seletiva, testada e
isolada em staging. O 9Router de produção (20128) não muda até cutover
explícito.

## ENTRA (utilidade real comprovada)

| # | Recurso | Origem no OmniRoute | Justificativa |
|---|---|---|---|
| 0 | **Fontes por API key + modal expandido (requisito principal)** | Padrão visual dos modais de `api-manager`/`tokens` do OmniRoute | Cada key liga a fontes PRÓPRIAS, além de soul/bank/mental model: checkboxes de Notion (páginas/databases autorizadas), Open Notebook (notebooks autorizados), Neo4j (banks). Modal de edição de key ganha seção "Fontes de Conhecimento" com toggles, escopos e teste por fonte. O que a key não tem ligado, ela não vê |
| 1 | **Página "Fontes"** (UI) | Design system de `free-tiers`, `health`, `context`, `search-tools` | Página única: Notion, Open Notebook e Neo4j com status, escopo, teste de conexão e permissões. O "visual bonito" pedido |
| 2 | **Stack Notion read-only** | `open-sse/mcp-server/tools/notionTools.ts` + `services/notionTlsClient.ts` + `notionStreamParser.ts` + `executors/notion-web.ts` | Fonte MCP server-side: busca páginas/databases, lê blocos paginado, trata 401/403/429. Sem escrita. Token em storage server-side |
| 3 | **Open Notebook via API** | Nada a portar do OmniRoute — usar API REST existente (`127.0.0.1:5055`) | Contrato de fontes consulta `/api/search` com filtro por notebooks autorizados. Sem SurrealDB, sem UI embutida |
| 4 | **Providers novos (fase 2)** | `executors/novita.ts`… verificar nomes exatos: checar `novita`, `requesty`, `cheaperinference`, `cloudflare-ai`, `bedrock`, `clova` em `open-sse/executors/` | Portar 1 a 1, cada um com teste de geração real com credencial própria. Só entra o que passar |
| 5 | **Transparência de rota** | Padrões de `costs`, `provider-stats`, `usage` | Log de provider efetivo, latência e tokens por request; cards de custo no dashboard |

## FICA FORA (bagunça deliberadamente rejeitada)

- Gamificação, leaderboard, arcade, sponsor banners (Kimi/Vscode), badges
- A2A completo, ACP, cloud-agents, conductor, orchestration, miniapp
- Translator, plugins marketplace, webhooks, relay, resilience/chaos testing
- Electron, fly.toml, nix — empacotamento irrelevante
- Segundo roteador embutido, Open Notebook UI/podcasts/SurrealDB dentro do ZRouter
- Importação em massa dos 113 executores — cada provider novo entra só por demanda, com credencial e teste

## Contrato comum de fontes (fase 1 — primeira entrega)

```
search(query, scope, limit) -> [{sourceId, title, url, excerpt, updatedAt, bank, origin, score}]
get(id) -> {sourceId, title, content, url, bank, origin}
```

- Credenciais no servidor (env/DB), nunca no prompt ou logs
- Busca NÃO chama LLM; só retorna trechos citáveis
- Filtro por notebooks/banks autorizados ANTES de injetar no contexto
- Citação obrigatória por ID/URL; conteúdo marcado como dado, nunca instrução
- Cache com prazo e limite; timeout e dedupe

## Arquitetura

```
Cliente → ZRouter:20129 → [auth por chave] → [contrato de fontes]
                                   ├─ Notion (read-only, MCP/REST)
                                   ├─ Open Notebook API (5055, filtro por notebook)
                                   └─ Neo4j (banks por perfil)
                             → [injeção de contexto opt-in] → provider da combinação
```

## Critérios de aceitação (por item entregue)

1. Adaptador com teste unitário; resposta vazia/erro tratados
2. Busca real com fonte autorizada; prova de que outra chave NÃO vê a fonte
3. Zero credencial em logs; zero documento integral no prompt
4. Chat com contexto e sem contexto, streaming e fallback, sem regressão no 9Router
5. Tokens, latência e provider efetivo medidos e visíveis na UI
6. Build da imagem zrouter:dev verde em staging ANTES de qualquer restart

## Referências

- OmniRoute clonado: `/opt/containers/omniroute-src` (v3.8.51, MIT)
- ZRouter: `/opt/containers/zrouter/app` (código), `:20129` (staging)
- Open Notebook: `http://127.0.0.1:5055` (API), docs em `/opt/containers/open-notebook/docs/`
- Roadmap original: `/opt/containers/zrouter/docs/roadmap.md`