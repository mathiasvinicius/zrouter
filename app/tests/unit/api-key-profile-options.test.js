import { describe, expect, it } from "vitest";
import { resolveMemoryProfile } from "../../src/lib/identityMemory/profileConfig.js";

describe("API-key optional identity and memory options", () => {
  it("allows a profile with Hindsight disabled and no bank", () => {
    expect(resolveMemoryProfile({
      enabled: false,
      bankId: "",
      mentalModelId: null,
      name: "EVOS",
    })).toEqual({
      memoryEnabled: false,
      hindsightBankId: null,
      memoryBackend: null,
      mentalModelId: null,
    });
  });

  it("requires a valid bank only when Hindsight is enabled", () => {
    expect(() => resolveMemoryProfile({ enabled: true, bankId: "", name: "test" }))
      .toThrow(/bank ID is required/i);
    expect(() => resolveMemoryProfile({ enabled: true, bankId: "invalid bank", name: "test" }))
      .toThrow(/bank ID is required/i);
  });

  it("creates a mental-model ID when enabling memory for a profile without one", () => {
    const result = resolveMemoryProfile({
      enabled: true,
      bankId: "evos-memory",
      mentalModelId: null,
      name: "EVOS Profile",
    });
    expect(result.memoryEnabled).toBe(true);
    expect(result.hindsightBankId).toBe("evos-memory");
    expect(result.mentalModelId).toMatch(/^evos-profile-[a-f0-9]{8}$/);
  });

  it("preserves an existing mental-model ID while memory remains enabled", () => {
    expect(resolveMemoryProfile({
      enabled: true,
      bankId: "eve",
      mentalModelId: "soberano",
      name: "EVE",
    }).mentalModelId).toBe("soberano");
  });

  it("normalizes a per-profile backend and keeps empty as global inheritance", () => {
    expect(resolveMemoryProfile({
      enabled: true,
      bankId: "eve",
      memoryBackend: "NEO4J",
      name: "EVE",
    }).memoryBackend).toBe("neo4j");

    expect(resolveMemoryProfile({
      enabled: true,
      bankId: "eve",
      memoryBackend: "",
      name: "EVE",
    }).memoryBackend).toBeNull();
  });

  it("rejects an unsupported per-profile backend", () => {
    expect(() => resolveMemoryProfile({
      enabled: true,
      bankId: "eve",
      memoryBackend: "redis",
      name: "EVE",
    })).toThrow(/memory backend/i);
  });
});
