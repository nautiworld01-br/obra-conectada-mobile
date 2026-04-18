const fs = require("fs");
const path = require("path");

const PUBLIC_FILES = [
  "manifest.json",
  "sw.js",
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
    .replace(/<meta name="theme-color" content="[^"]*">/i, '<meta name="theme-color" content="#f4f1ea">')
    .replace(/<\/div>\s*<script /i, '</div>\n    <script ')
    .replace(/<\/script>\s*<\/body>/i, "</script>\n  </body>");

  if (next !== original) {
    fs.writeFileSync(filePath, next, "utf8");
  }
}
