import fs from 'node:fs';
import path from 'node:path';
const out = '_site';
fs.mkdirSync(out, { recursive: true });
// Explicit public allowlist: never publish .git, workflows, caches or the optional server.
for (const name of ['index.html', 'game.html', 'reviews.html', 'scoring.html', 'flagged.html', '404.html', 'assets', 'docs', 'LICENSE', 'README.md', 'COORDINATION.md']) {
  fs.cpSync(name, path.join(out, name), { recursive: true });
}
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('Static site assembled in _site/');
