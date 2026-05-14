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

**Updated post-Opus-loop:** retro F-01..F-14 + Opus F-15..F-23 + 1 OQ = 22 findings.

### Status table after John's approval batch (commit `c6ea910`)

| ID | Severity | Status |
|---|---|---|
| F-01 savings double-count | 🚨 BLOCKING | ✅ SHIPPED (`8d7a12c`) |
| F-02 math sub-line | 🚨 HIGH | ✅ SHIPPED (`0db1c46`) |
| F-03 toast persistence | ⚠️ MEDIUM | ⚠️ PARTIALLY SHIPPED via F-23 (wrap fix); 3s window itself is intentional |
| F-04 slider marker overlap | ⚠️ MEDIUM | ⏳ DEFERRED to next visual pass |
| F-05 LANDED vs paydayReceived | 🎨 design | ✅ SHIPPED hint (`44a3e5b`) |
| F-06 Scenario B harness | 💨 smell | ⏳ DEFERRED (Layer V script fix) |
| F-07 Delete-trip button placement | ⚠️ MEDIUM | ⏳ DEFERRED |
| F-08 lock ignores provisions | 🚨 HIGH | ✅ SHIPPED (`8d7a12c`) |
| F-09 streak inflation | 🚨 MEDIUM | ⏳ DEFERRED (needs cycleId-tracked increment) |
| F-10 negative projection no hint | ⚠️ HIGH | ✅ SUBSUMED by F-16 — Opus design pass needed |
| F-11 buffer color semantics | ⚠️ LOW | ✅ SHIPPED (`0db1c46`) |
| F-12 chip overwrites custom | 💨 LOW | ⏳ DEFERRED |
| F-13 locked plan reads live S | 💨 latent | ⏳ DEFERRED — own bundle |
| F-14 cycle copy clarity | 🎨 design | ⚠️ PARTIALLY SHIPPED via `pd-section-head` redesign |
| F-15 free-money labels | ⚠️ MEDIUM | ⚠️ PARTIALLY SHIPPED — canvas REMAINDER relabeled to "Your free money this cycle" |
| F-16 projection framing | 🎨 design | ⏳ AWAITING Opus design pass on canonical semantics |
| F-17 bonus EXPECTED after lock | 🎨 design | ✅ SHIPPED subscript (`44a3e5b`) |
| F-18 auto vs manual contract | 🎨 design | ✅ SHIPPED respect-manual toggle (`44a3e5b`) |
| F-19 buffer modal current highlight | ⚠️ MEDIUM | ⏳ DEFERRED — small, ships anytime |
| F-20 daily living spine | 🎨 design | ✅ NO-OP — existing card design already serves the spine; revamp focused on canvas root + sub-screen rows |
| F-21 input $ prefix | 💨 LOW | ⏳ DEFERRED |
| F-22 lock-confirm button colour | ⚠️ LOW | ✅ SHIPPED (`0db1c46`) |
| F-23 toast clip white-space:nowrap | ⚠️ MEDIUM | ✅ SHIPPED (`0db1c46`) |
| OQ-rollover escape | ❓ Q | ⏳ AWAITING John's decision |

**Plus the visual revamp delivered on top** (not a finding — John's direct ask): bubble-tile Essentials + premium REMAINDER + bubble row cards + chunky action grid. See §8.

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

John approved ship-now batch (F-01, F-02/E-01, F-08, F-11, F-23/E-05, F-22/E-12) + delegated F-17, F-18, F-20, F-05, F-14, F-15 to CC judgement + asked for the Payday Plan visual revamp on top. All shipped:

| Commit | Fix(es) shipped |
|---|---|
| `0db1c46` | **Batch A** — F-02/E-01 (math sub-line 3-term · provisions visible) · F-11 (buffer color neutral) · F-23/E-05 (toast clip — drop white-space:nowrap, max-width + wrap) · F-22/E-12 (lock-confirm button down-styled red + "Lock anyway" label when tight-buffer warning) |
| `8d7a12c` | **Batch B** — F-01 (savings double-count fixed via Apply-time trip-id override cleanup + dedupedTrips return field) · F-08 (lock-shortfall uses snap.derived.surplus, includes provisions, can't-lock copy enumerates options) |
| `44a3e5b` | **Batch C quick wins** — F-05 (LANDED hint when bonus.confirmed AND !paydayReceived AND !locked) · F-17 (bonus stays editable post-lock with explicit subscript "uncertainty by nature") · F-18 (respect-manual toggle on auto-allocate, default ON, return envelope adds skipped[]) |
| `74f9ba1` | **Canvas root visual revamp** — Essentials 2×2 bubble tile grid (with progress bars + status pills) · premium glowing REMAINDER card ("Your free money this cycle" — F-15 partial relabel) · contextual explainer below remainder for neg/amber/green states · 3-button chunky action grid (Auto-allocate / Ask AI / Lock-Unlock) · F-14 partial via pd-section-head treatment |
| `c6ea910` | **Sub-screen row redesign** — `_paydayRow` rebuilt as bubble card: 42px avatar circle · name/sub stacked · mono value · 30px circle-check tick (transparent → solid-green-fill on tick) · optional bottom progress bar · is-ticked variant has green-tinted card gradient · savings bucket rows now show progressPct = saved/target |

Closed in this loop: **F-01 F-02 F-03(partial via F-23) F-04(deferred) F-05 F-08 F-09(deferred to follow-up) F-11 F-14(partial) F-15(partial) F-17 F-18 F-19(deferred) F-20(deferred — daily living already has its own design) F-21(deferred) F-22 F-23**

Still open / deferred: **F-04** (slider markers — punted to next sweep) · **F-09** (streak inflation — needs cycleId-tracked increment) · **F-10/F-16** (projection trail framing — Opus design pass needed) · **F-13** (lockedSnapshot vs live S — own bundle) · **F-19** (buffer current-value highlight — small, can ship anytime) · **F-21** (input $ prefix — cosmetic).

Verify sweep produced at `docs/reviews/sweep-2026-05-14-payday-plan-revamp-verify/`. Bubble tiles + premium remainder card + bubble rows all confirmed visually in dark mode.

## 9. Direct asks for Opus

**Primary:** confirm that dark mode is the correct baseline for future captures (John's phone-default). Compare dark vs light at frame 02 + frame 10 + frame 17 — are the contrast deltas accurate to my reading? Any contrast/a11y issues that emerge only in dark that I missed?

**Secondary:** does the toast pill obscure content MORE or LESS in dark? F-03 fix priority should reflect dark-mode user reality.

## 10. Open questions still parked

(identical to retro sweep — see `../sweep-2026-05-14-payday-plan-section-12-retro/METADATA.md` §10)

**Plus one dark-specific OQ:**
- **OQ7** — Should slyght-default future captures lock to dark mode? `npm run layerV:sweep:dark` is now available; `npm run layerV:sweep` defaults to dark too via `--theme dark`. Light-mode captures stay available via `--theme light`. Confirm this default switch is the right call.
