# Plano de Migração — 9Router → ZRouter (cutover da porta 20128)

**Decisão do dono:** migrar os dados, **sem virar bagunça**.

Este documento é o plano. Nada aqui foi executado ainda.

---

## 1. Inventário real (medido agora)

| Item | 9Router (produção) | ZRouter (dev) |
|---|---|---|
| Conexões de provider | **18** | 0 |
| API keys | **12** | 0 |
| Combos | **12** | 0 |
| providerNodes | 0 | 0 |
| Tabelas no esquema | 12 | 12 |

**Diferença de esquema:** apenas `apiKeys.sources` (coluna nossa, default `'{}'`). Todo o resto é
idêntico — a migração é cópia de linhas, não transformação.

### Conexões (18)
antigravity ×2 · openai ×2 · codex · deepseek · fireworks · glm · groq · huggingface · nvidia ·
ollama · ollama-local · opencode-go · openrouter · tavily · xai · xiaomi-tokenplan

**11 ativas**, 7 desativadas (`isActive = 0`).

### Keys (12)
`eve` · `evos` · `PrimeAgent` · `Mile` · `ArianeMathias` · `Summary` · `OCR` · `ViniciusMathias` ·
`zrouter` · 3 de serviço (`hindsight-internal`, `hermes-vision`, `hermes-audio`)

5 ativas, 7 inativas. Duas têm bank Neo4j: `ArianeMathias` (ariane.mathias), `ViniciusMathias`,
`eve`, `zrouter`.

### Combos (12)
`OCR` · `Summary` · `code` · `prime-audio` · `prime-codes` · `prime-compressions` ·
`prime-vision` · `ariane.mathias` · `mile` · `vinicius.mathias` · `zrouter` · **`hindsight`**

### Settings
`rtkEnabled` · `cavemanEnabled` · `ponytailEnabled` (compressão) · `comboStrategies` ·
`providerStrategies` · `providerThinking` · `capacityAdapter` · `globalInstructions` (4413 chars —
o do 9Router, **não** o novo enxuto do zrouter) · `password` (hash bcrypt do dashboard)

---

## 2. Decisões de escopo (o "sem virar bagunça")

### 2.1 O QUE MIGRA
Tudo que faz o gateway funcionar: **conexões, keys, combos, settings** (exceto os itens de 2.2).

### 2.2 O QUE **NÃO** MIGRA — e por quê

| Item | Decisão | Motivo |
|---|---|---|
| Combo **`hindsight`** | **NÃO migrar** | O dono removeu o Hindsight do ZRouter. Migrar um combo que aponta para o backend removido é bagunça garantida. |
| Key **`hindsight-internal`** | **NÃO migrar** | Chave de serviço do Hindsight — não existe no ZRouter. |
| `memoryBackend: "hindsight"` | **Normalizar para `neo4j`** | A migração 004 já faz isso; aplique no destino. |
| `settings.globalInstructions` | **NÃO sobrescrever o do ZRouter** | O ZRouter já tem o texto novo (2015 chars) documentando os blocos `ZROUTER_*`. O do 9Router descreve `9ROUTER_*` — importar reverteria o rebranding. **Este é o erro mais fácil de cometer.** |
| `settings.password` | **Manter o do ZRouter** | O hash bcrypt atual do zrouter foi definido pelo dono (`(senha removida)`). Não trazer o do 9Router. |
| Combos/keys que apontam para combos removidos | **Pular** | Uma key cujo `comboId` não migrou ficaria órfã. Validar integridade antes. |

### 2.3 Órfãos que a migração precisa resolver
- Key `hindsight-internal` → combo `hindsight` (ambos ficam de fora: consistente)
- As 12 keys referenciam 10 combos distintos — todos migram exceto `hindsight`

**Regra:** nenhuma linha migra com FK apontando para algo que ficou fora.

---

## 3. Procedimento (a executar SÓ com aprovação)

### Fase 0 — Preparação
1. Backup dos dois bancos:
   - `/opt/containers/9router/data/db/data.sqlite` → `.bak-premigracao-<ts>`
   - `/opt/containers/zrouter/data/db/data.sqlite` → `.bak-premigracao-<ts>`
2. Confirmar que o zrouter dev (20129) está parado ou será reiniciado depois
3. **Desligar o auto-updater:** `crontab -l | grep -v auto-update-9router | crontab -`
   ⚠️ Sem isso, às 02:02 o script sobrescreve o fork com a imagem do Docker Hub.

### Fase 1 — Migração (script, não SQL solto)
Escrever `scripts/migrate-from-9router.mjs` que:
- Lê a origem em **modo somente-leitura** (`?mode=ro`)
- Copia para o destino dentro de **uma transação** (rollback total em erro)
- Mapeia colunas explicitamente (não `INSERT INTO ... SELECT *` — esquemas podem divergir)
- Aplica as exclusões de 2.2
- Normaliza `memoryBackend` → `neo4j`
- Preenche `apiKeys.sources` com `'{}'` (default do ZRouter)
- Valida FKs antes de inserir; aborta se achar órfão
- Emite relatório: quantas linhas por tabela, quantas puladas e por quê

### Fase 2 — Verificação no dev (20129) **antes** do cutover
1. `zrouter` na 20129: dashboard lista os 18 providers, 12 keys, 11 combos
2. `/api/sources/status` → neo4j `ok`, open-notebook `ok`
3. Uma **geração real** por uma key migrada (ex.: `eve`) — prova que as credenciais vieram
4. Uma key que apontava para o combo `hindsight` (se houver) não deve existir quebrada
5. Nenhuma credencial vazando em log

### Fase 3 — Cutover da porta
Só depois de 1-2 verdes:
1. Parar o `9router` (`docker stop 9router`)
2. Subir o `zrouter` com `PORT=20128` (ajustar compose ou env)
3. Validar: `/api/health`, `/v1/models`, `https://zrouter.itms.com.br` → **ZRouter**
4. Validar uma geração real pelo domínio
5. Se falhar → **rollback**: parar zrouter, subir 9router de volta

### Fase 4 — Pós-cutover
1. Manter o 9Router parado (não remover) por alguns dias — é o rollback
2. Confirmar que o auto-updater continua desligado
3. Atualizar `globalInstructions` se necessário (já está correto no ZRouter)
4. Registrar em `docs/` o que foi migrado

---

## 4. Riscos e o que os mitiga

| Risco | Mitigação |
|---|---|
| Importar `globalInstructions` do 9Router e reverter o rebranding | Excluído explicitamente (2.2) — validar depois com `grep ZROUTER_` |
| Sobrescrever a senha do dashboard | `password` fica de fora |
| Trazer o combo `hindsight` e quebrar | Excluído; keys órfãs validadas |
| Auto-updater sobrescrever o fork às 02:02 | Desligar ANTES do cutover |
| Cutover sem rollback | 9Router fica parado, não removido |
| Perda de dados na migração | Backup dos dois bancos + transação única |
| Credencial vazando em log durante a migração | Script não imprime valores de `apiKey`/`key` — só contagens |

---

## 5. Estado atual

- **Entrega 6 publicada** (`332ce383`) — rebranding completo, 10 skills versionadas, blocos `ZROUTER_*`
- ZRouter dev (20129) funcional e **vazio** de dados de produção
- Domínio `zrouter.itms.com.br` → porta 20128 (aguardando o cutover)
- 9Router de produção rodando, **intocado**

**Próximo passo:** escrever o `scripts/migrate-from-9router.mjs` e rodar a Fase 0+1+2 (dev,
sem tocar em produção). O cutover (Fase 3) só com aprovação explícita.
