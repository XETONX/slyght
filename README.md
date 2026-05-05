# SLYGHT

Australian personal-finance tracker. Single-page web app deployed via
GitHub Pages.

- Live: https://xetonx.github.io/slyght
- Stack: vanilla JS, single-file `index.html` (~11,700 lines), no
  build step, no framework. Service worker for offline.

## Develop

```bash
# Open the app locally
npm run serve     # http://localhost:4567

# Capture state from the deployed app for fixtures
npm run capture
```

State lives in `localStorage["slyght_v5"] = { S, BILLS }` plus
side-channel keys (audit log, API costs, snapshots).

## Validation layers

Four gates protect against regression. Each layer catches a different
class of bug.

| Layer | What it catches | How to run | Where |
|---|---|---|---|
| **1 — Static** | Parallel implementations, magic literals, dead DOM writes | `npm run guardian-static` | `guardian-static.js`, `MISSION-GUARDIAN-LAYER-1.md` |
| **2 — Runtime invariants** | NaN balances, paid-bills-future, cycle-spend-bounded, payday-distance drift | runs on every renderAll in-browser | `index.html` `MathInvariants` ns, `MISSION-GUARDIAN-LAYER-2.md`, `MISSION-GUARDIAN-LAYER-2-TEMPORAL.md` |
| **3 — Audit** *(deferred)* | Semantic gaps in code review | Opus 4.7 pre-deploy | `MISSION-GUARDIAN-LAYER-3.md` |
| **V — Visual regression** | Layout shifts, copy regressions, computed-value display drift, broken JS on tab load | `npm run visual` | `visual/README.md`, `MISSION-VISUAL-REGRESSION.md` |

## Tests

```bash
npm test          # Layer 1 + Layer 2 + 35 unit tests
npm run visual    # Visual regression (requires `npx playwright install chromium` once)
```

All three gates (`npm run guardian-static`, `npm test`, `npm run visual`)
must pass before any mission commits. See `MISSION-GUARDIAN.md` →
"Mission verify gates" for the rule and how to handle intentional
visual diffs.

## Open bugs

Tracked in `OPEN-BUGS.md` with monotonically-increasing IDs. New bugs
get added at the bottom; entries never deleted. Each tracks anchor,
source, repro status, and which mission/bundle owns the fix.
