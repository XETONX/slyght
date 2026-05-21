# slyght — Security Roadmap

**Status as of 2026-05-20:** Pre-Phase-A. Worker is CORS-only, no auth, single-user PWA on John's phone.

This document is the canonical security roadmap. Every commit touching auth, data transmission, storage, or external integration must reconcile with this doc. If a change conflicts with the phase order or stated boundaries, the change is rejected or this doc is amended explicitly.

Read order: [Threat model](#threat-model) → [Current posture](#current-posture) → [Phase A/B/C](#phases) → [Decision log](#decision-log).

---

## Threat model

slyght holds the full picture of John's personal finances: balance, transactions, debts (including who he owes and how much), income, bills, future goals, trip plans, and behavioral patterns. The threat model is sized to this data sensitivity.

### Assets

| Asset | Sensitivity | Where it lives |
|---|---|---|
| Transaction history | High — reveals merchants, frequency, places | localStorage (`slyght_v5`), eventually KV |
| Balance + cycle state | High — wealth signal | localStorage, KV |
| Debt records | Very high — names individuals (Mum, Michael) and amounts | localStorage, KV |
| Bill schedule | Medium — utility/provider names + amounts | localStorage, KV |
| Goal & trip data | Medium — life plans, travel dates, destinations | localStorage, KV |
| Bank credentials | NEVER STORED — slyght must never hold these (see Phase C) | n/a |
| OAuth tokens (future) | Critical — when Phase C lands | Must be encrypted at rest |
| Device token | Critical — authenticates the device to worker | localStorage (Phase A onward) |

### Adversaries

1. **Opportunistic internet scanners** — bots probing public endpoints. Current worker is on the public internet; any unauthenticated endpoint is in scope.
2. **Targeted attacker with knowledge of slyght** — someone who reads the GitHub repo source, finds the worker URL, knows the data shape. Realistic given the repo is public.
3. **Cloudflare account compromise** — if John's CF credentials are leaked, KV is fully readable.
4. **Device compromise** — phone stolen, laptop lost. localStorage readable by anyone with physical access.
5. **Lost device** — recovery scenario. Without a recovery mechanism, the device token is the only key to John's data on the worker.
6. **Future: malicious data recipient** — when Phase C integrates Basiq/CDR, a compromise of that pipeline could leak bank data. Slyght's job is to never store or transmit bank credentials and to treat downstream services as untrusted.

### Non-goals

- slyght is not protecting against state-level adversaries.
- slyght is not HIPAA, PCI-DSS, or SOC 2 compliant — that's not the threat model.
- slyght does not need to defend against John himself (no anti-tampering, no audit-trail for the user's own actions).

---

## Current posture

**As of 2026-05-20:**

- App runs as single-user PWA at `xetonx.github.io/slyght`.
- Data lives in `localStorage` under key `slyght_v5` (single JSON blob ~50-200kb).
- Cloudflare Worker at `slyght-worker.johndounas.workers.dev` accepts POST to `/sync` (curated 20-field subset for push notifications) and a few read endpoints.
- KV namespace `SLYGHT_DATA` (id `a4ca2cafcf4743769d08ea5c0999f046`) stores worker-side state.
- VAPID push: keys regenerated post-Bundle-30 bug fix, encryption RFC 8291 compliant.
- Worker access: CORS-restricted to `xetonx.github.io` origin.
- No authentication. No device identity. No encryption at rest. No rate limiting. No audit log.

**What this means in practice:**

- CORS is theater for server-to-server attackers. Browsers honor it; `curl` and Node scripts spoof the Origin header trivially.
- The worker URL is in the client-side JavaScript, viewable by anyone who opens DevTools.
- If a second user ever uses slyght, they share the same KV namespace with no isolation.
- KV data is plaintext readable by anyone with Cloudflare account access.

**This posture is acceptable for now because:**

1. Slyght is single-user (John only).
2. Data sensitivity is high but the attack surface is small (one app, one user, no public discovery).
3. No bank integration yet — no credentials at risk.
4. Phase A is queued as the next bundle after fixture workflow lands.

**This posture is NOT acceptable for:**

- Sharing slyght with another person (even partner, even family).
- Bank integration.
- Any feature that pushes more data into KV than the curated /sync subset (e.g. the fixture workflow's full-state push).

---

## Phases

The phase progression is **non-negotiable order**. You cannot skip Phase A to get to Phase C. Each phase is a complete bundle with its own substrate, smoke specs, and invariants.

### Phase A — Device identity & isolation

**Goal:** Worker stops being a public dropbox. Every endpoint requires a valid device token. KV state is namespaced per device.

**Scope:**

- Device token generated on first app open (256-bit random, base64url encoded).
- Token stored in `localStorage` under key `slyght_device_token`.
- Token sent in `Authorization: Bearer {token}` header on every worker request.
- Worker validates token: rejects with 401 if missing, malformed, or unknown.
- KV keys namespaced: `device:{sha256(token)}:state`, `device:{...}:bills`, etc. Single global keys deprecated.
- Migration: existing single-user state migrated to bootstrap device on first authenticated request. Migration is one-shot, idempotent, logged.
- Worker source change committed to repo. John deploys via `wrangler deploy`.
- Client-side fail-silent: if worker rejects or is unreachable, app continues to work locally without push. No blocking errors in UI.
- Smoke specs:
  - Token generated on first open is 256 bits, base64url, persistent across reloads
  - Valid token authenticates; missing/malformed/unknown token returns 401
  - Two different tokens get two different KV namespaces (isolation test)
  - Migration runs once on bootstrap token, sets a `migrated_v1: true` marker, never runs again
  - All existing /sync calls continue to work after migration
- Boot self-test: device token exists OR is created; auth roundtrip to worker succeeds.

**Boundaries (out of scope for Phase A):**

- No end-to-end encryption (Phase B).
- No OAuth, no bank credentials (Phase C).
- No multi-user UI — slyght stays single-user, the token is invisible to the user. Multi-device for same-user is supported architecturally but not surfaced.
- No token rotation, no revocation list, no expiry. (Phase B adds these.)
- No login screen — token is silently generated and silently used.

**Failure modes Phase A explicitly does NOT prevent:**

- Stolen phone → attacker has the device token in localStorage → can pull state from KV. **Mitigation in Phase B (E2E encryption with passphrase).**
- Cloudflare account compromise → KV plaintext readable. **Mitigation in Phase B.**
- Token leak via DevTools screenshot, bug report, etc. → attacker has full access until token is revoked. **Mitigation in Phase B (rotation, revocation).**

**Done when:**

- All 5 smoke spec categories pass.
- Worker deployed with auth required.
- Existing app continues to function for John without UI changes.
- One-shot migration verified on John's actual data.
- Phase B section of this doc updated with any learnings.

---

### Phase B — Encryption at rest & operational hygiene

**Goal:** Worker becomes encrypted-blob storage. KV stores ciphertext only. Slyght can recover from a token leak without data exposure.

**Scope:**

- Encryption key derived client-side from a user-set passphrase via PBKDF2 (≥ 100k iterations) or argon2id.
- All state pushed to KV is encrypted client-side with AES-256-GCM using the derived key.
- Worker can read ciphertext but cannot decrypt. Worker becomes a dumb storage layer.
- Passphrase NEVER transmitted. Only the derived key never leaves the device.
- On new device setup, user enters passphrase → derives key → decrypts pulled state.
- Token rotation: on user trigger ("rotate device key") or on suspicious activity (auth failures, rate-limit hits).
- Revocation list: worker maintains a set of revoked tokens, rejects on match. Survives KV restart.
- Rate limiting per device token: e.g. 60 writes/min, 600 reads/min.
- Audit log: every worker write logs `{device_id_hash, endpoint, timestamp, payload_size}` to a separate KV namespace. No payload contents. Retained 30 days.
- Smoke specs:
  - Passphrase derivation produces consistent key from same input
  - Encrypt → push → pull → decrypt round-trips correctly
  - Wrong passphrase fails to decrypt cleanly (no partial leak)
  - Revoked token returns 401 even if cryptographically valid
  - Rate limit triggers at the documented threshold
  - Audit log records writes without payload contents

**Boundaries:**

- Phase B is NOT bank integration. No third-party APIs introduced.
- Passphrase recovery is user's responsibility — slyght does not store recovery questions, email-based reset, or any other recovery mechanism. If passphrase is lost, KV state is unrecoverable (user re-bootstraps from local data).
- Encryption applies to data pushed to worker. Local-only data in localStorage is NOT encrypted — phone OS provides the boundary there. If that's insufficient, Phase B+ adds local encryption.

**Done when:**

- All Phase A boundaries still hold.
- All Phase B smoke specs pass.
- John has set a passphrase and verified the encrypt/decrypt round-trip on real data.
- Worker logs confirm no plaintext payloads in audit log.
- Decision documented in repo: which symmetric cipher, which KDF, which iteration count, and why.

---

### Phase C — Bank integration via accredited aggregator

**Goal:** Slyght reads transaction data from John's bank without ever touching bank credentials. Integration is one-way (bank → slyght). Slyght is read-only with respect to the bank.

**Strict principles:**

1. **Slyght never stores bank credentials.** Not username, not password, not security questions, not OTP codes. Ever.
2. **All bank authentication happens in an accredited third party's flow** — Basiq, Frollo, Akahu, or direct CDR via an accredited recipient. The user is redirected to the bank's OAuth page, authenticates there, and slyght receives a token.
3. **Slyght holds OAuth tokens encrypted** under the Phase B encryption layer. Tokens are refreshed properly, expired tokens are deleted.
4. **Sync is read-only.** Slyght never writes to the bank. No payment initiation. No transfer authorization.
5. **CDR compliance** — Slyght either operates under Basiq's accreditation umbrella (Trusted Adviser, Outsourced Service Provider, or similar) or registers as an Accredited Data Recipient itself. The latter is a multi-month process and significant cost; the former is what most small AU fintechs use.

**Scope (one-time setup):**

- Choose aggregator: Basiq is the default recommendation for AU. Akahu for NZ. Frollo for higher-volume.
- Register slyght with the aggregator. Receive API credentials (stored in worker secrets via `wrangler secret put`, never in client code).
- Implement aggregator OAuth flow in slyght:
  1. User taps "Connect bank" → redirected to aggregator's hosted flow.
  2. User authenticates at bank → aggregator receives consent → returns to slyght with one-time code.
  3. Slyght exchanges code for access token via worker → encrypts token → stores under device namespace.
- Implement transaction sync:
  - Worker-side scheduled job (cron trigger) pulls transactions for each connected device daily.
  - Worker sends notification to device when new transactions are available.
  - Device pulls encrypted blob, decrypts client-side, reconciles with local state.
- Implement transaction reconciliation:
  - Match bank transactions against slyght's logged transactions (merchant + amount + date).
  - Surface unmatched bank transactions for user to categorize.
  - Surface slyght-logged transactions that don't appear in bank feed (suspicious — may indicate forgotten or duplicate logging).

**Boundaries:**

- No write-side bank integration. No "pay this bill from slyght" feature. Ever, unless the threat model is re-evaluated.
- No cross-account transfers initiated from slyght.
- No PFM-style "categorize all my transactions automatically using ML" without user review — auto-categorization is suggestion only.
- No sharing of bank data with third parties (analytics services, AI providers, anything). Bank data stays within slyght's encrypted boundary.

**Compliance considerations:**

- Read AU CDR rules before implementing — particularly around consent duration (default 12 months), data retention (must delete on consent revocation), and disclosure requirements.
- Privacy Policy must be published before any bank integration goes live.
- Terms of Service required.
- Data Breach Response Plan required — what slyght does if a leak is detected, how users are notified, what timelines apply.
- If slyght has multiple users at this point, consider a security audit / pen test (~$3-5k AUD) before going live.

**Done when:**

- User can connect their bank via aggregator and pull transaction history.
- Transactions reconcile against logged transactions correctly.
- Consent can be revoked, and revocation deletes the access token and removes scheduled syncs.
- All Phase A and B boundaries still hold.
- Compliance documents (Privacy Policy, ToS, Breach Plan) published.
- John has verified the round-trip on his own Virgin Money account.

---

## Decision log

Material security decisions, dated.

### 2026-05-20 — Phase A queued, Option Y chosen for fixture workflow

CC flagged at the start of fixture workflow work (Bundle 32.3 Pass 2 morning surface): *"no auth on worker, full state push without device tokens is out of scope here."*

Decision: Continue fixture workflow (1+2+4) without auth. Phase A becomes the immediately-next bundle after fixture work completes.

Rationale:
- Fixture workflow scope is bounded (~2hr).
- Window of "full state in unauthenticated KV" is days, not weeks.
- Phase A as a focused single bundle gets the substrate-first treatment it deserves, rather than being smushed into fixture workflow scope creep.
- The data was already in KV via /sync (curated subset). Fixture workflow widens this, but the risk class is unchanged.

Risk accepted: For the window between fixture workflow shipping and Phase A landing, the worker accepts full state pushes from any caller that spoofs the Origin header. Mitigations: keep the window short (<1 week target); monitor Cloudflare worker logs for anomalous traffic; if anything suspicious shows up, kill the endpoint via `wrangler` until Phase A ships.

### 2026-05-20 — Phase A SHIPPED

Implementation per the phase spec above. Single commit; worker source committed to repo, deploy via `wrangler deploy` (John's action).

**Verification:**
- 15 Phase A smoke cases pass (TOKEN_GEN_CORRECTNESS · AUTH_ENFORCEMENT · NAMESPACE_ISOLATION · MIGRATION_ONE_SHOT · GRACEFUL_DEGRADATION)
- 127/127 full smoke suite (was 112; +15)
- 12/12 scenario-walk
- 4-layer Guardian PASS
- Boot self-test extended by 5 checks

**Decisions that emerged during implementation (no new values calls; all already locked in spec):**
- Bootstrap-only inheritance — only first device to authenticate inherits pre-Phase-A bare-key state
- Migration flag written LAST for partial-migration retry safety
- `push_logs` remains global (worker diagnostics, not user state) — multi-device log scoping is Phase B
- `_flushPushFullState` switched from `navigator.sendBeacon` to `fetch + keepalive: true` so the Authorization header carries on pagehide

**Window closed:** The no-auth full-state push window opened by Bundle 32a is now closed (pending John's `wrangler deploy`). Pre-deploy state: app sends auth headers, worker ignores them — no regression. Post-deploy: 401 on unauth, automatic bootstrap migration on first auth.

**Phase B prerequisites met:** Auth + namespacing substrate is in place. Phase B (encryption at rest, rotation, revocation, rate limiting, audit log) can build on Phase A's `device:{hash}:` KV key shape.

ADR: `docs/adr/ADR-bundle-32-phase-a-device-tokens.md`.

### 2026-05-21 — Theme G secret migration (F7 OWM + F8 RECON_TOKEN)

Beast-mode sweep flagged two genuine secrets in committed code. Both shipped today.

**F7 — OpenWeatherMap API key** (`7fb97ad9...` previously at `index.html:18409`):
- Rotated at OWM dashboard. New key stored as worker secret via `wrangler secret put OWM_API_KEY`.
- New worker endpoint `GET /weather?lat=&lon=` reads `env.OWM_API_KEY`, fetches OWM, caches trimmed response in `SLYGHT_DATA` with 10-min TTL (key shape `weather:cache:{lat-1dp},{lon-1dp}`). No auth required — endpoint returns generic forecast data, no user state. CORS-restricted to `xetonx.github.io`.
- Client `WEATHER.fetch()` now calls the proxy. `WEATHER.apiKey` field removed. Response shape changed from raw OWM JSON to trimmed `{temp, feels_like, condition, description, wind_speed, ts}`.
- Old key revocation deferred until phone-verify confirms new flow works (OWM has ~10-min propagation; concurrent active keys during the transition is intentional).

**F8 — RECON_TOKEN** (`427169922a...` previously at `slyght-worker/src/index.js:428` + `index.html:13964`):
- Endpoint deleted entirely rather than rotated. `/recon-payload` was a one-shot Bundle 30.6 reconciliation import path (May 19 bank reconciliation). Functionally redundant with the Phase A device-token-authenticated `/pull-full-state`. Deletion beats rotation.
- Worker handler removed.
- Client `_emergencyImportFromWorker` + `_showCurrentReconState` + `_rollbackReconImport` + boot-check handler + Settings UI block all removed (206 lines of one-shot reconciliation infrastructure).

**Smoke coverage:** `tests/smoke/weather-proxy.smoke.js` (6 cases) — no `apiKey` field on WEATHER; client hits proxy not OWM direct; no `appid=` in any request URL; trimmed response parses correctly; network-error falls back to cache; 503 falls back gracefully.

**Git history scrub deferred** — both rotated values are inert post-rotation. Recommend BFG or `git filter-repo` as a single force-push event when convenient. CC does not autonomously rewrite history.

**Action remaining (John):** `cd slyght-worker && npx wrangler deploy` to activate the new worker. Pre-deploy: client calls 404 on `/weather` (graceful fallback to cached weather). Post-deploy: weather chip works through the proxy. Phone-verify on 380px.

### YYYY-MM-DD — [next decision goes here]

---

## Non-negotiables

These hold across all phases. Any change here requires explicit John approval, documented in the decision log.

1. **Slyght never stores bank credentials.** Username, password, OTP, security questions — none.
2. **Slyght never initiates payments or transfers.** Read-only with respect to financial accounts.
3. **Slyght never shares user data with third-party services without explicit per-feature consent** — analytics, AI providers, telemetry. If a feature requires sending data outside the slyght boundary, the user must opt in and the data leaving must be documented.
4. **Worker source is in the repo.** No private worker code. Everything that runs on the server is auditable.
5. **Encryption keys never leave the device.** Passphrase-derived keys live only in memory and never transit to the worker.
6. **No silent telemetry.** If slyght ever sends usage data to Anthropic or anyone else, the user is told explicitly and given an opt-out at first use.

---

## Open questions

Tracked here, resolved as decisions are made.

- **Q1:** When Phase B passphrase is introduced, what's the UX for an existing user who has been on Phase A without one? Forced passphrase set on next app open, or grandfather-in?
- **Q2:** Phase B's revocation list — backed by KV (durable) or in-memory (loses state on worker restart)? KV adds latency to every auth check; memory is cheap but fragile.
- **Q3:** Phase C aggregator choice — Basiq is the default, but is John willing to pay their per-call pricing as slyght's usage grows? Alternative is Frollo (more enterprise) or going direct CDR (multi-month accreditation).
- **Q4:** Phase C reconciliation conflicts — when bank transaction and logged transaction disagree (e.g. amounts differ slightly due to currency conversion), which wins?

---

## File map

- This doc: `SECURITY.md` (root of repo)
- Worker source: `slyght-worker/src/index.js`
- KV namespace config: `slyght-worker/wrangler.toml`
- VAPID keys + secrets: `wrangler secret list` (never committed)
- Auth token storage (Phase A onward): `localStorage['slyght_device_token']`
- Encryption passphrase: never stored — derived on demand from user input (Phase B onward)
- Audit log: separate KV namespace `SLYGHT_AUDIT` (Phase B onward)

---

*This is a living document. Every commit touching auth, encryption, transmission, storage, or external integration must reconcile with this doc. Disagreements resolve here first, then in code.*
