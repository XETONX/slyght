# slyght — Walk-and-Judge LIVE Campaign: Full-Depth App Coverage + Interactive Path Map

This is the payoff the last three sessions cleared the runway for. Both keystones are in — push makes data persist (#50), cache makes code deliver (#51) — so live screenshot-walks can finally trust persisted state and fresh code on the device. This brief defines the FULL campaign: drive every screen, every action, every transition in the app; screenshot EVERY action; let CC do the logical thinking; produce (1) a coverage map with explicit covered/not-covered markers and (2) an interactive HTML that shows the path of each action. Maximal agents, no limits, gzip heavy artifacts. Read it whole — it's the big one.

John's directive, verbatim in intent: **DEPTH. PROPER LOGICAL THINKING. MANY SCREENSHOTS ON EVERY ACTION. A MIND MAP OF HOW EVERY SCREEN LINKS TOGETHER. An HTML output showing the path of each action — log a transaction, plan mode, bills + marking paid, savings, etc. CC does the logical thinking; just ensure there are MARKERS for what's covered and what's not. FULL THOROUGH, MANY AGENTS, NO LIMITS, gzip where needed.**

---

## The capability (proven, now going live)

CC reads a code path → AUTHORS its complete story by reasoning (every branch/state/edge, not a handed list) → WALKS it in the running app via Playwright, screenshotting EVERY action → JUDGES it as a financial adviser (right for John in his state) → records what's COVERED and what's NOT. Proven on Darwin last session (the no-picker finding, confirmed live against real state). Now it runs across the WHOLE app, live, because the device runs fresh code and state persists.

This is **behavior-truth** at full scale — distinct from the code-truth slyght already verifies. Code-truth: does the calc reconcile. Behavior-truth: when a human actually does this, screen by screen, does the app do the sensible thing across every surface it touches. The Darwin finding is the proof this matters: the math was fine, but Quick Log → Savings → Darwin silently credited nothing. Only walking-and-seeing catches that.

---

## Scope — FULL APP, every screen, every action, every transition

Not a sample. Every interactive surface, walked. The feature-graph generator already found ~27 surfaces (7 screens, 26 modals, 55 render fns, 244 handlers). CC AUTHORS the complete story for each and walks it. The action inventory (CC expands this by reading the code — these are the spine, not the limit):

**Transactions:** log expense, log income, log with round-up, edit txn, delete txn, the categories, the flagging. Where does each land — Recent Spending? Analysis tab? Does the round-up fire and credit the right bucket? Does delete reverse cleanly across every surface?

**Plan mode:** open plan, the payday canvas, set overrides, lock plan, unlock plan, tick/untick (bill/debt/savings/upcoming/kia-extra), the allocation modals, bonus include/exclude, daily-floor + buffer edits. Every tick path — does it credit/debit correctly, does it route through canonical BRAIN writers, does untick reverse?

**Bills:** view bills, mark paid (the canonical path), already-paid, pay-now, the auto-debit flow, bill add/edit. Does marking paid debit correctly, land a txn, update the bills surface AND the hero? The Darwin-class question for every bill.

**Savings & buckets:** allocate to bucket, allocate to trip (Darwin — the known-broken Quick Log path AND the working Plan-tick path, walked side by side to SHOW the divergence), reallocate, withdraw mid-cycle, over-allocate (does it warn plainly or show a raw token?). The whole savings surface is finding #1 territory — walk it exhaustively.

**Debts:** view, add, mark paid, the clearing flow, the $0-archive pattern.

**Dashboard/hero:** the harsh hero, receipt math, TO RECOVER levers, 7-day burn, net-worth line, the conditional-hide-on-coral. Does each show the same honest number, on the same BRAIN readers?

**Analysis:** the trend, category breakdown, cut sliders, NW-trend — the filter-scatter (#6/#7/#13) walked to SHOW where strict/lax/bare filters disagree.

**Chat:** the actions (mark_bill_paid bypass, update_balance/FR-03), the canonical-writer coverage (7/9).

**Navigation & open-states:** every transition between screens, what each screen shows ON OPEN (the thing John watches for — "the way a screen is meant to be displayed upon opening"), splash/PIN, the footer strip, calendar day-detail.

**Personas (walk key flows as each — real spending patterns, time-aware):** on-track John (calm/affirming), overspending John (must flag, harshly-with-a-way-out, TIME-aware — the Darwin $200-in-24hrs case against trip dates), underspending John (does the reward FIRE?), stressed/angry John (tone stays honest-not-shaming). Behavior-truth includes: did the app respond appropriately to the persona's STATE and the TIME context, not just "did it execute."

---

## Three things every walked action must produce

1. **Screenshots — EVERY action.** Before/after each tap, each transition, each state change. Rapid sequence, near-video. This is non-negotiable per John: MANY SCREENSHOTS ON EVERY ACTION. The screenshots are the evidence the path works (or doesn't).
2. **The adviser judgment** — is the app's RESPONSE right for John? (afford → say plainly; can-afford-no-surplus → suggest better use; saving = good; overspend-vs-plan → flag, time-aware; why is this toast firing on false?; what's behind this click and is it correct?)
3. **A coverage verdict** — COVERED ✓ (walked, screenshotted, behaves correctly) / BROKEN ✗ (walked, misbehaves — with the finding) / NOT-COVERED ⊘ (couldn't reach / not yet walked). Explicit markers, per John: "ensure there are markers that this is covered and this is not."

---

## The two outputs

### Output 1 — the coverage map (markers, honest)
Every action/path tagged COVERED ✓ / BROKEN ✗ / NOT-COVERED ⊘. So John can SEE, at a glance, what's been walked and what hasn't — nothing hand-waved. This is the QA-vs-prod coverage view: the proof that "every single bit of the app is touched" is provable, not hopeful. A NOT-COVERED ⊘ is an honest admission, not a gap to paper over.

### Output 2 — the interactive HTML path map (Opus builds this from CC's walk data)
A mind map of how every screen links together, where John can trace the PATH of each action. CC produces the structured walk data (screens, links, actions, per-action: what fires → where it lands → what it touches → screenshots → coverage verdict); Opus renders it into an interactive HTML — click a screen to see its links, click an action (log a transaction / plan mode / bills+mark-paid / savings) to trace its full path with the screenshots as evidence and the covered/broken/not-covered markers visible. The mind-map John asked for, made real and DERIVED FROM THE ACTUAL WALK (not hand-drawn — same principle as everything: derived from ground truth, can't drift). gzip the screenshot payloads / trace data where heavy.

---

## STANDING RULE — maximal parallelism, NO LIMITS (John's explicit directive)

**CC USES AS MANY AGENTS AS NECESSARY. NO LIMITS. Tier 2, budget approved.** A full-app walk parallelizes massively: one walk-drone per surface/flow, running concurrently. ~27 surfaces = spin ~27 walk-drones, not one walking 27 sequentially. Feature-link drones, path-explorer drones, scenario-walk drones, test-writer drones — all in parallel. gzip/zip the heavy artifacts (screenshot bundles, JSONL traces, the walk data feeding the HTML) where needed — John called this out specifically. The bottleneck is wall-clock time to John, not agent count or storage. Parallelize the WORK aggressively. (Gates unchanged: auditor centralizes verification, Council gates any code pushes, John approves money-logic. Parallelize work, not approval.)

---

## The vehicle (decided last session — reuse, don't rebuild)

BOTH: QA environment is the BODY (~80% built — Mission I: persona-runner drives Playwright on S23 viewport + vision; tools.js acts + read_state; super-brain judgment; cost-tracker + JSONL traces), the adviser-reasoning is the MIND (the build). As a DEV/QA tool, not in-app. The remaining build:
1. **Story-Deriver** — CC reads a path, authors the story. Proven (Darwin). Formalize: feed it FEATURE-MAP + ui-code-map.json + the index.html slice → story-spec per flow.
2. **The Walker** — extend Mission I's persona-runner with path→action-sequence translation so it walks a SPECIFIC derived story (not just free-explore). Screenshot every action. Refresh the frozen clock. Address fullPage truncation (#33) for whole-surface vision.
3. **Adviser-Judge** — NEW prompt on the super-brain harness. Judge-by-role (John's call): **Sonnet for the high-volume walking** (drive/screenshot/act-and-see — many calls), **Opus for the one-shot adviser verdict per scenario** (deep judgment, low volume, small cost). Rubric: afford/surplus/saving=good/overspend-time-aware.
4. **Safe room** — ALREADY BUILT (walk-and-judge-foundation branch: state-snapshot.fake.json persona "Alex", pushOnSaveEnabled:false mechanical guarantee, seed flag, leak-guard). Walks run on FAKE data, NEVER John's real ledger. Confirm wired.
5. **Coverage map + HTML emitter** — NEW: the walk emits the coverage verdicts + the structured path data; Opus renders the interactive HTML.

---

## Pipeline + sequencing

- Runs through the 6-tier pipeline. Feature-graph + story-derivation = Gather (massively parallel). Conformance checks each surface against BRAIN. Build = the walker + judge + emitter. Council gates any CODE FIXES the walk surfaces (the walk FINDS bugs like Darwin; fixing them routes through the normal pipeline with John's approval — the walk itself is read-only QA on fake data, so the walking is safe to run freely).
- **It's a CAMPAIGN, not one session.** Build the walker + judge + emitter, prove it on a FIRST BATCH (Darwin savings + log-a-transaction + bills-mark-paid + plan-lock — the highest-value flows), generate the first coverage map + HTML so John SEES it working, THEN expand to full-app coverage. Do NOT try to walk all 27 surfaces before showing John the first real output — prove the loop end-to-end on a few, then scale with the parallel fleet.
- The walk is read-only on fake data (safe room) → the WALKING needs no push approval. Only CODE FIXES the walk surfaces need the Council/Human-Verdict gate.

## This session

1. Onboarding chain + Step 0 (fresh walk now trustworthy — both keystones in).
2. SCOPE this campaign through the pipeline: confirm the build pieces (story-deriver, walker extension, adviser-judge, coverage emitter, HTML data format), spin the parallel fleet to map the full feature graph properly (the atlas, generated), and PROVE the live loop end-to-end on the first batch (Darwin + log-txn + bills-mark-paid + plan-lock) — real screenshots, real adviser verdicts, real coverage markers.
3. Emit the FIRST coverage map + the structured walk data for Opus to render into the interactive HTML path map.
4. Surface the first output + the scaled-campaign plan for John. Prove the loop, then scale.

The end-state: slyght walks itself — every screen, every action, screenshotted, judged like an adviser, with honest covered/broken/not-covered markers and an interactive map of every action's path. John stops being the manual QA region and gets eyes on the whole app at once. This is the thing the last three sessions were clearing the runway for. Build the loop, prove it on the first batch, then unleash the parallel fleet on the full app.
