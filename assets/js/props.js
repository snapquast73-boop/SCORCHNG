/* ============================================================================
 * props.js — transparent two-sided hit forecast + Props & Matchup tab.
 *
 * The number is a per-plate-appearance ESTIMATE, not an MLB projection and not
 * a betting line. It compounds the batter's and pitcher's season rates in
 * log-odds space (a generalized log5, Bill James's odds-ratio method), then
 * adds platoon, recent-form, head-to-head, same-game familiarity and count
 * adjustments. Every driver is exposed as a point adjustment so the number can
 * be audited instead of trusted.
 *
 * Inputs all come from verified StatsAPI endpoints:
 *   /api/v1/people/{id}/stats?stats=season,statSplits,gameLog&group=hitting|pitching
 *   /api/v1/people/{batterId}/stats?stats=vsPlayer&opposingPlayerId={pitcherId}
 * (see docs/verification-report.md §4).
 * ==========================================================================*/
(function (global) {
  'use strict';

  var LEAGUE = 0.245;          // league hit rate per plate appearance anchor
  var REGRESS_BATTER = 60;     // AB of regression toward the league anchor
  var REGRESS_PITCHER = 90;    // opponent-AB of regression
  var MAX_LOGITS = 1.9;        // total evidence cap from the league prior
  var CLAMP = [0.13, 0.62];
  var CLAMP_WITH_COUNT = [0.10, 0.78];

  // Empirically anchored count factors, applied in odds space. Walks are not
  // hits, so 3-ball counts deliberately do not carry the walk's value.
  var COUNT_FACTORS = {
    '0-0': 1.0, '0-1': 0.82, '0-2': 0.55,
    '1-0': 1.08, '1-1': 0.90, '1-2': 0.62,
    '2-0': 1.16, '2-1': 0.98, '2-2': 0.72,
    '3-0': 1.20, '3-1': 1.14, '3-2': 0.86,
  };

  function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  }

  function toRate(hits, atBats) {
    if (!Number.isFinite(hits) || !Number.isFinite(atBats) || atBats <= 0) return null;
    return hits / atBats;
  }

  function regress(rate, sample, k) {
    if (!Number.isFinite(rate) || !Number.isFinite(sample) || sample <= 0) return LEAGUE;
    return (rate * sample + LEAGUE * k) / (sample + k);
  }

  function logit(p) {
    var x = clamp(p, 0.0001, 0.9999);
    return Math.log(x / (1 - x));
  }

  function invLogit(x) {
    return 1 / (1 + Math.exp(-x));
  }

  /** Bill James generalized log5 for batter-vs-pitcher hit rates. */
  function log5(batterRate, pitcherRate, league) {
    var L = Number.isFinite(league) ? league : LEAGUE;
    var b = clamp(Number.isFinite(batterRate) ? batterRate : L, 0.01, 0.99);
    var p = clamp(Number.isFinite(pitcherRate) ? pitcherRate : L, 0.01, 0.99);
    var num = (b * p) / L;
    var den = num + ((1 - b) * (1 - p)) / (1 - L);
    return den > 0 ? num / den : L;
  }

  function tierFor(p) {
    if (p >= 0.36) return 'Elite matchup';
    if (p >= 0.30) return 'Favorable';
    if (p >= 0.235) return 'Neutral';
    if (p >= 0.18) return 'Tough';
    return "Pitcher's edge";
  }

  function countKey(count) {
    if (!count || !Number.isFinite(count.balls) || !Number.isFinite(count.strikes)) return null;
    var key = count.balls + '-' + count.strikes;
    return COUNT_FACTORS[key] ? key : null;
  }

  function seasonRateFromSplits(statsPayload, group) {
    var stats = (statsPayload && statsPayload.stats) || [];
    for (var i = 0; i < stats.length; i += 1) {
      var type = (stats[i].type && stats[i].type.displayName) || '';
      if (type !== 'season') continue;
      var split = (stats[i].splits || [])[0];
      var st = (split && split.stat) || {};
      if (group === 'pitching') {
        return {
          rate: toRate(Number(st.hits), Number(st.atBats)),
          atBats: Number(st.atBats) || 0,
          era: st.era,
          raw: st,
        };
      }
      return {
        rate: toRate(Number(st.hits), Number(st.atBats)),
        atBats: Number(st.atBats) || 0,
        avg: st.avg,
        ops: st.ops,
        raw: st,
      };
    }
    return { rate: null, atBats: 0 };
  }

  function platoonFromSplits(statsPayload, code) {
    var stats = (statsPayload && statsPayload.stats) || [];
    for (var i = 0; i < stats.length; i += 1) {
      var type = (stats[i].type && stats[i].type.displayName) || '';
      if (type !== 'statSplits') continue;
      var splits = stats[i].splits || [];
      for (var j = 0; j < splits.length; j += 1) {
        var split = splits[j];
        var sc = (split.split && split.split.code) || '';
        if (code && sc !== code) continue;
        var st = split.stat || {};
        return { rate: toRate(Number(st.hits), Number(st.atBats)), atBats: Number(st.atBats) || 0 };
      }
    }
    return null;
  }

  function formFromGameLog(statsPayload, beforeDate, windowSize) {
    var stats = (statsPayload && statsPayload.stats) || [];
    var n = windowSize || 8;
    for (var i = 0; i < stats.length; i += 1) {
      var type = (stats[i].type && stats[i].type.displayName) || '';
      if (type !== 'gameLog') continue;
      var games = (stats[i].splits || []).filter(function (g) {
        var d = g && g.date;
        return !beforeDate || !d || d < beforeDate; // never leak the modeled game
      });
      var recent = games.slice(-n);
      var hits = 0;
      var ab = 0;
      recent.forEach(function (g) {
        var st = g.stat || {};
        hits += Number(st.hits) || 0;
        ab += Number(st.atBats) || 0;
      });
      return { rate: toRate(hits, ab), atBats: ab, games: recent.length };
    }
    return null;
  }

  /**
   * The model. All inputs are optional; anything missing falls back to the
   * league anchor and is reported in `notes` so the UI can label the fallback.
   */
  function compute(input) {
    var inp = input || {};
    var notes = [];
    var batter = inp.batter || {};
    var pitcher = inp.pitcher || {};

    var batterRate = Number.isFinite(batter.rate) ? batter.rate : null;
    var pitcherRate = Number.isFinite(pitcher.rate) ? pitcher.rate : null;
    if (batterRate === null) notes.push('Batter season input missing — league baseline used for that side.');
    if (pitcherRate === null) notes.push('Pitcher season input missing — league baseline used for that side.');

    var bAdj = regress(batterRate === null ? LEAGUE : batterRate, batter.atBats || 0, REGRESS_BATTER);
    var pAdj = regress(pitcherRate === null ? LEAGUE : pitcherRate, pitcher.atBats || 0, REGRESS_PITCHER);

    var base = log5(bAdj, pAdj);
    var logitPrior = logit(LEAGUE);
    var evidence = logit(base) - logitPrior;

    var drivers = [{
      key: 'season',
      label: 'Season',
      points: (base - LEAGUE) * 100,
    }];

    // Platoon: a shrunken differential against the player's own season rate.
    var platoonDelta = 0;
    if (batter.platoon && Number.isFinite(batter.platoon.rate) && batterRate !== null) {
      var wB = batter.platoon.atBats / (batter.platoon.atBats + 80);
      platoonDelta += (batter.platoon.rate - batterRate) * wB;
    }
    if (pitcher.platoon && Number.isFinite(pitcher.platoon.rate) && pitcherRate !== null) {
      var wP = pitcher.platoon.atBats / (pitcher.platoon.atBats + 80);
      platoonDelta -= (pitcher.platoon.rate - pitcherRate) * wP;
    }
    if (!batter.platoon && !pitcher.platoon) {
      platoonDelta = 0.004 * (inp.handednessAdvantage === true ? 1 : (inp.handednessAdvantage === false ? -1 : 0));
      if (inp.handednessAdvantage === undefined) notes.push('No platoon split data — no platoon adjustment applied.');
    }
    evidence += logit(clamp(LEAGUE + platoonDelta, 0.05, 0.6)) - logitPrior;
    drivers.push({ key: 'platoon', label: 'Platoon', points: platoonDelta * 100 });

    // Recent form (last ~8 games strictly before the modeled date).
    var formDelta = 0;
    if (batter.form && Number.isFinite(batter.form.rate) && batter.form.atBats >= 8) {
      formDelta = (batter.form.rate - (batterRate === null ? LEAGUE : batterRate)) * 0.35;
      formDelta = clamp(formDelta, -0.045, 0.045);
    }
    evidence += logit(clamp(LEAGUE + formDelta, 0.05, 0.6)) - logitPrior;
    drivers.push({ key: 'form', label: 'Recent form', points: formDelta * 100 });

    // Career head-to-head: bounded but real.
    var h2hDelta = 0;
    if (batter.vsPitcher && Number.isFinite(batter.vsPitcher.rate) && batter.vsPitcher.atBats >= 5) {
      h2hDelta = clamp((batter.vsPitcher.rate - LEAGUE) * 0.28, -0.055, 0.055);
    }
    evidence += logit(clamp(LEAGUE + h2hDelta, 0.05, 0.6)) - logitPrior;
    drivers.push({ key: 'history', label: 'Head-to-head', points: h2hDelta * 100 });

    // Same-game familiarity: times through the order.
    var looks = Number.isFinite(inp.priorLooksAtPitcher) ? inp.priorLooksAtPitcher : 0;
    var familiar = 0.0075 * clamp(looks, 0, 2);
    evidence += logit(clamp(LEAGUE + familiar, 0.05, 0.6)) - logitPrior;
    if (looks > 0) drivers.push({ key: 'familiarity', label: 'Familiarity', points: familiar * 100 });

    evidence = clamp(evidence, -MAX_LOGITS, MAX_LOGITS);
    var perPA = invLogit(logitPrior + evidence);

    // Live count: applied in odds space after the season evidence.
    var ck = countKey(inp.count);
    var countFactor = 1;
    if (ck) {
      countFactor = COUNT_FACTORS[ck];
      var odds = perPA / (1 - perPA);
      perPA = odds * countFactor / (1 + odds * countFactor);
      drivers.push({ key: 'count', label: 'Count ' + ck, points: (perPA - invLogit(logitPrior + evidence)) * 100 });
    }

    var band = ck ? CLAMP_WITH_COUNT : CLAMP;
    perPA = clamp(perPA, band[0], band[1]);

    var remaining = Number.isFinite(inp.remainingPAs) ? Math.max(0, inp.remainingPAs) : 0;
    var atLeastOne = remaining > 0 ? 1 - Math.pow(1 - perPA, remaining) : 0;

    return {
      perPA: perPA,
      atLeastOne: atLeastOne,
      remainingPAs: remaining,
      tier: tierFor(perPA),
      drivers: drivers.map(function (d) {
        return { key: d.key, label: d.label, points: d.points };
      }),
      notes: notes,
      inputs: {
        batterRate: batterRate,
        pitcherRate: pitcherRate,
        regressedBatter: bAdj,
        regressedPitcher: pAdj,
        countKey: ck,
        countFactor: countFactor,
      },
    };
  }

  /* ------------------------------------------------------- live stat loading */

  var ctxCache = new Map();

  function sideCode(feed, playerId) {
    var players = (feed && feed.gameData && feed.gameData.players) || {};
    var p = players['ID' + playerId];
    return {
      bat: p && p.batSide && p.batSide.code ? p.batSide.code : null,
      pitch: p && p.pitchHand && p.pitchHand.code ? p.pitchHand.code : null,
      name: p && p.person ? p.person.fullName : '',
    };
  }

  function loadContext(playerId, group, season, dateStr) {
    var key = playerId + ':' + group + ':' + season;
    if (ctxCache.has(key)) return ctxCache.get(key);
    var promise = MLBAPI.getPlayerStats(playerId, group, season, 'season,statSplits,gameLog', 'vl,vr')
      .then(function (payload) {
        var seasonRate = seasonRateFromSplits(payload, group);
        return {
          payload: payload,
          season: seasonRate,
          platoonVsLeft: platoonFromSplits(payload, 'vl'),
          platoonVsRight: platoonFromSplits(payload, 'vr'),
          form: formFromGameLog(payload, dateStr, 8),
        };
      })
      .catch(function (err) {
        console.warn('Props: stats unavailable for', playerId, err);
        return { payload: null, season: { rate: null, atBats: 0 }, form: null };
      });
    ctxCache.set(key, promise);
    return promise;
  }

  /**
   * Build a forecast for the live matchup in a feed. `options.date` scopes the
   * season and the game-log cutoff; `options.remainingPAs` overrides the
   * remaining-plate-appearance estimate.
   */
  function buildForecast(feed, options) {
    var opts = options || {};
    var plays = (feed && feed.liveData && feed.liveData.plays) || {};
    var current = plays.currentPlay || {};
    var matchup = current.matchup || {};
    var batter = matchup.batter || {};
    var pitcher = matchup.pitcher || {};
    if (!batter.id || !pitcher.id) return Promise.resolve(null);

    var season = opts.season || (feed && feed.gameData && feed.gameData.game &&
      Number(feed.gameData.game.season)) || new Date().getFullYear();
    var dateStr = opts.date || (feed && feed.gameData && feed.gameData.gameDate) || '';

    var batterHand = (matchup.batSide && matchup.batSide.code) ||
      sideCode(feed, batter.id).bat || 'R';
    var pitcherHand = (matchup.pitchHand && matchup.pitchHand.code) ||
      sideCode(feed, pitcher.id).pitch || 'R';

    return Promise.all([
      loadContext(batter.id, 'hitting', season, dateStr),
      loadContext(pitcher.id, 'pitching', season, dateStr),
      MLBAPI.getVsPlayer(batter.id, pitcher.id, season).catch(function () { return null; }),
    ]).then(function (results) {
      var batterCtx = results[0];
      var pitcherCtx = results[1];
      var h2h = null;
      var vsStats = (results[2] && results[2].stats) || [];
      vsStats.forEach(function (s) {
        var split = (s.splits || [])[0];
        if (split && split.stat) {
          h2h = {
            rate: toRate(Number(split.stat.hits), Number(split.stat.atBats)),
            atBats: Number(split.stat.atBats) || 0,
          };
        }
      });

      // Split codes are from the batter's point of view ("vs Left" = against a
      // left-handed pitcher), which is also correct for switch hitters.
      var batterPlatoon = pitcherHand === 'L'
        ? batterCtx.platoonVsLeft
        : batterCtx.platoonVsRight;

      var pitcherPlatoon = null;
      if (pitcherCtx.platoonVsLeft || pitcherCtx.platoonVsRight) {
        pitcherPlatoon = batterHand === 'L' || batterHand === 'S'
          ? pitcherCtx.platoonVsLeft
          : pitcherCtx.platoonVsRight;
      }

      var priorLooks = countPriorLooks(plays.allPlays || [], batter.id, pitcher.id);
      var remainingPAs = Number.isFinite(opts.remainingPAs)
        ? opts.remainingPAs
        : estimateRemainingPAs(feed);

      var forecast = compute({
        batter: {
          rate: batterCtx.season.rate,
          atBats: batterCtx.season.atBats,
          platoon: batterPlatoon,
          form: batterCtx.form,
          vsPitcher: h2h,
        },
        pitcher: {
          rate: pitcherCtx.season.rate,
          atBats: pitcherCtx.season.atBats,
          platoon: pitcherPlatoon,
        },
        count: current.count || null,
        priorLooksAtPitcher: priorLooks,
        remainingPAs: remainingPAs,
        handednessAdvantage: undefined,
      });
      forecast.batter = { id: batter.id, name: batter.fullName || '', hand: batterHand };
      forecast.pitcher = { id: pitcher.id, name: pitcher.fullName || '', hand: pitcherHand };
      forecast.season = season;
      return forecast;
    });
  }

  function countPriorLooks(plays, batterId, pitcherId) {
    var looks = 0;
    plays.forEach(function (p) {
      var m = p.matchup || {};
      var b = m.batter && m.batter.id;
      var pi = m.pitcher && m.pitcher.id;
      if (b === batterId && pi === pitcherId) looks += 1;
    });
    return looks;
  }

  /**
   * Remaining plate appearances for one batter: a stated estimate, not a
   * measured figure. Final games have none, so the projection is "—".
   */
  function estimateRemainingPAs(feed) {
    var ls = (feed && feed.liveData && feed.liveData.linescore) || {};
    var status = (feed && feed.gameData && feed.gameData.status) || {};
    if (status.abstractGameState === 'Final') return 0;
    var inning = Number(ls.currentInning || ls.scheduledInnings || 1);
    var scheduled = Number((feed.gameData && feed.gameData.game && feed.gameData.game.scheduledInnings) || 9);
    var inningsLeft = Math.max(0, scheduled - inning + 1);
    // ~4.5 plate appearances per team per inning is far too high; one batter sees
    // roughly 0.45 PA per remaining half-inning.
    return Math.max(0, Math.round(inningsLeft * 0.45));
  }

  /* --------------------------------------------------------------- rendering */

  function driverChips(forecast) {
    return (forecast.drivers || []).map(function (d) {
      var sign = d.points >= 0 ? '+' : '';
      var cls = d.points >= 0 ? 'chip-up' : 'chip-down';
      return '<span class="chip ' + cls + '">' + UI.esc(d.label) + ' ' + sign +
        d.points.toFixed(1) + ' pts</span>';
    }).join('');
  }

  function forecastCard(forecast) {
    if (!forecast) return '';
    var atLeast = forecast.remainingPAs > 0
      ? UI.pct(forecast.atLeastOne)
      : '—';
    return '' +
      '<div class="forecast-card">' +
        '<div class="forecast-head">' +
          '<div><div class="stat-lbl">Hit this PA</div>' +
            '<div class="forecast-num">' + UI.pct(forecast.perPA) + '</div></div>' +
          '<div><div class="stat-lbl">≥1 hit in next ' + forecast.remainingPAs + ' PA</div>' +
            '<div class="forecast-num alt">' + atLeast + '</div></div>' +
          '<div><div class="stat-lbl">Matchup</div>' +
            '<div class="tier">' + UI.esc(forecast.tier) + '</div></div>' +
        '</div>' +
        '<div class="chips">' + driverChips(forecast) + '</div>' +
        (forecast.notes && forecast.notes.length
          ? '<div class="forecast-notes">' + forecast.notes.map(UI.esc).join('<br>') + '</div>'
          : '') +
        '<div class="forecast-notes">Transparent per-plate-appearance estimate, not an MLB ' +
          'projection or a betting line.</div>' +
      '</div>';
  }

  function render(feed, container) {
    if (!container) return;
    var current = (feed && feed.liveData && feed.liveData.plays &&
      feed.liveData.plays.currentPlay) || {};
    var matchup = current.matchup || {};
    var batter = matchup.batter || {};
    var pitcher = matchup.pitcher || {};

    if (!batter.fullName && !pitcher.fullName) {
      container.innerHTML = '<p class="muted">No active batter/pitcher matchup available ' +
        '(the game has no plate appearance in progress).</p>';
      return;
    }

    container.innerHTML = '<p class="muted">Loading season inputs…</p>';
    buildForecast(feed).then(function (forecast) {
      var html = '<div class="props-grid">' +
        '<div class="stat-box">' +
          '<div class="stat-lbl">Current Batter</div>' +
          '<div class="props-name">' + UI.esc(batter.fullName || 'TBD') + '</div>' +
          '<div class="muted">Bats: ' + UI.esc((matchup.batSide && matchup.batSide.description) || '—') + '</div>' +
        '</div>' +
        '<div class="stat-box">' +
          '<div class="stat-lbl">Current Pitcher</div>' +
          '<div class="props-name">' + UI.esc(pitcher.fullName || 'TBD') + '</div>' +
          '<div class="muted">Throws: ' + UI.esc((matchup.pitchHand && matchup.pitchHand.description) || '—') + '</div>' +
        '</div>' +
      '</div>';
      html += forecast
        ? forecastCard(forecast)
        : '<p class="muted">Season inputs unavailable for this matchup — no personalized forecast is shown rather than inventing one.</p>';
      container.innerHTML = html;
    }).catch(function (err) {
      console.warn('Props: forecast failed', err);
      container.innerHTML = '<p class="muted">Forecast unavailable: ' + UI.esc(err.message) + '</p>';
    });
  }

  global.Props = {
    LEAGUE: LEAGUE,
    COUNT_FACTORS: COUNT_FACTORS,
    log5: log5,
    compute: compute,
    tierFor: tierFor,
    seasonRateFromSplits: seasonRateFromSplits,
    platoonFromSplits: platoonFromSplits,
    formFromGameLog: formFromGameLog,
    buildForecast: buildForecast,
    estimateRemainingPAs: estimateRemainingPAs,
    render: render,
    forecastCard: forecastCard,
  };
})(window);
