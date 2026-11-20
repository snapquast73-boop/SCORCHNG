/* ============================================================================
 * reviews-feed.js — the all-games Replay Feed page (reviews.html).
 *
 * One scan:
 *   1. GET /api/v1/schedule  (hydrate=team,review)   → slate + manager counters
 *   2. for every game that is not Preview:
 *        GET /api/v1.1/game/{gamePk}/feed/live?fields=…
 *      (the `fields` projection keeps the per-game payload small while still
 *       carrying reviewDetails, absChallenges and the play list)
 *   3. parse reviews + pending rulings, diff play snapshots for scoring changes
 *   4. merge into the persistent feed log and re-render
 *
 * Everything shown is read from the official payload. Anything the payload does
 * not support is marked "not observed" / "pending" or surfaced as an
 * irregularity — never inferred.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var LIVE_SCAN_MS = 20000;
  var IDLE_SCAN_MS = 60000;
  var SOUND_COOLDOWN_MS = 2500;

  var FEED_FIELDS = [
    'liveData', 'plays', 'allPlays', 'reviewDetails', 'about', 'atBatIndex', 'inning',
    'halfInning', 'startTime', 'endTime', 'result', 'event', 'eventType', 'description',
    'awayScore', 'homeScore', 'isOut', 'rbi', 'runners', 'details', 'isScoringEvent',
    'playIndex',
    'movementReason', 'matchup', 'batter', 'pitcher', 'fullName', 'id', 'playEvents',
    'count', 'balls', 'strikes', 'outs', 'pitchNumber', 'isPitch', 'gameData', 'game',
    'pk', 'season', 'gameDate', 'scheduledInnings', 'status', 'detailedState',
    'abstractGameState', 'teams', 'away', 'home', 'abbreviation', 'review', 'used',
    'remaining', 'absChallenges', 'usedSuccessful', 'usedFailed', 'linescore',
  ].join(',');

  var currentDate = UI.todayStr();
  var currentTab = 'all';
  var log = null;
  var snapshot = {};
  var scanTimer = null;
  var ticker = null;
  var countdown = 0;
  var scanning = false;
  var latestScan = 0;
  var soundOn = localStorage.getItem('livpbp_sound') === '1';
  var notifyOn = localStorage.getItem('livpbp_notify') === '1';
  var lastChimeAt = 0;
  var seenIds = {};
  var audioCtx = null;
  var registryReady = Promise.resolve();
  // SCORCHNG scoring extensions (Error Watch / Hit → Error / Pitching / Other):
  // batting R/H/RBI observation log + current error/pending/review extraction.
  var scorchLog = null;
  var scorchRows = [];
  var scorchFlags = [];

  function init() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('date')) currentDate = params.get('date');
    // The official status registry supplies review reasons and boundary labels;
    // the first scan waits for it so labels are right from the first render.
    registryReady = MLBAPI.getGameStatusRegistry()
      .then(function (rows) { Reviews.buildStatusMap(rows); })
      .catch(function (err) { console.warn('gameStatus registry unavailable', err); });
    log = FeedLog.loadDate(currentDate, function (merged) {
      log = merged;
      rebuildSeen();
      renderAll();
      // Subscribe to the optional server push only once we know it is there.
      if (FeedLog.isServerAvailable()) attachStream();
    });
    scorchLog = FeedLog.load(currentDate);
    rebuildSeen();
    syncDateUI();
    bindControls();
    renderAll();
    if (FeedLog.isServerAvailable()) attachStream();
    scan();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopTimers();
      else { scan(); }
    });
  }

  function attachStream() {
    FeedLog.subscribe(currentDate, function (incoming) {
      if (incoming.date && incoming.date !== currentDate) return;
      log = FeedLog.mergeLogs(log, incoming);
      rebuildSeen();
      renderAll();
    });
  }

  function stopTimers() {
    if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  function rebuildSeen() {
    seenIds = {};
    (log.entries || []).forEach(function (row) { seenIds[row.id] = true; });
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

  /* -------------------------------------------------------------- controls */

  function bindControls() {
    var soundBtn = document.getElementById('sound-toggle-btn');
    var notifyBtn = document.getElementById('notify-toggle-btn');
    var refreshBtn = document.getElementById('refresh-btn');

    function paintButtons() {
      if (soundBtn) soundBtn.textContent = soundOn ? '🔊 Sound On' : '🔇 Sound Off';
      if (notifyBtn) notifyBtn.textContent = notifyOn ? '🔴 Run Alerts On' : '⚪ Run Alerts Off';
      if (soundBtn) soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
      if (notifyBtn) notifyBtn.setAttribute('aria-pressed', notifyOn ? 'true' : 'false');
    }
    paintButtons();

    if (soundBtn) {
      soundBtn.addEventListener('click', function () {
        soundOn = !soundOn;
        localStorage.setItem('livpbp_sound', soundOn ? '1' : '0');
        if (soundOn) chime(); // user gesture: also unlocks the audio context
        paintButtons();
      });
    }
    if (notifyBtn) {
      notifyBtn.addEventListener('click', function () {
        if (!notifyOn && typeof Notification !== 'undefined' &&
          Notification.permission === 'default') {
          Notification.requestPermission();
        }
        notifyOn = !notifyOn;
        localStorage.setItem('livpbp_notify', notifyOn ? '1' : '0');
        paintButtons();
      });
    }
    if (refreshBtn) refreshBtn.addEventListener('click', function () { scan(); });
  }

  /* ---------------------------------------------------------------- sound */

  /**
   * A gentle synthesized raindrop chime: three soft sine drops blooming into a
   * warm two-note chime with a short echo. Pure WebAudio, no asset, ~1.2 s.
   */
  function chime() {
    if (!soundOn) return;
    var now = Date.now();
    if (now - lastChimeAt < SOUND_COOLDOWN_MS) return;
    lastChimeAt = now;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var ctx = audioCtx;
      var start = ctx.currentTime;
      var drops = [0, 0.06, 0.12];
      drops.forEach(function (offset, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880 + i * 120, start + offset);
        osc.frequency.exponentialRampToValueAtTime(560 + i * 60, start + offset + 0.18);
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.09, start + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start + offset);
        osc.stop(start + offset + 0.4);
      });
      [659.25, 987.77].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        var at = start + 0.28 + i * 0.18;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.12, at + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.75);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.8);
      });
    } catch (err) {
      console.warn('ReplayFeed: chime unavailable', err);
    }
  }

  function notify(title, body) {
    if (!notifyOn) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body: body, tag: 'livpbp-run-risk' });
    } catch (err) {
      console.warn('ReplayFeed: notification failed', err);
    }
  }

  /* ------------------------------------------------------------------ scan */

  function scheduleNextScan(games) {
    if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
    if (ticker) { clearInterval(ticker); ticker = null; }
    var live = (games || []).some(function (g) {
      return g.status && g.status.abstractGameState === 'Live';
    });
    var delay = live ? LIVE_SCAN_MS : IDLE_SCAN_MS;
    countdown = Math.round(delay / 1000);
    paintCountdown();
    ticker = setInterval(function () {
      countdown -= 1;
      paintCountdown();
    }, 1000);
    scanTimer = setTimeout(scan, delay);
  }

  function paintCountdown() {
    var el = document.getElementById('countdown');
    if (el) el.textContent = countdown > 0 ? countdown + 's' : '';
  }

  function scan() {
    if (scanning) return;
    scanning = true;
    var request = (latestScan += 1);
    var dateAtScan = currentDate;
    setStatus('Scanning games for reviews & challenges…');

    registryReady.then(function () {
      return MLBAPI.getSchedule(currentDate, { hydrate: 'team,review,linescore' });
    })
      .then(function (sched) {
        var dates = sched.dates || [];
        var games = dates.length ? (dates[0].games || []) : [];
        var scannable = games.filter(function (g) {
          return g.status && g.status.abstractGameState !== 'Preview';
        });
        return Promise.all(scannable.map(function (g) {
          return MLBAPI.getGameLive(g.gamePk, { fields: FEED_FIELDS })
            .catch(function () { return null; });
        })).then(function (feeds) {
          return { games: games, scannable: scannable, feeds: feeds };
        });
      })
      .then(function (result) {
        if (request !== latestScan || dateAtScan !== currentDate) return;
        process(result);
        scheduleNextScan(result.games);
      })
      .catch(function (err) {
        if (request !== latestScan) return;
        console.error(err);
        setStatus('Error scanning schedule: ' + err.message);
        scheduleNextScan([]);
      })
      .then(function () { scanning = false; });
  }

  function process(result) {
    var collected = [];
    var irregularities = [];
    var snapshotNext = {};
    var ripples = [];
    // SCORCHNG scoring extensions: observe batting R/H/RBI deltas and extract
    // current error plays. First observation is a baseline, never a change.
    if (!scorchLog) scorchLog = FeedLog.load(currentDate);
    var scorchCollected = [];
    var scorchChime = 0;

    result.feeds.forEach(function (feed, idx) {
      if (!feed) return;
      var game = result.scannable[idx];
      var gamePk = String((feed.gameData && feed.gameData.game && feed.gameData.game.pk) ||
        (game && game.gamePk) || idx);
      var reviews = Reviews.extractGameReviews(feed);
      var pending = Reviews.extractPendingRulings(feed);
      collected = collected.concat(reviews, pending);
      // SCORCHNG: R/H/RBI observation + Error Watch extraction (normalized to
      // feed-card shape; official source link on every row).
      try {
        var added = FeedLog.observe(scorchLog, feed);
        scorchChime += added.filter(function (r) { return r.category === 'changes'; }).length;
        Reviews.extract(feed).forEach(function (row) {
          scorchCollected.push(normalizeScorchRow(row, feed));
        });
        added.forEach(function (row) {
          scorchCollected.push(normalizeScorchRow(row, feed));
        });
      } catch (err) {
        console.warn('SCORCHNG scoring extraction failed', err);
      }

      // Scoring changes: diff against the previous observation.
      var snap = Reviews.snapshotPlays(feed);
      var prev = (log.snapshots && log.snapshots[gamePk]) || null;
      if (prev) {
        var diff = Reviews.diffSnapshots(prev, snap);
        collected = collected.concat(diff.changes);
        irregularities = irregularities.concat(diff.irregularities);
      }
      snapshotNext[gamePk] = snap;

      // Counter irregularities (a used counter moving backwards).
      var counters = Reviews.counterSnapshot(feed);
      var prevCounters = (log.grace && log.grace['counters:' + gamePk]) || null;
      if (prevCounters) {
        Reviews.diffCounters(prevCounters, counters).forEach(function (row) {
          row.gamePk = Number(gamePk);
          row.awayAbbr = snap.awayAbbr;
          row.homeAbbr = snap.homeAbbr;
          irregularities.push(row);
        });
      }
      log.grace = log.grace || {};
      log.grace['counters:' + gamePk] = counters;

      reviews.forEach(function (r) {
        if (r.inProgress && r.runsAtRisk > 0) ripples.push(r);
      });
    });

    // New rows trigger the sound / notification, once per row.
    var fresh = collected.filter(function (row) {
      return row && row.id && !seenIds[row.id];
    });
    fresh.forEach(function (row) { seenIds[row.id] = true; });

    var alertable = fresh.filter(function (row) {
      return row.category !== 'abs' && row.category !== 'scoring_change' &&
        row.category !== 'irregularity';
    });
    var riskNow = fresh.filter(function (row) { return row.inProgress && row.runsAtRisk > 0; });
    if (alertable.length || riskNow.length) {
      chime();
      if (riskNow.length) {
        notify('Runs at risk', riskNow.map(function (r) {
          return r.awayAbbr + ' @ ' + r.homeAbbr + ' — ' + r.runsAtRisk + ' run(s) at risk';
        }).join('\n'));
      }
    }

    var merged = FeedLog.mergeLogs(log, {
      v: 1,
      date: currentDate,
      entries: collected,
      snapshots: {},
      irregularities: {},
    });
    merged.snapshots = snapshotNext;
    irregularities.forEach(function (row) {
      if (row && row.id) merged.irregularities[row.id] = row;
    });
    merged.savedAt = Date.now();
    log = FeedLog.saveDate(currentDate, merged);

    // SCORCHNG: persist R/H/RBI observations; chime only for batting changes
    // (hit → error stays silent in its own tab, per charter).
    scorchRows = scorchCollected;
    scorchFlags = (scorchLog.flags || []).slice();
    FeedLog.save(currentDate, scorchLog);
    if (scorchChime) chime();

    renderAll();
    setStatus('Updated ' + new Date().toLocaleTimeString() + ' · Scanned ' +
      result.scannable.length + ' game(s)' +
      (MLBAPI.quietRemainingMs() > 0 ? ' · API asked us to slow down' : ''));
  }

  /** Normalize a SCORCHNG scoring row to the feed-card shape. */
  function normalizeScorchRow(row, feed) {
    var gd = (feed && feed.gameData) || {};
    var teams = gd.teams || {};
    var awayAbbr = (teams.away && teams.away.abbreviation) || 'AWY';
    var homeAbbr = (teams.home && teams.home.abbreviation) || 'HOM';
    var out = {
      id: 'scorch-' + row.id,
      gamePk: row.gamePk,
      awayAbbr: awayAbbr,
      homeAbbr: homeAbbr,
      inning: row.inning,
      halfInning: row.half,
      atBatIndex: row.atBatIndex,
      batter: { id: null, name: row.batter || '' },
      pitcher: { id: null, name: '' },
      category: row.category,
      label: row.category === 'errors' ? 'Error Play'
        : row.category === 'hitError' ? 'Hit → Error'
        : row.category === 'changes' ? 'Scoring Change (R/H/RBI)'
        : row.category === 'pending' ? 'Scoring Pending'
        : row.category === 'reviews' ? 'Review'
        : 'Other Ruling',
      description: row.description || row.message || '',
      reason: row.description || '',
      outcome: row.category === 'pending' ? 'Pending' : (row.event || ''),
      inProgress: row.category === 'pending',
      isOverturned: false,
      runsAtRisk: 0,
      scoringRunners: [],
      scoreBefore: null,
      scoreActual: null,
      possibleAfter: null,
      timestamp: row.observedAt || (gd.gameDate || ''),
      source: row.source || ('https://statsapi.mlb.com/api/v1.1/game/' + row.gamePk + '/feed/live'),
      videoId: row.videoId || null,
      // SCORCHNG-specific detail (rendered by trackerHtml/entryHtml)
      scorchBefore: row.before || null,
      scorchAfter: row.after || null,
      scorchStats: row.stats || null,
      scorchEvent: row.event || null,
      scorchMessage: row.message || null,
      note: (row.category === 'errors' || row.category === 'pending' || row.category === 'hitError')
        ? 'Model chance: Unverified — model unavailable. Current ruling is not proof of the initial call.'
        : '',
    };
    return out;
  }

  /* --------------------------------------------------------------- render */

  function allEntries() {
    var entries = (log.entries || []).slice();
    var irregular = Object.keys(log.irregularities || {}).map(function (k) {
      return log.irregularities[k];
    });
    var scorch = (scorchRows || []).slice();
    // SCORCHNG observed R/H/RBI rows (changes/hitError/other) persist in
    // scorchLog; include them so refresh restores the feed.
    if (scorchLog && Array.isArray(scorchLog.entries)) {
      var seenScorch = {};
      scorch.forEach(function (r) { seenScorch[r.id] = true; });
      scorchLog.entries.forEach(function (r) {
        var key = 'scorch-' + r.id;
        if (seenScorch[key]) return;
        // Rebuild minimal card fields from the stored row (feed context
        // unavailable on restore; game link + source still resolve).
        scorch.push({
          id: key,
          gamePk: r.gamePk,
          awayAbbr: '',
          homeAbbr: '',
          inning: r.inning,
          halfInning: r.half,
          atBatIndex: r.atBatIndex,
          batter: { id: null, name: r.batter || '' },
          pitcher: { id: null, name: '' },
          category: r.category,
          label: r.category === 'hitError' ? 'Hit → Error'
            : r.category === 'changes' ? 'Scoring Change (R/H/RBI)' : 'Other Ruling',
          description: r.description || '',
          reason: r.description || '',
          outcome: r.event || '',
          inProgress: false,
          isOverturned: false,
          runsAtRisk: 0,
          scoringRunners: [],
          scoreBefore: null,
          scoreActual: null,
          possibleAfter: null,
          timestamp: r.observedAt || '',
          source: 'https://statsapi.mlb.com/api/v1.1/game/' + r.gamePk + '/feed/live',
          videoId: null,
          scorchBefore: r.before || null,
          scorchAfter: r.after || null,
          scorchStats: r.stats || null,
          scorchEvent: r.event || null,
          scorchMessage: null,
          note: '',
        });
      });
    }
    return entries.concat(irregular.filter(function (row) {
      return row && row.category === 'irregularity';
    })).concat(scorch);
  }

  function renderAll() {
    renderStats();
    renderTabs();
    renderActiveStrip();
    renderBanner();
    renderFeed();
    var pill = document.getElementById('live-dot');
    if (pill) pill.classList.toggle('stale', MLBAPI.quietRemainingMs() > 0);
  }

  function renderStats() {
    var el = document.getElementById('feed-stats');
    if (!el) return;
    var entries = allEntries().filter(function (e) { return e.category !== 'irregularity'; });
    var nonAbs = entries.filter(function (e) {
      return e.category !== 'abs' && e.category !== 'scoring_change' &&
        e.category !== 'changes' && e.category !== 'errors' &&
        e.category !== 'hitError' && e.category !== 'other' &&
        e.category !== 'pending' && e.category !== 'reviews';
    });
    var abs = entries.filter(function (e) { return e.category === 'abs'; });
    var active = entries.filter(function (e) { return e.inProgress; });
    var risk = entries.filter(function (e) { return e.runsAtRisk > 0; });
    var changes = entries.filter(function (e) {
      return e.category === 'scoring_change' || e.category === 'changes';
    });
    var errors = entries.filter(function (e) { return e.category === 'errors'; });
    var flagged = allEntries().filter(function (e) { return e.category === 'irregularity'; });

    var boxes = [
      ['Reviews & Challenges', nonAbs.length],
      ['ABS Challenges', abs.length],
      ['Under Review', active.length],
      ['Runs at Risk', risk.length],
      ['✏️ Scoring Changes', changes.length],
      ['🎯 Error Plays', errors.length],
      ['Flagged', flagged.length],
    ];
    el.innerHTML = boxes.map(function (b) {
      return '<div class="stat-box"><div class="stat-val">' + b[1] + '</div>' +
        '<div class="stat-lbl">' + UI.esc(b[0]) + '</div></div>';
    }).join('');
  }

  var TABS = [
    { id: 'all', label: 'All' },
    { id: 'abs', label: 'ABS' },
    { id: 'challenge', label: 'Challenges' },
    { id: 'review', label: 'Reviews' },
    { id: 'boundary', label: 'Boundary Calls' },
    { id: 'active', label: 'Under Review' },
    { id: 'risk', label: '⚠️ Runs at Risk' },
    { id: 'scoring_change', label: '✏️ Scoring Changes' },
    { id: 'errors', label: '🎯 Error Watch' },
    { id: 'hitError', label: '📉 Hit → Error' },
    { id: 'pitching', label: '🧮 Pitching Stats' },
    { id: 'other', label: '🗂️ Other Rulings' },
    { id: 'irregularity', label: 'Flagged' },
  ];

  function renderTabs() {
    var el = document.getElementById('feed-tabs');
    if (!el) return;
    el.innerHTML = TABS.map(function (t) {
      return '<button class="tab-btn' + (currentTab === t.id ? ' tab-on' : '') +
        '" data-tab="' + t.id + '">' + UI.esc(t.label) + '</button>';
    }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('.tab-btn'), function (btn) {
      btn.addEventListener('click', function () {
        currentTab = btn.dataset.tab;
        renderTabs();
        renderFeed();
      });
    });
  }

  function renderActiveStrip() {
    var el = document.getElementById('active-strip');
    if (!el) return;
    var active = allEntries().filter(function (e) { return e.inProgress; });
    if (!active.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = '<div class="active-strip">' +
      '<div class="active-strip-head">🚨 Under review now</div>' +
      active.map(function (e) {
        return '<div class="active-row">' +
          '<strong>' + UI.esc(e.awayAbbr) + ' @ ' + UI.esc(e.homeAbbr) + '</strong> · ' +
          UI.esc(UI.inningLabel(e.inning, e.halfInning)) + ' · ' + UI.esc(e.label) +
          (e.countersSummary ? ' <span class="muted">(' + UI.esc(e.countersSummary) + ')</span>' : '') +
          ' · <a href="game.html?gamePk=' + encodeURIComponent(e.gamePk) + '">Open game →</a>' +
        '</div>';
      }).join('') + '</div>';
  }

  function renderBanner() {
    var el = document.getElementById('banner');
    if (!el) return;
    var atRisk = allEntries().filter(function (e) {
      return e.inProgress && e.runsAtRisk > 0;
    });
    if (!atRisk.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = '<div class="banner-box">⚠️ <strong>Runs at risk:</strong> ' +
      atRisk.map(function (e) {
        var bits = [e.awayAbbr + ' @ ' + e.homeAbbr + ' — ' + e.runsAtRisk + ' run(s)'];
        if (e.possibleAfter) {
          bits.push('call stands ' + fmtScore(e.scoreActual) + ', possible ' + fmtScore(e.possibleAfter));
        }
        return UI.esc(bits.join(' · '));
      }).join(' | ') + '</div>';
  }

  function fmtScore(score) {
    if (!score || (score.away === null && score.home === null)) return '—';
    return (score.away === null ? '—' : score.away) + '–' + (score.home === null ? '—' : score.home);
  }

  function matchesTab(e) {
    if (currentTab === 'all') {
      return e.category !== 'abs' && e.category !== 'irregularity';
    }
    if (currentTab === 'active') return e.inProgress === true;
    if (currentTab === 'risk') return e.runsAtRisk > 0;
    if (currentTab === 'irregularity') return e.category === 'irregularity';
    if (currentTab === 'scoring_change') {
      return e.category === 'scoring_change' || e.category === 'changes';
    }
    if (currentTab === 'pitching') {
      // Pitching-only change detection is unavailable (original pipeline absent);
      // the tab explains the gap instead of inventing deltas.
      return false;
    }
    return e.category === currentTab;
  }

  function trackerHtml(e) {
    if (e.category === 'scoring_change') {
      return '<div class="tracker">' +
        '<div class="tracker-row"><span class="stat-lbl">Initial call</span><span>' +
          UI.esc(e.from && e.from.event) + '</span></div>' +
        '<div class="tracker-row"><span class="stat-lbl">Final ruling</span><span>' +
          UI.esc(e.to && e.to.event) + '</span></div>' +
        '<div class="tracker-row"><span class="stat-lbl">Score after play</span><span>' +
          UI.esc(fmtScore(e.scoreActual)) + '</span></div>' +
        '</div>';
    }
    if (e.category === 'changes' || e.category === 'hitError' || e.category === 'other') {
      var rows = [];
      if (e.scorchBefore && e.scorchAfter) {
        rows.push('<div class="tracker-row"><span class="stat-lbl">Observed call</span><span>' +
          UI.esc(e.scorchBefore.event) + '</span></div>');
        rows.push('<div class="tracker-row"><span class="stat-lbl">Latest observed ruling</span><span>' +
          UI.esc(e.scorchAfter.event) + '</span></div>');
      }
      if (e.scorchStats && e.scorchStats.length) {
        rows.push('<div class="tracker-row"><span class="stat-lbl">Batting delta</span><span>' +
          UI.esc(e.scorchStats.map(function (s) {
            return s.name + ' ' + s.stat + ' ' + (s.delta > 0 ? '+' : '') + s.delta;
          }).join(' · ')) + '</span></div>');
      }
      if (e.timestamp) {
        rows.push('<div class="tracker-row"><span class="stat-lbl">Observed</span><span>' +
          UI.esc(e.timestamp) + ' <span class="muted">(browser poll time, not official publication time)</span></span></div>');
      }
      return '<div class="tracker">' + rows.join('') + '</div>';
    }
    if (e.category === 'irregularity') {
      return '<div class="tracker"><div class="tracker-row">' + UI.esc(e.detail || '') + '</div></div>';
    }
    var rows = ['<div class="tracker-row"><span class="stat-lbl">Before review</span><span>' +
      UI.esc(fmtScore(e.scoreBefore)) + '</span></div>'];
    if (e.possibleAfter) {
      rows.push('<div class="tracker-row"><span class="stat-lbl">Possible after</span><span>' +
        UI.esc(fmtScore(e.possibleAfter)) + ' <span class="muted">(if the reviewed run(s) come off)</span></span></div>');
    } else if (e.runsAtRisk) {
      rows.push('<div class="tracker-row"><span class="stat-lbl">Possible after</span>' +
        '<span class="muted">score impact pending</span></div>');
    }
    if (e.scoreActual && (e.scoreActual.away !== null || e.scoreActual.home !== null)) {
      rows.push('<div class="tracker-row"><span class="stat-lbl">Actual after</span><span>' +
        UI.esc(fmtScore(e.scoreActual)) + ' <span class="muted">(official score after the reviewed play)</span></span></div>');
    }
    return '<div class="tracker">' + rows.join('') + '</div>';
  }

  function entryHtml(e) {
    var bits = [];
    if (e.challengerAbbr) {
      bits.push(e.challengerAbbr + ' ' + (e.category === 'abs' ? 'ABS challenge' : 'challenge'));
    }
    if (e.reviewType) bits.push('code ' + e.reviewType);
    if (e.pitchNumber) bits.push('pitch ' + e.pitchNumber + (e.pitchCountBefore ? ' (' + e.pitchCountBefore + ' before)' : ''));
    if (e.countAfter) bits.push('count after ' + e.countAfter.balls + '-' + e.countAfter.strikes);
    if (e.batter && e.batter.name) {
      bits.push(e.batter.name + (e.pitcher && e.pitcher.name ? ' vs ' + e.pitcher.name : ''));
    }
    if (e.scorchEvent) bits.push('event ' + e.scorchEvent);
    var sourceLinks = '';
    if (e.source) {
      sourceLinks = '<div class="muted small"><a href="' + UI.esc(e.source) +
        '" target="_blank" rel="noopener noreferrer">MLB StatsAPI</a>' +
        (e.videoId ? ' · <a href="https://baseballsavant.mlb.com/sporty-videos?playId=' +
          encodeURIComponent(e.videoId) + '" target="_blank" rel="noopener noreferrer">MLB video</a>' : '') +
        '</div>';
    }

    return '<article class="feed-card' + (e.runsAtRisk > 0 ? ' risk' : '') +
      (e.category === 'irregularity' ? ' flagged' : '') + '">' +
      '<div class="feed-card-head">' +
        '<div><strong>' + (e.awayAbbr && e.homeAbbr
          ? UI.esc(e.awayAbbr) + ' @ ' + UI.esc(e.homeAbbr)
          : 'Game ' + UI.esc(e.gamePk === undefined || e.gamePk === null ? '?' : e.gamePk)) + '</strong>' +
          '<span class="muted"> · ' + UI.esc(UI.inningLabel(e.inning, e.halfInning)) + ' · ' +
          UI.esc(e.label || '') + '</span></div>' +
        '<div>' + (e.runsAtRisk > 0
          ? '<span class="pill pill-risk">⚠️ ' + e.runsAtRisk + ' run(s) at risk</span> ' : '') +
          '<span class="pill ' + (e.inProgress ? 'pill-review' : 'pill-final') + '">' +
          UI.esc(e.outcome || e.label || '') + '</span></div>' +
      '</div>' +
      '<div>' + UI.esc(e.description || e.reason || e.scorchMessage || '') + '</div>' +
      (bits.length ? '<div class="muted small">' + UI.esc(bits.join(' · ')) + '</div>' : '') +
      trackerHtml(e) +
      (e.counterLine ? '<div class="counter-line">' + UI.esc(e.counterLine) + '</div>' : '') +
      (e.countersSummary ? '<div class="muted small">' + UI.esc(e.countersSummary) + '</div>' : '') +
      (e.note ? '<div class="muted small">' + UI.esc(e.note) + '</div>' : '') +
      sourceLinks +
      (e.gamePk ? '<div class="muted small"><a href="game.html?gamePk=' +
        encodeURIComponent(e.gamePk) + '">Open Game →</a></div>' : '') +
    '</article>';
  }

  function renderFeed() {
    var el = document.getElementById('feed-list');
    if (!el) return;
    if (currentTab === 'pitching') {
      el.innerHTML = '<div class="empty-state">Pitching-only change detection is unavailable in the recovered upload. ' +
        'Review the official scoring-change list; no pitching deltas are inferred. ' +
        '<a href="scoring.html">Official Scoring Changes →</a></div>';
      return;
    }
    var rows = allEntries().filter(matchesTab).sort(function (a, b) {
      return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
    });
    if (!rows.length) {
      var msg = currentTab === 'errors'
        ? 'No error plays observed for this date. Historical initial calls cannot be recovered from a current feed.'
        : currentTab === 'hitError'
        ? 'No hit → error changes observed between browser polls for this date.'
        : currentTab === 'other'
        ? 'No other rulings observed for this date.'
        : 'No matching review events for this date/filter.';
      el.innerHTML = '<div class="empty-state">' + UI.esc(msg) + '</div>';
      return;
    }
    el.innerHTML = rows.map(entryHtml).join('');
  }

  /* ------------------------------------------------------------ date nav */

  function goToDate(next) {
    currentDate = next;
    log = FeedLog.loadDate(currentDate, function (merged) {
      log = merged;
      rebuildSeen();
      renderAll();
    });
    scorchLog = FeedLog.load(currentDate);
    scorchRows = [];
    scorchFlags = [];
    rebuildSeen();
    syncDateUI();
    renderAll();
    scan();
  }

  function prevDay() { goToDate(UI.shiftDate(currentDate, -1)); }
  function nextDay() { goToDate(UI.shiftDate(currentDate, 1)); }
  function today() { goToDate(UI.todayStr()); }
  function pickDate() {
    var picker = document.getElementById('date-picker');
    if (picker && picker.value) goToDate(picker.value);
  }

  global.ReplayFeed = {
    prevDay: prevDay,
    nextDay: nextDay,
    today: today,
    pickDate: pickDate,
    chime: chime,
  };
  document.addEventListener('DOMContentLoaded', init);
})(window);
