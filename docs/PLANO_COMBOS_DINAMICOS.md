# Plano de Implementação: Combos Dinâmicos com Modelos de Decisão no ZRouter

## 1. Visão Geral
Atualmente, o ZRouter opera com **Combos Estáticos**, que funcionam como listas sequenciais de fallback (se o Modelo A falhar ou retornar erro, tenta o Modelo B).

O objetivo deste projeto é introduzir os **Combos Dinâmicos Determinísticos**. Em vez de tentar modelos em cascata por tentativa e erro, o ZRouter avalia a requisição de entrada antes do despacho e seleciona de primeira o especialista ideal, combinando:
1. **Classificação Semântica Determinística Total:** Todas as requisições passam pela avaliação do modelo de decisão (`tev1:0.8b` no Ollama System One), sem atalhos/fast-paths artificiais de regex, garantindo interpretação contextual real.
2. **Regras de Custo & Janela Temporal (Off-Peak):** Verificação de regras de preço em tempo real (ex.: 50% de desconto na Ollama Cloud em horários de menor movimento e fins de semana).
3. **Resiliência e Fallback:** Caso o especialista primário selecionado retorne indisponibilidade (HTTP 429/500/503), o combo faz o fallback gracioso para os especialistas secundários da lista.

---

### 2. Arquitetura do Componente de Decisão

### 2.1 Modelo Local e Topologia de Failover (Zenith ↔ VPS)
- **Modelo:** `tev1:0.8b` (811 MB, fine-tuned sobre Qwen3.5 pela Together AI).
- **Runtime Nativo:** Em ambas as máquinas, executado localmente via daemon do Ollama v0.35+ (`http://localhost:11434/v1/systemone`).
- **Autonomia Total (Mirroring):** Como a VPS Oracle atua como espelho quente em caso de queda do Zenith, o classificador roda **100% autônomo e local em cada nó**. A VPS não depende do Zenith para classificar ou rotear; se o Zenith cair e o watchdog do DNS virar a chave para a VPS, os combos dinâmicos continuam funcionando exatamente iguais na nuvem.
- **Latência de inferência:** ~200 ms a 900 ms em CPU.
- **Sem streaming/geração:** Retorna saída tipada (`choice`, `probabilities`, `confidence`) em passagem única (single forward pass).

### 2.2 Critérios de Classificação da Requisição
O endpoint `/v1/systemone` avalia o objetivo da tarefa e o orçamento cognitivo em uma única passada:
1. **`task_goal`**:
   - `quick_command`: Ações operacionais diretas (desligar container, toggle de serviço, status rápido).
   - `document_knowledge`: Síntese de conhecimento, cadernos no OpenNotebook, documentação técnica.
   - `write_script`: Desenvolvimento de scripts em Python, Bash, Node, automações e endpoints REST padrão.
   - `architecture_and_concurrency`: Desafios de concorrência crítica (deadlocks, mutexes, canais), arquitetura de failover distribuído, túneis de rede e algoritmos complexos.

2. **`thinking_level`** (Nível de Pensamento / Reasoning Budget):
   - `none` / `low`: Operações diretas, comandos de terminal ou snippets triviais. O ZRouter desliga o thinking ou seta `thinking: low` (ex.: `ag/gemini-3.8-flash-low` ou `thinkingBudget: 0`).
   - `medium`: Scripts estruturados, transformações de dados ou documentação detalhada. Seta `thinking: medium` (ex.: `ag/gemini-3.8-flash-medium` ou 2k–4k tokens de pensamento).
   - `high`: Algoritmos complexos, análise profunda de logs, deadlocks e arquitetura de concorrência. Seta `thinking: high` (ex.: `cx/gpt-6-astra`, `cx/gpt-5.6-terra` ou `ag/gemini-3.8-flash-high` com orçamento máximo de reasoning).

---

## 3. Matriz de Roteamento e Especialistas do ZRouter

| Classificação Tev1 | Thinking Level | Janela de Custo | Especialista Primário | Nível de Pensamento Injetado | Fallback Secundário |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `quick_command` | `none`/`low` | Qualquer | `ag/gemini-3.8-flash-low` | `off` / `low` | `ollama/deepseek-v4-flash:cloud` |
| `document_knowledge` | `medium` | Qualquer | `ag/gemini-3.8-flash-medium` | `medium` | `openrouter/google/gemini-3.8-flash` |
| `write_script` | `medium` | Pico Comercial | `ollama/glm-5.3` | `auto` / `medium` | `cx/gpt-5.6-sol` |
| `write_script` | `medium` | Off-Peak (50% off) | `ollama/deepseek-v4-pro:0813` | `medium` | `ollama/glm-5.3` |
| `architecture_and_concurrency` | `high` | Qualquer | `cx/gpt-6-astra` | `high` (Thinking Max) | `cx/gpt-5.6-terra` |

---

## 4. Engenharia de Dados & Persistência (SQLite)

### 4.1 Schema da Tabela `combos`
Atualmente a tabela possui:
```sql
CREATE TABLE combos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT,
  models TEXT NOT NULL, -- JSON array
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
```

### 4.2 Extensão Proposta (Retrocompatível)
Adicionar suporte ao campo `type` ("static" | "dynamic") e `config` (regras e mapeamentos):
```sql
ALTER TABLE combos ADD COLUMN type TEXT DEFAULT 'static';
ALTER TABLE combos ADD COLUMN config TEXT DEFAULT '{}';
```

Exemplo de payload do `config` para um combo dinâmico:
```json
{
  "router": "ollama-systemone",
  "decisionModel": "tev1:0.8b",
  "rules": {
    "offPeakDiscount": {
      "provider": "ollama",
      "weekdays": ["<12:00", ">=18:00"],
      "weekends": "all_day"
    },
    "routingMap": {
      "quick_command": "ag/gemini-3.8-flash-low",
      "document_knowledge": "ag/gemini-3.8-flash-medium",
      "write_script_peak": "ollama/glm-5.3",
      "write_script_offpeak": "ollama/deepseek-v4-pro:0813",
      "architecture_and_concurrency": "cx/gpt-6-astra"
    }
  },
  "fallbacks": [
    "cx/gpt-5.6-terra",
    "ag/gemini-3.8-flash-medium",
    "ollama/deepseek-v4-flash:cloud"
  ]
}
```

---

## 5. Ponto de Injeção no Código do ZRouter

### 5.1 Arquivo: `/opt/containers/zrouter/app/src/sse/handlers/chat.js`
Na resolução do modelo (`modelStr`):
```javascript
// Se o modelo solicitado corresponder a um combo
const combo = await getComboByName(modelStr);
if (combo) {
  if (combo.type === "dynamic") {
    // 1. Extrair último prompt do usuário
    const userPrompt = extractLastUserMessage(body.messages);
    // 2. Chamar o serviço de decisão determinística
    const resolvedModel = await resolveDynamicCombo(combo, userPrompt);
    // 3. Reordenar a lista de execução priorizando o especialista
    comboModels = [resolvedModel, ...combo.models.filter(m => m !== resolvedModel)];
  } else {
    comboModels = combo.models;
  }
}
```

### 5.2 Novo Serviço: `/opt/containers/zrouter/app/src/sse/services/dynamicRouter.js`
Responsável por:
1. `checkOllamaOffPeak(now)`: cálculo UTC em microssegundos.
2. `classifyWithDecisionModel(prompt, config)`: chamada HTTP para `http://localhost:11434/v1/systemone` com timeout seguro (ex.: 1500 ms) e truncamento de entrada em 4 KB. Sem fast-paths por regex: 100% da classificação é semântica e orientada pelo Tev1:0.8b. Se o classificador local der timeout, cai automaticamente no modelo padrão do combo sem travar a requisição.
3. `selectTargetModel(decision, isOffPeak, config)`: mapeamento determinístico.

---

## 6. Fases de Execução
1. **Fase 1:** Criação do módulo `dynamicRouter.js` e testes de unidade isolados com mock e chamada real ao Ollama.
2. **Fase 2:** Migração suave da tabela `combos` no SQLite (`type` e `config`).
3. **Fase 3:** Interligação com o fluxo `handleChat` em `chat.js`.
4. **Fase 4:** Testes fim a fim via endpoint `/v1/chat/completions` simulando diferentes tarefas reais.
