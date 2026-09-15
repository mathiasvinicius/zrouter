// Guards the deduped OAuth client wiring. Credentials themselves are NOT in the
// repository anymore — they come from the environment, so these tests only assert
// the shape/wiring and that no literal secret is hardcoded anywhere.
import { describe, it, expect } from "vitest";

describe("oauth client wiring (env-based, no hardcoded secrets)", () => {
  it("shared source exposes the client objects with env-backed values", async () => {
    const { ANTIGRAVITY_OAUTH_CLIENT, GOOGLE_OAUTH_CLIENT } = await import(
      "../../open-sse/providers/shared.js"
    );
    expect(Object.keys(ANTIGRAVITY_OAUTH_CLIENT).sort()).toEqual(["clientId", "clientSecret"]);
    expect(Object.keys(GOOGLE_OAUTH_CLIENT).sort()).toEqual(["clientId", "clientSecret"]);
  });

  it("registry transports no longer carry credentials", async () => {
    const ag = (await import("../../open-sse/providers/registry/antigravity.js")).default;
    const gemini = (await import("../../open-sse/providers/registry/gemini.js")).default;
    const gc = (await import("../../open-sse/providers/registry/gemini-cli.js")).default;
    for (const p of [ag, gemini, gc]) {
      expect(p.transport.clientId).toBeUndefined();
      expect(p.transport.clientSecret).toBeUndefined();
    }
  });

  // Guard: no Google OAuth literal may live in the source tree.
  it("source tree contains no hardcoded Google OAuth credentials", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const roots = [join(here, "../../src"), join(here, "../../open-sse")];

    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "node_modules" || entry === ".next") continue;
          walk(full);
        } else if (/\.(js|mjs|cjs|jsx|ts|tsx)$/.test(entry)) {
          const txt = readFileSync(full, "utf8");
          if (/GOCSPX-|681255809395-|1071006060591-/.test(txt)) offenders.push(full);
        }
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });

  it("src oauth.js composes clients from shared.js + registry", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../../src/lib/oauth/constants/oauth.js"), "utf8");
    expect(src).toContain(
      'import { ANTIGRAVITY_OAUTH_CLIENT, GOOGLE_OAUTH_CLIENT } from "open-sse/providers/shared.js"'
    );
    expect(src).toContain("...ANTIGRAVITY_OAUTH_CLIENT");
    expect(src).toContain("...GOOGLE_OAUTH_CLIENT");
    expect(src).toContain('PROVIDER_OAUTH["antigravity"]');
    expect(src).toContain('PROVIDER_OAUTH["gemini-cli"]');
    expect(src).not.toMatch(/GOCSPX-/);
  });
});
