# CC Phase A prompt — device tokens + KV namespacing

## Read first (in this order, no skipping)

1. `SECURITY.md` Phase A section — authoritative spec. Scope boundaries are non-negotiable.
2. `slyght-worker/src/index.js` — focus on the `/push-full-state`, `/pull-full-state`, `/pull-full-state-meta` endpoints shipped in 30f0141. Phase A wraps auth around these.
3. `index.html` — `save()` at line 2337, `PUSH.pushFullState()` debounce scheduler shipped in 32a, boot self-test pattern.
4. `tests/intent-activation.smoke.js` and the 32a smoke spec — Phase A smoke specs mimic their shape.
5. `CHANGELOG.md` and Bundle 32a ADR — context on what just landed and why.

## What this bundle does

The window opens now. Bundle 32a shipped full-state push to KV without auth — accepted-risk per the 2026-05-20 decision log entry in SECURITY.md, time-boxed <1 week. Phase A closes that window.

Scope: every worker endpoint that touches user state requires a valid device token. KV state is namespaced per device. Existing single-user data migrates one-shot to a bootstrap device. The user never sees a login screen — token is silently generated, silently used.

Out of scope (per SECURITY.md Phase A boundaries):
- End-to-end encryption — that's Phase B, separate bundle
- OAuth, bank integration — Phase C, much later
- Login UI, passphrase entry — Phase B
- Token rotation, revocation lists, expiry — Phase B
- Rate limiting — Phase B
- Audit log — Phase B
- Multi-user UI — slyght stays single-user, architecture supports multi-device for same user but doesn't surface it

If you find yourself reaching for any of the above, stop and surface — that's Phase B/C scope leaking into Phase A.

## Apply the five-practice recipe

This is the third bundle in the pattern (Pass 2, 32a, now Phase A). Same execution discipline:

**1. Read the full picture before writing.** Before touching code, spawn an Explore agent in parallel with your own read of:
- Current worker endpoint shape — request validation, error response patterns, CORS handling, the exact `/push-full-state` and `/pull-full-state` implementations
- `save()` and `PUSH.pushFullState()` integration points in `index.html`
- localStorage shape — what keys exist, what migration touched in seedV25/26/27
- Boot self-test extension pattern from Bundle 32a — how to add the 5 new checks cleanly
- Any prior token/auth scaffolding (there shouldn't be any, but verify)

Ten parallel questions, just like Pass 2 and 32a. No surprises mid-implementation.

**2. Reuse proven patterns; don't invent.** Phase A's pieces should each feel like a sibling of something already shipped:
- Token generation: mimics the VAPID key generation pattern in `slyght-worker/src/keys.js` (256-bit random, base64url)
- localStorage key: follows the `slyght_v5`, `slyght_device_token` naming convention
- Worker auth middleware: mimics the existing CORS validation block shape (early-return on fail)
- KV key namespacing: follows the existing `SLYGHT_DATA` namespace conventions, just prefixes with `device:{sha256(token)}:`
- Migration: mimics `seedV27` line-for-line (IIFE · flag-gated via `slyght_phase_a_migrated_v1` · idempotent · audit log entry · localStorage atomic)
- Smoke spec: mimics `intent-activation.smoke.js` beforeEach + the 32a `/push-full-state` spec
- ADR: mimics the Pass 2 + 32a ADR shape, written during the work not after

**3. Build security into the design, not bolted on.** The token should be the SINGLE source of truth — `save()` reads it, every PUSH call reads it, the worker validates against it, the migration scopes against it, the boot self-test verifies it. Make missing-token unrepresentable in the type/flow rather than a runtime check. Make the wrong-namespace case impossible to write, not just unlikely.

Specifically: there should be ONE function that returns the auth header (`getAuthHeader()`), called by every push site. There should be ONE worker helper (`requireDevice(req)`) that returns the device ID hash or throws 401, called at the top of every protected endpoint. Anyone reading the code should see the auth boundary in one place.

**4. Smoke specs designed to catch what could go wrong, not just confirm what should go right.** Required smoke spec categories per SECURITY.md Phase A:

- **TOKEN_GEN_CORRECTNESS**: First-open generates 256-bit token, base64url encoded, persists across reload, never regenerates on subsequent opens. Specifically test: regenerate would silently wipe KV namespace — catch that.
- **AUTH_ENFORCEMENT**: Missing header → 401. Malformed header → 401. Unknown token → 401. Valid token → 200. Specifically test: empty string token, token with wrong base64 padding, token from a different user's KV — catch all the edge cases that "looks valid but isn't."
- **NAMESPACE_ISOLATION**: Two different tokens write to two different KV keys; one cannot read the other's data even with a crafted GET. Specifically test: device A writes state, device B tries to pull device A's state by guessing the namespace — must fail.
- **MIGRATION_ONE_SHOT**: Existing pre-Phase-A KV state migrates to bootstrap device token on first authenticated request. Migration runs exactly once (test by running twice in sequence — second run is no-op). `phase_a_migrated_v1` flag prevents re-run. Pre-migration state is preserved (no data loss).
- **GRACEFUL_DEGRADATION**: Worker unreachable → app continues to work locally without push (no UI errors, no console errors that block UX, no failed save()). Worker returns 401 unexpectedly → same. Token corrupted in localStorage → regenerates cleanly without nuking user state.

Each smoke spec should have at least one test specifically aimed at catching what would go wrong if implemented sloppily. Like Pass 2's Case 10 caught the timezone bug — design tests as bug hunters.

**5. Document the values calls WHILE making them.** Write the ADR during the work. Every "I chose X because Y" — token length (why 256 not 128), hashing algorithm (why sha256 not sha1), localStorage key name, migration trigger point, what happens on token corruption — into the ADR as it happens. Update CHANGELOG in the same commit. Update SECURITY.md decision log with Phase A ship entry: date, smoke pass count, any decisions that emerged during implementation.

## Values calls anticipated

Most decisions are locked by SECURITY.md. A few may surface during investigation:

- **Token corruption recovery** — if `slyght_device_token` is missing/malformed mid-session, regenerate silently and migrate the user's local data to the new device namespace on next push? Or surface a prompt? SECURITY.md says fail-silent. Lock that unless investigation reveals a reason otherwise.
- **Worker secret for HMAC** — Phase A doesn't require HMAC (token alone is sufficient since worker can hash it and check KV namespace), but if investigation reveals a reason to add signing now, surface before committing.
- **Token in URL vs header** — header only. Never in URL or query params (logs, referrer leakage). This is locked, no values call needed, but document the decision in the ADR.

If anything else surfaces that isn't covered by SECURITY.md, halt and surface to John before deciding.

## Worker source changes

You edit. John deploys via `wrangler deploy`. The app must fail-silent until the worker has Phase A live — same posture as Bundle 32a's `/push-full-state` endpoint waiting on deployment.

Build the migration to handle the "pre-Phase-A KV state still exists" case explicitly. The first authenticated push from John's actual device after `wrangler deploy` triggers the one-shot migration. Until then, the old non-namespaced keys remain in KV (untouched, not deleted). After migration confirms, future bundles can clean up the pre-migration keys — but Phase A doesn't delete anything.

## Ship criteria (all required)

- All 5 smoke spec categories pass
- Scenario-walk 12/12 still green (no regression)
- Guardian 4-layer PASS
- Boot self-test extended +5 checks: token exists, token format valid, auth header builds, worker auth roundtrip succeeds OR worker unreachable handled cleanly, migration flag check
- Worker source changes committed (deployable by John via wrangler)
- ADR written, CHANGELOG updated, SECURITY.md decision log entry added — all in the same commit as the code
- App on John's phone continues to function locally with worker NOT yet deployed (graceful degradation verified)
- App on John's phone migrates cleanly on first push AFTER worker deployed (one-shot migration verified)

## Surface back to John when

- Phase A is ready for deployment (commit pushed, wrangler deploy required from John's machine)
- Investigation reveals something out of scope that needs decision
- Migration design has a values call SECURITY.md doesn't already lock
- Smoke spec uncovers a Phase B concern that surfaces during Phase A work (note it, don't fix it, flag for Phase B)
- Anything weird

## Fixture state

Tested against the May 19 fixture for Pass 2 + 32a. By the time Phase A ships, the fixture workflow loop should close once John runs `wrangler deploy` for the 32a endpoints — first `npm run smoke` after that pulls fresh state.

For Phase A specifically: the smoke specs must work against BOTH the May 19 fixture (pre-32a-deploy) AND the post-deploy fresh-pulled state. Don't assume which side of deployment Phase A runs on.

Numeric paths touched: token generation, auth middleware, all push/pull endpoints, save() integration, boot self-test.

## After Phase A ships

Phase B section of SECURITY.md gets updated with any learnings — particularly: did anything in Phase A reveal Phase B scope that wasn't already there? Note for future reference.

Pass 3 consumer migration (deferred during fixture workflow + Phase A) becomes next. Phase G remaining migrations still queued.

---

**Execute autonomously per the autonomy contract in CLAUDE.md §11. Same discipline as Pass 2 and 32a. Lock the security window.**
