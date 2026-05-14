# Handoff to Opus — sweep-2026-05-14-payday-plan-section-12-dark

## TL;DR

This is the **dark-mode** companion to `sweep-2026-05-14-payday-plan-section-12-retro`. Same 21 scenarios, captured with `colorScheme: 'dark'` to match John's phone-default theme.

**Findings F-01..F-14 + OQ from the retro sweep all stand in dark.** Dark mode does NOT change the structural / state / math bugs. It DOES make several UX surfaces feel more prominent (Save/Apply buttons, EXPECTED/LANDED pills, locked banner, projection red).

## What to read first

1. **`../sweep-2026-05-14-payday-plan-section-12-retro/`** — the FULL Phase 1-4 analysis lives there. Read METADATA + phase1-4 + handoff-to-opus there first.
2. **This folder's `METADATA.md`** — adds dark-mode delta observations (§7 dark-mode-specific table).
3. **`input/01-..21-.png`** — 21 dark-mode-rendered PNGs of the same scenarios.

## Why a second folder

John 2026-05-14: "my phone is in dark mode but captures are always in light mode". Light captures don't accurately model his viewing experience. Same scenarios re-shot with `--theme dark`.

## Code change shipped to support this

- `scripts/layerV-capture.js` now accepts `--theme dark|light`
- Context-level `colorScheme: themeColorScheme` + per-page `page.emulateMedia({ colorScheme })` (belt-and-braces)
- New npm scripts: `layerV:dark` · `layerV:light` · `layerV:sweep:dark`
- Default theme: **dark** (matches John's phone). Use `--theme light` to override.

## What I want Opus to verify

1. **Confirm dark = phone-default.** Look at frame 02 (bonus modal) + frame 10 (auto-allocate) + frame 17 (daily living tight). Match John's phone reality?

2. **Per-finding theme-applicability sanity check.** For each of F-01..F-14:
   - Does the finding still hold in dark?
   - Does dark expose a new aspect of the bug?
   - Any finding that becomes MORE or LESS severe in dark?

3. **New dark-mode-only findings (if any).** I flagged 4 dark observations (D-1..D-4) but no new F-numbered findings. Opus pixel-precise check: anything I missed?

4. **Toast obstruction severity in dark.** F-03 was flagged in light. Is the obstruction WORSE in dark (because the toast pill silhouette is more visible) or BETTER (because the surrounding content has lower contrast anyway)?

5. **Marker chip readability.** Slider 🎯 / 🚫 markers — does the chip background (var(--bg) = dark) + coloured border still read clearly against the dark slider track behind?

## What I want John to decide

After Opus weighs in:

- Approve the existing 14 findings (light + dark both confirm they stand)
- Decide if dark should remain the default for future captures
- Decide if Phase 5 STOP unblocks for the ship-now batch (F-01 + F-02 + F-08 + F-11)

## What happens next

1. Opus reviews this folder + the retro folder side-by-side.
2. Opus produces `opus-vision-review.md` covering both sweeps.
3. CC writes `cc-handoff-after-opus.md`.
4. John approves Phase 4 line-by-line.
5. CC ships approved batch. Bundle 29 closes.

## File index

- `METADATA.md` — anchor doc (dark-mode delta observations in §7)
- `phase1-inventory.md` — _placeholder; light sweep's Phase 1 applies; only dark-specific observations live in this folder's METADATA §7_
- `phase2-why-chains.md` — _placeholder; light sweep's Phase 2 applies_
- `phase3-reeval.md` — _placeholder; light sweep's Phase 3 applies_
- `phase4-proposals.md` — _placeholder; light sweep's Phase 4 applies_
- `handoff-to-opus.md` — this doc
- `input/01-..21-.png` — 21 dark-mode-rendered PNGs
- `input/state-snapshot.json` — fixture (identical to retro)
