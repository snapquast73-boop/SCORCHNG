import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
test('optional local server hides private files, rejects malformed paths and disables public writes', { timeout: 15000 }, async () => {
 const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: '0', ENABLE_FEED_LOG_WRITES: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
 try {
  const url = await new Promise((resolve, reject) => {
   let text = ''; child.stdout.on('data', chunk => { text += chunk; const m = text.match(/http:\/\/0\.0\.0\.0:(\d+)/); if (m) resolve('http://127.0.0.1:' + m[1]); });
   child.once('error', reject); child.once('exit', code => reject(new Error('Server exited: ' + code)));
  });
  for (const name of ['/', '/SCORCHNG/index.html', '/assets/js/api.js', '/flagged.html']) assert.equal((await fetch(url + name)).status, 200, name);
  for (const name of ['/.git/config', '/server.mjs', '/package.json', '/node_modules/@playwright/test/package.json']) assert.equal((await fetch(url + name)).status, 403, name);
  assert.equal((await fetch(url + '/%E0%A4%A')).status, 400);
  assert.equal((await fetch(url + '/api/feed-log', { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await fetch(url + '/api/health')).status, 200);
 } finally { child.kill('SIGTERM'); await once(child, 'exit'); }
});
