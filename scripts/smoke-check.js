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
const migrationDir = path.join(projectRoot, "supabase", "migrations");

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

if (!fs.existsSync(migrationDir)) {
  failures.push("diretorio de migrations ausente: supabase/migrations");
} else {
  const migrationsSql = fs
    .readdirSync(migrationDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => fs.readFileSync(path.join(migrationDir, fileName), "utf8"))
    .join("\n")
    .toLowerCase();

  const requiredSchemaContracts = [
    {
      label: "tabela rooms versionada",
      pattern: /create\s+table\s+(if\s+not\s+exists\s+)?public\.rooms/,
    },
    {
      label: "daily_logs possui room_id",
      pattern: /alter\s+table\s+public\.daily_logs[\s\S]*add\s+column\s+if\s+not\s+exists\s+room_id/,
    },
    {
      label: "schedule_stages possui room_id",
      pattern: /alter\s+table\s+public\.schedule_stages[\s\S]*add\s+column\s+if\s+not\s+exists\s+room_id/,
    },
    {
      label: "weekly_updates possui room_id",
      pattern: /alter\s+table\s+public\.weekly_updates[\s\S]*add\s+column\s+if\s+not\s+exists\s+room_id/,
    },
    {
      label: "RPC upsert_daily_log_with_employees versionada",
      pattern: /create\s+or\s+replace\s+function\s+public\.upsert_daily_log_with_employees/,
    },
    {
      label: "RPC upsert_daily_log_with_employees recebe p_room_id",
      pattern: /p_room_id\s+uuid\s+default\s+null/,
    },
    {
      label: "RPC upsert_daily_log_with_employees recebe fotos jsonb",
      pattern: /p_photos_urls\s+jsonb\s+default\s+null/,
    },
    {
      label: "RPC upsert_daily_log_with_employees recebe videos jsonb",
      pattern: /p_videos_urls\s+jsonb\s+default\s+null/,
    },
    {
      label: "RPC upsert_daily_log_with_employees retorna room_id",
      pattern: /returns\s+table\s*\([\s\S]*room_id\s+uuid/,
    },
    {
      label: "RPC upsert_full_project versionada",
      pattern: /create\s+or\s+replace\s+function\s+public\.upsert_full_project/,
    },
    {
      label: "RPC upsert_full_project sincroniza espelho projects.rooms",
      pattern: /update\s+public\.projects[\s\S]*set\s+rooms\s*=\s*v_room_names/,
    },
  ];

  for (const contract of requiredSchemaContracts) {
    if (!contract.pattern.test(migrationsSql)) {
      failures.push(`contrato de schema ausente: ${contract.label}`);
    }
  }
}

if (failures.length) {
  console.error("Falha no smoke check:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Smoke check passou: estrutura critica, scripts, workflow de deploy e contratos de schema estao coerentes.");
