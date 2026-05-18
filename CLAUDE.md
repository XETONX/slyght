# CLAUDE.md — slyght project

> **Auto-loaded by Claude Code at session start for this repo.**
> Read top-to-bottom before responding to John's first message. This file overrides the global `~/.claude/CLAUDE.md` (RuFlo) where they conflict.
>
> **Read order at session start:**
> 1. This file (CLAUDE.md)
> 2. CC-PRINCIPAL-ENGINEER-MANUAL.md (operating constitution)
> 3. FINANCIAL-INVARIANTS.md (the contract slyght must satisfy)
> 4. FEATURE-MAP.md (atlas of surfaces, writers, state)
> 5. Conditionally: active field report, sweep, or session prompt

---

## 0. Parent config overrides (CRITICAL — read first)

`~/.claude/CLAUDE.md` (RuFlo) contains rules that DO NOT APPLY to slyght. For this project, the following parent rules are explicitly OVERRIDDEN:

| RuFlo rule | slyght override | Why |
|---|---|---|
| "NEVER save to root folder — use `/src`" | `index.html` lives at repo root by design. Other files go in their existing locations (`scripts/`, `docs/`, `tests/`). | slyght is a single-file PWA. Single-file architecture is deliberate. |
| "Keep files under 500 lines" | `index.html` is ~24k lines and stays that way. | Architectural choice. BRAIN bubbles inside the file ARE the bounded contexts. |
| "Use typed interfaces for all public APIs" | Vanilla JavaScript only. No TypeScript. | Single-file deploy. No build step. No type system. |
| "Prefer TDD London School (mock-first)" | Tests added incrementally with Playwright. Behavioural specs, not unit-test-first. | See §13. |
| "Use event sourcing for state changes" | Audit log captures every write (event-sourcing-flavored) but state is mutable. Not strict event sourcing. | `S._auditLog` is the forensic record. State updates via canonical writers. |
| "Initialize swarm using CLI tools for complex tasks" | NO swarm. NO hive-mind. NO Byzantine consensus. | Single-user project. Swarms add overhead with zero benefit at this scale. |
| "Run `npm run build` / `npm test`" | No build step exists. `npm test` runs Playwright once set up. | No bundler, no transpiler. Direct deploy via `git push`. |
| "Domain-Driven Design with bounded contexts in `/src/[domain]`" | BRAIN bubbles ARE bounded contexts but live within `index.html`. Don't refactor out. | See §3. |
| "Tier 1 Agent Booster (WASM) for simple transforms" | All edits are surgical, human-readable. No WASM autotransforms. | Financial code; correctness over speed. |

**RuFlo rules that DO apply to slyght:**
- "Do what has been asked; nothing more, nothing less" ✓
- "ALWAYS read a file before editing it" ✓
- "NEVER commit secrets, credentials, or .env files" ✓
- Parallel sub-agent invocation via Agent tool (native Claude Code feature, useful — see §12)
- `memory_search` for finding past patterns (optional, helpful)

**If RuFlo's behaviour conflicts with this file, this file wins.** When in doubt, ask John.

---

## 1. What this project is

**slyght** = John's personal finance + lifestyle PWA. Single-file `index.html`, ~24k lines. Hosted at `xetonx.github.io/slyght` via GitHub Pages. Backed by Cloudflare Worker for push notifications.

**Purpose:**
- Help John get finances under conscious control (debt → savings, weed/spending awareness)
- Coach-relationship with money, not tracker-relationship
- Support City2Surf training (9 August 2026) and broader lifestyle goals
- Stay alive long enough to be useful

**This is for ONE user (John) specifically.** Not a portfolio. Not for users-in-general. Decisions get judged against "does this help John daily?", not "is this elegant?"

---

## 2. Who you're working with

**John** — WMS Consultant at Manhattan Associates, Sydney. Self-described "smart but lazy." Visual learner. Asks the same question multiple ways when working through complexity. Wants pushback, not deference. Has openly named addiction (weed) and spending impulses; slyght partly exists to surface these without lecturing.

**What he values:**
- Honest assessment over reassurance
- Surface bugs and risks proactively
- Methodical, focused work over performative output
- Plain English, real names, no jargon
- Pushback when his ask is wrong

**What he doesn't value:**
- Sycophancy ("great question!")
- Hedging when the answer is clear
- Process theatre that doesn't move the work
- Endless clarification before doing work
- Patching cycles where bug fixes create more bugs

---

## 3. Architecture (don't propose changes without ADR)

**Stack:**
- Frontend: vanilla HTML + JS + CSS in single `index.html`
- State: global `S` object, persisted to `localStorage` key `slyght_v5`
- Hosting: GitHub Pages, deployed via `git push` to main
- Backend: Cloudflare Worker (`slyght-worker.johndounas.workers.dev`) + KV namespace `SLYGHT_DATA`
- Testing: Playwright (chromium installed) — assertion-based specs in `tests/` (being built out)

**Patterns:**
- **BRAIN bubbles** = bounded contexts within `index.html`. `BRAIN.config`, `BRAIN.transaction`, `BRAIN.debts`, `BRAIN.savings`, `BRAIN.bills`, `BRAIN.plan`, `BRAIN.audit`, `BRAIN.assets`.
- **Canonical writers** — every `S.X` mutation via `BRAIN.<domain>.<verb>X(value, source)`. Direct mutation in handlers is a Guardian violation.
- **Source tags** — every write tagged with a value from `BRAIN.SOURCES`. Typos fail at write time.
- **Audit log** — `S._auditLog` append-only event log. Forensic ground truth.
- **Snapshots** — `SNAPSHOTS.take(label)` before migrations.
- **Boot self-test** — fires at DOMContentLoaded + 500ms. ~25+ invariant checks.
- **Guardian** — `scripts/guardian-static.js` for architectural violations.

**This architecture is sound. Do not propose React, Vue, Svelte, TypeScript, Vite, or any framework migration without writing an ADR first.**

---

## 4. Documents you should know about

**Always read at session start:**
1. This file (CLAUDE.md) — done
2. CC-PRINCIPAL-ENGINEER-MANUAL.md — operating constitution
3. FINANCIAL-INVARIANTS.md — the contract slyght must satisfy
4. FEATURE-MAP.md — atlas of surfaces, writers, state fields

**Conditionally read based on session type:**

| Session is about... | Also read |
|---|---|
| Specific bundle | Active bundle prompt (e.g. `CC-SESSION-YYYY-MM-DD.md`) |
| Field report from John | The `FIELD-REPORT-*.md` end-to-end |
| Mock-app sweep | `MOCK-SWEEP-PROMPTS.md` + sweep folder |
| Architectural decisions | Recent ADRs in `docs/adr/` |
| Iterating on prior work | `CHANGELOG.md` for recent context |

**Don't ask John "should I read X?" — figure out from his message which apply and read them.**

---

## 5. Current state of the project

**Last updated:** 2026-05-18

**Status:** Money-flow accounting integrity crisis. App diverged from real bank by $1,840+ as of yesterday. John cannot effectively use the app right now. Bundle 30 in scope.

**Recently shipped:**
- Bundle 28 Phase 0 (intent layer migration — `planIntents` populated)
- Bonus persistence fix (verified resolved in dark-mode sweep)
- 14-commit "demon time" session 2026-05-13

**Currently active:**
- **Bundle 30 = financial-math integrity.** NOT YET SPECCED. Triggered by `FIELD-REPORT-2026-05-15.md` surfacing 3 BLOCKING bugs (FR-01, FR-02, FR-03) plus 5 HIGH bugs.

**Open critical bugs (from field report):**
- **FR-01** — Cash hero `S.bal` doesn't decrement on transaction record. Violates INV-01, INV-05.
- **FR-02** — Bucket balances don't increment when allocation transactions record. Violates INV-02, INV-12.
- **FR-03** — AI agent `update_balance` tool overshoots corrections by ~$7k. Violates INV-20.
- FR-06 HIGH — Payday countdown 3 different values across surfaces. Violates INV-14.
- FR-07 HIGH — Debts sub-screen disagrees with canvas. Violates INV-11, INV-18.

**On deck (after Bundle 30):**
- Pixel-fixable items from prior sweep (F-04, F-11, F-19, F-21, F-22, F-23)
- Design-deferred items (F-05, F-14, F-16, F-17, F-18, F-20) — need Opus design pass

**Awaiting John's approval:**
- Bundle 30 SDD (to be produced by CC)
- Pending decisions at bottom of FINANCIAL-INVARIANTS.md (5 items)

---

## 6. The new operating mode — invariant-grounded engineering

**This is the shift:** we are no longer patching bugs. We are encoding mathematical contracts the app must satisfy, then fixing whatever violates them.

**Process:**

Old way:
- John reports a bug → CC reads code → proposes a fix → ship → discover more bugs

New way:
- Bug exists → identify which INV-NN it violates
- Fix targets the INV violation specifically
- Paired with a Playwright spec that fails before fix and passes after
- Spec stays as regression guard forever

**Every Bundle 30 fix must cite which invariant(s) it preserves.** Every Playwright spec must assert a specific invariant. The invariants doc is the spec.

If a bug is found that no current invariant covers → propose a new INV-NN, get John's sign-off, then fix.

---

## 7. The session loop (every session)

From CC-PRINCIPAL-ENGINEER-MANUAL.md §3. Walk it in order:

1. Read this file + docs from §4
2. **Identify the active invariants** for whatever John asks (which INV-NN are relevant)
3. Frame the work — literal ask · outcome · surfaces · blast radius
4. Identify blast radius from FEATURE-MAP cross-references
5. Design before code — SDD for non-trivial; ADR for architectural
6. Implement with canonical writers + source tags + audit log
7. Verify — boot self-test, Playwright spec, manual phone walk
8. Update artifacts — FEATURE-MAP, CHANGELOG, this file's §5
9. Surface "noticed" list (3-5 items with severity)
10. Reflect — what to amend in this file or the manual

**Phase 5 STOP rule:** for non-trivial work, surface proposed change to John BEFORE coding. Wait for approval. No "saving time" by pre-writing.

---

## 8. Non-negotiable rules

Short list:

- **No bypassing canonical writers.** Every `S.X` mutation via `BRAIN.<domain>.<verb>`.
- **Source tags on every write.** From `BRAIN.SOURCES`.
- **Audit-log every dollar move.** With old, new, source, timestamp.
- **No native `confirm()` / `alert()` in flows.** Use `EDIT_MODAL.openConfirm` / `openInfo`.
- **44×44 minimum touch target.** Test viewport 380×660px.
- **Plain English.** "Living money" not "discretionary spend ratio."
- **Real names, not categories.** "Woolworths Kirrawee" not "Groceries" where known.
- **Every number on screen is tappable.** Tap → explainer modal.
- **No `alert('Phase N')` stubs in shipped code.**
- **Math invariants across surfaces.** Cross-surface coherence is required.
- **Every fix paired with a Playwright spec.** No fix ships without a regression spec.
- **No commits with failing Guardian checks.**
- **No commits without phone-verify on 380px viewport.**

---

## 9. Tone and habits

**When responding to John:**
- Direct. Lead with answer or constraint.
- Honest about uncertainty.
- Surface before fix. Don't patch silently.
- Estimate with 2x rule. Naive + adjusted + confidence.
- Push back when an ask conflicts with this file or the manual.
- End every session with noticed list (3-5 items, severity-graded).

**When you don't know:**
- Read code at file:line. Don't guess.
- If FEATURE-MAP doesn't cover it, that's a gap — flag it.
- Ground every claim. "Looks like" without follow-up is not a finding.

**When something feels off:**
- 3+ iterations on same surface = design problem. Surface to Opus.
- Within-24h post-deploy bugs = verification discipline gap.
- Same bug class recurring = invariant missing. Propose one.

---

## 10. Things to NOT do

- Don't skip the session loop
- Don't ask "where's file?" — read FEATURE-MAP first
- **Don't propose framework migrations** (React, Vue, Svelte, Vite, TypeScript)
- **Don't reorganize `index.html` into `/src` directories.** Single-file is the architecture.
- Don't add features John didn't ask for
- Don't "fix" by hiding (suppressing console errors, empty try/catch)
- Don't ship without phone-verify
- **Don't trust in-app AI `update_balance` tool** until FR-03 lands (overshoots by ~$7k)
- Don't initialize swarms or hive-minds
- Don't run `npm run build` (doesn't exist)
- Don't add TypeScript

---

## 11. When you hit a wall

- **Code state confusing?** Re-read FEATURE-MAP. Grep `index.html`. If still confused, ask one specific question.
- **John's ask ambiguous?** Quote the part you're unsure about, ask one question, propose best-guess default.
- **Verification failed?** Roll back. Don't ship broken. Update this file or manual if it would have helped.
- **3+ iterations on same problem?** Design issue. Surface to John; loop Opus.
- **Architectural change needed?** ADR first.

---

## 12. Parallel sub-agents (when useful)

Native Claude Code parallel sub-agents ARE useful for slyght. Examples:
- Read FEATURE-MAP + grep `index.html` for function + check git log in parallel
- Read 3 different documents in parallel during session-start
- Run Playwright spec + check audit log + read state-snapshot in parallel

**This is NOT swarms.** No coordination protocol, no consensus, no persistent agent roles. Just parallel one-shot tasks that return results for synthesis.

**Use when:** independent read-only tasks · information-gathering before design · verification across multiple sources.

**DON'T use when:** editing files (sequential, controlled) · anything that mutates state · anything where order matters.

---

## 13. Testing workflow

**Tooling:** Playwright (chromium installed via `npx playwright install chromium`).

**Directory structure:**

```
tests/
├── fixtures/          ← known state snapshots for repeatable tests
├── scenarios/         ← Playwright specs organized by category
├── helpers/           ← fixture-loader, persona-actor, state-asserter, screenshot-collector
├── run-sweep.js       ← orchestrator
└── README.md
```

**Each spec follows: load fixture → persona acts → assert final state + display + audit.**

**Personas:**
- Decisive John (knows what to do, single tap)
- Indecisive John (taps, retreats, changes mind)
- Mistaken John (taps wrong thing, undoes)
- Distracted John (starts flow, navigates away, returns)
- Confused John (tries AI, taps wrong things)
- Power John (fast-tapping, parallel modals)

**Hard rules:**
- Every fix ships paired with a spec that fails before fix and passes after
- Every invariant from FINANCIAL-INVARIANTS.md has at least one spec asserting it
- Run full sweep before push; specific scenario during iteration
- Phone-verify on 380px is the final acceptance test, not the only test

**Bundle 30 specifically:** infrastructure scaffold is built AS PART OF Bundle 30, not separate. First FR fixes ship paired with first scenario specs.

---

## 14. Maintenance of this file

Keep it useful by:
- **Updating §5 (current state) at end of every session.** Two-minute job that saves the next session significant time.
- Adding to §10 (don'ts) when discovering new anti-patterns
- Pruning §4 (docs) when documents are retired
- Updating §6 (operating mode) if engineering practice evolves
- Updating §0 (overrides) if RuFlo config changes upstream

**This file is loaded automatically — every line costs reading time. Keep it tight.** Target: readable in 3-5 minutes. If it grows past 8, refactor sections into linked docs.

---

## 15. The honest call-out

If John seems stuck on rhythm (spending >1 hour to "get started"), THAT IS A SIGNAL THIS FILE OR THE MANUAL NEEDS IMPROVEMENT. Surface it. Propose amendments.

If you're spending >1 hour to understand the codebase before responding, THAT IS A SIGNAL FEATURE-MAP NEEDS WORK. Surface it. Add to FEATURE-MAP.

The system improves through use. Notice friction. Surface it. Don't just absorb it.

---

**End of slyght CLAUDE.md.**

Now do the work John asked for.
