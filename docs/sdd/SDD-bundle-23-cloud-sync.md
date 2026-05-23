# SDD — Bundle 23 Cloud State Sync

**Status:** RE-SCOPED 2026-05-23 to "single-device total sync" after John's Q4 answer landed: phone PWA only, single device, one writer = no concurrent-write problem = no merge machinery needed. Drone pipeline output preserved as evidence; the v1/v2 framing it produced is superseded.

**Key insight:** Most of the drone-surfaced complexity (v2 per-field merge, Lamport clocks, intent dedup, conflict modal, `_device`/`_localId`, tombstones, server-side merge, `_remote:true` audit tagging) existed to solve **concurrent-write conflicts across multiple devices**. With single-writer reality, there are no conflicts. The hard problem evaporates.

**This SDD scopes:** Single-device total sync. Phone PWA pushes on save (built — Bundle 32a) + pulls on open with remote-if-newer apply (this build). About half v1's scope, fundamentally simpler. Build: own session, after Bundle 33-cache lands as soft prerequisite.

**Tip-of-main:** `7a1d5a8` (apiKey leak hotfix shipped pre-flight)

**Trigger:** John, 2026-05-23 — "include drones then build" Bundle 23 with maximum rigor ("this shit on lock"). Original Bundle 23 memory pin (11 days old, predates Phase A + Bundle 32a) was reframed by drone findings.

---

## 0. Read order

1. This doc
2. `ADR-H-tiered-build-pipeline.md` (6-tier pipeline + Human Verdict block — drove this SDD's rigor)
3. `SECURITY.md` (Phase A live; Phase B spec locked; this SDD adds carve-outs)
4. `docs/adr/ADR-bundle-32a-push-on-save-and-fixture-freshness.md` (the push-on-save substrate this builds on)
5. `docs/adr/ADR-bundle-32-phase-a-device-tokens.md` (auth + KV namespacing)
6. The 10 drone outputs (logged in session memory):
   - CS-A boot path / load() · CS-B push + freshness markers · CS-C conflict surface · CS-D multi-device join · CS-E UX + audit
   - R1 adversarial scenarios · R2 negative smoke specs · R3 version skew · R4 property invariants · R5 security audit

---

## 1. Mission (re-scoped 2026-05-23)

**Single-device total sync.** Close the dump-to-live drift; ensure John's phone PWA + worker-KV stay in lockstep across sessions, browser cache clears, and multi-tab usage on the same device.

**What done looks like:**
- App on boot pulls remote state; remote-if-newer applies, no-op otherwise
- Cache-wipe / new-install on same device + same token: pull hydrates state from KV
- Stale-device-resume: phone hasn't opened in weeks → opens → pulls newer KV state → state refreshes
- Multi-tab same-device: tabs converge to last-write-wins via BroadcastChannel
- Audit log captures every sync event
- Sync UX: silent on no-op; toast on remote-applied; modal on schema-version refusal

**Explicitly out of scope:**
- Multi-device JOIN flow (different tokens) — deferred to Bundle 24+/Phase D
- Concurrent-write conflict resolution — impossible scenario with single writer
- E2E encryption (deferred to Phase B as committed-next-bundle per `SECURITY.md` decision-log 2026-05-23)

---

## 2. Pre-flight (already shipped — commit `7a1d5a8`)

apiKey leak in `PUSH.pushFullState` was sending raw localStorage including `S.apiKey` to KV plaintext since Bundle 32a (2026-05-20). Closed via `NEVER_SYNC` deny-list mirroring `buildFullExport`'s pattern + 500kB size cap. Required follow-up: John rotates Anthropic API key (handled outside this SDD).

This established the `NEVER_SYNC` constant — single source of truth for fields that never traverse the device boundary. Bundle 23 v1 + v2 both reuse it.

---

## 3. Architectural reality (post-Phase A + Bundle 32a + this session)

What exists:
- Per-device token in `localStorage['slyght_device_token']`; auto-generated on first open
- KV namespaced per `device:{sha256(token)}` (Phase A)
- `POST /push-full-state` — debounced 30s after `save()`, fires from pagehide via `keepalive:true` (Bundle 32a)
- `GET /pull-full-state` + `GET /pull-full-state-meta` — auth-gated (Phase A)
- `SNAPSHOTS.take(reason)` system for state rollback (existing pattern at `index.html:17370`)
- `BRAIN.audit` event log with `appendReconLog` pattern (`index.html:20418`)
- `EDIT_MODAL.openCustom` for blocking confirms (~25+ call sites)
- `showToast` + `showUndoToast` for non-blocking notifications
- 30 boot-time migration sites (17 seedV* IIFEs + 13 load()-inline migrations) — R3 enumerated each

What's missing for Bundle 23:
- App-side pull-on-open
- Conflict resolution / merge logic
- Multi-device join flow
- Sync UX surface
- Audit integration for sync events
- Schema versioning + version-skew refusal

---

## 4. The architectural gap (R1 + R3 surfaced INDEPENDENTLY)

> **`/push-full-state` writes a WHOLE BLOB to a SINGLE KV key per device. Without server-side per-field merge OR an operation-log model, "field-level LWW" is fiction.**

R1 Scenario S3: Device A pushes at 09:00 (slow 3G, worker lands 09:02). Device B pushes at 09:01 (5G, lands 09:01). KV has B's blob, then A's blob overwrites it 1s later. **A had OLDER user-intent but later network-arrival** — last-network-wins, not last-edit-wins.

R3 Scenario C confirmed independently: same multi-device migration-race produces silent overwrite under current single-KV-key semantics.

**This is the binding architectural constraint.** Client-side merge logic cannot prevent multi-device concurrent-push data loss without server-side support.

**Implication:** Bundle 23 splits into v1 (single-device safe, client-side) and v2 (multi-device server-side merge).

---

## 5. Scope — single-device total sync + the cleanly-bounded follow-ons

| Layer | Scope | Status |
|---|---|---|
| **Pre-flight (shipped)** | apiKey leak fix + 500kB body cap | SHIPPED `7a1d5a8` |
| **Soft prerequisite** | Bundle 33-cache (sw.js precache + CACHE_VERSION + skipWaiting + controllerchange toast) | Lands before sync per John's order. Without it, sync logic may not propagate to phone reliably. |
| **THIS BUNDLE — Bundle 23 single-device sync** | Pull-on-open + remote-if-newer apply + SNAPSHOTS pre-pull + schema versioning + post-pull push suppression + multi-tab BroadcastChannel + sync UX + audit events + R5 defensive minimums (worker schema validation, prototype-pollution rejection, NEVER_SYNC on pull-apply) | Scope-locked 2026-05-23; build in own fresh session |
| **Committed next bundle** | Phase B encryption-at-rest (passphrase-derived key, AES-256-GCM, worker holds only ciphertext) per `SECURITY.md` Phase B spec | Per `SECURITY.md` 2026-05-23 decision-log entry: ships IMMEDIATELY after Bundle 23. Not "someday." |
| **Deferred (Bundle 24+/Phase D)** | Cross-device token-pairing flow (QR / paste / identity layer) | Out of single-device-sync scope. Reopens when John's usage actually goes multi-device. |

**Hard ordering recorded in `SECURITY.md` 2026-05-23:**
1. Bundle 33-cache (soft prerequisite for reliable code-delivery to phone)
2. Bundle 23 single-device sync (this SDD, 8 commits)
3. **Phase B encryption-at-rest** ← committed next architectural bundle

The "Phase B before any sync" rule from earlier in this session was rooted in multi-device exposure amplification (every device's push affects every other device's pull, multiplying any plaintext exposure). Single-writer reality doesn't have a device fleet to amplify across — the rule doesn't bind. But Phase B is needed for the plaintext that's ALREADY in KV regardless of sync; ordering pushes it to the next bundle, not the bundle-after-next.

**v1 delivers:**
- Lost-localStorage recovery (cache wiped, token survives via export/manual)
- Multi-tab freshness on same device (fresh tab pulls latest)
- Substrate for v2 (the bubble + freshness anchors + worker meta are exactly what v2 builds on)
- Visibility: audit logs remote-newer events without acting on them (forensic ground truth before any merge logic)

**v1 explicitly does NOT deliver:**
- Multi-device concurrent-push merge (deferred to v2)
- Cross-device JOIN flow with different tokens (deferred to Bundle 24+)
- Conflict-resolution UI (deferred to v2)

---

## 6. Single-device sync specification

### 6.1 Freshness anchor (CS-B)

**Add `S._lastSavedAt = Date.now()` inside `save()` at `index.html:2510`.**

- One-line addition + comment
- Travels with the blob automatically (push-on-save includes it)
- Migration: existing blobs lack the field; `|| 0` fallback on first compare

**Extend worker `state-full-meta` (slyght-worker/src/index.js)** to echo `lastSavedAt` from blob:
- Current meta fields: `lastPushedAt`, `byteSize`, `txnCount`, `planIntentCount`, `balance`, `billsCount`
- Add: `lastSavedAt` (from `body.S._lastSavedAt`)
- Add: `schemaVersion` (from `body.S._schemaVersion`)
- Returned in `X-Slyght-Last-Saved-At` + `X-Slyght-Schema-Version` headers on `/pull-full-state`

**Two-clock model:** `lastPushedAt` (server-stamped, diagnostic only) + `lastSavedAt` (device-stamped, comparison primitive). Clock-skew tolerance via Drone R1's recommendation: refuse silent overwrite if `|deviceClock − serverNow| > 60s`.

### 6.2 Schema versioning (R3)

```js
const SCHEMA_VERSION = 30;   // bump on every migration ship
```

- `save()` stamps `S._schemaVersion = SCHEMA_VERSION`
- Pull-on-open compares `remote._schemaVersion` vs local `SCHEMA_VERSION`
- If `remote > local` → REFUSE merge, toast: "Your slyght is out of date — close and reopen from the latest URL"
- If `remote < local` → apply remote; load()-inline migrations upgrade it
- New Guardian rule: any commit touching seedV* / load()-inline migration MUST bump `SCHEMA_VERSION`

### 6.3 `_device` + `_localId` migration — NOT NEEDED for single-device sync

Single writer = no cross-device collision = no need for device-stamped txn ids.

Deferred to multi-device JOIN bundle (24+/Phase D) if John's usage ever expands beyond single-device. For single-device-sync MVP, txn arrays replace wholesale; no merge needed.

This is the most significant scope reduction vs original v1: a full migration (~25 lines + smoke + idempotency check) drops entirely.

### 6.4 Pull-on-open orchestrator

**New BRAIN bubble:** `BRAIN.cloudSync` near the existing `PUSH` object.

API:
- `pullMeta()` — async, returns `{ok, meta, headers}` or `{ok:false, reason}`
- `pullFullState()` — async, returns `{ok, body}` or `{ok:false, reason}`
- `pullOnOpen()` — orchestrator: pullMeta → schemaVersion check → if local empty AND remote exists → SNAPSHOTS.take → pullFullState → sanitize → apply → audit → toast

**Insertion point (CS-A):** inside DOMContentLoaded+500ms handler at `index.html:14739`, AFTER `BRAIN.selfTest.run()` (~L14765), BEFORE autodebit-floor init at L14784.

Non-blocking against splash — splash stays John's escape hatch. Pull cannot block splash dismissal.

### 6.5 Apply policy — REMOTE-IF-NEWER (single-writer total replace)

```
pull-on-open at DOMContentLoaded+500ms:
  1. GET /pull-full-state-meta (small, fast — just compare-headers)
  2. if pull-meta fails (404, 401, network) → silent no-op + audit-log entry
  3. if remote._schemaVersion > local SCHEMA_VERSION → refuse + modal "update slyght" + audit
  4. compare remote.lastSavedAt vs local S._lastSavedAt:
     - if remote ≤ local + tolerance(2s) → silent no-op + audit "remote-not-newer"
     - if remote > local → eligible for apply:
       a. SNAPSHOTS.take('pre-cloud-pull-' + Date.now())
       b. if SNAPSHOTS.take throws → ABORT (R2 spec #29 — never merge without rollback)
       c. GET /pull-full-state (full body)
       d. parse JSON; if throw → audit + silent no-op (no state change)
       e. validate shape: typeof body.S === 'object' && Array.isArray(body.S.txns) && Array.isArray(body.BILLS)
       f. sanitize: strip NEVER_SYNC fields; reject __proto__ / constructor / prototype own-keys
       g. apply (total replace): write to localStorage, hydrate S + BILLS in-memory
       h. set window._suppressPushUntil = Date.now() + 5000; clear pending push timer
       i. refreshModel; renderAll
       j. showToast('☁️ Synced from cloud · X ago')
       k. audit log entry CLOUD_SYNC_PULL_APPLIED with deltas
```

**This is TOTAL REPLACE, not merge.** Single-writer means newer-remote IS the truth — no field-level reconciliation needed. The hard problem doesn't exist with one writer.

**Why this is safe:**
- One writer (John's phone) → remote was written by THIS device's prior session. Newer remote = newer local-self. Replacing local with remote can't lose data because remote IS local's future state.
- Multi-tab same-device handled separately via BroadcastChannel (§6.10).

### 6.6 Post-pull push suppression (R3)

```js
window._suppressPushUntil = Date.now() + 5000;
// in _schedulePushFullState:
if (window._suppressPushUntil && Date.now() < window._suppressPushUntil) return;
```

Also clear any pending debounce timer at pull-end. Prevents push amplification (pull → load() → seedV migrations → save() → push of just-pulled state).

### 6.7 Cloud-sync enabled flag (CS-D)

Rename `S.pushOnSaveEnabled` → `S.cloudSyncEnabled`. Single flag governs push AND pull symmetrically. Migration: read old field on load, write new field on save.

### 6.8 Sync UX (CS-E)

- **No-op pull (remote not newer):** silent
- **Overwrite applied (empty local + remote exists):** `showToast('☁️ Synced from cloud · X ago')`
- **Schema-skew refusal:** `EDIT_MODAL.openCustom` with "Update slyght on this device" + the safe-link
- **Pull fail (silent fallback):** audit log only; no UI

Splash interaction: pull runs in parallel; splash stays escape hatch. Per CS-E recommendation.

### 6.9 Audit event types (CS-E + R5)

New `BRAIN.SOURCES` constants:
- `CLOUD_SYNC_PULL_OK`
- `CLOUD_SYNC_PULL_NOOP`
- `CLOUD_SYNC_PULL_OVERWRITE_EMPTY`
- `CLOUD_SYNC_PULL_FAIL`
- `CLOUD_SYNC_PULL_REFUSED_SCHEMA`
- `CLOUD_SYNC_UNDO`

Audit entry shape (extends existing `BRAIN.audit.appendReconLog`):
```
{ type: 'cloud_sync_pull_*', source: BRAIN.SOURCES.X, ts,
  remoteSchemaVersion, localSchemaVersion, remoteLastSavedAt,
  localLastSavedAt, bytes, decision, _device: deviceHash }
```

### 6.10 Security carve-outs (R5)

- `NEVER_SYNC` constant enforced in BOTH push (already done in apiKey hotfix) AND pull-apply path
- Prototype-pollution rejection on pulled state: walk JSON object, reject any object with `__proto__` / `constructor` / `prototype` own-keys; or use `Object.create(null)` for merge target
- Worker `/push-full-state` size cap 500kB (added in apiKey hotfix)
- Pull-apply validates schema shape before mutating `S` (R5 T22 — captive-portal HTML body must not parse as state)

### 6.10 Multi-tab same-device safety — BroadcastChannel

Multi-tab on same device is the ONE concurrent-write race that survives single-device scope:
- Tab A and Tab B both have slyght open. Both share localStorage but have separate in-memory `S`.
- Tab A writes → Tab B's in-memory `S` is stale.
- Tab B writes → overwrites Tab A's write on localStorage.

**Fix:** `BroadcastChannel('slyght-sync')`. On any `save()`:
- Broadcast `{type: 'state-saved', _lastSavedAt}`
- Other tabs receive → reload `S` and `BILLS` from localStorage before their next user-triggered action
- On pull-apply: also broadcast `{type: 'state-synced'}` so other tabs reload from synced state immediately

**Phone-verify requirement (John 2026-05-23):** BroadcastChannel is a live-tab runtime API independent of SW cache. Should work on Android Chrome PWA (John's S23 Ultra target). Phone-verify tab-sync fires on John's actual device, not just green smoke.

### 6.11 Force-pull manual escape hatch (Option 2 if cheap)

Settings option "Pull latest from cloud" — manual trigger of `BRAIN.cloudSync.pullOnOpen()`. Useful for:
- Manual cross-device bridge during browser-data-clear scenarios
- Debug / forensic ("did sync actually run?")

Trivial to add (~15 lines: button in Settings + click handler). Bundles into the sync UX commit if it fits cleanly; drops if it bloats.

### 6.12 SNAPSHOTS reversibility (CS-E + R5)

`SNAPSHOTS.take('pre-cloud-pull-' + ts)` MUST fire before any state mutation. If `SNAPSHOTS.take` throws or returns falsy, ABORT apply (R2 spec #29).

Cap concern: if SNAPSHOTS hits its 250-entry cap mid-eviction, ensure last-known-pre-pull preserved. R5 T14: preserve dedicated `pre-pull` slot exempt from eviction.

---

## 7. What single-device sync DOESN'T need (and why, for the record)

Drone outputs anticipated multi-device scenarios. With John's single-writer clarification, all of the following EVAPORATE — kept here so future-CC / a future multi-device pivot has the analysis on file rather than re-deriving it:

### 7.1 Server-side merge (R1 fix for S3, S5, S15, S18)

Worker `/push-full-state` becomes: read existing blob → merge per field policies → write back. KV doesn't support CAS natively; options:
- **Option A:** Move to Cloudflare Durable Object (single-writer per device hash, CAS native)
- **Option B:** Version counter in KV (`device:{hash}:state-version`) + retry-on-conflict
- **Option C:** Operation log (push ADDS event, pull REPLAYS) — most correct, most invasive

### 7.2 Lamport `_seq` tie-breakers (R1 bonus)

Per-device monotonic `_seq` + worker-stamped `_globalSeq`. Primitive Lamport clock closes tie-breaker gap in every LWW scenario.

### 7.3 Per-field merge policies (CS-C)

| Field | Policy |
|---|---|
| `S.bal` | DERIVED — recompute from cycleStart + txn replay; never sync directly |
| `S.txns` | Union-by-(`_device`, `_localId`); dedup intent-keyed via `_intentId` for system-emitted txns |
| `S.paidBills` | Key-union; per-key prefer-richer-value (object > bare true); never delete a key (tombstone-only) |
| `S.savingsBuckets[].saved` | DERIVED from txns (Bundle 28.3 dependency); `_manualSavedTs` override |
| `S.savingsBuckets[].{goal,name,account}` | Field-level LWW per `id` |
| `S.activePlan.lockedAt` | First-locked-wins per `cycleStartDate`; conflict modal if both locked with different snapshots |
| `S.activePlan.ticks.*` | Field-level merge by leaf, LWW per ts |
| `S.activePlan.knownUpcoming` | Union by id; soft-delete tombstone |
| `S.debts[].paid` | Sticky-true union by id; tombstone on delete |
| Settings (income, payday, budgets, etc.) | Field-level LWW with `_meta._ts` sidecar |
| `S._auditLog` | Append-only-merge by (`_device`, ts, type); cap 1000 post-merge |
| `S.apiKey` / `S.pinHash` / device token | NEVER-SYNC (already enforced in v1 push-side) |
| `BILLS` | Last-writer-wins by `lastPushedAt` (per R3 recommendation — simpler than row-merge) |

### 7.4 Conflict resolution modal (CS-E)

When whole-S LWW would lose data (i.e. local `_lastSavedAt` < remote `_lastSavedAt` BUT local has non-mergeable changes): `EDIT_MODAL.openCustom` with "Keep phone / Keep cloud / View diff." Surfaces explicitly; never silent overwrite when divergence is real.

### 7.5 Intent-keyed dedup for txns (R1 fix for S9)

Every txn emitted from a logical intent (bill mark-paid, tick on knownUpcoming, debt mark-paid) carries `_intentId = source + cycleId + entityId`. Union step deduplicates by `_intentId`. Closes double-tick scenario.

### 7.6 `_remote: true` tagging on merged audit entries (R5 T4)

Every audit entry merged from remote carries `_remote: true` + `_remoteFromHash` + `_mergedAt`. Local writers MUST NOT set `_remote`. Heal-on-read (INV-30, INV-32) trusts only `_remote !== true` entries when reconstructing canonical state. Guardian rule: any literal `_remote: true` in source code outside `SYNC.merge` is a violation.

### Why all of §7 doesn't apply to single-device sync

Every item in §7 above (per-field merge, Lamport clocks, intent dedup, conflict modal, `_device`/`_localId`, tombstones, `_remote:true` tagging) exists to solve **concurrent-write conflicts across multiple devices**. With single-writer reality:
- Newer-remote always reflects same-device's most-recent state
- Total replace is honest because remote-newer = local's future
- No conflict can exist because there's only one party to disagree with

The analysis is preserved here so a future multi-device bundle (24+/Phase D) doesn't repeat the drone scoping work. None of it ships in single-device sync.

---

## 8. Smoke + property spec inventory (trimmed for single-device scope)

Single-writer scope deletes most adversarial coverage. Remaining ~12 P0 smoke specs + ~5 property invariants.

### P0 smoke specs (from R2)

Apply directly to single-device-sync (remote-if-newer total replace):
- #14 `_lastSavedAt` monotonic (the freshness anchor IS the comparison primitive)
- #15 apiKey never travels (regression guard on hotfix `7a1d5a8`)
- #16 pinHash never travels
- #17 device token never travels
- #19 activePlan shape required post-apply
- #20 pull MUST NEVER block splash > 5s (escape-hatch protection)
- #21 toast MUST NEVER appear on no-op pull
- #29 SNAPSHOTS.take failure ABORTS apply
- #32 pull failure NEVER corrupts S (atomic apply, validate first)
- #33 garbled JSON throws no uncaught
- #34 401 NEVER auto-clears device token
- #39 schemaVersion forward-incompat refusal
- #43 every OVERWRITE event MUST have preceding SNAPSHOTS entry
- #44 PULL_FAIL audit entry MUST have errorClass

Adversarial scenarios that **DON'T** apply (because single writer): R1 S3 network reorder, S5 cross-device wipe, S7 txn migration race, S9 intent double-tick, S15 cross-tab + different-token wipe, S18 multi-tab cross-namespace race. About half R1's 22 scenarios evaporate.

Adversarial scenarios that **still** apply (these become the smoke catalog): S1+S2 clock skew, S4 migration ladder race, S20 schema version skew, S21 storage quota, S22 garbage response, S17 undo post-pull. + multi-tab same-device race (§6.10's BroadcastChannel addresses this).

### P0 property invariants (from R4)

Single-device-relevant subset:
- P1.1 Idempotence: `apply(local, remote=local)` ≡ local (modulo audit + _lastSavedAt)
- P2.1 + P2.2 Txn + cash conservation under replay (total-replace preserves trivially)
- P5.1 Device-local never travels (apiKey, pinHash, device token, push subscription)
- P6.1 Output is valid (schema validator passes on applied state)
- P7.1 Deterministic apply (same inputs → same output, no Date.now() inside the fn)

P1.2 commutativity, P1.3 associativity, P2.3-P2.5 conservation-across-merge, P3.x monotonicity-under-merge, P4.x reversibility-via-merge — all v2-only. Drop.

### Implementation framework

R4 recommendation stands: hand-rolled in-page property checker via `page.evaluate`. Trimmed to ~5 properties; harness is ~40 lines.

---

## 9. Migration enumeration (R3 — full inventory)

**30 sites total** — 17 seedV* IIFEs (top-level eval, write directly to localStorage, don't trigger push) + 13 load()-inline migrations (call save(), trigger push). All idempotent on close read but flag-set ordering varies.

Risk site flagged by R3: seedV19+ set the migration flag UNCONDITIONALLY in trailing `localStorage.setItem` outside the try-block. If JSON.parse throws, flag is still set → migration permanently skipped on that device. Existing risk; not Bundle 23's fault but worth a follow-up sweep.

Bundle 23 v1 adds ONE NEW migration: `_txnDeviceIdMigrationV1` (stamps legacy txns with `_device`+`_localId`).

Future: `Bundle 30 candidate` per memory `slyght_rewrite_pilot_2026_05_13` — consolidate all 30 migrations into a central `MIGRATIONS` registry with declared schema version.

---

## 10. Rollback plan

Per-commit rollback:
- All v1 commits are fix-forward / additive. If a v1 commit fails, revert via `git revert <sha>`; localStorage state is unaffected.
- The `_txnDeviceIdMigrationV1` migration is data-shape-additive (adds `_device`+`_localId` fields). Revert + force-reload doesn't undo the data (fields stay) but downstream code ignores extra fields. Safe.

Pull-applied state rollback:
- Every pull-apply is preceded by `SNAPSHOTS.take('pre-cloud-pull-' + ts)`. User can manually revert via Diagnostics → Snapshots UI (`index.html:1552`).
- `showUndoToast('☁️ Synced from cloud — tap to revert')` for 5s undo window after overwrite.

Disaster recovery:
- If a pulled state corrupts localStorage: load() now has try/catch (existing); will fall back to in-memory seed. SNAPSHOTS UI surfaces last-known-good.

---

## 11. Implementation plan — 8-commit slate (~2 hr)

Per John's lock 2026-05-23. Each Sentinel-gated, Council + Human Verdict per ADR-H. Build runs in own fresh session AFTER Bundle 33-cache lands (soft prerequisite for reliable code-delivery to phone).

1. **Freshness anchor + SCHEMA_VERSION substrate** — add `S._lastSavedAt = Date.now()` in `save()`, `const SCHEMA_VERSION = 30`, stamp on save. ~35 lines. Smoke: assert both stamped + monotonic.
2. **Worker meta extension** — `state-full-meta` echoes `lastSavedAt` + `schemaVersion` from blob; `X-Slyght-Last-Saved-At` + `X-Slyght-Schema-Version` headers on `/pull-full-state` + `/pull-full-state-meta`. ~15 worker lines + R5's worker-side schema validation + size cap (mirror of client cap). Smoke: assert headers present + worker rejects garbled bodies.
3. **`BRAIN.cloudSync` bubble** — `pullMeta()` + `pullFullState()` readers + `sanitize()` helper (strips `NEVER_SYNC` on apply, rejects `__proto__` / `constructor` / `prototype`). ~70 lines. Smoke: each callable, sanitize strips + rejects.
4. **`pullOnOpen()` orchestrator + apply path** — remote-if-newer policy, SNAPSHOTS pre-pull, schema check, validate shape, sanitize, atomic apply, post-pull push suppression (`window._suppressPushUntil` + clear pending timer). ~100 lines. Smoke covers R2 specs #14-17, #29, #32-33, #39, #43-44.
5. **Boot wiring** — insert `BRAIN.cloudSync.pullOnOpen()` call at DOMContentLoaded+500ms after `BRAIN.selfTest.run()`, before autodebit-floor init. ~10 lines. Smoke: assert pulls fire after selfTest, before autodebit; respects `cloudSyncEnabled`.
6. **`S.cloudSyncEnabled` rename + plumbing** — rename `S.pushOnSaveEnabled`, single flag governs push+pull symmetrically. Migration shim reads old field on load. ~20 lines. Smoke: assert disable suppresses both push and pull.
7. **Sync UX + audit events** — toast on remote-applied (`'☁️ Synced from cloud · X ago'`), silent on no-op, `EDIT_MODAL.openCustom` on schema-refusal, 6 new `BRAIN.SOURCES` for audit. + Settings "Pull latest from cloud" force-pull button IF cheap (~15 extra lines; drop if bloats). ~50 lines. Smoke: per-state UX assertions.
8. **Multi-tab BroadcastChannel** — `BroadcastChannel('slyght-sync')` on save (`state-saved` event with `_lastSavedAt`) + on apply (`state-synced`). Other tabs reload S/BILLS from localStorage on receive. ~25 lines. Smoke: assert second tab updates after first tab's save. **Phone-verify after build** that tab-sync actually fires on John's device, not just green smoke (per John's flag — phone's stale-state history makes verification mandatory).

**Total estimate: ~2hr build + ~30min phone-verify ritual.**

**Property test harness:** ~40 lines, ~5 P0 properties (idempotence, conservation, device-local-never-travels, schema-valid, deterministic). Folds into commit 4 or as a separate small commit.

---

## 12. Security carve-outs (R5 — formal)

### Phase-B-INDEPENDENT (v1 ships before Phase B IF John greenlights v1 in §13 Q4)

Required for v1 ship beyond the apiKey hotfix already pushed:
- **Worker schema validation** — beyond `body.S && Array.isArray(body.BILLS)`, validate `typeof body.S.bal === 'number'`, etc. R5 T3.
- **Client-side prototype-pollution rejection** in `BRAIN.cloudSync.pullFullState` sanitize step. R5 T3 + T9.
- **NEVER_SYNC allowlist gates BOTH push (done) and pull-apply (v1 todo)**. R5 enforcement-in-code-not-policy.

These three are safe to ship pre-Phase-B because v1's overwrite-only-on-empty-local policy means the device never MERGES plaintext data from another writer — it either hydrates from empty (cache-wipe recovery) or keeps local (everything else). The single-device-tab same-token case is the only data flow.

═════════════════════════════════════════════════════════════════════
PHASE B HARD-DEPENDENCY LINE — everything below requires Phase B FIRST
═════════════════════════════════════════════════════════════════════

### Phase B PREREQUISITE for v2 (John 2026-05-23, no compromise)

Phase B (encryption at rest under passphrase-derived key) MUST ship before v2 work begins. Rationale: v2 introduces multi-device MERGE of plaintext state from a shared KV namespace. Every device's push affects every other device's next pull. The apiKey leak (R5 T6, shipped pre-flight `7a1d5a8`) proved that plaintext state in worker-KV is a real attack surface — v2 multiplies it across every field, not just secrets. The honest sequence:

1. **Phase B ships** — passphrase-derived AES-GCM, worker becomes dumb storage of ciphertext, token rotation + revocation list, rate limiting, audit log.
2. **Then v2 builds on encrypted substrate** — merge logic operates on client-decrypted state; worker never sees plaintext; conflict resolution happens client-side post-decrypt.

### v2 security items (BLOCKED until Phase B ships)

- `_remote: true` tagging on merged audit entries (R5 T4) — only meaningful inside the encrypted boundary
- TOCTOU `_pullInFlight` flag for conflict detection (R5 T5) — gates against mid-merge concurrent local writes
- Lamport `_seq` + `_globalSeq` from server (R1 bonus) — server-stamped requires server-trustworthy substrate
- Worker-side per-field merge logic OR operation-log model — operates on ciphertext at rest, plaintext at compute-time inside the device

### Deferred to Phase B itself (per SECURITY.md non-negotiable phase order)

- Stolen-token mitigation (rotation + revocation list)
- Encryption at rest (E2E with passphrase-derived key)
- Replay defense (request signing with HMAC + timestamp)
- Rate limiting

`SECURITY.md` decision-log entry to be added when v1 ships AND a separate entry when Phase B → v2 sequence begins.

---

## 13. Open questions — resolved + remaining

### Resolved this session

1. **v1 vs v2 (Q4 from prior framing):** ANSWERED — neither. John's actual need is single-device total sync. v1 was too narrow (cache-wipe only), v2 too broad (multi-device merge machinery). Re-scoped to this SDD's single-device shape.
2. **v2 timeline:** RESOLVED architecturally — single-device sync replaces v2 for John's actual usage. If usage ever expands to multi-device, that becomes Bundle 24+ on top of Phase B.
3. **Phase B sequencing:** RESOLVED — Phase B is the committed NEXT bundle after sync ships (per `SECURITY.md` 2026-05-23 decision-log).
4. **Bundle 33-cache prerequisite:** RESOLVED — cache lands first, sync second.
5. **Apply policy:** RESOLVED — remote-if-newer total replace (single writer makes this honest).

### Remaining (decide before/during build session)

1. **Pull-on-open trigger:** at DOMContentLoaded+500ms only (CS-A baseline), or also on `visibilitychange` (when tab regains focus after Android tab-killed it)?
   - Pro `visibilitychange`: phone returning from background gets fresh state without explicit reload
   - Con: adds an event source to manage; cache-disease + Bundle 32a's existing pagehide flush interact
   - **Recommendation:** boot-only for MVP; add `visibilitychange` in a follow-up if John finds the gap annoying.
2. **Force-pull Settings button (Option 2):** include in commit 7 if it fits cleanly (~15 lines); drop if it bloats. Manual escape hatch is useful but lower priority than tab-safety.
3. **Cache-disease soft-prerequisite confirmation:** verify Bundle 33-cache truly needs to land first. (Drone H spec is ready; soft-prereq investigation can be 15-min in the build session before committing to the order.)
4. **Phone-verify protocol for BroadcastChannel:** Drone H confirmed `BroadcastChannel` is live-tab runtime API independent of SW cache, so should work. But John's phone has stale-state history — phone-verify ritual must include opening two tabs and confirming tab-sync fires. Add to build session's phone-verify checklist.

---

## 14. Cross-references

- `MEMORY.md` pin `slyght_bundle_23_cloud_sync.md` — original (11-day-old) architecture decision, now superseded by this SDD's v1/v2 split
- `MEMORY.md` pin `slyght_data_lifecycle_architecture.md` — Gap 3 (snapshot eviction) partially resolved by SNAPSHOTS pre-pull preservation
- `MEMORY.md` pin `slyght_dump_live_drift.md` — closed by v1 (dev-side `fixture:fresh` already handles this; v1 closes app-side)
- `MEMORY.md` pin `slyght_lock_state_divergence.md` — v2 P3.1 lock monotonicity intersects
- `MEMORY.md` pin `slyght_save_race_atomic_write_reload.md` — v1 P4.1 snapshot-precedes-overwrite intersects
- ADR-H Standing Rule 6 (Human Verdict) — every Bundle 23 commit gated
- ADR-H citation discipline refinement — every FLAG-WITH-CITATION cites THIS SDD's specific clauses

---

## 15. What the pipeline produced (track record)

10 drones × ~1 hour wall-clock each in parallel = ~5 hours of investigation density compressed into ~1 hour of session time. R1 + R3 INDEPENDENTLY surfaced the server-side merge gap that would have ambushed a naïve build. R5 surfaced the apiKey leak that was actively in production. R4 produced a formal property catalog that lets v1 + v2 ship with mathematical guarantees, not just example-based confidence.

The drone-only investment was substantial (~3 hours including synthesis). The cost of NOT doing it would have been a Bundle 23 ship that lost user data on the first multi-device write. The pipeline's value compounds: every drone finding is durable, citeable, and re-applicable to future architectural bundles.

---

## 16. Closing call (final, 2026-05-23 post-Q4-resolution)

Bundle 23 scope is **LOCKED** as single-device total sync per John's Q4 answer 2026-05-23.

**The scope-lock contract** (signed in `SECURITY.md` 2026-05-23 decision-log + this SDD):
1. **Bundle 33-cache** ships first (soft prerequisite — reliable code-delivery to phone)
2. **Bundle 23 single-device sync** ships next (8-commit slate per §11)
3. **Phase B encryption-at-rest** is the committed NEXT architectural bundle after sync — not "someday," in `SECURITY.md` decision-log as the contract

**Tonight's deliverables (all landed):**
- 10-drone pipeline output synthesized into this SDD (durable analysis even though most of it doesn't apply to single-device scope; preserved in §7 for future multi-device pivot)
- Pre-flight apiKey leak fix (commit `7a1d5a8`) + John's Anthropic key rotation
- 12 cashflow-truth commits earlier in session (slate 1)
- ADR-H pipeline + Human Verdict + citation discipline refinements (commits across session)
- `SECURITY.md` decision-log entries for apiKey leak + sync-on-plaintext-KV rationale + Phase B commitment
- This SDD rewritten to single-device-sync architecture

**Tonight stops here.** Build is its own fresh session. The Q4 answer + scope-lock + rewritten SDD + Phase B commitment is the deliverable.

**Next session opens with:**
1. Quick check: does Bundle 33-cache truly need to land first? 15-min investigation if John wants the order revisited.
2. If cache-first: ship Bundle 33-cache (~1-1.5hr per Drone H spec).
3. Then: ship single-device sync 8-commit slate per §11. ~2hr + phone-verify.
4. Then: Phase B as the immediate next architectural bundle.

**What the pipeline proved:**
- 10 drones surfaced architectural complexity (v2 merge machinery) that, when John clarified actual usage, EVAPORATED. The drones weren't wasted — they catalogued the alternative reality that becomes relevant if usage ever multiplies.
- The PAUSE before any build was the pipeline doing its highest-leverage job: catching scope drift before 3-4hr crystalized around the wrong question. Two pauses this session (backwards P0-5 catch + bonusLever double-count + Bundle 23 v1/v2-vs-single-device re-scope) compounded into commit `b4cedfc`'s citation discipline refinement to ADR-H.
- Phase B was rescued from "deferred indefinitely" to "committed next" by being written into `SECURITY.md` decision-log as a contract. Future-CC reading this is bound to that ordering.

This SDD is the locked spec. Build runs fresh next session. Sleep well.
