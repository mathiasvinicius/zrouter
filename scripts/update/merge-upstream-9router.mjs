#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const appDir = path.join(repoRoot, "app");

const baseTag = process.argv[2] || "v0.5.95";
const targetTag = process.argv[3] || "v0.5.99";

console.log(`[Merge] Merging 9Router upstream: ${baseTag} -> ${targetTag} into app/`);

const diffOutput = execFileSync("git", ["diff", "--name-status", baseTag, targetTag], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();

const lines = diffOutput.split("\n").filter(Boolean);

let copiedNew = 0;
let cleanOverwrites = 0;
let cleanMerges = 0;
let conflicts = [];
let deleted = 0;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9r-merge-"));

try {
  for (const line of lines) {
    const [status, ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t");
    const targetFile = path.join(appDir, filePath);

    if (status === "A") {
      // New upstream file
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      const content = execFileSync("git", ["show", `${targetTag}:${filePath}`]);
      fs.writeFileSync(targetFile, content);
      copiedNew++;
    } else if (status === "D") {
      // Deleted upstream file
      if (fs.existsSync(targetFile)) {
        const currentContent = fs.readFileSync(targetFile);
        const baseContent = execFileSync("git", ["show", `${baseTag}:${filePath}`]);
        if (currentContent.equals(baseContent)) {
          fs.unlinkSync(targetFile);
          deleted++;
        } else {
          console.warn(`[Preserved] ${filePath} was deleted upstream but customized in ZRouter`);
        }
      }
    } else if (status === "M") {
      if (!fs.existsSync(targetFile)) {
        fs.mkdirSync(path.dirname(targetFile), { recursive: true });
        const content = execFileSync("git", ["show", `${targetTag}:${filePath}`]);
        fs.writeFileSync(targetFile, content);
        copiedNew++;
        continue;
      }

      const currentContent = fs.readFileSync(targetFile);
      const baseContent = execFileSync("git", ["show", `${baseTag}:${filePath}`]);

      if (currentContent.equals(baseContent)) {
        // Not customized in ZRouter: clean overwrite from target
        const upstreamContent = execFileSync("git", ["show", `${targetTag}:${filePath}`]);
        fs.writeFileSync(targetFile, upstreamContent);
        cleanOverwrites++;
      } else {
        // Customized in ZRouter: perform 3-way merge
        const tempBase = path.join(tempDir, "base_" + path.basename(filePath));
        const tempUpstream = path.join(tempDir, "upstream_" + path.basename(filePath));

        fs.writeFileSync(tempBase, baseContent);
        const upstreamContent = execFileSync("git", ["show", `${targetTag}:${filePath}`]);
        fs.writeFileSync(tempUpstream, upstreamContent);

        const mergeResult = spawnSync(
          "git",
          [
            "merge-file",
            "-L", "ZRouter (ours)",
            "-L", `base (${baseTag})`,
            "-L", `upstream (${targetTag})`,
            targetFile,
            tempBase,
            tempUpstream,
          ],
          { cwd: repoRoot }
        );

        fs.unlinkSync(tempBase);
        fs.unlinkSync(tempUpstream);

        if (mergeResult.status === 0) {
          cleanMerges++;
        } else {
          conflicts.push(filePath);
        }
      }
    }
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("\n--- Resumo do Merge ---");
console.log(`Novos arquivos adicionados do upstream: ${copiedNew}`);
console.log(`Arquivos base atualizados sem customizações: ${cleanOverwrites}`);
console.log(`Arquivos customizados com merge limpo: ${cleanMerges}`);
console.log(`Arquivos deletados upstream: ${deleted}`);
console.log(`Conflitos para resolução manual: ${conflicts.length}`);

if (conflicts.length > 0) {
  console.log("\nArquivos com conflitos marcados (<<<<<<< / ======= / >>>>>>>):");
  for (const c of conflicts) {
    console.log(` - app/${c}`);
  }
}
