# ADR — Bundle 32a — Push-on-save → worker-KV + auto-pull smoke

**Status:** Accepted
**Date:** 2026-05-20
**Bundle:** 32a (interstitial substrate ahead of Bundle 33 AI-layer migration)
**John's directive:** Option pick 1 + 2 + 4 from the morning surface staleness proposal
**Related:** ADR-bundle-32-3-forecast-trip-uplift.md · `slyght-worker/src/index.js` · `scripts/recon/pull-from-kv.js`

---

## Context

State-snapshot.json drift compounds. The app gets used between code changes; the fixture goes stale; smoke tests pass against synthetic state that doesn't match what John sees on reload. Bundle 31 caught this once when 5 latent specs slept under an out-of-date fixture and only woke up after the post-reconciliation refresh.

Pass 2 ship surfaced the same problem with a sharper edge: the "+$675 forecast impact" estimate had to be caveated against John's actual phone state. We can't auto-pull because the existing pull script (`scripts/recon/dump-state.js`) requires John to manually export from the app first.

John picked 3 of 4 proposed mitigations as a package:
1. **Push-on-save from app → worker-KV** (debounced 30s upload after every `save()`)
2. **`npm run smoke` auto-pulls fresh** before running Playwright
3. ~~Guardian fixture-age rule~~ (skipped — option #3 not chosen)
4. **State-aware morning-surface contract** (codified in CLAUDE.md §8)

## Decision

### Worker side — 3 new endpoints
- `POST /push-full-state` — accepts `{S, BILLS}` blob, writes to KV key `state-full-snapshot` plus meta key `state-full-meta` (lastPushedAt, byteSize, txnCount, planIntentCount, balance, billsCount).
- `GET /pull-full-state` — returns the blob JSON with `X-Slyght-Last-Pushed-At` and `X-Slyght-Byte-Size` response headers. 404 if app has never pushed.
- `GET /pull-full-state-meta` — diagnostic for fixture-age checks without downloading 200kB.

CORS posture: matches existing `/sync` (only `https://xetonx.github.io`). Browsers from other origins blocked; Node fetch (dev script) ignores CORS.

### App side — three hooks (no UI work)
- **`PUSH.pushFullState()`** — new method on PUSH object. Reads `localStorage['slyght_v5']` directly (canonical blob, no in-memory drift), POSTs to `/push-full-state`. Silent-fail by design (returns `{ok:false}`; doesn't throw).
- **Debounced hook in `save()`** — `_schedulePushFullState()` called after the localStorage write. 30s setTimeout; rapid saves collapse to one pending timer (each new call cancels prior via `clearTimeout`). Module-level handle: `_pushFullStateTimer` + `_pushFullStatePending`. Default ENABLED; opt-out via `S.pushOnSaveEnabled = false` (console-set; no UI yet).
- **`pagehide` + `beforeunload` flush** — `_flushPushFullState` clears the timer and fires `navigator.sendBeacon` (fire-and-forget POST that survives tab close). Best-effort delivery; localStorage is authoritative.

### Dev side — pull script + npm wrapping
- **`scripts/recon/pull-from-kv.js`** — Node script: GET /pull-full-state, validate shape, write atomically to `state-snapshot.json` (write to `.tmp` then `rename`). Prints diff vs prior (txn count, balance, intent count). **Graceful degradation**: network error / 404 / bad shape → WARN + keep existing fixture (so smoke can still run). Only EXIT 2 if there's no existing fixture AND pull fails. Override via `SKIP_FRESH_FIXTURE=1` env.
- **`npm run fixture:fresh`** — alias for the pull script.
- **`npm run smoke`** — now runs `fixture:fresh && playwright test --config=...`.
- **`npm run smoke:offline`** — direct Playwright invocation, skips pull. For offline dev or when worker is mid-deploy.

### Documentation — CLAUDE.md §8
- Existing "Fixture currency" rule extended to name `npm run fixture:fresh` as the canonical refresh.
- New "State-aware ship messages" rule: every ship message must state fixture date, whether fresh-pull ran, and an impact-estimate caveat when numeric paths touched.

## Auth posture (known weakness)

CORS-only protection. Matches existing `/sync` endpoint, which has been live since the worker was deployed. Threat model unchanged: anyone who forges an Origin header (trivial via curl) can write to worker KV.

For `/push-full-state` the blast radius is wider — full state including all txns + balances + debts vs. /sync's curated 20 fields. But:
- Worker URL is public (in the GitHub Pages bundle source).
- App is single-user. Any compromise of John's state requires already knowing the worker URL.
- A corrupted KV blob would manifest as a smoke fixture that disagrees with John's phone — would be caught at the next morning-surface fixture-age check.
- VAPID secrets remain inside the worker (in `env.VAPID_*` — wrangler secrets); not exposed via the new endpoints.

Proper auth needs device-issued tokens that survive PWA reinstall — a Bundle 33-ish substrate. Tracked as follow-up.

## Failure modes (intentional design)

| Failure | App behaviour | Dev behaviour |
|---|---|---|
| Worker unreachable | save() returns normally; localStorage authoritative; push timer fires, fetch rejects, swallowed | `fixture:fresh` warns + keeps existing fixture; smoke runs against stale |
| Worker endpoint missing (pre-deploy) | Same as above (worker returns 404 for the endpoint) | Same as above |
| 4xx from worker | pushFullState returns `{ok:false, status}`; no retry, no toast | Same |
| User exits within 30s debounce | `pagehide` flush fires sendBeacon — best-effort delivery | (n/a) |
| KV blob corrupted on pull | `fixture:fresh` validates `.S` + `.BILLS`; rejects bad shape; keeps existing | Smoke continues against stale |
| No existing fixture AND pull fails | (n/a) | `fixture:fresh` EXIT 2; smoke cannot start |

## Worker deploy requirement

**The new endpoints don't exist until John runs:**
```bash
cd slyght-worker
npx wrangler deploy
```

Until then:
- App's push-on-save fires every 30s after a save; receives 404 from `/push-full-state`; silently swallows.
- `npm run smoke` runs `fixture:fresh`; pull returns 404; warns + keeps existing state-snapshot.json; Playwright runs against existing fixture (no regression from prior behaviour).

**Net effect of pre-deploy state: no behaviour change.** Post-deploy: fixture auto-refreshes before every smoke; push silently mirrors state on every save.

## Verification

- 112/112 smoke (was 104; +8 new push-on-save cases)
- 12/12 scenario-walk (single clean run, no flake)
- 4-layer Guardian PASS
- Boot self-test +4 checks (PUSH.pushFullState reachable, _schedulePushFullState, _flushPushFullState, pushOnSaveEnabled default behaviour)

### Smoke coverage — `tests/smoke/push-on-save.smoke.js` (8 cases)

1. PUSH.pushFullState callable + full {S, BILLS} payload shape
2. save() schedules debounced push (`_pushFullStatePending` becomes true)
3. Rapid saves consolidate — N calls → 1 pending timer (debounce works)
4. `S.pushOnSaveEnabled = false` suppresses scheduling
5. `_flushPushFullState` clears pending synchronously + uses sendBeacon
6. Boot self-tests for push-on-save pass
7. Silent-fail — network error in pushFullState does NOT throw (returns `{ok:false}`)
8. Payload distinct from `/sync` — contains canonical-only keys (`planIntents`, `savingsBuckets`, `debts`, `paidBills`); does NOT contain `/sync`-only fields (`maxDay`, `survivalMode`, `lastSync`)

## Future work (deferred)

- **Settings UI toggle** for `S.pushOnSaveEnabled` — small, ~30 min. Console-set today.
- **Guardian fixture-age rule** — emit ERROR (not WARN) when state-snapshot.json mtime > 24h AND touched files cross numeric paths (`getSurvivalForecast`, `BRAIN.balance.*`, `BRAIN.transaction.*`, `MODEL.*`). ~20 min. Option #3 of the original proposal.
- **Device-issued auth tokens** for the worker endpoints. Real auth, not just CORS. ~3-4hr.
- **Push compression** — gzip the 200kB blob before POST. Cloudflare Workers can decompress. Current 200kB is fine for the foreseeable future; revisit if state grows past 1MB.
- **Periodic backfill push** — boot-time idempotent push to ensure KV always has the latest after a long offline period. Currently relies on next save() triggering the hook. ~10 min.

## Definition of done

- [x] Worker `slyght-worker/src/index.js` has /push-full-state + /pull-full-state + /pull-full-state-meta endpoints
- [x] App `index.html` has PUSH.pushFullState, debounced save() hook, pagehide flush
- [x] `scripts/recon/pull-from-kv.js` shipped with graceful degradation
- [x] `package.json` smoke chain updated with smoke:offline escape hatch
- [x] CLAUDE.md §8 extended with both rules
- [x] `tests/smoke/push-on-save.smoke.js` (8 cases) shipping green
- [x] Full smoke + scenario + Guardian green
- [ ] **Worker deployed (John's action)** — `cd slyght-worker && npx wrangler deploy`
- [ ] First end-to-end fixture refresh (John uses app → wait 30s → `npm run fixture:fresh` from dev → state-snapshot.json updates)
