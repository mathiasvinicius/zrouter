#!/bin/bash
# Re-executa o Codex após o reset da janela de uso (22:09 BRT).
# Escopo: Entrega 1 estendida — contrato de fontes + fontes por key + modal + página Fontes.
set -u
LOG=/opt/containers/zrouter/docs/codex-entrega1.log

wait_until() {
  while [ "$(date +%s)" -lt "$1" ]; do sleep 60; done
}

# 22:11 BRT de hoje (folga de 2 min sobre o reset 22:09)
TARGET=$(date -d 'today 22:11' +%s)
if [ "$(date +%s)" -ge "$TARGET" ]; then TARGET=$(date -d 'tomorrow 22:11' +%s); fi
echo "aguardando até $(date -d @$TARGET '+%H:%M:%S')" >> "$LOG"

wait_until "$TARGET"
echo "janela aberta — disparando codex $(date '+%H:%M:%S')" >> "$LOG"

cd /opt/containers/zrouter/app || exit 1

codex exec --sandbox danger-full-access "Leia /opt/containers/zrouter/docs/infusion-design.md (item 0 é o requisito principal) e /opt/containers/zrouter/docs/roadmap.md. Implemente a Entrega 1 ESTENDIDA no ZRouter: (A) contrato comum de fontes: search(query, scope, limit) e get(id) retornando sourceId, title, url, excerpt, updatedAt, bank, origin, score; backends: Open Notebook via API REST http://127.0.0.1:5055 (Authorization Bearer do env OPEN_NOTEBOOK_PASSWORD, filtro por notebooks autorizados), Neo4j (módulo de memória existente), Notion read-only stub (interface pronta). (B) FONTE POR API KEY (requisito principal): estenda o schema de apiKeys no SQLite com campo sources (JSON: notion pages/databases autorizados, notebooks do Open Notebook, banks Neo4j); no dashboard Next.js, o modal de edição/criação de key ganha seção 'Fontes de Conhecimento' com toggles por fonte e escopos por key (siga o padrão visual dos modais de api-manager/tokens do OmniRoute em /opt/containers/omniroute-src/src/app/(dashboard)/dashboard/api-manager e .../tokens); o runtime lê as fontes ligadas à key que faz a requisição e NUNCA expõe fontes não ligadas. (C) página 'Fontes' única no dashboard com cards de status por fonte (Notion, Open Notebook, Neo4j), teste de conexão e escopos, padrão visual health/free-tiers. (D) NÃO traga gamificação, A2A, plugins, translator; credenciais nunca em logs. (E) commit final: 'feat(sources): per-key sources + Fontes dashboard + modal (Entrega 1 estendida)'. NÃO reinicie containers, NÃO toque em produção." >> "$LOG" 2>&1
echo "codex terminou com exit $?" >> "$LOG"