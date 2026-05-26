# CC session — 2026-05-26 (push reliability fix, OPEN-BUGS #50)

> Running session memory. Updated DURING. Fresh focused session: the foundational persistence fix. Brief: `CC-PUSH-RELIABILITY-SESSION.md` (untracked at root).

## Step 0 — hygiene pass (DONE)
- **Repo matches memory ✅** — all 13 claimed 2026-05-23 commit hashes exist on main's lineage (070a4f6). Drift concern resolved.
- **Push-fix targets CLEAN ✅** — `index.html`, `slyght-worker/src/index.js`, `sw.js` all unmodified at HEAD → the fix diff will be unambiguous.
- **Reconcile commit `aef3250`** on branch `push-reliability-fix` (off clean `main`): committed genuine floating work (recon ledger-walk suite + probes, 2026-05-22 retro, 3× 2026-05-21 audit reports, regenerated GUARDIAN.md + allow-list.json); gitignored machine artifacts (`.wrangler/`, `*.zip`, `runtime-report.json`, timestamped scenario-walk outputs + `_scenario_screenshots/`); reverted sweep-PNG churn to baselines.
- **Remaining dirty = only the 13 `CC-*.md` session prompts** → John's call: gitignore (de-noise, keep on disk) vs commit to `docs/briefs/` (preserve in history). Does not block the fix.
- Branch base decision: `push-reliability-fix` off `main`. `walk-and-judge-foundation` (d788d08, 5aeac5e) intact, separate, unpushed.

## Step 0b — frozen-oracle Ledger Walk (illustrative only)
Fresh-state blocked by this very bug + CF 401. Cited the prior run of `ledger-walk-full.js` against `live-2026-05-23.json` as Gather context (14 BACKED / 1 ORPHAN Stan-7 / 1 AMBIGUOUS / China-Holiday bucket over-claim). Illustrative, NOT John's current truth. The acid test is the real verification.

## GZIP REALITY CHECK (the number that reshapes the fix)
`zlib.gzipSync` on the real 139KB KV blob: **raw 136.1KB → gzip 21.8KB → 34% of the 64KB keepalive cap.** 6.2:1 compression. **gzip alone makes the body fit comfortably under keepalive's cap.**

## Gather — confirmed diagnosis (4 drones, file:line)

**Client push path (drone 1):**
- `PUSH.pushFullState` @ `index.html:18995-19039`. Body = raw `localStorage['slyght_v5']` → parse → delete NEVER_SYNC → stringify once. Endpoint `POST .../push-full-state`, `Authorization: Bearer <deviceToken>`.
- **keepalive is PATH-CONDITIONAL** (correction to brief): only the pagehide/beforeunload flush `_flushPushFullState` @ `2565-2574` calls `pushFullState({keepalive:true})` (2572 → init set @ 19028). The **30s debounce push @ 2550 uses a NORMAL fetch — no keepalive, no 64KB cap.**
- Debounce: `_PUSH_FULL_STATE_DEBOUNCE_MS = 30000` @ `2538` (confirmed 30s). `_pushFullStateTimer` @ 2536, `_schedulePushFullState` @ 2540-2552, armed by `save()` @ 2519.
- NEVER_SYNC `['apiKey','_prevState','chatHistory','pin','pinHash']` @ 19005 (confirmed). Client 500kB cap @ 19013 (silent drop). `pushOnSaveEnabled` gate @ 2542+2569.
- **The actual failure mechanism:** Android suspends the backgrounded PWA before the 30s debounce fires → the only near-exit push attempt is the keepalive flush → drops because 136KB ≫ 64KB.

**Worker (drone 2):**
- `/push-full-state` @ `slyght-worker/src/index.js:183`; body read `await request.json()` @ **189 (the one line gzip changes)**. Writes `device:{hash}:state-full-snapshot` @204 + `state-full-meta` (`lastPushedAt` @197) @205. Binding `SLYGHT_DATA`. KV re-serializes → always stores plain JSON (gzip is transport-only).
- **NO worker-side size cap** (the 500kB/64KB is client-only). `/pull-full-state` @225 returns uncompressed (no symmetric change).
- No current decompression. **Minimal change:** sniff `Content-Encoding: gzip` → `DecompressionStream('gzip')` → text → `JSON.parse`, else `request.json()`; stays inside the `try` @188 (malformed gzip → existing 400 @209). `DecompressionStream` confirmed available (compat_date 2024-09-23 ≥ 2023-08-01).
- Contract points to preserve: auth-before-body ordering (184-185 before 189); shallow `{S,BILLS}` gate @190; no `Object.assign` (no proto-pollution guard exists — don't add a merge); KV plain-JSON shape; `lastPushedAt` fires. **CORS:** `Access-Control-Allow-Headers` @114 = "Content-Type, Authorization" — may need `Content-Encoding` appended if preflight triggers; verify on-device.

**Conformance pre-check (drone 3) — CLEAN:**
- `_pushFullStateTimer` + `_PUSH_FULL_STATE_DEBOUNCE_MS` are push-DEDICATED, single-use. Shortening to 5s affects ONLY push cadence. No coupling.
- `save()` schedules ONLY the push. (`_renderTimer`/`scheduleRender` is dead code, not wired to save.)
- `keepalive` LIVE only at 2572 (arg) + 19028 (init). Nowhere else. pagehide(2581)+beforeunload(2582) → both `_flushPushFullState`, the only handlers on those events. visibilitychange handlers (5569 hidden→save, 18711 visible→init/syncState) independent.

**sw.js + observability (drone 4):**
- sw.js (99 lines): network-first passthrough fetch, `CACHE_NAME='slyght-v6'` declared but NOTHING ever written to cache; no `sync`/backgroundsync. **Zero role in state push.** SW retry queue = net-new + Bundle-33-cache dependent → confirmed FUTURE, not this session.
- **CRITICAL: push success/failure has ZERO client-side observability.** Both callers `.catch(()=>{})` and DISCARD the structured result `pushFullState` returns. No audit, no S field, no UI, no retry. Console only if `window.SLYGHT_DEBUG`. **On John's phone a failed push is completely silent, no trace.** The ONLY landing signal is worker-side `meta.lastPushedAt` (via `/pull-full-state-meta` @258, or `X-Slyght-Last-Pushed-At` header). The app "reports success it cannot confirm (reached fetch ≠ bytes arrived)."

## REFINED FIX PLAN (changed by the gzip number — surface for John)
The brief proposed (a) drop keepalive + (b) 5s debounce + (c) gzip. **Gather + the 21.8KB measurement say: do NOT drop keepalive.** keepalive's only problem was the 64KB cap; gzip removes it (21.8KB ≪ 64KB); keepalive's BENEFIT is being the one fetch that survives tab-close/pagehide. So:
- **(c) gzip the body** in `pushFullState` (browser `CompressionStream('gzip')`) + `Content-Encoding: gzip` header. Worker decompresses. Applies to BOTH push paths.
- **(b) shorten debounce 30000 → 5000** (`index.html:2538`).
- **KEEP keepalive on the pagehide flush** — now viable AND valuable (survives exit + fits cap). Dropping it (brief's (a)) would lose tab-close survival for no benefit once gzip lands. ← reasoned departure from brief; brief said "verify, don't assume."
- **(optional, recommended) client push observability** — stop discarding the result; record last push outcome/time so silent drops become visible. Small. John's call on in-scope vs follow-on.
- **SW retry queue = FUTURE** (Bundle 33-cache).

## Deploy-order gate (operational)
Worker is backward-compatible (sniffs Content-Encoding, still accepts plain JSON). So: **deploy worker FIRST** (`wrangler deploy`, John's hands), THEN ship client gzip. Worker-accepts-both → no window where a gzip client hits an old worker and 400s.

## Smoke specs (per brief)
gzip-size (<64KB for ~139KB blob); worker decompress round-trip byte-equivalence; debounce=5000; pagehide path uses keepalive (+ body fits); CompressionStream availability.

## Human Verdict preview
Magnitude axis PASS (no hero number). Reversibility axis CENTRAL (changes persistence path — "does it persist" IS the impact). INDIVIDUAL push approval, high-stakes, John reads it. NOT a bundle.

## ACID TEST (John runs)
After ship + worker deploy: change state (>64KB), background app on S23, pull KV (CF auth in his shell), confirm `lastPushedAt`/state reflects the backgrounded change. KV matches phone → push works.

## Decisions (John 2026-05-26) — ALL APPROVED
1. Refined shape **gzip + 5s + KEEP keepalive** — APPROVED ("a size fix became a reliability fix").
2. Observability — YES, fold in (the `.catch(()=>{})` silence is the deeper bug). Minimal: outcome + timestamp.
3. CC-*.md — COMMIT to docs/briefs/ (design history).
4. Teaching → append to JOHN-KNOWLEDGE (done).

## BUILD COMPLETE (branch push-reliability-fix)
Commit ledger:
- `aef3250` chore(hygiene) — reconcile floating work (Step 0).
- `2270d1b` docs(briefs) — CC-*.md → docs/briefs/.
- `5e1a0a1` fix — restore CC-PRINCIPAL-ENGINEER-MANUAL.md to root (mv glob over-match, caught + fixed).
- `765d633` **fix(worker)** — accept + decompress gzip on /push-full-state (backward-compatible; deploy FIRST).
- `3d0215f` **fix(push)** — client gzip + 5s debounce + visibilitychange:hidden push + flushSync + observability + smoke.
- (docs commit next) — OPEN-BUGS #50 resolved, ADR, JOHN-KNOWLEDGE append, this doc.

Sentinel: **full smoke 205/205**. 14 push specs (gzip round-trip, <64KB proof, flushSync keepalive, observability, redaction-after-gunzip, debounce=5000). Guardian: 4 guardian-static FAILs are PRE-EXISTING (RC11 isPaidInCycle, RC2 getBurn7d — identical on clean baseline); ZERO new violations. **FLAG (not mine, not this session): guardian-static is red on main on those 4 — guardian-all is the green gate. Worth a future cleanup bundle.**

Human Verdict: magnitude PASS (no hero number); reversibility CENTRAL (this IS the persistence path). INDIVIDUAL push approval, John reads it.

## ACTIONS FOR JOHN (in order)
1. **`cd slyght-worker && npx wrangler deploy`** — worker FIRST (backward-compatible; no window where a gzip client hits an old worker).
2. Push the branch / merge to main → GitHub Pages serves the new client. (Cache disease #51 may need a PWA reinstall to pick up new index.html until Bundle 33-cache.)
3. **ACID TEST:** change state on the S23 (>64KB, any state qualifies), background the app, then pull KV — if it reflects the backgrounded state, push works. Also: a dropped push now leaves a trace in `localStorage['slyght_push_status']`.
4. Watch the `Content-Encoding` CORS preflight on-device — if the gzipped POST is blocked, the worker's allow-headers already includes `Content-Encoding` (this commit), so it should pass; confirm.

## Branch note
`push-reliability-fix` is off `main`; `walk-and-judge-foundation` (d788d08, 5aeac5e) is separate/unpushed. JOHN-KNOWLEDGE diverges between branches (judge-by-role on walk-and-judge; gzip/debounce here) — additive entries, clean merge.
