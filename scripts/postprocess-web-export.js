const fs = require("fs");
const path = require("path");

const targets = ["dist/index.html", "docs/index.html"];

for (const relativePath of targets) {
  const filePath = path.join(process.cwd(), relativePath);

  if (!fs.existsSync(filePath)) {
    continue;
  }

  const original = fs.readFileSync(filePath, "utf8");
  const next = original
    .replace(/httpEquiv=/g, "http-equiv=")
    .replace(/\s*<meta http-equiv="X-UA-Compatible" content="IE=edge"\s*\/>\r?\n?/i, "\n")
    .replace(/<\/style>\s*<meta /i, "</style>\n    <meta ")
    .replace(/">\s*<link /i, '">\n    <link ')
    .replace(/\/><\/head>/i, "/>\n  </head>")
    .replace(/<\/div>\s*<script /i, '</div>\n    <script ')
    .replace(/<\/script>\s*<\/body>/i, "</script>\n  </body>");

  if (next !== original) {
    fs.writeFileSync(filePath, next, "utf8");
  }
}
