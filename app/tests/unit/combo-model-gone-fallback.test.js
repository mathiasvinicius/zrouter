import { describe, expect, it, vi } from "vitest";
import { handleComboChat } from "../../open-sse/services/combo.js";

const log = { info: vi.fn(), warn: vi.fn() };

describe("combo fallback for retired models", () => {
  it("advances after HTTP 410 and returns the next healthy model", async () => {
    const handleSingleModel = vi.fn(async (_body, model) => {
      if (model === "provider/retired") {
        return new Response(JSON.stringify({ error: { message: "model reached end of life" } }), {
          status: 410,
          headers: { "Content-Type": "application/json" },
        });
      }
      return Response.json({ choices: [{ message: { content: "OK" } }] });
    });

    const result = await handleComboChat({
      body: { messages: [{ role: "user", content: "ping" }] },
      models: ["provider/retired", "provider/healthy"],
      handleSingleModel,
      log,
      autoSwitch: false,
    });

    expect(result.ok).toBe(true);
    expect(handleSingleModel).toHaveBeenCalledTimes(2);
    expect(handleSingleModel.mock.calls.map((call) => call[1])).toEqual([
      "provider/retired",
      "provider/healthy",
    ]);
  });
});
