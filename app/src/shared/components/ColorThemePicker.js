"use client";

import { useState } from "react";
import useThemeStore, { COLOR_THEMES } from "@/store/themeStore";
import { normalizeHexColor } from "@/lib/colorThemes";
import { cn } from "@/shared/utils/cn";

// 7 preset swatches + custom color picker, ported from OmniRoute AppearanceTab.
export default function ColorThemePicker({ className }) {
  const { colorTheme, customColor, setColorTheme, setCustomColorTheme } = useThemeStore();
  const [draft, setDraft] = useState(customColor || "#3b82f6");

  const handleCustomText = (value) => {
    setDraft(value);
    const valid = /^#?([0-9a-fA-F]{6})$/.test(value.trim());
    if (valid) setCustomColorTheme(value.trim());
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(COLOR_THEMES).map(([id, color]) => (
          <button
            key={id}
            onClick={() => setColorTheme(id)}
            aria-label={`Theme ${id}`}
            title={id}
            className={cn(
              "size-6 rounded-full border transition-transform",
              colorTheme === id
                ? "border-text-main scale-110 ring-2 ring-primary/40"
                : "border-black/10 dark:border-white/20 hover:scale-105"
            )}
            style={{ backgroundColor: color }}
          />
        ))}
        <label
          className={cn(
            "relative size-6 rounded-full border overflow-hidden cursor-pointer",
            colorTheme === "custom"
              ? "border-text-main scale-110 ring-2 ring-primary/40"
              : "border-black/10 dark:border-white/20 hover:scale-105"
          )}
          style={{
            background: "conic-gradient(#ef4444, #f97316, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ef4444)",
          }}
          title="Custom"
        >
          <input
            type="color"
            value={normalizeHexColor(draft)}
            onChange={(e) => { setDraft(e.target.value); setCustomColorTheme(e.target.value); }}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label="Custom color"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={normalizeHexColor(draft)}
          onChange={(e) => { setDraft(e.target.value); setCustomColorTheme(e.target.value); }}
          className="h-8 w-10 cursor-pointer rounded border border-border bg-surface"
          aria-label="Custom color"
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => handleCustomText(e.target.value)}
          placeholder="#3b82f6"
          maxLength={7}
          className="h-8 flex-1 rounded-lg border border-border bg-surface px-2 text-xs text-text-main focus:border-primary focus:outline-none"
        />
      </div>
    </div>
  );
}
