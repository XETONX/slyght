# ADR — Bundle 32 Phase A — Device-token auth + KV namespacing

**Status:** Accepted
**Date:** 2026-05-20
**Bundle:** Phase A (closes the no-auth window opened by Bundle 32a)
**Authoritative spec:** `SECURITY.md` § "Phase A — Device identity & isolation"
**Related:** ADR-bundle-32a-push-on-save-and-fixture-freshness.md · `slyght-worker/src/index.js`

---

## Context

Bundle 32a shipped full-state push to worker KV with CORS-only protection. The 2026-05-20 decision log entry in SECURITY.md accepted this risk on a <1 week budget. Phase A closes that window.

SECURITY.md spec is locked: 256-bit token in `localStorage['slyght_device_token']`, sha256(token) namespaces KV, every endpoint requires a Bearer token, one-shot migration of pre-Phase-A state to bootstrap device. Out of scope: E2E encryption (Phase B), OAuth (Phase C), login UI, rotation, revocation, rate limiting, audit log.

This ADR documents the values calls and architectural decisions made during execution.

## Decisions

### Token shape (locked by SECURITY.md, documented here for archaeology)

- **256 bits, not 128.** 128 is sufficient for unguessable; 256 matches AES-256 strength and gives forward compat with future cryptographic uses. 4 bytes of cost for symmetry with industry defaults.
- **base64url, not hex.** Hex would be 64 chars; base64url is 43. Shorter URLs (not that we put it in URLs), smaller localStorage footprint, marginally tidier in DevTools. base64url (not standard base64) because URL-safe characters only — no `+/=` to escape if it ever ends up in a header/query.
- **Persisted to localStorage, not sessionStorage or IndexedDB.** localStorage matches the rest of slyght's persistence model (`slyght_v5`, `slyght_seeded_v*`); same survival semantics for PWA reinstall (none — both wipe). IndexedDB would survive cache clears better but adds complexity. SessionStorage drops on tab close — wrong shape.

### Hashing
- **sha256, not sha1 or HMAC.** sha256 is the modern default; sha1 has known collision attacks. HMAC requires a key — Phase A doesn't have one (no worker secrets used for auth). Plain sha256 of the token is sufficient as a one-way identifier from token to KV namespace.
- **Hex output, not bytes/base64url.** sha256 hex is 64 chars; KV keys are strings; the namespace prefix `device:{64chars}:state` is human-readable in Cloudflare's KV browser. base64url would save 22 chars per key but obscures inspection.

### Generation timing
- **Lazy, not eager.** First call to `getDeviceToken()` triggers generation. Boot does not block on crypto work. Early-boot `save()` calls (which run before PUSH is loaded) skip the push hook entirely; no token need exists at that moment. First push (30s after first save) triggers token gen.
- **Validation regex `^[A-Za-z0-9_-]{43}$`** — exact-length match, base64url charset. Anything else triggers silent regeneration. Recovers from manual tampering / partial deletes / encoding bugs without surfacing UI.

### Auth header placement
- **HTTP header `Authorization: Bearer {token}`, not URL/query.** Same posture as Anthropic/OAuth/standard bearer-token APIs. URL params would log in browser history / web server logs / referrer headers — never in URL.
- **`Bearer` prefix kept verbatim.** Standard format; future tooling expects it.
- **One source of truth: `getAuthHeader()` returns `'Bearer ' + getDeviceToken()`.** Every fetch site reads from this single function. Renaming or rotating the token implementation only touches one place.

### Worker auth shape
- **`requireDevice(req, env, corsHeaders)` returns `{hash, token}` or `{error: Response}`.** Single early-return pattern at the top of every protected endpoint. Mirrors CORS preflight pattern.
- **Bearer regex `^Bearer\s+([A-Za-z0-9_-]{20,})$`** on the worker side accepts 20+ chars (not strict 43) for forward compat. Phase B may extend token format (longer tokens, prefixed tokens); the regex tolerates this without redeploy.
- **Hash computed inline per request, not cached.** `sha256` on a 43-char string is sub-millisecond. KV namespace lookup dominates; caching the hash adds complexity for zero measurable benefit.

### Migration policy
- **Bootstrap-only inheritance.** Only the FIRST device to authenticate (when `devices:registered` is empty) inherits the pre-Phase-A bare-key state. Subsequent devices register but get empty namespaces. Rationale: pre-Phase-A KV state belongs to John's current phone; a second device authenticating later is by definition NOT John's main device and should not see his historical data.
- **Copy, do not delete.** Per Phase A scope, legacy bare keys are NOT removed after migration. Future bundles handle cleanup once migration is confirmed working end-to-end on John's real device.
- **Flag written LAST.** `device:{hash}:phase_a_migrated_v1` is set after all copies complete. Partial migration retries cleanly on next request.
- **Devices index `devices:registered`** is a JSON array stored at the bare key `devices:registered`. Used by cron to iterate all devices for notification dispatch. Single global key, not per-device.

### Cron handler iteration
- **Bootstrap fallback retained.** When `devices:registered` is empty (post-deploy but pre-first-auth window), the cron handler reads bare `state` + `push_subscription` so notifications keep firing. Window closes after first authenticated push triggers migration.
- **Per-device errors don't block siblings.** Each device's schedule runs in a try/catch; one device's bad state doesn't stop another's notification.

### Pagehide flush switched from sendBeacon to fetch + keepalive
- **sendBeacon can't carry custom headers.** Phase A requires Authorization header on every request including the flush. sendBeacon would 401.
- **fetch + keepalive: true** is the modern equivalent. Supports headers + survives tab close.
- **Browser policy limits cumulative keepalive bodies to ~64kB.** State pushes >64kB are rejected by browser before reaching network. Same failure mode as sendBeacon had for >64kB bodies (silently dropped). For typical state sizes (a few kB after a single save) the flush works correctly; for large pushes it falls back to "next session catches up" — acceptable degradation.
- **Bundle 32a smoke Case 5 updated** to verify the new path (fetch + keepalive + auth header) instead of sendBeacon. Test intent preserved.

### Endpoints protected
- **/sync, /push-full-state, /pull-full-state, /pull-full-state-meta, /subscribe, /dismiss, /status, /snapshot, /test, /unsubscribe** — all require Bearer + run migration.
- **/logs** — auth-required for access control, but `writeLog` continues to write to bare `push_logs` (logs are worker-side diagnostic, not user state). Multi-device log scoping is a Phase B concern.
- **/recon-payload** — keeps its existing ad-hoc query-param token (marked for ADR-E deprecation; Phase A does not dual-protect it).
- **`/` root** — unprotected health check. Returns `SLYGHT Worker OK`. Safe to keep open.

## Smoke coverage

`tests/smoke/phase-a-auth.smoke.js` — 15 cases across 5 SECURITY.md-spec'd categories:

1. **TOKEN_GEN_CORRECTNESS** (4 cases): first call generates · persistent across reload · corruption triggers regen · short/empty/wrong-length all regen
2. **AUTH_ENFORCEMENT** (3 cases): missing header → 401 · malformed header (Bearer empty, Basic, no prefix, too short) → 401 · valid → 200
3. **NAMESPACE_ISOLATION** (2 cases): two devices, two namespaces, cross-pull is 404 · KV keys all prefixed `device:{hash}:`, no bare writes from auth'd app
4. **MIGRATION_ONE_SHOT** (3 cases): bootstrap copies legacy keys + sets flag + preserves originals · re-run is no-op · second device does NOT inherit bootstrap
5. **GRACEFUL_DEGRADATION** (3 cases): worker unreachable → save() doesn't throw · worker 401 → pushFullState returns ok:false · token corruption mid-session recovers without nuking S

Tests use a stateful mock worker installed via `page.route` that mirrors the real worker's auth + KV behaviour one-for-one. No worker deploy required for smoke.

## Verification (all green)

- 127/127 smoke (was 112; +15 Phase A cases — Bundle 32a Case 5 modified for new keepalive path)
- 12/12 scenario-walk
- 4-layer Guardian PASS ("safe to push")
- Boot self-test +5 checks (getDeviceToken reachable · getAuthHeader returns Bearer · token persisted · token format valid · stable across calls)

## Worker deploy requirement

Worker source committed. John deploys via:
```bash
cd slyght-worker && npx wrangler deploy
```

**Pre-deploy state:** App's auth header is harmless (existing worker ignores it); push-on-save returns 200 from current worker; everything works as before. Phase A protection inactive.

**Post-deploy state:** Worker rejects unauth requests with 401. App sends Authorization header on every request → 200. First authenticated push triggers bootstrap migration: pre-Phase-A state copied into `device:{sha256(token)}:` namespace. Subsequent pushes scoped per-device.

**Both worker AND app must be on at least their respective Phase A commits for the auth to be enforced.** The app shipped today (~30f0141 + this commit) sends auth headers regardless; the deployed worker enforces them only after `wrangler deploy`. Mismatch directions:
- New app + old worker: works fine (worker ignores the extra header).
- Old app + new worker: fully blocked (every request 401s). User must reload after worker deploy to pick up the new app.

## Known gaps (Phase B scope)

- **No encryption at rest.** KV stores plaintext. Anyone with Cloudflare account access reads everything. Phase B adds client-side AES-GCM with passphrase-derived key.
- **No token rotation.** A leaked token is valid forever. Phase B adds rotation triggers + revocation list.
- **No rate limiting.** A compromised token can hammer the worker. Phase B adds per-token limits.
- **No audit log of writes.** Phase B adds a separate `SLYGHT_AUDIT` KV namespace with `{device_id_hash, endpoint, timestamp, payload_size}` retained 30 days.
- **No multi-user UI.** Architecturally supported (multiple device tokens, multiple namespaces), but the app has no concept of "this device" vs "John's other device." Single-user is intentional per slyght's design.
- **`/recon-payload` keeps its legacy query-param token.** Deprecation tracked separately (ADR-E).
- **Phase B may extend token format** to include device-name or version prefix. The worker's `>= 20 char` regex tolerates this without changes; app-side regex `{43}` is strict and would need an update at that time.

## Decision log entry (added to SECURITY.md)

Phase A shipped 2026-05-20. 127 smoke tests pass. Bootstrap migration verified via mock worker. Worker deploy pending John's action. No new decisions emerged during implementation that weren't already locked in SECURITY.md.

## Definition of done

- [x] All 15 Phase A smoke cases pass
- [x] Bundle 32a Case 5 updated + still passing (sendBeacon → fetch+keepalive)
- [x] 127/127 smoke
- [x] 12/12 scenario-walk
- [x] 4-layer Guardian PASS
- [x] Boot self-test +5 checks
- [x] Worker source committed (deployable by John via wrangler)
- [x] ADR, CHANGELOG, SECURITY.md decision log entry, handoff updates
- [ ] Worker deployed by John (`cd slyght-worker && npx wrangler deploy`)
- [ ] First authenticated push from John's phone triggers migration (verified end-to-end)
- [ ] Phase B section of SECURITY.md updated with any post-Phase-A learnings
