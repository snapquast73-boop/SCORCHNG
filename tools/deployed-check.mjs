import assert from 'node:assert/strict';
const base = process.env.PAGE_URL || 'https://snapquast73-boop.github.io/SCORCHNG/';
const pages = ['index.html', 'game.html', 'reviews.html', 'scoring.html', 'flagged.html', '404.html'];
const checked = new Set();
async function read(name) {
 const url = new URL(name, base).href;
 const response = await fetch(url, { signal: AbortSignal.timeout(30000), cache: 'no-cache' });
 assert.equal(response.status, 200, `${url}: expected published asset`);
 checked.add(url); return response.text();
}
for (const name of pages) {
 const html = await read(name); assert.match(html, /MLB/);
 for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  if (/^(https?:|data:|#|mailto:)/.test(match[1])) continue;
  const url = new URL(match[1], new URL(name, base)).href;
  if (!checked.has(url)) await read(url);
 }
}
const data = JSON.parse(await read('data/official.json'));
assert.ok(Array.isArray(data.rows));
for (const row of data.rows) {
 assert.equal(row.source, 'https://www.mlb.com/official-information/scoring-changes');
 assert.match(row.season, /^20\d{2}$/); assert.ok(row.text);
}
console.log(`Published site verified: ${checked.size} resources, ${data.rows.length} official paragraphs, ${base}`);
if (data.warning) console.warn('Published source gap (also visible on Flagged for Review):', data.warning);
