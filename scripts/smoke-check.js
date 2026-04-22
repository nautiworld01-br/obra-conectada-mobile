const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const requiredFiles = [
  "App.tsx",
  "index.ts",
  "app.json",
  "babel.config.js",
  "src/providers/AppProviders.tsx",
  "src/navigation/RootNavigator.tsx",
  "src/lib/supabase.ts",
  ".github/workflows/deploy-pages.yml",
  ".env.example",
];

const requiredEnvKeys = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
];

const requiredScripts = [
  "export:web",
  "typecheck",
  "lint",
  "smoke",
  "quality",
];

const failures = [];

for (const relPath of requiredFiles) {
  if (!fs.existsSync(path.join(projectRoot, relPath))) {
    failures.push(`arquivo obrigatorio ausente: ${relPath}`);
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
for (const scriptName of requiredScripts) {
  if (!packageJson.scripts || !packageJson.scripts[scriptName]) {
    failures.push(`script ausente no package.json: ${scriptName}`);
  }
}

const envExample = fs.readFileSync(path.join(projectRoot, ".env.example"), "utf8");
for (const envKey of requiredEnvKeys) {
  if (!envExample.includes(`${envKey}=`)) {
    failures.push(`variavel nao documentada em .env.example: ${envKey}`);
  }
}

const deployWorkflow = fs.readFileSync(path.join(projectRoot, ".github/workflows/deploy-pages.yml"), "utf8");
for (const command of ["npm run quality", "npm run export:web"]) {
  if (!deployWorkflow.includes(command)) {
    failures.push(`deploy-pages.yml deve executar: ${command}`);
  }
}

if (failures.length) {
  console.error("Falha no smoke check:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Smoke check passou: estrutura critica, scripts e workflow de deploy estao coerentes.");
