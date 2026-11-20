(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const link = (url, text = 'MLB source') => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
  const date = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
  const value = v => v == null ? '' : esc(v);
  root.UI = {
    esc, link, date, validDate, value,
    html(id, content) { const node = document.getElementById(id); if (node) node.innerHTML = content; },
    text(id, content) { const node = document.getElementById(id); if (node) node.textContent = content; },
    sources(id) { return `${link(API.gameURL(id), 'MLB StatsAPI')} · ${link(API.gameday(id), 'Gameday')}`; },
    empty(message) { return `<div class="empty">${esc(message)}</div>`; },
    table(headings, rows) { return `<div class="table-scroll"><table><thead><tr>${headings.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`; },
    dateController(name, load) {
      const params = new URLSearchParams(location.search);
      let selected = validDate(params.get('date') || '') ? params.get('date') : date();
      const picker = document.getElementById('date-picker');
      const set = d => {
        if (!validDate(d)) return;
        selected = d;
        if (picker) picker.value = d;
        this.text('date-label', new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));
        const url = new URL(location.href); url.searchParams.set('date', d); history.replaceState(null, '', url);
        load(d);
      };
      const move = n => { const d = new Date(selected + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); set(d.toISOString().slice(0, 10)); };
      root[name] = { prevDay: () => move(-1), nextDay: () => move(1), today: () => set(date()), pickDate: () => set(picker.value), refresh: () => load(selected) };
      set(selected);
      return () => selected;
    },
    status(message, error = false) { const n = document.getElementById('status-line'); if (n) { n.textContent = message; n.setAttribute('role', error ? 'alert' : 'status'); } },
    banner(message) { this.html('banner', message ? `<p>${esc(message)} <a href="flagged.html">Flagged for Review</a></p>` : ''); },
    tabs(id, tabs, selected, onChange) {
      this.html(id, tabs.map(([key, label]) => `<button class="tab-btn ${selected === key ? 'tab-on' : ''}" data-key="${esc(key)}" aria-pressed="${selected === key}">${esc(label)}</button>`).join(''));
      document.getElementById(id)?.querySelectorAll('button').forEach(b => b.onclick = () => onChange(b.dataset.key));
    }
  };
})(globalThis);
