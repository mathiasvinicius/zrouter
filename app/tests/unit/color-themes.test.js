// Entrega 2 D — ported color themes: blue → #3b82f6 on --color-primary,
// custom hex valid/invalid, hover shading, both mode coverage (inline style).
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-theme-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  vi.resetModules();
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { COLOR_THEMES, normalizeHexColor, shadeHexColor, resolveColorPair } = await import("./../../src/lib/colorThemes.js");

// Minimal jsdom-free document stub for the store's applyColorTheme/applyTheme.
function stubDocument() {
  const style = { setProperty: vi.fn(), removeProperty: vi.fn(), getPropertyValue: vi.fn() };
  const root = { classList: { add: vi.fn(), remove: vi.fn() }, style };
  const doc = {
    documentElement: root,
    matchMedia: (q) => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  global.document = doc;
  global.window = { matchMedia: doc.matchMedia, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  return { root, style };
}

describe("COLOR_THEMES registry (8 cores: 7 OmniRoute + itms)", () => {
  it("exposes the 7 OmniRoute presets + itms", () => {
    expect(Object.keys(COLOR_THEMES).sort()).toEqual(["blue", "coral", "cyan", "green", "itms", "orange", "red", "violet"]);
    expect(COLOR_THEMES.blue).toBe("#3b82f6");
    expect(COLOR_THEMES.coral).toBe("#e54d5e");
    expect(COLOR_THEMES.itms).toBe("#033f7b");
  });
});

describe("resolveColorPair / applyColorTheme", () => {
  it("blue → --color-primary = #3b82f6 and a darker hover", () => {
    const pair = resolveColorPair("blue");
    expect(pair.primary).toBe("#3b82f6");
    expect(pair.hover).toMatch(/^#[0-9a-f]{6}$/);
    expect(pair.hover).not.toBe(pair.primary);
  });

  it("custom hex is accepted (case/space normalized) and invalid falls back to default", () => {
    expect(normalizeHexColor(" #AABBCC ")).toBe("#aabbcc");
    expect(normalizeHexColor("aabbcc")).toBe("#aabbcc");
    expect(normalizeHexColor("not-a-color")).toBe("#3b82f6");
    expect(normalizeHexColor("#12345")).toBe("#3b82f6");
    const pair = resolveColorPair("custom", "#AABBCC");
    expect(pair.primary).toBe("#aabbcc");
  });

  it("themeStore applies the pair to :root for BOTH modes (inline vars)", async () => {
    const { root, style } = stubDocument();
    const store = (await import("./../../src/store/themeStore.js")).default;
    await store.getState().setColorTheme("blue");
    expect(style.setProperty).toHaveBeenCalledWith("--color-primary", "#3b82f6");
    expect(style.setProperty).toHaveBeenCalledWith("--color-primary-hover", resolveColorPair("blue").hover);

    await store.getState().setCustomColorTheme("#ABCDEF");
    expect(store.getState().colorTheme).toBe("custom");
    expect(store.getState().customColor).toBe("#abcdef");
    const hoverCalls = style.setProperty.mock.calls.filter((c) => c[0] === "--color-primary-hover");
    expect(hoverCalls[hoverCalls.length - 1][1]).toBe(resolveColorPair("custom", "#abcdef").hover);

    store.getState().initTheme(); // no class flip asserted: theme "system" default here
    const primaryCalls = style.setProperty.mock.calls.filter((c) => c[0] === "--color-primary");
    expect(primaryCalls[primaryCalls.length - 1]).toEqual(["--color-primary", "#abcdef"]);
  });

  it("invalid custom hex through the store normalizes to the default", async () => {
    stubDocument();
    const store = (await import("./../../src/store/themeStore.js")).default;
    await store.getState().setCustomColorTheme("zzz");
    expect(store.getState().customColor).toBe("#3b82f6");
  });
});

describe("shadeHexColor", () => {
  it("darkens toward black with -0.14", () => {
    const shaded = shadeHexColor("#ffffff", -0.14);
    expect(shaded).toBe("#dbdbdb");
  });
});
