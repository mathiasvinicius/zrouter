# Histórico de Releases e Aprimoramentos — ZRouter

Este documento consolida a evolução, marcos arquiteturais, aprimoramentos customizados e correções do **ZRouter (Sovereign AI Gateway)** em relação ao upstream (9Router/OmniRoute) e ao ecossistema ITMS Solutions.

---

## v0.5.112-p1 (2026-10-29) — Expurgo de telemetria/phone-home do WebGUI

Auditoria do cron de manutenção identificou três chamadas externas não autorizadas na WebGUI, todas removidas:

- **`GET /api/version` → registry.npmjs.org/zrouter/latest**: o endpoint consultava o npm por um pacote homônimo ("zrouter" 0.0.2) e reportava `hasUpdate: true` falso, além de expor o gateway a um phone-home de terceiros. Agora o endpoint é 100% offline: `currentVersion = latestVersion = pkg.version`, `hasUpdate: false`. Atualizações são decididas localmente pelo pipeline de merge (`bases/` + `upstreams.lock.json`).
- **`DonateModal` → `https://9router.com/api/donate`**: modal de doação do upstream removido junto com o componente (138 linhas), o import, o estado e o botão no `Header`.
- **`ChangelogModal` → raw.githubusercontent.com/decolua/9router/CHANGELOG.md**: fetch externo desativado; o modal agora aponta o `RELEASES.md` local, sem requisição de rede.

Validação pós-deploy: `/api/version` retorna 0.5.112 sem rede; login 200; 14/14 assets `/_next/static` em 200; zero domínios externos e zero iframes no HTML servido; nenhum chunk construído referencia `9router.com`, `registry.npmjs.org` ou `api/donate`.

---

## v0.5.112 (2026-10-29) — ZRouter merge (cron Update-Zrouter)

### Upstream 9router v0.5.112 (tags v0.5.109 → v0.5.112 desde v0.5.104)
- **Smart Router (System One):** combo com session stickiness adaptativa + decision models (clef/clef-flash no Ollama)
- **Novos providers/tiers:** Gemini 4 Argon tiers (alt/medium/low) no Antigravity hub/2.24.0, Kimi K3.1 Pro, Runcrate, Nace Drex, SenseNova, Ollama Local TTS (Phonon), embedding adapter Ollama
- **Novos providers de code:** CommandCode headers 1.88.0, MiniMax Code lease auth (desktop named-pipe broker), Codex GPT-6.1 Terra
- **Fixes críticos:** DeepSeek PoW via noble-hashes, rejeição de SSE em respostas non-streaming, protobuf Gemini (type predicates), NVIDIA NIM reasoning aliases normalizados, bulk-add LLM|id|secret como token opaco, Copilot thinking p/ ids pontilhados (Claude 5.5), combos avançam em 4xx request-scoped, peek de conteúdo em respostas 2xx vazias (empty failover)
- **Dashboard:** Smart Router, busca de combos, AutoPing schedule, WebLogin/MinimaxLease, limites de provider com currency/unit

### Recuperação de perdas do merge v0.5.99→v0.5.104 (latent)
- **executors/cursor.js** tinha ficado na era v0.5.99: recomposto com upstream v0.5.112 (strict-proxy guard fail-closed, empty-turn recovery com runWithRetry + tailOnlyCursorMessages, auto-model resolution, export encodeKvClientMessage) preservando o custom ZRouter de end-of-stream trailer (connectEndStreamError)
- **capabilities.js** idem: restaurados #2690 (OpenCode Free ids: space-bunny/big-pickle/longcat/etc), entradas `nous` Research, patterns Claude com pdf:true; mantidos customs (isGemini4Model predicate Argon/Argo, pattern `*gemini-4*`, glm-5.2 1M)

### Customs ZRouter desta release
- Provider `agy` (registry) apontando para o bridge AGY local (127.0.0.1:20130/v1) com tiers Gemini 4 Argon + Claude 5.5
- antigravity.js: tiers Argon com `upstreamModelId` mapeado; dedupe com o trio upstream; mantidos `gemini-4-argon` e `gemini-4-argo`
- combo.js: peek 2xx/requestScoped do upstream + preservação do 410 fall-through local (47248007)
- chatCore.js: assinatura unida (identityContext/comboThinkingLevel/cacheControlMode + customPrompt) e `upstreamModel` via getModelUpstreamId antes do bloco de combo
- golden-url-header.test.js: sanitização determinística (uuid→<UUID>, versões→<V>/<NODEV>, timezone-offset) — snapshot não depende mais de máquina/versão (divergência local documentada, upstream ainda vermelho em codebuddy)
- combos/page.js: `import Link from "next/link"` (upstream usa <Link> sem importar — quebraria o build Next local)

### Validação
- Suite vendored (vitest): **2145/2418 pass**, 150 falhando — upstream puro roda 2112/2357 (89.6%)
- Regressões do merge zereadas (cursor 15, thinking 1, golden snapshots, react-components, capabilities #2690): 19/19 verdes
- Falhas restantes: 122 herdadas do upstream (inclui combo-credit-fallback "Bad request", test/código inconsistentes no próprio 9router) + 28 conhecidas de divergência de customs (memory-backend, model-auto-sync, model-discover, sources-migration, color-themes, claude-context/empty-thinking, minimax-transport)
- Audit-customs: 227 modificados / 88 adicionados vs base v0.5.112 · markers OK · baseline JSON válido

### OmniRoute v3.8.52
- Re-auditado em 2026-10-29: sem release novo desde 3.8.52 (última tag v3.8.52). Continua selective-port-only, 0 ports (9router v0.5.112 supera os core fixes)

## v0.5.104 (2026-10-20) — ZRouter merge

### Upstream 9router v0.5.104 (38 commits desde v0.5.99)
- **Novos modelos:** Gemini 4 Argon, Claude Sonnet 5.5, Claude Opus 5.5
- **Novos providers:** AWS Bedrock (SSO), ElevenLabs Scribe (STT), MiniMax Code, Nous Research OAuth, Netlify relay proxy pool, System One (Cloudflare AI)
- **CLI:** Hermes audio transcription via 9router, per-profile config, Hermes CLI tools
- **Dashboard:** Model picker regex/negation search, batch select, provider filtering, mobile layout fixes
- **Fixes criticos:** Cursor IDE quota tracking, Codex image token usage, Antigravity IDE 2.22.0, Gemini 4 functionResponse ordering, OpenCode free-tier fixes
- **Quota:** Anchored auto-ping schedule, unified auto-ping mode, Ollama Cloud request volume

### ZRouter Customs preservados
- 224 arquivos customizados intocados (sources, identity memory, capabilities, etc)
- Todos os marcadores criticos verificados
- Docker compose com profiles bundled mantido

### OmniRoute v3.8.52
- Auditado: 1375 commits, 0 ports (9router v0.5.104 supersedes core fixes)

## 📌 Visão Geral das Camadas do ZRouter

O ZRouter opera em uma arquitetura de alta disponibilidade e soberania:
* **Nó Primário Ativo:** VPS Oracle (`100.70.32.52`), responsável pelo atendimento público em `https://zrouter.itms.com.br`.
* **Nó Standby / Failover:** Zenith Server (`100.66.108.56`), mantido sincronizado via watchdog (`zrouter_failover_watchdog.sh`).
* **Memória & Conhecimento:** Grafos no Neo4j, cadernos autorizados no Open Notebook e integração por API Key.
* **Economia de Tokens:** RTK Token Saver (-40% em prompts) e Prompt-Cache Policy.

---

## [v0.5.99] — 2026-10-14
### 🚀 Upstream Merge v0.5.99, Controle de Acesso por Chave, Claude 5.5 & Resiliência

#### 1. Upstream Merge 9Router v0.5.99
- **Controle de Acesso por API Key (`KeyAccessControls`):** Restrição granular por chave (`accessRestricted` / `accessAllow`) com gating automático nos endpoints de inferência `/v1/*`, permitindo limitar chaves a combos ou modelos autorizados sem expor credenciais dos provedores.
- **Suporte a AWS Bedrock & Bedrock-xAI:** Inclusão de executores e credenciais seguras para Amazon Bedrock (`@aws-sdk/credential-providers`, assinatura Sigv4, suporte a STS e sessões SSO).
- **Provedores MiniMax Code:** Integração dos novos provedores `minimax-code` e `minimax-code-global` com OAuth integrado e telemetria de uso.
- **Hermes CLI Multi-Perfil:** Suporte a múltiplos perfis no Hermes Agent (`?profile=...`), com persistência e manipulação isolada de configurações YAML e variáveis `.env`.
- **Relay Netlify Deploy para Proxy Pools:** Novo gerador de proxy pool via Netlify (`netlifyRelay.js`).

#### 2. Preservação Total dos Pilares Soberanos do ZRouter
- **Roteamento Dinâmico TEV1:** Preservação integral do classificador e motor dinâmico TEV1.
- **Identidade e Memória no Neo4j:** Mantido o backend exclusivo Neo4j (`Memory.bank`, injeção de identidade e recall contextual).
- **Fontes de Conhecimento por Chave (`sources`):** Controle per-key mantido para Notion, Open Notebook e Neo4j banks.
- **Flag `enforceCombo`:** Modo flexível vs modo estrito para direcionamento de chamadas a combos designados.
- **Zero Ads / Soberania Visual:** Eliminação completa de links promocionais externos (9Remote/9English).

#### 3. Antigravity & Suporte a Claude 5.5
- Suporte oficial aos identificadores Antigravity Claude 5.5 (`claude-5-5-sonnet`, `claude-5-5-haiku`, etc.) com normalização MITM e sinônimos automáticos.
- Extração de `resetsAtMs` em respostas 429 de erro de cota do Antigravity.
- Sanitização de schemas de ferramentas (`$ref` cleanup) para payloads Gemini e Antigravity.
- Suporte nativo a `x-goog-api-key` e parâmetros de consulta `?key=` na autenticação de rotas `/v1beta/models`.

---

## [v0.5.95] — 2026-10-01
### ✨ Combos Dinâmicos, Upstream v0.5.95 & Expansão de Modelos

#### 1. Roteador de Decisão Dinâmico (TEV1)
- Implementação do algoritmo determinístico em `app/src/sse/services/dynamicRouter.js` (342 linhas).
- Classificação inteligente por tarefa (código, raciocínio complexo, síntese, visão multimodal).
- Fallback automático com preservação de contexto e transição transparente de modelos (ex.: `cx/gpt-5.6-sol`, `ollama/glm-5.3-flash`).

#### 2. Upstream Merge 9Router v0.5.95
- Integração de 340 arquivos upstream (+23.356 / -1.766 linhas).
- **Responses API Watchdog:** timeout de segurança de 3 segundos na finalização da Responses API.
- **Tokens no `response.completed`:** reporte fidedigno de tokens utilizados para fluxos de streaming.
- **Claude & Anthropic:** suporte aprimorado a Claude prefill e prompt-caching nativo.
- **Suporte Grok CLI:** compatibilidade com Grok CLI 1.0.44 e headers atualizados.
- **Sanitização de Schemas:** validação e limpeza prévia de JSON schemas para APIs do Gemini e Antigravity.

#### 3. Novos Provedores & Modelos
- Inclusão dos provedores: `atria`, `muse`, `tinyfish`, `dahl`, `agnes`, `bai`, `tokenharbor`, `v1m`, `opencode-zen`, `qoder-cn`.
- Adição de modelos de nova geração: GPT-6.x, Claude Sonnet 4.6 / Opus 5.5, Gemini 3.8 / 3.7.

#### 4. Catálogo Central de Skills
- Endpoint unificado `GET /v1/skills` expondo índice compacto para todos os agentes autenticados sem duplicação de dados.

#### 5. Correções de Dashboard e UI
- `UsageChart`: definição segura de `cfg` e compatibilização com propriedades de `VIEW_CONFIG`.
- `ApiKeyUsageCard`: importação defensiva em `UsageStats` com guarda contra estatísticas nulas.
- `TokenSaver`: restauração de métricas de cache e relatórios precisos por períodos móveis.

---

## [v0.5.81] — 2026-09-19
### 🔄 Upstream 9Router 0.5.81 & Portes Seletivos do OmniRoute

- **Merge de Base:** consolidação do 9Router 0.5.81 mantendo 216 arquivos modificados sob `CUSTOMS.md`.
- **Portes OmniRoute:**
  - Tratamento de erro explícito em trailers de stream do Cursor (Cursor end-of-stream).
  - Prevenção de travamentos em fluxos de fallback com códigos HTTP 410 (modelos aposentados).
- **Ollama Stream:** aceitação de streams nativos em formato `ndjson`.
- **Topologia de Failover:** scripts de sincronização contínua e replicação de banco de dados (`data.sqlite`) entre Zenith e VPS Oracle.

---

## [Marcos Fundamentais — Entregas 1 a 9] — 2026-09-15 a 2026-09-18
### 🏗️ Customizações Estruturais do ZRouter Soberano

- **Entrega 9 (Fontes & Cadernos):** Seletor de cadernos Open Notebook e fontes Notion por API Key com injeção citável e isolamento de permissões.
- **Entrega 8 (Economia de Cotas):** RTK Token Saver (-40% de tokens), Prompt-Cache Policy e Credential Health Scheduler em background.
- **Entrega 7 (Uso por Chave):** Dashboard de consumo granular por API Key (`/api/usage/history`, `/api/usage/chart`) e rate limits por cliente.
- **Entrega 6 (Rebranding & Soberania):** Desvinculação de telemetrias externas, porta fixa de produção `20128`, identidade visual soberana ITMS.
- **Entrega 4 & 5 (Neo4j Único & Bootstrap):** Grafo centralizado de memórias de longo prazo e entidades do agente (EVE/Zenith) associado por API Key.
- **Entrega 3 (Contexto Automático):** Regras globais de memória, precedência de identidade do agente (`SOUL.md`) sobre a chave padrão.
- **Entrega 1 & 2 (Open-SSE Core):** Tradução universal de formatos OpenAI, Anthropic, Gemini e streaming resiliente.

---

## 🔍 Diagnóstico Recente de Cotas (`/dashboard/quota`) — 2026-10-10

### 1. Ollama Cloud (`9router_key2`)
* **Situação:** Painel exibe *"Ollama Cloud connected. No usage limits reported."*.
* **Causa Identificada:** Conta Pro ativa (`"Plan": "pro"`). A API oficial da Ollama (`/api/usage`) não impõe nem retorna janelas de limite percentual para contas pagas; ela retorna métricas de volumetria (`totals.request_count: 1.310 reqs (7d)`, `115 reqs (hoje)`).
* **Solução:** O gateway pode ler esses contadores de requisições e exibir o card com status `Unlimited` verde e contagem real de chamadas, eliminando a mensagem de ausência de dados.

### 2. Gemini CLI vs Antigravity (`viniciusmathias@gmail.com`)
* **Situação:** Gemini CLI falha na atualização de cota com erro 403.
* **Causa Identificada:** O Google descontinuou o cliente OAuth do Gemini CLI para indivíduos (`UNSUPPORTED_CLIENT #3501`), instruindo migração para o ecossistema Antigravity.
* **Solução Implementada/Recomendada:** A conexão **Antigravity** já está ativa no ZRouter para a mesma conta, monitorando com precisão os modelos Gemini 3.8/3.7 e as cotas de 5h e semanais. O Gemini CLI deve ser tratado como legado.
