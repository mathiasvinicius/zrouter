// Capability index injected as 9ROUTER_CAPABILITIES.
//
// Derived from the skills registry (src/shared/constants/skills.js) plus the sources
// the key actually has enabled — never a static skill list inside globalInstructions.
// Hard cap: MAX_CAPABILITIES_CHARS (chat/models/sources always survive the cut).

import { SKILLS } from "@/shared/constants/skills.js";

export const CAPABILITIES_MARKER = "<!-- 9ROUTER_CAPABILITIES:v1 -->";
export const MAX_CAPABILITIES_CHARS = 1200;

// Capability labels whose lines are never dropped when the char budget is exceeded.
const ALWAYS = ["chat", "models", "sources"];
// Skill id → capability label; unlisted ids fall back to the id minus the 9router- prefix.
const LABELS = {
  "9router-chat": "chat",
  "9router-image": "image",
  "9router-video": "video",
  "9router-tts": "tts",
  "9router-stt": "stt",
  "9router-embeddings": "embeddings",
  "9router-web-search": "web-search",
  "9router-web-fetch": "web-fetch",
  "9router-memory": "memory",
};
// Human gloss for enabled origins; unknown origin → the id itself.
const ORIGIN_LABELS = {
  "open-notebook": "Open Notebook (biblioteca documental)",
  neo4j: "Neo4j (memória)",
  notion: "Notion",
};

// One "- label[: POST endpoint]" line per registry skill, then the model-discovery line.
function capabilityLines(skills) {
  const lines = [];
  for (const skill of skills || []) {
    if (skill?.isEntry) continue;
    const label = LABELS[skill?.id] || String(skill?.id || "").replace(/^9router-/, "");
    if (!label) continue;
    lines.push(skill.endpoint ? `- ${label}: POST ${skill.endpoint}` : `- ${label}`);
  }
  lines.push("- models: GET /v1/models");
  return lines;
}

const isAlways = (line) => ALWAYS.some((kind) => line.startsWith(`- ${kind}:`));

/**
 * @param {Array<{id:string,isEntry?:boolean,endpoint?:string|null}>} skills registry (injectable for tests)
 * @param {string[]} origins enabled source origins, e.g. ["open-notebook","neo4j"]
 * @param {number} maxChars hard character cap
 * @returns {string} the block, or "" when nothing can be listed
 */
export function buildCapabilitiesBlock(skills = SKILLS, origins = [], maxChars = MAX_CAPABILITIES_CHARS) {
  const enabled = [...new Set((origins || []).map((origin) => String(origin || "").trim()).filter(Boolean))];
  const fixed = [];
  const optional = [];
  for (const line of capabilityLines(skills)) (isAlways(line) ? fixed : optional).push(line);
  const originLines = enabled.length === 0 ? [] : [
    `- sources: ${enabled.join(", ")}`,
    `- knowledge: ${enabled.map((origin) => ORIGIN_LABELS[origin] || origin).join(", ")}`,
  ];
  const head = [
    CAPABILITIES_MARKER,
    "Gateway capabilities available to this key (ZRouter):",
  ];
  const tail = "Discover available models with GET /v1/models before assuming one exists.";
  // Drop the least-priority (last non-protected) line until the block fits.
  while (true) {
    const body = [...head, ...fixed, ...originLines, ...optional, tail].join("\n");
    if (body.length <= maxChars || optional.length === 0) return body;
    optional.pop();
  }
}
