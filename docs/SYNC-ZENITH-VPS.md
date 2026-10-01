# Sync ZRouter — Zenith → VPS (espelho completo)

## Decisão (2026-09-30)
A VPS é **espelho fiel** do Zenith. O que difere é **apenas a imagem Docker**
(amd64 no Zenith, arm64 na VPS — cada máquina constrói a sua). Código, banco,
settings e identidade devem ser idênticos, para o failover entregar o mesmo
comportamento quando o Zenith cai.

## O que o sync ANTIGO fazia (e por que quebrou)
`scripts/zrouter-vps-sync.sh` (na VPS, via cron `*/15`) atualizava **só o código**
e preservava `.env` e `data/` de propósito. Resultado: banco e settings nunca
acompanharam o Zenith.

Além disso o script estava **100% quebrado desde 2026-09-16** (1355 linhas de log,
todas erro). Causa real, escondida pelo `2>/dev/null` no `git fetch`:

    fatal: detected dubious ownership in repository at '/opt/containers/zrouter'

O cron roda como `root`, o repo pertence a `ubuntu`, e `/root/.gitconfig` só
liberava `/opt/zion-router/router`. **Correção:** `safe.directory` + remover o
`2>/dev/null` do fetch para o log mostrar o erro real.

## Arquitetura do espelho

### Código
`git reset --hard origin/main` funciona, mas o Zenith mantém commits locais que
nunca sobem para o `origin` (hoje: 10 commits à frente). Então o transporte é
`rsync` direto de `app/src/` — determinístico e independente do estado do git.

### Banco (`data/db/data.sqlite`) — tabelas espelhadas
`combos`, `apiKeys`, `providerConnections`, `providerNodes`, `proxyPools`, `settings`

### Banco — tabelas PRESERVADAS da VPS (telemetria local)
`kv`, `usageHistory`, `usageDaily`, `requestDetails`

### NUNCA copiados
- `bases/` — clones locais (9router, OmniRoute, ~1.9 GB), usados apenas para desenvolvimento/atualização local no Zenith
- `data/jwt-secret` — sessões não devem ser compartilhadas entre máquinas
- `data/machine-id` — identidade de máquina é por host

### `.env`
Cada host mantém o seu (aponta para Neo4j/Open Notebook do Zenith via Tailscale).

## Procedimento de espelho do banco
1. Parar o container do zrouter na VPS
2. Snapshot consistente do Zenith (incorpora o WAL):
   `sqlite3 data/db/data.sqlite "VACUUM INTO '/tmp/zrouter-snapshot.sqlite'"`
3. Enviar o snapshot e o script `espelhar_zrouter.py`
4. Aplicar o espelho: `python3 espelhar_zrouter.py <snapshot> <destino> --apply`
   (faz backup automático `data.sqlite.bak-espelho-<ts>` antes)
5. Copiar `app/src/` via rsync
6. `docker compose up -d --build` (a VPS sempre reconstrói arm64)

## Pitfall: migração de schema em dois lados
O banco do Zenith foi migrado para `schemaVersion 5` (colunas `type`/`config` em
`combos`). A VPS ainda está em 4. Ao espelhar o banco, a VPS fica com as colunas
no disco mas o `_meta.schemaVersion` continua 4 — e a migração 005 é idempotente
(`PRAGMA table_info` antes de cada `ALTER`), então ela reconcilia no próximo boot.
**Se o container subir antes disso, não há problema: a migração roda sozinha.**

## Classificador determinístico (combos dinâmicos)
`tev1:0.8b` no Ollama, endpoint `/v1/systemone`, em **cada host** (a VPS precisa
funcionar sem o Zenith). A VPS tem 11 GB de RAM; o modelo ocupa ~811 MB.

```bash
curl -fsSL https://ollama.com/install.sh | sh   # pode instalar 0.32 (bug do mirror)
# Se a versão não subir, usar o tarball oficial direto:
curl -fsSL -o /tmp/o.tar.zst \
  https://github.com/ollama/ollama/releases/download/v0.35.0/ollama-linux-arm64.tar.zst
sudo tar --zstd -C /usr -xf /tmp/o.tar.zst     # demora ~5-10 min
sudo systemctl daemon-reload && sudo systemctl restart ollama
ollama pull tev1:0.8b                          # 811 MB
```
`/v1/systemone` só existe a partir do Ollama **0.35**. Verificar:
`curl -s -o /dev/null -w '%{http_code}' -X POST localhost:11434/v1/systemone -d '{}'`
→ `400` significa que o endpoint existe (payload inválido); `404` significa versão antiga.

## Gate de confiança do classificador (corrigido em 2026-09-30)
O `confidence` que o tev1 devolve é **entropia normalizada**, não probabilidade:
fica baixo mesmo quando o acerto é certo. Amostras reais com a classe CORRETA:

| caso | classe | confidence | probabilidade |
|---|---|---|---|
| container | quick_command | 0.700 | 0.889 |
| notebook | document_knowledge | 0.332 | 0.687 |
| script python | write_script | 0.703 | 0.861 |
| failover túnel | architecture_and_concurrency | 0.264 | 0.522 |
| Go deadlock | architecture_and_concurrency | 0.592 | 0.817 |

Gatear em `confidence >= 0.6` fazia **fail-open em 3 de 5 casos corretos**.
O sinal honesto é a **probabilidade da opção escolhida** (`probabilities[choice]`).
Limiar `0.45` aceita todos os acertos (0.52–0.89) e ainda pega um classificador
genuinamente dividido. `confidence` fica só para telemetria.
