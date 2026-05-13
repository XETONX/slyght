# Triage decisions — 2026-05-06

> Scratch file capturing John's decisions as Phase 5 triage progresses.
> Untracked, not committed. Used as input for Phase 6 batched commits
> and Phase 7 OPEN-BUGS kill commit.

## ✗ Kill section — finalized (15 items)

| Item | Closure reasoning |
|---|---|
| Z.1 | NW modal trap → Mission #43 (`419ca04`) |
| Z.3 | MI-13 banner count is correctly narrow — future-dated subset |
| Z.5 | Math reconciliation alarmism → Mission #42 (`f1b8d29`) |
| Z.6 | PAID badge → Mission #42 renamed TRACKED |
| **AA.2.4** | **MI-13 dismiss button verified visible** in Nora's shot-001 at default viewport (top-right of banner). Personas didn't tap it — adversarial-mode bias, not discoverability bug. |
| AA.2.7 | NW scroll-below-fold → Mission #43 |
| AA.3.2 | Positive Undo feedback → Mission #42 (toast exists, alarmist banner suppressed) |
| AA.3.3 | NW close discoverability → Mission #43 |
| #18 | Resolved-no-bug, perception inversion already documented |
| #19 | Forecast netting → Mission C (`4b382f6`) |
| #24 | Settings Export button → Mission EXPORT (`bb30b86`) |
| #25 | Export paste mitigated by Download path |
| #29 | Feb-31 documented semantic shift |
| **#37** | **Layer I AI agent as test user — shipped Mission I `1c20186`; validated by 2026-05-06 sweep producing 5 confirmed findings (3 hard_fail + 2 soft_finding); 3 of those shipped fixes by end of same session (Missions #39, #42, #43). Operational.** |
| #38 | Export-box JSON preview → `f59612d` |
| #39 | MI-13 banner details → MI-13 mission `3602b8d` |

## Moved out of kill

- **AA.2.8** → ship-ready (decorative-looks-tappable is a real UX class, paralleling Connor's Cautious Mode finding)

## ~ Merge section (10 items)

*(Pending John's marks — surfacing now.)*

## ✓ Ship-ready section (9 items including new AA.2.8)

*(Pending — surface third.)*

## ? Decision section (~26 items)

*(Pending — surface last.)*

---

## Mission #45 family — daily-pain decomposition (NEW, surfaced 2026-05-06 mid-Phase-5)

John flagged daily-use issues that the persona sweep didn't surface.
Decomposed into 4 small-medium missions. Path A/B call below
determines whether these ship tonight or queue for next session.

### Mission #45 — MI-13 banner reframe/removal

**Step 1 surface 3 options (do not pre-pick — John's call):**

(a) **Remove MI-13 invariant entirely.** Banner never fires; lose
    runtime validation that catches genuine paid-early errors. Cleanest
    if MI-13 is producing more noise than signal in John's actual use.

(b) **Make MI-13 dismissible/silent.** Auto-dismiss after first fire
    per session per violating key, OR move surface from dashboard banner
    to bills view only. Keeps validation; reduces dashboard noise.

(c) **Convert MI-13 from dashboard banner to per-bill indicator.**
    Small "tracked early" badge on affected bills in calendar/bills
    view. Information stays where relevant; doesn't pollute dashboard.
    Reframes from "you did something wrong" → "for your reference."
    Best fit if John's workflow legitimately includes pre-marking
    paid (the pattern OPEN-BUGS #23 documents).

**Estimated scope:** small-medium depending on option chosen.
Lowest risk to ship first.

**Note from triage spot-check:** the dismiss × on the existing banner
*is* visible at default viewport (verified Nora's shot-001). So
"can't be dismissed" framing in John's daily pain may actually be
about post-dismiss behavior — the count-bump-while-no-related-modal-open
escalation cascade brings the alarmist card back on the next render.
Mission #42 fixed the count-bumps WHILE modal open + reset on
resolution; the broader "any unrelated render bumps count" cascade
is still open. Step 1 should disambiguate: is the issue (i) × not
visible / hard to tap, (ii) × works but cascade re-fires, (iii)
banner content unhelpful even when working as designed?

### Mission #45b — Calendar AU date format

Find date formatting code; replace US (MM/DD) with AU (DD/MM).
Audit other date-display surfaces. Small-medium scope.

### Mission #45c — Transactions search/filter wiring

Search bar currently does nothing — investigate why (handler
missing? wiring broken?). Wire it up. Consider quick filters
(date range, amount, category). Medium scope.

### Mission #45d — Filtered view from banner deep-link

Depends on #45 (a) or (c) decision. Where does "Show me these
bills" or per-bill view route to? Calendar filtered to paid-early
bills, or dedicated list view? Needs design decision. Small-medium.

### Path A vs Path B — both preserve state

**TRIAGE-2026-05-06.md:** full triage report (kill/merge/ship-ready/
decisions sections, all 60+ items with proposed code/options).
Untracked, ~13KB. Resumable as-is.

**triage-decisions.md (this file):** kill section finalized at
15 items; merge section pending John's confirmation marks; ship-ready
expanded to 9 items (added AA.2.8). Mission #45 family captured above.

If **Path A** (continue triage): merge confirms next, then ship-ready,
then decisions, then Phase 6 batched ship, then Phase 7 kill commit.
Mission #45a (banner) goes after Phase 7 as a small win. #45b/c/d
defer to next session.

If **Path B** (switch to John's items): commit triage state as-is
to a `session-state-2026-05-06.md` for next-session resume, ship
Mission #45 (a/b/c after option choice) + #45b + #45c tonight,
defer #45d / Phase 5 continuation / Phase 4-decisions to next session.
