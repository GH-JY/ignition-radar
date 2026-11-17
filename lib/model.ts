// The Ignition radar's model. One sealed snapshot of DefiLlama's protocol universe goes in; a ranked
// board of pre-token protocols and the dashboard's data go out.
//
// The board carries every slug on the snapshot's watchlist (the gate's floor) plus every other
// pre-token protocol the snapshot holds below the watchlist's TVL floor, so the radar sees the whole
// early field and not only the house's list. Protocols that already record a token are set apart as
// the market's own values and never enter the ranked board.
//
// A protocol's implied value is what its token could be worth if the protocol's record held:
//
//   implied = tvl_usd x BASE_MULTIPLE x category_multiplier x growth_multiplier x tenure_multiplier
//
//   growth_multiplier = 1 + clamp(change_7d, -50, 150) / 100 x GROWTH_WEIGHT
//   tenure_multiplier = TENURE_FLOOR + min(age_days, TENURE_DAYS) / TENURE_DAYS x TENURE_RANGE
//
// The category multiplier is the sector's share of TVL a launch tends to price in; the growth
// multiplier reads the last seven days; the tenure multiplier rewards a protocol that has run longer
// without a token, since tenure is the record a launch would be priced against. Unknown ages use one
// year. No protocol name is ever special-cased: every row goes through the same function, and the
// dashboard re-runs it from the snapshot figures it shows.

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

/** The model's constants: the page states them and the method view shows them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  tenure_floor: number;
  tenure_range: number;
  tenure_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.3,
  growth_weight: 0.55,
  growth_floor: -50,
  growth_cap: 150,
  tenure_floor: 0.55,
  tenure_range: 0.65,
  tenure_days: 2555,
  unknown_age_days: 365,
};

export const MODEL_VERSION = 'ignition-1';

/** The sector multiple: a launch's expected value as a share of the protocol's TVL. */
export const SECTOR_MULTIPLIER: Record<string, number> = {
  Chain: 1.45,
  Lending: 1.4,
  RWA: 1.35,
  CDP: 1.3,
  Dexs: 1.25,
  Derivatives: 1.2,
  'Interest Rate Derivatives': 1.2,
  CeDeFi: 1.1,
  Restaking: 1.1,
  'Liquid Restaking': 1.1,
  'Liquid Staking': 1.05,
  'Prediction Market': 1.05,
  'Risk Curators': 1.0,
  'Onchain Capital Allocator': 0.95,
  Yield: 0.95,
  'Staking Pool': 0.95,
  'Yield Aggregator': 0.9,
  Farm: 0.9,
  'Leveraged Farming': 0.85,
  'Basis Trading': 0.85,
  Insurance: 0.8,
  Bridge: 0.7,
  'Cross Chain Bridge': 0.7,
  'Canonical Bridge': 0.65,
  Privacy: 0.85,
  Payments: 0.85,
  'Crypto Card Issuer': 0.8,
  Indexes: 0.8,
  'Options Vault': 0.85,
  'OTC Marketplace': 0.75,
  'Governance Incentives': 0.6,
  'Stablecoin Wrapper': 0.6,
  'Dual-Token Stablecoin': 0.95,
  'Anchor BTC': 0.7,
  'Decentralized BTC': 0.7,
  'Restaked BTC': 0.7,
  'Collateral Markets': 1.1,
  'CDP Manager': 1.2,
  'Uncollateralized Lending': 1.15,
  'Liquidity Manager': 1.0,
};

export const DEFAULT_SECTOR_MULTIPLIER = 0.9;
export const EARLY_ROWS = 210;
export const LIVE_ROWS = 40;

/** The sector multiple for a category, by its name and then by its leading word. */
export function sectorMultiplier(category: string | null): number {
  if (category === null) return DEFAULT_SECTOR_MULTIPLIER;
  const exact = SECTOR_MULTIPLIER[category];
  if (exact !== undefined) return exact;
  const c = category.toLowerCase();
  if (c.includes('lend')) return 1.4;
  if (c.includes('cdp')) return 1.3;
  if (c.includes('dex')) return 1.25;
  if (c.includes('deriv') || c.includes('perp') || c.includes('option')) return 1.2;
  if (c.includes('rwa')) return 1.35;
  if (c.includes('stak') || c.includes('restak')) return 1.05;
  if (c.includes('predict')) return 1.05;
  if (c.includes('curator') || c.includes('allocator')) return 1.0;
  if (c.includes('yield') || c.includes('farm')) return 0.9;
  if (c.includes('bridge')) return 0.7;
  if (c.includes('chain')) return 1.45;
  if (c.includes('stable')) return 0.95;
  return DEFAULT_SECTOR_MULTIPLIER;
}

/** The model's breakdown for one protocol, every figure derived from the snapshot. */
export interface RowModel {
  base_multiple: number;
  sector_multiplier: number;
  growth_pct: number;
  growth_multiplier: number;
  tenure_multiplier: number;
  age_days: number | null;
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
  signal: 'strong' | 'building' | 'early';
  signal_score: number;
  on_watchlist: boolean;
  model: RowModel;
  farm_steps: string[];
}

/** The dashboard's row: the board row without the fields the page derives. */
export type RadarRow = BoardRow;

/** A protocol that already records a token: shown at the market's value, never ranked as a launch. */
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

/** Everything the page renders, as one script. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  sectors: Record<string, number>;
  default_sector: number;
  stats: {
    protocols: number;
    watchlist: number;
    board: number;
    early: number;
    live: number;
    live_protocols: number;
    median_implied: number;
  };
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round = (n: number): number => Math.round(n);

/** A finite number, else the fallback. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from the snapshot's as_of date back to the protocol's listing date; null when unknown. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(protocol: SnapshotProtocol): boolean {
  return protocol.mcap_usd === null && protocol.gecko_id === null && protocol.symbol === null;
}

const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether the board may rank a record: pre-token, not an exchange, not a versioned pool of another. */
export function isRankable(protocol: SnapshotProtocol): boolean {
  return isPreToken(protocol) && protocol.category !== 'CEX' && !VERSION_MARKER.test(protocol.name);
}

/** The model's three multipliers and the implied value for one protocol. */
export function valueOf(protocol: SnapshotProtocol, asOf: string, model: ModelConstants = MODEL): { implied: number; model: RowModel } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMultiplier = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const tenureMultiplier =
    model.tenure_floor + (Math.min(Math.max(ageForModel, 0), model.tenure_days) / model.tenure_days) * model.tenure_range;
  const sector = sectorMultiplier(protocol.category);
  const raw = protocol.tvl_usd * model.base_multiple * sector * growthMultiplier * tenureMultiplier;
  const implied = Math.max(1, Math.min(100_000_000_000_000, round(raw)));
  return {
    implied,
    model: {
      base_multiple: model.base_multiple,
      sector_multiplier: sector,
      growth_pct: Math.round(growthPct * 100) / 100,
      growth_multiplier: Math.round(growthMultiplier * 1e4) / 1e4,
      tenure_multiplier: Math.round(tenureMultiplier * 1e4) / 1e4,
      age_days: age,
    },
  };
}

/**
 * The launch signal's raw score, from the same snapshot figures: momentum over the last seven days,
 * how long the protocol has run without a token, and how much TVL it carries. The board then splits
 * itself into bands by this score; the bands order attention, they do not predict a launch.
 */
export function launchScore(protocol: SnapshotProtocol, age: number | null): number {
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, rawGrowth));
  const growth = (growthPct - MODEL.growth_floor) / (MODEL.growth_cap - MODEL.growth_floor);
  const ageForScore = Math.min(Math.max(age ?? MODEL.unknown_age_days, 0), MODEL.tenure_days);
  const tenure = ageForScore / MODEL.tenure_days;
  const size = Math.min(1, Math.max(0, protocol.tvl_usd / 500_000_000));
  return growth * 0.45 + tenure * 0.35 + size * 0.2;
}

/** How much capital one farm position takes, from the protocol's own TVL. */
function capitalFor(protocol: SnapshotProtocol): number {
  if (protocol.tvl_usd >= 5_000_000_000) return 250;
  if (protocol.tvl_usd >= 1_000_000_000) return 200;
  if (protocol.tvl_usd >= 250_000_000) return 150;
  if (protocol.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's tenure: a young protocol needs a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 730) return 30;
  return 21;
}

function chainOf(protocol: SnapshotProtocol): string {
  return protocol.chains.length > 0 ? protocol.chains[0]! : 'its main chain';
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
  if (c.includes('yield') || c.includes('farm')) {
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
  if (c.includes('yield') || c.includes('farm')) {
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

/**
 * The protocol's farm plan: six concrete steps with a cost and a time each, derived from the
 * protocol's record (category, chains, TVL, tenure), never from a hand-written list of names.
 */
export function farmPlan(protocol: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(protocol);
  const capital = capitalFor(protocol);
  const hold = holdDaysFor(age);
  const category = protocol.category ?? '';
  const primary = primaryAction(protocol, capital, chain);
  const secondary = secondaryAction(protocol, category);
  const gas = primary.gas;
  return [
    stepText(
      'Create a fresh wallet for this position and keep its seed phrase offline; fund it a little beyond the deposit so gas never blocks an exit.',
      `about $3 of gas to fund the wallet`,
      '10 minutes',
    ),
    stepText(primary.text, `$${capital} of capital and about $${gas} of gas`, '15 minutes to set up'),
    stepText(secondary.text, secondary.cost, '15 minutes'),
    stepText(
      `Once a week, make one qualifying action on ${protocol.name} (a deposit, a borrow, a swap or a vote) and keep the receipts.`,
      'about $2 to $5 of gas a week',
      '10 minutes a week',
    ),
    stepText(
      `Keep the position open for at least ${hold} days so it spans several snapshots and the protocol's record can price it.`,
      `the $${capital} stays in the position`,
      `${hold} days`,
    ),
    stepText(
      `Check ${protocol.name}'s own site for a points or rewards page, claim only from the link it publishes, and write the wallet, dates and transactions in a farm log.`,
      'no fee to check, and never pay to claim',
      '15 minutes at the end',
    ),
  ];
}

/** The snapshot's protocol by slug. */
function indexOf(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((protocol) => [protocol.slug, protocol]));
}

/** The ranked board: the watchlist plus every rankable pre-token protocol below the floor. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = indexOf(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const protocol = index.get(slug);
    if (protocol !== undefined) chosen.set(slug, protocol);
  }
  const early = snapshot.protocols
    .filter((protocol) => !chosen.has(protocol.slug) && isRankable(protocol) && protocol.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const protocol of early) chosen.set(protocol.slug, protocol);

  const watch = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((protocol) => {
    const valued = valueOf(protocol, snapshot.as_of, model);
    return { protocol, ...valued, score: launchScore(protocol, valued.model.age_days) };
  });

  // The signal bands are the board's own: the strongest fifth, the next three tenths, the rest.
  const bands = new Map<string, 'strong' | 'building' | 'early'>();
  const rankedByScore = [...scored].sort((a, b) => b.score - a.score || (a.protocol.slug < b.protocol.slug ? -1 : 1));
  const strongCut = Math.max(1, Math.round(rankedByScore.length * 0.2));
  const buildingCut = Math.round(rankedByScore.length * 0.5);
  rankedByScore.forEach((entry, index) => {
    bands.set(entry.protocol.slug, index < strongCut ? 'strong' : index < buildingCut ? 'building' : 'early');
  });

  scored.sort((a, b) => b.implied - a.implied || b.protocol.tvl_usd - a.protocol.tvl_usd || (a.protocol.slug < b.protocol.slug ? -1 : 1));
  return scored.map(({ protocol, implied, model: breakdown, score }, index) => ({
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
    age_days: breakdown.age_days,
    implied_value_usd: implied,
    signal: bands.get(protocol.slug) ?? 'early',
    signal_score: Math.round(score * 1000) / 1000,
    on_watchlist: watch.has(protocol.slug),
    model: breakdown,
    farm_steps: farmPlan(protocol, breakdown.age_days),
  }));
}

/** The protocols that already record a token, by market cap, for the page's separate view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((protocol) => !isPreToken(protocol) && protocol.category !== 'CEX' && (protocol.mcap_usd ?? 0) > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((protocol) => ({
      slug: protocol.slug,
      name: protocol.name,
      category: protocol.category,
      chains: protocol.chains,
      tvl_usd: protocol.tvl_usd,
      mcap_usd: protocol.mcap_usd ?? 0,
      change_7d: protocol.change_7d,
      symbol: protocol.symbol,
      mcap_tvl: protocol.tvl_usd > 0 ? Math.round(((protocol.mcap_usd ?? 0) / protocol.tvl_usd) * 100) / 100 : 0,
    }));
}

/** Median implied value of the board, for the page's stat tile. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

/** Everything the dashboard needs: the board, the live set, the model and its stats. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const early = board.filter((row) => !watch.has(row.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    sectors: SECTOR_MULTIPLIER,
    default_sector: DEFAULT_SECTOR_MULTIPLIER,
    stats: {
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      board: board.length,
      early,
      live: live.length,
      live_protocols: snapshot.protocols.filter((protocol) => !isPreToken(protocol) && protocol.category !== 'CEX').length,
      median_implied: median(board.map((row) => row.implied_value_usd)),
    },
    rows: board,
    live,
  };
  return { board, radar };
}

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
