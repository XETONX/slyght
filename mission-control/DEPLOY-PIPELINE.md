# Deploy pipeline — how a fix reaches the live app (and what stops a broken one)

> Last hardened **2026-05-28** after SLY-1: a fix's own smoke spec carried a wrong
> assertion (`txn.source` — a field 0/212 real txns have; source tags live in the
> audit log). The sandbox-confirm drone had self-reported `smokePassed:true`, so the
> bad spec rode all the way to the push gate before a manual run caught it. The lesson:
> **a drone's self-report is not a gate.** The gate is now deterministic and server-run.

## The loop (every fix runs all of it, in order)

```
 Open → Gathering → Discussing → Aligned        (build the case → resolution → sign-off)
   │
   ▼
 executeFixOnMain   drone implements on an ISOLATED main worktree (../slyght-deploy),
   │                runs guardian, COMMITS "SLY-N: …". Never pushes. Cockpit untouched.
   ▼
 confirmInSandbox   drone runs the FAKE-seeded fixed app + its smoke, JUDGES PASS/FAIL.
   │                Functional confirmation — necessary, but a self-report, so NOT the gate.
   ▼
 ╔═══════════════════════════════════════════════════════════════════════════════╗
 ║  verifyFix   ← THE GATE (deterministic, server-run, not a drone)               ║
 ║   scripts/verify-fix.js <id> <worktree>:                                       ║
 ║   1. Guardian (static): parse FAIL findings; a finding only blocks if its line ║
 ║      falls inside the staged diff's ADDED ranges (origin/main..HEAD). Pre-      ║
 ║      existing findings on main don't block — only NEW ones this fix introduced. ║
 ║   2. Smoke: the ticket's OWN spec (grep tests/smoke for the id). Must run and   ║
 ║      pass all. NO spec at all = FAIL (CLAUDE.md: every fix ships with a spec —  ║
 ║      now enforced, not hoped-for).                                              ║
 ║   ok = (no new Guardian findings) AND (smoke ran, 0 failed, >0 passed)          ║
 ║   Result → caseFile.verify {ok, sha, guardian, smoke}. Shown on the ticket.     ║
 ╚═══════════════════════════════════════════════════════════════════════════════╝
   │  (markReadyToShip is HARD-GATED: requires sandbox PASS + verify.ok +
   │   verify.sha === current worktree HEAD. Stale verify → must re-run.)
   ▼
 ConfirmedLive      fix committed on main worktree; surfaces in the Deploy tab.
   │
   ▼
 ╔═══════════════════════════════════════════════════════════════════════════════╗
 ║  deploy (git push)   ← RULE 6 + the PRE-PUSH GATE (RULE 6.1)                    ║
 ║   • confirm:true required (UI typed-confirm). Only ever pushes a DEPLOY branch  ║
 ║     (main); hard-refuses from the cockpit's own branch.                         ║
 ║   • BEFORE pushing, runs verify-fix.js --staged SYNCHRONOUSLY over the whole    ║
 ║     origin/main..HEAD delta. New Guardian finding OR red/absent smoke → REFUSE. ║
 ║     This is the line that makes "a broken fix reaches my phone" impossible.     ║
 ╚═══════════════════════════════════════════════════════════════════════════════╝
   │
   ▼
 push to main → GitHub Actions (.github/workflows/pages.yml) → GitHub Pages
   → xetonx.github.io/slyght → the S23 PWA (after the service worker refreshes its cache)
```

## Why two gates (ready-to-ship AND push)

- **verifyFix at ready-to-ship** catches a bad fix *early*, at the ticket, with a clear
  per-line reason — before it's ever staged for deploy.
- **The pre-push gate** is the *final* deterministic guard. It re-runs at the moment of
  pushing, against the exact staged delta, so nothing can drift in between (a later edit,
  a stale verify, a second ticket stacked on the worktree). Belt **and** suspenders, because
  the blast radius is John's live money app.

## What the gate deliberately does NOT do

- It does **not** run the full smoke suite. Two specs (`runs-dry-obligated-cash-basis`,
  `week-projection-canonical-paid-reader`) hard-depend on `tests/state-dump/live-*.json`,
  which is **gitignored** (real financial state). A "run everything" gate would be
  permanently red in a fresh worktree. The gate runs the *ticket's* spec + the *staged*
  specs — the regression guards the fix actually shipped with.
- It does **not** block on pre-existing Guardian findings (main currently carries 4 known,
  investigated ones). Only findings on lines the fix touched block. This keeps the gate
  honest about *the change*, not the whole repo's debt.

## Files

- `scripts/verify-fix.js` — the gate runner. `<SLY-N | --staged> <worktree>` → one line of JSON.
- `server.js` — `verifyFix` action (async, records `caseFile.verify`); `markReadyToShip`
  hard-gated on a fresh green verify; `deploy` runs `--staged` synchronously before `git push`.
- `jarvis.js` — `nextAction` routes sandbox-PASS → **Verify** → ready-to-ship; the case file
  renders the gate (`cf-verify`) with per-check ✓/✕ lines.
