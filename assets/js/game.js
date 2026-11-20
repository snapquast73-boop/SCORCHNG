(function () {
  'use strict';
  const id = new URLSearchParams(location.search).get('gamePk') || new URLSearchParams(location.search).get('id');
  let busy = false;
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    document.querySelectorAll('[data-tab]').forEach(t => { t.classList.toggle('tab-on', t === b); t.setAttribute('aria-pressed', String(t === b)); });
    for (const tab of ['plays', 'boxscore', 'props', 'reviews']) document.getElementById('panel-' + tab).style.display = tab === b.dataset.tab ? '' : 'none';
  });
  function boxscore(feed) {
    return ['away', 'home'].map(side => {
      const box = feed.liveData?.boxscore?.teams?.[side];
      if (!box) return UI.empty('Box score not supplied by MLB yet.');
      const rows = (box.batters || []).map(id => box.players?.['ID' + id]).filter(Boolean).map(p => `<tr><td>${UI.esc(p.person?.fullName)}</td>${['atBats', 'runs', 'hits', 'rbi', 'baseOnBalls', 'strikeOuts'].map(s => `<td>${UI.value(p.stats?.batting?.[s])}</td>`).join('')}<td>${UI.sources(feed.gamePk)}</td></tr>`);
      const pitching = (box.pitchers || []).map(id => box.players?.['ID' + id]).filter(Boolean).map(p => `<tr><td>${UI.esc(p.person?.fullName)}</td>${['inningsPitched', 'hits', 'runs', 'earnedRuns', 'baseOnBalls', 'strikeOuts'].map(s => `<td>${UI.value(p.stats?.pitching?.[s])}</td>`).join('')}<td>${UI.sources(feed.gamePk)}</td></tr>`);
      return `<h2>${UI.esc(feed.gameData?.teams?.[side]?.name)}</h2>${UI.table(['Batter', 'AB', 'R', 'H', 'RBI', 'BB', 'K', 'Source'], rows)}${UI.table(['Pitcher', 'IP', 'H', 'R', 'ER', 'BB', 'K', 'Source'], pitching)}`;
    }).join('');
  }
  async function load() {
    if (busy) return; busy = true;
    try {
      if (!/^\d+$/.test(id || '')) throw new Error('Choose a game from the scoreboard first.');
      const f = await API.game(id), ls = f.liveData.linescore, plays = f.liveData.plays?.allPlays || [], current = f.liveData.plays?.currentPlay;
      for (const side of ['away', 'home']) UI.html('header-' + side, `<h2>${UI.esc(f.gameData.teams?.[side]?.name)}</h2><div class="big-score">${UI.value(ls?.teams?.[side]?.runs)}</div>`);
      UI.html('header-center', `<strong>${UI.esc(f.gameData.status?.detailedState)}</strong><p>${UI.esc(ls?.inningState)} ${UI.value(ls?.currentInningOrdinal)}</p>`);
      UI.html('header-meta', `${UI.esc(f.gameData.venue?.name)} · ${UI.sources(id)}`);
      UI.html('live-panel', current ? `<h2>Latest at-bat</h2><p>${UI.esc(current.matchup?.batter?.fullName)} vs. ${UI.esc(current.matchup?.pitcher?.fullName)}</p><p>${UI.esc(current.result?.description)}</p><p>Balls ${UI.value(current.count?.balls)} · Strikes ${UI.value(current.count?.strikes)} · Outs ${UI.value(current.count?.outs)}</p>` : UI.empty('No play data yet.'));
      if (ls) UI.html('linescore-wrap', `<h2>Linescore</h2>${UI.table(['Team', ...(ls.innings || []).map(i => i.num), 'R', 'H', 'E', 'Source'], ['away', 'home'].map(side => `<tr><td>${UI.esc(f.gameData.teams?.[side]?.abbreviation)}</td>${(ls.innings || []).map(i => `<td>${UI.value(i[side]?.runs)}</td>`).join('')}${['runs', 'hits', 'errors'].map(s => `<td>${UI.value(ls.teams?.[side]?.[s])}</td>`).join('')}<td>${UI.sources(id)}</td></tr>`))}`);
      UI.html('plays-wrap', plays.slice().reverse().map(p => `<article class="play-row"><h3>${UI.esc(p.about?.halfInning)} ${UI.value(p.about?.inning)} · ${UI.esc(p.result?.event)}</h3><p>${UI.esc(p.result?.description)}</p><p class="sources">${UI.sources(id)}</p></article>`).join('') || UI.empty('No plays yet.'));
      UI.html('boxscore-wrap', boxscore(f));
      const reviews = Reviews.extract(f).filter(r => ['reviews', 'pending'].includes(r.category));
      UI.html('reviews-wrap', reviews.map(r => `<article class="play-row"><h3>${UI.esc(r.category)} · ${UI.esc(r.half)} ${UI.value(r.inning)}</h3><p>${UI.esc(r.description)}</p><p>${UI.sources(id)}</p></article>`).join('') || UI.empty('No reviews or pending markers exposed in this game feed. This does not prove no review occurred.'));
      UI.html('props-wrap', `<h2>Props & Matchup</h2><p>Forecasts are unavailable: the uploaded project did not include its model or source code. No odds or probabilities have been invented.</p><p>${UI.link(API.gameday(id), 'Official game matchup')} · <a href="flagged.html">Flagged for Review</a></p>`);
      UI.status(`Updated ${new Date().toLocaleTimeString()} · refreshes every 15 seconds · blank cells mean not supplied by MLB.`);
    } catch (e) { UI.status(`${e.message} Previously loaded data, if any, is stale.`, true); }
    finally { busy = false; document.getElementById('loading').style.display = 'none'; }
  }
  document.getElementById('refresh-btn').onclick = load;
  load(); setInterval(() => { if (!document.hidden) load(); }, 15000);
})();
