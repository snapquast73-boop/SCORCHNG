import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({ console });
for (const file of ['reviews.js', 'feed-log.js']) vm.runInContext(fs.readFileSync('assets/js/' + file, 'utf8'), context);
const { Reviews: R, FeedLog: F } = context;
// SYNTHETIC fixtures: these people, games and plays are not real MLB data.
const play = (event = 'field_error', rbi = 0) => ({ about: { atBatIndex: 0, isComplete: true, inning: 1, halfInning: 'top' }, matchup: { batter: { id: 1, fullName: 'SYNTHETIC Batter' } }, result: { eventType: event, rbi }, runners: [{ details: { runner: { id: 1, fullName: 'SYNTHETIC Batter' }, isScoringEvent: false } }] });
test('batting H/RBI changes are sourced from paired snapshots', () => {
 const before = R.snapshot(play()), after = R.snapshot(play('single', 1)), stats = R.delta(before, after);
 assert.equal(stats.length, 2); assert.equal(stats[0].stat, 'H'); assert.equal(stats[0].delta, 1); assert.equal(stats[1].stat, 'RBI'); assert.equal(R.category(before, after, stats), 'changes');
});
test('hit to error is always isolated, even when batting stats change', () => {
 const before = R.snapshot(play('single', 1)), after = R.snapshot(play());
 assert.equal(R.category(before, after, R.delta(before, after)), 'hitError');
});
test('runner R is never attributed to the batter or inferred from absent runners', () => {
 const a = play('single'), b = play('single');
 a.runners.push({ details: { runner: { id: 2, fullName: 'SYNTHETIC Runner' }, isScoringEvent: false } });
 b.runners.push({ details: { runner: { id: 2, fullName: 'SYNTHETIC Runner' }, isScoringEvent: true } });
 const stats = R.delta(R.snapshot(a), R.snapshot(b)); assert.equal(stats.length, 1); assert.equal(stats[0].name, 'SYNTHETIC Runner'); assert.equal(stats[0].stat, 'R');
 assert.equal(R.delta(R.snapshot(play('single')), R.snapshot(b)).length, 0);
});
test('missing rbi does not become zero; different batters do not create deltas', () => {
 const a = play('single'), b = play('single', 2); delete a.result.rbi;
 assert.equal(R.delta(R.snapshot(a), R.snapshot(b)).length, 0);
 b.matchup.batter.id = 3; assert.equal(R.delta(R.snapshot(play('single')), R.snapshot(b)).length, 0);
});
test('runner errors on hits and fielders choices are included, one row per play', () => {
 for (const event of ['single', 'fielders_choice', 'field_out']) {
  const p = play(event); p.runners[0].credits = [{ credit: 'f_fielding_error' }, { credit: 'f_throwing_error' }];
  const rows = R.extract({ gamePk: 99999999, liveData: { plays: { allPlays: [p] } } });
  assert.equal(rows.length, 1); assert.equal(rows[0].category, 'errors'); assert.match(rows[0].source, /^https:\/\/statsapi\.mlb\.com/);
 }
});
test('first observation creates only a baseline; repeated unchanged polls are idempotent', () => {
 const data = { snapshots: {}, entries: [], flags: [] }, feed = { gamePk: 99999999, liveData: { plays: { allPlays: [play()] } } };
 assert.equal(F.observe(data, feed).length, 0); assert.equal(F.observe(data, feed).length, 0);
 feed.liveData.plays.allPlays = [play('single')]; assert.equal(F.observe(data, feed).length, 1); assert.equal(F.observe(data, feed).length, 0);
});
test('pending and review markers are not guessed from descriptions', () => {
 const p = play('single'); p.playEvents = [{ details: { eventType: 'os_ruling_pending_primary', description: 'SYNTHETIC pending' } }, { details: { eventType: 'manager_challenge', description: 'SYNTHETIC challenge' } }];
 const rows = R.extract({ gamePk: 99999999, liveData: { plays: { allPlays: [p] } } });
 assert.equal(rows.length, 2); assert.equal(rows[0].category, 'pending'); assert.equal(rows[1].category, 'reviews');
});
test('all browser storage stays inside the required isolated namespace', () => {
 for (const name of fs.readdirSync('assets/js')) {
  const text = fs.readFileSync('assets/js/' + name, 'utf8');
  if (text.includes('localStorage')) assert.ok(text.includes('mlbScoringChange.'));
 }
});
test('pending or unknown classifications never manufacture an H delta', () => {
 for (const event of ['os_ruling_pending_primary', 'unknown_event', null]) {
  const stats = R.delta(R.snapshot(play(event)), R.snapshot(play('single')));
  assert.equal(stats.filter(s => s.stat === 'H').length, 0);
 }
});
test('multiple runner movements preserve an explicitly observed score', () => {
 const p = play('single'); p.runners = [
  { details: { runner: { id: 2, fullName: 'SYNTHETIC Runner' }, isScoringEvent: true } },
  { details: { runner: { id: 2, fullName: 'SYNTHETIC Runner' }, isScoringEvent: false } }
 ];
 assert.equal(R.snapshot(p).runners['2'].scored, true);
});
test('corrupt local rows are dropped instead of breaking the feed', () => {
 context.localStorage = { getItem: () => JSON.stringify({ entries: [null, { category: 'changes', gamePk: 99999999 }], flags: [null], snapshots: { bad: null } }) };
 const data = F.load('2026-09-11');
 assert.equal(data.entries.length, 0); assert.equal(data.flags.length, 0); assert.equal(Object.keys(data.snapshots).length, 0); assert.match(F.warning, /Malformed/);
});
