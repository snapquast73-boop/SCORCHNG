/* ============================================================================
 * ui.js — shared UI helpers: escaping, dates, logos, count dots, base diamond.
 * ==========================================================================*/
(function (global) {
  'use strict';

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function toDate(dateStr) {
    var parts = String(dateStr || '').split('-').map(Number);
    if (parts.length !== 3 || !parts.every(Number.isFinite)) return new Date(NaN);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function toDateStr(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function shiftDate(dateStr, deltaDays) {
    var d = toDate(dateStr);
    if (Number.isNaN(d.getTime())) return todayStr();
    d.setDate(d.getDate() + deltaDays);
    return toDateStr(d);
  }

  function formatDateLabel(dateStr) {
    var d = toDate(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  /* ------------------------------------------------------------------ images */

  // Primary team-logo path documented by the project (team-cap-on-dark); the
  // onerror handler falls back to the un-suffixed path, then hides the image,
  // so a change in the static host can never break the layout.
  function teamLogoUrl(teamId) {
    if (!teamId) return '';
    return 'https://www.mlbstatic.com/team-logos/team-cap-on-dark/' + teamId + '.svg';
  }

  function teamLogoFallbackUrl(teamId) {
    if (!teamId) return '';
    return 'https://www.mlbstatic.com/team-logos/' + teamId + '.svg';
  }

  function headshotUrl(playerId) {
    if (!playerId) return '';
    return 'https://img.mlbstatic.com/mlb-photos/image/upload/' +
      'd_people:generic:headshot:67:current.png/w_120,q_auto:best/' +
      'v1/people/' + playerId + '/headshot/67/current';
  }

  /**
   * Build an <img> for a team logo with the fallback chain described above.
   * `cls` is the CSS class, `size` an optional pixel size.
   */
  function teamLogoImg(teamId, cls, size) {
    if (!teamId) return '';
    var style = size ? ' style="width:' + size + 'px;height:' + size + 'px;"' : '';
    return '<img class="' + (cls || 'team-logo') + '" src="' + esc(teamLogoUrl(teamId)) + '"' +
      ' data-fallback="' + esc(teamLogoFallbackUrl(teamId)) + '"' +
      ' alt="" loading="lazy" onerror="UI.logoError(this)"' + style + '>';
  }

  function headshotImg(playerId, cls, size) {
    if (!playerId) return '';
    var style = size ? ' style="width:' + size + 'px;height:' + size + 'px;"' : '';
    return '<img class="' + (cls || 'headshot') + '" src="' + esc(headshotUrl(playerId)) +
      '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'"' + style + '>';
  }

  function logoError(img) {
    var fallback = img && img.getAttribute ? img.getAttribute('data-fallback') : '';
    if (fallback && img.src !== fallback) {
      img.src = fallback;
      img.removeAttribute('data-fallback');
      return;
    }
    img.style.visibility = 'hidden';
  }

  /* ------------------------------------------------------------- game display */

  function initials(abbr, fallback) {
    return abbr || fallback || '';
  }

  function halfInningLabel(half) {
    if (!half) return '';
    var lower = String(half).toLowerCase();
    if (lower === 'top') return 'Top';
    if (lower === 'bottom') return 'Bottom';
    return String(half);
  }

  function inningLabel(inning, half) {
    var h = halfInningLabel(half);
    return h ? h + ' ' + inning : String(inning || '');
  }

  /** Baseball count with balls/strikes/outs read straight from the payload. */
  function countLine(count, outs) {
    var c = count || {};
    var parts = [];
    parts.push('<span class="count-chip"><strong>' + (c.balls === undefined ? '-' : c.balls) + '</strong>' +
      '<span class="count-lbl">B</span></span>');
    parts.push('<span class="count-chip"><strong>' + (c.strikes === undefined ? '-' : c.strikes) + '</strong>' +
      '<span class="count-lbl">S</span></span>');
    parts.push('<span class="count-chip"><strong>' + (outs === undefined ? '-' : outs) + '</strong>' +
      '<span class="count-lbl">OUT</span></span>');
    return parts.join('');
  }

  /**
   * Base diamond. `bases` is { first, second, third } where each value is a
   * runner object ({id, fullName}) or falsy. Renders an inline SVG so it scales
   * with the card and needs no image asset.
   */
  function basesDiamond(bases) {
    var b = bases || {};
    var first = !!b.first;
    var second = !!b.second;
    var third = !!b.third;
    function name(r) {
      if (!r) return '';
      var n = r.fullName || '';
      return n ? '<title>' + esc(n) + '</title>' : '';
    }
    return '<svg class="bases-diamond" viewBox="0 0 60 60" role="img" aria-label="Runners on base">' +
      '<rect x="6" y="6" width="48" height="48" rx="4" transform="rotate(45 30 30)" class="diamond-frame"></rect>' +
      '<rect x="22" y="8" width="14" height="14" rx="2" class="base' + (second ? ' on' : '') + '">' + name(b.second) + '</rect>' +
      '<rect x="38" y="24" width="14" height="14" rx="2" class="base' + (first ? ' on' : '') + '">' + name(b.first) + '</rect>' +
      '<rect x="6" y="24" width="14" height="14" rx="2" class="base' + (third ? ' on' : '') + '">' + name(b.third) + '</rect>' +
      '</svg>';
  }

  function runnerList(bases) {
    var b = bases || {};
    var parts = [];
    if (b.first) parts.push('1B: ' + esc(b.first.fullName || ''));
    if (b.second) parts.push('2B: ' + esc(b.second.fullName || ''));
    if (b.third) parts.push('3B: ' + esc(b.third.fullName || ''));
    return parts.join(' · ');
  }

  function pct(value, digits) {
    if (!Number.isFinite(value)) return '—';
    return (value * 100).toFixed(digits === undefined ? 1 : digits) + '%';
  }

  function decimal(value, digits) {
    if (!Number.isFinite(value)) return '—';
    return value.toFixed(digits === undefined ? 3 : digits).replace(/^0\./, '.');
  }

  function safeArr(value) {
    return Array.isArray(value) ? value : [];
  }

  /* ------------------------------------------------- SCORCHNG compat layer */
  // The scoring-changes pages (scoring-page.js) use these DOM helpers. They
  // render only escaped text and official source links; missing values stay
  // blank (never default zeroes).
  function link(url, text) {
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
      esc(text || 'MLB source') + '</a>';
  }

  function value(v) {
    return v === null || v === undefined ? '' : esc(v);
  }

  function html(id, content) {
    var node = document.getElementById(id);
    if (node) node.innerHTML = content;
  }

  function text(id, content) {
    var node = document.getElementById(id);
    if (node) node.textContent = content;
  }

  function sources(id) {
    var gameUrl = (typeof API !== 'undefined' && API.gameURL)
      ? API.gameURL(id)
      : 'https://statsapi.mlb.com/api/v1.1/game/' + encodeURIComponent(id) + '/feed/live';
    var gamedayUrl = (typeof API !== 'undefined' && API.gameday)
      ? API.gameday(id)
      : 'https://www.mlb.com/gameday/' + encodeURIComponent(id);
    return link(gameUrl, 'MLB StatsAPI') + ' · ' + link(gamedayUrl, 'Gameday');
  }

  function empty(message) {
    return '<div class="empty">' + esc(message) + '</div>';
  }

  function table(headings, rows) {
    return '<div class="table-scroll"><table><thead><tr>' +
      headings.map(function (h) { return '<th scope="col">' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }

  function validDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    var d = new Date(s + 'T12:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  function dateController(name, load) {
    var params = new URLSearchParams(location.search);
    var selected = validDate(params.get('date') || '') ? params.get('date') : todayStr();
    var picker = document.getElementById('date-picker');
    function set(d) {
      if (!validDate(d)) return;
      selected = d;
      if (picker) picker.value = d;
      text('date-label', formatDateLabel(d));
      var url = new URL(location.href);
      url.searchParams.set('date', d);
      try { history.replaceState(null, '', url); } catch (err) { /* ignore */ }
      load(d);
    }
    function move(n) {
      set(shiftDate(selected, n));
    }
    global[name] = {
      prevDay: function () { move(-1); },
      nextDay: function () { move(1); },
      today: function () { set(todayStr()); },
      pickDate: function () { set(picker.value); },
      refresh: function () { load(selected); },
    };
    set(selected);
    return function () { return selected; };
  }

  function status(message, error) {
    var n = document.getElementById('status-line');
    if (n) {
      n.textContent = message;
      n.setAttribute('role', error ? 'alert' : 'status');
    }
  }

  function banner(message) {
    html('banner', message ? '<p>' + esc(message) + ' <a href="flagged.html">Flagged for Review</a></p>' : '');
  }

  function tabs(id, tabList, selected, onChange) {
    html(id, tabList.map(function (t) {
      var key = Array.isArray(t) ? t[0] : t.key;
      var label = Array.isArray(t) ? t[1] : t.label;
      return '<button class="tab-btn' + (selected === key ? ' tab-on' : '') +
        '" data-key="' + esc(key) + '" aria-pressed="' + (selected === key) + '">' +
        esc(label) + '</button>';
    }).join(''));
    var el = document.getElementById(id);
    if (el) {
      Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) {
        b.onclick = function () { onChange(b.dataset.key); };
      });
    }
  }

  global.UI = {
    esc: esc,
    todayStr: todayStr,
    toDate: toDate,
    toDateStr: toDateStr,
    shiftDate: shiftDate,
    formatDateLabel: formatDateLabel,
    formatTime: formatTime,
    formatDateTime: formatDateTime,
    teamLogoUrl: teamLogoUrl,
    teamLogoFallbackUrl: teamLogoFallbackUrl,
    teamLogoImg: teamLogoImg,
    headshotUrl: headshotUrl,
    headshotImg: headshotImg,
    logoError: logoError,
    initials: initials,
    halfInningLabel: halfInningLabel,
    inningLabel: inningLabel,
    countLine: countLine,
    basesDiamond: basesDiamond,
    runnerList: runnerList,
    pct: pct,
    decimal: decimal,
    safeArr: safeArr,
    // SCORCHNG compat (scoring-page.js / flagged pages)
    link: link,
    value: value,
    html: html,
    text: text,
    sources: sources,
    empty: empty,
    table: table,
    validDate: validDate,
    dateController: dateController,
    status: status,
    banner: banner,
    tabs: tabs,
    date: todayStr,
  };
})(window);
