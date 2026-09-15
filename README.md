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

```bash
git clone https://github.com/mathiasvinicius/zrouter.git
cd zrouter

# 1) Configuração
cp .env.example .env      # edite as senhas antes de subir

# 2a) Só o gateway
docker compose up -d

# 2b) Gateway + fontes de conhecimento (Neo4j + Open Notebook + SurrealDB)
docker compose --profile extras up -d
```

O dashboard fica em `http://localhost:20129`. A senha inicial vem de `INITIAL_PASSWORD`
no `.env`.

### Dependências opcionais

As fontes de conhecimento são ativadas por **profiles** do Docker Compose — o que você não
usa, não sobe:

| Fonte | Serviço | Profile | Porta |
|---|---|---|---|
| Memória por bank (Neo4j) | `neo4j` | `extras` | 7474 / 7687 |
| Biblioteca documental (Open Notebook) | `open-notebook` + `surrealdb` | `extras` | 5055 / 8502 |
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
