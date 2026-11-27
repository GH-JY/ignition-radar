# Ignition

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/GH-JY/ignition-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/GH-JY/ignition-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Ignition is a token launch radar for DefiLlama's sealed snapshot: one fitted model scores every pre-token protocol, the watchlist and the field below it, ranks the board by implied value, keeps the protocols that already record a token in a separate view, and gives every row a pro-rata farm plan at a stated deposit and drop share: net dollars, dollars per hour, break-even drop share, and nine costed steps including the exit and stop rules. The dashboard's scenario controls re-run every row at any deposit from $1,000 to $100,000 and any drop share from 1% to 15%.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

The grader mounts the sealed snapshot at `/input/snapshot.json` and reads `/output`; outside it, `MAKEFUN_OUTPUT_DIR` and `--input <file|directory>` stand in. The dashboard is `out/dashboard/index.html`; it reads `out/data.js` and makes no network request.

## How it scores

`implied = launch value × eventual odds`, both fitted inside the program. The launch value is a ridge comps curve (three Huber passes) of log market cap on log TVL and sector dummies, with the sector effects estimated, not hand-set. The eventual odds come from a logistic fit of token presence on age and seven-day growth across every dated protocol, differenced to the oldest peer's age. Every term on both sides faces a survival test on two held-out schemes and is dropped only when both agree the model is worse with it; the surviving spec is refit, and its held-out record is printed on the page. No protocol name is special-cased. The page re-runs the arithmetic on every row it shows and checks the result against the board it was handed. It also carries the training rows and re-fits both models itself, in the browser, from `data.js`: the re-derived coefficients are compared with the published ones and the largest difference is printed (0 — bit-identical — in Chrome). No network request is made.

---

<sub>Entered on [make.fun](https://make.fun/?ref=gptxf0j6&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
