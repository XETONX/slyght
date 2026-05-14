# Sweep METADATA — 2026-05-14 — payday-plan-section-12-dark

## 1. Origin

**John's original instruction:**
> "I think looking at the app the captures are always in light mode when my phone is in dark mode so how you view the text etc is different always so can you rerun the captures in dark mode as thats more accurate to what im seeing?"

**File CC swept:** `C:\Users\admin\slyght\docs\reviews\sweep-2026-05-14-payday-plan-section-12-dark\input`
**Sweep run at:** 2026-05-14T09:56:39.123Z
**Commit at sweep time:** `6ce96cd` (`docs(sweep): Section 12 retro sweep — full Phase 1-4 + handoff-to-opus`)
**Branch:** main
**Theme:** **dark** (`--theme dark` via new `npm run layerV:sweep:dark` script). slyght's CSS uses `:root` as the dark baseline with `@media (prefers-color-scheme: light)` overriding to light. Playwright's `colorScheme: 'dark'` keeps the default branch.

## 2. Scenario

**One-line description:** Same three scenarios as the light-mode retro sweep — re-captured in dark mode to match John's phone-default theme.

**Companion sweep:** see `docs/reviews/sweep-2026-05-14-payday-plan-section-12-retro/` for the LIGHT-mode version + full Phase 1-4 analysis.

**Value(s) of interest:** identical to the retro sweep (bonus.amount · savings.total · maxAffordablePerDay · paydayReceived). Theme switch is the only delta.

**Pre-hypothesis:** findings F-01..F-14 from the retro sweep are theme-independent (state / math / structure / copy bugs) so they all stand. Dark mode may expose NEW contrast / hierarchy issues that didn't surface in light. Likely candidates: 🎯 / 🚫 slider marker chip backgrounds on dark slider track, toast pill prominence, "EXPECTED" amber pill against dark bg.

**Critical assertion frames:** identical to retro sweep. Use same frame numbers for parity comparison.

## 3. Frame catalogue

(identical to retro sweep — see `../sweep-2026-05-14-payday-plan-section-12-retro/METADATA.md` §3)

| Frame | Filename | State | Action |
|---|---|---|---|
| 01-21 | matching numbered scenario PNGs | same as retro | same as retro |

## 4. Fixture state

**state-snapshot.json provided?** Yes — see `input/state-snapshot.json`.
(identical to retro sweep — see `../sweep-2026-05-14-payday-plan-section-12-retro/METADATA.md` §4)

## 5. What CC CAN verify from this sweep

In addition to everything in the retro sweep:

- Dark-theme rendering fidelity to John's phone-default
- Contrast / hierarchy differences that only emerge in dark
- Whether colour tokens (--green / --amber / --red) read correctly against dark bg
- Whether status pills (EXPECTED / LANDED / IMPOSSIBLE) maintain visual distinction in dark
- Whether Save/Apply buttons retain primary-action prominence in dark

## 6. What CC CANNOT verify from this sweep

(identical to retro sweep — see `../sweep-2026-05-14-payday-plan-section-12-retro/METADATA.md` §6)

## 7. Findings summary

**Same findings as the retro sweep (F-01..F-14 + 1 OQ).** See `../sweep-2026-05-14-payday-plan-section-12-retro/phase4-proposals.md`.

### Dark-mode-specific delta observations

| Surface | Light-mode reading | Dark-mode reading | Delta |
|---|---|---|---|
| Save / Apply buttons | green on white, soft contrast | BRIGHT green on dark, very prominent | dark wins — primary action unmistakable |
| EXPECTED amber pill | amber on white, subtle | amber on dark, RICH amber tone | dark wins — pill stands out |
| LANDED green pill | green on white, soft | green on dark, vivid | dark wins |
| 🎯 / 🚫 slider markers | coloured chip on white | coloured chip on dark — chip text is COLOURED on dark `var(--bg)` which IS dark, so the chip's own bg is dark with coloured border. Marker readability roughly equal | parity |
| Negative projection ("-$5,205") | red on white, attention | red on dark, MORE severe-feeling | dark wins for warning purposes |
| Toast pill at bottom | light grey on white-ish (low contrast on light) | dark grey on dark — silhouette distinct | dark wins (still obscures content though — F-03 stands) |
| Locked banner gradient | amber on white, soft | amber gradient on dark, RICH and warm | dark wins |
| Math sub-line "$X surplus..." | dim grey on white, hard to read | dim grey on dark, still subtle | parity (still doesn't balance — F-02 stands) |
| "✓ Paid 14 May" header pill | green on white, subtle | green on dark, more prominent | dark wins |
| Slider track | grey track on white-ish | grey track on dark, thumb pops | dark wins |

**Conclusion:** dark mode is OBJECTIVELY a better visual hierarchy for slyght. None of the F-NN findings flip in dark — they all stand. Dark mode does NOT introduce new structural bugs. The accessibility / hierarchy improves overall.

### NEW dark-mode-specific observations (no new findings yet)

- D-1 — Toast pill at bottom is MORE visible in dark (dark-grey silhouette on dark bg). Still covers content. Same F-03 fix applies.
- D-2 — "Custom" chip dashed-border with italic text reads cleanly on dark.
- D-3 — Status dropdown chevron + native option panel matches dark theme natively. No tweaks needed.
- D-4 — Toggle thumb (Include bonus?) is bright green on dark track when ON — much more prominent than light mode.

**No new F-numbered findings** introduced by the dark capture pass.

## 8. Fixes shipped this session

_Identical to retro sweep — will be filled in as commits land per the unified Phase 5 approval._

## 9. Direct asks for Opus

**Primary:** confirm that dark mode is the correct baseline for future captures (John's phone-default). Compare dark vs light at frame 02 + frame 10 + frame 17 — are the contrast deltas accurate to my reading? Any contrast/a11y issues that emerge only in dark that I missed?

**Secondary:** does the toast pill obscure content MORE or LESS in dark? F-03 fix priority should reflect dark-mode user reality.

## 10. Open questions still parked

(identical to retro sweep — see `../sweep-2026-05-14-payday-plan-section-12-retro/METADATA.md` §10)

**Plus one dark-specific OQ:**
- **OQ7** — Should slyght-default future captures lock to dark mode? `npm run layerV:sweep:dark` is now available; `npm run layerV:sweep` defaults to dark too via `--theme dark`. Light-mode captures stay available via `--theme light`. Confirm this default switch is the right call.
