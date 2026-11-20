import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const pages = fs.readdirSync('.').filter(p => p.endsWith('.html'));
test('every local HTML asset/link exists, including case-sensitive project paths', () => {
 for (const page of pages) {
  const text = fs.readFileSync(page, 'utf8');
  for (const match of text.matchAll(/(?:src|href)="([^"]+)"/g)) {
   const url = match[1]; if (/^(?:https?:|data:|#|mailto:)/.test(url)) continue;
   assert.ok(!url.startsWith('/'), `${page}: absolute path breaks project Pages: ${url}`);
   assert.ok(fs.existsSync(path.join(path.dirname(page), url.split(/[?#]/)[0])), `${page}: missing ${url}`);
  }
  assert.match(text, /<html lang="en"/);
 }
});
test('every page that exposes main navigation links to Flagged for Review', () => {
 for (const page of pages.filter(p => p !== '404.html')) assert.ok(fs.readFileSync(page, 'utf8').includes('flagged.html'));
});
test('JavaScript syntax is valid in all public scripts', () => {
 for (const file of fs.readdirSync('assets/js').filter(f => f.endsWith('.js'))) new vm.Script(fs.readFileSync('assets/js/' + file, 'utf8'), { filename: file });
});
test('every public review table body row has an official MLB/GitHub source', () => {
 const table = fs.readFileSync('flagged.html', 'utf8').split('<tbody>')[1].split('</tbody>')[0];
 for (const row of table.match(/<tr>.*?<\/tr>/gs)) assert.match(row, /href="https:\/\/(?:github\.com|[^/]*mlb\.com|docs\.github\.com)/);
});
