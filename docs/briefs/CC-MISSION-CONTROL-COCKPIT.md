# slyght — Mission Control Cockpit: build brief

A standalone **local dev page** (opened in Chrome at `localhost`) that is the single command surface for slyght's QA: the live walk tracker, the open-bugs board, the feature map + financial invariants + rules — all in one place, where John can **see** the walk fill in live, **organise** findings, **write** changes back to the real repo files, and eventually **deploy** from there.

This is NOT an in-app feature and NOT a chat widget. It's a developer cockpit that lives in the slyght repo, reads the real files the walker + CC already write, and (via a tiny secured local server) writes back to them. The chat-prototype Opus built is the **visual spec** — match its dark mono terminal aesthetic (Space Mono, dark-default, the money-flow board feel). John has seen and approved the prototype's look and interaction model.

**Teach-as-you-go (per JOHN-KNOWLEDGE + teaching-style memory):** John is closing a code-internals vocab gap with strong systems judgment. Explain the localhost/server/CORS concepts in plain English anchored to what he knows, one concept at a time, §8 plain-English at every commit. This brief itself is the level to pitch at.

---

## The architecture, in one picture

```
the walker  →  files on disk        →  the board (localhost:5050, Chrome)
(writes)       walk.json                (reads → live map + feed + bugs)
               OPEN-BUGS.md             (writes ← via the tiny local server)
               FEATURE-MAP.md
               FINANCIAL-INVARIANTS.md
                      ↑                          |
                      |                          | John taps "compose"
                      └──── CC commits back ←─────┘ → brief.md written to disk
                                                      + short kickoff prompt shown
```

Two parts:
1. **`mission-control.html`** — the page. Pure front-end. Reads files to draw the live tracker, the bug board, the feature map, the invariants. Matches the prototype's look.
2. **`mission-control/server.js`** — a tiny (~30–60 line) Node server that does the **writing** (the page alone can't write to disk — browser security). This is the one piece that turns a viewer into a cockpit. It MUST be built to the security rules below.

---

## SECURITY — HARD REQUIREMENTS (non-negotiable, build to these exactly)

The local server is safe *only if* these are all true. They are not suggestions — they are the spec. Document each in §8 plain-English so John understands what's protecting him.

1. **Localhost-only binding.** The server MUST listen on `127.0.0.1` (localhost only), NEVER `0.0.0.0`. This means only John's own machine can reach it — not his wifi, not the internet. Hard-code it. This is the single most important rule.

2. **Narrow, allowlisted actions — NO arbitrary-command endpoint.** The server exposes a FIXED, NAMED set of actions only. NOT "run any command I send" and NOT "write any file to any path." Specifically only:
   - `writeBrief(name, content)` — writes ONLY into `mission-control/briefs/`
   - `editFeatureMap(content)` — writes ONLY `docs/FEATURE-MAP.md`
   - `editInvariants(content)` — writes ONLY `docs/FINANCIAL-INVARIANTS.md`
   - `editRules(content)` — writes ONLY the rules file (see below)
   - `updateBugs(content)` — writes ONLY `docs/OPEN-BUGS.md`
   - `runWalk()` — runs ONLY the walker script (fixed command, no user input interpolated)
   - `deploy()` — runs ONLY `git push` on the slyght repo (PHASE LAST — see phasing)
   There is no generic "exec" or "writeFile(path)" endpoint. Each action is a named function with a hardcoded target. An attacker who somehow reached the server still can't do anything outside these seven named, path-jailed actions.

3. **Path-jailing.** Every write action resolves its target path and MUST verify the resolved absolute path stays inside `C:\Users\admin\slyght`. If a path ever resolves outside the repo (via `..` or absolute path injection), reject it. The server physically cannot write outside the slyght folder.

4. **Origin-locked + shared token.** The server accepts requests ONLY from the board's own origin (CORS allowlist = the localhost board only), AND requires a simple shared token (a random string the board knows, generated at server start, printed to the terminal for the board to use). This stops any OTHER browser tab (e.g. a malicious website John has open elsewhere) from talking to the server. Standard pattern — apply it.

5. **Manual start, manual stop.** The server does NOT auto-launch on boot. John starts it when he wants the cockpit (`node mission-control/server.js`), kills it when done. It only exists while he's running it.

6. **Deploy confirm.** The `deploy()` action (git push) ALWAYS requires an explicit confirm in the UI before firing ("Ship to main? This pushes live. [confirm]"). The one irreversible action always asks first — same discipline as the push/cache deploys.

Document these seven things in a `mission-control/SECURITY.md` so the protections are written down, not just in code.

---

## PHASING — build in this order (walk before run)

**Phase 1 — the live tracker + read (prove the cockpit reads true).**
The page reads the real files and renders:
- **Top stat bar:** framed / walked / broken / progress %, computed from the real `walk.json` + feature-map totals (not hardcoded).
- **Live map + feed side by side** (John's explicit choice): the screen-map as nodes from `FEATURE-MAP.md`; a "run walk" control; as the walk runs, nodes flip ⊘→✓/✗ and the feed streams findings line-by-line. In Phase 1 the walk data can come from re-reading `walk.json` after a run; true real-time streaming is Phase 3.
- **Open-bugs board:** read from `OPEN-BUGS.md`, sorted by severity/blast-radius, matching the prototype's fix-queue.
- **Feature map + financial invariants + rules:** rendered read-only for now, clean and readable.
No server needed yet — this is all read. Get it reading the REAL files and looking like the prototype. Prove it shows truth.

**Phase 2 — writing (the cockpit grows hands).**
Add `server.js` to the security spec. Wire the writes:
- **Compose → brief-to-disk + short prompt.** Tapping "compose" on a bug writes a full detailed brief MD to `mission-control/briefs/<slug>.md` (via `writeBrief`), then shows John the SHORT kickoff prompt to paste into CC: *"Read mission-control/briefs/<slug>.md and run it through the full pipeline — my approval before push."* (This is John's exact ask: the huge MD goes to a file, he gets the one-line prompt to start the mission.) Brief template defined below.
- **Edit feature map / invariants / rules from the board.** Simple visual forms — add/edit an entry, tap save, the server writes the real file. Confirm-on-save. John wants his hands on: feature map, financial invariants, rules (and see "what else is writable" below).
- **Triage open bugs:** reorder, dismiss, add manually — writes `OPEN-BUGS.md`.

**Phase 3 — real-time + deploy (the careful last mile).**
- True live streaming: `runWalk()` runs the walker, the board tails the output and flips nodes in real-time as surfaces actually complete (not just re-read after).
- **Deploy button** (`deploy()` = git push) with the mandatory confirm. Build this LAST and only after file-writing is solid and trusted — it's the highest-stakes write. Same as how push/cache deployed: prove the mechanism, then trust it with the irreversible action.

---

## WHAT JOHN WANTS HIS HANDS ON (writable surfaces)

Confirmed with John — make these editable-from-the-board in Phase 2, each as a simple clean form that writes the real file:
- **Feature map** (`FEATURE-MAP.md`) — add/edit surfaces + actions
- **Financial invariants** (`FINANCIAL-INVARIANTS.md`) — add a rule like "savings can't push balance negative" in plain language, it writes the file
- **Rules** — a `docs/MISSION-RULES.md` (new) for John's own QA/dev rules and standing directives
- **Open bugs** (`OPEN-BUGS.md`) — reorder, dismiss, add manually
- (Confirm with John if he also wants walk-specs / personas editable — leave as read-only unless he says.)

Keep the editing format SIMPLE — John wants "add rules or interact in a simple format," not a raw markdown editor. Think: a labelled field + a save button, the server handles turning it into the file's markdown structure.

---

## THE COMPOSE BRIEF TEMPLATE (mail-merge — board fills the blanks)

The "generated prompt" is just a template with the bug's details dropped in. Define one template; the board fills it per bug:

```
# Fix: {bug.title}

**Severity:** {bug.sev} · **Blast radius:** {bug.blast}
**Surface:** {bug.surface}  **Finding:** {bug.finding}
**Root cause (if known):** {bug.rootCause}
**The fix:** {bug.fix}

Run through the full 6-tier pipeline. Conservation + Guardian green gate.
§8 plain-English at commit. My approval before push.
```

Board writes this (filled) to `briefs/<slug>.md`; shows John: *"Read briefs/<slug>.md and run it — my approval before push."*

---

## Pipeline + close

- This build runs through the 6-tier pipeline like everything else. The server's security spec is high-blast-radius → individual scrutiny, Human Verdict gate, John approves.
- Reuse the prototype as the visual reference (dark mono, Space Mono, the money-flow board look). Don't redesign the aesthetic — John approved it.
- Session-close: update JOHN-KNOWLEDGE with what John now understands (localhost vs 0.0.0.0, why a browser page can't write but a local server can, CORS/origin-locking, allowlisted-vs-arbitrary endpoints, path-jailing). These are the new concepts this build teaches.
- Attribution: Co-Authored-By Claude Opus 4.7 (via Claude Code) + Direction-By John Dounas.

The end-state: John opens `localhost:5050` in Chrome, watches the walk fill the map live, sees bugs land auto-sorted, taps compose to drop a full brief to disk + get a one-line kickoff, edits the feature map and invariants in a clean form that writes the real files, and — when trusted — ships from a confirm-gated deploy button. Mission control for slyght, built safely, in phases. Prove it reads true, give it hands, then the careful last mile.
