# slyght — Master Brief: Walk the App, Read the Code, Judge as an Adviser

This is the full-depth brief John asked for — everything CC needs to get this off the ground running, on the WHOLE project, not one feature. Take the ten minutes to read it whole. It defines a new capability slyght needs, the reasoning behind it, and it explicitly hands CC the job of proposing the vehicle (QA environment vs AI layer vs both) and the tooling. Read it, then SCOPE — do not build yet.

---

## The one idea, stated simply (because it IS simple)

Claude can already look at a screenshot and reason about what's happening. Claude can already follow a chain of logic. So the capability slyght needs is just this:

**Walk the app like a real human would, screen by screen, following the money — and reason about whether what happens makes logical sense. When it doesn't, that's a finding.**

That's it. The "test story" is not an elaborate framework John has to hand-author. It's CC reading a code path, then walking it in the running app like a person, and noticing when the app does something that doesn't make sense. John does this naturally — "I put $800 toward Darwin, that's saving, that's good, so does the bucket update? Can I even pick Darwin when I log it?" — and Claude has the exact reasoning ability to do the same. The job is to *let it*, systematically, across every path in the app.

The reason this is needed: slyght was built interactive, then the hero-truth model and other features were layered on later, and **buttons, transitions, flows, and whole surfaces got missed.** The dashboard tells the truth; the rest of the app may not. Nobody has walked the whole floor. John has been the only one walking it — manually, catching things by eye — and that has to stop being the only QA.

---

## The three capabilities this brief defines

### 1. Read the code → derive the story (no handed scenario needed)

CC must be able to look at a function — say, the allocate-to-Darwin-trip flow — and AUTHOR its complete story by reasoning, not by waiting for John to list scenarios. The method is plain:

- Read the function. Find every branch (every if/else, every condition, every state it can be in).
- For each branch, ask: **what real-life situation puts a user here?** ("John allocates $800" / "John reallocates it elsewhere" / "John pulls it out halfway through the cycle" / "John allocates more than he has").
- For each situation, ask: **what should John see? what should it touch? what's the sensible outcome?** (Does the Darwin bucket update? Does the hero/remaining balance drop? Can he even pick Darwin at log time, or is that option missing?)
- Enumerate the positive path, the negative path, and the edge cases — INCLUDING the ones John would never think to list, because those are the ones that bite.

John's own words frame the standard: the four scenarios he's rattled off (coffee+roundup, payday-planning, runway, KIA+debt) are just quick ones off the top of his head. The point is NOT to test those four — it's for CC to **read any flow and generate the full set of stories for it**, the way a tester who actually understands the system would. Darwin allocation was never on John's list, but it's exactly the kind of flow CC must learn to walk: allocate, reallocate, withdraw-mid-cycle, over-allocate, the UI for each, whether the buttons inside even work.

### 2. Walk the story in the running app (vision is the key)

CC drives the app and SEES it — because Claude can already digest a screenshot and explain what's happening behind it. That vision ability IS the tool. Walk each story screen by screen, screenshot each step (rapid sequence, near-video), and reason from the screenshots: is this what should happen? Is the button working? Is the right thing displayed on open? Did the money flow to every surface it should?

This is **behavior-truth** — distinct from the **code-truth** slyght already verifies. Code-truth: does the calculation reconcile, does the flag match the ledger. Behavior-truth: when a human actually does this, does the app, *as seen on screen*, do the sensible thing across every linked surface. A number can be correct in `snap.derived` and wrong on the Bills screen. A coffee can log correctly in code and never appear in the Analysis tab. Only walking-and-seeing catches that.

The follow-the-money example, fully (this is the texture of a real walk):
> John pays $800 into his Westpac account in real life. How does he record it? He logs a transaction, Savings category, $800. **Does the app give him the option to pick Darwin?** (If no — that's a finding.) Then in Plan mode he goes to Savings Goals and marks it paid — is that the way to debit it from there? **Does the hero / remaining balance update? Does the Darwin bucket update?** Walk it, screenshot it, reason about whether each step makes sense.

### 3. Judge it as a financial adviser (is it right for John?)

The walk doesn't just check "did the button work." CC judges whether the app's RESPONSE is right for John, as an adviser would. The rubric is common sense, not a complex table — John stated it plainly:

- **If you can't afford it, the app must tell you.** Plainly. That's the whole point of the app.
- **If you CAN afford it but have no real surplus, the app should tell you to put the money somewhere better** (savings, debt, the trip) rather than spend it.
- **Saving is good news.** Putting money toward the future is the right move and the app should treat it that way.
- **Overspending against a plan is bad and must be flagged** — and flagged with awareness of TIME. The Darwin persona: John budgets $800 for the trip and spends $200 in the first 24 hours → the app must flag "slow down" — and it knows to, because it's aware of how much trip time remains against the spend rate. Behavior-truth with a clock in it.

So when CC walks a flow and sees a toast fire, it asks the adviser question: **is this the right thing to show John in this situation?** Why is this toast showing when the condition is false? If John clicks this, what's the action behind it, and is that action correct for his state? The judgment is human and behavioral, not just mechanical.

---

## Test personas — walk each story as different real spending patterns

A persona is not a costume; it's a **real pattern of how someone uses money over time**, and the app must respond correctly to each. The same flow walked as different personas should produce different (correct) app responses:

- **On-track John** — spending within plan; app should be calm/affirming.
- **Overspending John** — burning faster than plan (the Darwin $200-in-24hrs case); app must flag, harshly-but-with-a-way-out, time-aware.
- **Underspending John** — spending less this month; app should recognize and REWARD it (how? that's a behavior-truth question to verify — does the reward actually fire?).
- **Angry / stressed John** — the emotional state; does the app's tone and content stay right (honest but not shaming, no spiral)?

Behavior-truth includes: **did the app respond appropriately to the persona's state and the time context** — not just "did it execute." Walk the Darwin allocation as on-track John (fine) AND as overspending John mid-trip (must flag), and verify each response is correct.

---

## CC's job in scoping this — propose the vehicle and the tooling

This brief deliberately does NOT prescribe whether this becomes a QA environment, an extension of the AI layer (BRAIN.aiContext), or both. **CC decides and proposes**, because CC can see the code and John cannot yet. CC must answer, in its scoping:

- **Vehicle:** Is this best built as a QA-vs-prod environment (test instance + Playwright walks + screenshot verification)? As bringing forward the AI layer (the in-app adviser that reasons about state)? As both — the QA environment as the body, the adviser-reasoning as the mind? Propose with rationale.
- **Tools & skills needed:** Enumerate exactly what's required — Playwright, Chromium, the vision pipeline, KV workers, a seeded test instance, the device target (S23 Ultra / Zebra), any new skill or capability. What exists, what needs building, what John needs to provide.
- **Test data + environment:** A seeded test instance with fake data — NEVER John's real ledger (the walks log fake coffees, simulate paydays, allocate fake money; that must not touch his real $714). Confirm the QA-vs-prod separation.
- **The feature-graph first:** Before walking, the feature graph must be mapped — every screen, button, transition, open-state, and what BRAIN value each reads/writes. This makes FEATURE-MAP.md true (generated, not hand-drawn) and is the floor plan the walks navigate. "You can't build a system for a warehouse you've never walked through."

---

## STANDING RULE — maximal parallelism (John's explicit directive, in force from now)

**CC USES AS MANY AGENTS AS NECESSARY, EVEN FOR SIMPLE TASKS, BECAUSE PARALLELISM IS WHAT MAKES THIS PROJECT FAST.** John is on Tier 2 with budget. Do not economize on agent count out of habit. If a sweep, a walk, a feature-graph map, or a test-writing pass can be parallelized across many drones, parallelize it — even for tasks that individually seem small. The bottleneck is wall-clock time to John, not agent cost. Spin up the fleet. A feature-graph map across 20 screens = 20 drones, not one drone doing 20 sequentially. Scenario-walks across 15 flows = 15 walk-drones in parallel. The pipeline's "investigation parallelizes" rule is now turned up: parallelize aggressively, default to more agents.

(This does not relax the verification gates — auditor tier still centralizes, Council still gates pushes, John still approves money-logic. Parallelize the WORK, not the APPROVAL.)

---

## How this fits the existing pipeline and roadmap

- This runs through the 6-tier pipeline like everything else: the feature-graph map + story-derivation is **Gather** (parallel drones); the conformance check (does each surface use BRAIN) is **Conformance**; building the walk infrastructure is **Build**; the screenshot+adviser-judgment verdict feeds **Council** + the **Human Verdict** (which already decides what surfaces to John).
- **The behavior-walks become part of the verification gate.** Once built, no change ships without both code-truth (conservation/smoke/Guardian) AND behavior-truth (the relevant scenario-walks pass, with screenshot evidence). John is pulled in only for big UX changes and new features — exactly the Human Verdict decision-gate already specced.
- **Sequencing (the hard rule):** push reliability (OPEN-BUGS #50) ships BEFORE the walk infrastructure is trusted — you cannot verify flows by screenshotting state the app silently fails to save. Then cache (the device must run fresh code for the walks to be real). THEN this. The story-derivation + feature-graph mapping (pure investigation, no persistence dependency) can BEGIN in parallel with the push fix — mapping the floor doesn't require saves to work. But the live screenshot-walks wait until push + cache are solid.
- **The app-wide hero-truth replication** is the first campaign this capability powers: walk every surface, find where the dashboard's honest-number model hasn't reached (Bills, Plan, Analysis, calendar, goals, trips, chat), fix through the pipeline, lock with tests.

---

## This session

1. Run the master onboarding chain (PIPELINE.md → CLAUDE.md → SECURITY.md → OPEN-BUGS.md → ADR-H → FINANCIAL-INVARIANTS → FEATURE-MAP → JOHN-KNOWLEDGE → last session) + Step 0 Ledger Walk against fresh state.
2. SCOPE this brief through the pipeline, with maximal parallelism — spin many drones to map the feature graph and demonstrate story-derivation on 2-3 real flows (do Darwin allocation as one — walk the code, author the full story, show John what the stories look like).
3. PROPOSE the vehicle (QA environment / AI layer / both) + the tools & skills needed + the test-instance setup.
4. Surface the scoped campaign for John's triage. Do NOT build the infrastructure this session — scope it, prove the story-derivation on a couple of flows so John can see it working, and sequence it behind the push-reliability fix.

The goal end-state: slyght verifies itself — code-truth AND behavior-truth, walked like a human, judged like an adviser, across every path — and John only sees the big stuff. This brief is how slyght stops depending on John's eyes for QA and grows eyes of its own.
