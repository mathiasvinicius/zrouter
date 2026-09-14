import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearMemoryDedupCaches,
  isTrivialMemoryText,
  recallForProfile,
  retainForProfile,
} from "@/lib/identityMemory/hindsight.js";

const profile = {
  id: "eve",
  name: "EVE",
  memoryEnabled: true,
  hindsightBankId: "eve",
};

afterEach(() => {
  clearMemoryDedupCaches();
  vi.unstubAllGlobals();
});

describe("Hindsight trivial-message filtering", () => {
  it.each([
    "Oi?",
    "Olá!",
    "bom dia",
    "Tudo bem?",
    "ok",
    "valeu!",
  ])("recognizes %j as trivial", (text) => {
    expect(isTrivialMemoryText(text)).toBe(true);
  });

  it("ignores context injected after a greeting", () => {
    expect(isTrivialMemoryText("Oi?\n\n═══ EVE TEMPERAMENT\nstate: calm")).toBe(true);
  });

  it("does not classify meaningful messages as trivial", () => {
    expect(isTrivialMemoryText("Oi, procure as memórias da MILE")).toBe(false);
    expect(isTrivialMemoryText("Como vai funcionar o Hindsight?")).toBe(false);
  });

  it("skips recall and retain network calls for a greeting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const body = {
      messages: [{
        role: "user",
        content: "Oi?\n\n═══ EVE TEMPERAMENT\nstate: calm",
      }],
    };

    await expect(recallForProfile(profile, body)).resolves.toBe("");
    await expect(retainForProfile(profile, body, "conversation-test")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Hindsight agent-loop deduplication", () => {
  it("reuses recall for repeated internal calls with the same user message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "recalled once" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const body = { messages: [{ role: "user", content: "Continue a tarefa da GPU" }] };

    await expect(recallForProfile(profile, body)).resolves.toBe("recalled once");
    await expect(recallForProfile(profile, body)).resolves.toBe("recalled once");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains repeated internal calls only once", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const body = { messages: [{ role: "user", content: "Continue a tarefa da GPU" }] };

    await retainForProfile(profile, body, "conversation-1");
    await retainForProfile(profile, body, "conversation-2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("consolidates observations in the shared bank scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const body = { messages: [{ role: "user", content: "Prefiro respostas objetivas" }] };

    await retainForProfile(profile, body, "conversation-1");
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.items[0].tags).toEqual(["api-key:eve"]);
    expect(payload.items[0].observation_scopes).toBe("shared");
  });

  it("does not retain injected temperament as user memory", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const body = {
      messages: [{
        role: "user",
        content: "Continue a tarefa da GPU\n\n═══ EVE TEMPERAMENT\nstate: calm",
      }],
    };

    await retainForProfile(profile, body, "conversation-1");
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.items[0].content).toBe("Continue a tarefa da GPU");
  });
});
