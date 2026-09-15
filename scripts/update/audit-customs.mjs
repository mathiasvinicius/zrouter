#!/usr/bin/env node
// audit-customs.mjs — gera docs/CUSTOMS.md: a memória do fork.
//
// ESTRUTURA: neste fork o código do upstream vive em `app/` (o upstream tem os
// arquivos na raiz). Por isso NÃO comparamos duas árvores do git — materializamos
// a tag base do upstream num diretório temporário e comparamos arquivo a arquivo
// contra `app/`. É o único jeito de o resultado ser verdadeiro.
//
// Uso:
//   node scripts/update/audit-customs.mjs --base v0.5.75 --out docs/CUSTOMS.md
//   node scripts/update/audit-customs.mjs --check-markers      # portão da Fase 3
//   node scripts/update/audit-customs.mjs --impact             # o que o upstream tocou desde a base
//
// Sem --base, usa a tag zrouter-base-* mais recente.

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";

const REPO = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const APP = join(REPO, "app");

// Não existem no upstream / não interessam ao diff.
const EXCLUDE = [
  /^node_modules\//, /^\.next/, /^data\//, /^\.git\//,
  /^package-lock\.json$/, /^\.env$/, /^docker-compose\.override\.yml$/,
  /^tests\/node_modules\//, /^\.next-cli-build\//,
];

// Marcadores cuja presença prova que um custom sobreviveu a um merge (portão 3).
// Cada entrada aponta o arquivo que DE FATO contém o texto (verificado no código).
const MARKERS = [
  { file: "app/open-sse/rtk/identity.js", must: ["ZROUTER_SOURCES", "SOURCES_MARKER"] },
  { file: "app/src/lib/identityMemory/neo4j.js", must: ["MERGE (b:Bank", "ON CREATE"] },
  { file: "app/open-sse/sources/index.js", must: ["searchSources", "SourcePermissionError"] },
  { file: "app/src/lib/sources/context.js", must: ["recallSourcesForKey", "capabilitiesBlockForKey"] },
  { file: "app/src/shared/constants/capabilities.js", must: ["ZROUTER_CAPABILITIES", "MAX_CAPABILITIES_CHARS"] },
  { file: "docker-compose.yml", must: ["profiles:", "bundled"] },
];

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const hasFlag = (name) => process.argv.includes(name);

function git(args, opts = {}) {
  try {
    return execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts }).trim();
  } catch {
    return "";
  }
}

function latestBaseTag() {
  const tags = git(["tag", "-l", "zrouter-base-*"]).split("\n").filter(Boolean);
  return tags.sort((a, b) => {
    const va = (a.match(/(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
    const vb = (b.match(/(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
    for (let i = 0; i < 3; i++) if ((va[i] || 0) !== (vb[i] || 0)) return (va[i] || 0) - (vb[i] || 0);
    return 0;
  }).pop() || null;
}

// ── portão de marcadores ──────────────────────────────────────────────────────
if (hasFlag("--check-markers")) {
  const missing = [];
  for (const { file, must } of MARKERS) {
    let content = "";
    try { content = readFileSync(join(REPO, file), "utf8"); }
    catch { missing.push(`${file} (arquivo ausente)`); continue; }
    for (const needle of must) if (!content.includes(needle)) missing.push(`${file} (falta: ${needle})`);
  }
  if (missing.length) {
    console.error("PORTÃO FALHOU — customs marcados desapareceram:");
    for (const m of missing) console.error("  - " + m);
    process.exit(1);
  }
  console.log(`OK — ${MARKERS.length} arquivos com marcadores, todos presentes.`);
  process.exit(0);
}

const BASE = arg("--base") || latestBaseTag();
if (!BASE) {
  console.error("Nenhuma tag base encontrada. Crie: git tag -a zrouter-base-vX.Y.Z <commit-upstream> -m '...'");
  process.exit(2);
}
// A base precisa existir de verdade. Resolve via execFileSync direto (a função git()
// abaixo engole erros e devolve "", o que mascararia uma tag ausente).
try {
  execFileSync("git", ["rev-parse", "--verify", `${BASE}^{commit}`], {
    cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
} catch {
  console.error(`Tag/commit base inexistente: ${BASE}`);
  process.exit(2);
}

// ── materializa a árvore da base do upstream ──────────────────────────────────
const workDir = mkdtempSync(join(tmpdir(), "zrouter-base-"));
try {
  execFileSync("bash", ["-c", `git archive ${BASE} | tar -x -C ${JSON.stringify(workDir)}`], { cwd: REPO });
} catch (error) {
  rmSync(workDir, { recursive: true, force: true });
  console.error(`Falha ao materializar ${BASE}: ${error.message}`);
  process.exit(3);
}

const excluded = (p) => EXCLUDE.some((re) => re.test(p));

function walk(root) {
  const out = {};
  const visit = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { visit(full); continue; }
      const rel = relative(root, full).split("\\").join("/");
      if (excluded(rel)) continue;
      try { out[rel] = readFileSync(full, "utf8"); } catch { /* binário */ out[rel] = null; }
    }
  };
  visit(root);
  return out;
}

const baseFiles = walk(workDir);
const ourFiles = walk(APP);

const added = [], removed = [], modified = [];
for (const [rel, content] of Object.entries(ourFiles)) {
  if (!(rel in baseFiles)) { added.push(rel); continue; }
  if (baseFiles[rel] === null || content === null) continue;
  if (baseFiles[rel] !== content) modified.push(rel);
}
for (const rel of Object.keys(baseFiles)) if (!(rel in ourFiles)) removed.push(rel);

const lineStats = (rel) => {
  const base = baseFiles[rel] ?? "";
  const ours = ourFiles[rel] ?? "";
  const b = base ? base.split("\n") : [];
  const o = ours ? ours.split("\n") : [];
  const bset = new Set(b), oset = new Set(o);
  return {
    added: o.filter((l) => !bset.has(l)).length,
    removed: b.filter((l) => !oset.has(l)).length,
  };
};

rmSync(workDir, { recursive: true, force: true });

// ── --impact: quais dos nossos pontos de acoplamento o upstream mexeu ─────────
if (hasFlag("--impact")) {
  const upstreamTarget = arg("--target", "upstream/master");
  // Garante que o alvo existe localmente (o fetch é do chamador: check-upstream.sh).
  try {
    execFileSync("git", ["rev-parse", "--verify", upstreamTarget], {
      cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    console.error(JSON.stringify({
      base: BASE, target: upstreamTarget, error: "target-not-fetched",
      hint: `git fetch upstream --tags   (falta ${upstreamTarget} localmente)`,
    }, null, 2));
    process.exit(3);
  }

  const touched = git(["diff", "--name-only", BASE, upstreamTarget]).split("\n").filter(Boolean);

  // Só é conflito REAL quando os DOIS lados mudaram o mesmo arquivo:
  //   - nós: existe em `modified` (arquivo do upstream que editamos)
  //   - eles: aparece no diff da base até o alvo
  // Arquivos que apenas existem dos dois lados não são conflito.
  const ourCustoms = new Set(modified);
  const norm = (f) => f.replace(/^app\//, "");
  const touchedNorm = new Set(touched.map(norm));
  const collisions = touched.filter((f) => ourCustoms.has(norm(f)));

  // Impacto "de superfície": arquivos do upstream que não temos (ou não editamos).
  const inert = touched.filter((f) => !ourCustoms.has(norm(f)));

  const result = {
    base: BASE,
    target: upstreamTarget,
    upstreamTouched: touched.length,
    ourCustomFiles: ourCustoms.size,
    collisions,
    collisionCount: collisions.length,
    inertCount: inert.length,
    clean: collisions.length === 0,
    verdict: collisions.length === 0
      ? `MERGE LIMPO — o upstream tocou ${touched.length} arquivo(s) e nenhum deles é customizado`
      : `ATENÇÃO — ${collisions.length} arquivo(s) customizado(s) mudaram nos dois lados`,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.clean ? 0 : 10);
}

// ── gera o CUSTOMS.md ─────────────────────────────────────────────────────────
const OUT = arg("--out", "docs/CUSTOMS.md");
const now = new Date().toISOString().slice(0, 19).replace("T", " ");
const L = [];
L.push("# CUSTOMS — o que o ZRouter mudou em relação ao upstream", "");
L.push(`> **Gerado automaticamente** por \`scripts/update/audit-customs.mjs\` em ${now}.`);
L.push(`> Base: \`${BASE}\` (raiz do upstream 9Router) · comparada contra \`app/\` · HEAD \`${git(["rev-parse", "--short", "HEAD"])}\``);
L.push(">");
L.push("> **Não edite à mão.** Este documento é a memória do fork: a pipeline");
L.push("> (`docs/UPDATE-PIPELINE.md`) o consulta ao resolver conflitos de merge.");
L.push("> Regenere com `node scripts/update/audit-customs.mjs --base <tag>`.");
L.push("");
L.push("## Resumo", "");
L.push(`- **Modificados** (existem no upstream): **${modified.length}** — onde um merge disputa conteúdo`);
L.push(`- **Adicionados** (só nossos): ${added.length}`);
L.push(`- **Removidos** (no upstream, não em nós): ${removed.length}`);
L.push("");
L.push("O risco de um update mora nos **modificados**. Adicionados e removidos normalmente");
L.push("resolvem sozinhos.");
L.push("");

const group = (list) => {
  const by = new Map();
  for (const p of list) {
    const seg = p.split("/");
    const top = seg.slice(0, seg[0] === "src" && seg[1] === "app" ? 3 : Math.min(2, seg.length - 1)).join("/") || p;
    if (!by.has(top)) by.set(top, []);
    by.get(top).push(p);
  }
  return [...by.entries()].sort((a, b) => b[1].length - a[1].length);
};

L.push(`## Modificados (${modified.length}) — pontos de acoplamento`, "");
for (const [top, files] of group(modified)) {
  L.push(`### \`${top}\` (${files.length})`, "");
  for (const f of files.sort()) {
    const { added: a, removed: r } = lineStats(f);
    L.push(`- \`${f}\` — +${a}/-${r}`);
  }
  L.push("");
}

if (added.length) {
  L.push(`## Adicionados (${added.length}) — arquivos nossos`, "");
  for (const [top, files] of group(added)) {
    L.push(`### \`${top}\` (${files.length})`, "");
    for (const f of files.sort()) L.push(`- \`${f}\``);
    L.push("");
  }
}

if (removed.length) {
  L.push(`## Removidos (${removed.length})`, "");
  for (const f of removed.sort()) L.push(`- \`${f}\``);
  L.push("");
}

L.push("## Marcadores que provam que um custom sobreviveu", "");
L.push("A Fase 3 roda `audit-customs.mjs --check-markers` e **falha o update** se algum sumir:", "");
for (const { file, must } of MARKERS) {
  L.push(`- \`${file}\``);
  for (const n of must) L.push(`  - \`${n}\``);
}
L.push("");

const outPath = join(REPO, OUT);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, L.join("\n"), "utf8");

console.log(`CUSTOMS.md gerado: ${OUT}`);
console.log(`  base: ${BASE}`);
console.log(`  modificados: ${modified.length} | adicionados: ${added.length} | removidos: ${removed.length}`);
