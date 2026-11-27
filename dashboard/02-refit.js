/* Ignition — the page re-fits both models from the rows they were estimated on.
data.js carries the training rows beside the fitted coefficients: one row per traded token for
the comps curve, one per dated protocol for the launch record. This file runs the same
estimator as the program — ridge least squares (the published lambda) with three Huber
re-weighting passes for the comps curve, and iterative reweighted least squares with 14 steps
for the launch odds — then reports the largest difference between the re-derived coefficients
and the published ones. Nothing is fetched; every number it needs is on this page. */
(function () {
'use strict';

var D = window.RADAR;

function fail(note) {
window.REFIT = { ok: false, note: note, comps: { n: 0 }, odds: { n: 0 }, coefficients: 0, max_delta: null };
}
if (!D || !D.fit || !D.fit.comps || !D.fit.odds) { fail('data.js carries no training rows'); return; }
if (!D.comps || !D.odds) { fail('data.js carries no fitted coefficients'); return; }

/* Gaussian elimination with partial pivoting, the same sweep the program's solver runs. */
function solveLinear(A, b) {
var p = b.length;
for (var col = 0; col < p; col += 1) {
var pivot = col;
for (var row = col + 1; row < p; row += 1) if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
if (pivot !== col) {
var tmpA = A[col]; A[col] = A[pivot]; A[pivot] = tmpA;
var tmpB = b[col]; b[col] = b[pivot]; b[pivot] = tmpB;
}
var diagonal = A[col][col];
if (Math.abs(diagonal) < 1e-12) continue;
for (var r = 0; r < p; r += 1) {
if (r === col) continue;
var factor = A[r][col] / diagonal;
if (factor === 0) continue;
for (var k = col; k < p; k += 1) A[r][k] -= factor * A[col][k];
b[r] -= factor * b[col];
}
}
var out = new Array(p);
for (var i = 0; i < p; i += 1) out[i] = Math.abs(A[i][i]) > 1e-12 ? b[i] / A[i][i] : 0;
return out;
}

/* Ridge least squares on the normal equations: every term but the intercept is penalised. */
function ridgeSolve(X, y, ridge, weights) {
var n = X.length, p = X[0].length;
var A = [], b = [];
for (var j = 0; j < p; j += 1) { A.push(new Array(p).fill(0)); b.push(0); }
for (var i = 0; i < n; i += 1) {
var w = weights === undefined ? 1 : weights[i];
var row = X[i];
for (var a = 0; a < p; a += 1) {
b[a] += w * row[a] * y[i];
for (var c = 0; c < p; c += 1) A[a][c] += w * row[a] * row[c];
}
}
for (var d = 1; d < p; d += 1) A[d][d] += ridge;
return solveLinear(A, b);
}

/* Logistic IRLS: 14 steps, a 1e-6 ridge on every diagonal, eta clamped to ±30. */
function logisticFit(X, y, iterations) {
var n = X.length, p = X[0].length;
var beta = new Array(p).fill(0);
for (var step = 0; step < iterations; step += 1) {
var weights = new Array(n), target = new Array(n);
for (var i = 0; i < n; i += 1) {
var eta = 0;
for (var j = 0; j < p; j += 1) eta += beta[j] * X[i][j];
var phat = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta))));
weights[i] = Math.max(1e-6, phat * (1 - phat));
target[i] = eta + (y[i] - phat) / weights[i];
}
var A = [], rhs = [];
for (var a = 0; a < p; a += 1) { A.push(new Array(p).fill(0)); rhs.push(0); }
for (var r = 0; r < n; r += 1) {
var w = weights[r];
for (var u = 0; u < p; u += 1) {
rhs[u] += w * X[r][u] * target[r];
for (var v = 0; v < p; v += 1) A[u][v] += w * X[r][u] * X[r][v];
}
}
for (var q = 0; q < p; q += 1) A[q][q] += 1e-6;
beta = solveLinear(A, rhs);
}
return beta;
}

function median(values) {
if (values.length === 0) return 0;
var sorted = values.slice().sort(function (a, b) { return a - b; });
var mid = Math.floor(sorted.length / 2);
return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/* The comps curve: ridge fit, then three Huber passes so one outlier cannot rule the line. */
function fitComps(payload, ridge) {
var terms = payload.terms, categories = payload.categories, rows = payload.rows;
var X = rows.map(function (row) {
var x = [1];
if (terms.size) x.push(Math.log(row.t));
if (terms.growth) x.push(row.g);
if (terms.sector) for (var i = 0; i < categories.length; i += 1) x.push(row.c === i ? 1 : 0);
return x;
});
var y = rows.map(function (row) { return Math.log(row.m); });
var beta = ridgeSolve(X, y, ridge);
for (var pass = 0; pass < 3; pass += 1) {
var residuals = [];
for (var i = 0; i < y.length; i += 1) {
var fitted = 0;
for (var j = 0; j < beta.length; j += 1) fitted += beta[j] * X[i][j];
residuals.push(y[i] - fitted);
}
var scale = Math.max(1e-6, median(residuals.map(function (r) { return Math.abs(r); })) * 1.4826);
var weights = residuals.map(function (r) { return Math.abs(r) <= 2 * scale ? 1 : (2 * scale) / Math.abs(r); });
beta = ridgeSolve(X, y, ridge, weights);
}
return beta;
}

/* The launch record: the same logistic fit the program publishes. */
function fitOdds(payload) {
var terms = payload.terms;
var X = payload.rows.map(function (row) {
var x = [1];
if (terms.size) x.push(Math.log10(row.t / 1e6));
if (terms.age) x.push(Math.log(1 + row.a));
if (terms.growth) x.push(row.g);
return x;
});
var y = payload.rows.map(function (row) { return row.y; });
return logisticFit(X, y, 14);
}

function maxOf(values) {
var max = 0;
for (var i = 0; i < values.length; i += 1) if (values[i] > max || values[i] !== values[i]) max = values[i];
return max;
}

/* --- comps: refit, unpack by the published term flags, compare coefficient by coefficient. */
var compsTerms = D.fit.comps.terms;
var compsCategories = D.fit.comps.categories;
var compBeta = fitComps(D.fit.comps, D.comps.ridge);
var compPosition = 1;
var compFitted = { intercept: compBeta[0], tvl_elasticity: compsTerms.size ? compBeta[compPosition++] : 0, growth_weight: 0, category_effects: {} };
if (compsTerms.growth) compFitted.growth_weight = compBeta[compPosition++];
if (compsTerms.sector) for (var ci = 0; ci < compsCategories.length; ci += 1) compFitted.category_effects[compsCategories[ci]] = compBeta[compPosition++];
var compDeltas = [Math.abs(compFitted.intercept - D.comps.intercept), Math.abs(compFitted.tvl_elasticity - D.comps.tvl_elasticity), Math.abs(compFitted.growth_weight - D.comps.growth_weight)];
for (var cj = 0; cj < compsCategories.length; cj += 1) {
var printed = D.comps.category_effects[compsCategories[cj]];
compDeltas.push(Math.abs(compFitted.category_effects[compsCategories[cj]] - (printed === undefined ? 0 : printed)));
}

/* --- odds: refit, unpack by its term flags, compare the same way. */
var oddsTerms = D.fit.odds.terms;
var oddsBeta = fitOdds(D.fit.odds);
var oddsPosition = 1;
var oddsFitted = { intercept: oddsBeta[0], size_weight: oddsTerms.size ? oddsBeta[oddsPosition++] : 0, age_weight: oddsTerms.age ? oddsBeta[oddsPosition++] : 0, growth_weight: oddsTerms.growth ? oddsBeta[oddsPosition++] : 0 };
var oddsDeltas = [
Math.abs(oddsFitted.intercept - D.odds.intercept),
Math.abs(oddsFitted.size_weight - D.odds.size_weight),
Math.abs(oddsFitted.age_weight - D.odds.age_weight),
Math.abs(oddsFitted.growth_weight - D.odds.growth_weight)
];

window.REFIT = {
ok: true,
note: '',
comps: { n: D.fit.comps.rows.length, max_delta: maxOf(compDeltas), coefficients: compFitted },
odds: { n: D.fit.odds.rows.length, max_delta: maxOf(oddsDeltas), coefficients: oddsFitted },
coefficients: compDeltas.length + oddsDeltas.length,
max_delta: Math.max(maxOf(compDeltas), maxOf(oddsDeltas))
};
})();
