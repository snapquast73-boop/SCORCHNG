/* ============================================================================
 * reviews.js — challenge / replay-review parser, official-scorer pending
 * rulings, scoring-change tracker, and the official challenge counters.
 *
 * Shapes used here were verified against the live StatsAPI on 2026-11-20:
 *   - review events            liveData.plays.allPlays[].reviewDetails
 *                              and .playEvents[].reviewDetails
 *   - per-team manager counters gameData.review.{away,home}.{used,remaining}
 *   - per-team ABS counters     gameData.absChallenges.{away,home}
 *                               .{usedSuccessful,usedFailed,remaining}
 *   - review status codes       GET /api/v1/gameStatus  (M* manager,
 *                              N* umpire, MJ/NJ player/umpire ABS "Pitch Result",
 *                              IH "Instant Replay")
 * See docs/verification-report.md for the request URLs and the raw evidence.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var STATUS_MAP = null; // code -> { detailedState, reason, abstractGameState }

  /** Build a lookup from the official /gameStatus registry. */
  function buildStatusMap(registry) {
    var map = {};
    (Array.isArray(registry) ? registry : []).forEach(function (row) {
      if (!row || !row.statusCode) return;
      map[row.statusCode] = {
        detailedState: row.detailedState || '',
        reason: row.reason || '',
        abstractGameState: row.abstractGameState || '',
      };
    });
    STATUS_MAP = map;
    return map;
  }

  function statusMap() {
    return STATUS_MAP;
  }

  function statusInfo(code) {
    if (!code) return null;
    return (STATUS_MAP && STATUS_MAP[code]) || null;
  }

  /**
   * Is this official statusCode a challenge/review state? Reads the registry's
   * own codes rather than matching the words "challenge"/"review", because the
   * official detailedState of a crew-chief review is "Instant Replay" (IH).
   */
  function isReviewStatus(code) {
    if (!code) return false;
    if (code === 'IH') return true;
    if (code === 'MJ' || code === 'NJ') return true;
    if (/^M[A-Z0-9]$/.test(code)) return true;
    if (/^N[A-Z0-9]$/.test(code)) return true;
    return false;
  }

  /**
   * Category of a status code, using the registry's own labels:
   *   MJ / NJ  -> ABS pitch challenge (Player / Umpire Challenge: Pitch Result)
   *   M*       -> Manager challenge
   *   N*       -> Umpire / crew-chief review
   *   IH       -> Instant replay
   */
  function categoryFromStatus(code) {
    if (code === 'MJ' || code === 'NJ') return { category: 'abs', label: 'ABS Challenge' };
    if (/^M[A-Z0-9]$/.test(code || '')) return { category: 'challenge', label: 'Manager Challenge' };
    if (/^N[A-Z0-9]$/.test(code || '')) {
      return { category: 'review', label: 'Umpire / Crew Chief Review' };
    }
    if (code === 'IH') return { category: 'review', label: 'Instant Replay Review' };
    return { category: 'review', label: 'Replay Review' };
  }

  /**
   * Classify a review from its reviewDetails. `reviewType` carries the same
   * codes as the game-status registry (MJ, MA, MF, NH, ...), so the registry is
   * the primary source; text matching is only a last resort.
   */
  function classifyReview(reviewDetails) {
    var rd = reviewDetails || {};
    var code = rd.reviewType || rd.reviewTypeCode || '';
    if (code) {
      var byCode = categoryFromStatus(code);
      // Boundary calls are umpire reviews whose registry reason is a home-run /
      // stadium-boundary check; surface them separately on the feed.
      var info = statusInfo(code);
      var reason = (rd.reason || (info && info.reason) || '').toLowerCase();
      var detailed = ((info && info.detailedState) || '').toLowerCase();
      var boundary = /home run|stadium boundary|fair\/foul/.test(reason) ||
        /home run|stadium boundary|fair\/foul/.test(detailed);
      if (boundary && byCode.category !== 'abs' && byCode.category !== 'challenge') {
        return { category: 'boundary', label: 'Boundary Call', code: code };
      }
      return { category: byCode.category, label: byCode.label, code: code };
    }
    return { category: 'review', label: 'Replay Review', code: '' };
  }

  function outcomeText(rd) {
    var r = rd || {};
    if (r.inProgress === true) return 'Under Review';
    if (r.isOverturned === true) return 'Overturned';
    if (r.isOverturned === false) return 'Call Stands / Confirmed';
    return r.inProgress === false ? 'Resolved' : 'Unknown';
  }

  /* --------------------------------------------------------------- counters */

  function counterSnapshot(feed) {
    var gd = (feed && feed.gameData) || {};
    var review = gd.review || {};
    var abs = gd.absChallenges || {};
    function teamSrc(obj, side) {
      var t = obj && obj[side];
      if (!t || typeof t !== 'object') return null;
      var out = {};
      if (typeof t.used === 'number') out.used = t.used;
      if (typeof t.remaining === 'number') out.remaining = t.remaining;
      if (typeof t.usedSuccessful === 'number') out.usedSuccessful = t.usedSuccessful;
      if (typeof t.usedFailed === 'number') out.usedFailed = t.usedFailed;
      if (typeof t.total === 'number') out.total = t.total;
      return Object.keys(out).length ? out : null;
    }
    var snap = {
      mgr: { away: teamSrc(review, 'away'), home: teamSrc(review, 'home') },
      abs: { away: teamSrc(abs, 'away'), home: teamSrc(abs, 'home') },
    };
    snap.available = !!(snap.mgr.away || snap.mgr.home || snap.abs.away || snap.abs.home);
    return snap;
  }

  /**
   * Human-readable counter line for one row, read as-is from the official
   * payload. Never counts feed events, never zero-fills a missing counter.
   */
  function counterLine(snapshot, side, abbr, kind) {
    if (!snapshot || !snapshot.available || !side) return '';
    var name = abbr || (side === 'away' ? 'Away' : 'Home');
    if (kind === 'abs') {
      var a = snapshot.abs && snapshot.abs[side];
      if (!a || typeof a.remaining !== 'number') return '';
      var bits = [];
      if (typeof a.usedSuccessful === 'number') bits.push(a.usedSuccessful + ' successful');
      if (typeof a.usedFailed === 'number') bits.push(a.usedFailed + ' failed');
      return name + ': ' + a.remaining + ' ABS challenge' + (a.remaining === 1 ? '' : 's') + ' left now' +
        (bits.length ? ' (' + bits.join(' · ') + ')' : '');
    }
    var m = snapshot.mgr && snapshot.mgr[side];
    if (!m || typeof m.remaining !== 'number') return '';
    return name + ': ' + m.remaining + ' manager challenge' + (m.remaining === 1 ? '' : 's') + ' left now' +
      (typeof m.used === 'number' ? ' (' + m.used + ' used)' : '');
  }

  function countersSummary(snapshot, awayAbbr, homeAbbr) {
    if (!snapshot || !snapshot.available) return '';
    function side(s, abbr) {
      var bits = [];
      var m = snapshot.mgr && snapshot.mgr[s];
      var a = snapshot.abs && snapshot.abs[s];
      if (m && typeof m.remaining === 'number') bits.push(m.remaining + ' MGR');
      if (a && typeof a.remaining === 'number') bits.push(a.remaining + ' ABS');
      return bits.length ? (abbr || (s === 'away' ? 'Away' : 'Home')) + ' ' + bits.join(' · ') : '';
    }
    var left = side('away', awayAbbr);
    var right = side('home', homeAbbr);
    if (!left && !right) return '';
    return 'Challenges left: ' + (left || '—') + ' — ' + (right || '—');
  }

  /* ------------------------------------------------------------ review rows */

  function teamSideOf(teamId, gameData) {
    var teams = (gameData && gameData.teams) || {};
    var away = (teams.away && teams.away.id) || null;
    var home = (teams.home && teams.home.id) || null;
    if (teamId && teamId === away) return 'away';
    if (teamId && teamId === home) return 'home';
    return null;
  }

  function teamAbbr(gameData, side) {
    var teams = (gameData && gameData.teams) || {};
    var t = teams[side] || {};
    return t.abbreviation || (side === 'away' ? 'AWY' : 'HOM');
  }

  /** Runs credited to the reviewed event itself (details.playIndex matches). */
  function scoringRunnersFor(play, playIndex) {
    var runners = Array.isArray(play && play.runners) ? play.runners : [];
    return runners.filter(function (r) {
      var d = (r && r.details) || {};
      if (d.isScoringEvent !== true) return false;
      if (playIndex === null || playIndex === undefined) return true;
      return d.playIndex === playIndex;
    }).map(function (r) {
      var d = r.details || {};
      return {
        name: (d.runner && d.runner.fullName) || '',
        playIndex: d.playIndex,
        rbi: d.rbi === true,
      };
    });
  }

  function scoreFromResult(play) {
    var res = (play && play.result) || {};
    return {
      away: typeof res.awayScore === 'number' ? res.awayScore : null,
      home: typeof res.homeScore === 'number' ? res.homeScore : null,
    };
  }

  function scoreBeforePlay(prevPlay) {
    if (!prevPlay) return { away: 0, home: 0 };
    var s = scoreFromResult(prevPlay);
    return { away: s.away === null ? 0 : s.away, home: s.home === null ? 0 : s.home };
  }

  function challengerInfo(rd, description, gameData, awayAbbr, homeAbbr) {
    var teamId = rd && (rd.challengeTeamId || rd.challengingTeamId);
    var side = teamSideOf(teamId, gameData);
    var desc = String(description || '');
    var role = null;
    if (/manager challenge|challenged \(/i.test(desc)) role = 'manager';
    if (/pitch result/i.test(desc)) role = 'abs';
    if (side) {
      return { side: side, abbr: side === 'away' ? awayAbbr : homeAbbr, role: role };
    }
    // Fall back to the team nickname named in the official description
    // ("Reds challenged (play at 1st) ..."), never to a guess.
    var teams = (gameData && gameData.teams) || {};
    var found = null;
    ['away', 'home'].forEach(function (s) {
      var t = teams[s] || {};
      var names = [t.teamName, t.clubName, t.shortName, t.name].filter(Boolean);
      names.forEach(function (n) {
        if (!found && desc.toLowerCase().indexOf(String(n).toLowerCase()) === 0) {
          found = { side: s, abbr: s === 'away' ? awayAbbr : homeAbbr, role: role };
        }
      });
    });
    return found || { side: null, abbr: '', role: role };
  }

  /**
   * Where StatsAPI actually puts review data (verified 2026-11-20):
   *   play.reviewDetails            — review of the whole play (manager challenge)
   *   play.playEvents[i].reviewDetails — review of one pitch (ABS "Pitch Result")
   * `playEvents[i].details.reviewDetails` is also read defensively in case the
   * payload ever moves it, and duplicates are collapsed.
   */
  function collectReviewDetails(play) {
    var found = [];
    var seen = {};
    function push(rd, scope, playIndex, source) {
      if (!rd || typeof rd !== 'object') return;
      var key = (rd.reviewType || '') + '|' + scope + '|' + playIndex + '|' +
        (rd.inProgress === true ? 'in' : 'done');
      if (seen[key]) return;
      seen[key] = true;
      found.push({ rd: rd, scope: scope, playIndex: playIndex, source: source });
    }
    if (play && play.reviewDetails) push(play.reviewDetails, 'play', null, 'play');
    var events = Array.isArray(play && play.playEvents) ? play.playEvents : [];
    events.forEach(function (ev) {
      if (!ev) return;
      var idx = ev.details && typeof ev.details.playIndex === 'number' ? ev.details.playIndex : null;
      if (ev.reviewDetails) push(ev.reviewDetails, 'event', idx, 'event');
      if (ev.details && ev.details.reviewDetails) {
        push(ev.details.reviewDetails, 'event', idx, 'event.details');
      }
    });
    return found;
  }

  /**
   * Parse every review/challenge in one game feed.
   * `feed` is the /feed/live payload.
   */
  function extractGameReviews(feed) {
    if (!feed || !feed.liveData || !feed.liveData.plays) return [];
    var plays = feed.liveData.plays.allPlays || [];
    var gameData = feed.gameData || {};
    var awayAbbr = teamAbbr(gameData, 'away');
    var homeAbbr = teamAbbr(gameData, 'home');
    var gamePk = (gameData.game && gameData.game.pk) || (feed.gamePk || null);
    var counters = counterSnapshot(feed);
    var items = [];

    plays.forEach(function (play, playIdx) {
      var about = play.about || {};
      var result = play.result || {};
      var details = collectReviewDetails(play);
      if (!details.length) return;
      var prev = playIdx > 0 ? plays[playIdx - 1] : null;
      var before = scoreBeforePlay(prev);
      var after = scoreFromResult(play);
      var half = about.halfInning || '';
      var battingSide = String(half).toLowerCase() === 'top' ? 'away' : 'home';

      details.forEach(function (d) {
        var rd = d.rd;
        var cls = classifyReview(rd);
        // A whole-play review can put every run credited to the play at risk;
        // a pitch-level review can only do so when the payload tells us which
        // play index that pitch is (otherwise nothing is claimed).
        var scoring = d.scope === 'play'
          ? scoringRunnersFor(play, null)
          : (d.playIndex === null ? [] : scoringRunnersFor(play, d.playIndex));
        var inProgress = rd.inProgress === true;
        var overturn = rd.isOverturned === true;
        var reason = rd.reason || '';
        if (!reason) {
          var info = statusInfo(cls.code);
          reason = (info && info.reason) || '';
        }
        if (!reason) reason = result.description || '';

        var challenger = challengerInfo(rd, result.description, gameData, awayAbbr, homeAbbr);
        if (!challenger.role && challenger.side) {
          // ABS challenges: the batting side is the batter, the fielding side the
          // catcher/pitcher. The payload does not say which one, so the role is
          // only reported as the side that challenged.
          challenger.role = cls.category === 'abs'
            ? (challenger.side === battingSide ? 'batter side' : 'fielding side')
            : null;
        }

        // "Before review" = the call-on-field score when the reviewed event was
        // observed (score after the previous completed play). Runs already
        // credited to the reviewed event are included in `after`, so they are
        // the only runs an overturn could remove.
        // A conditional "possible after" score is only offered while the review
        // is unresolved, and only from runs the payload credits to the reviewed
        // event itself (never a prediction of the ruling or of runner placement).
        var possible = null;
        if (inProgress && scoring.length && after.away !== null && after.home !== null) {
          possible = { away: after.away, home: after.home };
          if (battingSide === 'away') possible.away = after.away - scoring.length;
          else possible.home = after.home - scoring.length;
          possible.away = Math.max(0, possible.away);
          possible.home = Math.max(0, possible.home);
        }

        var entry = {
          id: String(gamePk) + ':' + (about.atBatIndex === undefined ? playIdx : about.atBatIndex) +
            ':' + (d.scope === 'play' ? 'play' : 'pitch' + d.playIndex) + ':' + (cls.code || 'x'),
          gamePk: gamePk,
          awayAbbr: awayAbbr,
          homeAbbr: homeAbbr,
          awayId: (gameData.teams && gameData.teams.away && gameData.teams.away.id) || null,
          homeId: (gameData.teams && gameData.teams.home && gameData.teams.home.id) || null,
          inning: about.inning === undefined ? null : about.inning,
          halfInning: half,
          atBatIndex: about.atBatIndex === undefined ? playIdx : about.atBatIndex,
          batter: {
            id: (play.matchup && play.matchup.batter && play.matchup.batter.id) || null,
            name: (play.matchup && play.matchup.batter && play.matchup.batter.fullName) || '',
          },
          pitcher: {
            id: (play.matchup && play.matchup.pitcher && play.matchup.pitcher.id) || null,
            name: (play.matchup && play.matchup.pitcher && play.matchup.pitcher.fullName) || '',
          },
          reviewType: cls.code,
          reviewScope: d.scope,
          category: cls.category,
          label: cls.label,
          reason: reason,
          description: result.description || '',
          inProgress: inProgress,
          isOverturned: overturn,
          outcome: outcomeText(rd),
          battingSide: battingSide,
          runsAtRisk: inProgress ? scoring.length : 0,
          scoringRunners: scoring,
          scoreBefore: before,
          scoreActual: after,
          possibleAfter: possible,
          challengerSide: challenger.side,
          challengerAbbr: challenger.abbr,
          challengerRole: challenger.role,
          counterLine: counterLine(counters, challenger.side,
            challenger.side === 'away' ? awayAbbr : homeAbbr,
            cls.category === 'abs' ? 'abs' : 'mgr'),
          countersSummary: countersSummary(counters, awayAbbr, homeAbbr),
          counters: counters,
          gameStatus: (gameData.status && gameData.status.detailedState) || '',
          timestamp: about.endTime || about.startTime || (gameData.gameDate || ''),
        };

        if (d.playIndex !== null && d.playIndex !== undefined) {
          var events = play.playEvents || [];
          var ev = events[d.playIndex];
          if (ev) {
            if (ev.count) entry.countAfter = { balls: ev.count.balls, strikes: ev.count.strikes };
            if (typeof ev.pitchNumber === 'number') {
              entry.pitchCountBefore = Math.max(0, ev.pitchNumber - 1);
              entry.pitchNumber = ev.pitchNumber;
            }
          }
        }
        items.push(entry);
      });
    });

    return items;
  }

  /* ------------------------------------------- official scorer pending ruling */

  var OS_PENDING_TYPES = {
    os_ruling_pending_primary: 'Official Scorer Ruling Pending',
    os_ruling_pending_prior: 'Official Scorer Ruling Pending',
  };

  function extractPendingRulings(feed) {
    if (!feed || !feed.liveData || !feed.liveData.plays) return [];
    var plays = feed.liveData.plays.allPlays || [];
    var gameData = feed.gameData || {};
    var awayAbbr = teamAbbr(gameData, 'away');
    var homeAbbr = teamAbbr(gameData, 'home');
    var gamePk = (gameData.game && gameData.game.pk) || null;
    var out = [];
    plays.forEach(function (play, playIdx) {
      var about = play.about || {};
      var result = play.result || {};
      var events = Array.isArray(play.playEvents) ? play.playEvents : [];
      events.forEach(function (ev, evIdx) {
        var type = ev && ev.details ? ev.details.eventType : null;
        if (!type || !OS_PENDING_TYPES[type]) return;
        out.push({
          id: String(gamePk) + ':' + about.atBatIndex + ':os:' + evIdx,
          gamePk: gamePk,
          awayAbbr: awayAbbr,
          homeAbbr: homeAbbr,
          inning: about.inning,
          halfInning: about.halfInning,
          atBatIndex: about.atBatIndex,
          category: 'os_pending',
          label: OS_PENDING_TYPES[type],
          reason: (ev.details && ev.details.description) || result.description ||
            'Official Scorer Ruling Pending',
          outcome: 'Pending',
          inProgress: true,
          isOverturned: false,
          runsAtRisk: 0,
          scoringRunners: [],
          scoreBefore: scoreBeforePlay(playIdx > 0 ? plays[playIdx - 1] : null),
          scoreActual: scoreFromResult(play),
          possibleAfter: null,
          batter: {
            id: (play.matchup && play.matchup.batter && play.matchup.batter.id) || null,
            name: (play.matchup && play.matchup.batter && play.matchup.batter.fullName) || '',
          },
          pitcher: {
            id: (play.matchup && play.matchup.pitcher && play.matchup.pitcher.id) || null,
            name: (play.matchup && play.matchup.pitcher && play.matchup.pitcher.fullName) || '',
          },
          timestamp: about.endTime || about.startTime || (gameData.gameDate || ''),
          note: 'A pending official-scorer ruling decides how the play is charged; ' +
            'it never removes a run from the score.',
        });
      });
    });
    return out;
  }

  /* ------------------------------------------------------- scoring changes */

  /**
   * Snapshot every completed play's official classification, so a later
   * reclassification (hit <-> error <-> fielder's choice, out <-> hit, ...) can
   * be detected by diffing consecutive observations. The payload itself carries
   * no scoring-change marker.
   */
  function snapshotPlays(feed) {
    var plays = (feed && feed.liveData && feed.liveData.plays &&
      feed.liveData.plays.allPlays) || [];
    var gameData = (feed && feed.gameData) || {};
    var snap = {
      gamePk: (gameData.game && gameData.game.pk) || null,
      awayAbbr: teamAbbr(gameData, 'away'),
      homeAbbr: teamAbbr(gameData, 'home'),
      plays: {},
    };
    plays.forEach(function (play, idx) {
      var about = play.about || {};
      var result = play.result || {};
      var key = String(about.atBatIndex === undefined ? idx : about.atBatIndex);
      var errorRunners = (Array.isArray(play.runners) ? play.runners : []).filter(function (r) {
        var mr = (r && r.details && r.details.movementReason) || '';
        return /error/i.test(mr);
      }).length;
      snap.plays[key] = {
        eventType: result.eventType || '',
        event: result.event || '',
        isOut: result.isOut === true,
        outs: (play.count && typeof play.count.outs === 'number') ? play.count.outs : null,
        description: result.description || '',
        rbi: typeof result.rbi === 'number' ? result.rbi : null,
        awayScore: typeof result.awayScore === 'number' ? result.awayScore : null,
        homeScore: typeof result.homeScore === 'number' ? result.homeScore : null,
        errors: errorRunners,
        inning: about.inning,
        halfInning: about.halfInning,
        batter: (play.matchup && play.matchup.batter && play.matchup.batter.fullName) || '',
      };
    });
    return snap;
  }

  var OUT_EVENTS = {
    groundout: true, flyout: true, lineout: true, popout: true, strikeout: true,
    forceout: true, grounded_into_dp: true, sac_fly: true, sac_bunt: true,
    field_out: true, double_play: true, triple_play: true, fielders_choice_out: true,
  };

  /**
   * Diff two snapshots. Returns { changes: [], irregularities: [] }.
   * A change needs an observable reclassification; a description/RBI/score edit
   * without one is an irregularity that is surfaced, never silently applied.
   */
  function diffSnapshots(prev, next) {
    var changes = [];
    var irregularities = [];
    if (!prev || !next) return { changes: changes, irregularities: irregularities };

    Object.keys(next.plays).forEach(function (key) {
      var before = prev.plays[key];
      var after = next.plays[key];
      if (!before) return;
      var reclassified = before.eventType !== after.eventType ||
        (before.isOut !== after.isOut) ||
        (before.outs !== null && after.outs !== null && before.outs !== after.outs) ||
        (before.errors !== after.errors);
      if (reclassified) {
        changes.push({
          id: String(next.gamePk) + ':' + key + ':score',
          gamePk: next.gamePk,
          awayAbbr: next.awayAbbr,
          homeAbbr: next.homeAbbr,
          inning: after.inning,
          halfInning: after.halfInning,
          atBatIndex: Number(key),
          batter: after.batter,
          category: 'scoring_change',
          label: 'Official Scoring Change',
          from: { event: before.event, eventType: before.eventType, isOut: before.isOut },
          to: { event: after.event, eventType: after.eventType, isOut: after.isOut },
          description: after.description,
          scoreActual: { away: after.awayScore, home: after.homeScore },
          timestamp: new Date().toISOString(),
          note: 'Observed by diffing consecutive StatsAPI polls; the payload carries no ' +
            'scoring-change marker.',
        });
        return;
      }
      var softEdit = before.description !== after.description ||
        (before.rbi !== after.rbi) ||
        (before.awayScore !== after.awayScore) || (before.homeScore !== after.homeScore);
      if (softEdit) {
        irregularities.push({
          id: String(next.gamePk) + ':' + key + ':edit',
          gamePk: next.gamePk,
          awayAbbr: next.awayAbbr,
          homeAbbr: next.homeAbbr,
          atBatIndex: Number(key),
          category: 'irregularity',
          label: 'Payload edit without reclassification',
          detail: 'Description/RBI/score changed with no change to the official ' +
            'classification (' + (before.eventType || '?') + '). Not corrected or hidden.',
          timestamp: new Date().toISOString(),
        });
      }
    });

    Object.keys(prev.plays).forEach(function (key) {
      if (next.plays[key]) return;
      irregularities.push({
        id: String(next.gamePk) + ':' + key + ':gone',
        gamePk: next.gamePk,
        awayAbbr: next.awayAbbr,
        homeAbbr: next.homeAbbr,
        atBatIndex: Number(key),
        category: 'irregularity',
        label: 'Play disappeared from payload',
        detail: 'Play ' + key + ' was present in the previous poll and is absent now.',
        timestamp: new Date().toISOString(),
      });
    });

    return { changes: changes, irregularities: irregularities };
  }

  /**
   * Compare two counter snapshots. A used-counter moving backwards is an
   * irregularity: it is flagged, never corrected.
   */
  function diffCounters(prev, next) {
    var out = [];
    if (!prev || !next || !prev.available || !next.available) return out;
    ['mgr', 'abs'].forEach(function (kind) {
      ['away', 'home'].forEach(function (side) {
        var a = prev[kind] && prev[kind][side];
        var b = next[kind] && next[kind][side];
        if (!a || !b) return;
        var aUsed = typeof a.used === 'number' ? a.used : a.usedSuccessful;
        var bUsed = typeof b.used === 'number' ? b.used : b.usedSuccessful;
        if (typeof aUsed === 'number' && typeof bUsed === 'number' && bUsed < aUsed) {
          out.push({
            category: 'irregularity',
            label: 'Challenge counter moved backwards',
            detail: kind.toUpperCase() + ' ' + side + ' used counter went from ' + aUsed +
              ' to ' + bUsed + ' between polls. Reported as-is.',
          });
        }
      });
    });
    return out;
  }

  /* ------------------------------------------- SCORCHNG scoring extensions */
  // Error Watch / Hit → Error / Pitching / Other tabs (SCORCHNG charter):
  // batting R/H/RBI attribution from paired snapshots only. A current final
  // feed is never proof of an initial call; missing fields stay missing.
  var SCORCH_HITS = {
    single: true, double: true, triple: true, home_run: true,
  };
  var SCORCH_NON_HITS = {
    double_play: true, field_error: true, field_out: true, fielders_choice: true,
    fielders_choice_out: true, force_out: true, grounded_into_double_play: true,
    strikeout: true, strike_out: true, strikeout_double_play: true,
    strikeout_triple_play: true, triple_play: true, sac_fly: true,
    catcher_interf: true, batter_interference: true, fan_interference: true,
    sac_fly_double_play: true, sac_bunt: true, sac_bunt_double_play: true,
    walk: true, intent_walk: true, hit_by_pitch: true,
  };

  function scorchKnownRuling(event) {
    return !!SCORCH_HITS[event] || !!SCORCH_NON_HITS[event];
  }

  function scorchErrorPlay(play) {
    var eventType = (play && play.result && play.result.eventType) || '';
    if (/error/.test(eventType)) return true;
    var runners = (play && play.runners) || [];
    for (var i = 0; i < runners.length; i += 1) {
      var r = runners[i] || {};
      var details = r.details || {};
      if (/error/i.test(details.eventType || '')) return true;
      var credits = r.credits || [];
      for (var j = 0; j < credits.length; j += 1) {
        if (/^f_.*error$|^error$/i.test((credits[j] && credits[j].credit) || '')) return true;
      }
    }
    return false;
  }

  function scorchSnapshot(play) {
    var runners = {};
    var list = (play && play.runners) || [];
    for (var i = 0; i < list.length; i += 1) {
      var r = list[i] || {};
      var details = r.details || {};
      if (!details.runner || details.runner.id === null || details.runner.id === undefined) continue;
      var id = String(details.runner.id);
      if (typeof details.isScoringEvent === 'boolean') {
        runners[id] = {
          name: details.runner.fullName,
          scored: Boolean(runners[id] && runners[id].scored) || details.isScoringEvent,
        };
      }
    }
    var result = (play && play.result) || {};
    var matchup = (play && play.matchup) || {};
    return {
      event: result.eventType === undefined ? null : result.eventType,
      rbi: result.rbi === undefined ? null : result.rbi,
      batter: matchup.batter ? matchup.batter.id : null,
      batterName: matchup.batter ? matchup.batter.fullName : null,
      runners: runners,
      description: result.description === undefined ? null : result.description,
      awayScore: result.awayScore === undefined ? null : result.awayScore,
      homeScore: result.homeScore === undefined ? null : result.homeScore,
      error: scorchErrorPlay(play),
    };
  }

  function scorchDelta(before, after) {
    var stats = [];
    if (before.batter !== null && before.batter !== undefined &&
        before.batter === after.batter) {
      if (scorchKnownRuling(before.event) && scorchKnownRuling(after.event) &&
          !!SCORCH_HITS[before.event] !== !!SCORCH_HITS[after.event]) {
        stats.push({
          name: after.batterName, stat: 'H',
          delta: Number(!!SCORCH_HITS[after.event]) - Number(!!SCORCH_HITS[before.event]),
        });
      }
      if (Number.isFinite(before.rbi) && Number.isFinite(after.rbi) && before.rbi !== after.rbi) {
        stats.push({ name: after.batterName, stat: 'RBI', delta: after.rbi - before.rbi });
      }
    }
    var afterRunners = after.runners || {};
    Object.keys(afterRunners).forEach(function (id) {
      var r = afterRunners[id];
      var old = before.runners ? before.runners[id] : null;
      if (old && old.scored !== r.scored) {
        stats.push({ name: r.name, stat: 'R', delta: Number(r.scored) - Number(old.scored) });
      }
    });
    return stats;
  }

  function scorchCategory(before, after, stats) {
    if ((before.event === 'single' || before.event === 'double' || before.event === 'triple') &&
        after.event === 'field_error') return 'hitError';
    if (stats.length) return 'changes';
    return 'other';
  }

  function scorchExtract(feed) {
    var rows = [];
    var gamePk = feed.gamePk;
    var plays = (feed.liveData && feed.liveData.plays && feed.liveData.plays.allPlays) || [];
    plays.forEach(function (p) {
      var about = p.about || {};
      var base = {
        gamePk: gamePk,
        atBatIndex: about.atBatIndex,
        inning: about.inning,
        half: about.halfInning,
        batter: p.matchup && p.matchup.batter ? p.matchup.batter.fullName : undefined,
        description: p.result ? p.result.description : undefined,
        event: p.result ? p.result.event : undefined,
        source: 'https://statsapi.mlb.com/api/v1.1/game/' + gamePk + '/feed/live',
        videoId: (function () {
          var events = p.playEvents || [];
          for (var i = 0; i < events.length; i += 1) {
            if (events[i] && events[i].playId) return events[i].playId;
          }
          return undefined;
        })(),
      };
      var playEvents = p.playEvents || [];
      var pending = playEvents.filter(function (e) {
        return /^os_ruling_pending_/.test((e.details && e.details.eventType) || '');
      });
      if (scorchErrorPlay(p)) {
        rows.push(Object.assign({}, base, {
          id: 'error-' + base.atBatIndex, category: 'errors',
        }));
      }
      pending.forEach(function (e) {
        rows.push(Object.assign({}, base, {
          id: 'pending-' + base.atBatIndex + '-' + e.index,
          category: 'pending',
          description: (e.details && e.details.description) || base.description,
        }));
      });
      var reviewEvents = playEvents.filter(function (e) {
        return e.reviewDetails || e.isReview ||
          /review|challenge/i.test((e.details && e.details.eventType) || '');
      });
      if (p.reviewDetails || reviewEvents.length) {
        var d = p.reviewDetails || (function () {
          for (var i = 0; i < reviewEvents.length; i += 1) {
            if (reviewEvents[i].reviewDetails) return reviewEvents[i].reviewDetails;
          }
          return undefined;
        })();
        rows.push(Object.assign({}, base, {
          id: 'review-' + base.atBatIndex,
          category: 'reviews',
          review: d,
          description: reviewEvents.map(function (e) {
            return e.details && e.details.description;
          }).filter(Boolean).join(' · ') || base.description,
        }));
      }
    });
    return rows;
  }

  global.Reviews = {
    buildStatusMap: buildStatusMap,
    statusMap: statusMap,
    statusInfo: statusInfo,
    isReviewStatus: isReviewStatus,
    categoryFromStatus: categoryFromStatus,
    classifyReview: classifyReview,
    outcomeText: outcomeText,
    counterSnapshot: counterSnapshot,
    counterLine: counterLine,
    countersSummary: countersSummary,
    extractGameReviews: extractGameReviews,
    extractPendingRulings: extractPendingRulings,
    snapshotPlays: snapshotPlays,
    diffSnapshots: diffSnapshots,
    diffCounters: diffCounters,
    OUT_EVENTS: OUT_EVENTS,
    OS_PENDING_TYPES: OS_PENDING_TYPES,
    // SCORCHNG scoring extensions (Error Watch / Hit → Error / R/H/RBI)
    errorPlay: scorchErrorPlay,
    snapshot: scorchSnapshot,
    delta: scorchDelta,
    category: scorchCategory,
    extract: scorchExtract,
  };
})(window);
