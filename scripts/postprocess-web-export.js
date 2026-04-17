const fs = require("fs");
const path = require("path");

/**
 * Script de Pós-Processamento Web: Corrige divergencias de sintaxe HTML geradas pelo 'expo export'.
 * Garante que as tags meta e links de estilos estejam bem formatados para o GitHub Pages.
 */
const targets = ["dist/index.html", "docs/index.html"];

for (const relativePath of targets) {
  const filePath = path.join(process.cwd(), relativePath);

  // Verifica a existencia dos arquivos de destino antes de processar.
  if (!fs.existsSync(filePath)) {
    continue;
  }

  const original = fs.readFileSync(filePath, "utf8");
  /**
   * Corrige atributos de camelCase para o padrao HTML e limpa tags obsoletas do IE.
   * Injeta o link para o manifesto PWA.
   */
  const next = original
    .replace(/httpEquiv=/g, "http-equiv=")
    .replace(/\s*<meta http-equiv="X-UA-Compatible" content="IE=edge"\s*\/>\r?\n?/i, "\n")
    .replace(/<\/style>\s*<meta /i, "</style>\n    <meta ")
    .replace(/">\s*<link /i, '">\n    <link ')
    .replace(/\/><\/head>/i, "/>\n    <link rel=\"manifest\" href=\"/obra-conectada-mobile/manifest.json\">\n  </head>")
    .replace(/<\/div>\s*<script /i, '</div>\n    <script ')
    .replace(/<\/script>\s*<\/body>/i, "</script>\n  </body>");

  // Apenas reescreve o arquivo se houveram alteracoes reais.
  if (next !== original) {
    fs.writeFileSync(filePath, next, "utf8");
  }
}
