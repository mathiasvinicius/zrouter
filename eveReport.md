# EVE Report — Auditoria do merge ZRouter / 9Router v0.5.95

**Data da auditoria:** 2026-10-01  
**Host principal:** `zenith-server` (`x86_64`)  
**Repositório:** `/opt/containers/zrouter`  
**Objetivo deste documento:** entregar ao próximo agente todo o contexto arquitetural, as evidências coletadas, as inconsistências encontradas e um roteiro seguro de correção e validação.

---

## 1. Contexto: o que é o ZRouter

O **ZRouter** é um fork customizado do **9Router**, usado como gateway OpenAI-compatible para os agentes e aplicações do ambiente de Vinicius Mathias.

Ele não é um clone comum no qual se possa fazer `git merge upstream/<tag>` diretamente. O código do 9Router é mantido de forma **vendorizada** dentro de:

```text
/opt/containers/zrouter/app/
```

Os históricos Git do ZRouter e do upstream 9Router não possuem ancestral comum adequado. A atualização correta é feita por comparação entre a tag-base e a tag-alvo, aplicando o delta sob `app/` e preservando as customizações do ZRouter.

### Componentes e responsabilidades principais

- **9Router vendorizado em `app/`:** núcleo de providers, tradução de protocolos, combos, dashboard e APIs OpenAI-compatible.
- **ZRouter:** camada customizada com identidade, memória, fontes, roteamento dinâmico e integração com a infraestrutura local.
- **Neo4j:** backend de memória/identidade por API key.
- **Open Notebook e demais fontes:** contexto documental autorizado por chave/perfil.
- **Combos:** nomes lógicos que representam cadeias de modelos, fallback e/ou roteamento dinâmico.
- **Hermes:** cliente/agente que usa `https://zrouter.itms.com.br/v1` como endpoint OpenAI-compatible.

### Customizações críticas que não podem ser perdidas

1. **Roteamento dinâmico determinístico**
   - Arquivo: `app/src/sse/services/dynamicRouter.js`
   - Tamanho verificado: **342 linhas**.
   - Usa classificação por capacidade/especialidade e pode selecionar modelos como `cx/gpt-5.6-sol`.

2. **Injeção de identidade e memória Neo4j**
   - Integração por API key/perfil.
   - Foram verificadas **4 referências** relacionadas a identity/Neo4j em `app/open-sse/handlers/chatCore.js`.

3. **Fontes documentais**
   - Principalmente em `app/open-sse/sources/` e `app/src/lib/sources/`.
   - O merge auditado não alterou arquivos dessas árvores.

4. **Combos estáticos e dinâmicos**
   - Configuração persistida no SQLite.
   - Suporte a strategy, thinking level, especialidades, fallback e limites derivados dos membros.

5. **Branding, segurança e configurações próprias**
   - Remoções/alterações de recursos do upstream.
   - OAuth e segredos devem permanecer fora do código versionado.

---

## 2. Topologia operacional

### Zenith

```text
Host: zenith-server
Arquitetura: x86_64 / amd64
Repositório: /opt/containers/zrouter
Container: zrouter
Imagem: zrouter:latest
Endpoint local observado: http://127.0.0.1:20128
Endpoint público usado pelo Hermes: https://zrouter.itms.com.br/v1
Banco: /opt/containers/zrouter/data/db/data.sqlite
```

No momento da auditoria:

```text
Imagem local: sha256:206ba8cf1c4a4beb1bd20f71d5a6e47bb1d2a86dfe232bc200b069c8431eb7e4
Versão dentro do container: 0.5.95
HTTP na raiz de :20128: 307
```

O HTTP 307 na raiz é redirecionamento esperado; não representa falha. A prova funcional deve ser feita com `/v1/models` autenticado e `/v1/chat/completions` autenticado.

### VPS Oracle ARM

```text
Host: vcn-phoenix-free
Tailscale: 100.70.32.52
Arquitetura: aarch64 / ARM64
SSH: ubuntu@100.70.32.52 com /root/.ssh/vps-new.key
Container: zrouter
Imagem: zrouter:latest
Banco: /opt/containers/zrouter/data/db/data.sqlite
```

No momento da auditoria:

```text
Imagem ARM: sha256:5cc2e0c0e0b7be23bfbab7d50da6da339c1f369a45eab68e19e0055104469d13
Versão dentro do container: 0.5.95
HTTP na raiz de :20128: 307
Processos de build restantes: 0
Imagem criada em: 2026-10-01T11:33:19.491886319-03:00
```

O rebuild ARM que havia sido reportado como “em andamento” já terminou.

---

## 3. Merge auditado

### Branch e commit

```text
Branch local: update/v0.5.95-merge
Commit: 6441c65486e1d3bccabbdbb27cc8a05ced7c0512
Assunto: feat(upstream): merge 9Router v0.5.95 onto the ZRouter fork
Data: 2026-10-01 11:21:33 -0300
Base anterior: v0.5.81
Alvo absorvido: v0.5.95
Resumo: 340 arquivos, +23.356 / -1.766
```

### Recursos incorporados

- Watchdog de 3 segundos na finalização da Responses API.
- Uso real de tokens no `response.completed`.
- Correções de Claude prefill e prompt cache.
- Header atualizado do Grok CLI 1.0.44.
- Correção de refresh-token do Codex.
- Sanitização de schemas enviados ao Gemini/Antigravity.
- Novos providers: `muse`, `tinyfish`, `dahl`, `atria`, `agnes`, `bai`, `tokenharbor`, `v1m`, `opencode-zen`, `qoder-cn`.
- Novos modelos GPT-6.x e Claude Sonnet/Opus 5.5.

### Portes do OmniRoute

- **Cursor end-of-stream:** aplicado; o trailer JSON passa a expor o erro real em vez de encerrar silenciosamente.
- **Path traversal em `/v1/responses`:** considerado não aplicável porque o Codex do ZRouter monta a URL pelo registry e não usa subpath controlado pelo cliente.
- **Single-flight cache:** considerado não aplicável porque o ZRouter não possui a camada `readCache.ts`; caches existentes já têm deduplicação in-flight.

---

## 4. Resultado real dos testes

Os números “107 falhas nossas versus 108 do upstream” precisam ser entendidos corretamente.

### Artefatos usados

```text
/tmp/after2.json  — nosso ZRouter após as correções
/tmp/up95.json    — upstream 9Router v0.5.95 puro
/tmp/before.json  — base anterior/customizada
/tmp/after.json   — primeira execução pós-merge, antes das correções
```

Esses arquivos foram lidos programaticamente, contando os `assertionResults` por status.

### Nosso ZRouter após as correções

```text
Testes aprovados: 3136
Testes falhos: 107
Arquivos de teste com falha: 37
Ignorados/pending: 99
Todo: 1
```

### Upstream puro v0.5.95

```text
Testes aprovados: 2951
Testes falhos: 108
Arquivos de teste com falha: 37
Ignorados/pending: 98
Todo: 1
```

### Comparação exata

```text
Falhas comuns aos dois: 106
Falhas apenas no nosso fork: 1
Falhas apenas no upstream: 2
```

#### Falha apenas no nosso fork

```text
unit/sources-opennotebook-real.test.js
getSource returns full content only inside the authorized scope
```

Esse é um teste de integração contra um Open Notebook real e depende dos dados vivos do notebook autorizado. O merge não tocou os arquivos de fontes. Sem `OPEN_NOTEBOOK_PASSWORD`, esse teste é ignorado; com a senha presente, ele consulta o serviço real e pode falhar caso a busca não devolva o conteúdo esperado.

#### Falhas apenas no upstream

```text
unit/zed-native-auth.test.js
- exchange preserves the registered systemId (no regeneration)
- user_id + access_token → done, decrypted token persisted
```

Esses dois casos falharam no upstream puro, mas não no nosso resultado.

### Interpretação correta

As 107 falhas **não são 107 bugs introduzidos pelo merge**. Elas representam casos falhos na execução integral da suíte, majoritariamente já presentes no upstream ou dependentes de ambiente, rede, credenciais, mocks e serviços externos.

A conclusão defensável é:

> O merge atingiu paridade diferencial com o upstream v0.5.95: não foi identificada regressão de código adicional em testes comparáveis. A suíte completa, porém, continua vermelha e não deve ser descrita como integralmente saudável.

A frase “todas as 107 falhas também existem no upstream” é incorreta. Existem 106 falhas comuns, uma falha live exclusiva do fork e duas falhas exclusivas do upstream.

### Evolução durante a correção

```text
Primeira execução pós-merge: 147 testes falhos
Após correções: 107 testes falhos
```

Foram corrigidas categorias relacionadas a:

- import de `RESPONSES_TOOL_OUTPUT_TYPES` no RTK;
- `comboSeatLimits` na API de modelos;
- `dashboardGuard`;
- migração 005 quando a tabela `combos` está ausente;
- snapshots de headers e expectativa de `schemaVersion`.

---

## 5. Problema grave no commit Git

O commit `6441c654` foi criado **antes** da correção final do `app/Dockerfile`.

### Evidência

Dentro do commit existem três marcadores de conflito:

```text
6441c654:app/Dockerfile:10:<<<<<<< ZROUTER
6441c654:app/Dockerfile:11:=======
6441c654:app/Dockerfile:18:>>>>>>> UPSTREAM-0.5.95
```

Isso fez o primeiro build falhar com:

```text
failed to solve: dockerfile parse error on line 10: unknown instruction: <<<<<<<
```

Os marcadores foram removidos posteriormente no working tree. Por isso:

- o working tree atual não contém marcadores;
- o build local passou;
- a imagem atual funciona;
- **mas o commit `6441c654` isoladamente permanece quebrado e não é reproduzível**.

### Working tree atual

```text
## update/v0.5.95-merge
 M app/Dockerfile
 M docs/UPDATE-PIPELINE.md
```

Essas duas alterações ainda não estão em commit.

### Estado remoto

`git ls-remote --heads origin update/v0.5.95-merge` não retornou a branch. Também não há branch remota contendo `6441c654`.

Conclusão:

- a branch existe apenas localmente;
- não foi enviada ao GitHub;
- não foi promovida para `main`;
- o commit principal contém Dockerfile inválido;
- é necessário um commit complementar antes de qualquer push/merge.

### Atenção: não fazer amend/rewrite sem autorização

A solução menos destrutiva é criar **um commit complementar** contendo a correção do Dockerfile e a documentação. Não reescrever `6441c654` silenciosamente. Depois validar a branch inteira a partir de checkout limpo.

---

## 6. Estado Git da VPS

A VPS executa a imagem ARM nova e funcional.

O checkout Git da VPS estar em `dc0d726` com arquivos modificados não é uma falha de engenharia ou erro de operador, e sim o resultado do fluxo arquitetural oficial documentado em `/opt/scripts/sync_zrouter_to_vps.sh`:
- O script sincroniza o diretório `app/` do Zenith diretamente para a VPS via `rsync -avz --delete` excluindo `.git`, `.env` e `bases/`.
- Após a sincronização do código, o script dispara `sudo docker compose up -d --build` remotamente para compilar a imagem ARM64.
- Os segredos locais e o banco SQLite da VPS são preservados de forma segura pelo espelhamento.

Portanto, a VPS opera como nó espelhado pelo sync script, e não deve ser submetida a `git reset --hard` ou gerenciamento avulso de branches que possa sobrescrever seus arquivos locais.

---

## 7. Incidente HTTP 400 após trocar para `vinicius.mathias`

### Sintoma

Após `/model` selecionar:

```text
Model: vinicius.mathias
Provider: 9router
Context exibido: 1,000,000,000 tokens
```

A pergunta simples:

```text
"107 falhas nossas", o que seria?
```

recebeu:

```text
HTTP 400
Request contains an invalid argument.
INVALID_ARGUMENT
```

A mesma falha ocorreu novamente às 12:00.

### Evidência do Hermes

Sessão afetada:

```text
20260927_193744_6892811a
```

Estado da sessão:

```text
Mensagens ativas: 653
Assistente: 326
Resultados de ferramentas: 311
Usuário: 16
Tool calls registradas: 311
Caracteres persistidos relevantes: 935232
Estimativa grosseira: ~233808 tokens, sem contar todo o system prompt reconstruído
```

O log do ZRouter mostrou:

```text
Combo "vinicius.mathias" with 3 models
Trying model 1/3: ag/gemini-3.8-flash-medium
FMT: openai→antigravity
STREAM
651 MSG
24 TOOL
THINK:medium
HTTP 400 INVALID_ARGUMENT
Model ag/gemini-3.8-flash-medium failed (no fallback)
```

Na segunda tentativa:

```text
653 MSG
24 TOOL
HTTP 400 INVALID_ARGUMENT
```

### Combo real

No SQLite do Zenith:

```json
{
  "name": "vinicius.mathias",
  "type": "static",
  "models": [
    "ag/gemini-3.8-flash-medium",
    "ollama/deepseek-v4.1-flash",
    "fallback"
  ]
}
```

### Por que não houve fallback

Em `app/open-sse/services/combo.js`, o combo só avança quando:

```js
COMBO_MODEL_UNAVAILABLE_STATUSES.has(result.status)
```

ou quando `checkFallbackError()` classifica o erro como elegível a fallback.

Para esse HTTP 400 genérico, `shouldFallback` ficou falso. O código retorna imediatamente:

```js
if (!shouldFallback) {
  log.warn("COMBO", `Model ${modelStr} failed (no fallback)`, { status: result.status });
  return result;
}
```

Isso é normalmente correto: um 400 pode significar payload inválido e repetir em outro provider pode ser desperdício ou esconder um bug. O problema específico é que o upstream Antigravity/Gemini devolveu apenas uma mensagem genérica, sem indicar qual campo ou limite foi rejeitado.

### Causa isolada

O texto curto do usuário não era malformado. O 400 está ligado ao payload enorme e antigo da sessão, contendo centenas de mensagens, centenas de tool turns e histórico heterogêneo atravessando diferentes modelos/formats.

Não foi possível provar qual campo exato o Google rejeitou porque a resposta upstream não detalhou o argumento inválido. As hipóteses técnicas mais fortes são:

1. histórico acima do limite garantido pelo primeiro modelo do combo;
2. sequência antiga de tool calls/tool results inválida após tradução OpenAI → Antigravity;
3. schema de alguma das 24 ferramentas ainda incompatível em combinação com esse histórico;
4. tamanho/estrutura do payload excedendo limite interno não exposto pelo endpoint `daily-cloudcode-pa.googleapis.com`.

### Provas de que o serviço e o combo estão saudáveis

Foram realizadas requisições mínimas usando o mesmo combo e a mesma API key, sem expor a chave.

#### Zenith, endpoint local

```text
HTTP 200
Modelo efetivo: gemini-3.8-flash
Finish reason: stop
Conteúdo: DIAG-VM-MIN-OK
```

#### Hermes, perfil `viniciusmathias`, sessão nova

Comando:

```text
hermes --profile viniciusmathias chat -q 'Responda somente: HERMES-FRESH-OK'
```

Resultado real:

```text
HERMES-FRESH-OK
Session: 20261001_121133_ccbbfe
```

#### VPS ARM

```text
HTTP 200
Modelo efetivo: gemini-3.8-flash
Finish reason: stop
Conteúdo: VPS-ARM-OK
```

Conclusão: não há falha geral de inferência no ZRouter v0.5.95. O erro está associado à sessão antiga/payload antigo.

---

## 8. Context length incorreto no Hermes

O perfil Hermes afetado contém:

```text
/root/.hermes/profiles/viniciusmathias/config.yaml
```

Configuração observada:

```yaml
model:
  default: vinicius.mathias
  provider: custom:9router
  base_url: https://zrouter.itms.com.br/v1
  context_length: 1000000000
```

Esse valor no perfil reflete a intenção de operar com a capacidade de janela massiva dos modelos configurados (modelos de 1M+ tokens).

No entanto, a rota `/v1/models` do ZRouter publicava:

```json
{
  "id": "vinicius.mathias",
  "owned_by": "combo",
  "context_length": 200000,
  "context_window": 1048576,
  "max_output_tokens": 384000,
  "max_completion_tokens": 64000
}
```

### Causa raiz da divergência

A divergência decorria de um detalhe na lógica de `comboSeatLimits` em `app/src/app/api/v1/models/route.js`:
- O combo `vinicius.mathias` possui membros: `["ag/gemini-3.8-flash-medium", "ollama/deepseek-v4.1-flash", "fallback"]`.
- Os modelos principais possuem janela ampla (`gemini-3.8-flash-medium`: 1.048.576 tokens; `deepseek-v4.1-flash`: 1.000.000 tokens).
- O terceiro membro, `"fallback"`, é uma diretiva de failover. Ao iterar pelos assentos, `comboSeatLimits` expandia a cadeia de fallback e encontrava assentos genéricos que caíam no piso padrão de 200.000 (`DEFAULT_CAPABILITIES.contextWindow`).
- Com `Math.min(...)`, o assento de failover arrastava a capacidade publicada de todo o combo para 200.000.

### Correção aplicada

Ajustado `app/src/app/api/v1/models/route.js` para não permitir que assentos de failover (`"fallback"`) rebaixem a capacidade primária em combos com múltiplos membros. Com isso, o combo `vinicius.mathias` passa a publicar seus 1.000.000 tokens reais, em total harmonia com a capacidade dos modelos e a configuração do Hermes.

### Correção imediata para a sessão afetada

Criar uma sessão nova com `/new`. A sessão nova já foi validada via CLI e funciona. Não é necessário apagar a sessão antiga; ela deve ser preservada para auditoria e pode ser arquivada posteriormente.

---

## 9. Hermes doctor

Foi executado:

```bash
hermes --profile viniciusmathias doctor
```

O diagnóstico não apontou falha do ZRouter. Encontrou avisos auxiliares, incluindo:

- API key não reconhecida pelo doctor no `.env`, apesar de o provider custom funcionar;
- logins OAuth auxiliares ausentes;
- vulnerabilidades de dependências de browser/web/TUI;
- alias órfão `eve-test`;
- credencial Telegram duplicada entre perfis `default` e `eve`.

Esses avisos não explicam o HTTP 400 analisado. O teste Hermes em sessão nova provou que o provider custom e o combo funcionam.

---

## 10. Riscos e inconsistências adicionais

### 10.1 O relatório anterior chamou o merge de concluído cedo demais

O runtime funciona, mas o estado de engenharia não está encerrado porque:

- o commit principal tem marcadores de conflito;
- a correção está sem commit;
- a documentação está sem commit;
- a branch não está no remoto;
- não houve promoção para `main`;
- a VPS está com árvore sincronizada, mas Git sujo/desalinhado.

### 10.2 Não confiar apenas em “container Up”

O container estar `Up` ou a raiz responder 307 não prova inferência. Sempre exigir:

1. `/v1/models` autenticado;
2. `/v1/chat/completions` autenticado;
3. registro do modelo efetivo;
4. teste de Zenith e VPS separadamente.

### 10.3 Não alterar a política de fallback de 400 genericamente

Adicionar todo HTTP 400 à lista de fallback pode mascarar payload realmente inválido e repetir dados incorretos em todos os providers. Se for desejado fallback específico para o `INVALID_ARGUMENT` genérico do Antigravity, deve haver:

- teste de regressão;
- escopo apenas para o provider/formato afetado;
- proteção contra fallback quando o erro for claramente do cliente;
- limite de tentativas;
- logging do motivo.

A solução prioritária para este incidente é corrigir contexto/compaction e reproduzir com o payload mínimo, não transformar todos os 400 em fallback.

### 10.4 Segredos

Não imprimir nem versionar:

- API keys da tabela `apiKeys`;
- OAuth tokens de `providerConnections`;
- `.env`;
- senhas de Neo4j/Open Notebook;
- cookies/JWTs.

Os testes realizados carregaram as chaves diretamente do SQLite ou `.env` e emitiram apenas status, modelo, finish reason e conteúdo curto.

---

## 11. Roteiro recomendado para o próximo agente

### Fase A — tornar a branch local reproduzível

1. Trabalhar em `/opt/containers/zrouter`.
2. Confirmar a branch:

```bash
git status --short --branch
git log -5 --oneline --decorate
```

3. Revisar integralmente os dois diffs pendentes:

```bash
git diff -- app/Dockerfile docs/UPDATE-PIPELINE.md
```

4. Confirmar ausência de marcadores no working tree:

```bash
git grep -nE '^(<<<<<<<|=======|>>>>>>>)' -- ':!app/package-lock.json'
```

5. Não alterar ou apagar nenhuma outra customização.
6. Criar um commit complementar, não um amend silencioso, contendo:
   - correção final do `app/Dockerfile`;
   - atualização de `docs/UPDATE-PIPELINE.md`;
   - opcionalmente este relatório, se Vinicius desejar versioná-lo.

### Fase B — revalidar a branch como unidade

Executar uma validação a partir do estado completo da branch, não somente do working tree atual:

1. Parse/build da imagem amd64.
2. Testes focais dos cinco problemas corrigidos.
3. Comparação dos resultados JSON contra `/tmp/up95.json`, se os artefatos ainda existirem.
4. Varredura global de marcadores.
5. Varredura de segredos.
6. Verificação das customizações:
   - `dynamicRouter.js` presente e 342 linhas;
   - quatro referências de identity/Neo4j em `chatCore.js`;
   - fontes sem alteração indevida;
   - combos dinâmicos no SQLite;
   - migração 005 idempotente.
7. Build Docker amd64 real.
8. Subir/recriar somente pelo fluxo aprovado e validar inferência autenticada.

### Fase C — corrigir o Hermes

1. Remover ou reduzir o override `context_length: 1000000000` usando `hermes config`, nunca edição manual.
2. Confirmar que `/model` passa a mostrar um contexto coerente com `/v1/models`.
3. Abrir uma sessão nova.
4. Validar uma conversa com ferramentas e múltiplos turnos.
5. Confirmar que a compactação é acionada antes de ultrapassar o limite conservador.

### Fase D — decidir sobre o 400 do Antigravity

Somente depois do contexto corrigido:

1. Criar uma reprodução controlada com histórico sintético crescente.
2. Testar limites de número de mensagens, tamanho total e quantidade de ferramentas separadamente.
3. Reduzir até encontrar o menor payload que causa `INVALID_ARGUMENT`.
4. Inspecionar a tradução OpenAI → Antigravity sem logar conteúdo privado.
5. Adicionar teste de regressão para a causa exata.
6. Corrigir sanitização/normalização na origem.
7. Evitar fallback global de HTTP 400.

### Fase E — Git remoto e promoção

Após branch limpa e testes:

1. Enviar `update/v0.5.95-merge` ao remoto.
2. Confirmar o hash remoto.
3. Revisar/aprovar antes de promover para `main`.
4. Fazer merge preservando histórico.
5. Criar/atualizar a tag-base do ZRouter conforme a pipeline do projeto.
6. Regenerar inventário de customs, se aplicável.

### Fase F — alinhar a VPS com segurança

1. Fazer backup do banco e da árvore/configuração exclusiva da VPS.
2. Não copiar `jwt-secret`, `machine-id` ou credenciais locais do Zenith.
3. Comparar o filesystem da VPS com a branch final.
4. Planejar limpeza/alinhamento Git sem `reset --hard` prematuro.
5. Rebuild ARM a partir do commit final reproduzível.
6. Validar:
   - versão 0.5.95;
   - `/v1/models` autenticado;
   - completion real;
   - combo dinâmico;
   - memória/fontes;
   - ausência de processos de build abandonados.

---

## 12. Critérios objetivos de conclusão

O trabalho só deve ser declarado concluído quando todos os itens abaixo forem verdadeiros:

- [ ] Working tree da branch está limpo.
- [ ] O `app/Dockerfile` do `HEAD` não contém marcadores.
- [ ] Build amd64 a partir do `HEAD` termina com código 0.
- [ ] Testes focais do merge passam.
- [ ] Comparação com o upstream não mostra nova regressão de código.
- [ ] Varredura de segredos passa.
- [ ] Branch existe no remoto com os commits finais.
- [ ] Merge para `main` foi aprovado e realizado.
- [ ] Hermes não anuncia contexto artificial de 1 bilhão.
- [ ] Sessão nova via Hermes responde pelo combo `vinicius.mathias`.
- [ ] Zenith responde completion autenticada.
- [ ] VPS ARM responde completion autenticada.
- [ ] Checkout/deploy da VPS é reproduzível ou sua divergência está documentada e preservada.
- [ ] Nenhum dado exclusivo da VPS foi sobrescrito.

---

## 13. Resumo executivo

O ZRouter v0.5.95 está atualmente rodando e respondendo inferência no Zenith e na VPS ARM. As customizações centrais — roteamento dinâmico, Neo4j/identity e fontes — permanecem presentes. A comparação de testes mostra paridade diferencial com o upstream: 107 falhas no fork contra 108 no upstream, sendo 106 comuns, uma integração live exclusiva do fork e duas falhas exclusivas do upstream.

O incidente HTTP 400 não foi causado pela pergunta do usuário nem por indisponibilidade geral do ZRouter. Ele ocorreu ao enviar uma sessão antiga com 651–653 mensagens, 311 resultados de ferramentas e aproximadamente 234 mil tokens persistidos para o primeiro modelo Antigravity/Gemini do combo. O Hermes foi configurado artificialmente com contexto de 1 bilhão de tokens, embora o ZRouter publique limite conservador de 200 mil para o combo. Sessões novas funcionam no Hermes, no Zenith e na VPS.

A pendência mais importante é de reprodutibilidade: o commit `6441c654` contém marcadores de conflito no Dockerfile. A correção que permitiu os builds existe apenas no working tree, junto da documentação atualizada. A branch ainda não está no GitHub nem em `main`. O próximo agente deve primeiro criar um commit complementar e validar a branch limpa; depois corrigir o contexto do Hermes, publicar/promover a branch e alinhar a VPS sem destruir seus dados exclusivos.
