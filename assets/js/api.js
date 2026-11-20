/* Public MLB endpoints. Missing values remain missing; no proxy or credentials. */
(function (root) {
  'use strict';
  const BASE = 'https://statsapi.mlb.com';
  async function json(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
    return response.json();
  }
  const API = {
    BASE, json,
    scheduleURL: date => `${BASE}/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}&hydrate=linescore`,
    gameURL: id => `${BASE}/api/v1.1/game/${encodeURIComponent(id)}/feed/live`,
    gameday: id => `https://www.mlb.com/gameday/${encodeURIComponent(id)}`,
    async schedule(date) {
      const data = await json(this.scheduleURL(date));
      if (!Array.isArray(data.dates)) throw new Error('Schedule response has no dates array');
      return data.dates.flatMap(d => d.games || []);
    },
    async game(id) {
      if (!/^\d+$/.test(String(id))) throw new Error('Invalid game ID');
      const data = await json(this.gameURL(id));
      if (!data.gameData || !data.liveData) throw new Error('Game feed is not yet available');
      return data;
    },
    async pool(items, fn, size = 4) {
      const results = new Array(items.length);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
        while (next < items.length) {
          const i = next++;
          try { results[i] = { value: await fn(items[i]) }; }
          catch (error) { results[i] = { error: error.message }; }
        }
      }));
      return results;
    }
  };
  root.API = API;
})(globalThis);
