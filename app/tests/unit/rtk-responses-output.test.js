import { describe, expect, it } from "vitest";
import { compressMessages } from "../../open-sse/rtk/index.js";

const largeDiff = [
  "diff --git a/example.js b/example.js",
  "--- a/example.js",
  "+++ b/example.js",
  "@@ -1,1 +1,180 @@",
  ...Array.from({ length: 180 }, (_, i) => `+added line ${i} with repeated build output`),
].join("\n");

describe("RTK Responses tool-output adapter", () => {
  for (const type of ["function_call_output", "local_shell_call_output", "apply_patch_call_output"]) {
    it(`compresses ${type}`, () => {
      const body = { input: [{ type, output: largeDiff }] };
      const stats = compressMessages(body, true);
      expect(stats.hits.length).toBeGreaterThan(0);
      expect(body.input[0].output.length).toBeLessThan(largeDiff.length);
    });
  }

  it("compresses custom_tool_call_output and preserves its JSON metadata", () => {
    const body = {
      input: [{
        type: "custom_tool_call_output",
        output: JSON.stringify({ output: largeDiff, source: "codex", ok: true }),
      }],
    };
    const stats = compressMessages(body, true);
    const restored = JSON.parse(body.input[0].output);
    expect(stats.hits.length).toBeGreaterThan(0);
    expect(restored.output.length).toBeLessThan(largeDiff.length);
    expect(restored).toMatchObject({ source: "codex", ok: true });
  });

  it("supports the content fallback and Responses text arrays", () => {
    const body = {
      input: [{ type: "function_call_output", content: [{ type: "input_text", text: largeDiff }] }],
    };
    const stats = compressMessages(body, true);
    expect(stats.hits.length).toBeGreaterThan(0);
    expect(body.input[0].content[0].text.length).toBeLessThan(largeDiff.length);
  });
});
