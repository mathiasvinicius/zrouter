import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_SOULS_DIR = "/opt/zion/minds";
const SOUL_MAX_CHARS = 20_000;

function soulsDir() {
  return path.resolve(process.env.ZROUTER_SOULS_DIR || DEFAULT_SOULS_DIR);
}

export async function listSouls() {
  let entries;
  try {
    entries = await fs.readdir(soulsDir(), { withFileTypes: true });
  } catch {
    return [];
  }
  const souls = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(entry.name))
    .map(async (entry) => {
      try {
        const content = (await fs.readFile(path.join(soulsDir(), entry.name, "prompts", "SOUL.md"), "utf8")).trim();
        if (!content || content.length > SOUL_MAX_CHARS) return null;
        return { id: entry.name, name: entry.name, content };
      } catch {
        return null;
      }
    }));
  return souls.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}
