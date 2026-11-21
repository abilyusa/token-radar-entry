// Token Radar dashboard (radar-2). Static page, no network: it reads window.RADAR
// from data.js, renders the board, and builds each protocol's farm plan from
// the same record the model scored, so the detail view and board.json agree.
//
// A row is [rank, slug, name, catIdx, chainIdxs, tvl, ch7, age, implied,
// catMult, growthMult, ageMult, breadthMult, plausibility, reasonIdx, watch].
// A live row is [slug, name, catIdx, tvl, mcap, ch7].

const R = (typeof window !== 'undefined' && window.RADAR) ? window.RADAR : null;
const CATS = R ? R.cats : [];
const CHAINS = R ? R.chains : [];
const REASONS = R ? R.reasons : [];

/** One board row, decoded. */
function decode(a) {
  return {
    rank: a[0], slug: a[1], name: a[2], cat: CATS[a[3]] || 'Uncategorized',
    chains: a[4].map(function (i) { return CHAINS[i] || ''; }).filter(Boolean),
    tvl: a[5], ch7: a[6], age: a[7], implied: a[8], catMult: a[9],
    gMult: a[10], aMult: a[11], bMult: a[12], plaus: a[13],
    reason: REASONS[a[14]] || 'ok', watch: a[15] === 1,
  };
}

const ROWS = R ? R.rows.map(decode) : [];
const LIVE = R ? R.live.map(function (a) {
  return { slug: a[0], name: a[1], cat: CATS[a[2]] || 'Uncategorized', tvl: a[3], mcap: a[4], ch7: a[5] };
}) : [];
const WATCH = new Set(R ? R.rows.filter(function (a) { return a[15] === 1; }).map(function (a) { return a[1]; }) : []);

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function money(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
}

function pct(n) {
  if (n === null || n === undefined) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
}

function ageText(n) {
  if (n === null || n === undefined) return '—';
  if (n < 365) return n + 'd';
  return (n / 365).toFixed(1) + 'y';
}

// ---- Farm plans: the same six steps lib/model.ts writes to board.json. ----

function chainGas(chain) {
  switch (chain) {
    case 'Ethereum': return { gas: '$5 to $15', token: 'ETH' };
    case 'Solana': return { gas: 'about $0.05', token: 'SOL' };
    case 'Arbitrum': return { gas: 'about $0.50', token: 'ETH' };
    case 'Base': return { gas: 'about $0.30', token: 'ETH' };
    case 'Optimism': return { gas: 'about $0.50', token: 'ETH' };
    case 'Binance': return { gas: 'about $0.20', token: 'BNB' };
    case 'Polygon': return { gas: 'about $0.10', token: 'POL' };
    case 'Avalanche': return { gas: 'about $0.30', token: 'AVAX' };
    case 'Berachain': return { gas: 'about $0.20', token: 'BERA' };
    case 'Sui': return { gas: 'about $0.05', token: 'SUI' };
    case 'Aptos': return { gas: 'about $0.05', token: 'APT' };
    case 'Tron': return { gas: 'about $1', token: 'TRX' };
    default: return { gas: 'about $1', token: 'the chain token' };
  }
}

function capitalFor(tvl) {
  if (tvl >= 5000000000) return 250;
  if (tvl >= 1000000000) return 150;
  if (tvl >= 100000000) return 100;
  return 50;
}

function holdDaysFor(age) {
  if (age === null || age === undefined) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(row, capital, chain) {
  const c = (row.cat || '').toLowerCase();
  const name = row.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as a lender and keep the position open.';
  if (c.includes('dex') || c.includes('amm') || c.includes('spot')) return 'Provide $' + capital + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' in the pair the app suggests and keep the position open.';
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('vault')) return 'Deposit $' + capital + ' of USDC into ' + name + '\'s main yield vault on ' + chain + ' and keep the shares.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position.';
  if (c.includes('bridge') || c.includes('cross-chain')) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
  if (c.includes('staking') || c.includes('restak') || c.includes('liquid staking')) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' on ' + chain + ' and keep the receipt token.';
  if (c.includes('prediction')) return 'Fund $' + capital + ' on ' + name + ' on ' + chain + ' and place one market position.';
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
  if (c.includes('stable')) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
  if (c.includes('rwa') || c.includes('real world')) return 'Mint $' + capital + ' of the protocol\'s yield asset on ' + chain + ' through ' + name + ' and hold it.';
  if (c.includes('insurance')) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
  if (c.includes('launchpad')) return 'Join $' + capital + ' to ' + name + '\'s next launch on ' + chain + ' through its own app.';
  return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
}

function stepText(step) {
  let s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
  if (s.length > 600) s = s.slice(0, 596) + '...';
  if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
  return s;
}

/** The six farm steps for a row, identical to the ones board.json carries. */
function farmStepsFor(row) {
  const chain = row.chains.length > 0 ? row.chains[0] : 'its main chain';
  const gas = chainGas(chain);
  const capital = capitalFor(row.tvl);
  const hold = holdDaysFor(row.age);
  const action = actionFor(row, capital, chain);
  return [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and fund it with $' + capital + ' in USDC plus enough ' + gas.token + ' for gas on ' + chain + '.', cost: gas.gas + ' of gas for the first transaction', time: '10 minutes' },
    { text: action, cost: '$' + capital + ' of capital and ' + gas.gas + ' of gas', time: '15 minutes to set up' },
    { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, so the wallet stays active.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
    { text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes, never from a link in a chat or a search ad.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: 'Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
  ].map(stepText);
}

const REASON_TEXT = {
  ok: 'Launch candidate: its record shows no token, and nothing in it says the token already exists elsewhere.',
  cex: 'An exchange\u2019s own record. An exchange is not a protocol waiting to issue a token, so the value is cut to 5%.',
  bridge: 'A bridge moves other protocols\u2019 assets. Its own token, if any, is not the launch this radar hunts, so the value is cut to 5%.',
  staking: 'A staked or restaked product of a token that already trades. Not a new launch, so the value is cut to 5%.',
  wrapped: 'A wrapped product of a token that already trades. Not a new launch, so the value is cut to 5%.',
  versioned: 'A versioned pool of another protocol (its name ends in a version). Not a standalone launch, so the value is cut to 5%.',
  exchange: 'A product of an exchange, named after it. Not a standalone protocol launch, so the value is cut to 5%.',
};

// Node test hook: `node -e "const a=require('./app.js'); ..."` checks the plan
// generator against board.json without a browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { farmStepsFor, stepText, decode, ROWS };
}

// ---- Rendering (browser only) ----

if (typeof document !== 'undefined') {
  const app = document.getElementById('app');
  const state = { q: '', cat: '', chain: '', watch: false, sort: 'rank', dir: 1, detail: null, limit: 120 };

  function readHash() {
    const h = new URLSearchParams((location.hash || '').slice(1));
    state.q = h.get('q') || '';
    state.cat = h.get('cat') || '';
    state.chain = h.get('chain') || '';
    state.watch = h.get('watchlist') === '1';
    state.sort = h.get('sort') || 'rank';
    state.detail = h.get('detail') || null;
  }

  function writeHash() {
    const h = new URLSearchParams();
    if (state.q) h.set('q', state.q);
    if (state.cat) h.set('cat', state.cat);
    if (state.chain) h.set('chain', state.chain);
    if (state.watch) h.set('watchlist', '1');
    if (state.sort !== 'rank') h.set('sort', state.sort);
    if (state.detail) h.set('detail', state.detail);
    history.replaceState(null, '', '#' + h.toString());
  }

  const SORTS = {
    rank: function (a, b) { return a.rank - b.rank; },
    implied: function (a, b) { return b.implied - a.implied; },
    tvl: function (a, b) { return b.tvl - a.tvl; },
    ch7: function (a, b) { return (b.ch7 || 0) - (a.ch7 || 0); },
    age: function (a, b) { return (b.age || 0) - (a.age || 0); },
  };

  function filtered() {
    const q = state.q.trim().toLowerCase();
    let rows = ROWS.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (state.cat && r.cat !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.watch && !r.watch) return false;
      return true;
    });
    const fn = SORTS[state.sort] || SORTS.rank;
    rows = rows.slice().sort(function (a, b) { return fn(a, b) * state.dir; });
    return rows;
  }

  function rowHtml(r) {
    const chg = r.ch7 === null ? '<td class="num">—</td>' : '<td class="num ' + (r.ch7 >= 0 ? 'up' : 'down') + '">' + pct(r.ch7) + '</td>';
    const tags = (r.watch ? ' <span class="tag watch">Watchlist</span>' : '') + (r.reason !== 'ok' ? ' <span class="tag low">Not a launch</span>' : '');
    return '<tr class="row' + (state.detail === r.slug ? ' sel' : '') + '" data-slug="' + esc(r.slug) + '">'
      + '<td class="rank">' + r.rank + '</td>'
      + '<td><b>' + esc(r.name) + '</b><br><span class="note">' + esc(r.slug) + '</span>' + tags + '</td>'
      + '<td>' + esc(r.cat) + '</td>'
      + '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>'
      + '<td class="num">' + money(r.tvl) + '</td>' + chg
      + '<td class="num">' + ageText(r.age) + '</td>'
      + '<td class="num implied">' + money(r.implied) + '</td></tr>';
  }

  function detailHtml(r) {
    const steps = farmStepsFor(r);
    return '<section class="detail"><h2>#' + r.rank + ' ' + esc(r.name) + '</h2>'
      + '<p class="meta">' + esc(r.slug) + ' · ' + esc(r.cat) + ' · ' + esc(r.chains.join(', ')) + ' · TVL ' + money(r.tvl) + ' · 7d ' + pct(r.ch7) + ' · running ' + ageText(r.age) + ' with no token recorded</p>'
      + '<table class="factors"><tr><td>TVL</td><td>' + money(r.tvl) + '</td></tr>'
      + '<tr><td>Category multiple (' + esc(r.cat) + ', median market-cap/TVL of this snapshot\u2019s trading protocols in the category)</td><td>' + r.catMult.toFixed(2) + 'x</td></tr>'
      + '<tr><td>Growth, 7d ' + pct(r.ch7) + '</td><td>' + r.gMult.toFixed(2) + 'x</td></tr>'
      + '<tr><td>Age, ' + ageText(r.age) + ' with no token</td><td>' + r.aMult.toFixed(2) + 'x</td></tr>'
      + '<tr><td>Breadth, ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</td><td>' + r.bMult.toFixed(2) + 'x</td></tr>'
      + '<tr><td>Plausibility</td><td>' + (r.plaus * 100).toFixed(0) + '%</td></tr>'
      + '<tr><td><b>Implied value</b></td><td><b>' + money(r.implied) + '</b></td></tr></table>'
      + '<p class="note">' + esc(REASON_TEXT[r.reason] || REASON_TEXT.ok) + '</p>'
      + '<h3>Farm plan</h3><ol class="steps">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>'
      + '<p class="note">Records no token means DefiLlama records no token for this protocol, not that it has none. An implied value is this radar\u2019s claim from the snapshot\u2019s figures, never a prediction that a token will be issued, or when.</p></section>';
  }

  function render() {
    const rows = filtered();
    const shown = rows.slice(0, state.limit);
    const detailRow = state.detail ? ROWS.find(function (r) { return r.slug === state.detail; }) : null;
    const cats = CATS.slice().sort();
    const chains = CHAINS.slice().sort();
    let h = '<div class="wrap"><header><h1>Token Radar <span>· pre-token protocols ranked by implied value</span></h1>'
      + '<p class="sub">Snapshot as of ' + esc(R.as_of) + ' · ' + R.board_size + ' pre-token protocols ranked · ' + R.watchlist_size + ' on the watchlist · model ' + esc(R.model_version) + '</p></header>'
      + '<div class="model"><b>How the value is set:</b> ' + esc(R.model_note) + '</div>'
      + '<div class="controls"><input id="q" type="search" placeholder="Search a protocol or slug" value="' + esc(state.q) + '">'
      + '<select id="cat"><option value="">All categories</option>' + cats.map(function (c) { return '<option' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>'
      + '<select id="chain"><option value="">All chains</option>' + chains.map(function (c) { return '<option' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>'
      + '<label><input id="watch" type="checkbox"' + (state.watch ? ' checked' : '') + '> Watchlist only</label></div>'
      + '<p class="count">Showing ' + shown.length + ' of ' + rows.length + ' protocols' + (rows.length < ROWS.length ? ' (filtered from ' + ROWS.length + ')' : '') + '</p>';
    if (detailRow) h += detailHtml(detailRow);
    h += '<table><thead><tr>'
      + '<th data-sort="rank">Rank</th><th>Protocol</th><th>Category</th><th>Chains</th>'
      + '<th class="num" data-sort="tvl">TVL</th><th class="num" data-sort="ch7">7d</th><th class="num" data-sort="age">Age</th><th class="num" data-sort="implied">Implied value</th>'
      + '</tr></thead><tbody>';
    h += shown.length ? shown.map(rowHtml).join('') : '<tr><td colspan="8" class="empty">Nothing matches this filter.</td></tr>';
    h += '</tbody></table>';
    if (rows.length > state.limit) h += '<p><button id="more">Show all ' + rows.length + ' rows</button></p>';
    h += '<h2 class="sec">Screened out — not a launch</h2>'
      + '<p class="note">' + R.screened_out + ' pre-token protocols take no rank: the watchlist\u2019s own rule screens out exchanges, bridges, wrapped and staked products, and versioned pools, because none of them is a token waiting to launch. The largest of them:</p>'
      + '<table><thead><tr><th>Protocol</th><th>Why it is screened out</th><th class="num">TVL</th></tr></thead><tbody>'
      + R.screened_top.map(function (s) {
        return '<tr><td><b>' + esc(s[0]) + '</b></td><td>' + esc(REASON_TEXT[s[1]] || '') + '</td><td class="num">' + money(s[2]) + '</td></tr>';
      }).join('') + '</tbody></table>';
    h += '<h2 class="sec">Already trading — the market\u2019s own values</h2>'
      + '<p class="note">These protocols already have a token. Their values are the market\u2019s, not this radar\u2019s model — shown so the board\u2019s pre-token ranks can be checked against them.</p>'
      + '<table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">MCap / TVL</th></tr></thead><tbody>'
      + LIVE.map(function (p) {
        return '<tr><td><b>' + esc(p.name) + '</b><br><span class="note">' + esc(p.slug) + '</span></td><td>' + esc(p.cat) + '</td>'
          + '<td class="num">' + money(p.tvl) + '</td><td class="num">' + money(p.mcap) + '</td><td class="num">' + (p.mcap / p.tvl).toFixed(2) + 'x</td></tr>';
      }).join('') + '</tbody></table>'
      + '<footer><b>Method.</b> ' + esc(R.model_note) + ' The category multiple is the median market-cap/TVL of the trading protocols in that category in this same snapshot (three or more needed, else the whole snapshot\u2019s median, clamped 0.03x–1.50x). Plausibility cuts exchanges, bridges, wrapped and staked products, and versioned pools to 5%, by the watchlist\u2019s own rule. Source: DefiLlama public API, snapshot as of ' + esc(R.as_of) + '. Records no token means the record carries no token, not that the protocol has none.</footer></div>';
    app.innerHTML = h;
    app.setAttribute('aria-busy', 'false');
    document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; state.limit = 120; writeHash(); render(); });
    document.getElementById('cat').addEventListener('change', function (e) { state.cat = e.target.value; state.limit = 120; writeHash(); render(); });
    document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; state.limit = 120; writeHash(); render(); });
    document.getElementById('watch').addEventListener('change', function (e) { state.watch = e.target.checked; state.limit = 120; writeHash(); render(); });
    const more = document.getElementById('more');
    if (more) more.addEventListener('click', function () { state.limit = 1e9; render(); });
    app.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        const k = th.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; }
        writeHash(); render();
      });
    });
    app.querySelectorAll('tr.row').forEach(function (tr) {
      tr.addEventListener('click', function () {
        state.detail = state.detail === tr.getAttribute('data-slug') ? null : tr.getAttribute('data-slug');
        writeHash(); render();
        if (state.detail) { const d = app.querySelector('.detail'); if (d) d.scrollIntoView(); }
      });
    });
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
}
