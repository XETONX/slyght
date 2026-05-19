# Bundle 32 trajectory

**Status:** Living doc. Opens every Bundle 32 session for orientation.
**Last updated:** 2026-05-19 (session-close — scenario-walker landed, ADR-32.7 drafted)

---

## The thesis: substrate completion

Bundle 32 is the **substrate-completion phase**. Not feature work, not UX polish, not bug-by-bug patching — the phase where slyght's structural truth becomes coherent enough that the next layer (AI + automation in Bundle 33+) can ride on it without hedging.

The substrate has four columns. Each is a "canonical-X" migration: one writer, one reader, one source of truth, zero drift across consumers.

| Column | Bundle | What it locks down | Status |
|---|---|---|---|
| **Write substrate** | 30 | Every `S.X` mutation routes through `BRAIN.<domain>.<verb>` with source-tagged audit log. `recordWithAllocation` envelope covers all 9 transaction write sites. | ✓ shipped |
| **Allocation substrate** (read) | 32.1 | `snap.derived` canonical allocation reader. Conservation law `remainder === allocatedTotal + stillToAllocate`. Cross-surface drift class closed. | ✓ shipped |
| **Lock-state substrate** | 32.7 | `BRAIN.plan.lock` / `unlock` / `isLocked` canonical writers + readers. Three lock stores collapse to one (or get hidden behind one). Prerequisite for INV-29. | ADR drafted, awaiting Pass 1 |
| **Render-truth substrate** | 32.3-32.6 (Layer 7) | Survival forecast trip-awareness · essentialsVsDiscretionary drilldown · hero cycle-spend visibility · `BRAIN.plan.resetCycle`. Display-tier truth aligns with logic-tier truth. | partial — 32.4/32.5/32.6 scoped, 32.3 needs ADR |

**Substrate complete** = all four columns ✓. After that, INV-27/29/30/31/33 sign off enforceable, the ~19 remaining OPEN-BUGS triage cleanly into "old behavior surfaced by substrate" vs "new work," and the architecture diagnostic from `e153d54` can be marked closed.

---

## Why this matters

slyght is being built as an **accountability OS substrate**. Finance is the first vertical (Mum-debt, KIA loan, savings goals, daily-living) because that's the area John needs surfaced; the substrate underneath is general — canonical writers, audit log, source tags, BRAIN bubbles, invariant-paired specs. Other verticals (City2Surf training plan, weed-tracking, sleep, work commitments) ride on the same substrate.

Once substrate is complete:

- **AI layer (Bundle 33+)** stops being a wrapper that has to guess at app state. The agent reads `BRAIN.<bubble>.getSnapshot` deterministically, writes through canonical writers (auto-audited), and can answer "what did John commit to this cycle" without scraping the DOM.
- **Automation** (auto-debit batch from Bundle 31 is the first instance) becomes a category, not a feature. New automations follow the same pattern: read snapshot, decide, write through canonical writer.
- **Multi-device sync** (Bundle 23 cloud-sync via GitHub Gist — locked decision) lands cleanly because state shape is invariant-protected and audit-log-replayable.

The substrate is also the precondition for honesty. Until lock state lives in one place, "is the plan locked" returns three different answers depending on which renderer is asking. The accountability OS thesis fails the moment the OS itself is inconsistent.

---

## Compounding logic

Substrate is multiplicative, not additive. Each canonical migration makes the next cheaper:

- Bundle 30's `recordWithAllocation` envelope made Bundle 31's autoDebit batch a 1-day job. Before the envelope, autoDebit would have needed to migrate 9 sites itself + handle audit logging + handle balance gating. After, it just enqueues txns and the envelope handles the rest.
- Bundle 32.1's `snap.derived` made INV-32 (Bundle 32.2 over-allocation refusal) a ~30-LOC check. Before, INV-32 would have re-implemented `surplus` calculation inline.
- Bundle 32.7 (lock canonical) makes INV-29 enforceable. INV-29 currently can't be defined (3 stores, 2 unlock paths). After 32.7, INV-29 is a one-line invariant assertion.
- Bundle 32.3-32.6 (render-truth) makes the next vision-audit round meaningful. Currently audit findings stratify into "display-tier" (~70%) and "logic-tier" (~30%); after render-truth, both tiers read from the same snap.derived, so audit findings cluster around actual UX gaps not value-drift.

Each invariant locked down makes the next enforceable. Each canonical migration shortens the next.

**Where this fails:** substrate work that isn't paired with consumer migration. Bundle 32.1 was a clean win because both consumers (renderAllocateTile + renderPaydayPlanRoot) migrated in the same commit. Bundle 32.7 will be a clean win only if all 5 call sites + 2 unlock paths migrate in Pass 1. Half-shipped substrate is worse than no substrate (consumers fork into "uses canonical" vs "uses legacy" and the drift class doesn't actually close).

---

## City2Surf deadline (soft)

City2Surf is **9 August 2026**. slyght should be a trusted app for both finance AND training by then — meaning training plan + daily commitment surface + accountability nudges work alongside money tracking, not as an afterthought.

Trajectory:

- **Late May (now)** — Bundle 32 phases shipping; scenario walker for coverage discipline; ADRs sealing architectural decisions
- **Early June** — substrate complete (32.7 + 32.3 + 32.6 land · all 4 columns ✓ · INV-27/29/30/31/33 signed off + enforceable)
- **Mid June** — Bundle 33 begins: AI tool surface migration to canonical writers (closes FR-03), cloud sync via Gist (Bundle 23 plan), training-plan vertical scoped
- **July** — AI layer cohesive: agent reads/writes through BRAIN, multi-device sync works, training-plan bubble shipped, daily nudges working
- **Early August** — confidence pass: full scenario sweep on all bubbles, phone-verify pass on real reconciled state, City2Surf-week readiness check
- **9 August** — race day. App is reliable enough that John isn't context-switched away from the run by an app bug.

The August deadline is **soft** — slipping it doesn't blow up the project — but it's the forcing function that prevents Bundle 32 from becoming a 6-month substrate-perfectionism trap. If a substrate phase doesn't compound into the AI layer by mid-June, it's the wrong substrate.

---

## What Bundle 32 is NOT

- Not feature work. Substrate first.
- Not UX polish (`H` phase queued but explicitly low priority).
- Not 6-month perfectionism. 2-3 sessions to close, mid-June latest.
- Not silent. Every column shipped with smoke spec + scenario coverage + audit log proving the migration landed cleanly. No "trust me" merges.

---

**Open this doc at the start of every Bundle 32 session.** When it's no longer accurate, that's the signal substrate is complete and the trajectory has moved on to Bundle 33.
