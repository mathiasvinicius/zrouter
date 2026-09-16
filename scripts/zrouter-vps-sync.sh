#!/bin/bash
# ============================================================
# zrouter-vps-sync.sh — sincroniza o ZRouter da VPS com o Zenith
#
# O código é o MESMO nas duas máquinas (mesmo repo). O que difere é
# o ambiente: a VPS aponta para as fontes que vivem no Zenith.
#
# Este script atualiza APENAS o código, preservando:
#   - .env      (aponta para Neo4j/Open Notebook do Zenith)
#   - data/     (SQLite com keys, combos e conexões da VPS)
#   - .git      (histórico local)
#
# Uso:   ./zrouter-vps-sync.sh [--dry-run]
# Cron:  */15 * * * * /opt/scripts/zrouter-vps-sync.sh >> /var/log/zrouter-vps-sync.log 2>&1
# ============================================================
set -uo pipefail

REPO="/opt/containers/zrouter"
BRANCH="main"
LOG_PREFIX="[$(date '+%F %T')]"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

log() { echo "$LOG_PREFIX $*"; }
die() { echo "$LOG_PREFIX ERRO: $*" >&2; exit 1; }

cd "$REPO" || die "repo não encontrado em $REPO"

# ── 1. o que NÃO pode ser tocado (sanity check) ───────────────────────────────
[ -f "$REPO/.env" ] || die ".env ausente — abortando (a VPS perderia o apontamento para o Zenith)"

# ── 2. há algo novo? ─────────────────────────────────────────────────────────
git fetch origin "$BRANCH" --quiet 2>/dev/null || die "git fetch falhou (sem rede ou chave?)"

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  log "já atualizado ($(git rev-parse --short HEAD)) — nada a fazer"
  exit 0
fi

log "atualização disponível: $(git rev-parse --short HEAD) → $(git rev-parse --short origin/$BRANCH)"

# ── 3. registra o que vai mudar ──────────────────────────────────────────────
CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE" | head -20)
log "arquivos alterados: $(git diff --name-only "$LOCAL" "$REMOTE" | wc -l)"
echo "$CHANGED" | sed "s/^/  /"

# ── 4. detecta mudanças que exigem atenção especial ──────────────────────────
NEEDS_REBUILD=0
if git diff --name-only "$LOCAL" "$REMOTE" | grep -qE '^app/(src|open-sse|public|package|next\.config|Dockerfile)'; then
  NEEDS_REBUILD=1
fi

if [ "$DRY_RUN" = "1" ]; then
  log "DRY-RUN: rebuild necessário = $NEEDS_REBUILD. Nada foi alterado."
  exit 0
fi

# ── 5. backup do banco antes de mexer ────────────────────────────────────────
if [ -f "$REPO/data/db/data.sqlite" ]; then
  BAK="$REPO/data/db/data.sqlite.bak-sync-$(date +%Y%m%d-%H%M%S)"
  cp "$REPO/data/db/data.sqlite" "$BAK" 2>/dev/null && log "backup: $(basename "$BAK")"
  # mantém só os 5 mais recentes
  ls -1t "$REPO"/data/db/data.sqlite.bak-sync-* 2>/dev/null | tail -n +6 | xargs -r rm -f
fi

# ── 6. atualiza o código (preserva .env, data/ e .git por serem ignorados) ───
# `reset --hard` é necessário porque o histórico pode ter sido reescrito no
# Zenith (o pull falharia por divergência). Arquivos ignorados NÃO são tocados.
git reset --hard "origin/$BRANCH" --quiet || die "reset falhou"
log "código atualizado para $(git rev-parse --short HEAD)"

# ── 7. confere que o .env sobreviveu ─────────────────────────────────────────
[ -f "$REPO/.env" ] || die "CRÍTICO: .env desapareceu no reset"

# ── 8. rebuild e restart ─────────────────────────────────────────────────────
if [ "$NEEDS_REBUILD" = "1" ]; then
  log "rebuild necessário — reconstruindo imagem"
  docker compose up -d --build >/dev/null 2>&1 || die "docker compose up falhou"
else
  log "sem mudança de código — só restart"
  docker compose up -d >/dev/null 2>&1 || die "docker compose up falhou"
fi

# ── 9. verifica saúde ────────────────────────────────────────────────────────
sleep 20
for i in 1 2 3 4 5 6; do
  CODE=$(curl -s -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:20128/dashboard 2>/dev/null || echo 000)
  if [ "$CODE" = "200" ] || [ "$CODE" = "307" ]; then
    log "OK — dashboard respondeu HTTP $CODE após $((i*10))s"
    exit 0
  fi
  sleep 10
done

log "AVISO: dashboard não respondeu 200/307 após o restart (último: $CODE)"
log "rollback: git reset --hard $LOCAL && docker compose up -d --build"
exit 1
