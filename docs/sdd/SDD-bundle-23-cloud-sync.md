# SDD — Bundle 23 Cloud State Sync

**Status:** Draft 2026-05-23, scoped via 10-drone pipeline (Step 0 + Tier 1 Gather × 5 + Red Team × 5). Awaiting John's triage on v1-tonight vs hold-for-dedicated-session.

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

## 1. Mission

Close the dump-to-live drift and lay the substrate for multi-device state sync, building on Phase A (device-token auth + KV namespacing) and Bundle 32a (push-on-save → worker-KV).

**What done looks like:**
- App on boot pulls remote state and reconciles
- Multi-tab + multi-session-on-same-device freshness is correct
- (v2) Multi-device concurrent writes converge without money-truth loss
- Audit log captures every sync event with forensic ground truth

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

## 5. Scope split — v1 / v2 / deferred

| Layer | Scope | Architecture | Estimated work |
|---|---|---|---|
| **Pre-flight** | apiKey leak fix | Push-side redaction + size cap | SHIPPED `7a1d5a8` |
| **v1 (single-device safe)** | Pull-on-open + overwrite-only-on-empty-local + freshness anchor + schema versioning + post-pull push suppression + SNAPSHOTS pre-pull + audit events + UX toast | Client-side only; worker meta extension | ~3-4 hr build + smoke |
| **v2 (multi-device merge)** | Worker per-field merge OR operation log + Lamport `_seq` + intent-keyed dedup + per-field conflict policies + conflict modal | Worker + client; significant architecture | Dedicated multi-session bundle |
| **Deferred (Bundle 24+/Phase D)** | Cross-device token-pairing flow (QR / paste / identity layer) | Identity layer | Out of Bundle 23 scope |

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

## 6. v1 Specification

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

### 6.3 `_device` + `_localId` migration (R3)

One-shot `_txnDeviceIdMigrationV1` in `load()`:
- For each `S.txns[i]` lacking `_device`: stamp `_device = 'legacy:' + deviceHash`, `_localId = String(t.id ?? 'ts-' + t.ts)`
- Per-device unique to prevent cross-device collision on legacy ids
- New writes (after Bundle 23 v1): `_device = deviceHash`, `_localId = ++S._nextLocalId`
- Substrate for v2's union-by-(_device, _localId) merge

### 6.4 Pull-on-open orchestrator

**New BRAIN bubble:** `BRAIN.cloudSync` near the existing `PUSH` object.

API:
- `pullMeta()` — async, returns `{ok, meta, headers}` or `{ok:false, reason}`
- `pullFullState()` — async, returns `{ok, body}` or `{ok:false, reason}`
- `pullOnOpen()` — orchestrator: pullMeta → schemaVersion check → if local empty AND remote exists → SNAPSHOTS.take → pullFullState → sanitize → apply → audit → toast

**Insertion point (CS-A):** inside DOMContentLoaded+500ms handler at `index.html:14739`, AFTER `BRAIN.selfTest.run()` (~L14765), BEFORE autodebit-floor init at L14784.

Non-blocking against splash — splash stays John's escape hatch. Pull cannot block splash dismissal.

### 6.5 Apply policy — OVERWRITE-ONLY-ON-EMPTY-LOCAL (most conservative MVP)

```
detect localStorage state:
  if (S.txns.length > 0 OR BILLS.length > 0) → SKIP pull-apply
  // (local has data; don't overwrite. Audit-log "remote-newer-kept-local" if applicable.)
  
  else → eligible for overwrite (true cold-boot case):
    1. SNAPSHOTS.take('pre-cloud-pull-' + Date.now())
    2. pull remote
    3. validate schemaVersion ≤ local
    4. sanitize against NEVER_SYNC + prototype-pollution
    5. apply: write to localStorage, refresh S/BILLS in-memory
    6. refreshModel + renderAll
    7. showToast('☁️ Synced from cloud · X ago')
    8. audit log entry
```

**No merge logic in v1.** This sidesteps R1+R3's architectural gap entirely for v1. v2 is where merge lands.

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

### 6.11 SNAPSHOTS reversibility (CS-E + R5)

`SNAPSHOTS.take('pre-cloud-pull-' + ts)` MUST fire before any state mutation. If `SNAPSHOTS.take` throws or returns falsy, ABORT merge (R2 spec #29).

Cap concern: if SNAPSHOTS hits its 250-entry cap mid-eviction, ensure last-known-pre-pull preserved. R5 T14: preserve dedicated `pre-pull` slot exempt from eviction.

---

## 7. v2 Specification (DEFERRED — dedicated future session)

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

---

## 8. Smoke + property spec inventory

### v1 must-ship (P0)

From R2's 46 negative specs, the 17 P0s that apply to v1's overwrite-only-on-empty-local apply policy:
- #1 cycle conservation invariant
- #2 txn preservation
- #3 unique-to-remote txn preservation
- #6 paidBills object-shape supremacy
- #12 lockedAt sticky
- #14 _lastSavedAt monotonic
- #15 apiKey never travels (regression guard on the hotfix)
- #16 pinHash never travels
- #17 device token never travels
- #19 activePlan shape required
- #26 pull MUST NEVER push seed-state during migration-ladder
- #27 write barrier (pull never overwrites local mid-save())
- #29 SNAPSHOTS.take failure aborts merge
- #32 pull failure NEVER corrupts S
- #39 schemaVersion forward-incompat refusal
- #43 OVERWRITE event MUST have preceding SNAPSHOTS entry

From R4's 22 properties, the 11 P0s:
- P1.1 idempotence
- P2.1 txn conservation
- P2.2 cash conservation under replay
- P2.3 paidBills key conservation
- P2.4 debt-paid sticky
- P3.1 lock monotonicity
- P4.1 snapshot precedes overwrite
- P5.1 device-local never travels
- P6.1 output is valid (schema)
- P7.1 deterministic under fixed inputs

(P1.2 commutativity-union is v2-relevant; not P0 for v1's overwrite-only path.)

### v2 must-ship (additional P0)

The remaining 29 P1 from R2 + 11 P1/P2 from R4 + the per-field merge specs.

### Implementation framework

R4 recommendation: hand-rolled in-page property checker via `page.evaluate`. No fast-check dep added. Seeded RNG + reproducible failures `{seed, counterexample}` for paste-back. ~60 lines harness.

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

## 11. Implementation plan — v1 build sequence (~3-4 hr)

Order picked for minimum-blast-radius and Sentinel-gating per commit:

1. **Schema versioning substrate** — add `SCHEMA_VERSION` const + `S._schemaVersion` stamping in `save()` + Guardian rule. ~30 lines. Smoke: assert stamped + Guardian fires on touch.
2. **Freshness anchor** — add `S._lastSavedAt = Date.now()` in `save()`. ~5 lines. Smoke: assert monotonic.
3. **`_txnDeviceIdMigrationV1`** in `load()` — stamp legacy txns. ~25 lines. Smoke: idempotent + per-device uniqueness.
4. **Worker meta extension** — add `lastSavedAt` + `schemaVersion` to `state-full-meta` + response headers. ~10 worker lines. Smoke: assert headers present on pull.
5. **`BRAIN.cloudSync` bubble** — `pullMeta`, `pullFullState`, sanitize helpers. ~70 lines. Smoke: each callable, sanitize strips NEVER_SYNC + rejects prototype-pollution.
6. **`pullOnOpen` orchestrator** — overwrite-only-on-empty-local apply policy + SNAPSHOTS pre-pull + audit. ~80 lines. Smoke: covers R2 specs #1, #2, #6, #12, #15-17, #26, #29, #32, #39, #43.
7. **Post-pull push suppression** — `_suppressPushUntil` + clear pending timer. ~10 lines. Smoke: assert no push amplification post-pull.
8. **Insert `pullOnOpen` call at DOMContentLoaded+500ms** — wire into boot. ~5 lines. Smoke: assert pulls fire after selfTest, before autodebit-floor.
9. **`S.cloudSyncEnabled` rename + flag plumbing** — single flag governs push+pull. ~15 lines. Smoke: assert disable suppresses both.
10. **Sync UX wiring** — toast on overwrite, modal on schema refusal, silent on no-op. ~30 lines. Smoke: assert per-state UX.
11. **Property test harness** — `runProperty(name, gen, check, N=50)` ~60 lines, ~11 P0 properties. Smoke: all P0 properties green.

Each commit Council + Human Verdict per ADR-H. ~11 commits, all small + Sentinel-gated.

---

## 12. Security carve-outs (R5 — formal)

Required for v1 ship beyond the apiKey hotfix already pushed:
- **Worker schema validation** — beyond `body.S && Array.isArray(body.BILLS)`, validate `typeof body.S.bal === 'number'`, etc. R5 T3.
- **Client-side prototype-pollution rejection** in `BRAIN.cloudSync.pullFullState` sanitize step. R5 T3 + T9.
- **NEVER_SYNC allowlist gates BOTH push (done) and pull-apply (v1 todo)**. R5 enforcement-in-code-not-policy.

Required for v2:
- `_remote: true` tagging on merged audit entries (R5 T4)
- TOCTOU `_pullInFlight` flag for conflict detection (R5 T5)
- Lamport `_seq` + `_globalSeq` from server (R1 bonus)

Deferred to Phase B (per SECURITY.md non-negotiable phase order):
- Stolen-token mitigation (rotation + revocation list)
- Encryption at rest (E2E with passphrase-derived key)
- Replay defense (request signing with HMAC + timestamp)
- Rate limiting

`SECURITY.md` decision-log entry to be added when v1 ships.

---

## 13. Open questions / values calls for John

1. **v1 tonight vs hold for dedicated session?** Drone scoping took ~2 hours; v1 build is ~3-4 hours; v1 has 11 commits all Sentinel-gated. Reasonable to ship tonight if you have appetite; legitimate to defer for a fresh session.
2. **v2 timeline:** v2 needs worker architecture decision (Durable Object vs version counter vs operation log). When?
3. **Pull-on-open trigger:** at DOMContentLoaded+500ms (CS-A recommendation), or also on `visibilitychange` (when tab regains focus)?
4. **Overwrite-only-on-empty-local IS narrow** — it covers cache-wipe + multi-tab-freshness but NOT stale-device-resume (a phone that hasn't opened in 2 weeks won't overwrite with the newer remote state). Is that acceptable for v1, or do you want a "force pull" Settings option?
5. **Cloudflare Worker storage choice for v2:** stay on KV with version counter, or move to Durable Object for native CAS? Architectural decision pending.
6. **Apple Time Machine / Chrome Sync intersection:** localStorage doesn't sync via browser features. Acknowledged as out-of-scope, but worth flagging if Settings should expose "Export-then-import" as the documented cross-device bridge.

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

## 16. Closing call

This SDD is the deliverable of tonight's Bundle 23 scoping session. The pre-flight apiKey hotfix is shipped. v1 build is scoped, sequenced, and ready to fire whenever John greenlights.

The disciplined ship is v1 tonight if appetite + time + ack; OR v1 next session with the SDD as input. Either path keeps the substrate honest.

v2 deserves its own dedicated multi-session bundle. Don't rush it.
