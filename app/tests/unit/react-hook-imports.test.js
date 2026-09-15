// Guards against the exact crash that broke /dashboard/providers/[id]:
// a component calling a React hook it never imported (ReferenceError at runtime,
// which Next.js surfaces as "This page couldn't load").
//
// A missing hook import is invisible to the bundler (it is a bare identifier
// reference, not a missing module), so it only explodes in the browser.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HOOKS = [
  "useState",
  "useEffect",
  "useCallback",
  "useMemo",
  "useRef",
  "useReducer",
  "useContext",
  "useLayoutEffect",
  "useImperativeHandle",
  "useTransition",
  "useId",
  "useSyncExternalStore",
];

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(here, "../..");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, out);
    } else if (/\.(js|jsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function reactImports(src) {
  const names = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']react["']/g)) {
    for (const part of m[1].split(",")) names.add(part.trim().split(" as ")[0].trim());
  }
  for (const m of src.matchAll(/import\s+(\w+)\s*,\s*\{([^}]+)\}\s*from\s*["']react["']/g)) {
    names.add(m[1].trim());
    for (const part of m[2].split(",")) names.add(part.trim().split(" as ")[0].trim());
  }
  return names;
}

describe("react hook imports", () => {
  it("every used React hook is imported in the file that uses it", () => {
    const offenders = [];

    for (const file of walk(join(APP_ROOT, "src"))) {
      const src = readFileSync(file, "utf8");
      const imported = reactImports(src);
      if (imported.size === 0) continue;

      for (const hook of HOOKS) {
        const used = new RegExp(`\\b${hook}\\s*\\(`).test(src);
        if (!used || imported.has(hook)) continue;
        // ignore locally defined helpers that merely share the name
        if (new RegExp(`(function|const|let|var)\\s+${hook}\\b`).test(src)) continue;
        offenders.push(`${file.replace(APP_ROOT + "/", "")} uses ${hook}() without importing it`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
