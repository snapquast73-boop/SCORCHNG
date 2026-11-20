/* ============================================================================
 * api.js — MLB StatsAPI client.
 *
 * Every endpoint used here was verified against the live public API
 * (statsapi.mlb.com) on 2026-11-20; the request/response shapes and the source
 * links are recorded in docs/verification-report.md.
 *
 * The API is keyless and sends CORS headers, so a static GitHub Pages site can
 * call it directly from the browser. See docs/api-compliance.md for the terms
 * this client is written to respect.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var BASE_V1 = 'https://statsapi.mlb.com/api/v1';
  var BASE_V11 = 'https://statsapi.mlb.com/api/v1.1';
  var SPORT_ID = 1;
  var DEFAULT_TIMEOUT_MS = 15000;
  var DEFAULT_QUIET_MS = 60000;

  // Set when the API answers HTTP 429. While a quiet period is in effect no
  // request is issued at all, so a host that asked us to slow down never sees
  // a retry storm from this page.
  var quietUntil = 0;
  var memo = new Map();

  function now() {
    return Date.now();
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function quietRemainingMs() {
    return Math.max(0, quietUntil - now());
  }

  /**
   * fetch + parse JSON with a hard timeout, one retry, and 429 backoff.
   * Optional `cacheKey`/`ttl` memoize a response in memory for `ttl` ms
   * (used for the game-status registry and player season stats).
   */
  async function request(url, options) {
    var opts = options || {};
    var timeout = opts.timeout || DEFAULT_TIMEOUT_MS;
    var retries = opts.retries === undefined ? 1 : opts.retries;
    var cacheKey = opts.cacheKey || null;
    var ttl = opts.ttl || 0;

    if (cacheKey && ttl) {
      var hit = memo.get(cacheKey);
      if (hit && now() - hit.at < ttl) return hit.value;
    }
    if (quietRemainingMs() > 0) {
      throw new Error('StatsAPI quiet period after HTTP 429 (' +
        Math.ceil(quietRemainingMs() / 1000) + 's left)');
    }

    var attempt = 0;
    var lastError = null;
    while (attempt <= retries) {
      attempt += 1;
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, timeout) : null;
      try {
        var res = await fetch(url, {
          mode: 'cors',
          cache: 'no-store',
          signal: controller ? controller.signal : undefined,
        });

        if (res.status === 429) {
          var retryAfter = Number(res.headers.get('Retry-After'));
          var waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(Math.max(retryAfter * 1000, 1000), 300000)
            : DEFAULT_QUIET_MS;
          quietUntil = now() + waitMs;
          throw new Error('StatsAPI rate limited (HTTP 429); quiet for ' +
            Math.round(waitMs / 1000) + 's');
        }
        if (!res.ok) {
          throw new Error('StatsAPI ' + res.status + ' for ' + url);
        }

        var value = await res.json();
        if (cacheKey) memo.set(cacheKey, { at: now(), value: value });
        return value;
      } catch (err) {
        lastError = err;
        if (quietRemainingMs() > 0) break;
        if (attempt > retries) break;
        await sleep(350 * attempt);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    throw lastError || new Error('StatsAPI request failed for ' + url);
  }

  function getSchedule(dateStr, options) {
    var opts = options || {};
    var params = ['sportId=' + SPORT_ID, 'date=' + encodeURIComponent(dateStr)];
    if (opts.hydrate) params.push('hydrate=' + encodeURIComponent(opts.hydrate));
    if (opts.fields) params.push('fields=' + encodeURIComponent(opts.fields));
    return request(BASE_V1 + '/schedule?' + params.join('&'), opts);
  }

  /**
   * Lean "is anything under review?" sweep for a whole slate.
   * Verified `fields` projection — no hydrations, status only.
   */
  function getScheduleStatus(dateStr) {
    return request(BASE_V1 + '/schedule?sportId=' + SPORT_ID +
      '&date=' + encodeURIComponent(dateStr) +
      '&fields=' + encodeURIComponent(
        'dates,games,gamePk,status,abstractGameState,codedGameState,detailedState,' +
        'statusCode,reason,startTimeTBD,abstractGameCode,teams,away,home,team,id,abbreviation'
      ), { retries: 0, timeout: 10000 });
  }

  function getGameLive(gamePk, options) {
    var opts = options || {};
    var qs = opts.fields ? '?fields=' + encodeURIComponent(opts.fields) : '';
    return request(BASE_V11 + '/game/' + encodeURIComponent(gamePk) + '/feed/live' + qs, opts);
  }

  function getPlayByPlay(gamePk, options) {
    var opts = options || {};
    var qs = opts.fields ? '?fields=' + encodeURIComponent(opts.fields) : '';
    return request(BASE_V1 + '/game/' + encodeURIComponent(gamePk) + '/playByPlay' + qs, opts);
  }

  function getBoxscore(gamePk, options) {
    return request(BASE_V1 + '/game/' + encodeURIComponent(gamePk) + '/boxscore', options || {});
  }

  function getLinescore(gamePk, options) {
    return request(BASE_V1 + '/game/' + encodeURIComponent(gamePk) + '/linescore', options || {});
  }

  /** Official game-status registry: source of every review statusCode + reason. */
  function getGameStatusRegistry() {
    return request(BASE_V1 + '/gameStatus', {
      cacheKey: 'gameStatus',
      ttl: 24 * 60 * 60 * 1000,
      timeout: 20000,
    });
  }

  /** Official event-type registry (used to confirm ABS / scoring-pending codes). */
  function getEventTypes() {
    return request(BASE_V1 + '/eventTypes', {
      cacheKey: 'eventTypes',
      ttl: 24 * 60 * 60 * 1000,
      timeout: 20000,
    });
  }

  function getPlayerStats(playerId, group, season, stats, sitCodes) {
    var params = [
      'stats=' + encodeURIComponent(stats || 'season'),
      'group=' + encodeURIComponent(group || 'hitting'),
      'season=' + encodeURIComponent(season),
    ];
    if (sitCodes) params.push('sitCodes=' + encodeURIComponent(sitCodes));
    params.push('fields=' + encodeURIComponent(
      'stats,type,displayName,group,splits,season,stat,split,code,description,' +
      'avg,atBats,hits,homeRuns,rbi,baseOnBalls,strikeOuts,plateAppearances,obp,slg,ops,' +
      'gamesPlayed,date,isHome,hitsPerNine,avg,inningsPitched,era,game'
    ));
    var url = BASE_V1 + '/people/' + encodeURIComponent(playerId) + '/stats?' + params.join('&');
    return request(url, {
      cacheKey: 'stats:' + playerId + ':' + (group || 'hitting') + ':' + season + ':' + (stats || 'season') + ':' + (sitCodes || ''),
      ttl: 10 * 60 * 1000,
      timeout: 15000,
    });
  }

  function getVsPlayer(batterId, pitcherId, season) {
    var url = BASE_V1 + '/people/' + encodeURIComponent(batterId) +
      '/stats?stats=vsPlayer&group=hitting&opposingPlayerId=' + encodeURIComponent(pitcherId) +
      '&season=' + encodeURIComponent(season) +
      '&fields=' + encodeURIComponent('stats,type,displayName,splits,season,stat,avg,atBats,hits,homeRuns,strikeOuts');
    return request(url, {
      cacheKey: 'vs:' + batterId + ':' + pitcherId + ':' + season,
      ttl: 30 * 60 * 1000,
      timeout: 15000,
    });
  }

  /** Season of a game date (the API scopes archived games to their own season). */
  function seasonOf(dateStr) {
    var year = Number(String(dateStr || '').slice(0, 4));
    return Number.isFinite(year) && year > 1900 ? year : new Date().getFullYear();
  }

  global.MLBAPI = {
    BASE_V1: BASE_V1,
    BASE_V11: BASE_V11,
    SPORT_ID: SPORT_ID,
    request: request,
    getSchedule: getSchedule,
    getScheduleStatus: getScheduleStatus,
    getGameLive: getGameLive,
    getPlayByPlay: getPlayByPlay,
    getBoxscore: getBoxscore,
    getLinescore: getLinescore,
    getGameStatusRegistry: getGameStatusRegistry,
    getEventTypes: getEventTypes,
    getPlayerStats: getPlayerStats,
    getVsPlayer: getVsPlayer,
    seasonOf: seasonOf,
    quietRemainingMs: quietRemainingMs,
  };

  /* ------------------------------------------------- SCORCHNG compat layer */
  // The scoring-changes pages (scoring-page.js) and the Error Watch / Hit →
  // Error / Pitching / Other tabs use this small promise-based surface. It is
  // a thin wrapper over the same verified endpoints above — no new endpoints,
  // no proxy, no credentials. Missing values remain missing.
  var BASE = 'https://statsapi.mlb.com';

  function json(url) {
    return request(url, { retries: 0, timeout: 25000 }).then(function (value) {
      return value;
    });
  }

  var API = {
    BASE: BASE,
    json: json,
    scheduleURL: function (date) {
      return BASE + '/api/v1/schedule?sportId=1&date=' + encodeURIComponent(date) +
        '&hydrate=linescore';
    },
    gameURL: function (id) {
      return BASE + '/api/v1.1/game/' + encodeURIComponent(id) + '/feed/live';
    },
    gameday: function (id) {
      return 'https://www.mlb.com/gameday/' + encodeURIComponent(id);
    },
    schedule: function (date) {
      return getSchedule(date, { hydrate: 'linescore' }).then(function (data) {
        if (!Array.isArray(data.dates)) throw new Error('Schedule response has no dates array');
        return data.dates.reduce(function (acc, d) {
          return acc.concat(d.games || []);
        }, []);
      });
    },
    game: function (id) {
      if (!/^\d+$/.test(String(id))) throw new Error('Invalid game ID');
      return getGameLive(id).then(function (data) {
        if (!data.gameData || !data.liveData) throw new Error('Game feed is not yet available');
        return data;
      });
    },
    pool: function (items, fn, size) {
      var limit = size || 4;
      var results = new Array(items.length);
      var next = 0;
      var workers = [];
      var n = Math.min(limit, items.length);
      for (var w = 0; w < n; w += 1) {
        workers.push((function () {
          function step() {
            if (next >= items.length) return Promise.resolve();
            var i = next;
            next += 1;
            return Promise.resolve().then(function () { return fn(items[i]); }).then(
              function (value) { results[i] = { value: value }; },
              function (error) { results[i] = { error: error.message }; }
            ).then(step);
          }
          return step();
        })());
      }
      return Promise.all(workers).then(function () { return results; });
    },
  };

  global.API = API;
})(window);
