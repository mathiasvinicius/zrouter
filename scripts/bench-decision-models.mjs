#!/usr/bin/env node
// Benchmark de modelos de decisão (/v1/systemone) para o prime-codes-dynamic.
// Uso: node scripts/bench-decision-models.mjs tev1:0.8b clef:cloud clef-flash:cloud
// Usa as mesmas QUESTIONS/truncamento do dynamicRouter.js e mede acurácia,
// probabilidade da classe escolhida, % acima de CHOSEN_PROB_MIN e latência.
import { QUESTIONS_FOR_BENCH as Q } from "../app/src/sse/services/dynamicRouter.js";

const URL = process.env.SYSTEMONE_URL || "http://127.0.0.1:11434/v1/systemone";
const MIN_PROB = 0.45;

// [prompt, task_goal esperado, thinking_level esperado]
const CASES = [
  ["pare o container navidrome", "quick_command", "none"],
  ["reinicia o adguard-home e me diz o status", "quick_command", "none"],
  ["docker ps pra ver se o neo4j está de pé", "quick_command", "none"],
  ["liga de novo o runtipi-queue", "quick_command", "none"],
  ["Stop the zrouter container and tell me when it's down", "quick_command", "none"],
  ["escreva um script bash que faça backup do data.sqlite com rotação de 7 dias", "write_script", "medium"],
  ["crie uma função em Python que parseia logs do nginx e conta 5xx por minuto", "write_script", "low"],
  ["faz um script node que sincroniza modelos do ollama e grava em JSON", "write_script", "medium"],
  ["write a Go CLI that watches a directory and uploads changed files to S3", "write_script", "medium"],
  ["automatiza o deploy do compose com um script que faz rollback se o healthcheck falhar", "write_script", "medium"],
  ["resuma essas anotações da reunião no OpenNotebook em tópicos", "document_knowledge", "medium"],
  ["documente a arquitetura do zrouter num caderno com diagramas", "document_knowledge", "medium"],
  ["sintetize os 5 artigos de pesquisa sobre decision models em um resumo", "document_knowledge", "medium"],
  ["organize minhas notas de estudo de Kubernetes em um caderno", "document_knowledge", "low"],
  ["Summarize this research note into key findings for my notebook", "document_knowledge", "low"],
  ["tenho um deadlock entre duas goroutines que seguram mutex em ordem inversa, como redesenhar sem locks?", "architecture_and_concurrency", "high"],
  ["projete o failover ativo-passivo entre Zenith e VPS com túnel WireGuard e split-brain protection", "architecture_and_concurrency", "high"],
  ["implemente uma fila lock-free MPMC e prove que não há race condition", "architecture_and_concurrency", "high"],
  ["race condition no circuit breaker sob requisições concorrentes, qual a melhor estratégia?", "architecture_and_concurrency", "high"],
  ["Design a distributed lease so two nodes never both serve the DNS failover", "architecture_and_concurrency", "high"],
];

const pct = (n, d) => (d ? ((100 * n) / d).toFixed(0) + "%" : "-");

async function run(model) {
  const r = { model, n: 0, err: 0, goalOk: 0, lvlOk: 0, lvlWithin1: 0, gated: 0, ms: [], miss: [] };
  const order = ["none", "low", "medium", "high"];
  for (const [state, goal, lvl] of CASES) {
    const t0 = Date.now();
    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, state, questions: Q }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 80)}`);
      const d = await res.json();
      const g = d.answers.task_goal;
      const l = d.answers.thinking_level;
      r.n++;
      r.ms.push(Date.now() - t0);
      const p = g.probabilities?.[g.choice] ?? 0;
      if (g.choice === goal) r.goalOk++;
      else r.miss.push(`${goal} -> ${g.choice} (p=${p.toFixed(2)}) :: ${state.slice(0, 50)}`);
      if (p >= MIN_PROB) r.gated++;
      if (l.choice === lvl) r.lvlOk++;
      if (Math.abs(order.indexOf(l.choice) - order.indexOf(lvl)) <= 1) r.lvlWithin1++;
    } catch (e) {
      r.err++;
      if (r.err === 1) console.error(`[${model}] ${e.message}`);
    }
  }
  r.ms.sort((a, b) => a - b);
  return r;
}

const models = process.argv.slice(2);
if (!models.length) {
  console.error("informe ao menos um modelo");
  process.exit(1);
}
console.log("modelo | n | erros | acc goal | acc level | level±1 | p>=0.45 | p50 ms | p95 ms");
for (const m of models) {
  const r = await run(m);
  const q = (x) => r.ms[Math.min(r.ms.length - 1, Math.floor(r.ms.length * x))] ?? "-";
  console.log([m, r.n, r.err, pct(r.goalOk, r.n), pct(r.lvlOk, r.n), pct(r.lvlWithin1, r.n), pct(r.gated, r.n), q(0.5), q(0.95)].join(" | "));
  r.miss.forEach((x) => console.log("   miss:", x));
}
