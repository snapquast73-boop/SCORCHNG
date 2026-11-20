(async function () {
  'use strict';
  const SOURCE = 'https://www.mlb.com/official-information/scoring-changes';
  const tabs = [['official', 'Official Changes'], ['errors', '🎯 Error Watch / Error Log'], ['hitError', '📉 Hit → Error'], ['stats', '📊 Stat Changes'], ['pitching', '🧮 Pitching Stats'], ['model', 'Model'], ['flags', '⚑ Irregularities']];
  let tab = 'official', data = null, season = '', search = '';
  function render() {
    UI.tabs('sc-tabs', tabs, tab, key => { tab = key; render(); });
    if (tab === 'official') {
      const seasons = [...new Set((data?.rows || []).map(r => r.season))].sort().reverse();
      const filtered = (data?.rows || []).filter(r => (!season || r.season === season) && r.text.toLowerCase().includes(search.toLowerCase()));
      UI.html('sc-panel', `<h2>Official scoring-change text</h2><p>Published wording from MLB. No dates, stat deltas, final play matches or probabilities are inferred. Each row links to its official source.</p><div class="filters"><label>Season <select id="season"><option value="">All published seasons</option>${seasons.map(s => `<option ${season === s ? 'selected' : ''}>${UI.esc(s)}</option>`).join('')}</select></label><label>Search <input id="sc-search" type="search" value="${UI.esc(search)}" placeholder="Player, team or ruling"></label></div><div id="official-rows"></div>`);
      const draw = () => {
        const filtered = (data?.rows || []).filter(r => (!season || r.season === season) && r.text.toLowerCase().includes(search.toLowerCase()));
        UI.html('official-rows', filtered.length ? UI.table(['Season', 'MLB entry', 'Official text', 'Source'], filtered.map(r => `<tr><td>${UI.esc(r.season)}</td><td>${UI.esc(r.id)}</td><td>${UI.esc(r.text)}</td><td>${UI.link(SOURCE, 'MLB official log')}</td></tr>`)) : UI.empty(data?.warning ? 'Official data is unavailable. Use the MLB source link; the collection error is published below and on Flagged for Review.' : 'No matching official paragraphs.'));
      };
      document.getElementById('season').onchange = e => { season = e.target.value; draw(); };
      document.getElementById('sc-search').oninput = e => { search = e.target.value; draw(); };
      draw();
    } else {
      const messages = {
        errors: 'Season-wide historical error capture and coverage files were absent from the upload. Use the Replay Feed to scan every available game on a selected date. Completeness across past seasons is unverified.',
        hitError: 'Confirmed hit → error changes observed between browser polls are kept in their own silent Replay Feed tab. Historical categorization cannot be recovered from current final rulings alone.',
        stats: 'Observed batting R/H/RBI deltas are shown in the Replay Feed only when both snapshots supply the required evidence. Official paragraphs are not converted into numeric deltas by guessing.',
        pitching: 'The original pitching-only change pipeline was not uploaded. See Official Changes for MLB’s wording; no numeric pitching deltas have been inferred.',
        model: 'Model unavailable. Training data, fitted coefficients, calibration, capture history and validation tests were not uploaded. All model probabilities and accuracy metrics remain blank and unverified.',
        flags: 'Restoration limitations and unreconciled source claims are published on the Flagged for Review page. They do not masquerade as verified results.'
      };
      UI.html('sc-panel', `<h2>${UI.esc(tabs.find(t => t[0] === tab)[1])}</h2><p>${UI.esc(messages[tab])}</p><p><a href="flagged.html">Flagged for Review</a> · <a href="reviews.html">Replay Feed</a> · ${UI.link(SOURCE, 'Official MLB source')}</p>`);
    }
  }
  try {
    const response = await fetch('data/official.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    if (!Array.isArray(data.rows)) throw new Error('Invalid official data shape');
    UI.text('sc-updated', `${data.rows.length} official paragraphs · Collection attempted ${data.retrievedAt}${data.warning ? ' · UNAVAILABLE: ' + data.warning : ' · Official text, not independently play-reconciled.'}`);
  } catch (e) { data = { rows: [], warning: e.message }; UI.text('sc-updated', 'Official data collection unavailable. ' + e.message); }
  render();
})();
