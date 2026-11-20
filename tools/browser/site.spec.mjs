import { test, expect } from '@playwright/test';
// All mocked baseball facts are SYNTHETIC, never deployed or presented as live evidence.
const game = { gamePk: 99999999, gameDate: '2026-09-11T18:20:00Z', status: { abstractGameState: 'Final', detailedState: 'Final' }, teams: { away: { team: { name: 'SYNTHETIC Away' }, score: 1 }, home: { team: { name: 'SYNTHETIC Home' }, score: 0 } }, venue: { name: 'SYNTHETIC Park' } };
const feed = { gamePk: 99999999, gameData: { teams: { away: { name: 'SYNTHETIC Away', abbreviation: 'SYN-A' }, home: { name: 'SYNTHETIC Home', abbreviation: 'SYN-H' } }, status: { detailedState: 'Final' }, venue: { name: 'SYNTHETIC Park' } }, liveData: { linescore: { innings: [{ num: 1, away: { runs: 1 }, home: {} }], teams: { away: { runs: 1 }, home: { runs: 0 } } }, plays: { allPlays: [{ about: { atBatIndex: 0, inning: 1, halfInning: 'top', isComplete: true }, result: { eventType: 'field_error', event: 'Field Error', rbi: 0, description: 'SYNTHETIC error <img src=x onerror=alert(1)>' }, matchup: { batter: { id: 1, fullName: 'SYNTHETIC Batter' } }, runners: [], playEvents: [] }] }, boxscore: { teams: {} } } };
async function mock(page, empty = false) {
 await page.route('https://statsapi.mlb.com/**', route => route.fulfill({ json: route.request().url().includes('/schedule') ? { dates: empty ? [] : [{ games: [game] }] } : feed }));
 await page.route('**/data/official.json', route => route.fulfill({ json: { status: 'official-text', retrievedAt: 'SYNTHETIC test time', rows: [{ season: '2026', id: '001', text: 'SYNTHETIC official paragraph', source: 'https://www.mlb.com/official-information/scoring-changes' }] } }));
}
test('scoreboard navigation works under the repository subpath with no missing local assets', async ({ page }) => {
 const errors = [], missing = [];
 page.on('pageerror', e => errors.push(e.message)); page.on('response', r => { if (r.url().includes('127.0.0.1') && r.status() >= 400) missing.push(r.url()); });
 await mock(page); await page.goto('index.html?date=2026-09-11');
 await expect(page.locator('.game-card')).toHaveCount(1);
 await expect(page.locator('.game-card')).toContainText('SYNTHETIC Away');
 await page.getByRole('link', { name: 'Play-by-Play →' }).click();
 await expect(page.locator('#header-away')).toContainText('SYNTHETIC Away');
 await page.getByRole('button', { name: 'Box Score', exact: true }).click(); await expect(page.locator('#panel-boxscore')).toBeVisible();
 await page.getByRole('button', { name: 'Props & Matchup', exact: true }).click(); await expect(page.locator('#props-wrap')).toContainText('unavailable');
 expect(errors).toEqual([]); expect(missing).toEqual([]);
});
test('empty schedule is honest and date controls work', async ({ page }) => {
 await mock(page, true); await page.goto('index.html?date=2026-11-20');
 await expect(page.locator('#game-list')).toContainText('No games');
 await page.getByTitle('Previous day').click(); await expect(page.locator('#date-picker')).toHaveValue('2026-11-19');
});
test('reviews show all-scope errors safely and do not invent probabilities', async ({ page }) => {
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await mock(page); await page.goto('reviews.html?date=2026-09-11');
 await expect(page.locator('#status-line')).toContainText('1/1');
 await page.getByRole('button', { name: '🎯 Error Watch', exact: true }).click();
 await expect(page.locator('.feed-row')).toContainText('SYNTHETIC error <img');
 await expect(page.locator('.feed-row img')).toHaveCount(0);
 await expect(page.locator('.feed-row')).toContainText('Unverified');
 await expect(page.locator('#notify-toggle-btn')).toBeDisabled();
 expect(errors).toEqual([]);
});
test('official rows each have a source and filters work', async ({ page }) => {
 await mock(page); await page.goto('scoring.html');
 await expect(page.locator('tbody tr')).toHaveCount(1);
 await expect(page.locator('tbody tr a')).toHaveAttribute('href', 'https://www.mlb.com/official-information/scoring-changes');
 await page.locator('#sc-search').fill('no match'); await expect(page.locator('#official-rows')).toContainText('No matching');
 await page.getByRole('button', { name: 'Model', exact: true }).click(); await expect(page.locator('#sc-panel')).toContainText('unverified');
});
test('failed official APIs show an explicit error instead of false zeroes', async ({ page }) => {
 await page.route('https://statsapi.mlb.com/**', route => route.fulfill({ status: 503, body: 'Unavailable' }));
 await page.goto('index.html'); await expect(page.locator('#status-line')).toContainText('Could not refresh'); await expect(page.locator('#banner')).toContainText('503');
});
test('flagged page has sources and collection status on mobile', async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 844 }); await mock(page); await page.goto('flagged.html');
 await expect(page.locator('#collection')).toContainText('official-text');
 const rows = page.locator('tbody tr'); expect(await rows.count()).toBeGreaterThan(5);
 for (const row of await rows.all()) expect(await row.locator('a[href^="https://"]').count()).toBeGreaterThan(0);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
