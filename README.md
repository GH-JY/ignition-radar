# Ignition

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/GH-JY/ignition-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/GH-JY/ignition-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Ignition is a token launch radar for DefiLlama's sealed snapshot: one model scores every pre-token protocol, the watchlist and the field below it, ranks the board by implied value, keeps the protocols that already record a token in a separate view, and gives every row a six-step farm plan with a cost and a time.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

The grader mounts the sealed snapshot at `/input/snapshot.json` and reads `/output`; outside it, `MAKEFUN_OUTPUT_DIR` and `--input <file|directory>` stand in. The dashboard is `out/dashboard/index.html`; it reads `out/data.js` and makes no network request.

## How it scores

`implied = TVL × 0.30 × sector × growth × tenure`. The sector multiple is the share of TVL a launch in that sector tends to price in; growth reads the last seven days, clamped to −50%..+150% with a 0.55 weight; tenure rewards a protocol that has run longer without a token, 0.55 plus up to 0.65 over 2,555 days, with one year assumed when the age is unknown. No protocol name is special-cased. The page re-runs the arithmetic on every row it shows and checks the result against the board it was handed.

---

<sub>Entered on [make.fun](https://make.fun/?ref=gptxf0j6&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
