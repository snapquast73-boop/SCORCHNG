/* ============================================================================
 * feed-log.js — persistence for every tracked Replay-Feed entry.
 *
 * Two layers, both optional and both fail-open:
 *   1. localStorage (always available on GitHub Pages, survives refresh and
 *      later visits; newest seven dates kept, 500 most-recent rows per date).
 *   2. The optional Node persistence server in server.mjs
 *      (POST/GET /api/feed-log + GET /api/feed-log/stream). On static hosting
 *      these requests simply fail and are ignored.
 *
 * The stored envelope matches the server's contract:
 *   { v: 1, date, savedAt, entries, order, snapshots, irregularities,
 *     grace, settled }
 * Anything malformed is dropped with a console warning rather than guessed.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var PREFIX = 'livpbp_feed_log_';
  var MAX_DATES = 7;
  var MAX_ROWS = 500;
  var SAVE_COALESCE_MS = 1000;

  function emptyLog(dateStr) {
    return {
      v: 1,
      date: dateStr,
      savedAt: Date.now(),
      entries: [],
      order: [],
      snapshots: {},
      irregularities: {},
      grace: {},
      settled: [],
    };
  }

  function normalize(payload, dateStr) {
    if (!payload || typeof payload !== 'object') return emptyLog(dateStr);
    var entries = Array.isArray(payload.entries) ? payload.entries.filter(function (row) {
      return row && typeof row === 'object' && typeof row.id === 'string';
    }) : [];
    var seen = {};
    var deduped = [];
    entries.forEach(function (row) {
      if (seen[row.id]) return;
      seen[row.id] = true;
      deduped.push(row);
    });
    deduped.sort(function (a, b) {
      return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
    });
    return {
      v: 1,
      date: dateStr,
      savedAt: typeof payload.savedAt === 'number' ? payload.savedAt : Date.now(),
      entries: deduped.slice(0, MAX_ROWS),
      order: Array.isArray(payload.order) ? payload.order : [],
      snapshots: (payload.snapshots && typeof payload.snapshots === 'object') ? payload.snapshots : {},
      irregularities: (payload.irregularities && typeof payload.irregularities === 'object')
        ? payload.irregularities : {},
      grace: (payload.grace && typeof payload.grace === 'object') ? payload.grace : {},
      settled: Array.isArray(payload.settled) ? payload.settled : [],
    };
  }

  function readLocal(dateStr) {
    try {
      var raw = localStorage.getItem(PREFIX + dateStr);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.entries)) {
        console.warn('FeedLog: malformed log for', dateStr, '— dropped');
        return null;
      }
      return normalize(parsed, dateStr);
    } catch (err) {
      console.warn('FeedLog: failed to parse log for', dateStr, err);
      return null;
    }
  }

  function writeLocal(log) {
    try {
      localStorage.setItem(PREFIX + log.date, JSON.stringify(normalize(log, log.date)));
      pruneOldDates();
      return true;
    } catch (err) {
      console.warn('FeedLog: failed to save log for', log.date, err);
      return false;
    }
  }

  function pruneOldDates() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i += 1) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) keys.push(k);
      }
      keys.sort().reverse();
      keys.slice(MAX_DATES).forEach(function (k) { localStorage.removeItem(k); });
    } catch (err) {
      console.warn('FeedLog: prune failed', err);
    }
  }

  /** Merge two envelopes idempotently (by entry id, newest timestamp wins). */
  function mergeLogs(a, b) {
    var base = normalize(a || {}, (a && a.date) || (b && b.date) || '');
    var incoming = normalize(b || {}, base.date);
    var byId = {};
    base.entries.concat(incoming.entries).forEach(function (row) {
      var prev = byId[row.id];
      if (!prev || String(row.timestamp || '') >= String(prev.timestamp || '')) byId[row.id] = row;
    });
    var merged = emptyLog(base.date);
    merged.entries = Object.keys(byId).map(function (k) { return byId[k]; });
    merged.entries.sort(function (x, y) {
      return String(y.timestamp || '').localeCompare(String(x.timestamp || ''));
    });
    merged.entries = merged.entries.slice(0, MAX_ROWS);
    merged.order = base.order.concat(incoming.order.filter(function (k) {
      return base.order.indexOf(k) === -1;
    }));
    merged.snapshots = Object.assign({}, incoming.snapshots, base.snapshots);
    merged.irregularities = Object.assign({}, incoming.irregularities, base.irregularities);
    merged.grace = Object.assign({}, incoming.grace, base.grace);
    merged.settled = base.settled.concat(incoming.settled.filter(function (k) {
      return base.settled.indexOf(k) === -1;
    }));
    merged.savedAt = Date.now();
    return merged;
  }

  /* ---------------------------------------------------------- server bridge */

  // Same-origin persistence endpoints. On GitHub Pages (static hosting) these
  // 404/throw and are ignored; the localStorage layer keeps working.
  var serverAvailable = null; // null = unknown, true/false after first probe
  var saveTimer = null;
  var pendingLog = null;
  var stream = null;
  var streamDate = null;
  var listeners = [];

  function endpoint(pathname) {
    return pathname;
  }

  function probeServer(dateStr) {
    if (serverAvailable !== null) return Promise.resolve(serverAvailable);
    return fetch(endpoint('/api/feed-log?date=' + encodeURIComponent(dateStr)), {
      headers: { Accept: 'application/json' },
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (payload) {
      serverAvailable = !!(payload && payload.v === 1);
      return payload;
    }).catch(function () {
      serverAvailable = false;
      return null;
    });
  }

  function pushToServer(log) {
    pendingLog = log;
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      var payload = pendingLog;
      pendingLog = null;
      if (!payload || serverAvailable !== true) return;
      fetch(endpoint('/api/feed-log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      }).catch(function () { /* static hosting: ignore */ });
    }, SAVE_COALESCE_MS);
  }

  /**
   * Subscribe to the server's live push. `onUpdate(log)` receives the merged
   * envelope. Returns an unsubscribe function; a no-op on static hosting.
   */
  function subscribe(dateStr, onUpdate) {
    listeners.push(onUpdate);
    if (typeof EventSource === 'undefined') return function () {};
    if (stream && streamDate === dateStr) return function () {};
    if (serverAvailable !== true) return function () {};
    if (stream) { try { stream.close(); } catch (err) { /* ignore */ } }
    streamDate = dateStr;
    try {
      stream = new EventSource(endpoint('/api/feed-log/stream?date=' + encodeURIComponent(dateStr)));
      stream.addEventListener('feed-log', function (ev) {
        try {
          var log = normalize(JSON.parse(ev.data), dateStr);
          listeners.forEach(function (fn) { fn(log); });
        } catch (err) {
          console.warn('FeedLog: bad stream frame dropped', err);
        }
      });
      stream.addEventListener('error', function () {
        // EventSource reconnects on its own (server sends retry: 3000).
      });
    } catch (err) {
      console.warn('FeedLog: EventSource unavailable', err);
    }
    return function () {
      if (stream) { try { stream.close(); } catch (err) { /* ignore */ } }
      stream = null;
      streamDate = null;
    };
  }

  /* ---------------------------------------------------------------- public */

  /**
   * Load a date's log. Local first (fast, always available), then the server
   * (asynchronous merge, when one is running).
   */
  function loadDate(dateStr, onMerged) {
    var local = readLocal(dateStr) || emptyLog(dateStr);
    probeServer(dateStr).then(function (remote) {
      if (!remote) {
        if (typeof onMerged === 'function') onMerged(local);
        return;
      }
      var merged = mergeLogs(local, remote);
      writeLocal(merged);
      if (typeof onMerged === 'function') onMerged(merged);
    });
    return local;
  }

  function saveDate(dateStr, log) {
    var envelope = normalize(log, dateStr);
    envelope.savedAt = Date.now();
    writeLocal(envelope);
    pushToServer(envelope);
    return envelope;
  }

  /* ------------------------------------------------- SCORCHNG compat layer */
  // Error Watch / Hit → Error / Pitching / Other tabs observe batting R/H/RBI
  // deltas between browser polls. Stored separately under the SCORCHNG
  // namespace so existing browser observations are preserved. First
  // observation is a baseline, never an invented change.
  var SCORCH_PREFIX = 'mlbScoringChange.restored.v1.';

  function scorchFresh() {
    return { snapshots: {}, entries: [], flags: [] };
  }

  function scorchLoad(date) {
    try {
      var text = localStorage.getItem(SCORCH_PREFIX + date);
      if (!text) return scorchFresh();
      var data = JSON.parse(text);
      if (!data || !Array.isArray(data.entries) || !Array.isArray(data.flags) ||
          !data.snapshots || typeof data.snapshots !== 'object') {
        throw new Error('Invalid saved log');
      }
      function validId(id) { return /^\d+$/.test(String(id)); }
      var entries = data.entries.filter(function (r) {
        return r && validId(r.gamePk) &&
          ['changes', 'hitError', 'other'].indexOf(r.category) !== -1 &&
          r.before && r.after && Array.isArray(r.stats) &&
          r.stats.every(function (s) {
            return s && typeof s.stat === 'string' && Number.isFinite(s.delta);
          });
      });
      var flags = data.flags.filter(function (r) {
        return r && validId(r.gamePk) && typeof r.message === 'string';
      });
      var snapshots = {};
      Object.keys(data.snapshots).forEach(function (key) {
        var s = data.snapshots[key];
        if (!/^\d+:\d+$/.test(key) || !s || typeof s !== 'object' || Array.isArray(s)) return;
        if (!s.runners || typeof s.runners !== 'object' || Array.isArray(s.runners)) return;
        var ok = Object.keys(s.runners).every(function (k) {
          var r = s.runners[k];
          return r && typeof r.scored === 'boolean';
        });
        if (ok) snapshots[key] = s;
      });
      if (entries.length !== data.entries.length ||
          flags.length !== data.flags.length ||
          Object.keys(snapshots).length !== Object.keys(data.snapshots).length) {
        FeedLog.warning = 'Malformed saved rows were dropped; retained observations are not a complete archive.';
      }
      return { entries: entries, flags: flags, snapshots: snapshots };
    } catch (e) {
      FeedLog.warning = 'Saved browser log could not be read; this visit starts a new baseline.';
      if (typeof console !== 'undefined' && console.warn) console.warn(e);
      return scorchFresh();
    }
  }

  function scorchSave(date, data) {
    data.entries = data.entries.slice(-500);
    data.flags = data.flags.slice(-100);
    try {
      localStorage.setItem(SCORCH_PREFIX + date, JSON.stringify(data));
      var keys = [];
      for (var i = 0; i < localStorage.length; i += 1) {
        var k = localStorage.key(i);
        if (k && k.indexOf(SCORCH_PREFIX) === 0) keys.push(k);
      }
      keys.sort().reverse().slice(7).forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {
      FeedLog.warning = 'Browser storage is unavailable or full. Observations are not persisted.';
      if (typeof console !== 'undefined' && console.warn) console.warn(e);
    }
  }

  function scorchObserve(data, feed) {
    var added = [];
    var plays = (feed.liveData && feed.liveData.plays && feed.liveData.plays.allPlays) || [];
    plays.forEach(function (p) {
      var about = p.about || {};
      if (!about.isComplete || about.atBatIndex === null || about.atBatIndex === undefined) return;
      var key = feed.gamePk + ':' + about.atBatIndex;
      var after = Reviews.snapshot(p);
      var before = data.snapshots[key];
      if (before) {
        var stats = Reviews.delta(before, after);
        if (before.event !== after.event || stats.length) {
          var row = {
            id: key + ':' + Date.now(),
            gamePk: feed.gamePk,
            atBatIndex: about.atBatIndex,
            inning: about.inning,
            half: about.halfInning,
            batter: p.matchup && p.matchup.batter ? p.matchup.batter.fullName : undefined,
            category: Reviews.category(before, after, stats),
            before: before,
            after: after,
            stats: stats,
            event: p.result ? p.result.event : undefined,
            description: p.result ? p.result.description : undefined,
            observedAt: new Date().toISOString(),
          };
          data.entries.push(row);
          added.push(row);
        } else if (before.description !== after.description ||
                   before.awayScore !== after.awayScore ||
                   before.homeScore !== after.homeScore ||
                   before.error !== after.error) {
          data.flags.push({
            gamePk: feed.gamePk,
            atBatIndex: about.atBatIndex,
            message: 'Payload edited without an attributable batting-stat delta. Review official source; no delta inferred.',
            observedAt: new Date().toISOString(),
          });
        }
      }
      data.snapshots[key] = after;
    });
    return added;
  }

  global.FeedLog = {
    loadDate: loadDate,
    saveDate: saveDate,
    mergeLogs: mergeLogs,
    normalize: normalize,
    subscribe: subscribe,
    probeServer: probeServer,
    isServerAvailable: function () { return serverAvailable === true; },
    PREFIX: PREFIX,
    MAX_ROWS: MAX_ROWS,
    MAX_DATES: MAX_DATES,
    // SCORCHNG compat (Error Watch / Hit → Error / R/H/RBI observation)
    load: scorchLoad,
    save: scorchSave,
    observe: scorchObserve,
    warning: '',
  };
})(window);
