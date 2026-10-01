// Dynamic-combo router — deterministic specialist selection.
// See docs/PLANO_COMBOS_DINAMICOS.md + docs/REVISAO_GPT6_PLANO.md.
//
// No fast-path: EVERY dynamic request is classified semantically by tev1:0.8b
// through Ollama's /v1/systemone (single call, two questions). regex/keyword
// shortcuts are explicitly forbidden by the fixed decisions.
//
// Contract:
//   isOllamaOffPeak(date)
//   classifyTev(prompt, {signal, timeoutMs})            -> raw classification
//   resolveDynamicTarget(classification, config, opts)  -> {model, thinkingLevel, reason}
//   resolveDynamicCombo(combo, body, opts)              -> {models, meta}
//
// Only node builtins + the local logger: no aliases, so the module is loadable
// by a plain `node` test harness.
import * as log from "../utils/logger.js";

export const TASK_GOALS = Object.freeze([
  "quick_command",
  "document_knowledge",
  "write_script",
  "architecture_and_concurrency",
]);
export const THINKING_LEVELS = Object.freeze(["none", "low", "medium", "high"]);

const GOAL_SET = new Set(TASK_GOALS);
const LEVEL_SET = new Set(THINKING_LEVELS);

const DEFAULT_SYSTEMONE_URL = "http://127.0.0.1:11434/v1/systemone";
const DEFAULT_DECISION_MODEL = "tev1:0.8b";
export const DEFAULT_TIMEOUT_MS = 2500;
export const INPUT_MAX_BYTES = 4096;
// The gate is the CHOSEN option's probability, not tev1's `confidence`.
// tev1 reports `confidence` as normalised entropy, which stays low even when
// the pick is right (real sample: correct architecture_and_concurrency at
// confidence 0.26 / probability 0.52). Gating on it discarded usable routings.
// Probability of the chosen class is the honest signal: clear prompts land
// 0.52-0.90, so 0.45 accepts every correct sample while still catching a
// genuinely torn model. `confidence` is kept for telemetry only.
export const CHOSEN_PROB_MIN = 0.45;
export const BREAKER_THRESHOLD = 3;
export const BREAKER_OPEN_MS = 60_000;

// Ollama Cloud discount window: weekends all day; weekdays before 12:00 UTC or
// from 18:00 UTC. Pure function of the passed date (UTC semantics).
export function isOllamaOffPeak(date = new Date()) {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return true;
  const hour = date.getUTCHours();
  return hour < 12 || hour >= 18;
}

// ── Circuit breaker (module-level, per process) ────────────────────────────
// 3 consecutive infra failures open the breaker for 60s; while open,
// classification is skipped and the caller fails open immediately. After the
// window a single half-open probe is allowed; a failed probe re-arms.
// ponytail: no single-flight lock on the probe — this router serves one user,
// concurrent probes are harmless. Add an in-flight flag if it ever goes multi-tenant.
const circuit = { failures: 0, openUntil: 0 };

export function circuitState() {
  return { ...circuit, open: Date.now() < circuit.openUntil };
}

// Test/ops hook.
export function _resetCircuit() {
  circuit.failures = 0;
  circuit.openUntil = 0;
}

function recordFailure() {
  const now = Date.now();
  if (circuit.openUntil > 0) {
    // Failed half-open probe: re-arm for another full window.
    circuit.openUntil = now + BREAKER_OPEN_MS;
    return;
  }
  circuit.failures += 1;
  if (circuit.failures >= BREAKER_THRESHOLD) {
    circuit.openUntil = now + BREAKER_OPEN_MS;
    circuit.failures = 0;
  }
}

function recordSuccess() {
  circuit.failures = 0;
  circuit.openUntil = 0;
}

// ── Classifier input ───────────────────────────────────────────────────────
const textOf = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.filter((p) => p?.type === "text" && typeof p.text === "string").map((p) => p.text).join("\n")
      : "";

// Classify over system + last user message (a bare "refactor that" after 50
// turns of architecture would otherwise misroute). Limitation documented in
// the review; no summary pipeline (YAGNI).
export function extractClassifiableText(body = {}) {
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const system = msgs.find((m) => m?.role === "system");
  let lastUser = "";
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]?.role === "user") {
      lastUser = textOf(msgs[i].content);
      break;
    }
  }
  return [system ? textOf(system.content) : "", lastUser].filter(Boolean).join("\n\n").trim();
}

// Deterministic capability gate inputs. Image parts are ignored by the text
// classifier, so a multimodal body must never be classified for routing.
export function detectBodyCapabilities(body = {}) {
  const hasTools =
    (Array.isArray(body.tools) && body.tools.length > 0) ||
    (Array.isArray(body.functions) && body.functions.length > 0);
  let hasImage = false;
  for (const m of Array.isArray(body.messages) ? body.messages : []) {
    const c = m?.content;
    if (!Array.isArray(c)) continue;
    for (const p of c) {
      if (p?.type === "image" || p?.type === "image_url" || p?.type === "input_image" || p?.image_url) {
        hasImage = true;
        break;
      }
    }
    if (hasImage) break;
  }
  return { hasTools: !!hasTools, hasImage };
}

// Cap latency: input size is the only real bound on CPU inference time.
export function truncateUtf8(str, maxBytes = INPUT_MAX_BYTES) {
  const buf = Buffer.from(str, "utf8");
  if (buf.length <= maxBytes) return str;
  return buf.subarray(0, maxBytes).toString("utf8").replace(/\uFFFD+$/, "");
}

const QUESTIONS = {
  task_goal: {
    type: "choice",
    instructions: "What is the primary action requested?",
    criteria: {
      quick_command: "Direct operational server action: stop or start a container, status check, quick toggle",
      write_script: "Writing, coding or creating a script, program, function, or automation script in Python, Go, Node, or Bash",
      architecture_and_concurrency: "High-level architectural failover, networking tunnels, goroutines deadlock, lock-free structures, concurrency race conditions",
      document_knowledge: "Documenting in notebooks, OpenNotebook, synthesizing notes, research summaries",
    },
  },
  thinking_level: {
    type: "choice",
    instructions: "How much reasoning budget does this task need?",
    criteria: {
      none: "Trivial direct command with no reasoning",
      low: "Simple operation or short snippet",
      medium: "Structured script or detailed documentation",
      high: "Complex algorithm or deep architecture",
    },
  },
};

// ── Classifier call ────────────────────────────────────────────────────────
// One call, both answers. Throws on infra failure (timeout/abort/HTTP/JSON) and
// on an out-of-enum answer; the caller turns every throw into a fail-open.
export async function classifyTev(prompt, { signal, timeoutMs = DEFAULT_TIMEOUT_MS, url } = {}) {
  if (Date.now() < circuit.openUntil) {
    throw new Error("circuit-open");
  }
  const endpoint = url || process.env.SYSTEMONE_URL || DEFAULT_SYSTEMONE_URL;
  const state = truncateUtf8(String(prompt ?? ""));
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("classifier-timeout")), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let res;
  let data;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: DEFAULT_DECISION_MODEL, state, questions: QUESTIONS }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`classifier-http-${res.status}`);
    data = await res.json();
  } catch (err) {
    recordFailure();
    throw new Error(`classifier-unavailable:${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }
  recordSuccess();

  const goal = data?.answers?.task_goal;
  const level = data?.answers?.thinking_level;
  if (!goal?.choice || !level?.choice) throw new Error("classifier-malformed-response");
  if (!GOAL_SET.has(goal.choice)) throw new Error(`invalid-task-goal:${goal.choice}`);
  if (!LEVEL_SET.has(level.choice)) throw new Error(`invalid-thinking-level:${level.choice}`);

  // Probability of the option tev1 actually picked (see CHOSEN_PROB_MIN).
  const chosenProb = goal.probabilities?.[goal.choice] ?? null;

  return {
    taskGoal: goal.choice,
    thinkingLevel: level.choice,
    chosenProb,
    confidence: { taskGoal: goal.confidence ?? null, thinkingLevel: level.confidence ?? null },
    probabilities: goal.probabilities || null,
    ms: Date.now() - started,
    model: data?.model || DEFAULT_DECISION_MODEL,
  };
}

// ── Deterministic mapping ──────────────────────────────────────────────────
// config.routingMap holds the specialist per class; write_script splits on the
// off-peak window. `tools`/`vision` are the capability-gate targets.
export function resolveDynamicTarget(classification, config = {}, { offPeak = false, hasTools = false, hasImage = false } = {}) {
  const map = config.routingMap || {};
  const defaultModel = config.defaultModel || null;

  if (hasTools) {
    return { model: map.tools || defaultModel, thinkingLevel: null, reason: "capability:tools" };
  }
  if (hasImage) {
    return { model: map.vision || map.image || defaultModel, thinkingLevel: null, reason: "capability:vision" };
  }

  const goal = classification?.taskGoal || null;
  let model = null;
  let reason = "no-mapping";
  if (goal === "write_script") {
    model = (offPeak ? map.write_script_offpeak : map.write_script_peak) || map.write_script || null;
    reason = `class:write_script@${offPeak ? "offpeak" : "peak"}`;
  } else if (goal) {
    model = map[goal] || null;
    reason = `class:${goal}`;
  }
  if (!model) return { model: defaultModel, thinkingLevel: classification?.thinkingLevel ?? null, reason };
  return { model, thinkingLevel: classification?.thinkingLevel ?? null, reason };
}

// ── Entry point ────────────────────────────────────────────────────────────
// Returns { models, meta }: `models` is the ordered execution chain (chosen
// specialist first, then config.fallbacks — the existing retry cascade tries
// the rest on 429/500/503). `meta` carries the telemetry for logging.
//
// Source of truth for a dynamic combo is config.routingMap + config.fallbacks;
// `combo.models` is only a last-resort safety net so the chain is never empty.
export async function resolveDynamicCombo(combo, body = {}, opts = {}) {
  const t0 = Date.now();
  const config = combo?.config && typeof combo.config === "object" ? combo.config : {};
  const staticModels = Array.isArray(combo?.models) ? combo.models : [];

  if (combo?.type !== "dynamic") {
    return { models: staticModels, meta: { combo: combo?.name ?? null, type: "static", reason: "static", ms: Date.now() - t0 } };
  }

  const now = opts.now instanceof Date ? opts.now : new Date();
  const offPeak = typeof opts.offPeak === "boolean" ? opts.offPeak : isOllamaOffPeak(now);
  const fallbacks = Array.isArray(config.fallbacks) ? config.fallbacks.filter((m) => typeof m === "string" && m) : [];
  const capabilities = detectBodyCapabilities(body);

  const finalize = (model, thinkingLevel, reason, extra = {}) => {
    const chain = [...new Set([model, ...fallbacks].filter((m) => typeof m === "string" && m))];
    const models = chain.length ? chain : staticModels;
    return {
      models,
      meta: {
        combo: combo.name ?? null,
        type: "dynamic",
        model: models[0] || null,
        thinkingLevel: thinkingLevel || null,
        reason,
        offPeak,
        capabilities,
        circuit: circuitState(),
        ms: Date.now() - t0,
        ...extra,
      },
    };
  };

  const failOpen = (reason, extra = {}) => {
    const model = config.defaultModel || fallbacks[0] || staticModels[0] || null;
    log.warn("DYNAMIC", `fail-open (${reason}) → ${model || "no-model"}`);
    return finalize(model, null, reason, { classified: false, ...extra });
  };

  // Capability gate: never route tools/multimodal through a heuristic; go
  // straight to the tool-capable specialist declared in the config.
  if (capabilities.hasTools || capabilities.hasImage) {
    const t = resolveDynamicTarget(null, config, { offPeak, ...capabilities });
    const model = t.model || config.defaultModel || fallbacks[0] || staticModels[0] || null;
    return finalize(model, t.thinkingLevel, t.reason, { classified: false });
  }

  const prompt = extractClassifiableText(body);
  if (!prompt) return failOpen("empty-prompt");

  let cls;
  try {
    cls = await classifyTev(prompt, { url: opts.url, timeoutMs: opts.timeoutMs, signal: opts.signal });
  } catch (err) {
    return failOpen(err.message, { circuit: circuitState() });
  }

  // task_goal drives the routing decision, so the chosen class's PROBABILITY
  // gates fail-open (not tev1's entropy-normalised `confidence`; see
  // CHOSEN_PROB_MIN). thinking_level only tunes the budget, so a weak level
  // degrades to "medium" rather than discarding a usable routing decision.
  const cProb = cls.chosenProb;
  const cLevel = cls.confidence.thinkingLevel;
  if ((cProb ?? 1) < CHOSEN_PROB_MIN) {
    return failOpen("low-confidence", {
      classified: true,
      classification: cls.taskGoal,
      thinkingLevel_classified: cls.thinkingLevel,
      confidence: cls.confidence,
      chosenProb: cProb,
      classifyMs: cls.ms,
    });
  }
  const thinkingLevel = (cLevel ?? 1) < CHOSEN_PROB_MIN ? "medium" : cls.thinkingLevel;

  const target = resolveDynamicTarget({ ...cls, thinkingLevel }, config, { offPeak });
  log.info("DYNAMIC", `class=${cls.taskGoal} (p=${cProb?.toFixed(2) ?? "?"}) thinking=${thinkingLevel} → ${target.model} (${cls.ms}ms)`);
  return finalize(target.model, target.thinkingLevel, target.reason, {
    classified: true,
    classification: cls.taskGoal,
    thinkingLevel_classified: cls.thinkingLevel,
    confidence: cls.confidence,
    chosenProb: cProb,
    classifyMs: cls.ms,
  });
}
