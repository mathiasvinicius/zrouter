import { describe, expect, it } from "vitest";

import { bodyHasZaliveMemory } from "../../open-sse/rtk/identity.js";
import { userTextWithoutInjectedContext } from "../../src/lib/identityMemory/common.js";

describe("bodyHasZaliveMemory (ADR 0383, mudança B)", () => {
  it("detects marker in latest user turn (openai messages)", () => {
    const body = {
      model: "any",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Olá <!-- ZALIVE_MEMORY:Eve ids=123,456 -->\nme ajuda?" },
      ],
    };
    expect(bodyHasZaliveMemory(body)).toBe(true);
  });

  it("detects marker in replayed agent history too", () => {
    const body = {
      model: "any",
      messages: [
        { role: "assistant", content: "ok <!-- ZALIVE_MEMORY -->" },
        { role: "user", content: "seguinte pergunta" },
      ],
    };
    expect(bodyHasZaliveMemory(body)).toBe(true);
  });

  it("detects marker in responses input format", () => {
    const body = { input: [{ role: "user", content: [{ type: "text", text: "q? <!-- ZALIVE_MEMORY:Bank -->" }] }] };
    expect(bodyHasZaliveMemory(body)).toBe(true);
  });

  it("false without marker", () => {
    expect(bodyHasZaliveMemory({ messages: [{ role: "user", content: "oi" }] })).toBe(false);
    expect(bodyHasZaliveMemory({})).toBe(false);
    expect(bodyHasZaliveMemory(null)).toBe(false);
    expect(bodyHasZaliveMemory("not an object")).toBe(false);
  });

  it("does not match ZROUTER markers or plain comments", () => {
    expect(bodyHasZaliveMemory({ messages: [{ role: "system", content: "<!-- ZROUTER_IDENTITY:v1 -->" }] })).toBe(false);
    expect(bodyHasZaliveMemory({ messages: [{ role: "user", content: "html <!-- comment -->" }] })).toBe(false);
  });
});

describe("userTextWithoutInjectedContext strips ZALIVE block", () => {
  it("removes trailing marker before retention/recall", () => {
    const text = "me ajude com o relatório\n<!-- ZALIVE_MEMORY:Eve ids=1,2 -->";
    expect(userTextWithoutInjectedContext(text)).toBe("me ajude com o relatório");
  });

  it("keeps user text intact when no marker", () => {
    expect(userTextWithoutInjectedContext("oi tudo bem?")).toBe("oi tudo bem?");
  });
});
