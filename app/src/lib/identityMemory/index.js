import * as neo4j from "./neo4j.js";

export { isTrivialMemoryText, userTextWithoutInjectedContext } from "./common.js";

// Entrega 4 — Neo4j is the only identity-memory backend. The Hindsight
// implementation is gone (it synthesized memory through an LLM and burned
// tokens), so any inherited value is coerced instead of erroring a request.
const DEFAULT_MEMORY_BACKEND = "neo4j";
const IMPLEMENTATIONS = { neo4j };
const warnedValues = new Set();

// Structured, once per (source, value), and never carrying profile data.
function coerce(value, source) {
  const configured = String(value || "").trim().toLowerCase();
  if (!configured || configured === DEFAULT_MEMORY_BACKEND) return DEFAULT_MEMORY_BACKEND;
  const warningKey = `${source}:${configured}`;
  if (!warnedValues.has(warningKey)) {
    warnedValues.add(warningKey);
    console.warn(`[IdentityMemory] ${source} memory backend "${configured}" is not supported; using "${DEFAULT_MEMORY_BACKEND}"`);
  }
  return DEFAULT_MEMORY_BACKEND;
}

export function getDefaultMemoryBackend() {
  return coerce(process.env.IDENTITY_MEMORY_BACKEND, "global");
}

export function getMemoryBackend(profile) {
  const configured = String(profile?.memoryBackend || "").trim().toLowerCase();
  return configured ? coerce(configured, "profile") : getDefaultMemoryBackend();
}

function implementation(profile) {
  return IMPLEMENTATIONS[getMemoryBackend(profile)];
}

function bankId(profileOrBankId) {
  return typeof profileOrBankId === "object"
    ? profileOrBankId?.hindsightBankId
    : profileOrBankId;
}

export const ensureBank = (profileOrBankId, name) =>
  implementation(typeof profileOrBankId === "object" ? profileOrBankId : null)
    .ensureBank(bankId(profileOrBankId), name);

export const ensureMentalModel = (profileOrBankId, mentalModelIdOrName, name) => {
  if (typeof profileOrBankId === "object") {
    return implementation(profileOrBankId).ensureMentalModel(
      profileOrBankId?.hindsightBankId,
      profileOrBankId?.mentalModelId,
      mentalModelIdOrName,
    );
  }
  return implementation(null).ensureMentalModel(profileOrBankId, mentalModelIdOrName, name);
};

export const mentalModelForProfile = (profile) =>
  implementation(profile).mentalModelForProfile(profile);

export const listBankMemories = (profileOrBankId, limit, offset) =>
  implementation(typeof profileOrBankId === "object" ? profileOrBankId : null)
    .listBankMemories(bankId(profileOrBankId), limit, offset);

export const clearBankMemories = async (profileOrBankId) => {
  const profile = typeof profileOrBankId === "object" ? profileOrBankId : null;
  const selected = implementation(profile);
  const result = await selected.clearBankMemories(bankId(profileOrBankId));
  selected.clearMemoryDedupCaches();
  return result;
};

export const recallForProfile = (profile, body) =>
  implementation(profile).recallForProfile(profile, body);

export const retainForProfile = (profile, body, documentId) =>
  implementation(profile).retainForProfile(profile, body, documentId);

export const clearMemoryDedupCaches = (profile) =>
  implementation(profile).clearMemoryDedupCaches();
