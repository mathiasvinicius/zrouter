import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleSttCore } from "../../open-sse/handlers/sttCore.js";

// cfg shape mirrors registry/antigravity.js sttConfig
const CFG = { baseUrl: "http://127.0.0.1:20130/v1/chat/completions", authType: "none", format: "agy-stt" };

const fakeResponse = (payload, status = 200) => ({
  ok: status < 400,
  status,
  text: async () => (status < 400 ? JSON.stringify(payload) : JSON.stringify(payload)),
  json: async () => payload,
});

function formDataFor(file, extras = {}) {
  return { get: (k) => (k === "file" ? file : extras[k] ?? null) };
}

describe("STT via agy-bridge (antigravity)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts input_audio part and returns trimmed transcript", async () => {
    const fetchMock = vi.fn(async () => fakeResponse({ choices: [{ message: { content: "  Olá, teste.  " } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([1, 2, 3])], "test.mp3", { type: "audio/mpeg" });
    const res = await handleSttCore({
      provider: "antigravity",
      model: "audio-transcribe",
      formData: formDataFor(file, { language: "pt" }),
      credentials: {},
      sttConfig: CFG,
    });
    expect(res.success).toBe(true);
    const payload = JSON.parse(await res.response.text());
    expect(payload.text).toBe("Olá, teste.");
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.model).toBe("gemini-4-argon-low");
    expect(body.messages[0].content[0].text).toContain("Language: pt");
    expect(body.messages[0].content[1].type).toBe("input_audio");
    expect(Object.keys(init.headers ?? {})).not.toContain("Authorization");
  });

  it("keeps explicit caller prompt verbatim and strips alias prefix from model", async () => {
    const fetchMock = vi.fn(async () => fakeResponse({ choices: [{ message: { content: "x" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([9])], "clip.ogg", { type: "audio/ogg" });
    await handleSttCore({
      provider: "antigravity",
      model: "ag/audio-transcribe",
      formData: formDataFor(file, { prompt: "Transcreva exatamente" }),
      credentials: {},
      sttConfig: CFG,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("gemini-4-argon-low");
    expect(body.messages[0].content[0].text).toBe("Transcreva exatamente");
    expect(body.messages[0].content[1].input_audio.format).toBe("ogg");
  });

  it("surfaces bridge error status (500 → upstream error result)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeResponse({ error: "agy failed" }, 500)));
    const file = new File([new Uint8Array([1])], "test.mp3", { type: "audio/mpeg" });
    const res = await handleSttCore({
      provider: "antigravity",
      model: "audio-transcribe",
      formData: formDataFor(file),
      credentials: {},
      sttConfig: CFG,
    });
    expect(res.status).toBe(500);
  });

  it("rejects without sttConfig", async () => {
    const file = new File([new Uint8Array([1])], "test.mp3", { type: "audio/mpeg" });
    const res = await handleSttCore({
      provider: "antigravity",
      model: "audio-transcribe",
      formData: formDataFor(file),
      credentials: {},
    });
    expect(res.status).toBe(400);
  });
});
