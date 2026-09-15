# CUSTOMS — o que o ZRouter mudou em relação ao upstream

> **Gerado automaticamente** por `scripts/update/audit-customs.mjs` em 2026-09-15 21:23:09.
> Base: `zrouter-base-v0.5.75` (raiz do upstream 9Router) · comparada contra `app/` · HEAD `ebcf399d`
>
> **Não edite à mão.** Este documento é a memória do fork: a pipeline
> (`docs/UPDATE-PIPELINE.md`) o consulta ao resolver conflitos de merge.
> Regenere com `node scripts/update/audit-customs.mjs --base <tag>`.

## Resumo

- **Modificados** (existem no upstream): **199** — onde um merge disputa conteúdo
- **Adicionados** (só nossos): 74
- **Removidos** (no upstream, não em nós): 145

O risco de um update mora nos **modificados**. Adicionados e removidos normalmente
resolvem sozinhos.

## Modificados (199) — pontos de acoplamento

### `public/i18n` (34)

- `public/i18n/literals/ar.json` — +3/-3
- `public/i18n/literals/bn.json` — +3/-3
- `public/i18n/literals/cs.json` — +3/-3
- `public/i18n/literals/da.json` — +3/-3
- `public/i18n/literals/de.json` — +3/-3
- `public/i18n/literals/el.json` — +3/-3
- `public/i18n/literals/es.json` — +3/-3
- `public/i18n/literals/fa.json` — +30/-33
- `public/i18n/literals/fi.json` — +3/-3
- `public/i18n/literals/fr.json` — +3/-3
- `public/i18n/literals/he.json` — +3/-3
- `public/i18n/literals/hi.json` — +3/-3
- `public/i18n/literals/hu.json` — +3/-3
- `public/i18n/literals/id.json` — +30/-33
- `public/i18n/literals/it.json` — +3/-3
- `public/i18n/literals/ja.json` — +3/-3
- `public/i18n/literals/km.json` — +30/-33
- `public/i18n/literals/ko.json` — +3/-3
- `public/i18n/literals/nl.json` — +3/-3
- `public/i18n/literals/no.json` — +3/-3
- `public/i18n/literals/pl.json` — +3/-3
- `public/i18n/literals/pt-BR.json` — +12/-15
- `public/i18n/literals/pt-PT.json` — +3/-3
- `public/i18n/literals/ro.json` — +3/-3
- `public/i18n/literals/ru.json` — +3/-3
- `public/i18n/literals/sv.json` — +3/-3
- `public/i18n/literals/th.json` — +30/-33
- `public/i18n/literals/tl.json` — +3/-3
- `public/i18n/literals/tr.json` — +3/-3
- `public/i18n/literals/uk.json` — +3/-3
- `public/i18n/literals/ur.json` — +3/-3
- `public/i18n/literals/vi.json` — +3/-3
- `public/i18n/literals/zh-CN.json` — +30/-33
- `public/i18n/literals/zh-TW.json` — +3/-3

### `src/app/api` (26)

- `src/app/api/auth/login/route.js` — +1/-1
- `src/app/api/cli-tools/antigravity-mitm/route.js` — +2/-2
- `src/app/api/cli-tools/claude-settings/route.js` — +8/-7
- `src/app/api/cli-tools/cline-settings/route.js` — +1/-1
- `src/app/api/cli-tools/codex-settings/route.js` — +10/-10
- `src/app/api/cli-tools/copilot-settings/route.js` — +11/-11
- `src/app/api/cli-tools/cowork-mcp-registry/route.js` — +1/-1
- `src/app/api/cli-tools/deepseek-tui-settings/route.js` — +4/-4
- `src/app/api/cli-tools/droid-settings/route.js` — +6/-6
- `src/app/api/cli-tools/grok-build-settings/route.js` — +1/-1
- `src/app/api/cli-tools/hermes-settings/route.js` — +1/-1
- `src/app/api/cli-tools/jcode-settings/route.js` — +2/-2
- `src/app/api/cli-tools/kilo-settings/route.js` — +2/-2
- `src/app/api/cli-tools/openclaw-settings/route.js` — +9/-9
- `src/app/api/cli-tools/opencode-settings/route.js` — +5/-5
- `src/app/api/headroom/restart/route.js` — +1/-1
- `src/app/api/headroom/start/route.js` — +1/-1
- `src/app/api/keys/[id]/route.js` — +37/-4
- `src/app/api/keys/route.js` — +35/-4
- `src/app/api/models/route.js` — +3/-0
- `src/app/api/oauth/[provider]/[action]/route.js` — +77/-2
- `src/app/api/providers/[id]/test/testUtils.js` — +1/-1
- `src/app/api/settings/route.js` — +14/-5
- `src/app/api/v1/models/route.js` — +45/-3
- `src/app/api/version/route.js` — +1/-1
- `src/app/api/version/update/route.js` — +1/-1

### `src/lib` (21)

- `src/lib/appUpdater.js` — +3/-3
- `src/lib/db/driver.js` — +4/-0
- `src/lib/db/index.js` — +20/-4
- `src/lib/db/migrate.js` — +8/-2
- `src/lib/db/migrations/index.js` — +4/-1
- `src/lib/db/repos/aliasRepo.js` — +6/-3
- `src/lib/db/repos/apiKeysRepo.js` — +68/-5
- `src/lib/db/repos/settingsRepo.js` — +22/-0
- `src/lib/db/schema.js` — +16/-2
- `src/lib/grokBuildConfig.js` — +3/-3
- `src/lib/headroom/detect.js` — +1/-1
- `src/lib/localDb.js` — +1/-1
- `src/lib/mcp/stdioSseBridge.js` — +3/-3
- `src/lib/modelCatalog/sync.js` — +1/-1
- `src/lib/network/proxyTest.js` — +1/-1
- `src/lib/oauth/constants/oauth.js` — +13/-0
- `src/lib/oauth/constants/xai.js` — +1/-1
- `src/lib/oauth/providers/trae.js` — +1/-1
- `src/lib/oauth/services/kimchi.js` — +1/-1
- `src/lib/oauth/utils/server.js` — +102/-0
- `src/lib/tunnel/tailscale/tailscale.js` — +1/-1

### `src/app/(dashboard)` (20)

- `src/app/(dashboard)/dashboard/cli-tools/components/AntigravityToolCard.js` — +3/-3
- `src/app/(dashboard)/dashboard/cli-tools/components/ClaudeToolCard.js` — +49/-17
- `src/app/(dashboard)/dashboard/cli-tools/components/ClineToolCard.js` — +1/-1
- `src/app/(dashboard)/dashboard/cli-tools/components/CodexToolCard.js` — +3/-3
- `src/app/(dashboard)/dashboard/cli-tools/components/CopilotToolCard.js` — +2/-2
- `src/app/(dashboard)/dashboard/cli-tools/components/DeepSeekTuiToolCard.js` — +1/-1
- `src/app/(dashboard)/dashboard/cli-tools/components/DroidToolCard.js` — +2/-2
- `src/app/(dashboard)/dashboard/cli-tools/components/GrokBuildToolCard.js` — +2/-2
- `src/app/(dashboard)/dashboard/cli-tools/components/JcodeToolCard.js` — +3/-3
- `src/app/(dashboard)/dashboard/cli-tools/components/KiloToolCard.js` — +1/-1
- `src/app/(dashboard)/dashboard/cli-tools/components/MitmServerCard.js` — +4/-4
- `src/app/(dashboard)/dashboard/cli-tools/components/MitmToolCard.js` — +1/-1
- `src/app/(dashboard)/dashboard/cli-tools/components/OpenClawToolCard.js` — +1/-1
- `src/app/(dashboard)/dashboard/cli-tools/components/OpenCodeToolCard.js` — +1/-1
- `src/app/(dashboard)/dashboard/combos/page.js` — +37/-5
- `src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js` — +227/-25
- `src/app/(dashboard)/dashboard/providers/[id]/page.js` — +12/-1
- `src/app/(dashboard)/dashboard/skills/page.js` — +17/-13
- `src/app/(dashboard)/dashboard/token-saver/TokenSaverClient.js` — +1/-1
- `src/app/(dashboard)/dashboard/usage/components/ProviderTopology.js` — +3/-3

### `src/shared` (10)

- `src/shared/components/DonateModal.js` — +1/-1
- `src/shared/components/Header.js` — +2/-2
- `src/shared/components/ModelSelectModal.js` — +1/-1
- `src/shared/components/Sidebar.js` — +11/-25
- `src/shared/components/ThemeToggle.js` — +58/-15
- `src/shared/components/index.js` — +1/-1
- `src/shared/constants/cliTools.js` — +13/-13
- `src/shared/constants/config.js` — +3/-3
- `src/shared/constants/skills.js` — +30/-29
- `src/shared/hooks/useModelCaps.js` — +10/-4

### `open-sse/providers` (8)

- `open-sse/providers/capabilities.js` — +2/-1
- `open-sse/providers/registry/antigravity.js` — +0/-2
- `open-sse/providers/registry/fireworks.js` — +1/-0
- `open-sse/providers/registry/gemini-cli.js` — +0/-2
- `open-sse/providers/registry/gemini.js` — +0/-2
- `open-sse/providers/registry/windsurf.js` — +1/-1
- `open-sse/providers/registry/xiaomi-mimo.js` — +29/-1
- `open-sse/providers/shared.js` — +11/-7

### `cli/src` (7)

- `cli/src/cli/api/client.js` — +1/-1
- `cli/src/cli/commands/xaiVideo.js` — +2/-2
- `cli/src/cli/menus/cliTools.js` — +3/-3
- `cli/src/cli/terminalUI.js` — +2/-2
- `cli/src/cli/tray/autostart.js` — +7/-7
- `cli/src/cli/tray/tray.js` — +5/-5
- `cli/src/cli/tray/tray.ps1` — +1/-1

### `src/app/landing` (7)

- `src/app/landing/components/FlowAnimation.js` — +4/-4
- `src/app/landing/components/Footer.js` — +10/-10
- `src/app/landing/components/GetStarted.js` — +5/-5
- `src/app/landing/components/HeroSection.js` — +1/-1
- `src/app/landing/components/HowItWorks.js` — +3/-3
- `src/app/landing/components/Navigation.js` — +5/-5
- `src/app/landing/page.js` — +2/-2

### `src/mitm` (7)

- `src/mitm/cert/rootCA.js` — +1/-1
- `src/mitm/config.js` — +1/-1
- `src/mitm/handlers/base.js` — +4/-4
- `src/mitm/handlers/copilot.js` — +2/-2
- `src/mitm/handlers/kiro.js` — +3/-3
- `src/mitm/manager.js` — +2/-2
- `src/mitm/server.js` — +1/-1

### `open-sse/executors` (5)

- `open-sse/executors/codebuddy-cn.js` — +2/-2
- `open-sse/executors/commandcode.js` — +1/-1
- `open-sse/executors/cursor.js` — +3/-3
- `open-sse/executors/devin-cli.js` — +1/-1
- `open-sse/executors/index.js` — +3/-0

### `open-sse/shared` (4)

- `open-sse/shared/clineAuth.js` — +2/-0
- `open-sse/shared/qoder/attachments.js` — +2/-2
- `open-sse/shared/qoder/contextTier.js` — +1/-1
- `open-sse/shared/qoder/sse.js` — +1/-1

### `open-sse/translator` (4)

- `open-sse/translator/concerns/paramSupport.js` — +3/-0
- `open-sse/translator/request/claude-to-kiro.js` — +1/-1
- `open-sse/translator/request/openai-to-kiro.js` — +1/-1
- `open-sse/translator/response/commandcode-to-openai.js` — +1/-1

### `cli` (3)

- `cli/README.md` — +4/-0
- `cli/cli.js` — +6/-6
- `cli/package.json` — +1/-1

### `cli/hooks` (3)

- `cli/hooks/postinstall.js` — +4/-4
- `cli/hooks/sqliteRuntime.js` — +1/-1
- `cli/hooks/trayRuntime.js` — +3/-3

### `docs/superpowers` (3)

- `docs/superpowers/plans/2026-09-04-opencode-go-session-header.md` — +1/-1
- `docs/superpowers/specs/2026-08-02-gpt-5-6-codex-reasoning-overrides-design.md` — +3/-3
- `docs/superpowers/specs/2026-09-04-opencode-go-session-header-design.md` — +2/-2

### `open-sse/handlers` (3)

- `open-sse/handlers/chatCore.js` — +24/-7
- `open-sse/handlers/ttsProviders/selfhostedTts.js` — +1/-1
- `open-sse/handlers/videoProviders/vertex.js` — +1/-1

### `tests/unit` (3)

- `tests/unit/antigravity-oauth-client.test.js` — +45/-27
- `tests/unit/codex-native-passthrough-thinking.test.js` — +8/-1
- `tests/unit/db-sqlite-vs-lowdb.test.js` — +3/-2

### `cli/scripts` (2)

- `cli/scripts/build-cli.js` — +1/-1
- `cli/scripts/buildMitm.js` — +1/-1

### `open-sse/services` (2)

- `open-sse/services/kiroModels.js` — +4/-4
- `open-sse/services/usage.js` — +2/-0

### `public/icons` (2)

- `public/icons/icon-192.svg` — +9/-2
- `public/icons/icon-512.svg` — +9/-2

### `src` (2)

- `src/dashboardGuard.js` — +1/-1
- `src/instrumentation.js` — +6/-0

### `.env.example` (1)

- `.env.example` — +60/-5

### `.gitignore` (1)

- `.gitignore` — +21/-0

### `CLAUDE.md` (1)

- `CLAUDE.md` — +3/-3

### `DOCKER.md` (1)

- `DOCKER.md` — +18/-18

### `Dockerfile` (1)

- `Dockerfile` — +1/-2

### `README.md` (1)

- `README.md` — +32/-15

### `docs` (1)

- `docs/ARCHITECTURE.md` — +6/-6

### `next.config.mjs` (1)

- `next.config.mjs` — +6/-3

### `open-sse/config` (1)

- `open-sse/config/kiroConstants.js` — +6/-6

### `open-sse/rtk` (1)

- `open-sse/rtk/headroom.js` — +1/-1

### `open-sse/utils` (1)

- `open-sse/utils/sessionManager.js` — +2/-2

### `package.json` (1)

- `package.json` — +2/-2

### `public` (1)

- `public/favicon.svg` — +11/-9

### `skills` (1)

- `skills/README.md` — +22/-29

### `src/app/globals.css` (1)

- `src/app/globals.css` — +35/-35

### `src/app/layout.js` (1)

- `src/app/layout.js` — +5/-3

### `src/app/login` (1)

- `src/app/login/page.js` — +2/-2

### `src/app/manifest.js` (1)

- `src/app/manifest.js` — +2/-2

### `src/sse` (1)

- `src/sse/handlers/chat.js` — +67/-18

### `src/store` (1)

- `src/store/themeStore.js` — +24/-1

### `start.sh` (1)

- `start.sh` — +4/-4

### `tests` (1)

- `tests/README.md` — +1/-1

### `tests/__baseline__` (1)

- `tests/__baseline__/providers-baseline.json` — +0/-15

## Adicionados (74) — arquivos nossos

### `tests/unit` (21)

- `tests/unit/api-key-profile-options.test.js`
- `tests/unit/capabilities-block.test.js`
- `tests/unit/color-themes.test.js`
- `tests/unit/ensure-bank-neo4j.test.js`
- `tests/unit/identity-memory-backend-selection.test.js`
- `tests/unit/memory-backend-migration.test.js`
- `tests/unit/model-auto-sync.test.js`
- `tests/unit/model-caps-audio-filter.test.js`
- `tests/unit/model-discover-endpoint.test.js`
- `tests/unit/neo4j-schema.test.js`
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

### `src/lib` (14)

- `src/lib/colorThemes.js`
- `src/lib/db/migrations/002-api-key-sources.js`
- `src/lib/db/migrations/003-custom-model-source.js`
- `src/lib/db/migrations/004-memory-backend-neo4j.js`
- `src/lib/db/repos/modelDiscoveryRepo.js`
- `src/lib/identityMemory/common.js`
- `src/lib/identityMemory/index.js`
- `src/lib/identityMemory/neo4j.js`
- `src/lib/identityMemory/profileConfig.js`
- `src/lib/identityMemory/schema.js`
- `src/lib/modelDiscovery.js`
- `src/lib/modelSync.js`
- `src/lib/oauth/providers/xiaomi-mimo.js`
- `src/lib/sources/context.js`

### `src/app/api` (7)

- `src/app/api/health/neo4j/route.js`
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

### `skills/zrouter` (1)

- `skills/zrouter/SKILL.md`

### `skills/zrouter-chat` (1)

- `skills/zrouter-chat/SKILL.md`

### `skills/zrouter-embeddings` (1)

- `skills/zrouter-embeddings/SKILL.md`

### `skills/zrouter-image` (1)

- `skills/zrouter-image/SKILL.md`

### `skills/zrouter-memory` (1)

- `skills/zrouter-memory/SKILL.md`

### `skills/zrouter-stt` (1)

- `skills/zrouter-stt/SKILL.md`

### `skills/zrouter-tts` (1)

- `skills/zrouter-tts/SKILL.md`

### `skills/zrouter-video` (1)

- `skills/zrouter-video/SKILL.md`

### `skills/zrouter-web-fetch` (1)

- `skills/zrouter-web-fetch/SKILL.md`

### `skills/zrouter-web-search` (1)

- `skills/zrouter-web-search/SKILL.md`

### `tests` (1)

- `tests/package-lock.json`

### `tests/translator` (1)

- `tests/translator/__snapshots__/golden-url-header.test.js.snap`

## Removidos (145)

- `.github/workflows/gitbook-pages.yml`
- `README.zh-CN.md`
- `docker-compose.yml`
- `gitbook/.gitignore`
- `gitbook/app/[lang]/[...slug]/page.js`
- `gitbook/app/[lang]/page.js`
- `gitbook/app/globals.css`
- `gitbook/app/layout.js`
- `gitbook/app/page.js`
- `gitbook/components/DocsContent.js`
- `gitbook/components/DocsHeader.js`
- `gitbook/components/DocsLayout.js`
- `gitbook/components/DocsSidebar.js`
- `gitbook/components/DocsToc.js`
- `gitbook/components/LanguageSwitcher.js`
- `gitbook/constants/docsConfig.js`
- `gitbook/constants/languages.js`
- `gitbook/content/en/deployment/cloud.md`
- `gitbook/content/en/deployment/localhost.md`
- `gitbook/content/en/faq.md`
- `gitbook/content/en/features/combos.md`
- `gitbook/content/en/features/quota-tracking.md`
- `gitbook/content/en/features/smart-routing.md`
- `gitbook/content/en/getting-started/installation.md`
- `gitbook/content/en/getting-started/quick-start.md`
- `gitbook/content/en/index.md`
- `gitbook/content/en/integration/claude-code.md`
- `gitbook/content/en/integration/cline.md`
- `gitbook/content/en/integration/codex.md`
- `gitbook/content/en/integration/continue.md`
- `gitbook/content/en/integration/cursor.md`
- `gitbook/content/en/integration/other-tools.md`
- `gitbook/content/en/integration/roo.md`
- `gitbook/content/en/providers/cheap.md`
- `gitbook/content/en/providers/free.md`
- `gitbook/content/en/providers/subscription.md`
- `gitbook/content/en/troubleshooting.md`
- `gitbook/content/es/deployment/cloud.md`
- `gitbook/content/es/deployment/localhost.md`
- `gitbook/content/es/faq.md`
- `gitbook/content/es/features/combos.md`
- `gitbook/content/es/features/quota-tracking.md`
- `gitbook/content/es/features/smart-routing.md`
- `gitbook/content/es/getting-started/installation.md`
- `gitbook/content/es/getting-started/quick-start.md`
- `gitbook/content/es/index.md`
- `gitbook/content/es/integration/claude-code.md`
- `gitbook/content/es/integration/cline.md`
- `gitbook/content/es/integration/codex.md`
- `gitbook/content/es/integration/continue.md`
- `gitbook/content/es/integration/cursor.md`
- `gitbook/content/es/integration/other-tools.md`
- `gitbook/content/es/integration/roo.md`
- `gitbook/content/es/providers/cheap.md`
- `gitbook/content/es/providers/free.md`
- `gitbook/content/es/providers/subscription.md`
- `gitbook/content/es/troubleshooting.md`
- `gitbook/content/ja/deployment/cloud.md`
- `gitbook/content/ja/deployment/localhost.md`
- `gitbook/content/ja/faq.md`
- `gitbook/content/ja/features/combos.md`
- `gitbook/content/ja/features/quota-tracking.md`
- `gitbook/content/ja/features/smart-routing.md`
- `gitbook/content/ja/getting-started/installation.md`
- `gitbook/content/ja/getting-started/quick-start.md`
- `gitbook/content/ja/index.md`
- `gitbook/content/ja/integration/claude-code.md`
- `gitbook/content/ja/integration/cline.md`
- `gitbook/content/ja/integration/codex.md`
- `gitbook/content/ja/integration/continue.md`
- `gitbook/content/ja/integration/cursor.md`
- `gitbook/content/ja/integration/other-tools.md`
- `gitbook/content/ja/integration/roo.md`
- `gitbook/content/ja/providers/cheap.md`
- `gitbook/content/ja/providers/free.md`
- `gitbook/content/ja/providers/subscription.md`
- `gitbook/content/ja/troubleshooting.md`
- `gitbook/content/vi/deployment/cloud.md`
- `gitbook/content/vi/deployment/localhost.md`
- `gitbook/content/vi/faq.md`
- `gitbook/content/vi/features/combos.md`
- `gitbook/content/vi/features/quota-tracking.md`
- `gitbook/content/vi/features/smart-routing.md`
- `gitbook/content/vi/getting-started/installation.md`
- `gitbook/content/vi/getting-started/quick-start.md`
- `gitbook/content/vi/index.md`
- `gitbook/content/vi/integration/claude-code.md`
- `gitbook/content/vi/integration/cline.md`
- `gitbook/content/vi/integration/codex.md`
- `gitbook/content/vi/integration/continue.md`
- `gitbook/content/vi/integration/cursor.md`
- `gitbook/content/vi/integration/other-tools.md`
- `gitbook/content/vi/integration/roo.md`
- `gitbook/content/vi/providers/cheap.md`
- `gitbook/content/vi/providers/free.md`
- `gitbook/content/vi/providers/subscription.md`
- `gitbook/content/vi/troubleshooting.md`
- `gitbook/content/zh-CN/deployment/cloud.md`
- `gitbook/content/zh-CN/deployment/localhost.md`
- `gitbook/content/zh-CN/faq.md`
- `gitbook/content/zh-CN/features/combos.md`
- `gitbook/content/zh-CN/features/quota-tracking.md`
- `gitbook/content/zh-CN/features/smart-routing.md`
- `gitbook/content/zh-CN/getting-started/installation.md`
- `gitbook/content/zh-CN/getting-started/quick-start.md`
- `gitbook/content/zh-CN/index.md`
- `gitbook/content/zh-CN/integration/claude-code.md`
- `gitbook/content/zh-CN/integration/cline.md`
- `gitbook/content/zh-CN/integration/codex.md`
- `gitbook/content/zh-CN/integration/continue.md`
- `gitbook/content/zh-CN/integration/cursor.md`
- `gitbook/content/zh-CN/integration/other-tools.md`
- `gitbook/content/zh-CN/integration/roo.md`
- `gitbook/content/zh-CN/providers/cheap.md`
- `gitbook/content/zh-CN/providers/free.md`
- `gitbook/content/zh-CN/providers/subscription.md`
- `gitbook/content/zh-CN/troubleshooting.md`
- `gitbook/jsconfig.json`
- `gitbook/lib/content.js`
- `gitbook/next.config.mjs`
- `gitbook/package.json`
- `gitbook/postcss.config.mjs`
- `gitbook/utils/markdown.js`
- `i18n/README.es.md`
- `i18n/README.fa_IR.md`
- `i18n/README.fr.md`
- `i18n/README.id-ID.md`
- `i18n/README.ja-JP.md`
- `i18n/README.pt-BR.md`
- `i18n/README.ru.md`
- `i18n/README.th.md`
- `i18n/README.vi.md`
- `i18n/README.zh-CN.md`
- `scripts/translate-readme.js`
- `skills/9router-chat/SKILL.md`
- `skills/9router-embeddings/SKILL.md`
- `skills/9router-image/SKILL.md`
- `skills/9router-stt/SKILL.md`
- `skills/9router-tts/SKILL.md`
- `skills/9router-video/SKILL.md`
- `skills/9router-web-fetch/SKILL.md`
- `skills/9router-web-search/SKILL.md`
- `skills/9router/SKILL.md`
- `src/shared/components/NineRemoteButton.js`
- `src/shared/components/NineRemotePromoModal.js`

## Marcadores que provam que um custom sobreviveu

A Fase 3 roda `audit-customs.mjs --check-markers` e **falha o update** se algum sumir:

- `app/open-sse/rtk/identity.js`
  - `ZROUTER_SOURCES`
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
  - `ZROUTER_CAPABILITIES`
  - `MAX_CAPABILITIES_CHARS`
- `docker-compose.yml`
  - `profiles:`
  - `bundled`
