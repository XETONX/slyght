# Reconnaissance — Fog-of-War Map (Tiered Pipeline)

**Date:** 2026-05-21
**Pipeline:** 13 Tier-1 agents (8 drones D1-D8 + 5 campaign agents S1-S5) → 5 Tier-2 auditors (A-E) → 1 Tier-3 collector → CC
**Output authority:** verified + cross-referenced + theme-aligned. Auditor disagreements resolved at Tier 3 with file:line evidence.
**Status:** Phase 1 (recon) complete. Pending CC + John triage on REC-1 / REC-2 new drones + 3 P0 escalations.

---

## Headline

Fog receded materially across **chat-action surface**, **boundary-day arithmetic**, **canonical-writer perimeter**, **deployed-vs-committed drift**. Net additions:
- **3 P0 money-truth escalations** (don't wait for campaign)
- **6 new themes** (H/I/J/K/L/M)
- **2 new-drone recommendations** spawned-or-skipped per pattern value
- **1 auditor disagreement** resolved empirically

**Fog state: ~78% mapped · ~15% partially-dark (render-side reads + offline replay) · ~7% confirmed-fine.**

---

## Theme Map (severity-ordered within each theme)

### Theme A — Idealized cashflow (existing)
- **HIGH** D3 #1 — trip uplift overlap stacks/replaces baseline (boundary sibling — Theme I overlap)
- **HIGH** D3 #4 — processAutoDebits cycle-month early skew

### Theme B — Calc duplication (existing)
- **HIGH** D1 F3 — `getActiveDebtsDueBeforePayday` L3544-3570 reinvents paydayDate (FR-06 sibling)
- **MED** D1 F4-F7 — parallel implementations / cache-bypass / TRACER recompute

### Theme C — Static-state (existing)
- Quiet this round. Bundle 32a verified VERIFIED-DEPLOYED.

### Theme F — Canonical-writer bypass (existing, expanded — 8 sites now)
- **HIGH** D1 F1 — WRX raw bal/carloan L25326 (4 raw writes one fn) — 8th Theme F site
- **HIGH** D1 F2 — tickItem car path L21421 raw write
- **HIGH** D2 #9 — `setBonus` L21758-21769 double-counts (canonical bypass + math bug)
- **HIGH** D2 #11 — Mum-loop silent break (paidBills written but `_depositLoopApplied` not)
- **MED-LOW** D1 F8 — read-side raw `S.bal`/wrxValue/mumAccountBalance/superBalance/carloan reads
- **MED-LOW** D1 F9 — `buildSystemPrompt` partial bypass

### Theme G — Secrets (CLOSED, awaiting deploy)
- **VERIFIED-NOT-DEPLOYED** Theme G fix in code; awaiting John's `wrangler deploy`

### **NEW** Theme H — Chat-action canonical bypass
*Chat surface (~20 actions) writes state through 3 inconsistent paths.*
- **CRITICAL** D4 #1 — `executeChatAction.update_balance` L15508-15511 → L7415-7431 set-vs-delta ambiguity (FR-03 root)
- **HIGH** D2 #1 = D4 #2 = S3-site-11 — `executeChatAction.mark_bill_paid` L15497-15506 (3-region cross-ref: ONE structural fix closes 4 findings)
- **HIGH** D2 #11 — chat path of Mum-loop break (XR-1 sibling)
- **HIGH** D2 #5 — China trip activation no pre-warning L22527-22544

### **NEW** Theme I — Boundary-day / temporal edge arithmetic
*No canonical "boundary owner" — every cycle/window edge is reimplemented.*
- **CRITICAL** D6 #4 — `cycleEndDate` UTC-shift ~38h early. **P0 ESCALATION.** Affects allocation lock, autodebit floor, hero countdown, rollover.
- **HIGH** D3 #1 / D3 #3 / D3 #4 — trip overlap · resetCycle trip-blind · cycle-month early skew
- **HIGH** D4 #3 = D6 #6 — cron AEDT/AEST DST gap (wrangler.toml comment documents mitigation, cron array doesn't implement)
- **HIGH** D6 #1 — mixed-pattern date strings (some sites use `'T00:00:00'`, others bare-parse)
- **HIGH** D6 #3 — payday boundary lost-state sibling

### **NEW** Theme J — Lost-state on rare event
*State sources without recovery/heal-on-read paths.*
- **CRITICAL** D5 F2 — offline write queue silent-swallow
- **HIGH** D5 F4 — device-token loss orphans namespace
- **MED-HIGH** D5 F9, D6 #3
- **MED** D2 #17 — autodebit floor payday collision

### **NEW** Theme K — Local-midnight written as UTC-ISO
*Anti-pattern: `.toISOString().slice(0,10)` on local-derived dates → off-by-one in Sydney TZ.*
- **CRITICAL** D6 #4 — cycleEndDate (Theme I anchor)
- **HIGH** D6 #1, #2, #9

### **NEW** Theme L — Deployed-vs-committed drift
- **VERIFIED** D7 #1 — Theme G fix in code, not yet deployed
- **VERIFIED** D7 #2 Phase A · D7 #3 Bug 1 · D7 #5 Bug-1.6 · D7 #6 Bundle 32a
- **DISPUTED / NEEDS-RECHECK** D7 #4 Bug-1.5 — D7's "fixture has $0 amounts" wrong; Teachers Health $259.41 paid in live state. Re-probe needed before campaign.

### **NEW** Theme M — Doc-vs-code drift
- **VERIFIED** CLAUDE.md §5 outdated by 2+ days
- **VERIFIED** CHANGELOG missing F7/F8 entries
- **VERIFIED** FEATURE-MAP backfill (correction: `processAutoDebits` IS present at L731)
- **VERIFIED** README 11,700 vs actual 28,433 lines
- **VERIFIED** CLAUDE.md §3 vs §5 BRAIN bubble count contradiction (8 vs 13)
- **NEEDS-RECHECK** INVARIANTS §Pending all-shipped

### Theme PWA (D5 standalone)
- **HIGH** D5 F1 (downgraded CRITICAL→HIGH) — sw.js cache never written. Edge case.
- **HIGH** D5 F3 — keepalive 64kB cap acknowledged in code but unaddressed

---

## Cross-Region Findings (patterns no single drone saw)

### XR-1 — Chat-action mark_bill_paid bypass cluster (4 findings → 1 fix)
D2 #1 + D2 #11 + D4 #2 + S3-site-11 all reference `executeChatAction.mark_bill_paid` L15497-15506. **One structural fix closes all four findings.** Highest-leverage fix in the round.

### XR-2 — FR-03 single canonical site (D4 #1 + S3)
`executeChatAction.update_balance` L15508-15511 → L7415-7431 set-vs-delta ambiguity is the single canonical site behind multiple FR-03 symptoms.

### XR-3 — Boundary-day cluster (8 findings → Theme I + ADR-calendar)
Common root: no canonical boundary owner. Recommend `slyght/cycle.js` module exporting `cycleStart(d)` · `cycleEnd(d)` · `paydayDate(d)` · `isInCycle(d, ref)` · `toLocalISODate(d)`.

### XR-4 — Lost-state cluster (5 findings → Theme J + heal-on-read invariant)
Synthesis pattern. Address with proposed **INV-30: every persistence boundary has a heal-on-read function**.

### XR-5 — `payBillNow` double-debit ISOLATED
`applyTxnDelta` (L20175) vs `applyDelta` (L20246) have distinct semantics. `payBillNow` L19644 outer raw subtract is second debit after `markBillPaid` already debited via internal `recordWithAllocation`. `markBillPaidMonth` L8423 does NOT have the bug. **One-line deletion.**

### XR-6 — `knownUpcoming.status='bought'` double-subtract
`projectedEndBalance` L20906/L20920 — bills/debts use unpaid filter; upcoming doesn't. Real money-truth bug.

---

## P0 Escalations (don't wait for campaign)

| # | Finding | Fix shape | Money impact |
|---|---|---|---|
| **P0-1** | `payBillNow` double-debit at index.html L19644 | One-line deletion of outer raw subtract | Per-bill, every bill paid via this path |
| **P0-2** | `knownUpcoming.status='bought'` double-subtract in projectedEndBalance L20906/L20920 | Add unpaid-style filter to upcoming branch | projectedEndBalance + 15+ snap consumers |
| **P0-3** | `cycleEndDate` UTC-shift ~38h early (D6 #4 location) | Add `toLocalISODate(d)` helper, replace `.toISOString().slice(0,10)` writes | Allocation lock, autodebit floor, hero countdown, rollover |

All three confirmed money-truth bugs by multiple auditors. Hotfix-shape (same model as Bug-1.5/1.6) — each standalone commit + smoke + Guardian + push.

---

## New-Drone Recommendations

### REC-1 — Chat-action canonical-writer audit drone (D9) — **SPAWN recommended**
**Rationale:** XR-1 + XR-2 prove the chat surface is structural blind spot. ~20 actions in `executeChatAction` need enumeration. Narrow scope, high leverage.
**Brief shape:** enumerate every `case 'X':` in `executeChatAction` L15400-L15700, classify (raw write / canonical / one-sided), identify untouched sidecar fields per action.

### REC-2 — `toISOString().slice(0,10)` grep-drone (D10) — **SPAWN (small, recommended)**
**Rationale:** Theme K is grep-able. Quick win — one ripgrep pass + classification.

### REC-3 — Boundary-day pattern drone — **DO NOT SPAWN**
**Rationale:** XR-3 already mapped the cluster across 8 findings.

### REC-4 — Lost-state heal-on-read drone — **DO NOT SPAWN**
**Rationale:** XR-4 is a synthesis pattern, not new fog. Propose INV-30 instead.

---

## Confidence Map

| Region | Status |
|---|---|
| MODEL legacy (chat AI, raw writes) | **mapped+cross-verified** (D1+D2+D4 triple-coverage) |
| Edge states (cycle, trip, payday) | **mapped+cross-verified** (D3+D6) |
| Integration seams (chat+canonical+cron) | **mapped+cross-verified** (D4+D2+D6 triple) |
| PWA/sync (sw.js, offline queue, device-token) | **mapped, needs-deeper on offline-queue replay path** |
| Date/cycle arithmetic | **mapped+cross-verified** (D6 deep, D3 corroborates) |
| Deployed vs committed | **mapped** (D7 light but verified); **Bug-1.5 still dark** |
| Doc drift | **mapped** (D8); INVARIANTS §Pending still dark |
| Campaign scoping (S1-S5) | **mapped+cross-verified**, S3 escalated P0 |
| **Chat-action surface (full enumeration)** | **STILL DARK** — REC-1 will close |
| **`toISOString().slice(0,10)` write-sites enumeration** | **PARTIALLY DARK** — REC-2 will close |
| Render-side bypass (read-side raw reads) | **partially dark** — D1 F8 hints, not enumerated |
| Boot self-test coverage of new themes | **dark** — Bundle 31 added canary, not re-run against H/I/J/K |

---

## Implications for A+B+F Campaign

1. **Theme F absorbs Theme H** (chat-action bypass = Theme F subspecies). Campaign absorbs `mark_bill_paid` + `update_balance` canonical routing. Wait for REC-1 before sizing.
2. **Theme A absorbs part of Theme I** (boundary-day cycle bugs in cashflow projection). P0-3 gates this — must fix first.
3. **P0-1/P0-2/P0-3 hotfix BEFORE campaign A+B+F** — money-truth bugs, one-line/small fixes. Don't bundle into larger refactor.
4. **Theme J + INV-30** = separate small bundle (Bundle 33-ish).
5. **Theme L + M** = hygiene bundle (~1hr).
6. **D5 F1/F3** defer to Bundle 23 (cloud sync).
7. **Bug-1.5 NEEDS-RECHECK** — focused re-probe before campaign.

---

## Auditor disagreement log (audit trail)

| Item | Conflict | Verdict | Evidence |
|---|---|---|---|
| D2 #8 reachability | A: live state doesn't have ghost. B: confirms `{1341, false, confirmed}` is live. | **B correct** | `tests/state-dump/live-2026-05-21.json` → `S.activePlan.income.bonus = {amount:1341, included:false, status:confirmed}` (cycleStartDate 2026-05-14) |
| S1 line numbers | S1: L21068. E: L20834 post-shift. | **E correct** (post-Theme-G) | S1 used pre-shift |
| D8 FEATURE-MAP backfill | D8: processAutoDebits missing. Auditor D: present at L731. | **Auditor D correct** | D8 over-claimed |
| D7 #4 Bug-1.5 | D7: "fixture has $0 amounts". Auditor D: Teachers Health $259.41 paid in live. | **Auditor D correct** | Live state has the payment |

---

## Durable-asset usage note (for future bundles)

Before scoping a bundle, check this map:
- Touching `executeChatAction.*`? → **Theme H**, well-mapped, wait for REC-1
- Touching cycle/payday/window dates? → **Theme I + K**, well-mapped, fix P0-3 first
- Touching canonical writers? → **Theme F**, well-mapped, 8 sites enumerated
- Touching offline/sync/device-token? → **Theme J**, mapped but needs-deeper on replay
- Touching render-side balance reads? → **DARK REGION** — D1 F8 hints, no enumeration drone yet (candidate for future REC-5)

---

## Method notes

**Pipeline performance:** 13 Tier-1 + 5 Tier-2 + 1 Tier-3 = 19 agents over the round. Severity-gated fidelity preserved HIGH/CRITICAL with file:line throughout. Tier-2 caught 4 auditor disagreements that Tier-3 resolved with live-state probes. Tier-3 produced 6 themes (H-M) and 6 cross-region findings (XR-1 to XR-6) that no Tier-1 drone could see in isolation.

**What worked:** parallel drones with clear region scopes; auditors with bounded scope; collector cross-referencing across regions and resolving conflicts empirically. P0 escalations surfaced through S3 + Auditor B + Auditor E independently.

**What to refine:** drones cited pre-shift line numbers (Theme G's recon-import block deletion shifted ~200 lines); future runs should verify line shifts at session start. Auditor A's reachability dispute (D2 #8) was wrong — could have been caught with a 1-grep probe inside the auditor.

---

**End of recon report.** Surfaced to CC for triage of REC-1/REC-2 spawn + P0 hotfix sequencing.
