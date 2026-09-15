# Pipeline de Updates — ZRouter (fork do 9Router)

Como absorver melhorias do upstream (9Router, OmniRoute) **sem quebrar os customs** do ZRouter.

---

## 1. Por que isto é gerenciável (medido, não estimado)

Comparação real da árvore do ZRouter contra a tag base do upstream (`v0.5.75`):

| Métrica | Valor |
|---|---|
| Arquivos na base v0.5.75 | 1.291 |
| Arquivos **criados** por nós | **41** |
| Arquivos **removidos** por nós | 2 |
| Arquivos comuns à base | 1.558 |
| Arquivos **modificados** por nós | **78 (5%)** |

**Conclusão:** 95% da base é upstream intocado. O risco está concentrado em 78 arquivos.
Este é o número que a pipeline precisa proteger — não os 1.500.

### Pontos de acoplamento (onde os conflitos vão doer)

Ordenados por risco (tamanho × centralidade):

| Arquivo | Categoria | Estratégia |
|---|---|---|
| `open-sse/rtk/identity.js` | **NOSSO** (injeção de contexto) | arquivo nosso; upstream não tem → nunca conflita |
| `open-sse/sources/*` | **NOSSO** (contrato de fontes) | idem |
| `src/lib/sources/*`, `src/shared/constants/capabilities.js` | **NOSSO** | idem |
| `src/sse/handlers/chat.js` (17,8 KB) | **MODIFICADO** ⚠️ | upstream mexe muito (roteamento) — conflito provável |
| `src/app/(dashboard)/dashboard/providers/[id]/page.js` (75 KB) | **MODIFICADO** ⚠️ | acrescentamos `ModelSyncControls`/`DiscoverModelsModal` |
| `src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js` (66 KB) | **MODIFICADO** ⚠️ | acrescentamos `SourcesSection` |
| `src/shared/components/Sidebar.js` | **MODIFICADO** ⚠️ | removemos 9Remote/9English, trocamos logo |
| `public/i18n/literals/*.json` (6 arquivos) | **MODIFICADO** | removemos chaves 9Remote/9English — conflito trivial, regenerável |
| `open-sse/providers/shared.js` | **MODIFICADO** ⚠️ | credenciais OAuth migradas para env |
| `open-sse/providers/registry/{gemini,gemini-cli,antigravity}.js` | **MODIFICADO** ⚠️ | removemos clientId/clientSecret mortos |
| `Dockerfile`, `.env.example`, README | **MODIFICADO** | nossos; upstream também mexe |

---

## 2. Regra de ouro: **NUNCA rebase — sempre MERGE**

Rebase (ou `pull --rebase`) reescreve nossos 13 commits por cima do upstream e vai gerar
conflito **em cada commit nosso**, um por um. É lento e perigoso.

**Use merge de tag upstream para uma branch de integração.** Um único ponto de conflito,
resolvido uma vez, com histórico preservado.

---

## 3. Preparação (uma vez só, hoje)

### 3.1 Registrar a base atual como tag
```bash
cd /opt/containers/zrouter
git tag -a zrouter-base-v0.5.75 -m "Upstream 9Router v0.5.75 (base do fork)"
git push origin zrouter-base-v0.5.75
```

### 3.2 Adicionar o upstream como remote
```bash
git remote add upstream https://github.com/decolua/9router.git
git fetch upstream --tags
```

### 3.3 Congelar o inventário de customs (a "linha de base")
O script `scripts/update/audit-customs.mjs` (Parte 6) gera `docs/CUSTOMS.md`:
para cada um dos 78 arquivos modificados, **o que exatamente mudamos**. Este documento é a
memória do fork — sem ele, cada update vira arqueologia.

```bash
node scripts/update/audit-customs.mjs --base v0.5.75 --out docs/CUSTOMS.md
```

---

## 4. A pipeline (a cada update do upstream)

### FASE 0 — Detecção (automática, cron semanal)

```bash
scripts/update/check-upstream.sh
```
- Faz `git fetch upstream --tags`
- Compara a tag mais nova com `zrouter-base-*`
- Se houver tag nova: abre uma issue/notifica com o resumo do CHANGELOG e
  **a lista de arquivos que o upstream tocou entre as duas tags**
- **Não** toca em nada — apenas avisa

**Critério de triagem:** só vale atualizar se o upstream mexeu em algum dos nossos pontos de
acoplamento da tabela acima, OU se traz correção de segurança/breaking de provider.
Update que toca apenas arquivos que nunca tocamos = merge trivial, pode acumular.

### FASE 1 — Branch de integração (sempre isolada)

```bash
git checkout -b update/v0.5.80 main
git merge --no-commit --no-ff upstream/v0.5.80
git diff --name-only --diff-filter=U   # os conflitos
```

**Nunca** faça isso na `main`. A `main` só recebe o merge já validado.

### FASE 2 — Resolução assistida por Prime Agent

Para cada arquivo em conflito, o Prime Agent recebe:
1. O `docs/CUSTOMS.md` (o que nós mudamos naquele arquivo, com justificativa)
2. As três versões: base (ancestral comum), nossa (`main`), deles (`upstream`)
3. A instrução: **manter o comportamento nosso + adotar a mudança deles**, quando compatíveis

O contrato de resolução (escrever em `docs/update/PROMPT-RESOLVE.md`, gerado pelo script):

> Você resolve conflitos de merge num fork. Regra absoluta: **as customizações do ZRouter são
> requisitos, não preferências** — elas não podem ser descartadas para "facilitar" o merge.
> Se a mudança do upstream for incompatível com um custom, **pare e reporte** em vez de
> escolher sozinho. Nunca remova um teste do ZRouter para passar o build. Nunca reintroduza
> credencial literal (os OAuth clients vivem em `process.env`).

### FASE 3 — Verificação obrigatória (portão de qualidade)

Roda tudo, e **falha o update inteiro** se qualquer item falhar:

```bash
scripts/update/verify-update.sh
```
1. **Suíte de customs:** todas as suítes do ZRouter verdes
   (`sources-*`, `capabilities-*`, `ensure-bank-*`, `memory-backend-*`, `react-hook-imports`,
   `color-themes`, `model-*`, `antigravity-oauth-client`)
2. **Ausência de credencial:** `scripts/update/scan-secrets.sh` — o repositório é **público**;
   qualquer `GOCSPX-`/`sk-`/token reintroduzido pelo upstream **bloqueia o update** e vira um
   commit de correção nosso
3. **Customs presentes:** o script confere que os arquivos-marcadores continuam existindo e
   com o conteúdo esperado (ex.: `SOURCES_MARKER` em `identity.js`, `enableBank` com `MERGE`
   em `neo4j.js`, a linha do Neo4j no `docker-compose.yml`)
4. **Build:** `npm run build` com RC=0
5. **Não-regressão:** compara a saída das suítes com a do `main` — falhas **novas** bloqueiam;
   as falhas pré-existentes conhecidas são ignoradas por lista explícita

### FASE 4 — Revisão humana (você)

Só depois de 1-4 verdes:
- Abrir a branch `update/v0.5.80` no dashboard em **porta de staging** (ex.: 20130), nunca 20129
- Você valida: dashboard carrega, provider page abre, fontes respondem, tema ITMS intacto
- Aprovação explícita sua antes de qualquer merge na `main`

### FASE 5 — Promoção e registro

```bash
git checkout main
git merge --no-ff update/v0.5.80
git tag -a zrouter-base-v0.5.80 -m "Upstream 9Router v0.5.80 absorvido"
git push origin main --tags
node scripts/update/audit-customs.mjs --base v0.5.80 --out docs/CUSTOMS.md   # atualiza a memória
```

O novo `zrouter-base-*` é a âncora do próximo ciclo.

---

## 5. Estratégia por tipo de arquivo (evita 80% dos conflitos)

### A. Isolar o que é nosso em arquivos próprios
Cada vez que precisar mexer num arquivo do upstream, avalie: **dá para extrair em arquivo
nosso?** Um import + uma chamada de uma linha conflita muito menos que 200 linhas editadas.

**Exemplos já feitos (corretos):**
- `open-sse/sources/*` — todo o contrato de fontes em arquivos nossos; `chat.js` só importa
- `src/lib/sources/context.js` — lógica de recall fora do handler
- `src/shared/constants/capabilities.js` — bloco derivado, fora do `identity.js` do upstream

**Regra:** se `chat.js` ou `page.js` precisar de mais de ~15 linhas nossas, extraia.

### B. Ponto de extensão único por arquivo marcado
Nos arquivos que **precisamos** editar, concentre nossa mudança num bloco marcado:

```js
// ─── ZROUTER:CUSTOM BEGIN (sources-injection) ───
// mantido em docs/CUSTOMS.md — não remover no merge
...
// ─── ZROUTER:CUSTOM END ───
```

Isso torna a resolução mecânica: o agente localiza os marcadores e preserva os blocos.

### C. Arquivos que deveriam ser nossos por inteiro
Se a edição crescer, mova o arquivo para `zrouter/` e mantenha um shim de 1 linha no lugar
do original. Assim o upstream recebe updates livremente e o nosso nunca conflita.

### D. i18n e assets gerados
`public/i18n/literals/*.json`: nossas remoções (9Remote/9English) são triviais. **Aceite a
versão do upstream** e reaplique a limpeza com um script (`scripts/update/strip-legacy-labels.mjs`)
— não guarde conflito manual em 6 arquivos JSON de 146 KB.

---

## 6. Scripts a criar (Parte prática — Entrega 6)

Todos em `scripts/update/`, executáveis e testáveis:

| Script | Função |
|---|---|
| `check-upstream.sh` | fetch + comparar tags + relatório de impacto (quais dos 78 arquivos o upstream tocou). Saída JSON para o cron |
| `audit-customs.mjs` | gera `docs/CUSTOMS.md`: para cada arquivo modificado, o diff resumido vs. a base. É a memória do fork |
| `prepare-merge.sh` | cria a branch, faz `merge --no-commit`, escreve `docs/update/PROMPT-RESOLVE.md` com o contexto para o Prime Agent |
| `verify-update.sh` | os 5 portões da Fase 3; RC≠0 bloqueia |
| `scan-secrets.sh` | varredura de segredo (repo é público). Falha se achar |
| `check-customs-markers.sh` | confere que cada custom marcado continua presente |
| `strip-legacy-labels.mjs` | reaplica a remoção de 9Remote/9English nos i18n |

**Integração com o Prime Agent:** o `prepare-merge.sh` já deixa o prompt pronto; basta
`prime-agent --provider 9router --model prime-codes -p "$(cat docs/update/PROMPT-RESOLVE.md)"`.
O agente resolve, o `verify-update.sh` julga, você aprova.

---

## 7. Automação (cron)

**Semanal (segunda, 9h):** `check-upstream.sh` → notifica se há tag nova e o impacto.
**Sob demanda:** as fases 1-3 quando você decidir atualizar.

Um update **nunca** roda sozinho até a `main`. A pipeline para na Fase 4 esperando você.

---

## 8. Regras invioláveis do fork

1. **Nunca `rebase`** — sempre `merge` da tag upstream
2. **Nunca** atualizar direto na `main`
3. **Nunca** aceitar update que reintroduza credencial (repo é público)
4. **Nunca** remover um teste nosso para fazer o build passar
5. **Custom perdido = update falhou**, mesmo com build verde
6. **Sempre** registrar o novo `zrouter-base-*` e regenerar `docs/CUSTOMS.md`
7. Staging em porta isolada (20130), **nunca** validar em 20129/20128
8. O Neo4j e o 9Router de produção **nunca** entram no caminho de um update
