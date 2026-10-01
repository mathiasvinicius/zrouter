// Guards against missing JSX component imports in dashboard pages and components.
// A missing component import behaves as an undefined identifier at runtime
// (ReferenceError), causing Next.js to display "This page couldn'\''t load".
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

const IGNORE_TAGS = new Set([
  "API_KEY_FROM_DASHBOARD",
  "Object",
  "Array",
  "Error",
  "RSA",
]);

describe("react component imports", () => {
  it("every used JSX component is imported or defined in the file that uses it", () => {
    const offenders = [];

    for (const file of walk(join(APP_ROOT, "src"))) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("<")) continue;

      const imported = new Set();
      // Named and default imports (including multiline)
      for (const m of src.matchAll(/import\s+(?:(\w+)|\{([^}]+)\}|(\w+)\s*,\s*\{([^}]+)\})\s+from/g)) {
        if (m[1]) imported.add(m[1].trim());
        if (m[2]) m[2].split(",").forEach(s => imported.add(s.trim().split(/\s+as\s+/).pop().trim()));
        if (m[3]) imported.add(m[3].trim());
        if (m[4]) m[4].split(",").forEach(s => imported.add(s.trim().split(/\s+as\s+/).pop().trim()));
      }

      // Dynamic imports: const Foo = dynamic(...)
      for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:dynamic|lazy)/g)) {
        imported.add(m[1]);
      }

      // Local declarations: function Foo, const Foo = ..., class Foo
      for (const m of src.matchAll(/(?:function|class|const|let|var)\s+([A-Z]\w*)/g)) {
        imported.add(m[1]);
      }

      // Find JSX tag usages: <ComponentName
      const tagMatches = src.matchAll(/<([A-Z][a-zA-Z0-9_]*)/g);
      for (const m of tagMatches) {
        const tag = m[1];
        if (IGNORE_TAGS.has(tag)) continue;
        if (!imported.has(tag)) {
          offenders.push(`${file.replace(APP_ROOT + "/", "")} uses <${tag}> without importing or defining it`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
