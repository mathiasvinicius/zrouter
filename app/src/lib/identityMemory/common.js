export function lastUserText(body) {
  const messages = Array.isArray(body?.messages)
    ? body.messages
    : Array.isArray(body?.input) ? body.input : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .map((part) => part?.text || part?.content || "")
        .filter(Boolean)
        .join("\n");
    }
  }
  return "";
}

export function userTextWithoutInjectedContext(text) {
  let clean = String(text || "");
  const markers = [
    /(?:^|\n)═══\s*eve temperament\b/i,
    /(?:^|\n)<memory-context>/i,
    /(?:^|\n)<system-context>/i,
    /(?:^|\n)\[system note:/i,
  ];
  for (const marker of markers) {
    const match = marker.exec(clean);
    if (match) clean = clean.slice(0, match.index);
  }
  // ZALIVE_MEMORY turn block (ADR 0383) travels at the END of the latest user
  // turn — strip it so retention never persists it and recall never treats it
  // as query text.
  clean = clean.replace(/<!--\s*ZALIVE_MEMORY:[\s\S]*?-->\s*$/g, "");
  return clean.trim();
}

export function isTrivialMemoryText(text) {
  const clean = userTextWithoutInjectedContext(text)
    .toLocaleLowerCase("pt-BR")
    .replace(/[!?.,;:…]+$/u, "")
    .trim();

  return /^(?:oi+|ol[aá]+|oie+|hey|hello|hi|bom dia|boa tarde|boa noite|tudo bem|como vai|ok(?:ay)?|beleza|valeu|obrigad[oa]|rs+|ha(?:ha)+)$/u.test(clean);
}
