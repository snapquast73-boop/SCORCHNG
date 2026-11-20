/* ============================================================================
 * game.js — the Game page (game.html?gamePk=<id>).
 *
 * One request per poll: GET /api/v1.1/game/{gamePk}/feed/live
 *   liveData.plays.allPlays[]  → play-by-play, reviews, current at-bat
 *   liveData.linescore         → inning lines, count, outs, base runners
 *   liveData.boxscore          → batting/pitching lines
 *   liveData.decisions         → W/L/S
 *   gameData.teams/players     → names, records, venue, status, hands
 * The page only rebuilds the DOM when the baseball state actually changes, and
 * pauses entirely while the tab is hidden.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var LIVE_POLL_MS = 3000;
  var IDLE_POLL_MS = 30000;
  var FINAL_POLL_MS = 30000;

  var gamePk = null;
  var timer = null;
  var countdown = 0;
  var lastSignature = '';
  var lastFeed = null;
  var lastReviews = [];
  var started = false;
  var latestRequest = 0;
  var registryReady = Promise.resolve();

  function init() {
    var params = new URLSearchParams(window.location.search);
    gamePk = params.get('gamePk');
    if (!gamePk) {
      var main = document.getElementById('main');
      if (main) {
        main.innerHTML = '<div class="panel">Missing <code>gamePk</code> parameter. ' +
          '<a href="index.html">Return to the scoreboard</a>.</div>';
      }
      return;
    }
    setupTabs();
    registryReady = MLBAPI.getGameStatusRegistry()
      .then(function (rows) { Reviews.buildStatusMap(rows); })
      .catch(function (err) { console.warn('gameStatus registry unavailable', err); });
    var refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () { loadGame(); });
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopTimer();
      else loadGame();
    });
    loadGame();
  }

  function setupTabs() {
    var buttons = document.querySelectorAll('.tabs-game .tab-btn');
    var panels = {
      plays: document.getElementById('panel-plays'),
      boxscore: document.getElementById('panel-boxscore'),
      props: document.getElementById('panel-props'),
      reviews: document.getElementById('panel-reviews'),
    };
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(buttons, function (b) { b.classList.remove('tab-on'); });
        btn.classList.add('tab-on');
        var target = btn.dataset.tab;
        Object.keys(panels).forEach(function (k) {
          if (panels[k]) panels[k].style.display = k === target ? '' : 'none';
        });
        if (target === 'props' && lastFeed) {
          Props.render(lastFeed, document.getElementById('props-wrap'));
        }
      });
    });
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function startTimer(delayMs) {
    stopTimer();
    countdown = Math.round(delayMs / 1000);
    paintCountdown();
    timer = setInterval(function () {
      countdown -= 1;
      paintCountdown();
      if (countdown <= 0) {
        countdown = Math.round(delayMs / 1000);
      }
    }, 1000);
  }

  function paintCountdown() {
    var el = document.getElementById('countdown');
    if (el) el.textContent = countdown > 0 ? countdown + 's' : '';
  }

  function stateSignature(feed) {
    var ls = (feed.liveData && feed.liveData.linescore) || {};
    var plays = (feed.liveData && feed.liveData.plays) || {};
    var current = plays.currentPlay || {};
    return [
      (feed.gameData && feed.gameData.status && feed.gameData.status.detailedState) || '',
      ls.currentInning, ls.inningHalf, ls.outs,
      (ls.teams && ls.teams.away && ls.teams.away.runs), (ls.teams && ls.teams.home && ls.teams.home.runs),
      (current.count && current.count.balls), (current.count && current.count.strikes),
      (plays.allPlays || []).length,
      (current.about && current.about.atBatIndex),
      lastReviews.map(function (r) { return r.id + ':' + r.inProgress + ':' + r.isOverturned; }).join(','),
    ].join('|');
  }

  function pollDelay(feed) {
    var state = (feed && feed.gameData && feed.gameData.status &&
      feed.gameData.status.abstractGameState) || 'Preview';
    if (state === 'Live') return LIVE_POLL_MS;
    if (state === 'Final') return FINAL_POLL_MS;
    return IDLE_POLL_MS;
  }

  function loadGame() {
    var loading = document.getElementById('loading');
    var request = (latestRequest += 1);
    if (loading) loading.classList.add('show');
    return registryReady.then(function () { return MLBAPI.getGameLive(gamePk); })
      .then(function (feed) {
        if (request !== latestRequest) return null; // a newer poll already won
        lastFeed = feed;
        var sig = stateSignature(feed);
        updateReviewState(feed);
        if (sig !== lastSignature || !started) {
          lastSignature = sig;
          started = true;
          renderAll(feed);
        }
        var status = document.getElementById('status-line');
        if (status) {
          status.textContent = 'Updated ' + new Date().toLocaleTimeString() +
            (MLBAPI.quietRemainingMs() > 0 ? ' · API asked us to slow down' : '');
        }
        startTimer(pollDelay(feed));
        return feed;
      })
      .catch(function (err) {
        console.error(err);
        var status = document.getElementById('status-line');
        if (status) status.textContent = 'Error loading game: ' + err.message + ' (retrying)';
        startTimer(pollDelay(lastFeed));
      })
      .then(function () {
        if (loading) loading.classList.remove('show');
      });
  }

  function renderAll(feed) {
    renderHeader(feed);
    renderLivePanel(feed);
    renderLinescore(feed);
    renderPlays(feed);
    renderBoxscore(feed);
    renderReviews(feed);
    var propsPanel = document.getElementById('panel-props');
    if (propsPanel && propsPanel.style.display !== 'none') {
      Props.render(feed, document.getElementById('props-wrap'));
    }
  }

  /* ------------------------------------------------------------------ header */

  function renderHeader(feed) {
    var gd = feed.gameData || {};
    var ls = (feed.liveData && feed.liveData.linescore) || {};
    var away = (gd.teams && gd.teams.away) || {};
    var home = (gd.teams && gd.teams.home) || {};
    var awayScore = ls.teams && ls.teams.away && typeof ls.teams.away.runs === 'number'
      ? ls.teams.away.runs : '-';
    var homeScore = ls.teams && ls.teams.home && typeof ls.teams.home.runs === 'number'
      ? ls.teams.home.runs : '-';
    var status = gd.status || {};

    var awayEl = document.getElementById('header-away');
    var homeEl = document.getElementById('header-home');
    var centerEl = document.getElementById('header-center');
    var metaEl = document.getElementById('header-meta');
    var decisionsEl = document.getElementById('header-decisions');

    if (awayEl) {
      awayEl.innerHTML = UI.teamLogoImg(away.id, 'team-logo', 40) +
        '<div><div class="team-title">' + UI.esc(away.name || 'Away') + '</div>' +
        '<div class="muted">' + UI.esc(away.abbreviation || '') +
        (away.record && away.record.wins !== undefined
          ? ' · ' + away.record.wins + '-' + away.record.losses : '') + '</div></div>';
    }
    if (homeEl) {
      homeEl.innerHTML = '<div><div class="team-title">' + UI.esc(home.name || 'Home') + '</div>' +
        '<div class="muted">' + UI.esc(home.abbreviation || '') +
        (home.record && home.record.wins !== undefined
          ? ' · ' + home.record.wins + '-' + home.record.losses : '') + '</div></div>' +
        UI.teamLogoImg(home.id, 'team-logo', 40);
    }
    if (centerEl) {
      centerEl.innerHTML = '<div class="header-score">' + UI.esc(awayScore) + ' – ' +
        UI.esc(homeScore) + '</div>' +
        '<div class="muted">' + UI.esc(status.detailedState || '') + '</div>';
    }
    if (metaEl) {
      var bits = [];
      if (gd.venue && gd.venue.name) bits.push(gd.venue.name);
      if (gd.weather && gd.weather.condition) {
        bits.push(gd.weather.condition + (gd.weather.temp ? ', ' + gd.weather.temp + '°' : ''));
      }
      if (gd.datetime && gd.datetime.dateTime) bits.push(UI.formatDateTime(gd.datetime.dateTime));
      metaEl.textContent = bits.join(' · ');
    }
    if (decisionsEl) {
      var d = (feed.liveData && feed.liveData.decisions) || {};
      var parts = [];
      if (d.winner && d.winner.fullName) parts.push('W: ' + d.winner.fullName);
      if (d.loser && d.loser.fullName) parts.push('L: ' + d.loser.fullName);
      if (d.save && d.save.fullName) parts.push('SV: ' + d.save.fullName);
      decisionsEl.textContent = parts.join(' · ');
    }
  }

  /* -------------------------------------------------------------- live panel */

  /**
   * Values that the payload does not contain are shown blank, never as 0.
   * (An absent field is "not observed", not "zero".)
   */
  function val(value) {
    return (value === null || value === undefined || value === '') ? '' : value;
  }

  function feedUrl() {
    return MLBAPI.BASE_V11 + '/game/' + encodeURIComponent(gamePk) + '/feed/live';
  }

  /** Trailing cell that attributes a table row to the official MLB feed. */
  function sourceCell(values) {
    var missing = values.some(function (v) {
      return v === null || v === undefined || v === '';
    });
    return '<td><a href="' + UI.esc(feedUrl()) + '" target="_blank" rel="noopener">MLB feed</a>' +
      (missing ? ' · blank = not in payload' : '') + '</td>';
  }

  function basesFrom(linescore) {
    var off = (linescore && linescore.offense) || {};
    return {
      first: off.first || (off.postOnFirst && off.postOnFirst) || null,
      second: off.second || null,
      third: off.third || null,
    };
  }

  function battingLineFor(feed, playerId, side) {
    var box = (feed.liveData && feed.liveData.boxscore && feed.liveData.boxscore.teams) || {};
    var team = box[side];
    if (!team || !playerId) return null;
    var player = (team.players || {})['ID' + playerId];
    return player && player.stats && player.stats.batting ? player.stats.batting : null;
  }

  function pitchingLineFor(feed, playerId, side) {
    var box = (feed.liveData && feed.liveData.boxscore && feed.liveData.boxscore.teams) || {};
    var team = box[side];
    if (!team || !playerId) return null;
    var player = (team.players || {})['ID' + playerId];
    return player && player.stats && player.stats.pitching ? player.stats.pitching : null;
  }

  function renderLivePanel(feed) {
    var el = document.getElementById('live-panel');
    if (!el) return;
    var ls = (feed.liveData && feed.liveData.linescore) || {};
    var plays = (feed.liveData && feed.liveData.plays) || {};
    var current = plays.currentPlay || {};
    var matchup = current.matchup || {};
    var batter = matchup.batter || {};
    var pitcher = matchup.pitcher || {};
    var offense = ls.offense || {};
    var status = (feed.gameData && feed.gameData.status) || {};
    var isPreview = status.abstractGameState === 'Preview';
    var gd = feed.gameData || {};

    if (isPreview) {
      var ppAway = gd.teams && gd.teams.away && gd.teams.away.probablePitcher;
      var ppHome = gd.teams && gd.teams.home && gd.teams.home.probablePitcher;
      el.innerHTML = '<div class="live-row"><div><strong>First pitch:</strong> ' +
        UI.esc(UI.formatDateTime(gd.datetime && gd.datetime.dateTime) || 'TBD') + '</div>' +
        '<div><strong>Probable pitchers:</strong> ' +
        UI.esc((gd.teams.away.abbreviation || 'AWY') + ' ' + ((ppAway && ppAway.fullName) || 'TBD')) +
        ' · ' + UI.esc((gd.teams.home.abbreviation || 'HOM') + ' ' + ((ppHome && ppHome.fullName) || 'TBD')) +
        '</div></div>';
      return;
    }

    var battingSide = (ls.isTopInning === true) ? 'away' : 'home';
    var pitchingSide = battingSide === 'away' ? 'home' : 'away';
    var batLine = battingLineFor(feed, batter.id, battingSide);
    var pitchLine = pitchingLineFor(feed, pitcher.id, pitchingSide);
    var lastPlay = (plays.allPlays || [])[(plays.allPlays || []).length - 1];

    el.innerHTML = '' +
      '<div class="atbat">' +
        '<div class="atbat-side">' +
          '<div class="stat-lbl">At Bat</div>' +
          '<div class="atbat-name">' + UI.headshotImg(batter.id, 'headshot', 46) +
            UI.esc(batter.fullName || '—') + '</div>' +
          '<div class="muted">' + UI.esc(batLine
            ? val(batLine.hits) + '-' + val(batLine.atBats) + ' today'
            : ((matchup.batSide && matchup.batSide.description) || '')) + '</div>' +
        '</div>' +
        '<div class="atbat-side">' +
          '<div class="stat-lbl">Pitching</div>' +
          '<div class="atbat-name">' + UI.headshotImg(pitcher.id, 'headshot', 46) +
            UI.esc(pitcher.fullName || '—') + '</div>' +
          '<div class="muted">' + UI.esc(pitchLine
            ? val(pitchLine.inningsPitched) + ' IP · ' + val(pitchLine.strikeOuts) + ' K · ' +
              val(pitchLine.baseOnBalls) + ' BB'
            : ((matchup.pitchHand && matchup.pitchHand.description) || '')) + '</div>' +
        '</div>' +
        '<div class="atbat-side">' +
          '<div class="stat-lbl">Count · Outs</div>' +
          '<div class="count-row">' + UI.countLine(current.count, ls.outs) + '</div>' +
          '<div class="bases-row">' + UI.basesDiamond(basesFrom(ls)) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="live-row">' +
        '<div><strong>On deck:</strong> ' + UI.esc((offense.onDeck && offense.onDeck.fullName) || '—') + '</div>' +
        '<div><strong>In the hole:</strong> ' + UI.esc((offense.inHole && offense.inHole.fullName) || '—') + '</div>' +
        '<div><strong>Runners:</strong> ' + (UI.runnerList(basesFrom(ls)) || 'Bases empty') + '</div>' +
      '</div>' +
      (lastPlay && lastPlay.result
        ? '<div class="last-play"><span class="muted">Last play:</span> ' +
          UI.esc(lastPlay.result.description || '') + '</div>'
        : '') +
      '<div id="live-forecast"></div>';

    var forecastEl = document.getElementById('live-forecast');
    if (forecastEl && batter.id && pitcher.id && status.abstractGameState === 'Live') {
      forecastEl.innerHTML = '<div class="muted">Loading hit forecast…</div>';
      Props.buildForecast(feed).then(function (forecast) {
        forecastEl.innerHTML = forecast ? Props.forecastCard(forecast) : '';
      }).catch(function (err) {
        console.warn('Forecast failed', err);
        forecastEl.innerHTML = '';
      });
    }
  }

  /* -------------------------------------------------------------- linescore */

  function renderLinescore(feed) {
    var el = document.getElementById('linescore-wrap');
    if (!el) return;
    var ls = (feed.liveData && feed.liveData.linescore) || {};
    var innings = Array.isArray(ls.innings) ? ls.innings : [];
    var gd = feed.gameData || {};
    var awayAbbr = (gd.teams && gd.teams.away && gd.teams.away.abbreviation) || 'AWY';
    var homeAbbr = (gd.teams && gd.teams.home && gd.teams.home.abbreviation) || 'HOM';
    var teams = ls.teams || {};
    var awayTotals = teams.away || {};
    var homeTotals = teams.home || {};

    if (!innings.length) {
      el.innerHTML = '<div class="muted">Linescore not available yet.</div>';
      return;
    }

    var head = innings.map(function (i) { return '<th>' + UI.esc(i.num) + '</th>'; }).join('');
    function row(totals, side, abbr) {
      var inningRuns = innings.map(function (i) {
        var s = i[side] || {};
        return typeof s.runs === 'number' ? s.runs : null;
      });
      var cells = inningRuns.map(function (r) {
        return '<td>' + (r === null ? '<span class="muted">·</span>' : r) + '</td>';
      }).join('');
      var totals4 = [totals.runs, totals.hits, totals.errors, totals.leftOnBase];
      var totalCells = totals4.map(function (v, idx) {
        return '<td>' + (idx === 0 ? '<strong>' : '') + (typeof v === 'number' ? v : '') +
          (idx === 0 ? '</strong>' : '') + '</td>';
      }).join('');
      return '<tr><td><strong>' + UI.esc(abbr) + '</strong></td>' + cells + totalCells +
        sourceCell([abbr].concat(inningRuns, totals4)) + '</tr>';
    }

    el.innerHTML = '<div class="panel-title">Linescore</div>' +
      '<div class="scroll-x"><table class="linescore-table">' +
        '<thead><tr><th>Team</th>' + head + '<th>R</th><th>H</th><th>E</th><th>LOB</th>' +
        '<th>Source</th></tr></thead>' +
        '<tbody>' + row(awayTotals, 'away', awayAbbr) + row(homeTotals, 'home', homeAbbr) + '</tbody>' +
      '</table></div>' +
      (ls.currentInning
        ? '<div class="muted linescore-foot">' + UI.esc(UI.inningLabel(ls.currentInningOrdinal ||
            ls.currentInning, ls.inningHalf)) + '</div>'
        : '');
  }

  /* ----------------------------------------------------------- play-by-play */

  function reviewForPlay(feed, play) {
    var list = lastReviews.filter(function (r) {
      return r.atBatIndex === (play.about && play.about.atBatIndex);
    });
    return list;
  }

  function renderPlays(feed) {
    var el = document.getElementById('plays-wrap');
    if (!el) return;
    var plays = (feed.liveData && feed.liveData.plays && feed.liveData.plays.allPlays) || [];
    if (!plays.length) {
      el.innerHTML = '<div class="muted">No plays recorded yet.</div>';
      return;
    }
    var html = plays.slice().reverse().map(function (play) {
      var about = play.about || {};
      var res = play.result || {};
      var reviews = reviewForPlay(feed, play);
      var chips = reviews.map(function (r) {
        return '<span class="chip chip-review">' + UI.esc(r.label) + ' · ' +
          UI.esc(r.outcome) + '</span>';
      }).join(' ');
      var pitches = (play.playEvents || []).filter(function (e) { return e.isPitch; }).length;
      return '<div class="play-item">' +
        '<div class="play-head">' +
          '<span>' + UI.esc(UI.inningLabel(about.inning, about.halfInning)) + ' · ' +
            UI.esc(res.event || '') + (pitches ? ' · ' + pitches + ' pitch' + (pitches === 1 ? '' : 'es') : '') +
          '</span>' +
          '<span>' + UI.esc(val(res.awayScore) + '–' + val(res.homeScore)) + '</span>' +
        '</div>' +
        (chips ? '<div class="chips">' + chips + '</div>' : '') +
        '<div class="play-desc">' + UI.esc(res.description || 'In progress…') + '</div>' +
      '</div>';
    }).join('');
    el.innerHTML = html;
  }

  /* --------------------------------------------------------------- boxscore */

  function battingOrderValue(player) {
    var v = player && player.battingOrder;
    var n = Number(v);
    return Number.isFinite(n) ? n : 9999;
  }

  function boxscoreTeam(feed, side, label) {
    var teams = (feed.liveData && feed.liveData.boxscore && feed.liveData.boxscore.teams) || {};
    var team = teams[side];
    if (!team) return '<div class="muted">' + UI.esc(label) + ' box score not available.</div>';
    var players = team.players || {};
    var batterIds = Array.isArray(team.batters) ? team.batters : [];
    var pitcherIds = Array.isArray(team.pitchers) ? team.pitchers : [];

    var batters = batterIds.map(function (id) { return players['ID' + id]; }).filter(Boolean)
      .sort(function (a, b) { return battingOrderValue(a) - battingOrderValue(b); });

    var batRows = batters.map(function (p) {
      var s = (p.stats && p.stats.batting) || {};
      var order = Number(p.battingOrder);
      var slot = Number.isFinite(order) ? Math.round(order / 100) : '';
      var stats = [s.atBats, s.runs, s.hits, s.rbi, s.baseOnBalls, s.strikeOuts];
      return '<tr>' +
        '<td>' + UI.esc(val(slot)) + '</td>' +
        '<td>' + UI.esc((p.person && p.person.fullName) || '') + '</td>' +
        '<td>' + UI.esc((p.position && p.position.abbreviation) || '') + '</td>' +
        stats.map(function (v) { return '<td>' + UI.esc(val(v)) + '</td>'; }).join('') +
        sourceCell(stats) +
      '</tr>';
    }).join('');

    var pitchRows = pitcherIds.map(function (id) { return players['ID' + id]; }).filter(Boolean)
      .map(function (p) {
        var s = (p.stats && p.stats.pitching) || {};
        var stats = [s.inningsPitched, s.hits, s.runs, s.earnedRuns, s.baseOnBalls, s.strikeOuts];
        return '<tr>' +
          '<td></td>' +
          '<td>' + UI.esc((p.person && p.person.fullName) || '') + '</td>' +
          '<td>' + UI.esc((p.position && p.position.abbreviation) || 'P') + '</td>' +
          '<td>' + UI.esc(val(s.inningsPitched)) + '</td>' +
          [s.hits, s.runs, s.earnedRuns, s.baseOnBalls, s.strikeOuts]
            .map(function (v) { return '<td>' + UI.esc(val(v)) + '</td>'; }).join('') +
          sourceCell(stats) +
        '</tr>';
      }).join('');

    return '<div class="panel-title">' + UI.esc(label) + '</div>' +
      '<div class="scroll-x"><table class="boxscore-table">' +
        '<thead><tr><th>#</th><th>Batter</th><th>Pos</th><th>AB</th><th>R</th><th>H</th>' +
        '<th>RBI</th><th>BB</th><th>SO</th><th>Source</th></tr></thead>' +
        '<tbody>' + (batRows || '<tr><td colspan="10" class="muted">No batting lines yet.</td></tr>') +
        '</tbody></table></div>' +
      '<div class="scroll-x"><table class="boxscore-table pitching-table">' +
        '<thead><tr><th>#</th><th>Pitcher</th><th>Pos</th><th>IP</th><th>H</th>' +
        '<th>R</th><th>ER</th><th>BB</th><th>SO</th><th>Source</th></tr></thead>' +
        '<tbody>' + (pitchRows || '<tr><td colspan="10" class="muted">No pitching lines yet.</td></tr>') +
        '</tbody></table></div>';
  }

  function renderBoxscore(feed) {
    var el = document.getElementById('boxscore-wrap');
    if (!el) return;
    var gd = feed.gameData || {};
    var away = (gd.teams && gd.teams.away && gd.teams.away.name) || 'Away';
    var home = (gd.teams && gd.teams.home && gd.teams.home.name) || 'Home';
    el.innerHTML = boxscoreTeam(feed, 'away', away) + boxscoreTeam(feed, 'home', home);
  }

  /* ---------------------------------------------------------------- reviews */

  function updateReviewState(feed) {
    lastReviews = Reviews.extractGameReviews(feed);
    var badge = document.getElementById('reviews-tab-count');
    if (badge) {
      badge.textContent = String(lastReviews.length);
      badge.style.display = lastReviews.length ? 'inline-block' : 'none';
    }
    var bannerWrap = document.getElementById('live-review-banner-wrap');
    if (!bannerWrap) return;
    var active = lastReviews.filter(function (r) { return r.inProgress; });
    if (!active.length) {
      bannerWrap.innerHTML = '';
      return;
    }
    bannerWrap.innerHTML = '<div class="banner-box">🚨 <strong>Under review:</strong> ' +
      active.map(function (r) {
        return UI.esc(r.label + ' — ' + r.reason +
          (r.runsAtRisk ? ' · ⚠️ ' + r.runsAtRisk + ' run(s) at risk' : ''));
      }).join(' · ') + '</div>';
  }

  function scoreTracker(entry) {
    var before = entry.scoreBefore || {};
    var actual = entry.scoreActual || {};
    var possible = entry.possibleAfter;
    var rows = [
      '<div class="tracker-row"><span class="stat-lbl">Before review</span><span>' +
        UI.esc((before.away === null ? '—' : before.away) + '–' +
          (before.home === null ? '—' : before.home)) + '</span></div>',
    ];
    if (possible) {
      rows.push('<div class="tracker-row"><span class="stat-lbl">Possible after</span><span>' +
        UI.esc(possible.away + '–' + possible.home) + ' <span class="muted">(if the reviewed run(s) come off)</span></span></div>');
    } else if (entry.runsAtRisk) {
      rows.push('<div class="tracker-row"><span class="stat-lbl">Possible after</span><span class="muted">' +
        'score impact pending</span></div>');
    }
    if (actual && (actual.away !== null || actual.home !== null)) {
      rows.push('<div class="tracker-row"><span class="stat-lbl">Actual after</span><span>' +
        UI.esc((actual.away === null ? '—' : actual.away) + '–' +
          (actual.home === null ? '—' : actual.home)) + ' <span class="muted">(official score after the reviewed play)</span></span></div>');
    }
    return '<div class="tracker">' + rows.join('') + '</div>';
  }

  function reviewCard(entry) {
    var challengeBits = [];
    if (entry.challengerAbbr) {
      challengeBits.push(UI.esc(entry.challengerAbbr) + ' ' +
        (entry.category === 'abs' ? 'ABS challenge' : 'challenge'));
    }
    if (entry.pitchCountBefore !== undefined) {
      challengeBits.push('pitch ' + (entry.pitchNumber || '') + ' (after ' +
        entry.pitchCountBefore + ')');
    }
    if (entry.countAfter) {
      challengeBits.push('count after: ' + entry.countAfter.balls + '-' + entry.countAfter.strikes);
    }
    return '<div class="feed-card' + (entry.runsAtRisk ? ' risk' : '') + '">' +
      '<div class="feed-card-head">' +
        '<div><strong>' + UI.esc(entry.label) + '</strong> ' +
          '<span class="muted">· ' + UI.esc(UI.inningLabel(entry.inning, entry.halfInning)) + '</span></div>' +
        '<div>' + (entry.runsAtRisk
          ? '<span class="pill pill-risk">⚠️ ' + entry.runsAtRisk + ' run(s) at risk</span> ' : '') +
          '<span class="pill ' + (entry.inProgress ? 'pill-review' : 'pill-final') + '">' +
          UI.esc(entry.outcome) + '</span></div>' +
      '</div>' +
      '<div>' + UI.esc(entry.description || entry.reason) + '</div>' +
      (challengeBits.length ? '<div class="muted small">' + challengeBits.join(' · ') + '</div>' : '') +
      scoreTracker(entry) +
      (entry.counterLine ? '<div class="muted small">' + UI.esc(entry.counterLine) + '</div>' : '') +
      '</div>';
  }

  function renderReviews(feed) {
    var el = document.getElementById('reviews-wrap');
    if (!el) return;
    var items = lastReviews.slice().sort(function (a, b) {
      return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
    });
    if (!items.length) {
      el.innerHTML = '<div class="muted">No challenges or reviews in this game.</div>';
      return;
    }
    var byCategory = {};
    var overturned = 0;
    var resolved = 0;
    items.forEach(function (i) {
      byCategory[i.category] = (byCategory[i.category] || 0) + 1;
      if (!i.inProgress) {
        resolved += 1;
        if (i.isOverturned) overturned += 1;
      }
    });
    var stats = ['<div class="stat-box"><div class="stat-val">' + items.length + '</div>' +
      '<div class="stat-lbl">Total</div></div>'];
    Object.keys(byCategory).forEach(function (k) {
      stats.push('<div class="stat-box"><div class="stat-val">' + byCategory[k] + '</div>' +
        '<div class="stat-lbl">' + UI.esc(k === 'abs' ? 'ABS Challenges' :
          k === 'challenge' ? 'Challenges' : k === 'boundary' ? 'Boundary Calls' :
          k === 'os_pending' ? 'Scorer Pending' : 'Reviews') + '</div></div>');
    });
    if (resolved) {
      stats.push('<div class="stat-box"><div class="stat-val">' +
        Math.round((overturned / resolved) * 100) + '%</div>' +
        '<div class="stat-lbl">Overturn rate</div></div>');
    }
    el.innerHTML = '<div class="reviews-summary-bar">' + stats.join('') + '</div>' +
      '<div class="feed-list">' + items.map(reviewCard).join('') + '</div>';
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
