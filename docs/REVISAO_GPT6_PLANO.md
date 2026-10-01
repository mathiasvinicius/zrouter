Let me analyze this request. The user (Vinicius Mathias, "Meu Soberano") wants a technical review of a plan for "Dynamic Deterministic Combos" in ZRouter. This is a legitimate technical architecture review request.

Key facts from the plan:
- ZRouter at /opt/containers/zrouter/app, production container on port 20128
- Combos are static fallback lists today
- Plan: classify request semantically with local model `tev1:0.8b` via Ollama "System One" endpoint (`/v1/systemone`), plus cost/time-window rules (off-peak discounts), then pick specialist model directly, with fallback to secondary models.

I need to review:
1. Architectural viability and bottlenecks (timeout, CPU bound on Ryzen)
2. Fallback robustness when classifier fails/slow
3. Handling of tools/functions and multimodal messages
4. Practical recommendations and approval

Let me think as a senior high-performance systems architect.

**1. Viability and bottlenecks:**

- The decision model inference at 200-900ms on CPU adds latency to EVERY request routed through dynamic combos. That's a 2-10x latency increase for the first token (TTFB) for quick commands. Irony: `quick_command` routing to a sub-second model but the classifier adds 200-900ms before dispatch. That defeats the purpose. This is the biggest architectural smell.

- Blocking event loop? The classification is an HTTP call, so it's async I/O — doesn't block the Node event loop, but it does consume a CPU core on the same machine if Ollama runs on the same host. The ZRouter container + Ollama on same host: CPU contention. Ollama daemon loading an 811MB model into RAM — first call cold start will be much slower (model load from disk: several seconds, potentially 5-15s). Cold start problem not addressed in the plan.

- Concurrency: single Ollama inference queue. If multiple requests arrive concurrently, classification calls serialize on Ollama's inference queue (Ollama processes requests sequentially per model, or limited parallelism with OLLAMA_NUM_PARALLEL). Under burst load, the 1500ms timeout will be hit often and everything falls to default. Need to measure: p50/p95 of classify latency under concurrency.

- Timeout budget: 1500ms timeout for a service that can take 900ms p... that's too tight. p95 could exceed. If timeout fires at 1500ms, you've already burned 1.5s before dispatching to the real model. Suggest: adaptive timeout, circuit breaker, and a short memoization cache keyed by prompt hash (though prompts vary — cache hit rate low for unique prompts; but system prompts / task prefixes repeat... actually cache by prompt could help for repeated operational commands like "status").

- Alternative: rule-based fast path first (regex/keyword determinism for quick commands like "docker restart X", "status"), only invoke classifier when rules don't match. That reduces classifier calls drastically. Lazy senior dev: the best classification is no classification. Or use embeddings already available locally (they run local embeddings per the mental model — Hindsight uses local embeddings) — cosine similarity against 4 class centroids is ~5-20ms vs 200-900ms. But that adds nondeterminism; the plan says "deterministic". A tiny logistic/keyword classifier could be pure JS, zero inference. But the plan's model is fine-tuned; still, hybrid fast-path is the recommendation.

- Also: why classify with a generative LLM fine-tune at all for 4 classes? A 4-class problem — keyword rules + few-shot embedding similarity gets 95% of value at 1% cost. But user already has the tev1 model; still recommend fast path.

- The off-peak cost rule: "cálculo UTC em microssegundos" — microssegundos is absurd; Date.now() gives milliseconds. Precision beyond seconds is irrelevant. Trivial but shows sloppiness. Also timezone: UTC windows 12:00-18:00 = São Paulo 09:00-15:00 (UTC-3). Verify intent: "Horário de Pico Comercial (Seg-Sex 12:00-18:00 UTC)" — user is in Brazil; if the discount windows are Ollama Cloud's, they're likely defined in some timezone — need to confirm whether off-peak is defined by provider in UTC or local. Hardcode config-driven windows, testable.

- Also the discount premise: "50% discount off-peak" — verify provider actually bills discounted; routing to a Pro model off-peak that costs 2x base even with 50% off may cost more than glm-5.3 on-peak. Cost math: deepseek-v4-pro at 50% off vs glm-5.3 full price — need actual price sheet to assert savings. The plan assumes discount = cheaper. Recommend verifying with real price data; make the cost rule data-driven (price table in config) rather than hardcoded "offPeakDiscount" boolean.

- Config schema: `weekdays: ["<12:00", ">=18:00"]` — mixing operators in strings is a mini-DSL; parsing bugs. Better: explicit start/end times: `{"start": "18:00", "end": "12:00"}` or minutes-of-day. Simpler: `offPeakStart: "18:00", offPeakEnd: "12:00"` handling wrap-around. Or a function-free JSON with two windows.

- The `models` JSON column stays, `type`/`config` added via ALTER TABLE — fine, SQLite supports. But: `ALTER TABLE ... ADD COLUMN` in SQLite is fine; need migration handling (check pragma table_info before altering, idempotent). Retrocompat OK since defaults. But validation: `config` is a TEXT JSON — parse errors must not 500; validate at combo creation time (dashboard) rather than at request time.

- Injection point in chat.js: `extractLastUserMessage` — classification on only the last user message loses context. E.g., a long conversation about architecture where the last message is "ok, do it" → classified as quick_command. Better: classify on last user message + maybe system prompt, or a rolling summary. Trade-off: token cost of classifier input. At minimum document the limitation; consider concatenating the last 2 user messages or system+last user.

- The resolved model reorder: `comboModels = [resolvedModel, ...combo.models.filter(m => m !== resolvedModel)]` — BUG: if resolvedModel is NOT in combo.models (e.g., routingMap contains a model not in the static list), you get duplicate-ish or foreign model injected; also fallbacks array in config vs combo.models — two sources of truth. The config has BOTH `routingMap` and `fallbacks`, while the combo row has `models`. Which wins? Ambiguity. Recommendation: for dynamic combos, `models` becomes derived/ignored, or validate at save time that every routingMap value and fallback exists in `models` (or in the provider registry). Single source of truth: routingMap + fallbacks; `models` deprecated for dynamic kind.

- Also, per-row fallback: the matrix has per-class fallbacks (quick_command → deepseek-v4-flash:cloud), but the code sample uses global fallbacks list. The plan's config `fallbacks` is global, not per-class. Mismatch between matrix (per-class fallback) and config (global fallbacks). Need per-class fallbacks in routingMap: `"quick_command": {"model": "...", "fallback": "..."}` or keep global but document.

**2. Fallback robustness when classifier fails:**

- Plan says: timeout 1500ms → falls to "modelo padrão do combo". Which is the default? First in `models` list? Not specified. Define explicitly: `config.defaultModel` or first element. Deterministic behavior must be documented.

- Circuit breaker: repeated classifier failures (Ollama down) → every request pays the 1500ms timeout. That's a self-inflicted outage: every chat request +1.5s. Need: consecutive-failure counter → skip classification (fail open to default) for N seconds/minutes. Half-open probe to recover. This is essential, not optional.

- Health check at startup: probe /v1/systemone; if absent, mark dynamic combos degraded, log once (not per request).

- Timeout value: 1500ms with p99 inference at 900ms leaves little headroom under load; either raise to 2000ms with circuit breaker, or lower to 500ms and accept more fail-open (fast default). Actually recommend: budget-based — for quick_command SLA you want low TTFB, so 500ms fail-open is better UX; for architecture tasks the extra 1s is noise. Could even make the timeout per-class... no, you don't know the class before classifying. One global budget: 750-1000ms with breaker.

- Also: classification result caching. Same prompt hash → cached class with TTL (e.g., 5-10 min). Idempotent operational commands benefit. Cheap LRU, 100 entries.

- Retry policy: DON'T retry classification (adds latency); fail open immediately. Retry belongs to the actual model dispatch (existing static combo logic already retries next model).

- Also consider: run classification concurrently with nothing? You can't dispatch without knowing target. But you COULD do hedged dispatch: if classifier times out, you already... no, hedging requires starting a default dispatch in parallel at t=0 — wasteful. Skip.

- Edge: what if the decision model returns an unknown class (hallucinated label)? Validate `choice` against known enum; else fail open. Also `confidence` threshold: if < threshold (e.g., 0.6), fall to default or use rule tiebreak. Plan mentions confidence output but never uses it. Recommend: use it with a threshold, log low-confidence rate to tune.

**3. Tools/functions and multimodal:**

- Tools/functions: if request has `tools` array (function calling), classification prompt should account for it; more importantly, the ROUTING must only select models that support tool calling. deepseek-v4-pro / glm-5.3 / gemini-flash — do they all support parallel tool calls? If a request needs function calling and classifier routes to a model without tool support → runtime failure. Add capability gate: if `tools` present, intersect routing targets with `supportsTools` capability metadata. Simplest: if tools present → skip classification, route to known tool-capable combo (deterministic rule beats ML here).

- Multimodal: `extractLastUserMessage` — if message content is an array with image_url parts, what do you send to the classifier? tev1 is text-only (0.8b fine-tune on Qwen3.5 — Qwen has VL variants but tev1:0.8b as described is a decision model, presumably text). Must extract text parts only, and if no text (image-only), classify default + route to vision-capable model. But wait — memory says: user discarded vision entirely ("Descartou o uso de visão... Mantém o modelo principal focado em texto"). Still, the router must not crash on multimodal payloads; strip to text, log, route default. Content array handling: `typeof content === 'string' ? content : content.filter(p => p.type === 'text').map(p => p.text).join('\n')`.

- Also `messages` may contain system/developer roles; extractLastUserMessage must handle role: "user" only, and handle empty messages array, tool role responses, etc. Edge: last "user" message could be a tool result in OpenAI format (role: "tool") — those are separate roles, fine.

- Streaming: chat.js handles streaming responses. The classification happens before dispatch, fine, but ensure the added latency doesn't break client timeouts — first byte now arrives at (classify_time + model_ttfb). For SSE keep-alive: consider sending an early SSE comment/ping while classifying if clients have aggressive idle timeouts. Probably overkill; note it.

- Structured outputs: `response_format: json_schema` requests — classifier must not interfere; also route to models supporting it. Same capability-gating idea.

**4. Practical recommendations and approval:**

- Approve with conditions (conditional approval): 
  1. Add fast-path keyword rules before classifier (deterministic, 0ms) — cover quick_command majority.
  2. Circuit breaker + fail-open default, explicit defaultModel in config.
  3. Cache with prompt-hash LRU.
  4. Capability gates for tools/response_format.
  5. Fix config schema: per-class fallbacks, explicit time windows, drop microsecond nonsense, validate config at write time.
  6. Metrics/observability: log classify_ms, class, confidence, timeout hits, breaker state; expose in existing dashboard. Without telemetry, tuning impossible. Also a shadow mode: Phase 3.5 — run classification and log only (don't route) for a few days to measure accuracy against reality before flipping. This is THE rollout recommendation: shadow mode.
  7. Testing: the plan mentions Vitest with mock; add concurrency test (10 parallel classifications), cold-start test, and e2e fallback test (kill Ollama mid-run).
  8. Cold start: keep model loaded (`keep_alive`) — Ollama unloads after idle; set `keep_alive: "30m"` or preload at boot. First-call 5s+ latency otherwise.
  9. SQLite migration idempotent (PRAGMA table_info check).
  10. Timezone config explicit; verify Ollama Cloud discount windows in provider's terms, and verify deepseek-v4-pro @50% actually cheaper than glm-5.3 base.

- Also point: "single forward pass" claim — verify the Ollama System One endpoint is actually a classification endpoint returning typed output; if it's actually a generative call with JSON parsing, add schema validation + max_tokens=1 (or few) to bound generation time. 900ms for 0.8b on CPU is plausible for a single pass with short prompt, but long prompts (last user message could be 10k tokens) blow the budget — truncate classifier input to first N chars (e.g., 2-4k chars). Token truncation bound = latency bound. Important: prompt length directly drives CPU inference time on CPU. Must cap input size.

- Concurrency of Ollama: OLLAMA_NUM_PARALLEL default 1 (or 4 in newer) — under burst, queue. Also Ollama on same host as ZRouter container: check CPU cores available to container.

- Security: dynamicRouter calls localhost:11434 — fine internal. But config allows arbitrary router URL? "router": "ollama-systemone" — keep as enum, not free URL (SSRF-ish if user-editable via dashboard). Minor.

- The fallback chain on real model failure (429/500/503) already exists via static combo mechanics — reordering trick reuses it. Good design choice, minimal code. Approve that part: reusing existing fallback loop by reordering is the laziest correct approach. 

- One more: `getComboByName(modelStr)` — modelStr may include prefixes/aliases; ensure combo resolution happens where it does today for statics (it does, since statics work).

- Phase ordering fine; suggest Phase 2 before 1? No — module + tests first is fine; migration is trivial. Actually shadow mode should be Phase 3.5 between 3 and 4.

- Also mention: don't classify for every request type — only chat completions? Plan injects in chat.js only. Embeddings/image/tts routes unaffected. Good — confirm scope stays chat-only.

- Determinism claim: same prompt + same time window → same route. But classifier on CPU with quantization is deterministic per machine; across Ollama versions could drift. The "deterministic" label is marketing; treat as probabilistic-with-rules. Fine.

- Cost of classifier itself: 0.8b on CPU, ~200-900ms per request — electricity negligible; the cost is latency and headroom. Off-peak discount on classification: local, no cost. Fine.

- One more subtle thing: the reorder `comboModels = [resolvedModel, ...]` — if resolvedModel === first model already, no-op, fine. But if resolvedModel not in models — the filter(m => m !== resolvedModel) keeps everything, and you prepend a foreign model: chain = [foreign, ...all]. That might actually be intended (routingMap models may differ from the combo's models list) — but then `models` field is dead weight for dynamic combos. Clean: for dynamic combos ignore `models`, build chain from routingMap + fallbacks. Or validate. Say it.

- Also concurrency class: "architecture_and_concurrency" routed to gpt-6-astra always — no cost window needed. Fine.

- Time window config `["<12:00", ">=18:00"]` — also weekend "all_day". What about Friday 17:59 → peak; Saturday → off. Edge: weekday holiday? Skip — YAGNI, but note config could add holidays later. Don't build.

Now format: user wants "revisão técnica crítica, direta e concisa" covering 4 numbered areas. Portuguese (Brazilian). Persona: EVE, direct, terse, no fluff, "Meu Soberano" address. Style: state thing → action → reason. No filler. Some structure with the 4 requested sections. Terse but complete. Emojis: minimal, maybe one — persona says precise/elegant use, not excessive. Probably skip or one at end.

Length: this is a substantive technical review; should be thorough but concise. Use headers matching the 4 points, bullets, code where needed. Keep it tight.

Let me draft.

Veredito: aprovado com condições / conditional approval.

Key numbers:
- Classifier latency 200-900ms vs quick_command sub-second promise → TTFB contradiction. Fast path needed.
- 1500ms timeout too tight relative to p95 900ms under queue; breaker mandatory.
- Cold start model load not addressed.
- Input truncation for long prompts.
- Ollama same-host CPU contention + OLLAMA_NUM_PARALLEL queueing.

Fallback section:
- default model unspecified — define config.defaultModel.
- breaker: consecutive failures → skip for cooloff.
- cache LRU.
- validate choice enum + confidence threshold.
- no retry.

Tools/multimodal:
- capability gate for tools; strip image parts for classifier input; text extraction helper; vision-less routing consistent with user's decision (they dropped vision) — but payload robustness still required.
- response_format handling.

Recommendations:
- shadow mode before cutover (log-only).
- config schema fixes: explicit windows, per-class fallback, drop microseconds, enum router.
- single source of truth models vs routingMap/fallbacks.
- migration idempotency PRAGMA.
- keep_alive to avoid unload.
- verify actual price delta (50% off pro vs base glm) — cost math must be data-driven.
- telemetry: classify_ms, class, confidence, breaker state, timeout count.
- tests: concurrency burst, cold start, kill-ollama e2e.

Fix the reorder bug: routingMap values may not be in models — dedupe or ignore models for dynamic.

Timezone: 12:00-18:00 UTC = 09:00-15:00 BRT — confirm intent, since "pico comercial" in Brazil is roughly 9-18 local. If the discount is Ollama Cloud's off-peak, use their published windows, not assumptions.

Structure the response:

1. Viabilidade & gargalos
2. Robustez do fallback do classificador
3. Tools/functions & multimodal
4. Recomendações & veredito

Keep terse per system prompt. Auto-Clarity for multi-step sequences — normal sentences there. Portuguese.

I'll write it now, aiming for high density. Maybe ~600-900 words. Use tables sparingly. Code snippets short.

One more architectural point: the classification call is on the hot path of EVERY chat request through dynamic combos. For a personal-scale router (single user, Vinicius), burst concurrency is low — 1-5 concurrent. So Ollama queueing is mild in practice. Still, the plan should size it: personal use = acceptable; if Zenith serves Hermes + bot + automated scripts concurrently, bursts happen (e.g., WhatsApp bot + Hermes simultaneously). Mention burst reality: WhatsApp bot traffic + Hermes.

Also: 200-900ms on CPU — that's for short prompts. The plan doesn't bound prompt length. extractLastUserMessage of a 20k-token notebook synthesis → classifier input huge → latency explodes beyond timeout → always fail-open for exactly the long prompts where classification matters most (document_knowledge). Truncation to ~2-4KB chars is mandatory. This is a real insight — include prominently.

Also: classification of only last message misses conversation context — "refatore isso" after 50 turns of architecture discussion → quick_command misroute. Mitigation: prepend first system message or last user + last assistant summary; or include last 2 user messages. Cheap: use system prompt + last user message.

Also SSE: while classifying, client sees nothing for up to timeout+model TTFB. Hermes/clients may have their own timeouts. Recommend a fast path + breaker keeps worst case bounded at ~1s.

Also note: put dynamic classification BEFORE combo resolution edge cases — none, fine.

Migration: ALTER TABLE with DEFAULT works in SQLite (adds column, existing rows get 'static'/'{}'). Idempotent guard needed since SQLite errors on duplicate column. Trivial.

Config validation at dashboard save time — parse JSON, validate enum classes, validate model IDs exist in /v1/models. Prevents runtime 500s.

Verdict: Aprovado condicionado a N itens — list conditions.

Write in PT-BR, EVE voice, terse. No "senhor". Address as "Meu Soberano" once at start maybe. System says drop greetings/protocol — keep minimal: maybe one line verdict, then sections. Persona wants recognition but system prompt says drop pleasantries. Balance: brief opening line "Revisão completa, Meu Soberano. Veredito: aprovado com 6 condições bloqueantes." then sections.

Emoji: maybe one 🔥 or none. Persona allows precise use. One at verdict max. Keep professional — one is fine.

Length target: dense, ~700-900 words. The 4 sections requested.Revisão concluída, Meu Soberano. Veredito: **aprovado com 6 condições bloqueantes**. A arquitetura é sadia — reutilizar a cascata estática via reordenação é a solução mais preguiçosa e correta possível. Mas o plano tem cegos que quebram em produção.

## 1. Viabilidade e Gargalos

**Contradição central: latência do classificador vs. promessa do `quick_command`.** Rotear comando rápido para modelo sub-segundo depois de gastar 200–900 ms classificando é derrotar o próprio objetivo. TTFB real = classificação + inferência. Exija fast path determinístico antes do modelo: regex/keywords para `quick_command` (`restart`, `status`, `docker`, `toggle`) resolve 80% dos casos em 0 ms. Classificador só entra quando as regras não casam — `// ponytail: fast-path cobre comandos operacionais; estender regras se taxa de erro de classe crescer`.

**Prompt sem limite de tamanho = latência explosiva.** `extractLastUserMessage` sobre uma síntese de caderno de 20k tokens fará a inferência em CPU estourar qualquer timeout — e o fail-open acontece justamente nos prompts longos, onde classificação mais importa (`document_knowledge`). Truncar input do classificador para ~4 KB é mandatório, não opcional. Tamanho do input é o único bound real de latência em CPU.

**Cold start ignorado.** Ollama descarrega `tev1:0.8b` após idle. Primeira chamada após horas = load de disco de 811 MB, 5–15 s, sempre estourando o timeout. Fix: `keep_alive: "30m"` no request e/ou preload no boot do daemon.

**Contention e fila.** Ollama e ZRouter no mesmo host: `OLLAMA_NUM_PARALLEL` padrão limita inferências concorrentes; burst simultâneo (Hermes + bot WhatsApp + script automatizado) serializa a fila de classificação e derruba a taxa de acerto do timeout. Meça p50/p95 sob 10 chamadas paralelas na Fase 1 — sem esse número, o valor do timeout é chute.

**`checkOllamaOffPeak` "em microssegundos"** — absurdo; `Date.now()` em ms basta. E atenção à semântica: 12:00–18:00 UTC = 09:00–15:00 em Holambra (UTC-3). Se a janela de desconto é definida pela Ollama Cloud, use a janela publicada por eles no config, não uma suposição traduzida. O mini-DSL `"weekdays": ["<12:00", ">=18:00"]` é parsing bug-prone; use janelas explícitas:

```json
"offPeak": { "start": "18:00", "end": "12:00", "weekends": true, "tz": "UTC" }
```

**Premissa de custo não verificada:** deepseek-v4-pro com 50% off só é mais barato que glm-5.3 se o preço base for < 2x. Confirme com a tabela real antes de codificar — senão o "off-peak barato" custa mais caro.

## 2. Robustez do Fallback do Classificador

- **Modelo default indefinido.** "Cai no modelo padrão do combo" — qual? O primeiro de `models`? Torne explícito: `config.defaultModel` obrigatório. Fail-open determinístico, documentado.
- **Circuit breaker obrigatório, não opcional.** Ollama caído = todo request pagando 1.500 ms de timeout morto antes de despachar — outage autoinfligida em cada chamada. Contador de falhas consecutivas → pular classificação por 60 s (fail-open direto) → probe half-open para recuperar. Sem isso, o plano rebaixa o pior caso do router inteiro.
- **Timeout de 1.500 ms é apertado** contra p95 de 900 ms sob fila. Com breaker + fast path, 1.000 ms é o teto honesto. E sem retry de classificação — fail-open imediato; retry pertence ao dispatch, que a cascata estática já faz.
- **Cache LRU por hash do prompt** (100 entradas, TTL 10 min): comandos operacionais repetidos ("status do zrouter") viram 0 ms.
- **Validar a saída do modelo:** `choice` fora do enum → fail-open. E o plano gera `confidence` mas nunca usa: abaixo de 0.6, fail-open + log. Telemetria de confiança baixa é o que permite tunar o limiar depois.

## 3. Tools, Functions e Multimodalidade

- **`tools` presente exige capability gate.** Se o request carrega function calling e o classificador rotea para modelo sem suporte a tools, é falha garantida em runtime. Regra determinística mais forte que ML: se `tools` existe, pule classificação e vá para um combo tool-capable fixo. Mesma lógica para `response_format: json_schema`.
- **Multimodal:** tev1 é texto. `content` pode ser array — extraia só as partes `type: "text"`:

```javascript
const text = typeof c === "string" ? c : (c || []).filter(p => p.type === 'text').map(p => p.text).join('\n');
```

  Imagem sem texto → default + log. Consistente com sua decisão de dispensar visão, mas o router não pode quebrar com payload multimodal.
- **Contexto perdido:** classificar só a última mensagem user falha em "refatore isso" após 50 turnos de arquitetura → misroute para `quick_command`. Mitigação barata: classificar sobre `system + última user`. Documente a limitação; não invente pipeline de sumarização — YAGNI.

## 4. Bugs no Plano e Recomendações

1. **Bug no reorder:** `routingMap` pode conter modelo fora de `combo.models` — o filter não remove nada e o resolvedModel estranho entra duplicado ou órfão. Para combos dinâmicos, ignore `models` e derive a cadeia de `routingMap + fallbacks`. Fonte única de verdade.
2. **Matrix vs config inconsistentes:** a matriz define fallback por classe (quick_command → deepseek-v4-flash), o config define `fallbacks` global. Escolha: por classe.
3. **Migração idempotente:** `PRAGMA table_info` antes do `ALTER TABLE` — SQLite lança erro em coluna duplicada.
4. **Validação de config no save** (dashboard), não no request: parse JSON, classes válidas, modelos existentes em `/v1/models`, `router` como enum (não URL livre). Runtime nunca deve 500 por config ruim.
5. **Shadow mode como Fase 3.5:** rodar classificação em log-only (sem rotear) por 3–5 dias, medir acurácia contra o roteamento real antes do cutover. É o upgrade mais barato de confiança do projeto inteiro.
6. **Telemetria mínima:** `classify_ms`, classe, `confidence`, timeouts, estado do breaker — exposto no dashboard. Sem isso, tuning é fé.

Condições bloqueantes para implementação: fast path, truncamento de input, breaker + `defaultModel`, capability gate para tools, correção do reorder/fonte única, shadow mode. Com esses seis, o design está sólido para Fase 1. 🔥