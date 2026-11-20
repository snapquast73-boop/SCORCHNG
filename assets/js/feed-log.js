(function (root) {
  'use strict';
  const PREFIX = 'mlbScoringChange.restored.v1.';
  const fresh = () => ({ snapshots: {}, entries: [], flags: [] });
  const FeedLog = {
    warning: '',
    load(date) {
      try {
        const text = localStorage.getItem(PREFIX + date);
        if (!text) return fresh();
        const data = JSON.parse(text);
        if (!data || !Array.isArray(data.entries) || !Array.isArray(data.flags) || !data.snapshots || typeof data.snapshots !== 'object') throw new Error('Invalid saved log');
        return data;
      } catch (e) { this.warning = 'Saved browser log could not be read; this visit starts a new baseline.'; console.warn(e); return fresh(); }
    },
    save(date, data) {
      data.entries = data.entries.slice(-500); data.flags = data.flags.slice(-100);
      try {
        localStorage.setItem(PREFIX + date, JSON.stringify(data));
        Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).sort().reverse().slice(7).forEach(k => localStorage.removeItem(k));
      } catch (e) { this.warning = 'Browser storage is unavailable or full. Observations are not persisted.'; console.warn(e); }
    },
    observe(data, feed) {
      let added = [];
      for (const p of feed.liveData?.plays?.allPlays || []) {
        if (!p.about?.isComplete || p.about?.atBatIndex == null) continue;
        const key = `${feed.gamePk}:${p.about.atBatIndex}`, after = Reviews.snapshot(p), before = data.snapshots[key];
        if (before) {
          const stats = Reviews.delta(before, after);
          if (before.event !== after.event || stats.length) {
            const row = { id: `${key}:${Date.now()}`, gamePk: feed.gamePk, atBatIndex: p.about.atBatIndex, inning: p.about.inning,
              half: p.about.halfInning, batter: p.matchup?.batter?.fullName, category: Reviews.category(before, after, stats),
              before, after, stats, event: p.result?.event, description: p.result?.description, observedAt: new Date().toISOString() };
            data.entries.push(row); added.push(row);
          } else if (before.description !== after.description || before.awayScore !== after.awayScore || before.homeScore !== after.homeScore || before.error !== after.error) {
            data.flags.push({ gamePk: feed.gamePk, atBatIndex: p.about.atBatIndex, message: 'Payload edited without an attributable batting-stat delta. Review official source; no delta inferred.', observedAt: new Date().toISOString() });
          }
        }
        data.snapshots[key] = after;
      }
      return added;
    }
  };
  root.FeedLog = FeedLog;
})(globalThis);
