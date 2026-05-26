# Jarvis QA — Ticket Detail + App Map

**Date:** 2026-05-27
**Build under test:** `mission-control/jarvis.js` (3151 lines) · `jarvis.css`
**Harness:** Playwright chromium, viewport 2300×1320, server `http://127.0.0.1:5050` (running, not restarted)
**Mode:** NON-DESTRUCTIVE — modals opened + inspected; no write was confirmed (no setMeta commit, no dispatch confirm, no delete confirm, no comment submit, no auto-ticket confirm).
**Console / page errors across the whole run:** **0** (zero `console.error`, zero `pageerror`).

Routes walked: `#/ticket/SLY-1` (deep), `#/ticket/SLY-26` (skim), `#/map`, `#/map/savings`, `#/map/ai`.
Screenshots: `docs/jarvis/qa-shots/*.png`.

> **Headline answer (the one you asked to flag):** The **Dispatch to CC modal does NOT let you enable reasoning or pick a model.** It exposes only an Investigate/Fix mode toggle, a cost note ($1.50 / 40 turns), and a typed-`dispatch` confirm. There is **no model selector and no reasoning/thinking-effort input** anywhere in the modal. See Bug #1.

---

## Results table

| View | Control | Result | Notes |
|---|---|---|---|
| SLY-1 | Header / title / pills render | PASS | "Quick Log → Savings silently loses money", P0·Critical + Open + Bug pills |
| SLY-1 right-rail | **Type** select | PASS | Opens; options `Bug · Feature · Task`; wired to `setMeta(type)` |
| SLY-1 right-rail | **Severity** select | PASS | Opens; options `P0·Critical · P1·High · P2·Normal`; wired to `setMeta(severity)` |
| SLY-1 right-rail | **Due date** input | PASS | Native `<input type=date>` → opens OS date picker; wired to `setMeta(dueDate)` |
| SLY-1 right-rail | **Bundle** input + datalist | PASS (data caveat) | Text input, `list="fld-bundles"`, wired to `setMeta(bundle)`. Datalist has **0 options** because no ticket has a bundle set yet — control is correct, autocomplete is just empty until first bundle exists. |
| SLY-1 right-rail | **Related** links | PASS | Renders "OPEN-BUGS #11 · canonical bug record". Note: SLY-1's only link is to a non-SLY record so it's plain text (correct — only `SLY-*` targets become `#/ticket/` anchors). |
| SLY-1 main | **View on the App Map** link | PASS | `→ #/map/savings` |
| SLY-1 main | **Technical-depth** expander | PASS | `<details>` opens, body visible (mechanism / root cause / files / proposed fix) |
| SLY-1 main | Walk-evidence trace | PASS | 6-step trace renders inside the expander (lands/no-op + deltas) |
| SLY-1 discuss | Activity thread | PASS | Empty-state renders ("No discussion yet…"); thread container present |
| SLY-1 discuss | **Comment** button + composer | PASS | Button + `#cmt` textarea present (not submitted) |
| SLY-1 discuss | **Get Jarvis's take** | PASS | Opens modal with prebuilt `SLY-1` prompt, Copy prompt, paste-reply → Post-as-Jarvis |
| SLY-1 discuss | **Go deeper** | PASS | Opens modal with focused `SLY-1` prompt + Copy |
| SLY-1 discuss | **Aligned — hand to CC** | PASS | Opens the align gate modal (`#alignDec` decision textarea, Confirm/Cancel). Not confirmed. |
| SLY-1 discuss | Dispatch button at Open status | INFO | **Absent (count=0) — by design.** Dispatch + View-handoff only render once a ticket leaves Open/Discussing. All 34 tickets are currently Open, so Dispatch is unreachable via normal nav (see Bug #2). |
| SLY-1 dispatch | Dispatch modal opens | PASS | Opened directly via `dispatchToCC('SLY-1')` (non-destructive — the write is in `doDispatch`, never called) |
| SLY-1 dispatch | Investigate / Fix toggle | PASS | Radio-style; defaults to Investigate (safe); Fix-on-branch toggles `aria-checked=true` on click |
| SLY-1 dispatch | Cost note | PASS | "$1.50 / 40 turns · never runs git push" copy present |
| SLY-1 dispatch | Typed-`dispatch` confirm | PASS | `#dspGo` disabled until input == "dispatch"; enables correctly |
| SLY-1 dispatch | **Model picker** | **MISSING** | No `<select>` / model control in modal |
| SLY-1 dispatch | **Reasoning / thinking-effort option** | **MISSING** | No reasoning/thinking/effort input or toggle |
| SLY-1 danger | **Delete** typed-confirm | PASS | Opens; `#delGo` disabled; stays disabled on wrong text; enables only on exact `SLY-1`. Not confirmed. |
| SLY-26 | Detail + all right-rail controls | PASS | "Reset is unrecoverable…"; 2 selects, date, bundle, Related rail, Delete all present |
| Map | `drawAppTree` renders | PASS | 9 nodes, 12 edges, 12 edge labels; layered orchestrator→movers→hub→ledger + frame column |
| Map | Node click → surface | PASS | Clicking a node routes to `#/map/<id>` (verified → `#/map/plan`) |
| Map | Edge labels readable | PASS | "Allocates To / Moves Cash / Debits Cash / Reads / App Frame" chips at curve midpoints, colour-coded |
| Map | **Auto-Ticket Untracked Gaps (N)** | PASS | Badge shows **4**, matches independently-computed untracked-gap count (4). Button enabled. |
| Map | Auto-Ticket confirm modal | PASS | Opens "Create 4 tickets…" confirm. Not confirmed (concurrent agents). See Note A on count-staleness. |
| Map/savings | 3 face toggles render | PASS | Flow / Touchpoints / Screen all present |
| Map/savings | Flow face (ladder) | PASS | 6-rung should-vs-is ladder |
| Map/savings | Touchpoints face | PASS | Reads (`S.bal`) → Savings → writes (`bucket_saved_change`, `balance_apply_delta`) graph + "Tickets on this surface (1)" column + key handlers (file:line) |
| Map/savings | Screen face | PASS | 3 real captured screenshots + "After fix" annotation card |
| Map/savings | gap→ticket links | PASS | 2 ticket links on surface |
| Map/ai | 3 face toggles | PASS | All present |
| Map/ai | Flow face | PASS | 8-rung ladder |
| Map/ai | Touchpoints face | PASS | 17 data nodes (reads/writes) + tickets column |
| Map/ai | Screen face | PASS | 2 real screenshots + after-fix annotation |
| Map/ai | gap→ticket links | PASS | 2 links |

**Tally:** 38 PASS · 0 FAIL · 2 MISSING (model picker, reasoning) · 2 INFO (Dispatch/View-handoff correctly hidden at Open).

---

## Bugs to fix (ranked)

### 1. (Primary flag) Dispatch-to-CC modal has no model picker and no reasoning/thinking control — HIGH
Confirmed by DOM inspection: the modal (`dispatchToCC`, jarvis.js:780) contains only the Investigate/Fix radio pair, the cost paragraph, and the typed-confirm. `doDispatch` (jarvis.js:823) sends `action('dispatchCC', { id, confirm, mode })` — **`mode` is the only knob**. There is no way for John to:
- pick a model (Opus vs Sonnet vs Haiku) for the drone, or
- enable/scale reasoning/thinking effort.
Since dispatch spawns a real headless CC drone that costs tokens and is capped at $1.50/40 turns, model + reasoning are exactly the levers that govern cost and depth. Recommend adding a Model select (default whatever the headless launcher uses today) and a reasoning/effort toggle to the modal, plumbed through `dispatchCC`. **Flagging as you predicted: it is NO.**

### 2. Dispatch path is unreachable without a destructive align — MEDIUM (process/coverage gap, not a render bug)
The Dispatch button only renders for tickets NOT in Open/Discussing (jarvis.js:602-607). All 34 tickets are currently `Open`, so in normal use you must Align (a real write) before you can even *see* Dispatch. That's defensible (align is the intended gate), but it means the Dispatch button + its modal can never be reached in a fresh/non-destructive QA pass via the UI — I had to invoke `dispatchToCC()` directly to inspect it. Worth confirming this gating is intended; if so, no code change, just awareness.

### 3. Bundle datalist is empty until a bundle exists — LOW (data, not code)
`#fld-bundles` renders with 0 `<option>`s because `fldBundles()` derives from tickets that have a `bundle` set, and none do yet. The input still accepts free text, so it's functional — just no autocomplete suggestions yet. Self-resolves once the first bundle is assigned. No fix needed; noted so it isn't mistaken for a wiring bug.

---

## Polish wins

- **Microcopy is intentionally lowercase** ("comment added", "copied", "type 'dispatch' to confirm", "tick at least one ticket"). It's consistent across the whole app (terminal/CLI register), so it reads as a deliberate voice, not a typo. If you want a more "premium ServiceNow" register on John-facing toasts, sentence-case them ("Comment added", "Copied") — but it's a taste call, not a defect. Modal H2s and rail labels are already title/sentence case, so only toasts are lowercase.
- **Auto-Ticket count staleness (Note A):** the badge is computed at render time from `/api/flows` and is correct now (4 == 4). Because other agents are working concurrently and the server de-dupes via `auto-tickets.json`, after a real Auto-Ticket run the App Map won't auto-refresh the badge until you re-navigate to `#/map` — the count would read stale (still 4) on the open page even though those gaps are now ticketed. Consider re-pulling flows + re-rendering the map head inside `doAutoTicket()` (it currently only reloads tickets and routes to the Board). Minor.
- **Dispatch modal cost framing is excellent** — the $1.50/40-turn cap + "never runs git push" + safe-default Investigate mode is exactly the right risk framing; just missing the model/reasoning levers (#1).
- **Touchpoints face is genuinely premium** — reads→surface→writes graph with the gap node highlighted red, a per-surface tickets column, and key handlers as `file:line` codelines. Reads like a real wiring diagram.
- **Screen face shows REAL captures** (not placeholders) for savings + ai, with a clear "After fix" annotation card and honest "real after-fix screen lands when SLYx ships" meta. The placeholder branch only fires for surfaces with no wired walk flow (correct).
- **App Map edges + labels are readable** at 2300px — colour-coded by flavor (allocate violet / cash green / debit amber / read blue-dashed / frame grey-dashed), labels in title case, legend present. Node health badges (clean / N gaps / untraced) are clear.
- **Delete + Dispatch both use typed-confirm gates** (type the ticket id / type "dispatch"), button stays disabled until exact match — solid destructive-action hygiene.

---

## Method notes
- All "open + inspect" only; no confirm/submit button on any write path was clicked. Verified via `scrimVisible()` + modal-text assertions.
- The Dispatch modal was opened by calling `dispatchToCC('SLY-1')` in page context (opens the modal; the actual spawn lives in `doDispatch`, which was never invoked).
- Auto-Ticket badge correctness was cross-checked by recomputing untracked gaps from `/api/flows` in-page and comparing to the rendered badge (both 4).
- Script: `docs/jarvis/qa-shots/qa-run.mjs`; screenshots in the same folder.
