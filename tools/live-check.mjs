// Runs in Actions where MLB hosts are reachable. Never substitutes fake live data.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const sources = [
 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-09-11&hydrate=linescore',
 'https://statsapi.mlb.com/api/v1.1/game/824631/feed/live',
 'https://statsapi.mlb.com/api/v1/eventTypes'
];
const results = [];
for (const url of sources) {
 const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
 assert.ok(response.ok, `${url}: HTTP ${response.status}`);
 const data = await response.json();
 if (url.includes('/schedule')) assert.ok(data.dates.some(d => d.games.some(g => g.gamePk === 824631)));
 else if (url.includes('/feed/live')) {
  assert.equal(data.gamePk, 824631); assert.ok(data.liveData.plays.allPlays.length > 0);
  assert.ok(data.liveData.plays.allPlays.some(p => typeof p.result?.rbi === 'number'));
 } else assert.ok(data.some(e => e.code === 'os_ruling_pending_primary'));
 results.push({ source: url, status: response.status, checkedAt: new Date().toISOString() });
 console.log('Official source verified:', url);
}
fs.mkdirSync('test-results', { recursive: true });
fs.writeFileSync('test-results/official-source-checks.json', JSON.stringify(results, null, 2));
