// Entrega 3 — ZROUTER_CAPABILITIES: registry-derived, per-key sources, hard 1200-char cap.
import { describe, expect, it } from "vitest";

const { buildCapabilitiesBlock, CAPABILITIES_MARKER, MAX_CAPABILITIES_CHARS } =
  await import("@/shared/constants/capabilities.js");
const { SKILLS } = await import("@/shared/constants/skills.js");

const lines = (block) => block.split("\n");

describe("ZROUTER_CAPABILITIES block", () => {
  it("is emitted with its marker and stays under the hard cap", () => {
    const block = buildCapabilitiesBlock(SKILLS, ["open-notebook", "neo4j"]);
    expect(block.startsWith(CAPABILITIES_MARKER)).toBe(true);
    expect(block.length).toBeLessThanOrEqual(MAX_CAPABILITIES_CHARS);
    expect(block).toContain("- chat: POST /v1/chat/completions");
    expect(block).toContain("Discover available models with GET /v1/models");
  });

  it("derives its lines from the registry: changing the registry changes the output", () => {
    const before = buildCapabilitiesBlock(SKILLS, []);
    expect(before).toContain("- embeddings: POST /v1/embeddings");
    const inflated = [...SKILLS, { id: "zrouter-teleport", name: "Teleport", endpoint: "/v1/teleport" }];
    expect(buildCapabilitiesBlock(inflated, [])).toContain("- teleport: POST /v1/teleport");
    // A registry without the embeddings skill no longer advertises embeddings.
    const trimmed = SKILLS.filter((skill) => skill.id !== "zrouter-embeddings");
    expect(buildCapabilitiesBlock(trimmed, [])).not.toContain("/v1/embeddings");
  });

  it("always advertises the entry-point surface (chat + model discovery)", () => {
    const block = buildCapabilitiesBlock(SKILLS, []);
    expect(block).toContain("- chat: POST /v1/chat/completions");
    expect(block).toContain("- models: GET /v1/models");
  });

  it("sources:/knowledge: lines reflect exactly the key's enabled origins", () => {
    const only = buildCapabilitiesBlock(SKILLS, ["open-notebook"]);
    expect(lines(only).find((line) => line.startsWith("- sources:"))).toBe("- sources: open-notebook");
    expect(only).toContain("- knowledge: Open Notebook (biblioteca documental)");
    const both = buildCapabilitiesBlock(SKILLS, ["open-notebook", "neo4j"]);
    expect(lines(both).find((line) => line.startsWith("- sources:"))).toBe("- sources: open-notebook, neo4j");
  });

  it("omits the sources: line entirely when the key has no source enabled", () => {
    const block = buildCapabilitiesBlock(SKILLS, []);
    expect(block).not.toContain("- sources:");
    expect(block).not.toContain("- knowledge:");
  });

  it("never exceeds the cap with an inflated registry, and keeps chat/models/sources", () => {
    const inflated = [...SKILLS];
    for (let i = 0; i < 200; i += 1) {
      inflated.push({ id: `zrouter-padded-${i}`, endpoint: `/v1/padded/${i}`, description: "z".repeat(200) });
    }
    const block = buildCapabilitiesBlock(inflated, ["open-notebook"]);
    expect(block.length).toBeLessThanOrEqual(MAX_CAPABILITIES_CHARS);
    expect(block).toContain("- chat: POST /v1/chat/completions");
    expect(block).toContain("- models: GET /v1/models");
    expect(block).toContain("- sources: open-notebook");
    expect(block).toContain("ZROUTER_CAPABILITIES");
  });

  it("is injected once, after the sources block, by promptFor", async () => {
    const { promptFor } = await import("open-sse/rtk/identity.js");
    const capabilities = buildCapabilitiesBlock(SKILLS, ["open-notebook"]);
    const prompt = promptFor({
      id: "key-1",
      bankId: "eve",
      capabilities,
      sources: [{ sourceId: "open-notebook:source:1", origin: "open-notebook", title: "T", excerpt: "excerpt" }],
    });
    expect(prompt.match(/ZROUTER_CAPABILITIES/g)).toHaveLength(1);
    expect(prompt.indexOf("ZROUTER_SOURCES")).toBeLessThan(prompt.indexOf("ZROUTER_CAPABILITIES"));
    expect(prompt.indexOf("ZROUTER_MEMORY")).toBeLessThan(prompt.indexOf("ZROUTER_SOURCES"));
  });

  it("respects a lower explicit cap by dropping the least-priority skills", () => {
    const block = buildCapabilitiesBlock(SKILLS, ["open-notebook"], 400);
    expect(block.length).toBeLessThanOrEqual(400);
    expect(block).toContain("- chat: POST /v1/chat/completions");
    expect(block).toContain("- sources: open-notebook");
  });
});
