# slyght — Mission Control v2: the Translator Web App

A rework of the mission-control cockpit from a single scrolling HTML page into a **real multi-view web app** — heavy JS/CSS, routed views, real state. The core reframe John landed: **the control centre is a technical translator.** Its job is to take CC's deep technical findings and present them so John genuinely understands them, can add his judgment (his strength — systems sense, priorities, what matters for the real app), and hand back a richer, human-informed instruction for CC to execute. It is the comprehension-and-direction layer between CC's technical depth and John's judgment — NOT a bug tracker.

**Opus has built an architecture blueprint** (the 5-view web app John approved). It's the intent and the feel, not a pixel-spec. **You have creative roaming to improve where your judgment says better** — same as the walker/gzip/cache reframes, where measuring reality beat the original brief. Build to the intent; improve the execution.

## The reframe, in one line
The cockpit reads CC's *deep* findings → presents them plain-English-first-with-technical-depth-underneath so John can add real judgment → hands CC back a brief combining its depth with John's direction.

## What's wrong with v1 (drove this rework)
1. **Tiny text, huge wasted margins** — it widened the container but kept chat-sized type. This is a web app now; use the screen, big readable type.
2. **One endless scroll** — John wants a website with navigation between views, not a single page. Use JS/CSS heavily — a real router, real view-switching, real state.
3. **The generated prompt was a hollow template** — John checked bug #3 and got "Root cause: _fill in from the walk_ / The fix: _scope through investigation_". The compose function read the THIN source (the one-line OPEN-BUGS.md entry) instead of the RICH source (walk.json findings, coverage map, audit evidence, root-cause analysis). **This is the real architectural fix: wire the cockpit to the deep data, not the thin line.** The translator can't translate what it can't see.
4. **Bugs and translator were conceived as separate** — John: "the cockpit needs to contain BOTH open bugs and this translator like all in one." They are the SAME surface. The open bugs ARE the cases; opening a bug IS entering its translation. Fuse them.

## The architecture (Opus blueprint — 5 views, left-nav web app)
- **Overview** — at-a-glance health: stats, screen map, what changed since last walk. Click a broken surface → jump to its case.
- **Cases** (the heart — bugs + translator FUSED) — open bugs, each one a translated case, grouped by UI/screen, sorted by priority and time. Opening a case = the translation (below).
- **Live walk** — run by GROUP (dashboard / bills / AI chat / analysis / settings / plan / savings); within a group, pick one spec or run the whole group. Show **runnable ✓ vs authored-only ⊘** markers per spec so Run is never a mystery (see "the Run honesty problem" below). Map fills + feed streams live.
- **Docs + specs** — read/edit the real repo files (FEATURE-MAP, INVARIANTS, MISSION-RULES at root; OPEN-BUGS triage; coverage map). Walk-specs open as cases too (same treatment: what it walks, the steps, draft/refine, John's thoughts, generate).
- **Deploy** — the careful last mile: shows staged/branch/what-ships, git push behind a typed confirm. Built last, trusted after the rest.

(Consider a **History/shipped** view if your judgment says it helps — what's been deployed. Opus left this open to you.)

## A CASE, when opened (the translation — the most important part)
Layered, so John can add value AND grow his understanding:
- **Plain-English summary on top** — anchored to what John knows (Postman/APIs/entities/shadow-tables; MAWM user-exits/composite-APIs/hierarchies), jargon defined inline, one concept at a time. Per JOHN-KNOWLEDGE + teaching-style memory. The summary's job: explain it so John can form a real opinion.
- **Technical depth on expand** — the actual mechanism, the walk evidence (audit-log lands, S-deltas), the root cause, file:line. For when he reaches for it — this is how he grows.
- **The proposed fix** — scoped, from CC's real analysis.
- **Ask about this** — sendPrompt-style hook to ask Opus/CC to go deeper on that finding.
- **John's thoughts** — a box for his judgment, constraints, priorities, how he wants it fixed.
- **Generate prompt** — combines CC's depth + John's thoughts → writes a FULL RICH brief to `mission-control/briefs/fix-<id>.md` AND gives the short kickoff line to paste. NOT a hollow template — pull the real root cause, evidence, and fix from the rich data, then weave in John's thoughts.

## The Run honesty problem (a real gap John caught — fix it)
v1's Run button runs `scripts/walker/run-walk.js`, which only walks the flows wired in so far (Darwin + ~5 first-batch). It does NOT walk all 202 actions or all 14 authored specs — but the UI implied "walk the app." That's a behavior-truth gap sitting in the QA tool itself. Fix: **turning the 14 authored specs into runnable flows is your job** — and the cockpit must show, per spec, runnable ✓ vs authored-only ⊘, so Run's scope is always honest. Run-by-group derives its picks from the runnable specs in that group.

## The data layer (the real fix — get this right)
The cockpit must read the RICH sources so both the summary John reads and the prompt he generates are deep:
- walk.json (per-step findings, audit lands, verdicts) — the latest run
- the coverage map (the framed 202, the markers)
- CC's root-cause analysis per finding
- OPEN-BUGS.md for the canonical bug records (1064 lines, rich prose — preserve it, append/surgical-edit only, NEVER regenerate)
CC should pre-write a full investigation brief per finding (real root cause, scoped fix, evidence) into a structured place the cockpit reads — so the case is deep BEFORE John opens it. Kill the "_fill in_" stubs.

## Security — UNCHANGED, all seven rules still hold
The v1 server security spec stands exactly (127.0.0.1-only, allowlisted actions/no arbitrary exec, path-jailed to repo root, origin+token, manual start/stop, deploy typed-confirm, SECURITY.md). New write actions (if any) join the fixed allowlist — never a generic writeFile/exec. Anti-clobber guard stays. This is a presentation/architecture rework on top of the proven-secure server, not a security change.

## Layout / craft
- **Use the screen. Big readable type. No tiny text, no wasted margins.** Full desktop web-app layout (left-nav + main view is the Opus blueprint; improve if you see better). It's a website now, not a chat-width card.
- Keep the dark mono terminal aesthetic (Space Mono, the money-flow board feel) John has approved across iterations — match `mission-control/PROTOTYPE.html` for tone, scale it up for a real app.
- Heavy JS/CSS is wanted — real routing, real state, real interactions. John said so explicitly.

## Creative roaming (explicit)
This blueprint is the INTENT. You've improved every brief by measuring reality (gzip 136→22KB, SW-caches-nothing, deterministic-walker over API-fleet). Same invitation here: where your judgment says a different view structure, interaction, or data wiring serves the translator-intent better, DO IT and flag what you changed and why. Build the right thing, not a literal trace of the mock.

## Pipeline + close
- Full 6-tier pipeline. Step 0 conscious-suspension reasoning as before (dev-tooling, no money logic — the analog is "prove it reads true and reads the RICH data"). Risk: presentation rework = mostly SAFE; any new server write actions = NEEDS-REVIEW (John approves).
- Branch `mission-control` (continue it). John pushes.
- §8 plain-English at commits. Update JOHN-KNOWLEDGE at close — especially anything new he learns about web-app structure (routing, views, state) framed in his terms.
- Attribution: Co-Authored-By Claude Opus 4.7 (via Claude Code) + Direction-By John Dounas.

The end-state: John opens the mission-control web app, navigates between real views, lands in Cases where every finding is a translation he can actually understand — plain-English on top, depth underneath — adds his judgment, and generates a deep brief (CC's analysis + his thoughts) that he hands back for execution. The translator between CC's depth and John's judgment, built as a real web app, readable, with the Run honesty and the rich data wired in. Improve where you see better.
