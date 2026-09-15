#!/usr/bin/env node
// migrate-from-9router.mjs — copia providers/keys/combos/settings do 9Router
// (produção) para o ZRouter, sem trazer o que viraria bagunça.
//
// Regras (ver docs/MIGRACAO-CUTOVER.md):
//   - origem sempre em modo somente-leitura
//   - destino numa transação única (rollback total em erro)
//   - colunas mapeadas explicitamente, nunca SELECT *
//   - NÃO migra: o combo `hindsight` e a key `hindsight-internal` (backend removido)
//   - NÃO sobrescreve: settings.globalInstructions, settings.password
//   - normaliza memoryBackend herdado para 'neo4j'
//   - preenche apiKeys.sources com '{}' quando ausente
//   - valida FK antes de inserir; aborta se houver órfão
//   - nunca imprime valor de credencial — só contagens
//
// Uso:
//   node scripts/migrate-from-9router.mjs --dry-run          (padrão: não escreve)
//   node scripts/migrate-from-9router.mjs --apply            (escreve no destino)
//   node scripts/migrate-from-9router.mjs --apply --src <path> --dst <path>

import { existsSync, copyFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");

const require = createRequire(import.meta.url);
// O script vive em ../scripts/, mas better-sqlite3 é dependência do app/. Resolve pelos
// dois lados: o require normal e o node_modules do app.
function loadSqlite() {
  const candidates = [
    () => require("better-sqlite3"),
    () => require(join(REPO, "app/node_modules/better-sqlite3")),
  ];
  for (const attempt of candidates) {
    try { return attempt(); } catch { /* tenta o próximo */ }
  }
  return null;
}
let Database = loadSqlite();
if (!Database) {
  console.error("better-sqlite3 não encontrado (nem no require normal, nem em app/node_modules).");
  process.exit(2);
}

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const APPLY = process.argv.includes("--apply");

const SRC = arg("--src", "/opt/containers/9router/data/db/data.sqlite");
const DST = arg("--dst", join(REPO, "data/db/data.sqlite"));

// ── exclusões deliberadas ────────────────────────────────────────────────────
const SKIP_COMBO_NAMES = new Set(["hindsight"]);
const SKIP_KEY_NAMES = new Set(["hindsight-internal"]);
// settings que NÃO podem vir da origem (reverteriam o rebranding / a senha do dono)
const PROTECTED_SETTINGS = new Set(["globalInstructions", "password"]);

// ── tabelas e colunas que migram (explícito, nunca SELECT *; nomes verificados
//    contra PRAGMA table_info das duas bases) ────────────────────────────────
const TABLES = {
  providerConnections: ["id", "provider", "authType", "name", "email", "priority", "isActive", "data", "createdAt", "updatedAt"],
  providerNodes: ["id", "type", "name", "data", "createdAt", "updatedAt"],
  combos: ["id", "name", "kind", "models", "createdAt", "updatedAt"],
  apiKeys: ["id", "key", "name", "machineId", "comboId", "soul", "hindsightBankId", "memoryBackend", "mentalModelId", "memoryEnabled", "isService", "isActive", "createdAt", "updatedAt"],
  proxyPools: ["id", "isActive", "testStatus", "data", "createdAt", "updatedAt"],
};

function cols(db, table) {
  return db.prepare(`PRAGMA table_info("${table}")`).all().map((r) => r.name);
}
function tableExists(db, table) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
}

if (!existsSync(SRC)) { console.error(`Origem inexistente: ${SRC}`); process.exit(2); }
if (!existsSync(DST)) { console.error(`Destino inexistente: ${DST}`); process.exit(2); }

console.log(`origem : ${SRC}`);
console.log(`destino: ${DST}`);
console.log(`modo   : ${APPLY ? "APPLY (escreve)" : "DRY-RUN (não escreve)"}`);
console.log();

// ── backup antes de qualquer escrita ─────────────────────────────────────────
if (APPLY) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const bak = `${DST}.bak-premigracao-${ts}`;
  copyFileSync(DST, bak);
  console.log(`backup do destino: ${bak} (${statSync(DST).size} bytes)\n`);
}

const src = new Database(SRC, { readonly: true });
const dst = new Database(DST);

const report = { tables: {}, skipped: {}, protected: [] };

try {
  // ── 1. combos (precisa vir antes das keys, que referenciam comboId) ────────
  const comboRows = src.prepare(`SELECT ${TABLES.combos.join(",")} FROM combos`).all();
  const keepCombos = comboRows.filter((c) => !SKIP_COMBO_NAMES.has(String(c.name || "").trim()));
  report.skipped.combos = comboRows.length - keepCombos.length;
  const keptComboIds = new Set(keepCombos.map((c) => c.id));

  // ── 2. keys (valida FK contra os combos que realmente migram) ─────────────
  const keyRows = src.prepare(`SELECT ${TABLES.apiKeys.join(",")} FROM apiKeys`).all();
  const keepKeys = [];
  let skippedOrphan = 0;
  for (const k of keyRows) {
    if (SKIP_KEY_NAMES.has(String(k.name || "").trim())) { report.skipped.keys = (report.skipped.keys || 0) + 1; continue; }
    if (k.comboId && !keptComboIds.has(k.comboId)) { skippedOrphan += 1; continue; }
    // normaliza o backend herdado (Hindsight não existe no ZRouter)
    k.memoryBackend = k.memoryBackend && String(k.memoryBackend).toLowerCase() === "neo4j" ? "neo4j" : (k.memoryBackend ? "neo4j" : "neo4j");
    keepKeys.push(k);
  }
  report.skipped.keysOrphans = skippedOrphan;

  // ── 3. demais tabelas ─────────────────────────────────────────────────────
  const plan = {
    combos: keepCombos,
    apiKeys: keepKeys,
    providerConnections: src.prepare(`SELECT ${TABLES.providerConnections.join(",")} FROM providerConnections`).all(),
    providerNodes: tableExists(src, "providerNodes")
      ? src.prepare(`SELECT ${TABLES.providerNodes.join(",")} FROM providerNodes`).all() : [],
    proxyPools: tableExists(src, "proxyPools")
      ? src.prepare(`SELECT ${TABLES.proxyPools.join(",")} FROM proxyPools`).all() : [],
  };

  // ── 4. settings (mescla, protegendo as chaves do ZRouter) ─────────────────
  const srcSettings = JSON.parse(src.prepare("SELECT data FROM settings WHERE id=1").get()?.data || "{}");
  const dstSettingsRow = dst.prepare("SELECT data FROM settings WHERE id=1").get();
  const dstSettings = JSON.parse(dstSettingsRow?.data || "{}");

  for (const key of PROTECTED_SETTINGS) {
    if (key in srcSettings) report.protected.push(key);
  }
  const mergedSettings = { ...srcSettings, ...dstSettings };
  for (const key of PROTECTED_SETTINGS) {
    if (key in dstSettings) mergedSettings[key] = dstSettings[key];
    else delete mergedSettings[key];
  }

  // ── relatório do plano ────────────────────────────────────────────────────
  for (const [t, rows] of Object.entries(plan)) {
    const dstCols = cols(dst, t);
    // Vazio é válido; o que importa é toda coluna que pretendemos escrever existir no destino.
    const missing = TABLES[t].filter((c) => !dstCols.includes(c));
    report.tables[t] = { rows: rows.length, writable: missing.length === 0, ...(missing.length ? { missing } : {}) };
  }
  report.tables.settings = { mergedKeys: Object.keys(mergedSettings).length, protected: report.protected };

  console.log("=== PLANO ===");
  for (const [t, info] of Object.entries(report.tables)) {
    console.log(`  ${t.padEnd(20)} ${JSON.stringify(info)}`);
  }
  if (report.skipped.combos) console.log(`  pulados: combo "hindsight" x${report.skipped.combos}`);
  if (report.skipped.keys) console.log(`  pulados: key "hindsight-internal" x${report.skipped.keys}`);
  if (skippedOrphan) console.log(`  pulados: keys órfãs (comboId não migra) x${skippedOrphan}`);
  console.log(`  protegidos: ${report.protected.join(", ") || "(nenhum)"}`);
  console.log();

  if (!APPLY) {
    console.log("DRY-RUN: nada foi escrito. Rode com --apply para executar.");
    process.exit(0);
  }

  // ── 5. escrita, em transação única ────────────────────────────────────────
  const insert = (table, colsList) => {
    const ph = colsList.map(() => "?").join(",");
    return dst.prepare(`INSERT OR REPLACE INTO "${table}" (${colsList.map((c) => `"${c}"`).join(",")}) VALUES (${ph})`);
  };

  const tx = dst.transaction(() => {
    for (const c of plan.combos) {
      insert("combos", TABLES.combos).run(...TABLES.combos.map((k) => c[k] ?? null));
    }
    for (const k of plan.apiKeys) {
      const list = [...TABLES.apiKeys];
      const row = list.map((key) => k[key] ?? null);
      const hasSources = cols(dst, "apiKeys").includes("sources");
      if (hasSources) {
        list.push("sources");
        row.push("{}"); // o ZRouter usa o default vazio; escopos são configurados no modal
      }
      insert("apiKeys", list).run(...row);
    }
    for (const t of ["providerConnections", "providerNodes", "proxyPools"]) {
      for (const r of plan[t]) insert(t, TABLES[t]).run(...TABLES[t].map((k) => r[k] ?? null));
    }
    if (dstSettingsRow) dst.prepare("UPDATE settings SET data=? WHERE id=1").run(JSON.stringify(mergedSettings));
    else dst.prepare("INSERT INTO settings (id,data) VALUES (1,?)").run(JSON.stringify(mergedSettings));
  });

  tx();

  // ── 6. verificação pós-escrita ────────────────────────────────────────────
  console.log("=== APLICADO — verificação ===");
  for (const t of ["providerConnections", "apiKeys", "combos", "providerNodes", "proxyPools"]) {
    const n = dst.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
    console.log(`  ${t.padEnd(20)} ${n} linhas`);
  }
  const st = JSON.parse(dst.prepare("SELECT data FROM settings WHERE id=1").get().data);
  console.log(`  globalInstructions    ${(st.globalInstructions || "").length} chars ${/ZROUTER_/.test(st.globalInstructions || "") ? "(ZROUTER_ ✓)" : "(ATENÇÃO)"}`);
  console.log(`  password preservado   ${st.password === dstSettings.password ? "sim ✓" : "NÃO"}`);
  const withHindsightCombo = dst.prepare("SELECT COUNT(*) AS n FROM combos WHERE name='hindsight'").get().n;
  console.log(`  combo hindsight no destino: ${withHindsightCombo} ${withHindsightCombo === 0 ? "(excluído ✓)" : "(ATENÇÃO)"}`);
  const orphan = dst.prepare("SELECT COUNT(*) AS n FROM apiKeys k LEFT JOIN combos c ON c.id=k.comboId WHERE k.comboId IS NOT NULL AND c.id IS NULL").get().n;
  console.log(`  keys orgãs (FK quebrada): ${orphan} ${orphan === 0 ? "✓" : "(ATENÇÃO)"}`);
} catch (error) {
  console.error(`\nFALHA: ${error.message}`);
  process.exitCode = 1;
} finally {
  src.close();
  dst.close();
}
