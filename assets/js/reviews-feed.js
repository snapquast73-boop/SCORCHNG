(function () {
  'use strict';
  const tabs = [['all', 'All'], ['reviews', '🚨 Reviews'], ['changes', '✏️ Scoring Changes · R/H/RBI'], ['errors', '🎯 Error Watch'], ['pending', '⚖️ Scoring Pending'], ['hitError', '📉 Hit → Error'], ['pitching', '🧮 Pitching Stats'], ['other', '🗂️ Other Rulings'], ['flags', '⚑ Irregularities']];
  let tab = 'all', rows = [], flags = [], generation = 0, sound = false, audio;
  const soundButton = document.getElementById('sound-toggle-btn');
  soundButton.title = 'Chime for newly observed batting R/H/RBI changes only. Hit → error remains silent.';
  soundButton.onclick = async () => {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)(); await audio.resume(); sound = !sound;
      soundButton.textContent = sound ? '🔊 Sound On' : '🔇 Sound Off';
    } catch { UI.status('This browser does not support audio alerts.', true); }
  };
  const notificationButton = document.getElementById('notify-toggle-btn');
  notificationButton.textContent = 'Run Alerts unavailable'; notificationButton.disabled = true;
  notificationButton.title = 'Original run-at-risk attribution code was absent. No run risk is inferred. See Flagged for Review.';
  function chime() {
    if (!sound || !audio) return;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.frequency.value = 660; gain.gain.setValueAtTime(0.12, audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.5);
    oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + 0.5);
  }
  function render() {
    UI.tabs('feed-tabs', tabs, tab, key => { tab = key; render(); });
    const visible = tab === 'flags' ? flags : rows.filter(r => tab === 'all' ? ['reviews', 'changes', 'pending'].includes(r.category) : r.category === tab);
    UI.text('feed-stats', `${rows.filter(r => r.category === 'reviews').length} review rows · ${rows.filter(r => r.category === 'errors').length} error plays · ${rows.filter(r => r.category === 'changes').length} observed batting changes`);
    UI.html('feed-list', visible.map(r => `<article class="feed-row"><div class="card-meta">${UI.esc(r.category || 'Irregularity')} · Game ${UI.value(r.gamePk)} · ${UI.esc(r.half)} ${UI.value(r.inning)}</div>
      <h3>${UI.esc(r.batter || '')}${r.event ? ' · ' + UI.esc(r.event) : ''}</h3><p>${UI.esc(r.message || r.description)}</p>
      ${r.before ? `<p>Observed call: ${UI.esc(r.before.event)} → Latest observed ruling: ${UI.esc(r.after.event)}</p><p>${r.stats.map(s => `${UI.esc(s.name)} ${UI.esc(s.stat)} ${s.delta > 0 ? '+' : ''}${UI.value(s.delta)}`).join(' · ')}</p><p class="muted">Observed ${UI.esc(r.observedAt)}. Not the official publication time.</p>` : ''}
      ${['errors', 'pending', 'hitError'].includes(r.category) ? '<p class="muted">Model chance: <span aria-label="unverified"></span> · Unverified — model unavailable. Current ruling is not proof of the initial call.</p>' : ''}
      <p class="sources"><a href="game.html?gamePk=${encodeURIComponent(r.gamePk)}">Game details</a> · ${UI.sources(r.gamePk)}${r.videoId ? ' · ' + UI.link('https://baseballsavant.mlb.com/sporty-videos?playId=' + encodeURIComponent(r.videoId), 'MLB video') : ''}</p></article>`).join('') || UI.empty(tab === 'pitching' ? 'Pitching-only change detection is unavailable in the recovered upload. Review the official scoring-change list; no pitching deltas are inferred.' : 'No matching observations. Historical initial calls cannot be recovered from a current feed.'));
  }
  async function load(date) {
    const token = ++generation; UI.status('Loading MLB game feeds…');
    rows = []; flags = []; render();
    try {
      const games = await API.schedule(date); if (token !== generation) return;
      const results = await API.pool(games, game => API.game(game.gamePk)); if (token !== generation) return;
      const log = FeedLog.load(date); let changes = 0, failed = 0;
      results.forEach((result, i) => {
        if (result.error) { failed++; flags.push({ gamePk: games[i].gamePk, message: `Feed unavailable: ${result.error}` }); return; }
        const added = FeedLog.observe(log, result.value); changes += added.filter(r => r.category === 'changes').length;
        rows.push(...Reviews.extract(result.value));
      });
      FeedLog.save(date, log); rows.push(...log.entries); flags.push(...log.flags);
      render(); if (changes) chime();
      UI.banner(`Only observations from this browser are persisted. Model probabilities, complete historical capture and run alerts are unavailable.${FeedLog.warning ? ' ' + FeedLog.warning : ''}`);
      UI.status(`Updated ${new Date().toLocaleTimeString()} · ${games.length - failed}/${games.length} game feeds loaded · ${UI.esc(date)} · polls every 30 seconds. ${failed ? 'Coverage incomplete; see Irregularities.' : ''}`);
    } catch (e) { UI.status(`MLB data unavailable: ${e.message}. Retrying automatically.`, true); }
  }
  const selected = UI.dateController('ReplayFeed', date => Promise.resolve().then(() => load(date)));
  document.getElementById('refresh-btn').onclick = () => load(selected());
  setInterval(() => { if (!document.hidden) load(selected()); }, 30000);
})();
