<div align="center">

# ZRouter — Sovereign AI Gateway

**Self-hosted AI gateway with per-key knowledge sources, smart model routing and 40+ providers.**

Connect Claude Code, Codex, Cursor, Cline, GitHub Copilot and Antigravity through one
OpenAI-compatible endpoint — auto-fallback chains, RTK token saver (-40%), live quota
tracking, and per-key knowledge sources (Open Notebook, Notion, Neo4j) with citations.

</div>

---

## O que é

Um gateway de IA self-hosted, leve e soberano: um único endpoint OpenAI-compatible que
roteia suas ferramentas de código para 40+ provedores com fallback automático, economia de
tokens e isolamento de conhecimento por chave de API.

- **Um endpoint, todas as ferramentas** — Claude Code, Codex, Cursor, Cline, GitHub Copilot,
  Antigravity e qualquer cliente OpenAI-compatible conectam por uma única base URL.
- **40+ provedores e combos** — OpenAI/Anthropic-compatible, Ollama, DeepSeek, GLM, Kimi,
  OpenRouter, NVIDIA NIM, modelos locais; OAuth multi-conta com cadeias de fallback para
  nunca bater no limite de um único provedor.
- **RTK token saver** — até -40% de tokens de entrada, com compressão de saída embutida na rota.
- **Fontes de conhecimento por API key** — vincule notebooks do Open Notebook, páginas do
  Notion (somente leitura) e banks de memória do Neo4j a cada chave. O que a chave não pode
  ver, ela não recebe; com injeção de contexto citável e rastreável à fonte.
- **Inteligência de provedores** — descoberta e importação de modelos via `/models` upstream,
  sincronização automática, cotas em tempo real, saúde e análise de custo por conexão.
- **Model Context Protocol** — 33+ ferramentas MCP prontas (Open Notebook, Notion, busca web, TTS).
- **Soberano por design** — tudo roda no seu hardware: embeddings locais, TTS local, estado em
  SQLite, suas chaves. Sem telemetria que você não pediu.

## Instalação

**Pré-requisitos:** Docker + Docker Compose v2. RAM sugerida: **4 GB** para o
stack completo (gateway + Neo4j + Open Notebook); o gateway sozinho roda em 1 GB.
Em host com ≤4 GB, baixe a memória do Neo4j no `.env` (`NEO4J_HEAP_MAX=512M`,
`NEO4J_HEAP_INITIAL=256M`, `NEO4J_PAGECACHE=512M`).

```bash
git clone https://github.com/mathiasvinicius/zrouter.git
cd zrouter
cp .env.example .env      # TROQUE TODAS AS SENHAS antes de subir
```

### Modo A — stack completo nesta máquina

Sobe o gateway **e** o Neo4j embutido, já otimizado:

```bash
docker compose --profile bundled up -d
```

Abra `http://localhost:20129` e entre com a senha de `INITIAL_PASSWORD`.

### Modo B — usar Neo4j / Open Notebook que já existem

```bash
# no .env: NEO4J_HTTP_URL e OPEN_NOTEBOOK_URL apontando para os seus serviços
docker compose up -d      # sobe só o gateway
```

O `up -d` sem profile sobe **só o gateway**. O profile `bundled` é opt-in porque
as dependências vêm embutidas mas **não obrigatórias** (`depends_on: required: false`):
se o Neo4j estiver fora do ar, o gateway sobe normalmente e o recall de memória
simplesmente não injeta contexto.

### Verificação pós-instalação

```bash
curl http://localhost:20129/api/health/neo4j
```

Resposta esperada em uma instalação saudável — `connected: true`, `missing: []`:

```json
{
  "connected": true,
  "indexes": [{ "name": "mem_bank", "type": "RANGE", "state": "ONLINE", "labelsOrTypes": ["Memory"], "properties": ["bank"] }, "..."],
  "constraints": [{ "name": "mem_id", "type": "UNIQUENESS", "labelsOrTypes": ["Memory"], "properties": ["id"] }, "..."],
  "missing": []
}
```

`connected: false` significa que o gateway não alcançou o Neo4j — confira
`NEO4J_HTTP_URL`, `NEO4J_USER` e `NEO4J_PASSWORD`. Se `missing` listar nomes, o
bootstrap de schema ainda não rodou nesse processo: reinicie o gateway.

### Segurança

- **Troque todas as senhas default** do `.env` (`INITIAL_PASSWORD`, `JWT_SECRET`,
  `API_KEY_SECRET`, `MACHINE_ID_SALT`, `NEO4J_AUTH`/`NEO4J_PASSWORD`,
  `SURREAL_PASSWORD`, `OPEN_NOTEBOOK_ENCRYPTION_KEY`).
- **Não exponha as portas na internet.** Todas as portas do compose fazem bind em
  `127.0.0.1`; para acesso remoto use Tailscale/WireGuard ou outro túnel.
- O Neo4j embutido escuta em `127.0.0.1:7474` / `127.0.0.1:7687`.

### Escopo dos dados

**Nenhum dado do autor é distribuído.** O banco nasce vazio: cada instalação cria
as próprias chaves, banks e memórias. O que **não** nasce vazio é o schema —
índices e constraints (`mem_bank`, `ent_bank`, `mem_id`, `ent_name`, …) são criados
automaticamente no primeiro boot. Sem eles o recall varre o banco inteiro.

### Dependências opcionais

As fontes de conhecimento vêm declaradas no `docker-compose.yml` e são ativadas por
**profiles** do Docker Compose — o que você não usa, não sobe:

O Neo4j é o **único** backend de memória de identidade (o Hindsight foi removido).

| Fonte | Serviço | Profile | Porta |
|---|---|---|---|
| Memória por bank (Neo4j) | `neo4j` | `bundled` | 7474 / 7687 |
| Biblioteca documental (Open Notebook) | `open-notebook` + `surrealdb` | `bundled` | 5055 / 8502 |
| Notion (read-only) | — externo — | — | API pública |

Embeddings locais via Ollama (`bge-m3`) são recomendados para busca semântica no Open
Notebook, mas o gateway funciona sem eles.

## Origens & Créditos

O ZRouter nasce da fusão seletiva de dois projetos open-source que admiramos:

| Projeto | O que herdamos | Licença |
|---|---|---|
| **[9Router](https://github.com/decolua/9router)** — by decolua | Núcleo do gateway: roteamento multi-provider, combos com fallback automático, RTK token saver, dashboard base, sistema de identidade por API key | MIT |
| **[OmniRoute](https://github.com/diegosouzapw/OmniRoute)** | Padrões de UX de providers (descoberta/importação de modelos, sync automático), sistema de temas de cor, padrões de modais do api-manager | MIT |

Tudo o mais foi construído ou adaptado para o ZRouter: o **contrato comum de fontes**
(Open Notebook API, Notion read-only, Neo4j por bank), a **vinculação de fontes por API key**
com modal expandido, a página **Fontes** e o tema visual **ITMS**.

Ambos os projetos originais são MIT — atribuição preservada e merecidamente creditada.

Consultado também: **[Open Notebook](https://github.com/lfnovo/open-notebook)** (MIT), usado
como biblioteca documental externa via API/MCP.

---

**ITMS Solutions** · [github.com/mathiasvinicius](https://github.com/mathiasvinicius)
