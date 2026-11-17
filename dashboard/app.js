// Ignition's page: it reads the board data written beside it and renders the ranked table, the
// token-trades view, the method notes and a detail drawer. It makes no network request. For every
// row it shows, it re-runs the model's arithmetic from the snapshot figures on the row and compares
// the result with the number the board carries; the drawer shows that check, and the method view
// reports it over the whole board.

(function () {
  'use strict';

  var data = window.RADAR;
  if (!data || !Array.isArray(data.rows)) {
    document.getElementById('subhead').textContent = 'This page could not find its data file (data.js beside it). Run main.ts to write one.';
    return;
  }

  // ---------------------------------------------------------------- formatting

  function trim(x) {
    if (x >= 100) return x.toFixed(0);
    if (x >= 10) return x.toFixed(1);
    return x.toFixed(2);
  }

  function fmtUsd(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + trim(n / 1e9) + 'B';
    if (a >= 1e6) return '$' + trim(n / 1e6) + 'M';
    if (a >= 1e3) return '$' + trim(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }

  function fmtFull(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function fmtPct(v) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  }

  function fmtAge(days) {
    if (typeof days !== 'number' || !isFinite(days)) return '—';
    if (days < 365) return days + 'd';
    var years = days / 365;
    return (years >= 10 ? years.toFixed(0) : years.toFixed(1)) + 'y';
  }

  function chainsText(chains) {
    if (!chains || chains.length === 0) return 'chain unknown';
    if (chains.length === 1) return chains[0];
    return chains[0] + ' +' + (chains.length - 1);
  }

  // ---------------------------------------------------------------- the model, again

  function sectorOf(category) {
    if (category === null || category === undefined) return data.default_sector;
    var exact = data.sectors[category];
    if (exact !== undefined) return exact;
    var c = String(category).toLowerCase();
    if (c.indexOf('lend') >= 0) return 1.4;
    if (c.indexOf('cdp') >= 0) return 1.3;
    if (c.indexOf('dex') >= 0) return 1.25;
    if (c.indexOf('deriv') >= 0 || c.indexOf('perp') >= 0 || c.indexOf('option') >= 0) return 1.2;
    if (c.indexOf('rwa') >= 0) return 1.35;
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0) return 1.05;
    if (c.indexOf('predict') >= 0) return 1.05;
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 1.0;
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 0.9;
    if (c.indexOf('bridge') >= 0) return 0.7;
    if (c.indexOf('chain') >= 0) return 1.45;
    if (c.indexOf('stable') >= 0) return 0.95;
    return data.default_sector;
  }

  var M = data.model;

  function recompute(row) {
    var growthPct = Math.min(M.growth_cap, Math.max(M.growth_floor, typeof row.change_7d === 'number' ? row.change_7d : 0));
    var growth = 1 + (growthPct / 100) * M.growth_weight;
    var age = typeof row.age_days === 'number' ? row.age_days : M.unknown_age_days;
    var tenure = M.tenure_floor + (Math.min(Math.max(age, 0), M.tenure_days) / M.tenure_days) * M.tenure_range;
    var sector = sectorOf(row.category);
    var raw = row.tvl_usd * M.base_multiple * sector * growth * tenure;
    return {
      implied: Math.max(1, Math.min(1e14, Math.round(raw))),
      growthPct: growthPct,
      growth: growth,
      tenure: tenure,
      sector: sector
    };
  }

  var verified = 0;
  var mismatches = 0;
  data.rows.forEach(function (row) {
    var r = recompute(row);
    if (r.implied === row.implied_value_usd && r.sector === row.model.sector_multiplier) verified += 1;
    else mismatches += 1;
  });

  // ---------------------------------------------------------------- state

  var state = {
    tab: 'board',
    q: '',
    category: 'all',
    horizon: 'all',
    sort: 'implied',
    dir: -1,
    selected: null
  };

  var SORT_LABEL = { implied: 'implied value', tvl: 'TVL', change: 'seven-day change', age: 'age', name: 'name' };

  var COMPARE = {
    implied: function (a, b) { return a.implied_value_usd - b.implied_value_usd; },
    tvl: function (a, b) { return a.tvl_usd - b.tvl_usd; },
    change: function (a, b) { return (typeof a.change_7d === 'number' ? a.change_7d : -1e9) - (typeof b.change_7d === 'number' ? b.change_7d : -1e9); },
    age: function (a, b) { return (typeof a.age_days === 'number' ? a.age_days : 1e9) - (typeof b.age_days === 'number' ? b.age_days : 1e9); },
    name: function (a, b) { return a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || (a.slug < b.slug ? -1 : 1); }
  };

  // ---------------------------------------------------------------- elements

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === undefined || value === null) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.keys(value).forEach(function (k) { node.dataset[k] = value[k]; });
        else node.setAttribute(key, value);
      });
    }
    (children || []).forEach(function (child) { node.append(child); });
    return node;
  }

  var snapshotDate = document.getElementById('snapshotDate');
  var snapshotNote = document.getElementById('snapshotNote');
  var tabBoardCount = document.getElementById('tabBoardCount');
  var tabLiveCount = document.getElementById('tabLiveCount');
  var searchInput = document.getElementById('search');
  var categorySelect = document.getElementById('category');
  var filters = document.getElementById('filters');
  var resetButton = document.getElementById('reset');
  var statsList = document.getElementById('stats');
  var boardBody = document.getElementById('boardBody');
  var liveBody = document.getElementById('liveBody');
  var emptyNote = document.getElementById('empty');
  var resultLine = document.getElementById('resultLine');
  var drawer = document.getElementById('drawer');
  var drawerBody = document.getElementById('drawerBody');
  var scrim = document.getElementById('scrim');
  var closeButton = document.getElementById('close');
  var eyebrow = document.getElementById('eyebrow');
  var headline = document.getElementById('headline');
  var subhead = document.getElementById('subhead');

  var COPY = {
    board: {
      eyebrow: 'Ranked board',
      headline: 'Every pre-token protocol, ranked by implied value',
      subhead: 'The model scores the watchlist and the field below it with one function.'
    },
    live: {
      eyebrow: 'Token trades',
      headline: 'The protocols the market has already priced',
      subhead: 'Shown for comparison only: these record a token, so the radar claims no implied value for them.'
    },
    method: {
      eyebrow: 'Method',
      headline: 'How the radar gets its numbers',
      subhead: 'The model, the page’s check and the coverage, stated plainly.'
    }
  };

  // ---------------------------------------------------------------- rail and tabs

  snapshotDate.textContent = data.as_of;
  snapshotNote.textContent = data.stats.protocols + ' protocols in the sealed snapshot · ' + data.stats.board + ' ranked · ' + data.stats.live_protocols + ' live-token protocols set aside';
  tabBoardCount.textContent = String(data.stats.board);
  tabLiveCount.textContent = String(data.stats.live);

  var tabButtons = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  tabButtons.forEach(function (button) {
    button.addEventListener('click', function () { setTab(button.dataset.tab); });
  });

  function setTab(name) {
    state.tab = name;
    tabButtons.forEach(function (button) { button.classList.toggle('is-active', button.dataset.tab === name); });
    document.getElementById('boardview').hidden = name !== 'board';
    document.getElementById('liveview').hidden = name !== 'live';
    document.getElementById('methodview').hidden = name !== 'method';
    filters.hidden = name !== 'board';
    eyebrow.textContent = COPY[name].eyebrow;
    headline.textContent = COPY[name].headline;
    subhead.textContent = COPY[name].subhead;
  }

  // ---------------------------------------------------------------- stats

  function statTile(label, value, small, accent) {
    var dd = el('dd', { class: accent ? 'accent' : null }, [document.createTextNode(value)]);
    if (small) dd.append(el('small', { text: ' ' + small }));
    return el('div', { class: 'stat' }, [el('dt', { text: label }), dd]);
  }

  statsList.replaceChildren(
    statTile('Board rows', String(data.stats.board), 'of ' + data.stats.protocols),
    statTile('Watchlist', String(data.stats.watchlist), fmtUsd(data.floor_usd) + ' floor'),
    statTile('Below the floor', String(data.stats.early), 'in the field'),
    statTile('Median implied', fmtUsd(data.stats.median_implied), 'across the board', true)
  );

  // ---------------------------------------------------------------- categories

  var counts = {};
  data.rows.forEach(function (row) {
    var key = row.category === null ? 'Uncategorised' : row.category;
    counts[key] = (counts[key] || 0) + 1;
  });
  var categories = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || (a < b ? -1 : 1); });

  categorySelect.append(el('option', { value: 'all', text: 'All categories (' + data.rows.length + ')' }));
  categories.forEach(function (name) {
    categorySelect.append(el('option', { value: name, text: name + ' (' + counts[name] + ')' }));
  });

  categorySelect.addEventListener('change', function () {
    state.category = categorySelect.value;
    renderBoard();
  });

  var segButtons = Array.prototype.slice.call(document.querySelectorAll('.seg'));
  segButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      state.horizon = button.dataset.horizon;
      segButtons.forEach(function (b) { b.classList.toggle('is-active', b === button); });
      renderBoard();
    });
  });

  searchInput.addEventListener('input', function () {
    state.q = searchInput.value;
    renderBoard();
  });

  resetButton.addEventListener('click', function () {
    state.q = '';
    state.category = 'all';
    state.horizon = 'all';
    searchInput.value = '';
    categorySelect.value = 'all';
    segButtons.forEach(function (b) { b.classList.toggle('is-active', b.dataset.horizon === 'all'); });
    renderBoard();
  });

  // ---------------------------------------------------------------- sorting

  var sortButtons = Array.prototype.slice.call(document.querySelectorAll('.sort'));
  sortButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var key = button.dataset.sort;
      if (state.sort === key) state.dir = -state.dir;
      else {
        state.sort = key;
        state.dir = key === 'name' ? 1 : -1;
      }
      syncSort();
      renderBoard();
    });
  });

  function syncSort() {
    sortButtons.forEach(function (button) {
      var active = button.dataset.sort === state.sort;
      button.classList.toggle('is-active', active);
      if (active) button.dataset.dir = state.dir < 0 ? 'desc' : 'asc';
      else delete button.dataset.dir;
    });
  }

  // ---------------------------------------------------------------- the table

  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    var rows = data.rows.filter(function (row) {
      if (state.horizon === 'watch' && !row.on_watchlist) return false;
      if (state.horizon === 'early' && row.on_watchlist) return false;
      if (state.category !== 'all') {
        var key = row.category === null ? 'Uncategorised' : row.category;
        if (key !== state.category) return false;
      }
      if (q && row.name.toLowerCase().indexOf(q) < 0 && row.slug.indexOf(q) < 0) return false;
      return true;
    });
    var compare = COMPARE[state.sort] || COMPARE.implied;
    rows.sort(function (a, b) {
      var base = compare(a, b);
      if (base !== 0) return base * state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
    return rows;
  }

  function renderBoard() {
    var rows = visibleRows();
    boardBody.replaceChildren.apply(boardBody, rows.map(rowElement));
    emptyNote.hidden = rows.length !== 0;

    var bits = [];
    if (state.category !== 'all') bits.push(state.category);
    if (state.q.trim()) bits.push('matching “' + state.q.trim() + '”');
    if (state.horizon === 'watch') bits.push('on the watchlist');
    if (state.horizon === 'early') bits.push('found below the floor');
    resultLine.replaceChildren(
      el('b', { text: String(rows.length) }),
      document.createTextNode(' of ' + data.stats.board + ' protocols' + (bits.length ? ' · ' + bits.join(' · ') : '') + ' · sorted by ' + SORT_LABEL[state.sort] + ' ' + (state.dir < 0 ? 'descending' : 'ascending'))
    );
    syncSort();
  }

  function signalChip(row) {
    return el('span', { class: 'signal ' + row.signal, title: 'signal score ' + row.signal_score.toFixed(3) + ' of 1' }, [
      el('i', { class: 'dot ' + row.signal }),
      document.createTextNode(row.signal)
    ]);
  }

  function rowElement(row) {
    var tr = el('tr', { dataset: { slug: row.slug } });
    if (state.selected === row.slug) tr.classList.add('is-open');

    var rank = el('td', { class: 'col-rank', text: String(row.rank).padStart(3, '0') });
    if (row.rank <= 3) rank.classList.add('rank-' + row.rank);

    var changeClass = 'col-num';
    if (typeof row.change_7d !== 'number') changeClass += ' muted';
    else if (row.change_7d > 0) changeClass += ' positive';
    else if (row.change_7d < 0) changeClass += ' negative';

    tr.append(
      rank,
      el('td', { class: 'col-name' }, [
        el('span', { class: 'p-name', text: row.name }),
        el('span', { class: 'p-meta' }, [
          el('span', { class: 'p-cat', text: row.category === null ? 'Uncategorised' : row.category }),
          el('span', { class: 'p-chains', text: chainsText(row.chains) })
        ])
      ]),
      el('td', { class: 'col-num', text: fmtUsd(row.tvl_usd) }),
      el('td', { class: changeClass, text: fmtPct(row.change_7d) }),
      el('td', { class: 'col-num muted', text: fmtAge(row.age_days) }),
      el('td', { class: 'col-mid' }, [signalChip(row)]),
      el('td', { class: 'col-num implied', text: fmtUsd(row.implied_value_usd) }),
      el('td', { class: 'col-more' })
    );
    tr.addEventListener('click', function () { openDrawer(row); });
    return tr;
  }

  // ---------------------------------------------------------------- the live set

  liveBody.replaceChildren.apply(liveBody, data.live.map(function (row, index) {
    var changeClass = 'col-num';
    if (typeof row.change_7d !== 'number') changeClass += ' muted';
    else if (row.change_7d > 0) changeClass += ' positive';
    else if (row.change_7d < 0) changeClass += ' negative';
    return el('tr', {}, [
      el('td', { class: 'col-rank', text: String(index + 1).padStart(2, '0') }),
      el('td', { class: 'col-name' }, [
        el('span', { class: 'p-name', text: row.name }),
        el('span', { class: 'p-meta' }, [
          el('span', { class: 'p-cat', text: row.category === null ? 'Uncategorised' : row.category }),
          el('span', { class: 'p-chains', text: chainsText(row.chains) })
        ])
      ]),
      el('td', { class: 'col-mid' }, [el('span', { class: 'sym', text: row.symbol || '—' })]),
      el('td', { class: 'col-num', text: fmtUsd(row.tvl_usd) }),
      el('td', { class: 'col-num', text: fmtUsd(row.mcap_usd) }),
      el('td', { class: 'col-num', text: row.mcap_tvl.toFixed(2) + '×' }),
      el('td', { class: changeClass, text: fmtPct(row.change_7d) })
    ]);
  }));

  // ---------------------------------------------------------------- the drawer

  function meter(label, factor) {
    var max = { sector: 1.45, growth: 1.825, tenure: 1.2 };
    var key = label.split(' ')[0].toLowerCase();
    var lo = { sector: 0, growth: 0.725, tenure: 0.55 }[key];
    var hi = max[key];
    var pct = Math.max(2, Math.min(100, ((factor - lo) / (hi - lo)) * 100));
    return el('div', { class: 'meter' }, [
      el('span', { class: 'meter-label', text: label }),
      el('div', { class: 'meter-track' }, [el('div', { class: 'meter-fill', style: 'width:' + pct.toFixed(1) + '%' })]),
      el('span', { class: 'meter-value', text: factor.toFixed(2) + '×' })
    ]);
  }

  function fact(label, value, mono) {
    return el('div', {}, [el('dt', { text: label }), el('dd', { class: mono ? 'mono' : null, text: value })]);
  }

  function openDrawer(row) {
    state.selected = row.slug;
    Array.prototype.forEach.call(boardBody.children, function (tr) {
      tr.classList.toggle('is-open', tr.dataset.slug === row.slug);
    });

    var r = recompute(row);
    var ok = r.implied === row.implied_value_usd && r.sector === row.model.sector_multiplier;

    var valueRow = el('div', { class: 'd-value-row' }, [
      el('div', {}, [
        el('p', { class: 'd-value-label', text: 'Implied value' }),
        el('p', { class: 'd-value', text: fmtUsd(row.implied_value_usd), title: fmtFull(row.implied_value_usd) })
      ]),
      signalChip(row)
    ]);

    var check = el('p', { class: 'd-check ' + (ok ? 'ok' : 'bad') }, [
      el('span', { class: 'chip', text: ok ? 'checked' : 'mismatch' }),
      document.createTextNode(
        ok
          ? 'the page recomputes ' + fmtFull(r.implied) + ' from this row — it matches board.json'
          : 'the page recomputes ' + fmtFull(r.implied) + ', but the board carries ' + fmtFull(row.implied_value_usd)
      )
    ]);

    var meters = el('div', { class: 'meters' }, [
      meter('Sector', r.sector),
      meter('Growth', r.growth),
      meter('Tenure', r.tenure)
    ]);

    var formulaLine = el('p', {
      class: 'formula-line',
      text: fmtFull(row.tvl_usd) + ' × ' + M.base_multiple.toFixed(2) + ' × ' + r.sector.toFixed(2) + ' (sector) × ' + r.growth.toFixed(4) + ' (growth, ' + fmtPct(r.growthPct) + ' clamped) × ' + r.tenure.toFixed(4) + ' (tenure, ' + fmtAge(row.age_days) + ') = ' + fmtFull(r.implied)
    });

    var facts = el('dl', { class: 'facts' }, [
      fact('TVL', fmtFull(row.tvl_usd), true),
      fact('Seven-day change', fmtPct(row.change_7d), true),
      fact('Age', row.age_days === null ? 'unknown (scored as one year)' : row.age_days + ' days', true),
      fact('Listed', row.listed_at || '—', true),
      fact('Chains', (row.chains || []).join(', ') || '—'),
      fact('Category', row.category || 'Uncategorised'),
      fact('Slug', row.slug, true),
      fact('Token status', 'none recorded — pre-token', false)
    ]);

    var steps = el('ol', { class: 'steps' }, row.farm_steps.map(function (text) {
      var li = el('li');
      var at = text.indexOf(' Cost:');
      if (at > 0) {
        li.append(document.createTextNode(text.slice(0, at)));
        li.append(el('span', { class: 'step-cost', text: text.slice(at) }));
      } else {
        li.textContent = text;
      }
      return li;
    }));

    drawerBody.replaceChildren(
      el('div', { class: 'd-head' }, [
        el('p', { class: 'd-rank', text: 'rank ' + String(row.rank).padStart(3, '0') + ' of ' + data.stats.board + ' · pre-token' }),
        el('h3', { class: 'd-name', text: row.name }),
        el('p', { class: 'd-sub' }, [
          document.createTextNode((row.category || 'Uncategorised') + ' · ' + ((row.chains || []).join(', ') || 'chain unknown') + ' · '),
          el('code', { text: row.slug })
        ])
      ]),
      valueRow,
      check,
      el('section', { class: 'd-section' }, [
        el('h4', { text: 'How the number is built' }),
        meters,
        formulaLine
      ]),
      el('section', { class: 'd-section' }, [
        el('h4', { text: 'Facts' }),
        facts
      ]),
      el('section', { class: 'd-section' }, [
        el('h4', { text: 'Farm plan · cost and time on every step' }),
        steps
      ]),
      el('p', { class: 'disclaimer', text: 'The implied value is the radar’s claim from the snapshot’s record, not a forecast and not advice. Costs are estimates for a typical week; check the protocol’s own site before you act.' })
    );

    drawer.hidden = false;
    scrim.hidden = false;
  }

  function closeDrawer() {
    drawer.hidden = true;
    scrim.hidden = true;
    state.selected = null;
    Array.prototype.forEach.call(boardBody.children, function (tr) { tr.classList.remove('is-open'); });
  }

  closeButton.addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeDrawer(); });

  // ---------------------------------------------------------------- the method view

  function renderMethod() {
    var coverage = document.getElementById('coverageCopy');
    coverage.textContent =
      'The snapshot holds ' + data.stats.protocols + ' protocols. The watchlist names ' + data.stats.watchlist +
      ' at a ' + fmtUsd(data.floor_usd) + ' TVL floor. The same function then scored ' + data.stats.early +
      ' more pre-token protocols below that floor, so the board’s ' + data.stats.board +
      ' rows cover the house list and the field beyond it. ' + data.stats.live_protocols +
      ' protocols that already record a token are never scored as launches; ' + data.stats.live + ' of them are shown in the token-trades view for comparison.';

    var maxCount = Math.max(data.stats.watchlist, data.stats.early, data.stats.live_protocols);
    function covRow(label, n) {
      return el('div', { class: 'cov-row' }, [
        el('span', { text: label }),
        el('div', { class: 'cov-track' }, [el('div', { class: 'cov-fill', style: 'width:' + ((n / maxCount) * 100).toFixed(1) + '%' })]),
        el('span', { class: 'cov-num', text: String(n) })
      ]);
    }
    document.getElementById('coverageBars').replaceChildren(
      covRow('Watchlist', data.stats.watchlist),
      covRow('Below floor', data.stats.early),
      covRow('Live tokens', data.stats.live_protocols)
    );

    var sectors = Object.keys(data.sectors).map(function (name) { return [name, data.sectors[name]]; });
    sectors.sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
    document.getElementById('sectorGrid').replaceChildren.apply(
      document.getElementById('sectorGrid'),
      sectors.map(function (pair) {
        return el('span', { class: 'sector' }, [document.createTextNode(pair[0]), el('code', { text: pair[1].toFixed(2) })]);
      })
    );
    document.getElementById('defaultSector').textContent = data.default_sector.toFixed(2);
    document.getElementById('checkLine').textContent =
      'model check: ' + verified + ' / ' + data.rows.length + ' rows recompute exactly from their snapshot figures' +
      (mismatches === 0 ? ' — every number board.json carries is reproduced here.' : ' — ' + mismatches + ' differ.');
  }

  // ---------------------------------------------------------------- staging and start

  function applyQuery() {
    var params = new URLSearchParams(window.location.search);

    var category = params.get('category');
    if (category) {
      state.category = category;
      categorySelect.value = category;
    }
    var q = params.get('q');
    if (q) {
      state.q = q;
      searchInput.value = q;
    }
    var horizon = params.get('horizon');
    if (horizon === 'watch' || horizon === 'early' || horizon === 'all') {
      state.horizon = horizon;
      segButtons.forEach(function (b) { b.classList.toggle('is-active', b.dataset.horizon === horizon); });
    }
    var sort = params.get('sort');
    if (sort && COMPARE[sort]) state.sort = sort;
    var dir = params.get('dir');
    if (dir === 'asc') state.dir = 1;
    else if (dir === 'desc') state.dir = -1;

    var view = params.get('view');
    if (view === 'live') setTab('live');
    else if (view === 'method') setTab('method');
    else setTab('board');

    renderBoard();

    var slug = params.get('slug');
    if (slug) {
      var row = data.rows.filter(function (r) { return r.slug === slug; })[0];
      if (row) openDrawer(row);
    }
  }

  renderMethod();
  applyQuery();

  requestAnimationFrame(function () {
    requestAnimationFrame(function () { document.body.dataset.ready = 'true'; });
  });
})();
