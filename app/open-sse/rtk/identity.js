const MARKER = "<!-- 9ROUTER_IDENTITY:v1 -->";
const SEPARATOR = "\n\n";

function promptFor(context) {
  const parts = [];
  if (context?.globalInstructions?.trim()) {
    parts.push(`<!-- 9ROUTER_GLOBAL -->\nGlobal router instructions:\n${context.globalInstructions.trim()}`);
  }
  if (context?.soul?.trim()) {
    parts.push(`<!-- 9ROUTER_SOUL:${context.id || "default"} -->\nIdentity and permanent profile instructions:\n${context.soul.trim()}`);
  }
  if (context?.mentalModel?.trim()) {
    parts.push(`<!-- 9ROUTER_MENTAL_MODEL:${context.mentalModelId || "default"} -->\nCurrent synthesized profile:\n${context.mentalModel.trim()}`);
  }
  if (context?.bankId) {
    const memory = context?.memory?.trim()
      || "No relevant long-term memory was retrieved for the current query.";
    parts.push(`<!-- 9ROUTER_MEMORY:${context.bankId} -->\nRouter-managed recall result for the current query:\n${memory}`);
  }
  return parts.length ? `${MARKER}\n${parts.join(SEPARATOR)}` : "";
}

export function injectIdentity(body, format, context) {
  const prompt = promptFor(context);
  if (!prompt || !body || typeof body !== "object") return false;
  const serialized = JSON.stringify(body);
  if (serialized.includes(MARKER)) return false;
  const normalized = String(format || "").toLowerCase();

  if (["gemini", "gemini-cli", "vertex", "antigravity"].includes(normalized) || body.request) {
    const target = body.request && typeof body.request === "object" ? body.request : body;
    const key = Object.hasOwn(target, "system_instruction") ? "system_instruction" : "systemInstruction";
    if (!target[key]) target[key] = { parts: [] };
    if (!Array.isArray(target[key].parts)) target[key].parts = [];
    target[key].parts.push({ text: prompt });
    return true;
  }
  if (normalized === "claude" || normalized.startsWith("anthropic")) {
    if (Array.isArray(body.system)) body.system.push({ type: "text", text: prompt });
    else body.system = body.system ? `${body.system}${SEPARATOR}${prompt}` : prompt;
    return true;
  }
  if (normalized === "openai-responses" || typeof body.instructions === "string") {
    body.instructions = body.instructions ? `${body.instructions}${SEPARATOR}${prompt}` : prompt;
    return true;
  }
  const messages = Array.isArray(body.messages) ? body.messages : Array.isArray(body.input) ? body.input : null;
  if (!messages) return false;
  const index = messages.findIndex((message) => ["system", "developer"].includes(message?.role));
  if (index < 0) messages.unshift({ role: "system", content: prompt });
  else if (typeof messages[index].content === "string") messages[index].content += `${SEPARATOR}${prompt}`;
  else if (Array.isArray(messages[index].content)) messages[index].content.push({ type: "input_text", text: prompt });
  else messages[index].content = prompt;
  return true;
}
