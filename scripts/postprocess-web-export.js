const fs = require("fs");
const path = require("path");

const buildId =
  (process.env.GITHUB_SHA && process.env.GITHUB_SHA.slice(0, 8)) ||
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
  `${Date.now()}`;
const versionedServiceWorkerFileName = `sw-${buildId}.js`;
const buildMeta = {
  buildId,
  generatedAt: new Date().toISOString(),
  serviceWorkerUrl: `./${versionedServiceWorkerFileName}`,
};

const PUBLIC_FILES = [
  "manifest.json",
  "icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-192.png",
  "icon-maskable-512.png",
];

/**
 * Script de pós-processamento do export web.
 * Mantemos esta etapa pequena e previsível para evitar drift entre o template
 * em public/ e o HTML final emitido pelo Expo.
 */
const targets = ["dist/index.html"];
const publicDir = path.join(process.cwd(), "public");
const distDir = path.join(process.cwd(), "dist");

for (const fileName of PUBLIC_FILES) {
  const sourcePath = path.join(publicDir, fileName);
  const destinationPath = path.join(distDir, fileName);

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destinationPath);
  }
}

const serviceWorkerSourcePath = path.join(publicDir, "sw.js");
if (fs.existsSync(serviceWorkerSourcePath)) {
  const originalServiceWorker = fs.readFileSync(serviceWorkerSourcePath, "utf8");
  const versionedServiceWorker = originalServiceWorker.replace(/__BUILD_ID__/g, buildId);
  fs.writeFileSync(path.join(distDir, versionedServiceWorkerFileName), versionedServiceWorker, "utf8");
  fs.writeFileSync(path.join(distDir, "sw.js"), versionedServiceWorker, "utf8");
}

fs.writeFileSync(path.join(distDir, "build.json"), JSON.stringify(buildMeta, null, 2), "utf8");

for (const relativePath of targets) {
  const filePath = path.join(process.cwd(), relativePath);

  if (!fs.existsSync(filePath)) {
    continue;
  }

  const original = fs.readFileSync(filePath, "utf8");
  const next = original
    .replace(/httpEquiv=/g, "http-equiv=")
    .replace(/<\/style>\s*<meta /i, "</style>\n    <meta ")
    .replace(/">\s*<link /i, '">\n    <link ')
    .replace(/__BUILD_ID__/g, buildId)
    .replace(/__SW_URL__/g, `./${versionedServiceWorkerFileName}`)
    .replace(/href="\.\/manifest\.json"/i, `href="./manifest.json?v=${buildId}"`)
    .replace(/<meta name="theme-color" content="[^"]*">/i, '<meta name="theme-color" content="#f4f1ea">')
    .replace(/<\/div>\s*<script /i, '</div>\n    <script ')
    .replace(/<\/script>\s*<\/body>/i, "</script>\n  </body>");

  if (next !== original) {
    fs.writeFileSync(filePath, next, "utf8");
  }
}
