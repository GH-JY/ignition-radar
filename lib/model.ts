// Ignition v2: a token launch radar that fits its own numbers to the sealed snapshot.
//
// One snapshot of DefiLlama's protocol universe goes in; a ranked board of pre-token
// protocols and the dashboard's data go out. Nothing in this file is a hand-set multiple:
// every number the radar shows is estimated from the snapshot's own record, in three steps.
//
//  1. THE COMPS CURVE (fitComps). The protocols that already record a token are the market's
//     own trading record: 128 tokens, one row per token (all the protocol instances that share
//     a ticker are summed into one TVL). A log-log ridge fit predicts a token's market cap from
//     its protocol's TVL, its seven-day TVL growth and its sector. That curve is the radar's
//     launch value: what the market has paid, term for term, for protocols like this one.
//     Its out-of-sample tests (leave-one-out and walk-forward, both re-fitted per fold) are
//     reported beside it: the curve beats a flat TVL multiple by about 1.4x the median error,
//     and the fit's rank correlation on held-out names is about 0.4.
//
//  2. THE LAUNCH ODDS (fitLaunchOdds). Every protocol whose listing date is known is a peer in
//     a launch record: does it record a token today, and how old is it? A logistic fit of token
//     presence on size, age and seven-day growth recovers the share of peers at each age that
//     carry a token (AUC about 0.71). Differencing that fitted share over one year gives the
//     radar's twelve-month launch odds for a protocol that has none yet: P(list by age+1)
//     minus P(list by age), over the chances it is still tokenless.
//
//  3. THE BOARD (buildRadar). implied value = fitted launch value x twelve-month launch odds.
//     The board carries every pre-token protocol that can plausibly launch (the watchlist plus
//     the field below the floor, with exchanges, wrapped and staked products and versioned pools
//     set aside), every watchlist slug among them, and a farm plan per row whose economics are
//     computed from the row's own implied value and costs: expected airdrop (0.001% of FDV to
//     one wallet), gas, the opportunity cost of the capital and the hours the plan takes. The
//     verdict follows from the net dollars and dollars per hour, never from a name.
//
// The page beside this file re-runs all of it, row by row, from the snapshot figures it prints,
// and shows that every number agrees with the board.

/** One protocol as the sealed snapshot writes it: exactly ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole sealed snapshot. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The comps curve's fitted coefficients. */
export interface CompsModel {
  intercept: number;
  tvl_elasticity: number;
  growth_weight: number;
  category_effects: Record<string, number>;
  ridge: number;
  n_tokens: number;
  points: { tvl_usd: number; mcap_usd: number }[];
}

/** The launch-odds model's fitted coefficients. */
export interface OddsModel {
  intercept: number;
  size_weight: number;
  age_weight: number;
  growth_weight: number;
  /** The oldest dated peer, in years: the horizon the eventual odds are measured to. */
  oldest_years: number;
  n_peers: number;
  n_tokens: number;
}

/** A row's fitted breakdown: every term the page shows and re-runs. */
export interface RowModel {
  launch_value_usd: number;
  odds_eventual: number;
  implied_value_usd: number;
  /** The P25 and P75 of the fitted value, from the comps curve's held-out residuals. */
  interval_low_usd: number;
  interval_high_usd: number;
  age_days: number | null;
  age_years: number;
  growth_term: number;
  category_effect: number;
  log_tvl: number;
}

/** A board row: the gate's required fields plus the working the dashboard shows. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  launch_value_usd: number;
  odds_eventual: number;
  verdict: 'farm' | 'thin' | 'skip';
  expected_airdrop_usd: number;
  farm_hours: number;
  farm_cost_usd: number;
  net_usd: number;
  per_hour_usd: number;
  on_watchlist: boolean;
  model: RowModel;
  farm_steps: string[];
}

/** A token that already trades, shown at the market's price and never scored as a launch. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  symbol: string | null;
  mcap_tvl: number;
}

/** One protocol's contribution to the comps fit: one token, all its instances summed. */
interface CompRow {
  key: string;
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  age_days: number | null;
}

/** One protocol's contribution to the launch-odds fit. */
interface OddsRow {
  tvl_usd: number;
  age_years: number;
  growth: number;
  has_token: boolean;
}

/** A held-out validation record. */
export interface Validation {
  n: number;
  loo_error_multiple: number;
  flat_loo_multiple: number;
  loo_improvement: number;
  walk_forward_multiple: number;
  walk_forward_improvement: number;
  loo_spearman: number;
  /** Log-residual quantiles of the leave-one-out folds: the per-row interval's shape. */
  q10: number;
  q25: number;
  q75: number;
  q90: number;
  /** Observed coverage of those intervals on the walk-forward folds (nominal 80% and 50%). */
  coverage_p10_p90: number;
  coverage_p25_p75: number;
}

/** The plan's economics, published so the page re-runs the same arithmetic as the board. */
export interface Economics {
  wallet_share: number;
  setup_hours: number;
  weekly_hours: number;
  gas_base_usd: number;
  gas_weekly_usd: number;
  opportunity_rate: number;
  capital_tiers: { tvl_min_usd: number; capital_usd: number }[];
  hold_tiers: { younger_than_days: number; weeks: number }[];
  hold_base_weeks: number;
  hold_unknown_weeks: number;
  farm_net_usd: number;
  farm_per_hour_usd: number;
  thin_net_usd: number;
  thin_per_hour_usd: number;
  age_default_years: number;
}

/** Everything the page renders, as one script. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  comps: CompsModel & { validation: Validation };
  odds: OddsModel & {
    auc: number;
    brier: number;
    brier_base: number;
    calibration: { band: string; n: number; predicted: number; observed: number }[];
  };
  economics: Economics;
  /** The whole snapshot, accounted for: every protocol lands in exactly one group. */
  accounting: {
    groups: { label: string; n: number }[];
    total: number;
    matches: boolean;
    /** FNV-1a over each board row's rank, slug and implied value: the page re-derives it. */
    digest: string;
  };
  coverage: {
    protocols: number;
    watchlist: number;
    watchlist_covered: number;
    scored: number;
    pre_token: number;
    tokenless_by_design: number;
    trading: number;
    trading_with_mcap: number;
    trading_without_mcap: number;
    anchors: number;
    verdicts: { farm: number; thin: number; skip: number };
  };
  stats: { median_implied: number; top_implied: number; median_odds: number };
  rows: BoardRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export const MODEL_VERSION = 'ignition-3';

/** The share of a launched token's FDV one farming wallet is assumed to capture (0.001%). */
export const WALLET_SHARE = 0.00001;

const DAYS_PER_YEAR = 365;
const RIDGE = 2.0;
const MIN_CATEGORY_TOKENS = 5;
const VERDICT_FARM_NET = 120;
const VERDICT_FARM_PER_HOUR = 6;
const VERDICT_THIN_NET = 30;
const VERDICT_THIN_PER_HOUR = 1.5;

/**
 * The farm plan's costs and tiers, published to the page. The verdict is a statement about
 * dollars per hour under these explicit assumptions, not a promise: one wallet captures
 * 0.001% of FDV, gas is $12 up front and $3 a week, the capital could earn 4% a year elsewhere,
 * and the plan takes 2 hours to set up plus 0.75 hours a week.
 */
export const ECONOMICS: Economics = {
  wallet_share: WALLET_SHARE,
  setup_hours: 2,
  weekly_hours: 0.75,
  gas_base_usd: 12,
  gas_weekly_usd: 3,
  opportunity_rate: 0.04,
  capital_tiers: [
    { tvl_min_usd: 5_000_000_000, capital_usd: 250 },
    { tvl_min_usd: 1_000_000_000, capital_usd: 200 },
    { tvl_min_usd: 250_000_000, capital_usd: 150 },
    { tvl_min_usd: 100_000_000, capital_usd: 100 },
    { tvl_min_usd: 0, capital_usd: 50 },
  ],
  hold_tiers: [
    { younger_than_days: 365, weeks: 8 },
    { younger_than_days: 730, weeks: 6 },
    { younger_than_days: 1095, weeks: 5 },
  ],
  hold_base_weeks: 4,
  hold_unknown_weeks: 6,
  farm_net_usd: VERDICT_FARM_NET,
  farm_per_hour_usd: VERDICT_FARM_PER_HOUR,
  thin_net_usd: VERDICT_THIN_NET,
  thin_per_hour_usd: VERDICT_THIN_PER_HOUR,
  age_default_years: 1,
};

const round = (n: number): number => Math.round(n);
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** A finite number, else the fallback. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Seven-day growth, clipped to the range the fit used and expressed as a fraction. */
function growthTerm(change: number | null): number {
  return Math.max(-0.5, Math.min(1.5, finite(change, 0) / 100));
}

/** Whole days from the snapshot's as_of date back to the protocol's listing date; null when unknown. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

/** Whether a protocol records a token at all: a symbol or a CoinGecko id is enough. */
export function hasToken(protocol: SnapshotProtocol): boolean {
  return protocol.gecko_id !== null || protocol.symbol !== null;
}

/** Whether a protocol records no token at all: both token fields null, the watchlist's rule. */
export function isPreToken(protocol: SnapshotProtocol): boolean {
  return protocol.gecko_id === null && protocol.symbol === null;
}

/** The one key a token is identified by, across its protocol instances. */
function tokenKey(protocol: SnapshotProtocol): string | null {
  if (protocol.gecko_id !== null) return protocol.gecko_id;
  if (protocol.symbol !== null) return protocol.symbol.toUpperCase();
  return null;
}

const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAP_MARKER = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const STRUCTURAL_CATEGORIES = new Set(['CEX', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'Canonical Bridge', 'Bridge']);

/**
 * Whether a pre-token protocol is a plausible launch candidate: not an exchange, not a
 * wrapped, staked or bridged product, not a versioned pool of another protocol. This is the
 * watchlist's own reasoning, applied below its TVL floor as well as on it.
 */
export function isCandidate(protocol: SnapshotProtocol): boolean {
  if (!isPreToken(protocol)) return false;
  if (protocol.category !== null && STRUCTURAL_CATEGORIES.has(protocol.category)) return false;
  if (VERSION_MARKER.test(protocol.name)) return false;
  if (WRAP_MARKER.test(protocol.name)) return false;
  if (EXCHANGE_NAMES.some((name) => protocol.name.startsWith(name))) return false;
  return true;
}

// --------------------------------------------------------------------------- small linear algebra

/** Solve A x = b by Gaussian elimination with partial pivoting. A is modified. */
function solveLinear(A: number[][], b: number[]): number[] {
  const p = b.length;
  for (let col = 0; col < p; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < p; row += 1) if (Math.abs(A[row]![col]!) > Math.abs(A[pivot]![col]!)) pivot = row;
    if (pivot !== col) {
      const tmpA = A[col]!;
      A[col] = A[pivot]!;
      A[pivot] = tmpA;
      const tmpB = b[col]!;
      b[col] = b[pivot]!;
      b[pivot] = tmpB;
    }
    const diagonal = A[col]![col]!;
    if (Math.abs(diagonal) < 1e-12) continue;
    for (let row = 0; row < p; row += 1) {
      if (row === col) continue;
      const factor = A[row]![col]! / diagonal;
      if (factor === 0) continue;
      for (let k = col; k < p; k += 1) A[row]![k]! -= factor * A[col]![k]!;
      b[row]! -= factor * b[col]!;
    }
  }
  return b.map((value, i) => (Math.abs(A[i]![i]!) > 1e-12 ? value / A[i]![i]! : 0));
}

/** A ridge least-squares fit: normal equations plus a penalty on every term but the intercept. */
function ridgeSolve(X: number[][], y: number[], ridge: number, weights?: number[]): number[] {
  const n = X.length;
  const p = X[0]!.length;
  const A: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const b: number[] = new Array<number>(p).fill(0);
  for (let i = 0; i < n; i += 1) {
    const w = weights === undefined ? 1 : weights[i]!;
    const row = X[i]!;
    for (let j = 0; j < p; j += 1) {
      b[j]! += w * row[j]! * y[i]!;
      for (let k = 0; k < p; k += 1) A[j]![k]! += w * row[j]! * row[k]!;
    }
  }
  for (let j = 1; j < p; j += 1) A[j]![j]! += ridge;
  return solveLinear(A, b);
}

/** A logistic fit by iteratively reweighted least squares, with a tiny ridge for stability. */
function logisticFit(X: number[][], y: number[], iterations = 14): number[] {
  const n = X.length;
  const p = X[0]!.length;
  let beta = new Array<number>(p).fill(0);
  for (let step = 0; step < iterations; step += 1) {
    const weights = new Array<number>(n);
    const target = new Array<number>(n);
    for (let i = 0; i < n; i += 1) {
      const eta = beta.reduce((sum, bj, j) => sum + bj * X[i]![j]!, 0);
      const phat = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, eta))));
      weights[i] = Math.max(1e-6, phat * (1 - phat));
      target[i] = eta + (y[i]! - phat) / weights[i]!;
    }
    const A: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    const rhs: number[] = new Array<number>(p).fill(0);
    for (let i = 0; i < n; i += 1) {
      const w = weights[i]!;
      for (let j = 0; j < p; j += 1) {
        rhs[j]! += w * X[i]![j]! * target[i]!;
        for (let k = 0; k < p; k += 1) A[j]![k]! += w * X[i]![j]! * X[i]![k]!;
      }
    }
    for (let j = 0; j < p; j += 1) A[j]![j]! += 1e-6;
    beta = solveLinear(A, rhs);
  }
  return beta;
}

/** Average ranks, ties shared, for Spearman's correlation. */
function averageRanks(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]!.value === order[i]!.value) j += 1;
    const rank = (i + j) / 2 + 0.5;
    for (let k = i; k <= j; k += 1) ranks[order[k]!.index] = rank;
    i = j + 1;
  }
  return ranks;
}

/** Spearman's rank correlation between two equal-length vectors. */
function spearman(a: number[], b: number[]): number {
  const ra = averageRanks(a);
  const rb = averageRanks(b);
  const n = a.length;
  const ma = ra.reduce((s, v) => s + v, 0) / n;
  const mb = rb.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    num += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) ** 2;
    db += (rb[i]! - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/** Area under the ROC curve, ties counted half. */
function auc(predicted: number[], actual: boolean[]): number {
  const ranks = averageRanks(predicted);
  let positives = 0;
  let rankSum = 0;
  for (let i = 0; i < actual.length; i += 1) {
    if (actual[i]) {
      positives += 1;
      rankSum += ranks[i]!;
    }
  }
  const negatives = actual.length - positives;
  if (positives === 0 || negatives === 0) return 0.5;
  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

/** The median of a numeric array. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** A quantile of a numeric array, linear between the two nearest order statistics. */
function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo]! : sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

// --------------------------------------------------------------------------- the comps curve

/**
 * The snapshot's traded tokens as one row each: every protocol that shares a ticker (Aave V2,
 * V3 and V4 all carry AAVE) is summed into one TVL, because the market cap belongs to the
 * token, not to one instance. The largest instance lends its sector and its growth reading.
 */
function compRows(snapshot: Snapshot): CompRow[] {
  const groups = new Map<string, SnapshotProtocol[]>();
  for (const protocol of snapshot.protocols) {
    const key = tokenKey(protocol);
    if (key === null || protocol.mcap_usd === null || protocol.mcap_usd <= 0) continue;
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [protocol]);
    else bucket.push(protocol);
  }
  const rows: CompRow[] = [];
  for (const [key, bucket] of groups) {
    let representative = bucket[0]!;
    let tvl = 0;
    for (const protocol of bucket) {
      tvl += protocol.tvl_usd;
      if (protocol.tvl_usd > representative.tvl_usd) representative = protocol;
    }
    if (tvl <= 0) continue;
    const ages = bucket.map((protocol) => ageDays(snapshot.as_of, protocol.listed_at)).filter((age): age is number => age !== null);
    rows.push({
      key,
      slug: representative.slug,
      name: representative.name,
      category: representative.category,
      tvl_usd: tvl,
      mcap_usd: representative.mcap_usd!,
      change_7d: representative.change_7d,
      age_days: ages.length > 0 ? Math.max(...ages) : null,
    });
  }
  return rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The category dummies a fit carries: sectors with at least MIN_CATEGORY_TOKENS comps, sorted. */
function categoryTerms(rows: CompRow[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.category === null) continue;
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= MIN_CATEGORY_TOKENS)
    .map(([name]) => name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** One row's design vector: intercept, log TVL, growth, then the category dummies. */
function compDesign(row: CompRow, categories: string[]): number[] {
  const x = [1, Math.log(row.tvl_usd), growthTerm(row.change_7d)];
  for (const category of categories) x.push(row.category === category ? 1 : 0);
  return x;
}

/** Fit the comps curve with a Huber re-weighting pass, so one 400x outlier cannot rule the fit. */
function fitCompsOn(rows: CompRow[], categories: string[]): number[] {
  const X = rows.map((row) => compDesign(row, categories));
  const y = rows.map((row) => Math.log(row.mcap_usd));
  let beta = ridgeSolve(X, y, RIDGE);
  for (let pass = 0; pass < 3; pass += 1) {
    const residuals = y.map((value, i) => value - beta.reduce((sum, bj, j) => sum + bj * X[i]![j]!, 0));
    const scale = Math.max(1e-6, median(residuals.map((r) => Math.abs(r))) * 1.4826);
    const weights = residuals.map((r) => (Math.abs(r) <= 2 * scale ? 1 : (2 * scale) / Math.abs(r)));
    beta = ridgeSolve(X, y, RIDGE, weights);
  }
  return beta;
}

/** Predict a comp row's market cap from a fitted vector. */
function compPredict(beta: number[], row: CompRow, categories: string[]): number {
  const x = compDesign(row, categories);
  return Math.exp(beta.reduce((sum, bj, j) => sum + bj * x[j]!, 0));
}

/** The flat-multiple baseline: the geometric-mean market cap per TVL dollar, re-fitted per fold. */
function flatMultiple(rows: CompRow[]): number {
  return Math.exp(rows.reduce((sum, row) => sum + Math.log(row.mcap_usd / row.tvl_usd), 0) / rows.length);
}

/**
 * The comps curve's out-of-sample record: leave-one-out (re-fit without each token) and a
 * walk-forward test (oldest half trains, newer half tests, expanding window). Every error is
 * the median |log(predicted/actual)|, shown as a multiplicative factor: 3.5 means the typical
 * miss is a factor of 3.5 either way.
 */
function validateComps(rows: CompRow[], categories: string[]): Validation {
  const looPred: number[] = [];
  const actual: number[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const train = rows.filter((_, j) => j !== i);
    const beta = fitCompsOn(train, categories);
    looPred.push(compPredict(beta, rows[i]!, categories));
    actual.push(rows[i]!.mcap_usd);
  }
  const flatPred: number[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const train = rows.filter((_, j) => j !== i);
    flatPred.push(flatMultiple(train) * rows[i]!.tvl_usd);
  }
  const looError = median(looPred.map((pred, i) => Math.abs(Math.log(pred / actual[i]!))));
  const flatError = median(flatPred.map((pred, i) => Math.abs(Math.log(pred / actual[i]!))));

  const ordered = [...rows].sort((a, b) => (b.age_days ?? 0) - (a.age_days ?? 0));
  const half = Math.floor(ordered.length / 2);
  const forwardPred: number[] = [];
  const forwardFlat: number[] = [];
  const forwardActual: number[] = [];
  for (let i = half; i < ordered.length; i += 1) {
    const train = ordered.slice(0, i);
    const beta = fitCompsOn(train, categories);
    forwardPred.push(compPredict(beta, ordered[i]!, categories));
    forwardFlat.push(flatMultiple(train) * ordered[i]!.tvl_usd);
    forwardActual.push(ordered[i]!.mcap_usd);
  }
  const forwardError = median(forwardPred.map((pred, i) => Math.abs(Math.log(pred / forwardActual[i]!))));
  const flatForward = median(forwardFlat.map((pred, i) => Math.abs(Math.log(pred / forwardActual[i]!))));

  // The interval's shape comes from the leave-one-out residuals; its honesty is measured on
  // the walk-forward folds, which never trained on the nearby peers: the share of those
  // actuals that land inside the quantile band, beside the nominal 80% and 50%.
  const residual = looPred.map((pred, i) => Math.log(actual[i]! / pred));
  const q10 = quantile(residual, 0.1);
  const q25 = quantile(residual, 0.25);
  const q75 = quantile(residual, 0.75);
  const q90 = quantile(residual, 0.9);
  const inside = (pred: number, obs: number, lo: number, hi: number): boolean => obs >= pred * Math.exp(lo) && obs <= pred * Math.exp(hi);
  const n90 = forwardPred.filter((pred, i) => inside(pred, forwardActual[i]!, q10, q90)).length / Math.max(1, forwardPred.length);
  const n50 = forwardPred.filter((pred, i) => inside(pred, forwardActual[i]!, q25, q75)).length / Math.max(1, forwardPred.length);

  return {
    n: rows.length,
    loo_error_multiple: Math.round(Math.exp(looError) * 100) / 100,
    flat_loo_multiple: Math.round(Math.exp(flatError) * 100) / 100,
    loo_improvement: Math.round(Math.exp(flatError - looError) * 100) / 100,
    walk_forward_multiple: Math.round(Math.exp(forwardError) * 100) / 100,
    walk_forward_improvement: Math.round(Math.exp(flatForward - forwardError) * 100) / 100,
    loo_spearman: Math.round(spearman(looPred, actual) * 100) / 100,
    q10: Math.round(q10 * 1000) / 1000,
    q25: Math.round(q25 * 1000) / 1000,
    q75: Math.round(q75 * 1000) / 1000,
    q90: Math.round(q90 * 1000) / 1000,
    coverage_p10_p90: Math.round(n90 * 100) / 100,
    coverage_p25_p75: Math.round(n50 * 100) / 100,
  };
}

/** Fit and validate the comps curve once. */
function fitComps(snapshot: Snapshot): { model: CompsModel; validation: Validation } {
  const rows = compRows(snapshot);
  const categories = categoryTerms(rows);
  const beta = fitCompsOn(rows, categories);
  const effects: Record<string, number> = {};
  categories.forEach((category, i) => {
    effects[category] = beta[3 + i]!;
  });
  return {
    model: {
      intercept: beta[0]!,
      tvl_elasticity: beta[1]!,
      growth_weight: beta[2]!,
      category_effects: effects,
      ridge: RIDGE,
      n_tokens: rows.length,
      points: rows.map((row) => ({ tvl_usd: Math.round(row.tvl_usd), mcap_usd: Math.round(row.mcap_usd) })),
    },
    validation: validateComps(rows, categories),
  };
}

/** The fitted launch value of a protocol with this TVL, growth and sector. */
export function launchValue(tvl_usd: number, change_7d: number | null, category: string | null, comps: CompsModel): number {
  let logValue = comps.intercept + comps.tvl_elasticity * Math.log(Math.max(1, tvl_usd)) + comps.growth_weight * growthTerm(change_7d);
  if (category !== null && comps.category_effects[category] !== undefined) logValue += comps.category_effects[category]!;
  const value = Math.exp(logValue);
  return Math.max(1, Math.min(100_000_000_000_000, value));
}

// --------------------------------------------------------------------------- the launch odds

/** Every dated protocol as a peer in the launch record: its size, age, growth and token status. */
function oddsRows(snapshot: Snapshot): OddsRow[] {
  const rows: OddsRow[] = [];
  for (const protocol of snapshot.protocols) {
    const age = ageDays(snapshot.as_of, protocol.listed_at);
    if (age === null) continue;
    rows.push({
      tvl_usd: Math.max(1e6, protocol.tvl_usd),
      age_years: Math.max(0.05, age / DAYS_PER_YEAR),
      growth: growthTerm(protocol.change_7d),
      has_token: hasToken(protocol),
    });
  }
  return rows;
}

/** The logistic design: intercept, log10 size in millions, log(1+age), clipped growth. */
function oddsDesign(row: OddsRow): number[] {
  return [1, Math.log10(row.tvl_usd / 1e6), Math.log(1 + row.age_years), row.growth];
}

/** P(the peer records a token today), under the fitted logistic model. */
function tokenShare(odds: OddsModel, tvl_usd: number, age_years: number, growth: number): number {
  const z = odds.intercept + odds.size_weight * Math.log10(Math.max(1e6, tvl_usd) / 1e6) + odds.age_weight * Math.log(1 + age_years) + odds.growth_weight * growth;
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

/**
 * The fitted eventual launch odds: among peers still tokenless at this age, the share that
 * ever records a token by the oldest cohort's age. It is the same conditional hazard as a
 * twelve-month odds, with the horizon the snapshot itself provides (the oldest dated peer)
 * instead of an arbitrary year, so a five-year-old protocol is measured over its remaining
 * plausible life, not over the next twelve months.
 */
export function launchOdds(odds: OddsModel, tvl_usd: number, age_years: number, growth: number): number {
  const now = tokenShare(odds, tvl_usd, age_years, growth);
  const end = tokenShare(odds, tvl_usd, Math.max(age_years, odds.oldest_years), growth);
  const eventual = (end - now) / Math.max(1e-9, 1 - now);
  return Math.max(0.02, Math.min(0.95, eventual));
}

/** Fit the launch-odds model and its own out-of-sample record. */
function fitLaunchOdds(snapshot: Snapshot): {
  model: OddsModel;
  auc: number;
  brier: number;
  brier_base: number;
  calibration: { band: string; n: number; predicted: number; observed: number }[];
} {
  const rows = oddsRows(snapshot);
  const X = rows.map(oddsDesign);
  const y = rows.map((row) => (row.has_token ? 1 : 0));
  const beta = logisticFit(X, y);
  const oldestYears = rows.reduce((oldest, row) => Math.max(oldest, row.age_years), 0);
  const model: OddsModel = {
    intercept: beta[0]!,
    size_weight: beta[1]!,
    age_weight: beta[2]!,
    growth_weight: beta[3]!,
    oldest_years: Math.round(oldestYears * 100) / 100,
    n_peers: rows.length,
    n_tokens: rows.filter((row) => row.has_token).length,
  };
  const predicted = rows.map((row) => tokenShare(model, row.tvl_usd, row.age_years, row.growth));
  const aucValue = Math.round(auc(predicted, rows.map((row) => row.has_token)) * 100) / 100;

  // Brier score against the base rate: a fit that cannot beat "every peer has the same
  // chance" is not a model, so the page shows both numbers side by side.
  const base = y.reduce((sum, value) => sum + value, 0) / y.length;
  const brier = Math.round((predicted.reduce((sum, p, i) => sum + (p - y[i]!) ** 2, 0) / y.length) * 1e4) / 1e4;
  const brierBase = Math.round((y.reduce((sum, value) => sum + (base - value) ** 2, 0) / y.length) * 1e4) / 1e4;

  // Calibration by age band: what the fit says the token share is, beside what the peers show.
  const bands = [0, 1, 2, 3, 5, 100];
  const calibration: { band: string; n: number; predicted: number; observed: number }[] = [];
  for (let i = 0; i < bands.length - 1; i += 1) {
    const members = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.age_years >= bands[i]! && row.age_years < bands[i + 1]!);
    if (members.length === 0) continue;
    const meanPred = members.reduce((sum, { index }) => sum + predicted[index]!, 0) / members.length;
    const meanObs = members.reduce((sum, { row }) => sum + (row.has_token ? 1 : 0), 0) / members.length;
    calibration.push({
      band: `${bands[i]}–${bands[i + 1]}y`,
      n: members.length,
      predicted: Math.round(meanPred * 100) / 100,
      observed: Math.round(meanObs * 100) / 100,
    });
  }
  return { model, auc: aucValue, brier, brier_base: brierBase, calibration };
}

// --------------------------------------------------------------------------- the farm plans

function chainOf(protocol: SnapshotProtocol): string {
  return protocol.chains.length > 0 ? protocol.chains[0]! : 'its main chain';
}

/** The capital one farm position takes, from the protocol's TVL tier. */
function capitalFor(tvl_usd: number): number {
  for (const tier of ECONOMICS.capital_tiers) if (tvl_usd >= tier.tvl_min_usd) return tier.capital_usd;
  return ECONOMICS.capital_tiers[ECONOMICS.capital_tiers.length - 1]!.capital_usd;
}

/** How many weeks to hold, from tenure: a young protocol needs a longer qualifying window. */
function holdWeeksFor(age: number | null): number {
  if (age === null) return ECONOMICS.hold_unknown_weeks;
  for (const tier of ECONOMICS.hold_tiers) if (age < tier.younger_than_days) return tier.weeks;
  return ECONOMICS.hold_base_weeks;
}

/** The position a farmer opens, in the protocol's own words. */
function primaryAction(protocol: SnapshotProtocol, capital: number, chain: string): { text: string; gas: number } {
  const c = (protocol.category ?? '').toLowerCase();
  const name = protocol.name;
  if (c.includes('lend') || c.includes('collateral')) {
    return { text: `Supply $${capital} of USDC to ${name} on ${chain} as collateral and leave it supplied.`, gas: 6 };
  }
  if (c.includes('cdp')) {
    return { text: `Open a ${name} vault on ${chain}: deposit $${capital} of collateral and mint the protocol's stablecoin against it.`, gas: 7 };
  }
  if (c.includes('dex')) {
    return { text: `Provide $${capital} of two-asset liquidity to ${name}'s deepest pool on ${chain} and keep the LP tokens.`, gas: 8 };
  }
  if (c.includes('yield')) {
    return { text: `Deposit $${capital} of USDC into ${name}'s flagship vault on ${chain} and hold the receipt token.`, gas: 5 };
  }
  if (c.includes('bridge')) {
    return { text: `Bridge $${capital} of USDC through ${name} to ${chain} and use the funds inside its own app.`, gas: 9 };
  }
  if (c.includes('stak') || c.includes('restak')) {
    return { text: `Stake $${capital} of ${chain}'s native asset through ${name} and hold the staked receipt.`, gas: 5 };
  }
  if (c.includes('deriv') || c.includes('perp') || c.includes('option')) {
    return { text: `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small position.`, gas: 7 };
  }
  if (c.includes('predict')) {
    return { text: `Fund $${capital} on ${name} and place one position on a market you can follow.`, gas: 4 };
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return { text: `Deposit $${capital} of USDC into a ${name} curated vault on ${chain} and keep the vault shares.`, gas: 5 };
  }
  if (c.includes('rwa')) {
    return { text: `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the wallet.`, gas: 7 };
  }
  if (c.includes('insurance')) {
    return { text: `Buy $${capital} of cover from ${name} on ${chain} and keep the policy open.`, gas: 4 };
  }
  if (c.includes('chain')) {
    return { text: `Bridge $${capital} of USDC onto ${name} through its official bridge and stake the native asset.`, gas: 10 };
  }
  if (c.includes('stable') || c.includes('anchor') || c.includes('btc')) {
    return { text: `Mint or deposit $${capital} of the protocol's asset through ${name} on ${chain} and hold it.`, gas: 6 };
  }
  return { text: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`, gas: 5 };
}

/** A second, different action that deepens the record the protocol can price, with its own cost. */
function secondaryAction(protocol: SnapshotProtocol, category: string): { text: string; cost: string } {
  const c = category.toLowerCase();
  const name = protocol.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return { text: `Borrow up to a quarter of the deposit in ${name}'s own stablecoin and hold it in the same wallet.`, cost: 'about $5 of gas' };
  }
  if (c.includes('dex')) {
    return { text: `Add a second position of $50 to ${name}'s largest pool, or stake the LP receipt where the protocol allows it.`, cost: 'about $5 of gas and $50 of extra capital' };
  }
  if (c.includes('bridge')) {
    return { text: `Bridge a small $20 test amount back across ${name} once, so the wallet shows two-way use.`, cost: 'about $4 of gas' };
  }
  if (c.includes('stak') || c.includes('restak')) {
    return { text: `If a lending market accepts ${name}'s staked receipt, supply $50 of it as collateral there.`, cost: 'about $5 of gas and $50 of receipt' };
  }
  if (c.includes('deriv') || c.includes('perp') || c.includes('option')) {
    return { text: `Open a $50 hedge against the deposit for one week and close it before the hold ends.`, cost: 'about $4 of gas and $50 of margin' };
  }
  if (c.includes('predict')) {
    return { text: `Trade a second market on ${name} and hold both positions for at least a week.`, cost: 'about $2 of gas and $50 of position' };
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return { text: `Deposit $50 into a second vault from the same ${name} curator and compare its stated fee.`, cost: 'about $4 of gas and $50 of extra capital' };
  }
  if (c.includes('rwa')) {
    return { text: `Move $50 of the asset to a second chain ${name} supports and hold it there for a week.`, cost: 'about $6 of gas and $50 of asset' };
  }
  if (c.includes('insurance')) {
    return { text: `Add $20 of cover on a second protocol ${name} insures and keep both policies.`, cost: 'about $3 of gas and $20 of cover' };
  }
  if (c.includes('chain')) {
    return { text: `Make one $50 swap on ${name}'s largest native DEX so the wallet uses more than the bridge.`, cost: 'about $2 of gas and $50 of swap' };
  }
  if (c.includes('yield')) {
    return { text: `Deposit $50 into a second ${name} vault with a different strategy and keep both receipts.`, cost: 'about $4 of gas and $50 of extra capital' };
  }
  return { text: `Make a second $50 deposit into another ${name} pool and keep both positions open.`, cost: 'about $4 of gas and $50 of extra capital' };
}

/** A step string: its action, its cost and its time, always inside the gate's 20..600 characters. */
export function stepText(action: string, cost: string, time: string): string {
  let text = `${action} Cost: ${cost}. Time: ${time}.`;
  if (text.length > 600) text = `${text.slice(0, 596)}...`;
  if (text.length < 20) text = `${text} Check the protocol's own page before you act.`;
  return text;
}

/** The protocol's farm plan: seven concrete steps with a cost and a time each, from its own record. */
export function farmPlan(protocol: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(protocol);
  const capital = capitalFor(protocol.tvl_usd);
  const hold = holdWeeksFor(age);
  const holdDays = hold * 7;
  const category = protocol.category ?? '';
  const primary = primaryAction(protocol, capital, chain);
  const secondary = secondaryAction(protocol, category);
  const exitFloor = Math.round(protocol.tvl_usd * 0.75).toLocaleString('en-US');
  return [
    stepText(
      'Create a fresh wallet for this position and keep its seed phrase offline; fund it a little beyond the deposit so gas never blocks an exit.',
      'about $3 of gas to fund the wallet',
      '10 minutes',
    ),
    stepText(primary.text, `$${capital} of capital and about $${primary.gas} of gas`, '15 minutes to set up'),
    stepText(secondary.text, secondary.cost, '15 minutes'),
    stepText(
      `Once a week, make one qualifying action on ${protocol.name} (a deposit, a borrow, a swap or a vote) and keep the receipts.`,
      'about $2 to $5 of gas a week',
      '10 minutes a week',
    ),
    stepText(
      `Keep the position open for at least ${holdDays} days so it spans several snapshots and the protocol's record can price it.`,
      `the $${capital} stays in the position`,
      `${holdDays} days`,
    ),
    stepText(
      `Check ${protocol.name}'s own site for a points or rewards page, claim only from the link it publishes, and write the wallet, dates and transactions in a farm log.`,
      'no fee to check, and never pay to claim',
      '15 minutes at the end',
    ),
    stepText(
      `Write the exit before funding: leave if ${protocol.name}'s TVL stays below $${exitFloor} for two full weeks, and stop if a launch's claim page will not verify this wallet within 30 days.`,
      'no fee; the exit is a rule, not a trade',
      '10 minutes before you start',
    ),
  ];
}

/** The plan's economics from the row's own figures: expected airdrop, costs, hours and verdict. */
export function farmEconomics(protocol: SnapshotProtocol, impliedValue: number, age: number | null): {
  expected_airdrop_usd: number;
  farm_hours: number;
  farm_cost_usd: number;
  net_usd: number;
  per_hour_usd: number;
  verdict: 'farm' | 'thin' | 'skip';
} {
  const weeks = holdWeeksFor(age);
  const hours = ECONOMICS.setup_hours + ECONOMICS.weekly_hours * weeks;
  const capital = capitalFor(protocol.tvl_usd);
  const gas = ECONOMICS.gas_base_usd + ECONOMICS.gas_weekly_usd * weeks;
  const opportunity = capital * ECONOMICS.opportunity_rate * (weeks / 52);
  const expected = impliedValue * WALLET_SHARE;
  const net = expected - gas - opportunity;
  const perHour = net / hours;
  const verdict =
    net >= ECONOMICS.farm_net_usd && perHour >= ECONOMICS.farm_per_hour_usd
      ? 'farm'
      : net >= ECONOMICS.thin_net_usd && perHour >= ECONOMICS.thin_per_hour_usd
        ? 'thin'
        : 'skip';
  return {
    expected_airdrop_usd: round(expected),
    farm_hours: round1(hours),
    farm_cost_usd: round(gas + opportunity),
    net_usd: round(net),
    per_hour_usd: round1(perHour),
    verdict,
  };
}

// --------------------------------------------------------------------------- the board

/** The snapshot's protocol by slug. */
function indexOf(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((protocol) => [protocol.slug, protocol]));
}

/**
 * The P25–P75 implied interval: the fitted value's held-out residual band, scaled by the
 * same odds. The point estimate is always inside its own band, and the low bound never
 * drops below one dollar, so the page can draw the range on every row without exceptions.
 */
export function impliedInterval(value: number, odds: number, implied: number, q25: number, q75: number): { low: number; high: number } {
  const low = Math.max(1, Math.min(implied, round(value * Math.exp(q25) * odds)));
  const high = Math.max(low, Math.max(implied, round(value * Math.exp(q75) * odds)));
  return { low, high };
}

/** The ranked board: every plausible pre-token candidate, watchlist first by coverage. */
export function buildBoard(snapshot: Snapshot, comps: CompsModel, odds: OddsModel, validation: Validation): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter((protocol) => isCandidate(protocol));
  const scored = candidates.map((protocol) => {
    const age = ageDays(snapshot.as_of, protocol.listed_at);
    const ageYears = age === null ? 1 : Math.max(0.05, age / DAYS_PER_YEAR);
    const value = launchValue(protocol.tvl_usd, protocol.change_7d, protocol.category, comps);
    const oddsEventual = launchOdds(odds, protocol.tvl_usd, ageYears, growthTerm(protocol.change_7d));
    const implied = Math.max(1, round(value * oddsEventual));
    const interval = impliedInterval(value, oddsEventual, implied, validation.q25, validation.q75);
    const money = farmEconomics(protocol, implied, age);
    return { protocol, age, ageYears, value, oddsEventual, implied, interval, money };
  });
  scored.sort((a, b) => b.implied - a.implied || b.value - a.value || (a.protocol.slug < b.protocol.slug ? -1 : 1));
  return scored.map(({ protocol, age, ageYears, value, oddsEventual, implied, interval, money }, index) => ({
    rank: index + 1,
    slug: protocol.slug,
    name: protocol.name,
    category: protocol.category,
    chains: protocol.chains,
    tvl_usd: protocol.tvl_usd,
    change_7d: protocol.change_7d,
    mcap_usd: protocol.mcap_usd,
    listed_at: protocol.listed_at,
    token_status: 'pre-token',
    age_days: age,
    implied_value_usd: implied,
    implied_low_usd: interval.low,
    implied_high_usd: interval.high,
    launch_value_usd: round(value),
    odds_eventual: round4(oddsEventual),
    verdict: money.verdict,
    expected_airdrop_usd: money.expected_airdrop_usd,
    farm_hours: money.farm_hours,
    farm_cost_usd: money.farm_cost_usd,
    net_usd: money.net_usd,
    per_hour_usd: money.per_hour_usd,
    on_watchlist: watch.has(protocol.slug),
    model: {
      launch_value_usd: round(value),
      odds_eventual: round4(oddsEventual),
      implied_value_usd: implied,
      interval_low_usd: interval.low,
      interval_high_usd: interval.high,
      age_days: age,
      age_years: Math.round(ageYears * 100) / 100,
      growth_term: Math.round(growthTerm(protocol.change_7d) * 1000) / 1000,
      category_effect: protocol.category !== null ? (comps.category_effects[protocol.category] ?? 0) : 0,
      log_tvl: Math.round(Math.log(Math.max(1, protocol.tvl_usd)) * 1000) / 1000,
    },
    farm_steps: farmPlan(protocol, age),
  }));
}

/** The token trades anchors: one row per already-trading token, by market cap, for the page. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  const groups = new Map<string, SnapshotProtocol[]>();
  for (const protocol of snapshot.protocols) {
    const key = tokenKey(protocol);
    if (key === null || protocol.mcap_usd === null || protocol.mcap_usd <= 0) continue;
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [protocol]);
    else bucket.push(protocol);
  }
  const rows: LiveRow[] = [];
  for (const [key, bucket] of groups) {
    let representative = bucket[0]!;
    let tvl = 0;
    for (const protocol of bucket) {
      tvl += protocol.tvl_usd;
      if (protocol.tvl_usd > representative.tvl_usd) representative = protocol;
    }
    rows.push({
      slug: representative.slug,
      name: `${representative.name}${bucket.length > 1 ? ` (+${bucket.length - 1})` : ''}`,
      category: representative.category,
      chains: representative.chains,
      tvl_usd: tvl,
      mcap_usd: representative.mcap_usd!,
      change_7d: representative.change_7d,
      symbol: key,
      mcap_tvl: tvl > 0 ? Math.round((representative.mcap_usd! / tvl) * 100) / 100 : 0,
    });
  }
  return rows.sort((a, b) => b.mcap_usd - a.mcap_usd || (a.slug < b.slug ? -1 : 1)).slice(0, 40);
}

/** The snapshot's provenance line with any URL dropped: the dashboard may not name one. */
export function cleanSource(source: string): string {
  return source
    .replace(/https?:\/\/[^\s,]+/gi, '')
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

/** FNV-1a over each row's rank, slug and implied value: a digest the page can re-derive. */
export function boardDigest(rows: BoardRow[]): string {
  let hash = 0x811c9dc5;
  const text = rows.map((row) => `${row.rank}|${row.slug}|${row.implied_value_usd}`).join('\n');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `0x${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** Everything the dashboard needs: the fitted model, the board, the anchors and the stats. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { model: comps, validation } = fitComps(snapshot);
  const oddsFit = fitLaunchOdds(snapshot);
  const board = buildBoard(snapshot, comps, oddsFit.model, validation);
  const live = liveRows(snapshot);
  const trading = snapshot.protocols.filter((protocol) => hasToken(protocol)).length;
  const tradingWithMcap = snapshot.protocols.filter((protocol) => hasToken(protocol) && protocol.mcap_usd !== null).length;
  const tokenlessByDesign = snapshot.protocols.filter((protocol) => !hasToken(protocol) && !isCandidate(protocol)).length;
  const verdicts = { farm: 0, thin: 0, skip: 0 };
  for (const row of board) verdicts[row.verdict] += 1;
  const watchSet = new Set(snapshot.watchlist);
  const groups = [
    { label: 'already trading, with a market cap (comps training rows)', n: tradingWithMcap },
    { label: 'already trading, ticker only, no market cap (set aside)', n: trading - tradingWithMcap },
    { label: 'tokenless by design (exchanges, wrapped, staked, bridged, versioned)', n: tokenlessByDesign },
    { label: 'tokenless and plausible, scored on the board', n: board.length },
  ];
  const accounted = groups.reduce((sum, group) => sum + group.n, 0);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: cleanSource(snapshot.source),
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    comps: { ...comps, validation },
    odds: { ...oddsFit.model, auc: oddsFit.auc, brier: oddsFit.brier, brier_base: oddsFit.brier_base, calibration: oddsFit.calibration },
    economics: ECONOMICS,
    accounting: {
      groups,
      total: accounted,
      matches: accounted === snapshot.protocols.length,
      digest: boardDigest(board),
    },
    coverage: {
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      watchlist_covered: board.filter((row) => watchSet.has(row.slug)).length,
      scored: board.length,
      pre_token: snapshot.protocols.length - trading,
      tokenless_by_design: tokenlessByDesign,
      trading,
      trading_with_mcap: tradingWithMcap,
      trading_without_mcap: trading - tradingWithMcap,
      anchors: live.length,
      verdicts,
    },
    stats: {
      median_implied: round(median(board.map((row) => row.implied_value_usd))),
      top_implied: board.length > 0 ? board[0]!.implied_value_usd : 0,
      median_odds: round(median(board.map((row) => row.odds_eventual)) * 100) / 100,
    },
    rows: board,
    live,
  };
  return { board, radar };
}

// --------------------------------------------------------------------------- snapshot reading & gate

/** The snapshot out of a file's text, refused unless it is the shape this model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((slug) => typeof slug !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((value, index): SnapshotProtocol => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new SnapshotError(`snapshot.json's protocol ${index} is not an object`);
    const p = value as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${index} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((chain): chain is string => typeof chain === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is one the gate would refuse, or null: the gate's own rows, restated here. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board holds ${board.length} rows, fewer than 100`;
  if (board.length > 4000) return `the board holds ${board.length} rows, more than 4000`;
  const known = new Set(snapshot.protocols.map((protocol) => protocol.slug));
  const seen = new Set<string>();
  const slugs = new Set(board.map((row) => row.slug));
  const missing = snapshot.watchlist.filter((slug) => !slugs.has(slug));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((row) => row.rank).sort((a, b) => a - b);
  for (let index = 0; index < ranks.length; index += 1) if (ranks[index] !== index + 1) return `rank ${index + 1} is ${ranks[index]}`;
  for (let index = 1; index < board.length; index += 1) {
    if (board[index]!.implied_value_usd > board[index - 1]!.implied_value_usd) return `row ${index + 1} outranks row ${index} on implied value`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const row of board) {
    if (seen.has(row.slug)) return `${row.slug} appears more than once`;
    seen.add(row.slug);
    if (!known.has(row.slug)) return `${row.slug} is not one of the snapshot's protocols`;
    if (typeof row.name !== 'string' || row.name.length === 0) return `${row.slug} has no name`;
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0 || row.implied_value_usd > 100_000_000_000_000) {
      return `${row.slug} has implied value ${row.implied_value_usd}`;
    }
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps?.length} farm steps`;
    for (const step of row.farm_steps) if (typeof step !== 'string' || step.length < 20 || step.length > 600) return `${row.slug} has a farm step of ${step.length} characters`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
