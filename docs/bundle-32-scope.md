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

## Phone-verify findings (post-Bundle-31 close)

- **OPEN-BUGS #43** "Transaction delete — rapid-tap deletes wrong txn + double-bumps balance" — phone-verified 2026-05-19 PASS. Bundle 28 round 12 fix still holds under refreshed reconciled state. NOT a P0-jump for Bundle 32 (my earlier session-close framing of it as a P0-jump candidate was based on partial reading — the bug was already marked fixed, this verify just confirmed it stays fixed).
- **NEW OPEN-BUGS #44** "Multi-delete workflow friction — must re-engage delete affordance per txn" — surfaced during #43's phone-verify. Behavior is SAFE (#43's defence holds) but creates friction during multi-txn cleanup. P2 UX. Three fix options sketched in OPEN-BUGS entry. Bundle 32 candidate.

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

**INV-29 now landed** (Bundle 32.2, commit 604c3ad) — plan-time over-allocation refusal. Documented in FINANCIAL-INVARIANTS.md §C between INV-11 and §D. Not in the original 5-pending-decisions list.

---

## Phase status (updated 2026-05-19 post-session)

| Phase | Status | Commit / link |
|---|---|---|
| 32.0 — Triage + dedupe (doc-only) | ✓ doc landed | `docs/audit/2026-05-19-bundle-32-triage-by-model-field.md` |
| **32.0a — Audit script Welcome modal pre-dismiss** | ✓ **SHIPPED** | `0ab35e6` — Run 3 produced clean baseline (0 modal artifacts vs Run 2's 27) |
| **32.1 — `snap.derived` canonical allocation reader** | ✓ **SHIPPED** | `6f28efc` — 5 new derived fields + `snap.provisions` + 2 renderer migrations + smoke spec |
| **32.2 — INV-29 write-time over-allocation refusal** | ✓ **SHIPPED** | `604c3ad` — INV check in `BRAIN.plan.setOverride` + FINANCIAL-INVARIANTS.md entry + smoke spec |
| Run 4 (post-architectural-fix baseline) | ✓ committed | `fa4d1a4` — 74 findings (+2 vs Run 3, within LLM variance; prediction-vs-reality lesson documented) |
| 32.3 — Trip-aware survival forecast | **pending** — ADR-worthy; defer until ADR drafted | Largest scope; affects multiple Dashboard/Analysis displays |
| 32.4 — `MODEL.essentialsVsDiscretionary` + drilldown | **pending** | ~40-60 LOC; tap-to-expand drilldown on Analysis tile |
| 32.5 — Hero cycle-spend always-visible | **pending** | ~10-20 LOC; layout decision |
| 32.6 — `BRAIN.plan.resetCycle` + UI button | **pending** | ~30-50 LOC; new canonical writer + Settings affordance |
| G — Filter-scatter cleanup (OPEN-BUGS #6B + #7 + #8 + #17) | **pending** | Mirrors 32.1 pattern; ~50-80 LOC; collapses 4 OPEN-BUGS |
| H — Pure UX polish residual (~15 findings) | **pending** | Per-surface bundles; not architectural |

### Lesson from Run 4 (committed in `fa4d1a4`):

Audit-finding-count is a poor proxy for architectural progress. 32.1+32.2 are logic-layer fixes; they prevent FUTURE drift but don't change current display. Display-layer findings remain until 32.3+ phases address them. Measure architectural work via smoke specs + INV audit entries + conservation invariants — NOT via raw audit-finding deltas.
