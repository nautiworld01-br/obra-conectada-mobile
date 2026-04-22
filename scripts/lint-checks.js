const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const appCodeRoots = [
  path.join(projectRoot, "src"),
  path.join(projectRoot, "App.tsx"),
  path.join(projectRoot, "index.ts"),
];
const ignoredDirs = new Set([
  ".git",
  ".expo",
  ".github",
  "dist",
  "node_modules",
  "web",
  "web-build",
  ".playwright-mcp",
  "supabase/.temp",
]);

const violations = [];

for (const target of appCodeRoots) {
  if (!fs.existsSync(target)) continue;
  walk(target, (filePath) => {
    if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) return;
    const content = fs.readFileSync(filePath, "utf8");

    if (/console\.log\s*\(/.test(content)) {
      violations.push(`${relative(filePath)}: evitar console.log em codigo da aplicacao`);
    }

    if (/\bdebugger\b/.test(content)) {
      violations.push(`${relative(filePath)}: remover debugger`);
    }
  });
}

walk(projectRoot, (filePath) => {
  if (!filePath.endsWith(".sql")) return;
  const normalized = toPosix(relative(filePath));
  if (!normalized.startsWith("supabase/migrations/")) {
    violations.push(`${normalized}: migrations SQL devem viver somente em supabase/migrations`);
  }
});

if (violations.length) {
  console.error("Falha nas verificacoes de lint:\n");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Lint local passou: sem console.log/debugger no app e sem SQL fora de supabase/migrations.");

function walk(targetPath, onFile) {
  const stats = fs.statSync(targetPath);
  if (stats.isFile()) {
    onFile(targetPath);
    return;
  }

  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const absolutePath = path.join(targetPath, entry.name);
    const relPath = toPosix(relative(absolutePath));

    if (entry.isDirectory()) {
      if (ignoredDirs.has(relPath) || ignoredDirs.has(entry.name)) {
        continue;
      }
      walk(absolutePath, onFile);
      continue;
    }

    onFile(absolutePath);
  }
}

function relative(targetPath) {
  return path.relative(projectRoot, targetPath);
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}
