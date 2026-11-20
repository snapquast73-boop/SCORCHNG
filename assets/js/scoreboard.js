(function () {
  'use strict';
  let games = [], filter = 'all', generation = 0;
  function render() {
    UI.tabs('tabs', [['all', 'All Games'], ['Live', 'Live'], ['Final', 'Final'], ['Preview', 'Upcoming']], filter, key => { filter = key; render(); });
    const visible = games.filter(g => filter === 'all' || g.status?.abstractGameState === filter);
    UI.html('game-list', visible.map(g => `<article class="game-card">
      <div class="card-meta">${UI.esc(g.status?.detailedState)} · ${UI.esc(g.linescore?.inningState)} ${UI.value(g.linescore?.currentInningOrdinal)}</div>
      ${['away', 'home'].map(side => `<div class="team-line"><span>${UI.esc(g.teams?.[side]?.team?.name)}</span><strong>${UI.value(g.teams?.[side]?.score)}</strong></div>`).join('')}
      <p class="muted">${g.gameDate ? UI.esc(new Date(g.gameDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) : ''} · ${UI.esc(g.venue?.name)}</p>
      <a class="btn" href="game.html?gamePk=${encodeURIComponent(g.gamePk)}">Play-by-Play →</a>
      <p class="sources">${UI.link(API.scheduleURL(selected()), 'MLB schedule')} · ${UI.link(API.gameday(g.gamePk), 'Gameday')}</p>
      </article>`).join('') || UI.empty('No games in this view for the selected date. Choose another date to browse MLB games.'));
  }
  async function load(date) {
    const current = ++generation; UI.status('Loading MLB schedule…');
    try {
      const result = await API.schedule(date); if (current !== generation) return;
      games = result; render(); UI.banner('');
      UI.status(`Updated ${new Date().toLocaleTimeString()} · ${games.length} games · refreshes every 30 seconds`);
    } catch (e) { if (current !== generation) return; UI.banner(`MLB schedule unavailable: ${e.message}.`); UI.status('Could not refresh. Previously loaded results, if any, are stale. Retrying automatically.', true); }
  }
  // Deferral lets the date controller finish initialization before the first render.
  const selected = UI.dateController('Scoreboard', date => Promise.resolve().then(() => load(date)));
  setInterval(() => { if (!document.hidden) load(selected()); }, 30000);
})();
