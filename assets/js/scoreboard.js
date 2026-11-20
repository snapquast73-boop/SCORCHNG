/* ============================================================================
 * scoreboard.js — the Scoreboard page (index.html).
 *
 * Reads one hydrated schedule request per refresh:
 *   GET /api/v1/schedule?sportId=1&date=YYYY-MM-DD
 *       &hydrate=team,linescore,probablePitcher,decisions,review,flags
 * and adds a lean status-only sweep while any game is live, so a review that
 * starts between full refreshes still shows up.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var HYDRATE = 'team,linescore,probablePitcher,decisions,review,flags';
  var LIVE_POLL_MS = 20000;      // full hydrated schedule while a game is live
  var IDLE_POLL_MS = 60000;      // nothing live
  var STATUS_SWEEP_MS = 5000;    // lean status-only sweep while live

  var currentDate = UI.todayStr();
  var currentFilter = 'all';
  var games = [];
  var reviewGamePks = {};
  var timer = null;
  var sweepTimer = null;
  var scoringChanges = {};
  var latestRequest = 0;
  var latestSweep = 0;

  function init() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('date')) currentDate = params.get('date');
    syncDateUI();
    loadScoringChanges();
    loadRegistry();
    loadSchedule().then(function () { restartTimers(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause();
      else loadSchedule().then(function () { restartTimers(); });
    });
  }

  /** The official status registry drives review reasons and boundary labels. */
  function loadRegistry() {
    MLBAPI.getGameStatusRegistry()
      .then(function (rows) { Reviews.buildStatusMap(rows); })
      .catch(function (err) { console.warn('gameStatus registry unavailable', err); });
  }

  function pause() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (sweepTimer) { clearTimeout(sweepTimer); sweepTimer = null; }
  }

  function isLive() {
    return games.some(function (g) {
      return g.status && g.status.abstractGameState === 'Live';
    });
  }

  /** Full hydrated schedule poll (independent timer). */
  function schedulePoll(delayMs) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      loadSchedule().then(function () { schedulePoll(isLive() ? LIVE_POLL_MS : IDLE_POLL_MS); });
    }, delayMs);
  }

  /** Lean status sweep for the review ticker (independent timer). */
  function scheduleSweep(delayMs) {
    if (sweepTimer) clearTimeout(sweepTimer);
    if (!isLive()) { sweepTimer = null; return; }
    sweepTimer = setTimeout(function () {
      sweepStatus().then(function () { scheduleSweep(STATUS_SWEEP_MS); });
    }, delayMs);
  }

  function restartTimers() {
    pause();
    schedulePoll(isLive() ? LIVE_POLL_MS : IDLE_POLL_MS);
    scheduleSweep(STATUS_SWEEP_MS);
  }

  function syncDateUI() {
    var picker = document.getElementById('date-picker');
    var label = document.getElementById('date-label');
    if (picker) picker.value = currentDate;
    if (label) label.textContent = UI.formatDateLabel(currentDate);
    var url = new URL(window.location.href);
    url.searchParams.set('date', currentDate);
    try { window.history.replaceState({}, '', url.toString()); } catch (err) { /* ignore */ }
  }

  function setStatus(text) {
    var el = document.getElementById('status-line');
    if (el) el.textContent = text;
  }

  function loadSchedule() {
    var request = (latestRequest += 1);
    var dateAtRequest = currentDate;
    setStatus('Loading MLB schedule…');
    return MLBAPI.getSchedule(currentDate, { hydrate: HYDRATE })
      .then(function (data) {
        if (request !== latestRequest || dateAtRequest !== currentDate) return null;
        var dates = data.dates || [];
        games = dates.length ? (dates[0].games || []) : [];
        indexReviews();
        renderBanner();
        renderTabs();
        renderGames();
        setStatus('Updated ' + new Date().toLocaleTimeString() + ' · ' + games.length +
          ' game(s)' + (MLBAPI.quietRemainingMs() > 0 ? ' · API asked us to slow down' : ''));
      })
      .catch(function (err) {
        if (request !== latestRequest) return;
        console.error(err);
        setStatus('Error loading schedule: ' + err.message);
        renderError(err);
      });
  }

  function indexReviews() {
    reviewGamePks = {};
    games.forEach(function (g) {
      var code = g.status && g.status.statusCode;
      var flagged = g.flags && g.flags.inReview === true;
      if (flagged || (code && Reviews.isReviewStatus(code))) {
        reviewGamePks[g.gamePk] = {
          code: code || '',
          reason: (g.status && g.status.reason) || '',
        };
      }
    });
  }

  /** Lean status sweep: only status fields, so it is a few KB for the slate. */
  function sweepStatus() {
    var request = (latestSweep += 1);
    var dateAtRequest = currentDate;
    return MLBAPI.getScheduleStatus(currentDate).then(function (data) {
      if (request !== latestSweep || dateAtRequest !== currentDate) return;
      var next = {};
      var dates = data.dates || [];
      var list = dates.length ? (dates[0].games || []) : [];
      list.forEach(function (g) {
        var code = g.status && g.status.statusCode;
        var flagged = g.flags && g.flags.inReview === true;
        if (flagged || (code && Reviews.isReviewStatus(code))) {
          next[g.gamePk] = { code: code || '', reason: (g.status && g.status.reason) || '' };
        }
      });
      reviewGamePks = next;
      renderBanner();
      renderGames();
      renderTabs();
    }).catch(function (err) {
      console.warn('Status sweep failed', err);
    });
  }

  function loadScoringChanges() {
    try {
      var log = FeedLog.loadDate(currentDate);
      var counts = {};
      (log.entries || []).forEach(function (row) {
        if (row && row.category === 'scoring_change') {
          counts[row.gamePk] = (counts[row.gamePk] || 0) + 1;
        }
      });
      scoringChanges = counts;
    } catch (err) {
      scoringChanges = {};
    }
  }

  function renderError(err) {
    var el = document.getElementById('game-list');
    if (!el) return;
    el.innerHTML = '<div class="empty-state">Could not reach the MLB StatsAPI (' +
      UI.esc(err.message) + '). This is usually a network/firewall issue; the page retries on ' +
      'the next poll.</div>';
  }

  function renderBanner() {
    var el = document.getElementById('banner');
    if (!el) return;
    var ids = Object.keys(reviewGamePks);
    if (!ids.length) {
      el.innerHTML = '';
      return;
    }
    var parts = ids.map(function (pk) {
      var g = games.filter(function (x) { return String(x.gamePk) === String(pk); })[0];
      var label = g
        ? (g.teams.away.team.abbreviation || 'AWY') + ' @ ' + (g.teams.home.team.abbreviation || 'HOM')
        : ('game ' + pk);
      var reason = reviewGamePks[pk].reason ? ' (' + reviewGamePks[pk].reason + ')' : '';
      return '<a href="game.html?gamePk=' + encodeURIComponent(pk) + '">' + UI.esc(label) + '</a>' +
        UI.esc(reason);
    });
    el.innerHTML = '<div class="banner-box">🚨 <strong>Under review now:</strong> ' +
      parts.join(' · ') + ' · <a href="reviews.html?date=' + encodeURIComponent(currentDate) +
      '">Open Replay Feed →</a></div>';
  }

  function counts() {
    var c = { all: games.length, live: 0, final: 0, preview: 0, review: Object.keys(reviewGamePks).length };
    games.forEach(function (g) {
      var state = (g.status && g.status.abstractGameState) || '';
      if (state === 'Live') c.live += 1;
      else if (state === 'Final') c.final += 1;
      else c.preview += 1;
    });
    return c;
  }

  function renderTabs() {
    var el = document.getElementById('tabs');
    if (!el) return;
    var c = counts();
    var tabs = [
      { id: 'all', label: 'All (' + c.all + ')' },
      { id: 'live', label: 'Live (' + c.live + ')' },
      { id: 'final', label: 'Final (' + c.final + ')' },
      { id: 'preview', label: 'Scheduled (' + c.preview + ')' },
    ];
    if (c.review) tabs.push({ id: 'review', label: '🚨 In Review (' + c.review + ')' });
    el.innerHTML = tabs.map(function (t) {
      return '<button class="tab-btn' + (currentFilter === t.id ? ' tab-on' : '') +
        '" data-filter="' + t.id + '">' + UI.esc(t.label) + '</button>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('.tab-btn'), function (btn) {
      btn.addEventListener('click', function () {
        currentFilter = btn.dataset.filter;
        renderTabs();
        renderGames();
      });
    });
  }

  function passesFilter(g) {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'review') return !!reviewGamePks[g.gamePk];
    var state = (g.status && g.status.abstractGameState) || 'Preview';
    return state.toLowerCase() === currentFilter;
  }

  function decisionLine(decisions) {
    if (!decisions) return '';
    var bits = [];
    if (decisions.winner && decisions.winner.fullName) bits.push('W: ' + decisions.winner.fullName);
    if (decisions.loser && decisions.loser.fullName) bits.push('L: ' + decisions.loser.fullName);
    if (decisions.save && decisions.save.fullName) bits.push('SV: ' + decisions.save.fullName);
    return bits.join(' · ');
  }

  function probableLine(team) {
    var p = team && team.probablePitcher;
    return p && p.fullName ? p.fullName : '';
  }

  function gameCard(g) {
    var away = g.teams.away || {};
    var home = g.teams.home || {};
    var state = (g.status && g.status.abstractGameState) || 'Preview';
    var ls = g.linescore || {};
    var review = reviewGamePks[g.gamePk];
    var pillClass = 'pill-preview';
    var statusText = UI.formatTime(g.gameDate) || (g.status && g.status.detailedState) || '';

    if (state === 'Live') {
      pillClass = 'pill-live';
      var inning = ls.inningState && ls.currentInningOrdinal
        ? ls.inningState + ' ' + ls.currentInningOrdinal
        : (g.status.detailedState || 'Live');
      statusText = inning;
      if (typeof ls.outs === 'number') statusText += ' · ' + ls.outs + ' out' + (ls.outs === 1 ? '' : 's');
    } else if (state === 'Final') {
      pillClass = 'pill-final';
      statusText = (g.status && g.status.detailedState) || 'Final';
    } else if (g.status && g.status.detailedState && g.status.detailedState !== 'Scheduled') {
      statusText = g.status.detailedState;
    }

    var awayScore = typeof away.score === 'number' ? away.score : '';
    var homeScore = typeof home.score === 'number' ? home.score : '';
    var awayRec = away.leagueRecord ? away.leagueRecord.wins + '-' + away.leagueRecord.losses : '';
    var homeRec = home.leagueRecord ? home.leagueRecord.wins + '-' + home.leagueRecord.losses : '';
    var changes = scoringChanges[g.gamePk] || 0;
    var decisions = decisionLine(g.decisions);

    var footBits = [];
    if (decisions) footBits.push(UI.esc(decisions));
    else if (state === 'Preview') {
      var ap = probableLine(away);
      var hp = probableLine(home);
      if (ap || hp) {
        footBits.push('Probables: ' + UI.esc((away.team.abbreviation || 'AWY') + ' ' + (ap || 'TBD') +
          ' · ' + (home.team.abbreviation || 'HOM') + ' ' + (hp || 'TBD')));
      }
    }
    if (changes) {
      footBits.push('<span class="scoring-change-badge">✏️ ' + changes + ' scoring change' +
        (changes === 1 ? '' : 's') + '</span>');
    }

    return '' +
      '<a class="game-card' + (review ? ' in-review' : '') + '" href="game.html?gamePk=' +
        encodeURIComponent(g.gamePk) + '">' +
        '<div class="card-top">' +
          '<span class="pill ' + pillClass + '">' + UI.esc(statusText) + '</span>' +
          (review ? '<span class="pill pill-review">🚨 ' +
            UI.esc(review.reason || 'Review') + '</span>' : '') +
        '</div>' +
        '<div class="team-row">' +
          '<div class="team-info">' + UI.teamLogoImg(away.team && away.team.id, 'team-logo') +
            '<span class="team-name">' + UI.esc((away.team && away.team.name) || 'Away') + '</span>' +
            '<span class="team-record">' + UI.esc(awayRec) + '</span>' +
          '</div>' +
          '<span class="team-score">' + UI.esc(awayScore) + '</span>' +
        '</div>' +
        '<div class="team-row">' +
          '<div class="team-info">' + UI.teamLogoImg(home.team && home.team.id, 'team-logo') +
            '<span class="team-name">' + UI.esc((home.team && home.team.name) || 'Home') + '</span>' +
            '<span class="team-record">' + UI.esc(homeRec) + '</span>' +
          '</div>' +
          '<span class="team-score">' + UI.esc(homeScore) + '</span>' +
        '</div>' +
        '<div class="card-foot"><span>' + UI.esc((g.venue && g.venue.name) || '') + '</span>' +
          '<span>' + (footBits.join(' · ') || 'Open Gameday →') + '</span></div>' +
      '</a>';
  }

  function renderGames() {
    var el = document.getElementById('game-list');
    if (!el) return;
    var filtered = games.filter(passesFilter);
    if (!filtered.length) {
      el.innerHTML = '<div class="empty-state">No games found for this date/filter.</div>';
      return;
    }
    el.innerHTML = filtered.map(gameCard).join('');
  }

  function goToDate(next) {
    currentDate = next;
    syncDateUI();
    loadScoringChanges();
    loadSchedule().then(function () { restartTimers(); });
  }

  function prevDay() { goToDate(UI.shiftDate(currentDate, -1)); }
  function nextDay() { goToDate(UI.shiftDate(currentDate, 1)); }
  function today() { goToDate(UI.todayStr()); }
  function pickDate() {
    var picker = document.getElementById('date-picker');
    if (picker && picker.value) goToDate(picker.value);
  }

  global.Scoreboard = { prevDay: prevDay, nextDay: nextDay, today: today, pickDate: pickDate };
  document.addEventListener('DOMContentLoaded', init);
})(window);
