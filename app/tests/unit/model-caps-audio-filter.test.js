import { describe, expect, it } from "vitest";
import { resolveCaps } from "@/shared/hooks/useModelCaps.js";

describe("capacity adapter audio model filter", () => {
  it("exposes audio input during the local fallback before the API catalog loads", () => {
    const caps = resolveCaps({}, {}, "ag/gemini-3.6-flash-low");

    expect(caps.vision).toBe(true);
    expect(caps.audioInput).toBe(true);
    expect(caps.videoInput).toBe(true);
    expect(caps.contextWindow).toBe(1048576);
  });

  it("keeps text-only models out of the audio pool", () => {
    const caps = resolveCaps({}, {}, "ollama/glm-5.2");

    expect(caps.audioInput).toBe(false);
  });

  it("preserves audio input when a catalog payload omits modality fields", () => {
    const caps = resolveCaps(
      { "ag/gemini-3.6-flash-low": { vision: true, reasoning: true } },
      {},
      "ag/gemini-3.6-flash-low",
    );

    expect(caps.vision).toBe(true);
    expect(caps.audioInput).toBe(true);
    expect(caps.videoInput).toBe(true);
  });
});
