/* Extract only facts exposed by MLB payloads. Used by browser and offline tests. */
(function (root) {
  'use strict';
  const HITS = new Set(['single', 'double', 'triple', 'home_run']);
  // Confirmed against MLB /api/v1/eventTypes. Unknown/pending events do not imply H=0.
  const NON_HITS = new Set(['double_play', 'field_error', 'field_out', 'fielders_choice', 'fielders_choice_out', 'force_out', 'grounded_into_double_play', 'strikeout', 'strike_out', 'strikeout_double_play', 'strikeout_triple_play', 'triple_play', 'sac_fly', 'catcher_interf', 'batter_interference', 'fan_interference', 'sac_fly_double_play', 'sac_bunt', 'sac_bunt_double_play', 'walk', 'intent_walk', 'hit_by_pitch']);
  const knownRuling = event => HITS.has(event) || NON_HITS.has(event);
  function errorPlay(play) {
    return /error/.test(play.result?.eventType || '') || (play.runners || []).some(r => /error/i.test(r.details?.eventType || '') || (r.credits || []).some(c => /^f_.*error$|^error$/i.test(c.credit || '')));
  }
  function snapshot(play) {
    const runners = {};
    for (const r of play.runners || []) {
      if (r.details?.runner?.id == null) continue;
      const id = String(r.details.runner.id);
      // Record R only when MLB explicitly supplies isScoringEvent.
      if (typeof r.details.isScoringEvent === 'boolean') runners[id] = {
        name: r.details.runner.fullName, scored: Boolean(runners[id]?.scored) || r.details.isScoringEvent
      };
    }
    return { event: play.result?.eventType ?? null, rbi: play.result?.rbi ?? null, batter: play.matchup?.batter?.id ?? null,
      batterName: play.matchup?.batter?.fullName ?? null, runners, description: play.result?.description ?? null,
      awayScore: play.result?.awayScore ?? null, homeScore: play.result?.homeScore ?? null, error: errorPlay(play) };
  }
  function delta(before, after) {
    const stats = [];
    if (before.batter != null && before.batter === after.batter) {
      if (knownRuling(before.event) && knownRuling(after.event) && HITS.has(before.event) !== HITS.has(after.event)) stats.push({ name: after.batterName, stat: 'H', delta: Number(HITS.has(after.event)) - Number(HITS.has(before.event)) });
      if (Number.isFinite(before.rbi) && Number.isFinite(after.rbi) && before.rbi !== after.rbi) stats.push({ name: after.batterName, stat: 'RBI', delta: after.rbi - before.rbi });
    }
    for (const [id, r] of Object.entries(after.runners || {})) {
      const old = before.runners?.[id];
      if (old && old.scored !== r.scored) stats.push({ name: r.name, stat: 'R', delta: Number(r.scored) - Number(old.scored) });
    }
    return stats;
  }
  function category(before, after, stats) {
    if (['single', 'double', 'triple'].includes(before.event) && after.event === 'field_error') return 'hitError';
    if (stats.length) return 'changes';
    return 'other';
  }
  function extract(feed) {
    const rows = [], gamePk = feed.gamePk;
    for (const p of feed.liveData?.plays?.allPlays || []) {
      const base = { gamePk, atBatIndex: p.about?.atBatIndex, inning: p.about?.inning, half: p.about?.halfInning,
        batter: p.matchup?.batter?.fullName, description: p.result?.description,
        event: p.result?.event, source: `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`,
        videoId: (p.playEvents || []).find(e => e.playId)?.playId };
      const pending = (p.playEvents || []).filter(e => /^os_ruling_pending_/.test(e.details?.eventType || ''));
      if (errorPlay(p)) rows.push({ ...base, id: `error-${base.atBatIndex}`, category: 'errors' });
      for (const e of pending) rows.push({ ...base, id: `pending-${base.atBatIndex}-${e.index}`, category: 'pending', description: e.details?.description || base.description });
      const reviewEvents = (p.playEvents || []).filter(e => e.reviewDetails || e.isReview || /review|challenge/i.test(e.details?.eventType || ''));
      if (p.reviewDetails || reviewEvents.length) {
        const d = p.reviewDetails || reviewEvents.find(e => e.reviewDetails)?.reviewDetails;
        rows.push({ ...base, id: `review-${base.atBatIndex}`, category: 'reviews', review: d,
          description: reviewEvents.map(e => e.details?.description).filter(Boolean).join(' · ') || base.description });
      }
    }
    return rows;
  }
  root.Reviews = { errorPlay, snapshot, delta, category, extract };
})(globalThis);
