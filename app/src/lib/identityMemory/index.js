import * as hindsight from "./hindsight.js";
import * as neo4j from "./neo4j.js";

export { isTrivialMemoryText, userTextWithoutInjectedContext } from "./common.js";

const IMPLEMENTATIONS = { hindsight, neo4j };
const warnedValues = new Set();

function warnUnknown(value, source) {
  const warningKey = `${source}:${value}`;
  if (warnedValues.has(warningKey)) return;
  warnedValues.add(warningKey);
  console.warn(`[IdentityMemory] Unknown ${source} backend "${value}"; using the configured default`);
}

export function getDefaultMemoryBackend() {
  const configured = String(process.env.IDENTITY_MEMORY_BACKEND || "").trim().toLowerCase();
  if (!configured) return "hindsight";
  if (IMPLEMENTATIONS[configured]) return configured;
  warnUnknown(configured, "global");
  return "hindsight";
}

export function getMemoryBackend(profile) {
  const configured = String(profile?.memoryBackend || "").trim().toLowerCase();
  if (!configured) return getDefaultMemoryBackend();
  if (IMPLEMENTATIONS[configured]) return configured;
  warnUnknown(configured, "profile");
  return getDefaultMemoryBackend();
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
