"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/shared/hooks/useTheme";
import useThemeStore from "@/store/themeStore";
import ColorThemePicker from "./ColorThemePicker";
import { cn } from "@/shared/utils/cn";

// Dark/light toggle (unchanged behavior) + color-theme button with a popover
// holding the 7 OmniRoute swatches + custom picker. Variants match the
// previous look so Header/AuthLayout keep their layout.
export default function ThemeToggle({ className, variant = "default" }) {
  const { isDark, toggleTheme } = useTheme();
  const colorTheme = useThemeStore((s) => s.colorTheme);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!paletteOpen) return;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setPaletteOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setPaletteOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [paletteOpen]);

  const toggleVariants = {
    default: cn(
      "flex items-center justify-center size-10 rounded-full",
      "text-text-muted hover:text-text-main",
      "hover:bg-surface-2 transition-colors"
    ),
    card: cn(
      "flex items-center justify-center size-11 rounded-full",
      "bg-surface/60 hover:bg-surface",
      "border border-border",
      "backdrop-blur-md shadow-sm hover:shadow-[var(--shadow-warm)]",
      "text-text-muted hover:text-brand-500",
      "transition-all group"
    ),
  };

  const paletteVariants = {
    default: "size-10 hover:bg-surface-2 rounded-full",
    card: "size-11 rounded-full bg-surface/60 border border-border backdrop-blur-md shadow-sm",
  };

  return (
    <div ref={rootRef} className={cn("relative inline-flex items-center gap-1", className)}>
      <button
        onClick={() => setPaletteOpen((open) => !open)}
        className={cn(paletteVariants[variant], "flex items-center justify-center text-text-muted hover:text-text-main transition-colors")}
        aria-label="Color theme"
        aria-expanded={paletteOpen}
        title="Color theme"
      >
        <span
          className="size-4 rounded-full border border-black/10 dark:border-white/20"
          style={{ backgroundColor: "var(--color-primary)" }}
        />
      </button>
      {paletteOpen && (
        <div className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-border bg-surface p-3 shadow-lg">
          <ColorThemePicker />
        </div>
      )}
      <button
        onClick={toggleTheme}
        className={cn(toggleVariants[variant])}
        aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        title={`Switch to ${isDark ? "light" : "dark"} mode`}
      >
        <span
          className={cn(
            "material-symbols-outlined text-[22px]",
            variant === "card" && "transition-transform duration-300 group-hover:rotate-12"
          )}
        >
          {isDark ? "light_mode" : "dark_mode"}
        </span>
      </button>
    </div>
  );
}
