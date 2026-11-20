// Builds docs/ for GitHub Pages.
// index.html is written as a page body (title, styles and markup, no <html>/<head>/<body>),
// so this wraps it in a full HTML document and copies the data files next to it.
// Usage: node tools/build-pages.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function wrap(src) {
  const cut = src.indexOf('<header');
  if (cut < 0) throw new Error('index.html has no <header> to split head from body');
  const head = src.slice(0, cut).replace(/<meta name="claude:[^"]*"[^>]*>\s*/g, '').trim();
  const body = src.slice(cut).trim();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Search and inspect every player in the Rugby 08 (2007) game database: ratings, special skills, squads and comparisons.">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
${head}
</head>
<body>
${body}
</body>
</html>
`;
}

module.exports = { wrap };

if (require.main === module) {
  const out = path.join(root, 'docs');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), wrap(fs.readFileSync(path.join(root, 'index.html'), 'utf8')));
  for (const f of ['players.json', 'teams.json']) fs.copyFileSync(path.join(root, f), path.join(out, f));
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  console.log('Built docs/ (index.html, players.json, teams.json)');
}
