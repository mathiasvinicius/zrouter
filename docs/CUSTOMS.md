# CUSTOMS — o que o ZRouter mudou em relação ao upstream

> **Gerado automaticamente** por `scripts/update/audit-customs.mjs` em 2026-09-15 19:27:33.
> Base: `zrouter-base-v0.5.75` (raiz do upstream 9Router) · comparada contra `app/` · HEAD `54e3a527`
>
> **Não edite à mão.** Este documento é a memória do fork: a pipeline
> (`docs/UPDATE-PIPELINE.md`) o consulta ao resolver conflitos de merge.
> Regenere com `node scripts/update/audit-customs.mjs --base <tag>`.

## Resumo

- **Modificados** (existem no upstream): **78** — onde um merge disputa conteúdo
- **Adicionados** (só nossos): 62
- **Removidos** (no upstream, não em nós): 2

O risco de um update mora nos **modificados**. Adicionados e removidos normalmente
resolvem sozinhos.

## Modificados (78) — pontos de acoplamento

### `src/lib` (11)

- `src/lib/db/driver.js` — +4/-0
- `src/lib/db/index.js` — +20/-4
- `src/lib/db/migrate.js` — +8/-2
- `src/lib/db/migrations/index.js` — +4/-1
- `src/lib/db/repos/aliasRepo.js` — +6/-3
- `src/lib/db/repos/apiKeysRepo.js` — +68/-5
- `src/lib/db/repos/settingsRepo.js` — +22/-0
- `src/lib/db/schema.js` — +16/-2
- `src/lib/localDb.js` — +1/-1
- `src/lib/oauth/constants/oauth.js` — +13/-0
- `src/lib/oauth/utils/server.js` — +102/-0

### `open-sse/providers` (7)

- `open-sse/providers/capabilities.js` — +2/-1
- `open-sse/providers/registry/antigravity.js` — +0/-2
- `open-sse/providers/registry/fireworks.js` — +1/-0
- `open-sse/providers/registry/gemini-cli.js` — +0/-2
- `open-sse/providers/registry/gemini.js` — +0/-2
- `open-sse/providers/registry/xiaomi-mimo.js` — +29/-1
- `open-sse/providers/shared.js` — +10/-6

### `src/app/api` (7)

- `src/app/api/cli-tools/claude-settings/route.js` — +8/-7
- `src/app/api/keys/[id]/route.js` — +37/-4
- `src/app/api/keys/route.js` — +35/-4
- `src/app/api/models/route.js` — +3/-0
- `src/app/api/oauth/[provider]/[action]/route.js` — +77/-2
- `src/app/api/settings/route.js` — +14/-5
- `src/app/api/v1/models/route.js` — +42/-0

### `src/shared` (7)

- `src/shared/components/ModelSelectModal.js` — +1/-1
- `src/shared/components/Sidebar.js` — +11/-25
- `src/shared/components/ThemeToggle.js` — +58/-15
- `src/shared/components/index.js` — +1/-1
- `src/shared/constants/config.js` — +1/-1
- `src/shared/constants/skills.js` — +21/-20
- `src/shared/hooks/useModelCaps.js` — +10/-4

### `public/i18n` (6)

- `public/i18n/literals/fa.json` — +0/-2
- `public/i18n/literals/id.json` — +0/-2
- `public/i18n/literals/km.json` — +0/-2
- `public/i18n/literals/pt-BR.json` — +0/-3
- `public/i18n/literals/th.json` — +0/-2
- `public/i18n/literals/zh-CN.json` — +0/-2

### `src/app/(dashboard)` (5)

- `src/app/(dashboard)/dashboard/cli-tools/components/ClaudeToolCard.js` — +48/-16
- `src/app/(dashboard)/dashboard/combos/page.js` — +37/-5
- `src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js` — +226/-24
- `src/app/(dashboard)/dashboard/providers/[id]/page.js` — +12/-1
- `src/app/(dashboard)/dashboard/skills/page.js` — +12/-11

### `src/app/landing` (3)

- `src/app/landing/components/Footer.js` — +1/-1
- `src/app/landing/components/GetStarted.js` — +2/-2
- `src/app/landing/components/Navigation.js` — +1/-1

### `tests/unit` (3)

- `tests/unit/antigravity-oauth-client.test.js` — +45/-27
- `tests/unit/codex-native-passthrough-thinking.test.js` — +8/-1
- `tests/unit/db-sqlite-vs-lowdb.test.js` — +3/-2

### `public/icons` (2)

- `public/icons/icon-192.svg` — +9/-2
- `public/icons/icon-512.svg` — +9/-2

### `.env.example` (1)

- `.env.example` — +53/-1

### `.gitignore` (1)

- `.gitignore` — +16/-0

### `Dockerfile` (1)

- `Dockerfile` — +1/-2

### `README.md` (1)

- `README.md` — +20/-9

### `open-sse/executors` (1)

- `open-sse/executors/index.js` — +3/-0

### `open-sse/handlers` (1)

- `open-sse/handlers/chatCore.js` — +24/-7

### `open-sse/services` (1)

- `open-sse/services/usage.js` — +2/-0

### `open-sse/translator` (1)

- `open-sse/translator/concerns/paramSupport.js` — +3/-0

### `public` (1)

- `public/favicon.svg` — +11/-9

### `skills/9router` (1)

- `skills/9router/SKILL.md` — +32/-38

### `skills/9router-chat` (1)

- `skills/9router-chat/SKILL.md` — +21/-40

### `skills/9router-embeddings` (1)

- `skills/9router-embeddings/SKILL.md` — +2/-2

### `skills/9router-image` (1)

- `skills/9router-image/SKILL.md` — +2/-2

### `skills/9router-stt` (1)

- `skills/9router-stt/SKILL.md` — +2/-2

### `skills/9router-tts` (1)

- `skills/9router-tts/SKILL.md` — +2/-2

### `skills/9router-video` (1)

- `skills/9router-video/SKILL.md` — +2/-2

### `skills/9router-web-fetch` (1)

- `skills/9router-web-fetch/SKILL.md` — +2/-2

### `skills/9router-web-search` (1)

- `skills/9router-web-search/SKILL.md` — +2/-2

### `skills` (1)

- `skills/README.md` — +22/-29

### `src/app/globals.css` (1)

- `src/app/globals.css` — +35/-35

### `src/app/layout.js` (1)

- `src/app/layout.js` — +5/-3

### `src/app/login` (1)

- `src/app/login/page.js` — +1/-1

### `src/app/manifest.js` (1)

- `src/app/manifest.js` — +2/-2

### `src` (1)

- `src/dashboardGuard.js` — +1/-1

### `src/sse` (1)

- `src/sse/handlers/chat.js` — +67/-18

### `src/store` (1)

- `src/store/themeStore.js` — +24/-1

### `tests/__baseline__` (1)

- `tests/__baseline__/providers-baseline.json` — +0/-15

## Adicionados (62) — arquivos nossos

### `tests/unit` (20)

- `tests/unit/api-key-profile-options.test.js`
- `tests/unit/capabilities-block.test.js`
- `tests/unit/color-themes.test.js`
- `tests/unit/ensure-bank-neo4j.test.js`
- `tests/unit/identity-memory-backend-selection.test.js`
- `tests/unit/memory-backend-migration.test.js`
- `tests/unit/model-auto-sync.test.js`
- `tests/unit/model-caps-audio-filter.test.js`
- `tests/unit/model-discover-endpoint.test.js`
- `tests/unit/neo4j-trivial-memory.test.js`
- `tests/unit/react-hook-imports.test.js`
- `tests/unit/sources-contract.test.js`
- `tests/unit/sources-injection.test.js`
- `tests/unit/sources-migration.test.js`
- `tests/unit/sources-opennotebook-real.test.js`
- `tests/unit/sources-recall-timeout.test.js`
- `tests/unit/sources-status.test.js`
- `tests/unit/xiaomi-mimo-executor.test.js`
- `tests/unit/xiaomi-mimo-oauth-proxy.test.js`
- `tests/unit/xiaomi-mimo-oauth-session.test.js`

### `src/lib` (13)

- `src/lib/colorThemes.js`
- `src/lib/db/migrations/002-api-key-sources.js`
- `src/lib/db/migrations/003-custom-model-source.js`
- `src/lib/db/migrations/004-memory-backend-neo4j.js`
- `src/lib/db/repos/modelDiscoveryRepo.js`
- `src/lib/identityMemory/common.js`
- `src/lib/identityMemory/index.js`
- `src/lib/identityMemory/neo4j.js`
- `src/lib/identityMemory/profileConfig.js`
- `src/lib/modelDiscovery.js`
- `src/lib/modelSync.js`
- `src/lib/oauth/providers/xiaomi-mimo.js`
- `src/lib/sources/context.js`

### `src/app/api` (6)

- `src/app/api/keys/[id]/memories/route.js`
- `src/app/api/oauth/xiaomi-mimo/api-key/route.js`
- `src/app/api/oauth/xiaomi-mimo/auto-import/route.js`
- `src/app/api/providers/[id]/models/discover/route.js`
- `src/app/api/providers/[id]/models/sync/route.js`
- `src/app/api/sources/status/route.js`

### `open-sse/sources` (5)

- `open-sse/sources/index.js`
- `open-sse/sources/neo4jBackend.js`
- `open-sse/sources/notionBackend.js`
- `open-sse/sources/openNotebookBackend.js`
- `open-sse/sources/status.js`

### `src/app/(dashboard)` (5)

- `src/app/(dashboard)/dashboard/endpoint/components/SourcesSection.js`
- `src/app/(dashboard)/dashboard/fontes/page.js`
- `src/app/(dashboard)/dashboard/providers/[id]/DiscoverModelsModal.js`
- `src/app/(dashboard)/dashboard/providers/[id]/ModelSyncControls.js`
- `src/app/(dashboard)/dashboard/sourcesMeta.js`

### `src/shared` (4)

- `src/shared/components/ColorThemePicker.js`
- `src/shared/components/XiaomiMimoAuthModal.js`
- `src/shared/constants/capabilities.js`
- `src/shared/utils/providerDiscoveryConfig.js`

### `IDENTITY_MEMORY.md` (1)

- `IDENTITY_MEMORY.md`

### `docker-compose.staging.yml` (1)

- `docker-compose.staging.yml`

### `open-sse/executors` (1)

- `open-sse/executors/xiaomi-mimo.js`

### `open-sse/rtk` (1)

- `open-sse/rtk/identity.js`

### `open-sse/services` (1)

- `open-sse/services/usage/xiaomi-mimo.js`

### `open-sse/shared` (1)

- `open-sse/shared/mimoAccount.js`

### `skills/9router-memory` (1)

- `skills/9router-memory/SKILL.md`

### `tests` (1)

- `tests/package-lock.json`

### `tests/translator` (1)

- `tests/translator/__snapshots__/golden-url-header.test.js.snap`

## Removidos (2)

- `src/shared/components/NineRemoteButton.js`
- `src/shared/components/NineRemotePromoModal.js`

## Marcadores que provam que um custom sobreviveu

A Fase 3 roda `audit-customs.mjs --check-markers` e **falha o update** se algum sumir:

- `app/open-sse/rtk/identity.js`
  - `9ROUTER_SOURCES`
  - `SOURCES_MARKER`
- `app/src/lib/identityMemory/neo4j.js`
  - `MERGE (b:Bank`
  - `ON CREATE`
- `app/open-sse/sources/index.js`
  - `searchSources`
  - `SourcePermissionError`
- `app/src/lib/sources/context.js`
  - `recallSourcesForKey`
  - `capabilitiesBlockForKey`
- `app/src/shared/constants/capabilities.js`
  - `9ROUTER_CAPABILITIES`
  - `MAX_CAPABILITIES_CHARS`
- `docker-compose.yml`
  - `profiles:`
  - `bundled`
