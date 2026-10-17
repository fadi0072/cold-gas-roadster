// Builds dist/artifact.html: index.html without the document wrapper or PWA tags,
// because the Claude artifact viewer supplies its own <!doctype>/<head>/<body> and can't run service workers.
// Usage: node tools/build-artifact.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html
  .replace(/<!-- pwa:start -->[\s\S]*?<!-- pwa:end -->\n?/, '')
  .replace(/<!-- analytics:start -->[\s\S]*?<!-- analytics:end -->\n?/, '')
  .replace(/<!doctype html>\n?/i, '')
  .replace(/<html[^>]*>\n?/i, '')
  .replace(/<\/html>\n?/i, '')
  .replace(/<head>\n?/i, '')
  .replace(/<\/head>\n?/i, '')
  .replace(/<body>\n?/i, '')
  .replace(/<\/body>\n?/i, '')
  .replace(/<meta charset="utf-8">\n?/i, '')
  .replace(/<meta name="viewport"[^>]*>\n?/i, '');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'artifact.html'), html);
console.log('wrote dist/artifact.html (' + html.length + ' bytes)');
