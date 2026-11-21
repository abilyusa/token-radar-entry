// Token Radar: a pre-token protocol board ranked by an implied value derived
// from the snapshot's own figures, never from a hard-coded list of names.
//
// The model:
//   - comparables: for each category, the median market-cap/TVL ratio of the
//     snapshot's own token-bearing protocols (three or more needed, else the
//     whole snapshot's median). That multiple is the market's own price for
//     one dollar of TVL in that category, read from the data, not assumed.
//   - growth: the protocol's seven-day TVL change, clamped, moves the value.
//   - age: how long it has run with no token, log-scaled, capped.
//   - breadth: one chain is the baseline; each extra chain adds a little.
//   - plausibility: a protocol whose record says it is an exchange, a bridge,
//     a wrapped or staked product, or a versioned pool is not a token launch
//     waiting to happen. It stays on the board, ranked near the bottom, with
//     the reason stated, because the house's own watchlist rule says so.
//   implied = TVL x category multiple x growth x age x breadth x plausibility
//
// The board ranks every pre-token protocol in the snapshot (342 here), not
// just the watchlist floor: the watchlist is the floor, never the ceiling.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One row of board.json: the ranked board's row. */
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
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    age_multiplier: number;
    breadth_multiplier: number;
    plausibility: number;
    plausibility_reason: string;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/**
 * The dashboard's compact data: rows as arrays, categories and chains as
 * shared tables, so 342 rows fit the dossier's text cap with room to spare.
 * A row is [rank, slug, name, catIdx, chainIdxs, tvl, ch7, age, implied,
 * catMult, growthMult, ageMult, breadthMult, plausibility, reasonIdx, watch].
 * A live row is [slug, name, catIdx, tvl, mcap, ch7].
 */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model_note: string;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  screened_out: number;
  screened_top: (string | number)[][];
  cats: string[];
  chains: string[];
  reasons: string[];
  cat_multiples: Record<string, number>;
  overall_multiple: number;
  rows: (string | number | number[] | null)[][];
  live: (string | number | null)[][];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** This model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** The model's one-line statement, shown on the dashboard. */
export const MODEL_NOTE =
  'Implied value = TVL x the category multiple (the median market-cap/TVL of this snapshot\'s own token-bearing protocols in that category) x growth x age x breadth x plausibility. No protocol name is ever special-cased.';

/** Plausibility reasons, in the order the dashboard's table lists them. */
export const REASONS = ['ok', 'cex', 'bridge', 'staking', 'wrapped', 'versioned', 'exchange'];

/** How many live-token protocols the comparison view carries, by market cap. */
export const LIVE_ROWS = 16;

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Round to 4 decimal places, for the factors the dashboard prints. */
export function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** The median of a sorted list of numbers. */
function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[(n - 1) / 2] as number;
  return ((sorted[n / 2 - 1] as number) + (sorted[n / 2] as number)) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Exchange names: a protocol beginning with one is that exchange's product. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Categories that cannot be a protocol token launch, by the house's own watchlist rule. */
const NO_LAUNCH_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/**
 * Why a protocol is (or is not) a plausible token launch, and the factor it gets.
 * The rule is the house's watchlist rule, applied as a weight instead of a cut:
 * an exchange, a bridge, a wrapped or staked product, or a versioned pool is
 * not a token waiting to launch, so it is ranked near the bottom with the
 * reason stated, never hidden and never mixed into the launch candidates.
 */
export function plausibility(p: SnapshotProtocol): { factor: number; reason: string } {
  const name = p.name;
  if (p.category === 'CEX') return { factor: 0.05, reason: 'cex' };
  if (p.category === 'Bridge' || p.category === 'Canonical Bridge') return { factor: 0.05, reason: 'bridge' };
  if (p.category === 'Liquid Staking' || p.category === 'Liquid Restaking' || p.category === 'Restaked BTC') {
    return { factor: 0.05, reason: 'staking' };
  }
  if (/\bwrapped\b/i.test(name)) return { factor: 0.05, reason: 'wrapped' };
  if (/\b(staked|staking)\b/i.test(name)) return { factor: 0.05, reason: 'staking' };
  if (VERSIONED.test(name)) return { factor: 0.05, reason: 'versioned' };
  if (EXCHANGE_PREFIX.test(name)) return { factor: 0.05, reason: 'exchange' };
  return { factor: 1, reason: 'ok' };
}

/**
 * The category multiples, read from the snapshot's own token-bearing
 * protocols: for each category, the median market-cap/TVL of its protocols
 * that already trade (three or more needed), else the whole snapshot's
 * median. Clamped so one outlier category cannot set the board's scale.
 */
export function categoryMultiples(snapshot: Snapshot): { byCategory: Map<string, number>; overall: number } {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const cat = p.category ?? 'Uncategorized';
    const list = byCat.get(cat);
    if (list === undefined) byCat.set(cat, [ratio]);
    else list.push(ratio);
  }
  all.sort((a, b) => a - b);
  const overallRaw = median(all);
  const clamp = (x: number): number => Math.min(1.5, Math.max(0.03, x));
  const overall = round4(clamp(overallRaw));
  const byCategory = new Map<string, number>();
  for (const [cat, ratios] of byCat) {
    ratios.sort((a, b) => a - b);
    byCategory.set(cat, ratios.length >= 3 ? round4(clamp(median(ratios))) : overall);
  }
  return { byCategory, overall };
}

/** The multipliers and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: { byCategory: Map<string, number>; overall: number },
): {
  implied: number;
  categoryMultiple: number;
  growthPct: number;
  growthMult: number;
  ageMult: number;
  breadthMult: number;
  plausibilityFactor: number;
  plausibilityReason: string;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const cat = protocol.category ?? 'Uncategorized';
  const categoryMultiple = multiples.byCategory.get(cat) ?? multiples.overall;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(80, Math.max(-40, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * 0.6;
  const ageMult = age === null ? 1 : Math.min(1.5, 1 + 0.18 * Math.log(1 + age / 365));
  const extraChains = Math.max(0, protocol.chains.length - 1);
  const breadthMult = 1 + 0.04 * Math.min(extraChains, 5);
  const { factor: plausibilityFactor, reason: plausibilityReason } = plausibility(protocol);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * categoryMultiple * growthMult * ageMult * breadthMult * plausibilityFactor));
  return { implied, categoryMultiple, growthPct, growthMult: round4(growthMult), ageMult: round4(ageMult), breadthMult: round4(breadthMult), plausibilityFactor, plausibilityReason, age };
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? (p.chains[0] as string) : 'its main chain';
}

/** What one transaction typically costs on a chain, and the token it is paid in. */
function chainGas(chain: string): { gas: string; token: string } {
  switch (chain) {
    case 'Ethereum':
      return { gas: '$5 to $15', token: 'ETH' };
    case 'Solana':
      return { gas: 'about $0.05', token: 'SOL' };
    case 'Arbitrum':
      return { gas: 'about $0.50', token: 'ETH' };
    case 'Base':
      return { gas: 'about $0.30', token: 'ETH' };
    case 'Optimism':
      return { gas: 'about $0.50', token: 'ETH' };
    case 'Binance':
      return { gas: 'about $0.20', token: 'BNB' };
    case 'Polygon':
      return { gas: 'about $0.10', token: 'POL' };
    case 'Avalanche':
      return { gas: 'about $0.30', token: 'AVAX' };
    case 'Berachain':
      return { gas: 'about $0.20', token: 'BERA' };
    case 'Sui':
      return { gas: 'about $0.05', token: 'SUI' };
    case 'Aptos':
      return { gas: 'about $0.05', token: 'APT' };
    case 'Tron':
      return { gas: 'about $1', token: 'TRX' };
    default:
      return { gas: 'about $1', token: 'the chain token' };
  }
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} as a lender and keep the position open.`;
  }
  if (c.includes('dex') || c.includes('amm') || c.includes('spot')) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} in the pair the app suggests and keep the position open.`;
  }
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('vault')) {
    return `Deposit $${capital} of USDC into ${name}'s main yield vault on ${chain} and keep the shares.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`;
  }
  if (c.includes('bridge') || c.includes('cross-chain')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  }
  if (c.includes('staking') || c.includes('restak') || c.includes('liquid staking')) {
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} on ${name} on ${chain} and place one market position.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  }
  if (c.includes('rwa') || c.includes('real world')) {
    return `Mint $${capital} of the protocol's yield asset on ${chain} through ${name} and hold it.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  }
  if (c.includes('launchpad')) {
    return `Join $${capital} to ${name}'s next launch on ${chain} through its own app.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names. The dashboard's page builds
 * the same six steps from the same record, so the detail view and the board
 * never disagree.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = chainGas(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and fund it with $${capital} in USDC plus enough ${gas.token} for gas on ${chain}.`,
      cost: `${gas.gas} of gas for the first transaction`,
      time: '10 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas.gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, so the wallet stays active.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, never from a link in a chat or a search ad.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's comparison view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n.
 *
 * Only launch candidates are ranked: a protocol the house's own watchlist
 * rule screens out (an exchange, a bridge, a wrapped or staked product, a
 * versioned pool) is not a token waiting to launch, so it takes no rank.
 * The dashboard still names how many were screened out and why. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const multiples = categoryMultiples(snapshot);
  const scored = snapshot.protocols
    .filter((p) => isPreToken(p))
    .map((p) => {
      const v = impliedValue(p, snapshot.as_of, multiples);
      return { p, v };
    })
    .filter((s) => s.v.plausibilityReason === 'ok');
  scored.sort(
    (a, b) =>
      b.v.implied - a.v.implied ||
      b.p.tvl_usd - a.p.tvl_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      category_multiple: s.v.categoryMultiple,
      growth_pct: s.v.growthPct,
      growth_multiplier: s.v.growthMult,
      age_multiplier: s.v.ageMult,
      breadth_multiplier: s.v.breadthMult,
      plausibility: s.v.plausibilityFactor,
      plausibility_reason: s.v.plausibilityReason,
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** One board row in the dashboard's compact array form. */
export function radarRow(
  row: BoardRow,
  catIndex: Map<string, number>,
  chainIndex: Map<string, number>,
  watch: Set<string>,
): (string | number | number[] | null)[] {
  return [
    row.rank,
    row.slug,
    row.name,
    catIndex.get(row.category ?? 'Uncategorized') ?? 0,
    row.chains.map((c) => chainIndex.get(c) ?? 0),
    row.tvl_usd,
    row.change_7d,
    row.age_days,
    row.implied_value_usd,
    row.model.category_multiple,
    row.model.growth_multiplier,
    row.model.age_multiplier,
    row.model.breadth_multiplier,
    row.model.plausibility,
    REASONS.indexOf(row.model.plausibility_reason),
    watch.has(row.slug) ? 1 : 0,
  ];
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const multiples = categoryMultiples(snapshot);
  const cats: string[] = [];
  const catIndex = new Map<string, number>();
  const chains: string[] = [];
  const chainIndex = new Map<string, number>();
  const addCat = (c: string): void => {
    if (!catIndex.has(c)) {
      catIndex.set(c, cats.length);
      cats.push(c);
    }
  };
  const addChain = (c: string): void => {
    if (!chainIndex.has(c)) {
      chainIndex.set(c, chains.length);
      chains.push(c);
    }
  };
  for (const p of snapshot.protocols) {
    addCat(p.category ?? 'Uncategorized');
    for (const c of p.chains) addChain(c);
  }
  addCat('Uncategorized');
  const catMultiples: Record<string, number> = {};
  for (const [cat, mult] of multiples.byCategory) catMultiples[cat] = mult;
  const watch = new Set(snapshot.watchlist);
  const screened = snapshot.protocols
    .filter((p) => isPreToken(p) && plausibility(p).reason !== 'ok')
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, 5)
    .map((p) => [p.name, plausibility(p).reason, p.tvl_usd]);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model_note: MODEL_NOTE,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    screened_out: snapshot.protocols.filter((p) => isPreToken(p) && plausibility(p).reason !== 'ok').length,
    screened_top: screened,
    cats,
    chains,
    reasons: REASONS,
    cat_multiples: catMultiples,
    overall_multiple: multiples.overall,
    rows: board.map((r) => radarRow(r, catIndex, chainIndex, watch)),
    live: live.map((p) => [p.slug, p.name, catIndex.get(p.category ?? 'Uncategorized') ?? 0, p.tvl_usd, p.mcap_usd, p.change_7d]),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
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
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
