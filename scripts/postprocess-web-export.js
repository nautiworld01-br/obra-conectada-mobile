const fs = require("fs");
const path = require("path");

/**
 * Script de pós-processamento do export web.
 * Mantemos esta etapa pequena e previsível para evitar drift entre o template
 * em public/ e o HTML final emitido pelo Expo.
 */
const targets = ["dist/index.html"];

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
    .replace(/<\/div>\s*<script /i, '</div>\n    <script ')
    .replace(/<\/script>\s*<\/body>/i, "</script>\n  </body>");

  if (next !== original) {
    fs.writeFileSync(filePath, next, "utf8");
  }
}
