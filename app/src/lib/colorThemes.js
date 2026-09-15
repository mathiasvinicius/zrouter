// Ported from OmniRoute src/store/themeStore.ts (COLOR_THEMES + shade/normalize).
// Pure functions — the zustand store (src/store/themeStore.js) applies them to :root.
export const COLOR_THEMES = {
  itms: "#033f7b",   // ITMS brand - royal blue do logo
  coral: "#e54d5e",
  blue: "#3b82f6",
  red: "#ef4444",
  green: "#22c55e",
  violet: "#8b5cf6",
  orange: "#f97316",
  cyan: "#06b6d4",
};

export const DEFAULT_CUSTOM_COLOR = "#3b82f6";

export function normalizeHexColor(color) {
  const value = (color || "").trim();
  const hex = value.startsWith("#") ? value : `#${value}`;
  return /^#([0-9a-fA-F]{6})$/.test(hex) ? hex.toLowerCase() : DEFAULT_CUSTOM_COLOR;
}

export function shadeHexColor(hex, percent) {
  const normalized = normalizeHexColor(hex).slice(1);
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  const shade = (channel) => {
    const target = percent < 0 ? 0 : 255;
    const amount = Math.round((target - channel) * Math.abs(percent));
    const next = channel + amount;
    return Math.max(0, Math.min(255, next));
  };

  const toHex = (channel) => channel.toString(16).padStart(2, "0");
  return `#${toHex(shade(r))}${toHex(shade(g))}${toHex(shade(b))}`;
}

// Resolve the effective primary/hover pair for a theme name + custom hex.
export function resolveColorPair(colorTheme, customColor) {
  const base =
    colorTheme === "custom"
      ? normalizeHexColor(customColor)
      : COLOR_THEMES[colorTheme] || COLOR_THEMES.itms;
  return { primary: base, hover: shadeHexColor(base, -0.14) };
}
