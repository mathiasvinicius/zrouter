// Endpoint status — Notion not-configured, Open Notebook ok (real server at 5055),
// Neo4j ok (real server at 7474). Integration check for /api/sources/status logic.
import { describe, expect, it } from "vitest";

const { getSourcesStatus } = await import("open-sse/sources/status.js");

const hasOpenNotebookPassword = Boolean(process.env.OPEN_NOTEBOOK_PASSWORD);

describe("sources status", () => {
  it("reports Notion as not-configured when NOTION_TOKEN is absent", async () => {
    delete process.env.NOTION_TOKEN;
    const status = await getSourcesStatus();
    expect(status.notion).toMatchObject({ configured: false, ok: false, status: "not-configured" });
  });

  (hasOpenNotebookPassword ? it : it.skip)("reports Open Notebook as ok against the real server", async () => {
    const status = await getSourcesStatus();
    expect(status["open-notebook"]).toMatchObject({ configured: true, ok: true, status: "ok" });
    expect(status["open-notebook"].latencyMs).toBeGreaterThanOrEqual(0);
  }, 15_000);

  it("reports Neo4j as ok against the real server (NEO4J_AUTH from the Compose env)", async () => {
    const status = await getSourcesStatus();
    expect(status.neo4j).toMatchObject({ configured: true, ok: true, status: "ok" });
  }, 15_000);

  it("never leaks credentials in the status payload", async () => {
    const status = await getSourcesStatus();
    const serialized = JSON.stringify(status);
    for (const secret of [process.env.OPEN_NOTEBOOK_PASSWORD, process.env.NEO4J_PASSWORD, process.env.NEO4J_AUTH, process.env.NOTION_TOKEN]) {
      if (secret) expect(serialized).not.toContain(secret);
    }
  });
});
