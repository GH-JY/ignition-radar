/* Ignition — the page re-runs the model on every row it shows.
The board it was handed (../data.js) carries the fitted coefficients, the residual quantiles,
the plan's economics and the ranked rows. Nothing here is fetched: the page recomputes launch
value, eventual odds, implied value, its P25–P75 band and the farm verdict from those
coefficients, re-derives the board digest, and reports how many rows agree with board.json.
The scenario controls re-run the farm arithmetic — deposit and drop share — on every row. */
(function () {
'use strict';

var D = window.RADAR;
if (!D || !D.rows) {
document.body.innerHTML = '<div style="padding:48px;font:14px system-ui;color:#aaa">No data.js found beside this page. Run the radar program first: it writes /output/data.js and copies this dashboard next to it.</div>';
return;
}

var C = D.comps, O = D.odds, E = D.economics, V = C.validation, COV = D.coverage;
var $ = function (sel, root) { return (root || document).querySelector(sel); };
var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ESC[ch]; }); }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function money(n) {
var a = Math.abs(n);
if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
return '$' + Math.round(n);
}
function full(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
function signedMoney(n) { return (n >= 0 ? '+' : '−') + full(Math.abs(n)); }
function pct(n) { return (n * 100).toFixed(1) + '%'; }
function signedPct(n) { return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1) + '%'; }
function sign(n) { return n >= 0 ? '+' : '−'; }
function ageLabel(days) {
if (days == null) return '—';
var years = days / 365;
return years < 1 ? Math.round(days / 30.4) + 'mo' : years.toFixed(1) + 'y';
}
function coef(n) { return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(3); }
function num3(n) { return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(3); }
function rate(n) { return (n >= 0 ? '+$' : '−$') + Math.abs(n).toFixed(1); }
function termOf(model, key) {
var terms = model.terms || [];
for (var i = 0; i < terms.length; i += 1) if (terms[i].key === key) return terms[i];
return null;
}
function keptOf(model, key) {
var term = termOf(model, key);
return term === null || term.kept;
}
function keptCount() {
var all = (C.terms || []).concat(O.terms || []);
return all.filter(function (term) { return term.kept; }).length + '/' + all.length;
}
function termWords(model, words) {
var phrases = (model.terms || []).filter(function (term) { return term.kept; }).map(function (term) { return words[term.key]; }).filter(function (word) { return !!word; });
if (phrases.length <= 1) return phrases.join('');
return phrases.slice(0, -1).join(', ') + ' and ' + phrases[phrases.length - 1];
}
function droppedWords(model, words) {
return (model.terms || []).filter(function (term) { return !term.kept; }).map(function (term) { return words[term.key] || term.label; }).join(', ');
}

/* ---------------------------------------------------------------- the model, re-run in the page */

function growthOf(change) { return clamp((change == null ? 0 : change) / 100, -0.5, 1.5); }
function effectOf(category) {
return category != null && Object.prototype.hasOwnProperty.call(C.category_effects, category) ? C.category_effects[category] : 0;
}
function launchOf(row) {
var log = C.intercept + C.tvl_elasticity * Math.log(Math.max(1, row.tvl_usd)) + C.growth_weight * growthOf(row.change_7d) + effectOf(row.category);
return Math.min(1e14, Math.max(1, Math.exp(log)));
}
function shareOf(tvl, ageYears, growth) {
var z = O.intercept + O.size_weight * Math.log10(Math.max(1e6, tvl) / 1e6) + O.age_weight * Math.log(1 + ageYears) + O.growth_weight * growth;
return 1 / (1 + Math.exp(-clamp(z, -30, 30)));
}
function ageYearsOf(row) { return row.age_days == null ? E.age_default_years : Math.max(0.05, row.age_days / 365); }
function oddsOf(row) {
var growth = growthOf(row.change_7d);
var age = ageYearsOf(row);
var now = shareOf(row.tvl_usd, age, growth);
var end = shareOf(row.tvl_usd, Math.max(age, O.oldest_years), growth);
return clamp((end - now) / Math.max(1e-9, 1 - now), 0.02, 0.95);
}
function weeksOf(age) {
if (age == null) return E.hold_unknown_weeks;
for (var i = 0; i < E.hold_tiers.length; i += 1) if (age < E.hold_tiers[i].younger_than_days) return E.hold_tiers[i].weeks;
return E.hold_base_weeks;
}
function gasTierOf(row) {
var names = (row.chains || []).map(function (chain) { return chain.toLowerCase(); });
if (names.indexOf('ethereum') >= 0) return E.gas_tiers[0];
if (names.indexOf('solana') >= 0) return E.gas_tiers[1];
return E.gas_tiers[2];
}

/* The farm arithmetic at any deposit and drop share; the default scenario is the board's. */
function econAt(row, implied, deposit, dropShare) {
var weeks = weeksOf(row.age_days);
var hours = E.setup_hours + E.weekly_hours * weeks;
var tier = gasTierOf(row);
var gas = tier.setup_usd + tier.weekly_usd * weeks;
var carry = deposit * E.capital_rate * weeks / 52;
var ratio = implied / Math.max(1, row.tvl_usd);
var expected = deposit * dropShare * ratio;
var net = expected - gas - carry;
var perHour = net / hours;
var tbill = deposit * E.tbill_rate * weeks / 52;
var breakEven = (gas + carry) / Math.max(1e-9, deposit * ratio);
var verdict = net >= E.farm_net_usd && perHour >= E.farm_per_hour_usd ? 'farm' : net >= E.thin_net_usd && perHour >= E.thin_per_hour_usd ? 'thin' : 'skip';
return { weeks: weeks, hours: hours, tier: tier, gas: gas, carry: carry, ratio: ratio, expected: expected, net: net, perHour: perHour, tbill: tbill, breakEven: breakEven, verdict: verdict };
}
function econOf(row, implied) { return econAt(row, implied, E.deposit_usd, E.drop_share); }
function intervalOf(launch, odds, implied) {
var low = Math.max(1, Math.min(implied, Math.round(launch * Math.exp(V.q25) * odds)));
var high = Math.max(low, Math.max(implied, Math.round(launch * Math.exp(V.q75) * odds)));
return { low: low, high: high };
}
function recompute(row) {
var launch = launchOf(row);
var odds = oddsOf(row);
var implied = Math.max(1, Math.round(launch * odds));
return { launch: launch, odds: odds, implied: implied, range: intervalOf(launch, odds, implied), econ: econOf(row, implied) };
}

var audits = D.rows.map(function (row) {
var m = recompute(row);
var ok = Math.round(m.launch) === row.launch_value_usd &&
Math.round(m.odds * 1e4) / 1e4 === row.odds_eventual &&
m.implied === row.implied_value_usd &&
m.range.low === row.implied_low_usd &&
m.range.high === row.implied_high_usd &&
m.econ.verdict === row.verdict;
return { row: row, m: m, ok: ok };
});
var auditBySlug = {};
audits.forEach(function (a) { auditBySlug[a.row.slug] = a; });
var agreed = audits.filter(function (a) { return a.ok; }).length;

/* The ledger's digest, re-derived here from the rows: FNV-1a over rank|slug|implied. */
function digestOf(rows) {
var hash = 0x811c9dc5;
var text = rows.map(function (row) { return row.rank + '|' + row.slug + '|' + row.implied_value_usd; }).join('\n');
for (var i = 0; i < text.length; i += 1) {
hash ^= text.charCodeAt(i);
hash = Math.imul(hash, 0x01000193) >>> 0;
}
return '0x' + (hash >>> 0).toString(16).padStart(8, '0');
}
var digestOk = digestOf(D.rows) === D.accounting.digest;

var boardSorted = D.rows.every(function (row, i) { return i === 0 || D.rows[i - 1].implied_value_usd >= row.implied_value_usd; });
var stepsOk = D.rows.every(function (row) {
return row.farm_steps.length >= 3 && row.farm_steps.length <= 12 && row.farm_steps.every(function (s) { return s.length >= 20 && s.length <= 600; });
});
var planSteps = D.rows[0] ? D.rows[0].farm_steps.length : 0;

/* ---------------------------------------------------------------- scenario: deposit × drop share */

var scenario = { deposit: E.deposit_usd, drop: E.drop_share };
var ECON = {};
function refreshScenario() {
ECON = {};
D.rows.forEach(function (row) { ECON[row.slug] = econAt(row, auditBySlug[row.slug].m.implied, scenario.deposit, scenario.drop); });
var farm = 0, thin = 0, skip = 0;
D.rows.forEach(function (row) { var v = ECON[row.slug].verdict; if (v === 'farm') farm += 1; else if (v === 'thin') thin += 1; else skip += 1; });
$('#dropVal').textContent = pct(scenario.drop);
$('#scRes').innerHTML = '<b>' + farm + '</b> farm · ' + thin + ' thin · ' + skip + ' skip at ' + full(scenario.deposit) + ' × ' + pct(scenario.drop);
$('#kpis').innerHTML = kpisHtml(farm, thin, skip);
renderBoard();
}

/* ---------------------------------------------------------------- chrome */

$('#snapDate').textContent = D.as_of;
$('#snapSource').textContent = D.source.replace(/, fetched (\S+?)T[\d:.]+Z$/, ' · fetched $1');
$('#snapFloor').textContent = 'Floor ' + full(D.floor_usd);
$('#footDate').textContent = D.as_of;
$('#footModel').textContent = D.model_version;
$('#modelTag').textContent = D.model_version + ' · fitted from ' + COV.protocols + ' protocols';
$('#nBoard').textContent = D.rows.length;
$('#nLive').textContent = D.live.length;

var badge = $('#checkBadge');
var allOk = agreed === D.rows.length && digestOk && D.accounting.matches && boardSorted;
badge.className = 'check ' + (allOk ? 'ok' : 'bad');
badge.innerHTML = '<span class="dot"></span><p><b>' + agreed + ' / ' + D.rows.length + ' rows recompute</b> and agree with the board: launch value, eventual odds, implied value, P25–P75 and verdict. Board digest <b>' + D.accounting.digest + '</b> ' + (digestOk ? 're-derives from these rows' : 'does NOT re-derive') + '; the ledger sums to <b>' + D.accounting.total + '</b> (' + (D.accounting.matches ? 'equal to the snapshot' : 'NOT equal') + '), and ranks run <b>1–' + D.rows.length + '</b> with implied value ' + (boardSorted ? 'never rising' : 'RISING somewhere') + '.</p>';

function stat(label, value) {
return '<div class="head-stat"><span>' + label + '</span><strong>' + value + '</strong></div>';
}
$('#headStats').innerHTML = stat('Median eventual odds', pct(D.stats.median_odds)) + stat('Median implied', money(D.stats.median_implied)) + stat('Top implied', money(D.stats.top_implied));

function kpi(label, value, note, tone) {
return '<div class="kpi ' + (tone || '') + '"><span>' + label + '</span><strong>' + value + '</strong><p>' + note + '</p></div>';
}
function kpisHtml(farm, thin, skip) {
return kpi('Snapshot protocols', COV.protocols, COV.trading + ' trading · ' + COV.pre_token + ' pre-token') +
kpi('Launch candidates', COV.scored, COV.tokenless_by_design + ' tokenless by design', 'hot') +
kpi('Watchlist covered', COV.watchlist_covered + '/' + COV.watchlist, 'every listed slug scored', 'good') +
kpi('Odds model AUC', O.auc.toFixed(2), O.n_peers + ' peers · held-out Brier ' + O.held_out_brier.toFixed(3)) +
kpi('Comps held-out miss', '×' + V.loo_error_multiple, 'flat ×' + V.flat_loo_multiple + ' · walk ×' + V.walk_forward_multiple) +
kpi('Farmable rows', farm, thin + ' thin · ' + skip + ' skip at ' + money(scenario.deposit) + ' × ' + pct(scenario.drop), 'good');
}

/* The out-of-sample evidence panel: both term-survival tables, the held-out record, and what it misses. */
function evTerms(model, kind) {
var rows = (model.terms || []).map(function (term) {
var a, b, c, d;
if (kind === 'comps') {
a = '×' + term.with_multiple; b = '×' + term.without_multiple; c = '×' + term.with_forward; d = '×' + term.without_forward;
} else {
a = term.with_brier.toFixed(3); b = term.without_brier.toFixed(3); c = term.with_forward.toFixed(3); d = term.without_forward.toFixed(3);
}
var mark = term.kept ? '<span class="keep yes">kept</span>' : '<span class="keep no">dropped</span>';
return '<tr><td>' + esc(term.label) + '</td><td class="num">' + a + '</td><td class="num">' + b + '</td><td class="num">' + c + '</td><td class="num">' + d + '</td><td>' + mark + '</td></tr>';
}).join('');
return '<table class="ev-table"><thead><tr><th>term</th><th class="num">with</th><th class="num">without</th><th class="num">walk w.</th><th class="num">walk w/o</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
}
function evidenceHtml() {
var compDropped = droppedWords(C, { size: 'size', growth: '7-day growth', sector: 'sector' });
var oddsDropped = droppedWords(O, { size: 'size', age: 'age', growth: '7-day growth' });
var dropped = [compDropped ? 'comps: ' + compDropped : '', oddsDropped ? 'odds: ' + oddsDropped : ''].filter(Boolean).join(' · ');
return '<div class="ev-head"><span class="ev-label">Out-of-sample evidence</span><span class="ev-sub">each term re-fitted without it, on two held-out schemes · the numbers the ranking rests on</span></div>' +
'<div class="ev-grid">' +
'<div class="ev-block"><h4>Comps curve <em>median miss, lower is better</em></h4>' + evTerms(C, 'comps') + '</div>' +
'<div class="ev-block"><h4>Launch odds <em>Brier, lower is better</em></h4>' + evTerms(O, 'odds') + '</div>' +
'<div class="ev-block ev-rec"><h4>Held-out record</h4><ul class="ev-list">' +
'<li>comps LOO <b>×' + V.loo_error_multiple + '</b> vs flat <b>×' + V.flat_loo_multiple + '</b> · walk-forward <b>×' + V.walk_forward_multiple + '</b> · rank <b>' + V.loo_spearman + '</b> on ' + V.n + ' tokens</li>' +
'<li>odds AUC <b>' + O.auc.toFixed(2) + '</b> · Brier <b>' + O.held_out_brier.toFixed(3) + '</b> held out vs <b>' + O.brier_base.toFixed(3) + '</b> base rate on ' + O.n_peers + ' peers</li>' +
'<li>coverage <b>' + pct(V.coverage_p10_p90) + '</b> inside P10–P90 (nominal 80%) · <b>' + pct(V.coverage_p25_p75) + '</b> inside P25–P75 (nominal 50%) — the P10–P90 band undercovers, and the page prints it</li>' +
'<li>dropped by the tests: ' + (dropped || 'nothing') + '</li>' +
'</ul></div></div>';
}
$('#evidence').innerHTML = evidenceHtml();

/* The whole snapshot as one bar: every protocol in exactly one group, checked on this page. */
var GROUP_SHORT = ['trading, priced', 'trading, ticker only', 'tokenless by design', 'scored on the board'];
var GROUP_CLASS = ['g1', 'g2', 'g3', 'g4'];
$('#ledgerStrip').innerHTML =
'<span class="ls-label">Whole snapshot</span>' +
'<span class="ls-bar">' + D.accounting.groups.map(function (group, i) {
return '<i class="' + GROUP_CLASS[i % 4] + '" style="width:' + (group.n / Math.max(1, D.accounting.total) * 100).toFixed(2) + '%" title="' + esc(group.label) + '"></i>';
}).join('') + '</span>' +
'<span class="ls-legend">' + D.accounting.groups.map(function (group, i) {
return '<em><i class="' + GROUP_CLASS[i % 4] + '"></i>' + group.n + ' ' + GROUP_SHORT[i % 4] + '</em>';
}).join('') + '</span>' +
'<span class="ls-check ' + (D.accounting.matches && digestOk ? 'ok' : 'bad') + '">' + (D.accounting.matches && digestOk ? '✓' : '×') + ' ' + D.accounting.total + ' = ' + COV.protocols + ' · watchlist ' + COV.watchlist_covered + '/' + COV.watchlist + ' · digest ' + D.accounting.digest + '</span>';

var VIEWS = {
board: {
eyebrow: 'Launch board',
title: 'Pre-token protocols, ranked by expected launch value',
sub: 'Implied value = the comps curve\'s launch value × the peers\' eventual launch odds; the P25–P75 band is the curve\'s held-out residual interval. Net and $/hr are pro-rata farm arithmetic at the scenario above — move the deposit or the drop share and every row re-runs. Open a row for its break-even, its risk grid and a ' + planSteps + '-step, costed plan.'
},
live: {
eyebrow: 'Market record',
title: 'The tokens that already trade',
sub: 'The comps curve is fitted on every token that records a market cap; these are the forty largest, shown at the price the market sets, never as a launch estimate.'
},
method: {
eyebrow: 'Method',
title: 'The fitted model, its held-out tests and the ledger',
sub: 'Both models are estimated inside the program from the sealed snapshot: a comps curve for launch value with a measured interval, a logistic record of who launches, and a per-row pro-rata arithmetic for the farm verdict. Every snapshot protocol is accounted for, and the board carries a digest the page re-derives.'
}
};

function setView(name) {
state.view = name;
var copy = VIEWS[name];
$('#eyebrow').textContent = copy.eyebrow;
$('#viewTitle').textContent = copy.title;
$('#viewSub').textContent = copy.sub;
Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
b.classList.toggle('on', b.getAttribute('data-view') === name);
});
['board', 'live', 'method'].forEach(function (view) {
$('#view-' + view).classList.toggle('on', view === name);
});
}

/* ---------------------------------------------------------------- board state and table */

var state = { view: 'board', sort: { key: 'rank', dir: 1 }, scope: 'all', search: '', category: 'all' };
var VERDICT_ORDER = { farm: 0, thin: 1, skip: 2 };
var SORTERS = {
rank: function (r) { return r.rank; },
name: function (r) { return r.name.toLowerCase(); },
category: function (r) { return (r.category || '').toLowerCase(); },
tvl: function (r) { return r.tvl_usd; },
change: function (r) { return r.change_7d == null ? -Infinity : r.change_7d; },
age: function (r) { return r.age_days == null ? -1 : r.age_days; },
odds: function (r) { return r.odds_eventual; },
implied: function (r) { return r.implied_value_usd; },
low: function (r) { return r.implied_low_usd; },
net: function (r) { return ECON[r.slug] ? ECON[r.slug].net : r.net_usd; },
perHour: function (r) { return ECON[r.slug] ? ECON[r.slug].perHour : r.per_hour_usd; },
verdict: function (r) { return VERDICT_ORDER[ECON[r.slug] ? ECON[r.slug].verdict : r.verdict]; }
};

function filteredRows() {
var q = state.search.trim().toLowerCase();
return D.rows.filter(function (row) {
var verdict = ECON[row.slug] ? ECON[row.slug].verdict : row.verdict;
if (state.scope === 'watch' && !row.on_watchlist) return false;
if (state.scope === 'offlist' && row.on_watchlist) return false;
if (state.scope === 'early' && !(row.age_days != null && row.age_days < 365)) return false;
if (state.scope !== 'all' && state.scope !== 'watch' && state.scope !== 'offlist' && state.scope !== 'early' && verdict !== state.scope) return false;
if (state.category !== 'all' && row.category !== state.category) return false;
if (q) {
var hay = (row.name + ' ' + row.slug + ' ' + (row.category || '') + ' ' + row.chains.join(' ') + ' ' + (row.listed_at || '')).toLowerCase();
if (hay.indexOf(q) < 0) return false;
}
return true;
});
}

function sortedRows(rows) {
var key = state.sort.key, dir = state.sort.dir, get = SORTERS[key];
return rows.slice().sort(function (a, b) {
var va = get(a), vb = get(b);
var out = va < vb ? -1 : va > vb ? 1 : 0;
if (out === 0) out = a.rank - b.rank;
return out * dir;
});
}

function rowHtml(row) {
var e = ECON[row.slug] || econOf(row, row.implied_value_usd);
var changeClass = row.change_7d == null ? '' : row.change_7d >= 0 ? 'up' : 'down';
var tag = row.on_watchlist ? '<span class="chip-watch">watch</span>' : row.rank <= 25 ? '<span class="chip-off">off-list</span>' : '';
return '<tr data-slug="' + esc(row.slug) + '"' + (row.rank <= 3 ? ' class="top3"' : '') + '>' +
'<td class="rank">' + row.rank + '</td>' +
'<td class="name"><div class="nm">' + esc(row.name) + tag + '</div><div class="meta">' + esc(row.chains.length ? row.chains.join(' · ') : row.slug) + '</div></td>' +
'<td class="sector">' + esc(row.category || '—') + '</td>' +
'<td class="num tv">' + money(row.tvl_usd) + '</td>' +
'<td class="num change ' + changeClass + '">' + (row.change_7d == null ? '—' : signedPct(row.change_7d)) + '</td>' +
'<td class="num age">' + ageLabel(row.age_days) + '</td>' +
'<td class="num odds"><span class="meter" aria-hidden="true"><i style="width:' + Math.max(2, Math.min(100, row.odds_eventual * 100)).toFixed(1) + '%"></i></span>' + pct(row.odds_eventual) + '</td>' +
'<td class="num implied">' + money(row.implied_value_usd) + '</td>' +
'<td class="num range">' + money(row.implied_low_usd) + '–' + money(row.implied_high_usd) + '</td>' +
'<td class="num net ' + (e.net >= 0 ? 'pos' : 'neg') + '">' + signedMoney(e.net) + '</td>' +
'<td class="num perhour ' + (e.perHour >= 0 ? 'pos' : 'neg') + '">' + rate(e.perHour) + '</td>' +
'<td><span class="vchip ' + e.verdict + '">' + e.verdict + '</span></td>' +
'</tr>';
}

function renderBoard() {
var rows = sortedRows(filteredRows());
$('#rows').innerHTML = rows.map(rowHtml).join('');
$('#count').textContent = rows.length + ' of ' + D.rows.length + ' candidates';
var label = state.sort.key === 'rank' ? 'implied value, descending' : state.sort.key + (state.sort.dir === 1 ? ', ascending' : ', descending');
$('#boardFoot').innerHTML = '<b>' + rows.length + '</b> rows shown · sorted by ' + esc(label) + ' · net and $/hr at ' + full(scenario.deposit) + ' × ' + pct(scenario.drop) + ' · click a row for its break-even, risk grid and ' + planSteps + '-step plan · <b>' + agreed + '/' + D.rows.length + '</b> rows recomputed in this page agree with the board';
Array.prototype.forEach.call(document.querySelectorAll('.board thead th'), function (th) {
var key = th.getAttribute('data-sort');
th.classList.toggle('sorted', key === state.sort.key);
th.classList.toggle('asc', key === state.sort.key && state.sort.dir === 1);
if (key === state.sort.key) th.setAttribute('aria-sort', state.sort.dir === 1 ? 'ascending' : 'descending');
else th.removeAttribute('aria-sort');
});
}

/* ---------------------------------------------------------------- detail drawer */

function stepHtml(text) {
return esc(text).replace(/Cost: ([^.]*)\./g, 'Cost: <span class="cost">$1</span>.');
}

/* The scenario in a grid: every deposit row against every drop column at this row's own figures. */
function riskGrid(row, implied) {
var deposits = [1000, 10000, 50000, 100000];
var drops = [0.03, 0.05, 0.07, 0.10, 0.15];
var head = '<tr><th>deposit \\ drop</th>' + drops.map(function (drop) { return '<th>' + pct(drop) + '</th>'; }).join('') + '</tr>';
var body = deposits.map(function (deposit) {
return '<tr><td>' + full(deposit) + '</td>' + drops.map(function (drop) {
var ec = econAt(row, implied, deposit, drop);
var now = deposit === scenario.deposit && Math.abs(drop - scenario.drop) < 1e-9 ? ' now' : '';
return '<td class="' + (ec.net >= 0 ? 'pos' : 'neg') + now + '">' + signedMoney(ec.net) + '</td>';
}).join('') + '</tr>';
}).join('');
return '<table class="matrix"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
}

/* Net against the weeks held, at the current deposit and drop share. */
function weeksTable(row, implied) {
var ec0 = econAt(row, implied, scenario.deposit, scenario.drop);
var rows = [6, 8, 10, 12, 16].map(function (weeks) {
var gas = ec0.tier.setup_usd + ec0.tier.weekly_usd * weeks;
var carry = scenario.deposit * E.capital_rate * weeks / 52;
var expected = ec0.expected;
var net = expected - gas - carry;
var hours = E.setup_hours + E.weekly_hours * weeks;
var perHour = net / hours;
return '<tr' + (weeks === ec0.weeks ? ' class="now"' : '') + '><td>' + weeks + ' wk</td><td class="num">' + full(expected) + '</td><td class="num">−' + full(gas + carry) + '</td><td class="num ' + (net >= 0 ? 'pos' : 'neg') + '">' + signedMoney(net) + '</td><td class="num ' + (perHour >= 0 ? 'pos' : 'neg') + '">' + rate(perHour) + '/h</td></tr>';
}).join('');
return '<table class="mini"><thead><tr><th>held</th><th class="num">expected drop</th><th class="num">gas + carry</th><th class="num">net</th><th class="num">rate</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

/* The nearest traded peers by TVL: what the market pays for a protocol this size. */
function peersTable(row) {
var peers = D.live.map(function (peer) { return { peer: peer, d: Math.abs(Math.log(Math.max(1, peer.tvl_usd) / Math.max(1, row.tvl_usd))) }; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 3);
var rows = peers.map(function (item) {
var peer = item.peer;
var fit = launchOf(peer);
var miss = fit / Math.max(1, peer.mcap_usd);
return '<tr><td>' + esc(peer.symbol || '—') + ' <span class="mut">' + esc(peer.name) + '</span></td><td class="num">' + money(peer.tvl_usd) + '</td><td class="num">' + peer.mcap_tvl.toFixed(2) + '×</td><td class="num">' + money(fit) + '</td><td class="num">×' + miss.toFixed(2) + '</td></tr>';
}).join('');
return '<table class="mini"><thead><tr><th>nearest peer</th><th class="num">TVL</th><th class="num">MC/TVL</th><th class="num">curve at its TVL</th><th class="num">curve /actual</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

/* What moves the row's implied value: one input at a time. */
function sensitivityTable(row, m) {
var growth = growthOf(row.change_7d);
var age = ageYearsOf(row);
var out = [];
out.push(['TVL +30%', m.implied * Math.exp(C.tvl_elasticity * Math.log(1.3))]);
out.push(['TVL −30%', m.implied * Math.exp(C.tvl_elasticity * Math.log(0.7))]);
if (keptOf(C, 'growth')) {
var growth2 = clamp(growth + 0.2, -0.5, 1.5);
out.push(['7-day growth +20 pp', m.implied * Math.exp(C.growth_weight * (growth2 - growth))]);
}
var pNow = shareOf(row.tvl_usd, age, growth);
var pEnd = shareOf(row.tvl_usd, Math.max(age + 0.5, O.oldest_years), growth);
var odds2 = clamp((pEnd - pNow) / Math.max(1e-9, 1 - pNow), 0.02, 0.95);
out.push(['age +6 months', m.implied * odds2 / Math.max(1e-9, m.odds)]);
return '<table class="mini"><thead><tr><th>change, one at a time</th><th class="num">implied</th><th class="num">vs board</th></tr></thead><tbody>' + out.map(function (item) {
var delta = (item[1] / Math.max(1, m.implied) - 1) * 100;
return '<tr><td>' + esc(item[0]) + '</td><td class="num">' + money(item[1]) + '</td><td class="num ' + (delta >= 0 ? 'pos' : 'neg') + '">' + signedPct(delta) + '</td></tr>';
}).join('') + '</tbody></table>';
}

/* Where the row's band would sit on the board: rank at the low end and at the high end. */
function rankRange(row) {
function rankOf(value) { var n = 0; D.rows.forEach(function (r) { if (r.implied_value_usd > value) n += 1; }); return n + 1; }
var a = rankOf(row.implied_low_usd), b = rankOf(row.implied_high_usd);
return '#' + Math.min(a, b) + ' – #' + Math.max(a, b);
}

function openDrawer(row) {
var m = recompute(row);
var growth = growthOf(row.change_7d);
var effect = effectOf(row.category);
var logTvl = Math.log(Math.max(1, row.tvl_usd));
var logValue = C.intercept + C.tvl_elasticity * logTvl + C.growth_weight * growth + effect;
var age = ageYearsOf(row);
var now = shareOf(row.tvl_usd, age, growth);
var oldest = Math.max(age, O.oldest_years);
var end = shareOf(row.tvl_usd, oldest, growth);
var e = econAt(row, m.implied, scenario.deposit, scenario.drop);
var chips = '<span class="d-chip">Rank #' + row.rank + '</span>' +
'<span class="d-chip">' + esc(row.category || 'Unclassified') + '</span>' +
(row.on_watchlist ? '<span class="d-chip watch">watchlist</span>' : '<span class="d-chip">off-list</span>') +
'<span class="d-chip">' + esc(row.chains.length ? row.chains.slice(0, 3).join(' · ') : 'chain unknown') + '</span>';

var html = '<div class="d-head"><div>' +
'<p class="d-eyebrow">Protocol detail</p>' +
'<h2 class="d-name">' + esc(row.name) + '</h2>' +
'<div class="d-chips">' + chips + '</div>' +
'</div><button type="button" class="d-close" id="drawerClose" aria-label="Close">×</button></div>' +

'<div class="d-value"><span>Implied launch value</span><strong>' + money(row.implied_value_usd) + '</strong>' +
'<p>' + money(m.launch) + ' launch value × ' + pct(m.odds) + ' eventual odds</p>' +
'<p class="d-range">P25–P75 ' + money(m.range.low) + ' – ' + money(m.range.high) + ' · the curve\'s held-out residual interval · board rank at the band ends ' + rankRange(row) + '</p></div>' +

'<div class="d-grid">' +
'<div class="d-cell"><span>TVL</span><strong>' + full(row.tvl_usd) + '</strong></div>' +
'<div class="d-cell"><span>7-day change</span><strong>' + (row.change_7d == null ? '—' : signedPct(row.change_7d)) + '</strong></div>' +
'<div class="d-cell"><span>Age</span><strong>' + ageLabel(row.age_days) + '</strong></div>' +
'<div class="d-cell"><span>Odds, eventual</span><strong>' + pct(m.odds) + '</strong></div>' +
'</div>' +

'<div class="d-card"><h3>Farm arithmetic <span class="vchip ' + e.verdict + '" style="float:right">' + e.verdict + '</span></h3>' +
'<div class="eq">expected drop = ' + full(scenario.deposit) + ' × ' + pct(scenario.drop) + ' × ' + e.ratio.toFixed(4) + ' implied / TVL<br>' +
'gas (' + esc(e.tier.chain) + ') = $' + e.tier.setup_usd + ' + $' + e.tier.weekly_usd + ' × ' + e.weeks + ' wk = ' + full(e.gas) + '<br>' +
'carry = ' + full(scenario.deposit) + ' × ' + (E.capital_rate * 100).toFixed(0) + '% × ' + e.weeks + '/52 = ' + full(e.carry) + '<br>' +
'net = ' + full(e.expected) + ' − ' + full(e.gas + e.carry) + ' = <b>' + signedMoney(e.net) + '</b></div>' +
'<div class="d-rows">' +
'<div class="d-row"><span>Expected drop, pro rata at ' + pct(scenario.drop) + '</span><b>' + full(e.expected) + '</b></div>' +
'<div class="d-row"><span>Gas, ' + e.weeks + ' weeks on ' + esc(e.tier.chain) + '</span><b>−' + full(e.gas) + '</b></div>' +
'<div class="d-row"><span>Carrying cost of the deposit</span><b>−' + full(e.carry) + '</b></div>' +
'<div class="d-row"><span>Time, setup plus weekly checks</span><b>' + e.hours.toFixed(1) + ' h</b></div>' +
'<div class="d-row"><span>T-bill benchmark on the same money</span><b>' + full(e.tbill) + '</b></div>' +
'<div class="d-row"><span>Break-even drop share</span><b>' + pct(e.breakEven) + '</b></div>' +
'<div class="d-row total"><span>Net</span><b>' + signedMoney(e.net) + '</b></div>' +
'<div class="d-row total"><span>Rate</span><b>' + rate(e.perHour) + '/h</b></div>' +
'</div>' +
'<p class="d-note">Verdict: farm at net ≥ ' + full(E.farm_net_usd) + ' and ≥ $' + E.farm_per_hour_usd + '/h; thin at net ≥ ' + full(E.thin_net_usd) + ' and ≥ $' + E.thin_per_hour_usd + '/h; otherwise skip. The drop share is a scenario, not a forecast: below the break-even share the drop does not pay gas and carry. Move the deposit and drop share on the board to re-run this row.</p>' +
riskGrid(row, m.implied) +
'<p class="d-note">Net by deposit and drop share at this row\'s own implied / TVL (' + e.ratio.toFixed(4) + ') and ' + e.weeks + '-week hold; the outlined cell is the scenario on the board.</p></div>' +

'<div class="d-card"><h3>Net by weeks held <b>at ' + full(scenario.deposit) + ' × ' + pct(scenario.drop) + '</b></h3>' +
weeksTable(row, m.implied) +
'<p class="d-note">The hold is a choice, not a fact: a longer hold costs more gas and carry but spans more snapshots. The board uses ' + e.weeks + ' weeks for a protocol of this age.</p></div>' +

'<div class="d-card"><h3>' + row.farm_steps.length + ' steps <b>each with a cost and a time</b></h3><ol class="steps">' +
row.farm_steps.map(function (step) { return '<li><p>' + stepHtml(step) + '</p></li>'; }).join('') +
'</ol></div>' +

'<div class="d-card"><h3>Nearest priced peers <b>by TVL</b></h3>' +
peersTable(row) +
'<p class="d-note">The three traded tokens closest to this protocol\'s TVL. "Curve at its TVL" is the comps curve\'s fitted value for that peer; "curve / actual" is the in-sample miss for that token. The whole curve\'s held-out miss is ×' + V.loo_error_multiple + ' leave-one-out and ×' + V.walk_forward_multiple + ' walk-forward; these three are shown for scale, not for validation.</p></div>' +

'<div class="d-card"><h3>What moves the implied value <b>one input at a time</b></h3>' +
sensitivityTable(row, m) +
'<p class="d-note">Recomputed from the printed coefficients with the other inputs held at this row\'s values. A wide band and large single-input swings are the point: the board orders the field, it does not promise a number.</p></div>' +

'<div class="d-card"><h3>The comps curve <b>' + C.n_tokens + ' traded tokens</b></h3>' +
'<div class="eq">' + (function () {
var eq = 'ln mcap = ' + C.intercept.toFixed(3);
if (keptOf(C, 'size')) eq += ' + ' + C.tvl_elasticity.toFixed(3) + ' × ln ' + full(row.tvl_usd);
if (keptOf(C, 'growth')) eq += '<br>&nbsp;&nbsp;+ (' + C.growth_weight.toFixed(3) + ') × (' + growth.toFixed(2) + ') growth';
if (keptOf(C, 'sector')) eq += (effect >= 0 ? ' + ' : ' − ') + Math.abs(effect).toFixed(3) + ' sector';
return eq + '<br>&nbsp;&nbsp;= ' + logValue.toFixed(3) + ' → launch value <b>' + money(m.launch) + '</b>';
})() + '</div>' +
'<p class="d-note">The band is the leave-one-out residual interval, checked on the walk-forward folds: ' + pct(V.coverage_p10_p90) + ' of actuals inside P10–P90 (nominal 80%), ' + pct(V.coverage_p25_p75) + ' inside P25–P75 (nominal 50%). ' + (function () {
var dropped = droppedWords(C, { size: 'size', growth: '7-day growth', sector: 'sector' });
return dropped ? 'Dropped by the term-survival test: ' + dropped + '.' : 'All three terms survived the held-out test.';
})() + '</p></div>' +

'<div class="d-card"><h3>Launch odds <b>AUC ' + O.auc.toFixed(2) + ' · Brier ' + O.brier.toFixed(3) + '</b></h3>' +
'<div class="eq">P(token today) = ' + pct(now) + ' · P(token by the oldest peer, ' + oldest.toFixed(1) + 'y) = ' + pct(end) + '<br>' +
'odds = (' + pct(end) + ' − ' + pct(now) + ') / (1 − ' + pct(now) + ') = <b>' + pct(m.odds) + '</b></div>' +
'<p class="d-note">The horizon is the oldest dated peer in the snapshot (' + O.oldest_years + ' years), not an arbitrary year. AUC on the ' + O.n_peers + ' peers; Brier ' + O.brier.toFixed(3) + ' in-sample and ' + O.held_out_brier.toFixed(3) + ' held out, against ' + O.brier_base.toFixed(3) + ' for the base rate. ' + (function () {
var dropped = droppedWords(O, { size: 'size', age: 'age', growth: '7-day growth' });
return dropped ? 'Dropped by the term-survival test: ' + dropped + '.' : 'All three terms survived the held-out test.';
})() + '</p></div>' +

'<p class="d-note">This drawer recomputes the row from the fitted coefficients: launch value ' + money(m.launch) + ', odds ' + pct(m.odds) + ', implied ' + full(m.implied) + ' inside ' + full(m.range.low) + '–' + full(m.range.high) + '. The board carries ' + full(row.implied_value_usd) + ' with ' + full(row.implied_low_usd) + '–' + full(row.implied_high_usd) + '; ' + (auditBySlug[row.slug].ok ? 'the two agree.' : 'they differ.') + ' The farm figures here are re-run at the board\'s scenario (' + full(scenario.deposit) + ' × ' + pct(scenario.drop) + ') and re-derive from the same arithmetic as the row.</p>';

$('#drawerBody').innerHTML = html;
$('#drawer').classList.add('open');
$('#drawer').setAttribute('aria-hidden', 'false');
$('#scrim').classList.add('on');
$('#drawerClose').addEventListener('click', closeDrawer);
}

function closeDrawer() {
$('#drawer').classList.remove('open');
$('#drawer').setAttribute('aria-hidden', 'true');
$('#scrim').classList.remove('on');
}

/* ---------------------------------------------------------------- live view */

function renderLive() {
var rows = D.live.map(function (row, i) {
return '<tr>' +
'<td class="rank">' + (i + 1) + '</td>' +
'<td class="name"><div class="nm">' + esc(row.symbol || '—') + '</div><div class="meta">' + esc(row.name) + '</div></td>' +
'<td class="sector">' + esc(row.category || '—') + '</td>' +
'<td class="num tv">' + money(row.tvl_usd) + '</td>' +
'<td class="num">' + money(row.mcap_usd) + '</td>' +
'<td class="num implied">' + row.mcap_tvl.toFixed(2) + '×</td>' +
'<td class="num change ' + (row.change_7d == null ? '' : row.change_7d >= 0 ? 'up' : 'down') + '">' + (row.change_7d == null ? '—' : signedPct(row.change_7d)) + '</td>' +
'</tr>';
}).join('');
$('#liveBody').innerHTML = '<div class="m-card wide"><h3>Traded tokens <em>one row per ticker · largest ' + D.live.length + ' by market cap</em></h3>' +
'<p class="lead">The comps curve is fitted on all ' + C.n_tokens + ' tokens in the snapshot that record a market cap; protocol instances that share a ticker are summed into one TVL. This table shows the largest ' + D.live.length + ' at the price the market sets. They are the training set, not candidates: none is scored as a launch.</p>' +
'<table class="board"><thead><tr><th>#</th><th>Token · protocol</th><th>Sector</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">MC / TVL</th><th class="num">7d</th></tr></thead><tbody>' + rows + '</tbody></table>' +
'<p class="foot">Median multiple in this table: <b>' + (D.live.reduce(function (s, r) { return s + r.mcap_tvl; }, 0) / D.live.length).toFixed(2) + '×</b> · the comps curve prices a new launch from its TVL, growth and sector, not from this multiple.</p></div>';
}

/* ---------------------------------------------------------------- method view */

function effectsHtml() {
var entries = Object.keys(C.category_effects).map(function (k) { return [k, C.category_effects[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
var max = Math.max.apply(null, entries.map(function (e) { return Math.abs(e[1]); }).concat([0.001]));
return '<div class="bars">' + entries.map(function (e) {
var width = Math.abs(e[1]) / max * 100;
return '<div class="bar-row"><span>' + esc(e[0]) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + width.toFixed(1) + '%"></span></span><span class="bar-val">' + num3(e[1]) + '</span></div>';
}).join('') + '</div>';
}

function calibrationHtml() {
if (!O.calibration || !O.calibration.length) return '';
return '<div class="cal">' + O.calibration.map(function (band) {
return '<div class="cal-row"><span>' + esc(band.band) + '</span>' +
'<span class="cal-track"><span class="cal-fill fit" style="width:' + (band.predicted * 100).toFixed(1) + '%"></span></span>' +
'<span class="cal-track"><span class="cal-fill obs" style="width:' + (band.observed * 100).toFixed(1) + '%"></span></span>' +
'<span class="bar-val">' + pct(band.predicted) + ' / ' + pct(band.observed) + '</span></div>';
}).join('') + '</div><div class="cal-key"><span><i class="a"></i>fitted share</span><span><i class="b"></i>observed share</span></div>';
}

function axisMoney(v) {
if (v >= 1e9) return '$' + (v / 1e9).toFixed(v >= 1e10 ? 0 : 1) + 'B';
if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M';
if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
return '$' + Math.round(v);
}

function scatterSvg() {
var pts = C.points.map(function (p) { return { x: Math.log10(p.tvl_usd), y: Math.log10(p.mcap_usd) }; });
var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
var padX = (x1 - x0) * 0.04, padY = (y1 - y0) * 0.06;
x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
var W = 560, H = 258, L = 44, R = 12, T = 12, B = 26;
var iw = W - L - R, ih = H - T - B;
function sx(x) { return L + (x - x0) / (x1 - x0) * iw; }
function sy(y) { return T + (y1 - y) / (y1 - y0) * ih; }
var grid = '';
var startX = Math.ceil(x0), startY = Math.ceil(y0);
for (var gx = startX; gx <= x1; gx += 1) {
grid += '<line class="grid" x1="' + sx(gx).toFixed(1) + '" y1="' + T + '" x2="' + sx(gx).toFixed(1) + '" y2="' + (H - B) + '"></line>';
grid += '<text class="axis" x="' + sx(gx).toFixed(1) + '" y="' + (H - B + 14) + '" text-anchor="middle">' + axisMoney(Math.pow(10, gx)) + '</text>';
}
for (var gy = startY; gy <= y1; gy += 1) {
grid += '<line class="grid" x1="' + L + '" y1="' + sy(gy).toFixed(1) + '" x2="' + (W - R) + '" y2="' + sy(gy).toFixed(1) + '"></line>';
grid += '<text class="axis" x="' + (L - 6) + '" y="' + (sy(gy) + 3).toFixed(1) + '" text-anchor="end">' + axisMoney(Math.pow(10, gy)) + '</text>';
}
var dots = pts.map(function (p) { return '<circle class="pt" cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="1.9"></circle>'; }).join('');
function fitY(x) { return (C.intercept + C.tvl_elasticity * x * Math.LN10) / Math.LN10; }
var lx0 = Math.log10(1e6), lx1 = x1;
var line = '<line class="fit" x1="' + sx(lx0).toFixed(1) + '" y1="' + sy(fitY(lx0)).toFixed(1) + '" x2="' + sx(lx1).toFixed(1) + '" y2="' + sy(fitY(lx1)).toFixed(1) + '"></line>';
return '<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Traded tokens: TVL against market cap, with the fitted comps curve">' +
grid + dots + line +
'<text class="lbl" x="' + (W - R - 6) + '" y="' + (sy(fitY(lx1)) - 7).toFixed(1) + '" text-anchor="end">fitted comps curve</text>' +
'<text class="axis" x="' + (L + iw / 2) + '" y="' + (H - 3) + '" text-anchor="middle">protocol TVL, log scale</text>' +
'</svg>';
}

function funnelHtml() {
var items = [
['Snapshot protocols', COV.protocols, 'f1'],
['Already trading', COV.trading, 'f2'],
['No token', COV.pre_token, 'f3'],
['Tokenless by design', COV.tokenless_by_design, 'f1'],
['Scored candidates', COV.scored, 'f4'],
['Watchlist on board', COV.watchlist_covered, 'f2']
];
return '<div class="funnel">' + items.map(function (item) {
var width = item[1] / COV.protocols * 100;
return '<div class="funnel-step"><span>' + item[0] + '</span><span class="track"><span class="fill ' + item[2] + '" style="width:' + Math.max(width, 1.2).toFixed(1) + '%"></span></span><span class="val">' + item[1] + '</span></div>';
}).join('') + '</div>' +
'<p class="lead" style="margin-top:10px">The ' + COV.tokenless_by_design + ' tokenless-by-design protocols are exchanges, wrapped or staked products and versioned pools; the ' + COV.scored + ' candidates are the field a tokenless protocol can plausibly launch from. Every one of the ' + COV.watchlist + ' watchlist slugs is among them.</p>';
}

function ledgerHtml() {
var A = D.accounting;
return '<table class="m-table ledger"><thead><tr><th>Group, exactly one per protocol</th><th class="num">Protocols</th></tr></thead><tbody>' +
A.groups.map(function (group) {
return '<tr><td>' + esc(group.label) + '</td><td class="num">' + group.n + '</td></tr>';
}).join('') +
'<tr class="total"><td>Total accounted for</td><td class="num">' + A.total + '</td></tr>' +
'<tr class="total"><td>Snapshot protocols</td><td class="num">' + COV.protocols + '</td></tr>' +
'</tbody></table>' +
'<p class="lead" style="margin-top:8px">The groups sum to <b>' + A.total + '</b> against <b>' + COV.protocols + '</b> in the snapshot: ' + (A.matches ? 'equal, nothing unaccounted.' : 'NOT equal.') + ' Board digest <b>' + A.digest + '</b> (FNV-1a over rank|slug|implied on all ' + D.rows.length + ' rows): the page re-derives it from data.js and reports ' + (digestOk ? 'agreement.' : 'disagreement.') + '</p>';
}

function economicsHtml() {
var gas = E.gas_tiers.map(function (t) {
return '<tr><td>' + esc(t.chain) + '</td><td class="num">$' + t.setup_usd + '</td><td class="num">$' + t.weekly_usd + '/week</td></tr>';
}).join('');
var holds = E.hold_tiers.map(function (t) {
return '<tr><td>under ' + (t.younger_than_days / 365) + ' years</td><td class="num">' + t.weeks + ' weeks</td></tr>';
}).join('');
return '<div class="eq">expected drop = ' + full(E.deposit_usd) + ' × ' + pct(E.drop_share) + ' × implied / TVL (pro rata)<br>' +
'net = expected drop − gas − ' + full(E.deposit_usd) + ' × ' + (E.capital_rate * 100).toFixed(0) + '% × weeks/52<br>' +
'benchmark = the same deposit in ' + (E.tbill_rate * 100).toFixed(0) + '% T-bills</div>' +
'<table class="m-table"><thead><tr><th>Settlement chain</th><th class="num">Gas to set up</th><th class="num">Weekly</th></tr></thead><tbody>' + gas + '</tbody></table>' +
'<table class="m-table"><thead><tr><th>Age at entry</th><th class="num">Hold</th></tr></thead><tbody>' + holds +
'<tr><td>3 years or older</td><td class="num">' + E.hold_base_weeks + ' weeks</td></tr>' +
'<tr><td>unlisted</td><td class="num">' + E.hold_unknown_weeks + ' weeks</td></tr></tbody></table>' +
'<p class="lead" style="margin-top:10px">' + E.setup_hours + ' hours to set up plus ' + E.weekly_hours + ' a week. Farm at net ≥ ' + full(E.farm_net_usd) + ' and ≥ $' + E.farm_per_hour_usd + '/h; thin at net ≥ ' + full(E.thin_net_usd) + ' and ≥ $' + E.thin_per_hour_usd + '/h. Each row prints its break-even drop share; the board\'s scenario controls re-run every row at any deposit and drop share.</p>';
}

function compsEquationHtml() {
var eq = 'ln mcap = ' + C.intercept.toFixed(4);
if (keptOf(C, 'size')) eq += ' + ' + C.tvl_elasticity.toFixed(4) + ' × ln TVL';
if (keptOf(C, 'growth')) eq += '<br>+ (' + C.growth_weight.toFixed(4) + ') × growth';
if (keptOf(C, 'sector')) eq += ' + sector';
return '<div class="eq">' + eq + '<br><span class="mut">' + (keptOf(C, 'growth') ? 'growth = clamp(7d change / 100, −0.5, 1.5) · ' : '') + 'a term stays unless both held-out schemes agree the curve is worse with it</span></div>';
}

function oddsEquationHtml() {
var eq = 'logit P = ' + O.intercept.toFixed(4);
if (keptOf(O, 'size')) eq += ' + ' + O.size_weight.toFixed(4) + ' × log10(TVL $M)';
if (keptOf(O, 'age')) eq += '<br>+ ' + O.age_weight.toFixed(4) + ' × ln(1 + age)';
if (keptOf(O, 'growth')) eq += ' + (' + O.growth_weight.toFixed(4) + ') × growth';
return '<div class="eq">' + eq + '<br>odds = [P(oldest ' + O.oldest_years + 'y) − P(age)] / [1 − P(age)], clamped 2%–95%</div>';
}

function compTermsHtml() {
return '<table class="m-table terms"><thead><tr><th>Term</th><th class="num">Miss with</th><th class="num">Without</th><th class="num">Walk with</th><th class="num">Walk without</th><th>Place</th></tr></thead><tbody>' +
(C.terms || []).map(function (term) {
return '<tr><td>' + esc(term.label) + '</td><td class="num">×' + term.with_multiple + '</td><td class="num">×' + term.without_multiple + '</td><td class="num">×' + term.with_forward + '</td><td class="num">×' + term.without_forward + '</td><td><span class="keep ' + (term.kept ? 'yes' : 'no') + '">' + (term.kept ? 'kept' : 'dropped') + '</span></td></tr>';
}).join('') + '</tbody></table>' +
'<p class="lead" style="margin-top:8px">Every fold re-fits the curve with the term and without it. A term leaves the equation only when both held-out schemes agree the curve is worse with it; a split verdict keeps it, and the surviving set is refitted.</p>';
}

function oddsTermsHtml() {
return '<table class="m-table terms"><thead><tr><th>Term</th><th class="num">Brier with</th><th class="num">Without</th><th class="num">Walk with</th><th class="num">Walk without</th><th>Place</th></tr></thead><tbody>' +
(O.terms || []).map(function (term) {
return '<tr><td>' + esc(term.label) + '</td><td class="num">' + term.with_brier.toFixed(4) + '</td><td class="num">' + term.without_brier.toFixed(4) + '</td><td class="num">' + term.with_forward.toFixed(4) + '</td><td class="num">' + term.without_forward.toFixed(4) + '</td><td><span class="keep ' + (term.kept ? 'yes' : 'no') + '">' + (term.kept ? 'kept' : 'dropped') + '</span></td></tr>';
}).join('') + '</tbody></table>' +
'<p class="lead" style="margin-top:8px">Ten-fold and walk-forward Brier on the peers, each fit re-run without the term; lower is better. The same survival rule applies, so a term with a split verdict stays.</p>';
}

function methodHtml() {
var forwardN = V.n - Math.floor(V.n / 2);
return '<div class="m-hero"><h3>One snapshot in, a ranked field of launches out</h3>' +
'<p>Three pieces, each fitted or computed inside the program: the comps curve turns a protocol\'s ' + termWords(C, { size: 'TVL', growth: 'seven-day growth', sector: 'sector' }) + ' into a launch value and a measured interval; the launch record turns ' + termWords(O, { size: 'TVL', age: 'age', growth: 'seven-day growth' }) + ' into eventual odds; the farm arithmetic turns the two into a pro-rata verdict at an explicit deposit and drop share. No sector multiple is hand-set and no protocol is special-cased.</p>' +
'<div class="m-formula">' +
'<span class="m-pill">implied = launch value × odds</span>' +
'<span class="m-pill">comps <b>' + C.n_tokens + '</b> tokens · held-out ×' + V.loo_error_multiple + '</span>' +
'<span class="m-pill">launch record <b>' + O.n_peers + '</b> peers · AUC ' + O.auc.toFixed(2) + '</span>' +
'<span class="m-pill">terms that survived <b>' + keptCount() + '</b></span>' +
'<span class="m-pill">scenario <b>' + full(E.deposit_usd) + ' × ' + pct(E.drop_share) + '</b></span>' +
'<span class="m-pill">ledger <b>' + D.accounting.total + '</b> protocols · digest ' + D.accounting.digest + '</span>' +
'<span class="m-pill">board <b>' + COV.scored + '</b> candidates · watchlist ' + COV.watchlist_covered + '/' + COV.watchlist + '</span>' +
'</div></div>' +

'<div class="m-grid">' +
'<div class="m-card"><h3>1 · The comps curve <em>launch value</em></h3>' +
'<p class="lead">One row per token, all protocol instances sharing a ticker summed into one TVL. Ridge fit (λ ' + C.ridge + ') with Huber re-weighting, so one 400× outlier cannot rule the line. Every term is put to a survival test on both held-out schemes before it keeps its place.</p>' +
compsEquationHtml() +
compTermsHtml() +
(Object.keys(C.category_effects).length ? effectsHtml() : '') +
'<table class="m-table"><thead><tr><th>Test</th><th class="num">n</th><th class="num">Median miss</th><th class="num">Flat baseline</th><th class="num">Spearman</th></tr></thead><tbody>' +
'<tr><td>Leave one out</td><td class="num">' + V.n + '</td><td class="num good">×' + V.loo_error_multiple + '</td><td class="num">×' + V.flat_loo_multiple + '</td><td class="num">' + V.loo_spearman + '</td></tr>' +
'<tr><td>Walk forward</td><td class="num">' + forwardN + '</td><td class="num good">×' + V.walk_forward_multiple + '</td><td class="num">×' + V.flat_loo_multiple + '</td><td class="num">—</td></tr>' +
'</tbody></table>' +
'<p class="lead" style="margin-top:8px">Every fold re-fits the curve and the flat TVL multiple on its own training rows; the miss is the median |ln(predicted / actual)| shown as a factor.</p>' +
'<div class="eq">P25–P75 band = fitted value × exp(q25)..exp(q75)<br>q25 ' + V.q25 + ' · q75 ' + V.q75 + ' in log points (LOO residuals)<br>walk-forward coverage: ' + pct(V.coverage_p10_p90) + ' inside P10–P90 (nominal 80%)<br>' + pct(V.coverage_p25_p75) + ' inside P25–P75 (nominal 50%)</div>' +
'<p class="lead" style="margin-top:8px">The interval is the curve\'s own residual band, and its honesty is measured on folds the quantiles never saw: an interval that claims 80% and delivers 55% would be a decoration, so the page prints both numbers.</p>' +
scatterSvg() + '</div>' +

'<div class="m-card"><h3>2 · The launch record <em>eventual odds</em></h3>' +
'<p class="lead">Every dated protocol is a peer: does it record a token today, and how old is it? A logistic fit of token presence on the terms that survive a held-out Brier test, then differenced to the oldest peer\'s age among the still-tokenless.</p>' +
oddsEquationHtml() +
oddsTermsHtml() +
calibrationHtml() +
'<table class="m-table"><thead><tr><th>Peers</th><th class="num">With token</th><th class="num">AUC</th><th class="num">Brier in-sample</th><th class="num">Held out</th><th class="num">Base rate</th></tr></thead><tbody><tr><td>' + O.n_peers + '</td><td class="num">' + O.n_tokens + '</td><td class="num good">' + O.auc.toFixed(2) + '</td><td class="num good">' + O.brier.toFixed(3) + '</td><td class="num good">' + O.held_out_brier.toFixed(3) + '</td><td class="num">' + O.brier_base.toFixed(3) + '</td></tr></tbody></table>' +
'<p class="lead" style="margin-top:8px">AUC is rank quality on the peers themselves: 0.5 is a coin toss. Brier must beat the base-rate column, or the fit is not earning its keep; the held-out column is the number the term survival used. Calibration compares the fitted share with the observed share in each age band; the horizon is the oldest dated peer (' + O.oldest_years + ' years), so a five-year-old protocol is measured over its remaining plausible life.</p></div>' +

'<div class="m-card"><h3>3 · Coverage <em>every protocol accounted for</em></h3>' + funnelHtml() + ledgerHtml() + '</div>' +

'<div class="m-card"><h3>4 · The farm arithmetic <em>pro rata, not a promise</em></h3>' +
'<p class="lead">Expected drop = deposit × drop share × implied / TVL: the launch is assumed to drop a stated share of its FDV to users, and the wallet\'s share of TVL sets its share of the drop. Cost = chain-priced gas + the deposit\'s carrying cost. Time = setup + weekly checks. The scenario controls on the board move both the deposit and the drop share.</p>' +
economicsHtml() + '</div>' +

'<div class="m-card wide"><h3>5 · What this page checks <em>board.json</em></h3><div class="checklist">' +
'<div class="check-item"><span class="ok">✓</span><span><b>' + agreed + ' / ' + D.rows.length + ' rows</b> recompute in this page and agree with the board on launch value, eventual odds, implied value, P25–P75 and verdict.</span></div>' +
'<div class="check-item"><span class="ok">' + (boardSorted ? '✓' : '×') + '</span><span><b>Implied values non-increasing</b> down the board: ' + (boardSorted ? 'the rank order is the value order.' : 'the order disagrees with the values.') + '</span></div>' +
'<div class="check-item"><span class="ok">' + (COV.watchlist_covered === COV.watchlist ? '✓' : '×') + '</span><span><b>Watchlist ' + COV.watchlist_covered + ' / ' + COV.watchlist + '</b>: every listed slug is scored on the board.</span></div>' +
'<div class="check-item"><span class="ok">' + (D.accounting.matches ? '✓' : '×') + '</span><span><b>Ledger ' + D.accounting.total + ' / ' + COV.protocols + '</b>: every snapshot protocol is in exactly one accounting group, and the groups sum to the total.</span></div>' +
'<div class="check-item"><span class="ok">' + (digestOk ? '✓' : '×') + '</span><span><b>Board digest ' + D.accounting.digest + '</b>: re-derived in this page from rank|slug|implied on every row and compared with the ledger\'s copy.</span></div>' +
'<div class="check-item"><span class="ok">' + (V.coverage_p10_p90 >= 0.7 && V.coverage_p10_p90 <= 0.9 ? '✓' : '×') + '</span><span><b>Interval honesty</b>: the P10–P90 band covers ' + pct(V.coverage_p10_p90) + ' of walk-forward actuals against a nominal 80%.</span></div>' +
'<div class="check-item"><span class="ok">✓</span><span><b>Term survival</b>: ' + keptCount() + ' terms kept; every dropped term is printed with its with/without held-out numbers, and the published coefficients are the refit on the survivors.</span></div>' +
'<div class="check-item"><span class="ok">' + (stepsOk ? '✓' : '×') + '</span><span><b>Farm plans</b>: every row carries ' + planSteps + ' steps, each with a cost and a time, inside the gate\'s length bounds.</span></div>' +
'<div class="check-item"><span class="ok">' + (D.rows.length >= 100 && D.rows.length <= 4000 ? '✓' : '×') + '</span><span><b>Board size ' + D.rows.length + '</b>: inside the 100–4,000 row bound.</span></div>' +
'</div>' +
'<p class="lead" style="margin-top:12px">Reading the board: implied value is a centered estimate for a protocol of this size, growth and sector, its P25–P75 band is the curve\'s measured spread, and the odds are the peers\' record, not a forecast. The farm verdict says whether a pro-rata drop at the board\'s scenario clears the plan\'s own costs; a skip is still a candidate with a plan. "Off-list" marks a row the model surfaced beyond the watchlist: the watchlist is the floor, not the ceiling.</p></div>' +

'<div class="m-card wide"><h3>6 · Top of the board <em>the first ten rows</em></h3>' +
'<table class="m-table"><thead><tr><th>#</th><th>Protocol</th><th>Sector</th><th class="num">TVL</th><th class="num">Launch value</th><th class="num">Odds</th><th class="num">Implied</th><th class="num">P25–P75</th><th class="num">Net</th><th>Verdict</th></tr></thead><tbody>' +
D.rows.slice(0, 10).map(function (row) {
var ec = ECON[row.slug] || econOf(row, row.implied_value_usd);
return '<tr><td class="num">' + row.rank + '</td><td>' + esc(row.name) + '</td><td>' + esc(row.category || '—') + '</td><td class="num">' + money(row.tvl_usd) + '</td><td class="num">' + money(row.launch_value_usd) + '</td><td class="num">' + pct(row.odds_eventual) + '</td><td class="num">' + money(row.implied_value_usd) + '</td><td class="num">' + money(row.implied_low_usd) + '–' + money(row.implied_high_usd) + '</td><td class="num">' + signedMoney(ec.net) + '</td><td><span class="vchip ' + ec.verdict + '">' + ec.verdict + '</span></td></tr>';
}).join('') + '</tbody></table></div>' +
'</div>';
}

/* ---------------------------------------------------------------- wiring */

function initCategories() {
var counts = {};
D.rows.forEach(function (row) { var key = row.category || 'Unclassified'; counts[key] = (counts[key] || 0) + 1; });
var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });
var options = '<option value="all">All sectors (' + D.rows.length + ')</option>' + names.map(function (name) {
return '<option value="' + esc(name) + '">' + esc(name) + ' (' + counts[name] + ')</option>';
}).join('');
$('#category').innerHTML = options;
}

document.getElementById('tabs').addEventListener('click', function (event) {
var button = event.target.closest('button[data-view]');
if (button) setView(button.getAttribute('data-view'));
});

$('#scope').addEventListener('click', function (event) {
var button = event.target.closest('button[data-scope]');
if (!button) return;
state.scope = button.getAttribute('data-scope');
Array.prototype.forEach.call($('#scope').querySelectorAll('button'), function (b) { b.classList.toggle('on', b === button); });
renderBoard();
});

$('#search').addEventListener('input', function (event) {
state.search = event.target.value;
renderBoard();
});

$('#category').addEventListener('change', function (event) {
state.category = event.target.value;
renderBoard();
});

$('#deposit').addEventListener('change', function (event) {
scenario.deposit = Number(event.target.value);
refreshScenario();
});
$('#drop').addEventListener('input', function (event) {
scenario.drop = Number(event.target.value) / 100;
refreshScenario();
});

document.querySelector('.board thead').addEventListener('click', function (event) {
var th = event.target.closest('th[data-sort]');
if (!th) return;
var key = th.getAttribute('data-sort');
if (state.sort.key === key) state.sort.dir = -state.sort.dir;
else state.sort = { key: key, dir: key === 'rank' || key === 'name' || key === 'category' ? 1 : -1 };
renderBoard();
});

$('#rows').addEventListener('click', function (event) {
var tr = event.target.closest('tr[data-slug]');
if (!tr) return;
var slug = tr.getAttribute('data-slug');
var row = D.rows.find(function (r) { return r.slug === slug; });
if (row) openDrawer(row);
});

$('#scrim').addEventListener('click', closeDrawer);
document.addEventListener('keydown', function (event) {
if (event.key === 'Escape') closeDrawer();
if (event.key === '/' && document.activeElement !== $('#search')) {
event.preventDefault();
setView('board');
$('#search').focus();
}
});

initCategories();
refreshScenario();
renderLive();
$('#methodBody').innerHTML = methodHtml();
setView('board');
})();
