import { randomUUID } from "node:crypto";

// Bank ids are interpolated into Cypher as parameters, but this pattern is the
// defense-in-depth guard against injection — never remove it.
const BANK_ID_PATTERN = /^[a-zA-Z0-9_.-]+$/;
// Entrega 4 — Neo4j is the only backend. "hindsight" is a legacy value kept
// only so older dashboard payloads/database rows do not start erroring.
const MEMORY_BACKENDS = new Set(["neo4j"]);
const LEGACY_MEMORY_BACKENDS = new Set(["hindsight"]);

function warnLegacyBackend(value) {
  console.warn(`[IdentityMemory] memory backend "${value}" is no longer supported; using "neo4j"`);
}

export function normalizeMemoryBackend(value) {
  if (value === undefined || value === null || value === "" || value === "auto") return null;
  const normalized = String(value).trim().toLowerCase();
  if (LEGACY_MEMORY_BACKENDS.has(normalized)) {
    warnLegacyBackend(normalized);
    return "neo4j";
  }
  if (!MEMORY_BACKENDS.has(normalized)) {
    throw new Error('Memory backend must be "neo4j" or empty to inherit the global default');
  }
  return normalized;
}

function profileSlug(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "profile";
}

/**
 * Resolve the optional memory portion of an API-key profile.
 *
 * `hindsightBankId` is the memory bank id column. The name is historical and is
 * deliberately not renamed — a rename would be a destructive migration for a
 * field the Neo4j recall already reads. Disabled memory detaches the bank and
 * mental model without deleting anything remote, so re-enabling is safe.
 */
export function resolveMemoryProfile({ enabled, bankId, memoryBackend, mentalModelId, name }) {
  const normalizedBackend = normalizeMemoryBackend(memoryBackend);
  if (!enabled) {
    return {
      memoryEnabled: false,
      hindsightBankId: null,
      memoryBackend: normalizedBackend,
      mentalModelId: null,
    };
  }

  const normalizedBankId = String(bankId || "").trim();
  if (!normalizedBankId || !BANK_ID_PATTERN.test(normalizedBankId)) {
    throw new Error("A valid memory bank ID is required when memory is enabled");
  }

  return {
    memoryEnabled: true,
    hindsightBankId: normalizedBankId,
    memoryBackend: normalizedBackend,
    mentalModelId: mentalModelId || `${profileSlug(name)}-${randomUUID().slice(0, 8)}`,
  };
}
