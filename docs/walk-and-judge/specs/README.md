# Walk-and-Judge — Walk-Specs Corpus

Durable input for the scale fleet. Each spec is a **deterministic, walk-ready flow def**
in three levels (per John's directive 2026-05-26):

- **Level 1 — Main UI:** nav to the surface, screenshot, assert it renders.
- **Level 2 — Per button/tile:** every action on the surface → its driver
  (`handler` + `index.html:line`) → expected `S`-delta + expected audit **lands** → screenshot.
- **Level 3 — Cross-surface:** *"if an action is meant to update somewhere else, walk there
  and verify it."* A write at surface X must be confirmed at the reader surface Y.

A walk-drone reads one spec → emits a `FLOWS[]` entry for `scripts/walker/run-walk.js` →
the walker drives + screenshots every step + captures audit lands → Claude reads the
screenshots and renders the verdict (✓ COVERED / ✗ BROKEN / ⊘ NOT-COVERED).

## Fixtures
- **`state-snapshot.fake.json`** — positive-surplus "on-track" persona (default). Use for
  clean COVERED/BROKEN markers (no INV-32 affordability refusals muddying results).
- **`state-snapshot.fake.overcommitted.json`** — over-committed/stressed persona
  (bal $1240, −$1,514 headroom). Use for affordability-gate + stressed-persona walks.
- Both have `pushOnSaveEnabled:false` → walks **cannot reach KV** (mechanical safety). Fake data, never John's ledger.

## Marker legend
✓ COVERED · ✗ BROKEN (finding attached) · ⊘ NOT-COVERED (authored, not yet walked).

## Corpus
**First-batch (proving the loop + the 3 scale-layers):**
1. `01-darwin-both-paths.md` — Quick Log→Savings vs Plan-tick (✗/✓ proven 2026-05-26)
2. `02-log-transaction.md` — the core Quick Log writer
3. `03-bills-mark-paid.md` — mark-paid + auto-debit + undo
4. `04-plan-lock.md` — Payday canvas lock/unlock loop

**Surface-level (the full app — Level 1→2→3 each):**
5. `05-savings-goals-trips.md`
6. `06-daily-living.md` — buffer / provisions / max-per-day
7. `07-bills-full.md`
8. `08-analysis-full.md`
9. `09-dashboard-full.md`
10. `10-debts-full.md`
11. `11-ai-info-sources.md` — **AI prompt provenance (highest-priority finding lives here)**
12. `12-settings-full.md`
13. `13-nav-chrome.md` — onboarding / PIN gate / nav

> Candidate findings in each spec are **code-read, pending LIVE walk** — do NOT promote to
> a confirmed bug until walked + screenshotted (Ledger-Walk discipline). The full coverage
> map of what has actually been walked is `../coverage-map-2026-05-26.md`.
