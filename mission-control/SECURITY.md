# Mission Control — Security (the seven rules, written down)

The Mission Control cockpit is a **local dev tool**: a page you open in Chrome at
`http://127.0.0.1:5050`, backed by a tiny Node server (`mission-control/server.js`)
that does the writing. A browser page **cannot** write to your disk — that's a
hard browser rule (or every website could overwrite your files). The server is the
one piece allowed to touch disk, so it is built to these seven rules. Each is a
real protection, in plain English.

> **Start it:** `node mission-control/server.js` → open the printed URL.
> **Stop it:** Ctrl-C. It only exists while you're running it.

---

### 1. Localhost-only (`127.0.0.1`, never `0.0.0.0`)

When a server "listens" it chooses which doors to open. `127.0.0.1` (localhost) opens
**one** door that only your own machine's inside can knock on — not your wifi, not the
café network, not the internet. `0.0.0.0` opens **every** door. We hard-code `127.0.0.1`
(`server.js` `HOST` constant + the `listen(PORT, HOST, …)` call). The static `serve.js`
was also fixed to bind `127.0.0.1` for the same reason.

*Protects against:* anyone else on your network reaching the cockpit or its writes.

### 2. Allowlisted actions — no arbitrary command, no write-any-file

The server exposes a **fixed menu** of named actions and nothing else
(`ACTIONS` in `server.js`): `writeBrief`, `editFeatureMap`, `editInvariants`,
`editRules`, `editWalkSpec`, `addBug`, `setBugStatus`, `runWalk`, `deploy`. Each is a
function wired to **one hard-coded target**. There is **no** generic `exec(anything)`
and **no** `writeFile(anyPath, …)`. `runWalk` runs exactly `node scripts/walker/run-walk.js`;
`deploy` runs exactly `git push` — neither interpolates any text you send.

*Protects against:* an attacker who somehow reached the server still can't run commands
or write files of their choosing — the menu is all there is.

### 3. Path-jailing

Before any write, the server resolves the **full absolute path** and checks it still
lives inside the slyght repo (`jail()` in `server.js`: `path.resolve` then
`startsWith(REPO + sep)`). The classic escape is `../../Windows/...`; resolving the `..`
first and then rejecting anything outside makes the escape impossible. The server
**physically cannot** write outside the slyght folder.

*Protects against:* path-injection writing to system files or elsewhere on disk.

### 4. Origin-locked + shared token

Every browser request carries an `Origin` stamp saying which page sent it (the browser
sets it; a page can't forge it). The server accepts write POSTs **only** from
`http://127.0.0.1:5050` / `http://localhost:5050` **and** only if they carry the
**token** generated fresh at server start (printed to the terminal, auto-injected into
the served page). Another browser tab — e.g. a malicious site you have open elsewhere —
can't read the token (same-origin policy stops it reading our page) and can't fake the
Origin. Two locks, both must pass.

*Protects against:* a hostile webpage in another tab quietly POSTing writes to your server.

### 5. Manual start, manual stop

The server does **not** auto-launch, install a service, or run on boot. You run
`node mission-control/server.js` when you want the cockpit and Ctrl-C when you're done.
It exists only while you're actively using it.

*Protects against:* a long-lived background server you forgot was listening.

### 6. Deploy needs an explicit confirm

`deploy()` (the one irreversible action — `git push`) refuses unless it receives
`confirm: true`, and the UI gates it behind a typed confirmation (type `deploy`). Both
gates must agree before a push fires: the server's `confirm:true` gate AND the UI's
typed-`deploy` gate. Same discipline as the push/cache deploys: prove the mechanism,
then trust it with the irreversible action — built last.

*Protects against:* an accidental or unintended push to main.

### 7. Written down (this file)

So the protections live in prose a human can audit, not only in code.

---

## What it can write (and how it protects the big docs)

| Action | Target (path-jailed) | Write shape |
|---|---|---|
| `writeBrief` | `mission-control/briefs/<slug>.md` | new file |
| `editFeatureMap` / `editInvariants` / `editRules` / `editWalkSpec` | the real doc | full-content write, **anti-clobber** (refuses a >50% shrink unless `force:true`); the page loads the real file first and appends, so existing content is preserved |
| `addBug` | `OPEN-BUGS.md` | **append only** — a new `## N.` section at the end |
| `setBugStatus` | `OPEN-BUGS.md` | **surgical** — replaces exactly one bug's `Status:` line; everything else byte-for-byte |
| `runWalk` | — | runs the walker (fixed command) |
| `deploy` | — | `git push` (fixed, confirm-gated) |

**OPEN-BUGS.md is 1064 lines of irreplaceable history.** The cockpit never regenerates
it from a parsed model — it only appends new sections or edits a single Status line in
place. Reordering/dismissing in the board are a *view* (client-side sort) plus a
single-line status edit, never a rewrite.

---

---

## v2 additions (2026-05-26) — all seven rules unchanged

The translator rework is presentation/architecture on top of the proven-secure
server. What changed, and how it stays inside the rules:

- **New allowlisted write action: `saveThoughts(caseId, text)`** (rule 2) — persists
  John's per-case judgment to one fixed file, `mission-control/case-notes.json`
  (rule 3 path-jailed). `caseId` is a JSON map key validated to `[a-z0-9-]` (not a
  path); text capped at 20k. Joins the fixed allowlist — still no generic writeFile/exec.
- **`runWalk` now takes an optional `{group}`/`{spec}` scope** — the value is
  **validated against `specs.json`** (must be a known group or spec file) before it
  becomes a `--group=`/`--spec=` arg. Unknown scope → refused. Still a fixed command;
  no raw user text reaches the shell (run-by-group honesty).
- **New read endpoints (GET, read-only, no token — same class as the existing reads):**
  `/api/cases` (cases.json), `/api/specs` (specs.json), `/api/notes` (case-notes.json),
  `/api/gitstatus` (read-only `git branch`/`status`/`log`/`rev-parse` via `execFileSync`,
  fixed args, **no shell** — informs the Deploy view's "what ships"; cannot mutate anything).
- **Static assets `/app.js` + `/app.css`** served from the mission-control dir (fixed
  filenames, not a user path).
- **Anti-clobber + OPEN-BUGS append-only/surgical rules stand unchanged.** `cases.json`
  is generated read-only by `scripts/mc/build-cases.js`; the cockpit never writes it.
- Runtime outputs `case-notes.json` + `briefs/` are gitignored (personal/per-session).

---

## v3 / Jarvis additions (2026-05-26) — all seven rules unchanged

The ticketing-platform rework (Jarvis) adds the comment/status/handoff loop. Five
new allowlisted, path-jailed write actions join the fixed menu (rule 2); no generic
writer/exec; no new outbound network. The reskin (jarvis.css/jarvis.js) is presentation.

| Action | Target (path-jailed) | Notes |
|---|---|---|
| `addComment` | `ticket-state.json` | author validated (john\|jarvis\|cc), ticket id `^SLY-\d+$`, 8k cap. First John comment earns Open→Discussing. |
| `setStatus` | `ticket-state.json` | **validated against the state machine** — only legal transitions; `ConfirmedLive` REQUIRES walk evidence (cannot be a typed label). |
| `confirmFromWalk` | `ticket-state.json` (+ composes `setBugStatus`) | EARNED `ConfirmedLive` — takes only `{id}`, reads NO free-text evidence. Same state-machine edge check as `setStatus` (ConfirmedLive only from Investigating/Shipped); reads the latest walk on disk (jail()'d via `latestWalk()`) for the ticket's surface scope (`specs.json` registry, never a path) and transitions ONLY if a real, recent (≤14d), passing walk exists — recording the actual walk as structured proof. |
| `alignHandoff` | `handoffs/SLY-N.md` + `ticket-state.json` | the gate — collates finding + thread + alignment + links + age into a path-jailed handoff file CC reads; only from Open/Discussing. |
| `createTicket` | `tickets-manual.json` | manual store (regen never clobbers it); type validated (bug\|feature\|task). |
| `postResult` | `ticket-state.json` (+ composes `setBugStatus`) | CC posts back; on a terminal state PROPAGATES the linked OPEN-BUGS status (surgical — via the existing allowlisted setBugStatus, prose preserved). The rich reasoning stays on the ticket. |

New reads (GET, read-only, no token): `/api/tickets` (spine + state merged), `/api/handoff?id`.
Asset serving generalized to any `.css/.js` **basename** in the MC dir (`path.basename`
strips traversal). Mutable stores (`ticket-state.json`, `tickets-manual.json`, `handoffs/`)
are gitignored. The earned-state machine means status is a real workflow, not a free field.

*If a future change adds an action or a write target, it must reconcile with this file
first. New action → new row above + which rule covers it.*
