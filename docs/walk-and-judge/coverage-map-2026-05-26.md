# Walk-and-Judge — Coverage Map (2026-05-26, FIRST BATCH complete)

> **Output 1** of the campaign. Honest markers: ✓ COVERED (walked + screenshotted + behaves) · ✗ BROKEN (walked + misbehaves, finding attached) · ⊘ NOT-COVERED / NOT-REACHED (authored or attempted, not visually confirmed).
>
> **The loop (proven + audited):** deterministic Playwright walker (`scripts/walker/run-walk.js`) seeds the positive-surplus FAKE fixture (`state-snapshot.fake.json`, persona "Sam", bal $4800, `pushOnSaveEnabled:false` → never reaches KV), drives 6 scripted flows, screenshots EVERY step, captures S-deltas + audit-log **lands** (ground truth of each write) + in-page **probes**. The JUDGE is Claude reading screenshots + lands — **no Anthropic API key**.
>
> **Three scale-layers PROVEN this batch:**
> - **A — Checkpointing:** per-flow `flow.json(+.gz)` + incremental `index.json`; a crash after flow N preserves flows 1..N. `walk.json` gzips 28KB→4.2KB. The 202-fleet is resumable.
> - **B — Auditor tier:** a second Claude pass verified all 6 verdicts → confirmed 5, **upgraded 1** (bills-undo candidate → root-caused bug), and **caught the AI over-claim** (raw-balance read is structural risk, divergence 0 on this fixture; the live bites are elsewhere). Output: `audit-2026-05-26.md`.
> - **C — UX-expert tier:** a designer pass over all 30 screenshots → `ux-recs-2026-05-26.md`. Caught the "toast lies" visual proof, a headline render-drift, no-feedback on commits, legibility debt, AND the honest AI coverage gap.
>
> **Walk-data (Output 2, for Opus's interactive HTML):** `tests/walker-out/2026-05-26T07-29-18/walk.json` (+ per-flow `flow.json.gz`, `index.json`, screenshots — gitignored, reproducible).

## FIRST-BATCH RESULTS — 6 flows walked

| Flow | Marker | Audit-lands ground truth | Auditor ruling |
|---|---|---|---|
| **darwin-A-quicklog** | **✗ BROKEN** | submit: bal 4800→4500, Darwin **stays 800**, `[txn_record,balance_apply_delta]` — **no `bucket_saved_change`** | CONFIRM. step-03 screenshot: no goal picker exists. |
| **darwin-B-plantick** | **✓ COVERED** | tick: bal 4800→4500, Darwin **800→1100**, `[…,bucket_saved_change,plan_tick]` | CONFIRM. "$1,100 of $4,000 ✓ allocated". |
| **log-transaction** | **✓ COVERED** | submit: bal −$5.00 ($4.50 + $0.50 round-up), 2 txns, China 1500→**1500.50**, `[…,bucket_saved_change]` | CONFIRM. Crediting works → Darwin bug is the **missing picker**, not broken crediting. |
| **bills-mark-paid** | mark ✓ / **undo ✗ BROKEN** | pay: bal 4800→4750, txn+1, `[…,bill_mark_paid×2,notif_add]`. undo: **lands:[], bal stays 4750, still paid** | **UPGRADED candidate→CONFIRMED.** Root cause below. |
| **plan-lock** | **✓ COVERED** (canonical path) | lock: 3 stores set; unlock (`BRAIN.plan.unlock`): all 3 cleared cleanly (probe-confirmed) | CONFIRM canonical only — legacy 2nd unlock path **⊘ not walked** (divergence stays candidate). |
| **ai-provenance** | finding **✗ CONFIRMED** (code+probe) / chat UI **⊘ NOT-REACHED** | probe: see #1 below | CONFIRM all 5 sub-claims; enforce the over-claim nuance. |

**Boot (cross-cutting):** 15 `pageErrors`, all the same boot TDZ `Cannot access 'BRAIN' before initialization` at `isPaid` index.html:4512 → MODEL stub fallback. **Boot-only** (post-boot probes returned real values). One boot self-test failure `[push-on-save default: enabled unless explicitly off]` = the fixture's `pushOnSaveEnabled:false` **correctly detected** — a safety canary working, not a bug.

## CONFIRMED FINDINGS (walked + audited — ready for the fix-priority list)

1. **#1 — AI prompt provenance is poisoned.** `buildSystemPrompt()` (:15332 — the *correct* builder: `getLiveBal` + `getGenuineSurplus` + licensed-advice disclaimer) is **dead code (0 callers, grep-confirmed)**. The **live** prompt (inline :15665, sent at :15766) reads **raw `S.bal`** (:15672) + `getDynamicDailyBudget` (:15676), carries **no disclaimer**, and hardcodes stale facts. Live probe evidence on Sam:
   - spend-power **`getGenuineSurplus`=0 vs `getDynamicDailyBudget`=60** → the AI's "can spend $60/day" line contradicts genuine surplus $0. *(This is the live bite.)*
   - **`rainy-day-fund` id miss**: goals present = `['rainy-day']`, lookup = `false` → AI sees a hardcoded **$9,000** Rainy Day, not the real $1,200/$3,000.
   - **Darwin date contradiction**: intent = Aug 1–10; prompt hardcodes **"June 7-15"** (:15704).
   - **Over-claim corrected (auditor):** raw-`S.bal` read shows `bal_divergence=0` on *this* fixture — a **structural risk**, not a demonstrated wrong balance here. The four bites above are the demonstrated harm.
2. **Quick-Log → Savings silently loses money (no destination picker).** `[BROKEN]` Cash leaves, no goal credited, no `bucket_saved_change`. **UX visual proof:** the success toast reads `"−$300.00 · Savings · — · Tap to undo"` — the **em-dash is where the goal name should be**. The user is told it worked. The fix already exists in-app (round-up "→ China Holiday" language + the Payday Savings allocation UI) — it's an *omission* to propagate, not missing capability.
3. **Bills undo silently no-ops → bill stuck paid, cash unrecovered.** `[BROKEN, root-caused by auditor]` `markPaid` **cycle-bumps** a bill due before payday: day-10 < payday-15 ⇒ writes key `2026-6-Phone Plan-10` (:~25192). But the user-facing `undoBillPaid()` (:8809) AND `unmarkBillFromCal` read `paidBillKey(name,day)` = **current** month `2026-5-Phone Plan-10`. Writer-key ≠ reader-key ⇒ undo finds nothing ⇒ $50 unrecoverable via undo. Affects every pre-payday bill. (Matches the spec-03/07 + OPEN-BUGS candidate — now confirmed.)

## NEW CANDIDATES (surfaced this batch — NOT yet promoted; need a focused walk)

- **Hero render-drift (UX):** a headline number rendered **$2,045 → $1,914 → $1,782 across consecutive frames** for a single entry. This does **not** match the clean `S.bal` ground truth (4800→4500), so it is either a **JS counter-roll animation caught mid-tween** (the walker's CSS freeze doesn't stop rAF-driven counters) or a render-vs-state divergence. **Walker improvement:** wait for the counter to settle before screenshotting. Do not promote until re-walked with the counter stable.
- **No visible feedback on state-changing actions (UX, HIGH):** lock/unlock (6 frames) and bill-undo (3 frames) are pixel-identical — no lock badge, no frozen fields, no undo confirmation. Core trust gap for a money app.
- **Legibility debt (UX, HIGH):** grey-on-grey calendar bill amounts; rainbow-monospace "debug-look" math lines on hero/pool breakdowns; a **malformed `$#0`** in the canvas "WHERE THE $5,000 SITS NOW" reconciliation line.
- **`bill_mark_paid` fires twice** per pay — confirm intentional (dual-store mirror) vs double-write.

## COVERAGE GAP TO CLOSE (honest ⊘)

- **AI chat visual surface NOT REACHED.** `apiKey:""` → the chat renders the *activation* screen, so both ai-provenance screenshots are the key-entry prompt, not the chat. The #1 **finding stands** (proven by code-read + in-page probe of the assembly functions, which don't need the chat UI — arguably the *stronger* evidence). **Next step:** re-walk with a Playwright **route-intercept on `api.anthropic.com`** to capture the *actual assembled `system` prompt string* (the literal text with "$60/day", "June 7-15", "$9,000", no disclaimer) — definitive, spends no tokens, needs no real key. Add this technique to the fleet.
- **Plan-lock legacy/UI 2nd unlock path** not walked (the 3-store divergence per ADR Bundle 32.7).

## FULL FRAME — ~27 surfaces · 202 actions
First-batch flips 6 flows above. Remaining surfaces ⊘, authored as 13 walk-specs in `specs/` (Level 1 main → Level 2 per button/tile → Level 3 cross-surface). Each → a `FLOWS[]` entry for the checkpointed fleet.

## SCALED PLAN (prove → scale)
1. ✓ Loop proven. 2. ✓ First batch walked (6 flows). 3. ✓ Layers A/B/C proven on the batch. 4. ✓ Output 1 (this map) + Output 2 (`walk.json`) emitted. **Next:** (a) AI route-intercept re-walk to capture the literal prompt; (b) walker counter-settle fix; then (c) convert the 9 surface specs → flow defs, fan out the checkpointed 202-action fleet (one walk per surface, auditor + UX pass each), flip all markers; (d) Opus renders `walk.json` → interactive HTML path map. Fixes route through the pipeline in John's priority order — **find everything first**.
