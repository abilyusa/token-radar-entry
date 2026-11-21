# token-radar-entry

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/abilyusa/token-radar-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/abilyusa/token-radar-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a frozen DefiLlama snapshot of 758 protocols, ranks every pre-token protocol by an implied value, and hands each one a concrete farm plan. The board covers all 40 watchlist slugs and 158 more pre-token protocols below the floor.

The model derives its price from the snapshot itself, never from a hard-coded multiple: for each category, the multiple is the median market-cap/TVL of that category's protocols that already trade (three or more needed, else the whole snapshot's median, clamped 0.03x–1.50x). Implied value = TVL x category multiple x growth (7-day TVL change, clamped) x age (log-scaled, how long it has run with no token) x breadth (extra chains) x plausibility. Plausibility screens out what is not a launch — exchanges, bridges, wrapped and staked products, versioned pools — by the watchlist's own rule; 144 protocols are screened out and named on the page, not hidden. The dashboard separates the board from the protocols that already trade, whose values are the market's, not the model's.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22, standard library only, no network. `main.ts` reads the snapshot, writes `board.json` and `data.js`, copies `dashboard/` and `screenshots/`, and writes `dossier.json`. Run it twice and the bytes are identical.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
