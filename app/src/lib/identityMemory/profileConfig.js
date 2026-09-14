import { randomUUID } from "node:crypto";

const BANK_ID_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const MEMORY_BACKENDS = new Set(["hindsight", "neo4j"]);

export function normalizeMemoryBackend(value) {
  if (value === undefined || value === null || value === "" || value === "auto") return null;
  const normalized = String(value).trim().toLowerCase();
  if (!MEMORY_BACKENDS.has(normalized)) {
    throw new Error('Memory backend must be "hindsight", "neo4j", or empty to inherit the global default');
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
 * Resolve the optional Hindsight portion of an API-key profile.
 *
 * Disabled memory deliberately detaches both the bank and mental model. It
 * does not delete the remote bank, so re-enabling it later is safe.
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
