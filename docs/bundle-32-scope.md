# Bundle 32 — Scope

**Date:** 2026-05-19
**Status:** Draft, populated at Bundle 31 session close. Triage happens at Bundle 32 kickoff with fresh judgment (John on 4hrs sleep at Bundle 31 close — prioritisation decisions deferred per discipline).

---

## Carry-over from Bundle 31 Phase 1A (user gut audit)

These items were surfaced in `docs/audit/2026-05-19-bundle-31-user-gut-findings.md` but not fixed this session. Severity tags below reflect Phase 1A revisions, not original user labels.

| Item | Title | Severity | Fix complexity |
|---|---|---|---|
| 1 | Dashboard "$X this cycle" labelling — hero shows discretionary-only but labelled as total | P1 | medium |
| 2 | Analysis tab debt categories doubling — banner already detects + warns | P3 (working-as-intended; rephrase banner if desired) | small-medium |
| 9 | `getMinDailySpend` uses 30-day historical, not weekday/weekend budget | P1 | medium |
| 10 | MAX PER DAY + Running-over-pace visual adjacency | P2 | small (CSS) |
| 11 | No discoverable delete affordance for upcoming items in unlocked plan | P1 UX | small |
| 12 | Goals/Buckets card external edit/add/delete buttons (Trips already inline) | P1 UX | medium |
| 13 | WRX card always-open clutters Plan mode dashboard | P1 UX | small (collapsible) |
| 14 | Analysis Opportunity Cost selects rent as worst category | P2 dead-weight | medium-large |
| 15 | Analysis Month-on-Month doesn't actually compare months when `S.monthlyHistory` empty | P2 | small (remove tile) to large (real monthly aggregator) |
| 17 | Opal $1 placeholder vs actual variable Opal fare → persistent correction gap | P3 data-design | medium-large |
| OPEN-BUGS #6 part-B | Strict `_NON_SPEND_CATS` migration for Essential vs Discretionary classifier | P2 design call | medium |

Items 4, 5, 6 (allocation vocabulary cluster) and Items 7, 8, 16 (auto-debit cluster) were fixed in Bundle 31 — not on this list.

---

## Phase 1B Run 2 walkthrough findings (real-state baseline)

**Source:** `docs/audit/2026-05-19-bundle-31-full-walkthrough-audit-RUN-2.md`
**Diff:** `docs/audit/2026-05-19-bundle-31-audit-diff-run1-vs-run2.md`
**Counts:** 72 findings (P0: 0, P1: 35, P2: 37, P3: 0) across 15 UI surfaces
**Trace:** `docs/audit/2026-05-19T04-05-24-694Z-trace.jsonl` (15 calls; api_response_id null due to logging bug fixed in commit 601e4ca — NEXT audit run will have full traceability)

Bundle 32 kickoff: triage Run 2 findings into actionable backlog. Discipline per John: fresh judgment, don't bring Bundle 31 fatigue into prioritisation. Run 1 findings discarded as fixture-contaminated.

**Cross-check during triage:** Run 2 findings WITH a Run 1 echo (per the diff doc) are confirmed real (both audits saw the underlying issue). Run 2 findings WITHOUT a Run 1 echo may be issues newly exposed by refreshed state — worth specific attention.

---

## Methodology validation (Bundle 32 dogfood items)

1. **Verify trace logging includes `api_response_id` on next audit run.** Bundle 31 commit 601e4ca patched the missing field but didn't re-run. First Bundle 32 audit (if any) should confirm via trace inspection.
2. **Verify fixture refresh discipline.** Any reconciliation event during Bundle 32 should also refresh `state-snapshot.json` per the new CLAUDE.md §8 rule. Watch for drift.
3. **Production-on-boot behaviour inventory.** Bundle 31 discovered EOD modal (`checkEodRecon`) fires on real-state fixture and intercepts smoke spec taps. Other modals/flows may fire similarly (notifications, seed prompts, onboarding, snapshot recovery, autoMatchBillsToTxns). Audit task: enumerate every function called from `showMain()` and from `DOMContentLoaded` handlers; identify which produce UI side-effects; verify each smoke spec handles or explicitly bypasses them.

---

## Phase 5 housekeeping queue (carried + extended)

Items from prior session carry-overs PLUS Bundle 31 discoveries:

1. CC manual §3 step 6.5 — Deploy check obligation (pre-existing)
2. INV-28 + INV-31 inheritance amendments + exception-list-size discipline metric (pre-existing)
3. Smoke coverage % by domain + 63% baseline tracking (pre-existing — partially addressed by Bundle 31's new specs)
4. Verification report idempotency + cache-key redesign (pre-existing)
5. CC manual §3 step 6.6 — FEATURE-MAP update obligation (pre-existing)
6. CC manual §3 step 6.7 — visual capture obligation (pre-existing)
7. CC manual §3 step 6.8 — prerequisite state in phone-verify checklists (pre-existing)
8. CLAUDE.md §13 visual verification hard rule (pre-existing)
9. **NEW:** SHA-keyed `tests/visual-captures/<sha>-dirty/` debris cleanup. Each commit leaves a stale dir. Add prune logic to `verify-visual-state.js` or git-ignore.
10. **NEW:** ADR-E (weekly reconciliation workflow) — fold in fixture refresh contract from Bundle 31 §8 amendment.
11. **NEW:** Math Health "post-collapse lenient verdict" from Bundle 30.5 — sanity-check on next visual audit run.
12. **NEW:** Smoke fixture `state-snapshot.json` is checked into git as a 11MB file (full app state). Consider git-lfs or a snapshot-diff approach as the txn count grows.

---

## NOT scope for Bundle 32

- Phase 5 housekeeping items DO get triaged into Bundle 32 backlog but only the small ones land in a single bundle. Larger items (e.g. #11 monthly aggregator) get their own bundles.
- Bundle 31 fixes (cycle-bound essentials, still-to-allocate framing, autoDebit batch, Guardian rule fixes, smoke decoupling fixes, fixture refresh, trace logging) are SHIPPED. Bundle 32 does not revisit them unless a regression appears.

---

## Open invariants questions (FINANCIAL-INVARIANTS.md)

The five "pending decisions" at the bottom of FINANCIAL-INVARIANTS.md still need John's sign-off (negative-balance warning, bucket overdraw, plan-lock semantics, FX fee handling, round-up timing). Bundle 32 candidate to close those before they become tech debt.
