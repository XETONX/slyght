# slyght — Feature Map

> **Reference directory.** Every major UI surface → its render fn, DOM target,
> readers, writers, related state.
>
> **When working on a feature:** find its row here first. Grep this file for
> "where does X get computed" before chasing through 24k lines.
>
> **When fixing a bug:** the cross-references column tells you what else
> touches the same data so you don't break adjacent surfaces.
>
> Maintained by Claude Code. Updated as Bundle 28+ ships. Last updated: 2026-05-13.

## Sibling artifacts (read at session start per manual §3 Step 1)

| File | Purpose |
|---|---|
| `CC-PRINCIPAL-ENGINEER-MANUAL.md` | Operating manual. Outranks ship prompts. Read end-to-end on first session of the day. |
| `CHANGELOG.md` | Per-bundle ship log. Updated as part of every push (manual §3 Step 7). |
| `BUNDLE-NN-NOTES.md` | Active-bundle working ledger. Phase log + deferred items + cross-reference inspection queue. |
| `OPEN-BUGS.md` | Numbered bug ledger across all bundles. |
| `ARCHITECTURE.md` | Living architecture doc (Mermaid + component map + bottlenecks). |
| `docs/adr/` | Architecture Decision Records (one decision per file). |
| `docs/sdd/` | Software Design Documents (pre-implementation, for non-trivial work). |
| `docs/archive/` | Going-forward superseded docs. |
| `docs/manual-amendments/` | Per manual §15 — amendment proposals before manual edits. |
| `docs/ops/` | Operational runbooks (snapshot restore, redeploy, etc.). |
| `archive/` | Pre-Bundle-28 historical archive (missions/ship-prompts/audits/state-backups). |

---

## Feature Schema v2 (Bundle 30+)

> **New entry format adopted Bundle 30.** Each feature gets one structured entry. Path notation uses `→` with `ALL_CAPS` nodes. Top-level is `BRAIN` whenever possible; features outside BRAIN use a different root (`UI`, `AUDITOR`, `RECONCILER`, etc.) AND document rationale.
>
> **Schema fields (in order):**
>
> - `**Path:**` — full architectural path from root to leaf (e.g. `BRAIN → BALANCE → APPLY_TXN_DELTA`)
> - `**Type:**` — one of: `action` · `screen` · `section` · `element` · `writer` · `reader` · `helper` · `bubble`
> - `**Lives in:**` — `index.html:LXXXX-LXXXX` line range (or other file)
> - `**Inside BRAIN?**` — `yes (BRAIN.X.Y)` or `no (rationale why)`
> - `**Smoke coverage:**` — path to spec + assertion count, OR `none (planned: Bundle NN)`
> - `**Reads from:**` — state fields / external sources consulted
> - `**Writes to:**` — state fields / external sinks mutated (via canonical writer name)
> - `**Triggers:**` — downstream writers / side effects fired
> - `**Related features:**` — `peer` / `parent` / `child` / `sibling` cross-refs (other Path notation)
> - `**Notes:**` — context CC discovered during work, gotchas, history
> - `**Last touched:**` — Bundle + Phase + Date
>
> **Diagram-ready.** Each entry's `Path` defines its position in a tree. `Related features` are cross-tree edges. `Inside BRAIN?` + `Smoke coverage` enable color coding when the parser-renderer ships (Bundle 32+).

## Migration status

| Section | v2 backfilled? | Notes |
|---|---|---|
| Diagnostic surfaces | ✅ yes — Bundle 30 1.A.6 | All 1.A through 1.A.8 features below |
| Transaction paths | 🟡 partial — Bundle 30 Phase 1.B in progress | Backfilled as the 9 write-sites migrate |
| Payday Plan canvas + sub-screens | ⏳ planned Bundle 30 Phase 4 | INV-29 lock-narrowing work will backfill |
| Dashboard | ⏳ planned Bundle 30 (incremental) | Hero balance touched in Phase 1.B; recent-spending in Phase 2 |
| AI chat | ⏳ planned Bundle 30 Phase 3 | FR-03 tool split |
| Bills tab + Bills surfaces | ⏳ planned Bundle 31 | |
| Analysis tab | ⏳ planned Bundle 31 | |
| Settings (excl. Diagnostics) | ⏳ planned Bundle 31-32 | Large surface, low risk |
| Onboarding / first-run | ⏳ planned Bundle 32+ | Lowest priority |

**Legacy entries below this section use the v1 schema (tables).** They remain authoritative until migrated. Per backfill priority, every Bundle 30 phase converts the surfaces it touches.

---

## Features (v2 schema) — Diagnostic surfaces (Bundle 30 1.A — 1.A.8)

### BRAIN.balance (bubble)
**Path:** `BRAIN → BALANCE`
**Type:** bubble
**Lives in:** `index.html:19024-19166`
**Inside BRAIN?** yes (`BRAIN.balance`)
**Smoke coverage:** `tests/smoke/diagnostics.smoke.js` (alias contract, 1 assertion)
**Reads from:** `S.bal`
**Writes to:** `S.bal` (single canonical writer for transaction-driven changes)
**Triggers:** `BRAIN.audit.append`, `BRAIN.transaction.recordCorrection` (via reconcileTo), `save()`
**Related features:**
- child: `BRAIN → BALANCE → GET`
- child: `BRAIN → BALANCE → APPLY_TXN_DELTA`
- child: `BRAIN → BALANCE → RECONCILE_TO`
- child: `BRAIN → BALANCE → APPLY_DELTA`
- child: `BRAIN → BALANCE → CONFIRM_NEGATIVE_OVERRIDE`
- child: `BRAIN → BALANCE → _INIT_PRE_BUNDLE_30_SNAPSHOT`
- sibling: `BRAIN → TRANSACTION` (will compose this bubble in Phase 1.B `recordWithAllocation`)
**Notes:** Per SDD-bundle-30 §2 Phase 1+2 — bubble is the single writer; Phase 3-4 migrates readers; Phase 5+ makes derived per INV-05. Bundle 30 1.A scaffolding only — no behavioural change to existing writers yet.
**Last touched:** Bundle 30 Phase 1 Commit 1.A (2026-05-18)

### BRAIN.balance.get
**Path:** `BRAIN → BALANCE → GET`
**Type:** reader
**Lives in:** `index.html:19036-19038`
**Inside BRAIN?** yes (`BRAIN.balance.get`)
**Smoke coverage:** `tests/smoke/diagnostics.smoke.js` (alias contract: `BRAIN.balance.get() === getLiveBal() === S.bal`)
**Reads from:** `S.bal`
**Writes to:** — (pure reader)
**Triggers:** —
**Related features:**
- peer: `UI → GLOBAL → GET_LIVE_BAL` (thin alias, will deprecate post-Phase 3 reader migration)
- parent: `BRAIN → BALANCE`
**Notes:** Identical semantics to direct `S.bal` access in Phase 1+2; becomes computational replay in Phase 4 per INV-05.
**Last touched:** Bundle 30 Phase 1 Commit 1.A (2026-05-18)

### BRAIN.balance.applyTxnDelta
**Path:** `BRAIN → BALANCE → APPLY_TXN_DELTA`
**Type:** writer
**Lives in:** `index.html:19042-19062`
**Inside BRAIN?** yes (`BRAIN.balance.applyTxnDelta`)
**Smoke coverage:** none (planned: Bundle 30 Phase 1.B smoke when first write-site migrates)
**Reads from:** `BRAIN._SOURCE_SET`, `S.bal`
**Writes to:** `S.bal`, `S._auditLog` (via `BRAIN.audit.append`)
**Triggers:** `save()`, AUDITOR.record (via BUNDLE-30-AUDITOR-SHIM in Phase 1.B)
**Related features:**
- sibling: `BRAIN → TRANSACTION → RECORD` (Phase 1.B will compose this)
- peer: `BRAIN → BALANCE → RECONCILE_TO` (different write-class — corrections vs txn-driven)
**Notes:** Signed delta semantics (+inflow, −outflow). Validates source against `_SOURCE_SET`. Returns `{ok, old, new, delta, reason?}` envelope. Phase 1.B migrates 9 direct-S.bal write sites to route through this.
**Last touched:** Bundle 30 Phase 1 Commit 1.A (2026-05-18)

### BRAIN.balance.reconcileTo
**Path:** `BRAIN → BALANCE → RECONCILE_TO`
**Type:** writer
**Lives in:** `index.html:19068-19092`
**Inside BRAIN?** yes (`BRAIN.balance.reconcileTo`)
**Smoke coverage:** none (planned: Bundle 30 Phase 3 smoke — AI tool wires through this)
**Reads from:** `BRAIN._SOURCE_SET`, `S.bal`
**Writes to:** `S.bal`, `S._auditLog` (via `BRAIN.audit.append`)
**Triggers:** `BRAIN.transaction.recordCorrection` (logs corrective txn), `save()`, AUDITOR.record (via BUNDLE-30-AUDITOR-SHIM in Phase 3)
**Related features:**
- peer: `BRAIN → BALANCE → APPLY_DELTA` (delta variant of this)
- consumer: `UI → AI → SET_BALANCE_TARGET` (Phase 3 wires to this)
- legacy peer: `UI → GLOBAL → APPLY_BALANCE_CORRECTION` (predates this; Phase 3 may deprecate)
**Notes:** Reconciliation write — sets `S.bal` to explicit new value AND records corrective txn so ledger reflects the gap. Used by hero balance edit + AI `set_balance_target` tool.
**Last touched:** Bundle 30 Phase 1 Commit 1.A (2026-05-18)

### BRAIN.balance.applyDelta
**Path:** `BRAIN → BALANCE → APPLY_DELTA`
**Type:** writer
**Lives in:** `index.html:19098-19106`
**Inside BRAIN?** yes (`BRAIN.balance.applyDelta`)
**Smoke coverage:** none (planned: Bundle 30 Phase 3 smoke — AI tool wires through this)
**Reads from:** `S.bal`
**Writes to:** `S.bal` (via `reconcileTo` internally)
**Triggers:** `BRAIN.balance.reconcileTo` (cascades through it)
**Related features:**
- peer: `BRAIN → BALANCE → RECONCILE_TO` (target variant of this)
- consumer: `UI → AI → APPLY_BALANCE_DELTA` (Phase 3 wires to this)
**Notes:** Routes signed delta through reconcileTo so a correction txn lands in the ledger. Used by AI `apply_balance_delta` tool.
**Last touched:** Bundle 30 Phase 1 Commit 1.A (2026-05-18)

### BRAIN.balance.confirmNegativeOverride
**Path:** `BRAIN → BALANCE → CONFIRM_NEGATIVE_OVERRIDE`
**Type:** action
**Lives in:** `index.html:19115-19131`
**Inside BRAIN?** yes (`BRAIN.balance.confirmNegativeOverride`)
**Smoke coverage:** none (planned: Bundle 30 Phase 4.A smoke — INV-27 confirm flow)
**Reads from:** —
**Writes to:** `BRAIN.balance._negativeOverrideArmed` flag, `S._auditLog`
**Triggers:** `BRAIN.audit.append`
**Related features:**
- consumer: `BRAIN → TRANSACTION → RECORD_WITH_ALLOCATION` (Phase 2 will consume flag in INV-27 gate)
- peer: `BRAIN → BALANCE → _CONSUME_NEGATIVE_OVERRIDE` (private — clears flag)
**Notes:** One-shot override flag for INV-27 negative-balance refusal. UI flow: writer returns `'negative-warning-required'` → UI opens confirm modal → user confirms → calls this method → writer re-fires → flag consumed.
**Last touched:** Bundle 30 Phase 1 Commit 1.A (2026-05-18)

### BRAIN.balance._initPreBundle30Snapshot
**Path:** `BRAIN → BALANCE → _INIT_PRE_BUNDLE_30_SNAPSHOT`
**Type:** action
**Lives in:** `index.html:19139-19166`
**Inside BRAIN?** yes (`BRAIN.balance._initPreBundle30Snapshot`)
**Smoke coverage:** `tests/smoke/diagnostics.smoke.js` (snapshot exists + tagged, 2 assertions)
**Reads from:** `SNAPSHOTS.load()`
**Writes to:** `SNAPSHOTS` ring (via `SNAPSHOTS.take`), `S._auditLog`
**Triggers:** `SNAPSHOTS.take('pre-bundle-30')`, `SNAPSHOTS.save` (to tag), `renderSnapshots`, `BRAIN.audit.append`
**Related features:**
- consumer: `UI → BOOT → DOMCONTENTLOADED_HANDLER` (fires this at +500ms)
- peer: `AUDITOR → ...` (separate audit log, parallel to BRAIN.audit)
**Notes:** Bundle 30 pre-flight insurance. Idempotency-guarded by `s.reason === 'pre-bundle-30'`. Pins snapshot via `tagged: true` so eviction can never sweep it. Post-fix verifies on every boot. Fix-forward from 1.A: original used `s.label` (no such field) + ignored second arg to SNAPSHOTS.take.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.5 fix-forward (2026-05-18)

### BRAIN.selfTest (bubble)
**Path:** `BRAIN → SELF_TEST`
**Type:** bubble
**Lives in:** `index.html:19189-19282`
**Inside BRAIN?** yes (`BRAIN.selfTest`)
**Smoke coverage:** `tests/smoke/diagnostics.smoke.js` (waitForFunction asserts `_lastRun` populates, 1 assertion)
**Reads from:** `BRAIN.*` (every bubble), `S.planIntents`, DOM elements via `document.getElementById`
**Writes to:** `BRAIN.selfTest._lastRun`, `S._auditLog` (on failure)
**Triggers:** `BRAIN.audit.append` on failure
**Related features:**
- parent: `BRAIN`
- consumer: `UI → BOOT → DOMCONTENTLOADED_HANDLER` (runs at +500ms)
- consumer: `UI → SETTINGS → DIAGNOSTICS → BOOT_SELF_TEST_CARD` (re-runs on demand)
- peer: `MATH_INVARIANTS` (separate registry — cross-cutting math invariants vs structural-bubble checks)
**Notes:** Bundle 30 1.A.6 — promoted from inline tests array in DOMContentLoaded handler. 43 lazy thunks (24 original + 15 from Phase 1 + 4 self-reference). `run()` returns `{ts, results, failures}` and stores on `_lastRun`.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.6 (2026-05-18)

### BRAIN.devInspect (bubble)
**Path:** `BRAIN → DEV_INSPECT`
**Type:** bubble
**Lives in:** `index.html:19292-19337`
**Inside BRAIN?** yes (`BRAIN.devInspect`)
**Smoke coverage:** `tests/smoke/diagnostics.smoke.js` (output renders within 100ms, 1 assertion)
**Reads from:** `BRAIN.balance.get()`, `getLiveBal()`, `S.bal`, `SNAPSHOTS.load()`, `S._auditLog`, `BRAIN.SOURCES`, `BRAIN._SOURCE_SET`
**Writes to:** —
**Triggers:** Whatever each registered check invokes (extensible)
**Related features:**
- parent: `BRAIN`
- consumer: `UI → SETTINGS → DIAGNOSTICS → DEV_INSPECT_CARD`
- extension: future Bundle 30 phases append checks to `BRAIN.devInspect.checks`
**Notes:** Bundle 30 1.A.8 — runtime introspection for mobile-native verification. 8 initial checks: balance reads, alias matches, snapshot exists, audit entry count, BRAIN bubble inventory, SOURCES sync. Built to be appended-to from later phases.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.8 (2026-05-18)

### UI: Math Health card
**Path:** `UI → SETTINGS → DIAGNOSTICS → MATH_HEALTH_CARD`
**Type:** screen
**Lives in:** HTML at `index.html:1557-1564` (sub-diagnostics) + `index.html:1202-1209` (legacy settings); render at `index.html:6483-6557`
**Inside BRAIN?** no (UI rendering layer — backed by `MATH_INVARIANTS` registry, candidate to wrap in `BRAIN.diagnostics` bubble Bundle 31+)
**Smoke coverage:** `tests/smoke/diagnostics.smoke.js` (expand-button toggle, 3 assertions)
**Reads from:** `MathInvariants.invariants[]`, `MathInvariants.check()`, `S._invariantViolationCounts`
**Writes to:** `#math-health-content.innerHTML` (mirrored to `#sub-math-health-content` via renderAll mirror loop)
**Triggers:** —
**Related features:**
- child: `UI → SETTINGS → DIAGNOSTICS → MATH_HEALTH_CARD → VIEW_DETAILED_CHECKS_EXPAND`
- peer: `UI → SETTINGS → DIAGNOSTICS → BOOT_SELF_TEST_CARD` (sibling structural-checks card)
- backing-registry: `MATH_INVARIANTS` (16 named cross-cutting math invariants)
**Notes:** Pre-Bundle-30 showed only violation count. 1.A.6 added detailed-checks expansion. Mirror system at L6437 syncs legacy + sub-screen targets.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.6 (2026-05-18)

### UI: Math Health "View detailed checks" expand
**Path:** `UI → SETTINGS → DIAGNOSTICS → MATH_HEALTH_CARD → VIEW_DETAILED_CHECKS_EXPAND`
**Type:** action
**Lives in:** `index.html:6529-6545` (button + pane HTML generation)
**Inside BRAIN?** no (UI; uses helper `_toggleDetailPane`)
**Smoke coverage:** `tests/smoke/diagnostics.smoke.js` (tap → visible <100ms, tap → hidden <100ms, 2 assertions)
**Reads from:** `MathInvariants.invariants[]`, current violations set
**Writes to:** `.detail-pane` next-sibling `style.display`
**Triggers:** `_toggleDetailPane(this)`
**Related features:**
- helper: `UI → GLOBAL → _TOGGLE_DETAIL_PANE`
- peer: `UI → SETTINGS → DIAGNOSTICS → BOOT_SELF_TEST_CARD → VIEW_DETAILED_CHECKS_EXPAND` (same pattern)
**Notes:** Fix-forward 2026-05-18 — original used `getElementById('<fixed-id>')` which collided across legacy+sub mirror copies. Now uses relative-DOM lookup via `this.nextElementSibling` with class `.detail-pane`. See `_toggleDetailPane` for full history.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.6 fix-forward (2026-05-18)

### UI: Boot Self-Test card
**Path:** `UI → SETTINGS → DIAGNOSTICS → BOOT_SELF_TEST_CARD`
**Type:** screen
**Lives in:** HTML at `index.html:1582-1587` (sub-diagnostics only — no legacy mirror); render at `index.html:6562-6605`
**Inside BRAIN?** no (UI rendering layer — backed by `BRAIN.selfTest` bubble)
**Smoke coverage:** `tests/smoke/diagnostics.smoke.js` (expand-button toggle, 3 assertions)
**Reads from:** `BRAIN.selfTest.run()` (or `_lastRun`)
**Writes to:** `#sub-boot-test-content.innerHTML`
**Triggers:** `BRAIN.selfTest.run()` on demand
**Related features:**
- child: `UI → SETTINGS → DIAGNOSTICS → BOOT_SELF_TEST_CARD → VIEW_DETAILED_CHECKS_EXPAND`
- child: `UI → SETTINGS → DIAGNOSTICS → BOOT_SELF_TEST_CARD → RE_RUN_BUTTON`
- backing-bubble: `BRAIN → SELF_TEST`
- peer: `UI → SETTINGS → DIAGNOSTICS → MATH_HEALTH_CARD` (cross-cutting math vs structural)
**Notes:** New in Bundle 30 1.A.6. No legacy mirror — renders directly to sub-screen target. 43 checks displayed.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.6 (2026-05-18)

### UI: Boot Self-Test "View detailed checks" expand
**Path:** `UI → SETTINGS → DIAGNOSTICS → BOOT_SELF_TEST_CARD → VIEW_DETAILED_CHECKS_EXPAND`
**Type:** action
**Lives in:** `index.html:6592-6604`
**Inside BRAIN?** no (UI; uses helper `_toggleDetailPane`)
**Smoke coverage:** `tests/smoke/diagnostics.smoke.js` (tap → visible <100ms, tap → hidden <100ms, 2 assertions)
**Reads from:** `BRAIN.selfTest._lastRun.results[]`
**Writes to:** `.detail-pane` next-sibling `style.display`
**Triggers:** `_toggleDetailPane(this)`
**Related features:**
- helper: `UI → GLOBAL → _TOGGLE_DETAIL_PANE`
- peer: `UI → SETTINGS → DIAGNOSTICS → MATH_HEALTH_CARD → VIEW_DETAILED_CHECKS_EXPAND`
**Notes:** Uses same `_toggleDetailPane` helper as Math Health. Boot Self-Test isn't mirrored (no legacy copy) but uses the same robust pattern for consistency.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.6 fix-forward (2026-05-18)

### UI: Activity Log card (merged view + filter)
**Path:** `UI → SETTINGS → DIAGNOSTICS → ACTIVITY_LOG_CARD`
**Type:** screen
**Lives in:** HTML at `index.html:1607-1620` (sub-diagnostics, with filter row) + `index.html:1233-1237` (legacy); render at `index.html:15860-15953`
**Inside BRAIN?** no (UI rendering — reads from AUDITOR + BRAIN.audit, both backing logs)
**Smoke coverage:** none (planned: Bundle 30 1.A.7 follow-up — filter behaviour)
**Reads from:** `AUDITOR.log`, `S._auditLog`, `BRAIN.SOURCES`, `_auditFilter` module state
**Writes to:** `#audit-log-content.innerHTML`, `#sub-audit-log-content.innerHTML` (direct writes to both, no mirror dependency)
**Triggers:** —
**Related features:**
- child: `UI → SETTINGS → DIAGNOSTICS → ACTIVITY_LOG_CARD → TEXT_FILTER`
- child: `UI → SETTINGS → DIAGNOSTICS → ACTIVITY_LOG_CARD → SOURCE_TAG_FILTER`
- backing-log: `AUDITOR → LOG` (action-history forensic log, separate from BRAIN.audit)
- backing-log: `BRAIN → AUDIT → LOG` (`S._auditLog`, canonical-write event log with source tags)
**Notes:** Bundle 30 1.A.7 merged both logs into a unified view. AUDITOR entries marked with `AUDITOR` badge; BRAIN entries show source-tag (green badge). Both logs filtered together by text + optional source-tag dropdown.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.7 (2026-05-18)

### UI: Activity Log text filter
**Path:** `UI → SETTINGS → DIAGNOSTICS → ACTIVITY_LOG_CARD → TEXT_FILTER`
**Type:** element
**Lives in:** `index.html:1609-1611` (HTML input); handler at `index.html:6662-6669`
**Inside BRAIN?** no (UI input)
**Smoke coverage:** none (planned: Bundle 30 1.A.7 follow-up)
**Reads from:** input `value`
**Writes to:** `_auditFilter.text` module state
**Triggers:** `setAuditFilter('text', value)` → `renderAuditLog()`
**Related features:**
- helper: `UI → GLOBAL → SET_AUDIT_FILTER`
- peer: `UI → SETTINGS → DIAGNOSTICS → ACTIVITY_LOG_CARD → SOURCE_TAG_FILTER`
**Notes:** Substring match against action / notes / source / kind fields (case-insensitive). Re-renders on every keystroke (oninput).
**Last touched:** Bundle 30 Phase 1 Commit 1.A.7 (2026-05-18)

### UI: Activity Log source-tag dropdown filter
**Path:** `UI → SETTINGS → DIAGNOSTICS → ACTIVITY_LOG_CARD → SOURCE_TAG_FILTER`
**Type:** element
**Lives in:** `index.html:1612-1614` (HTML select); options populated at `index.html:15871-15878`
**Inside BRAIN?** no (UI input)
**Smoke coverage:** none (planned: Bundle 30 1.A.7 follow-up)
**Reads from:** `BRAIN.SOURCES` (for dropdown options), selected `value`
**Writes to:** `_auditFilter.source` module state
**Triggers:** `setAuditFilter('source', value)` → `renderAuditLog()`
**Related features:**
- helper: `UI → GLOBAL → SET_AUDIT_FILTER`
- peer: `UI → SETTINGS → DIAGNOSTICS → ACTIVITY_LOG_CARD → TEXT_FILTER`
- data-source: `BRAIN → SOURCES` (frozen tag vocabulary)
**Notes:** Auto-populated from BRAIN.SOURCES on first render (idempotent). Only filters BRAIN.audit entries (AUDITOR entries have no source field, are excluded when source filter is active).
**Last touched:** Bundle 30 Phase 1 Commit 1.A.7 (2026-05-18)

### UI: Dev Inspect card
**Path:** `UI → SETTINGS → DIAGNOSTICS → DEV_INSPECT_CARD`
**Type:** screen
**Lives in:** HTML at `index.html:1590-1604` (sub-diagnostics only); render at `index.html:6608-6635`
**Inside BRAIN?** no (UI rendering — backed by `BRAIN.devInspect` bubble)
**Smoke coverage:** `tests/smoke/diagnostics.smoke.js` (tap-check renders output <100ms, 2 assertions)
**Reads from:** `BRAIN.devInspect.checks[]`
**Writes to:** `#sub-dev-inspect-buttons.innerHTML`, `#sub-dev-inspect-output.textContent`
**Triggers:** `runDevInspectCheck(name)` on button tap
**Related features:**
- child: `UI → SETTINGS → DIAGNOSTICS → DEV_INSPECT_CARD → CHECK_BUTTON_<N>` (one per registered check)
- child: `UI → SETTINGS → DIAGNOSTICS → DEV_INSPECT_CARD → RUN_ALL_BUTTON`
- child: `UI → SETTINGS → DIAGNOSTICS → DEV_INSPECT_CARD → CLEAR_BUTTON`
- backing-bubble: `BRAIN → DEV_INSPECT`
**Notes:** New in Bundle 30 1.A.8. Mobile-native verification surface — replaces the need for desktop dev tools console access. 8 initial checks; extensible to future Bundle 30 phases.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.8 (2026-05-18)

### UI: Dev Inspect single-check buttons (extensible registry)
**Path:** `UI → SETTINGS → DIAGNOSTICS → DEV_INSPECT_CARD → CHECK_BUTTON_<N>`
**Type:** action
**Lives in:** rendered at `index.html:6620-6629` (one button per `BRAIN.devInspect.checks` entry)
**Inside BRAIN?** no (UI; backed by `BRAIN.devInspect.checks` registry)
**Smoke coverage:** `tests/smoke/diagnostics.smoke.js` (first button tap writes output, 2 assertions)
**Reads from:** check name from button data
**Writes to:** `#sub-dev-inspect-output.textContent`
**Triggers:** `runDevInspectCheck(name)` → `BRAIN.devInspect.run(name)`
**Related features:**
- backing-registry: `BRAIN → DEV_INSPECT → CHECKS`
- helper: `UI → GLOBAL → RUN_DEV_INSPECT_CHECK`
**Notes:** Each check is `{name, run}` in `BRAIN.devInspect.checks`. UI renders one button per entry. Future Bundle 30 phases push their own checks here.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.8 (2026-05-18)

### UI: Dev Inspect "Run all" button
**Path:** `UI → SETTINGS → DIAGNOSTICS → DEV_INSPECT_CARD → RUN_ALL_BUTTON`
**Type:** action
**Lives in:** `index.html:1600` (HTML); handler at `index.html:9968-9982`
**Inside BRAIN?** no (UI; calls into BRAIN.devInspect)
**Smoke coverage:** none (planned: Bundle 30 1.A.8 follow-up)
**Reads from:** `BRAIN.devInspect.runAll()` results
**Writes to:** `#sub-dev-inspect-output.textContent`
**Triggers:** `BRAIN.devInspect.runAll`
**Related features:**
- backing-method: `BRAIN → DEV_INSPECT → RUN_ALL`
- peer: `UI → SETTINGS → DIAGNOSTICS → DEV_INSPECT_CARD → CHECK_BUTTON_<N>` (single-run version)
**Notes:** Renders all 8 (or however many extended in later phases) check results in the output area, one per line.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.8 (2026-05-18)

### Settings → Data & Backup: Pre-bundle-30 snapshot
**Path:** `UI → SETTINGS → DATA_AND_BACKUP → SNAPSHOTS → PRE_BUNDLE_30_ENTRY`
**Type:** element
**Lives in:** auto-taken at boot via `BRAIN.balance._initPreBundle30Snapshot`; rendered in snapshot list at `index.html:16188-16224`
**Inside BRAIN?** yes (initiated by `BRAIN.balance._initPreBundle30Snapshot`)
**Smoke coverage:** `tests/smoke/diagnostics.smoke.js` (snapshot exists + tagged, 2 assertions)
**Reads from:** `SNAPSHOTS.load()` (looks for `s.reason === 'pre-bundle-30'`)
**Writes to:** `SNAPSHOTS` ring (one entry, pinned via `tagged: true`)
**Triggers:** —
**Related features:**
- creator: `BRAIN → BALANCE → _INIT_PRE_BUNDLE_30_SNAPSHOT`
- displayed-in: `UI → SETTINGS → DATA_AND_BACKUP → SNAPSHOTS → LIST`
**Notes:** Belt-and-suspenders insurance for Bundle 30 migration. Pinned forever so eviction cannot sweep. External JSON export (per Q2) is the second insurance layer.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.5 fix-forward (2026-05-18)

### Helper: _toggleDetailPane
**Path:** `UI → GLOBAL → _TOGGLE_DETAIL_PANE`
**Type:** helper
**Lives in:** `index.html:6672-6683`
**Inside BRAIN?** no (UI helper — module-level function; consolidation candidate for Bundle 31+ `BRAIN.uiHelpers` bubble)
**Smoke coverage:** `tests/smoke/diagnostics.smoke.js` (toggle pattern via expand buttons, 4 assertions)
**Reads from:** `btn.nextElementSibling`
**Writes to:** `pane.style.display`
**Triggers:** —
**Related features:**
- consumer: `UI → SETTINGS → DIAGNOSTICS → MATH_HEALTH_CARD → VIEW_DETAILED_CHECKS_EXPAND`
- consumer: `UI → SETTINGS → DIAGNOSTICS → BOOT_SELF_TEST_CARD → VIEW_DETAILED_CHECKS_EXPAND`
**Notes:** Fix-forward 2026-05-18 — replaces inline `getElementById('<fixed-id>')` pattern that broke under the renderAll mirror system (duplicate IDs across `#math-health-content` and `#sub-math-health-content`). Uses `this.nextElementSibling` for scope-correct toggling. Pane must be the next sibling AND tagged with class `.detail-pane`.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.6 fix-forward (2026-05-18)

### Helper: setAuditFilter / _auditFilter
**Path:** `UI → GLOBAL → SET_AUDIT_FILTER`
**Type:** helper
**Lives in:** `index.html:6654-6669`
**Inside BRAIN?** no (UI module state — consolidation candidate for Bundle 31+ `BRAIN.uiState` bubble)
**Smoke coverage:** none (planned: Bundle 30 1.A.7 follow-up)
**Reads from:** filter input values
**Writes to:** `_auditFilter` module-level state object
**Triggers:** `renderAuditLog()`
**Related features:**
- consumer: `UI → SETTINGS → DIAGNOSTICS → ACTIVITY_LOG_CARD → TEXT_FILTER`
- consumer: `UI → SETTINGS → DIAGNOSTICS → ACTIVITY_LOG_CARD → SOURCE_TAG_FILTER`
**Notes:** Module-level filter state. Setter validates key against known properties. Calls renderAuditLog on every change (debouncing TBD if perf becomes an issue).
**Last touched:** Bundle 30 Phase 1 Commit 1.A.7 (2026-05-18)

### Helper: getLiveBal (alias)
**Path:** `UI → GLOBAL → GET_LIVE_BAL`
**Type:** helper
**Lives in:** `index.html:3333-3341`
**Inside BRAIN?** no (legacy alias — Phase 3+ migrates readers to `BRAIN.balance.get()` directly, then this helper can be removed Bundle 32+)
**Smoke coverage:** `tests/smoke/diagnostics.smoke.js` (alias contract, 1 assertion)
**Reads from:** `BRAIN.balance.get()` (with defensive fallback to `S.bal`)
**Writes to:** —
**Triggers:** —
**Related features:**
- backing-bubble: `BRAIN → BALANCE → GET`
- consumers: ~97 read sites across `index.html` (migration in Phase 3)
**Notes:** Bundle 30 1.A converted from `function getLiveBal() { return S.bal; }` to thin alias for `BRAIN.balance.get()`. Defensive fallback handles boot ordering edge cases. ~97 callers; Phase 3 migrates them over multiple bundles.
**Last touched:** Bundle 30 Phase 1 Commit 1.A (2026-05-18)

### Inventory: AUDITOR (separate balance-change observer)
**Path:** `AUDITOR`
**Type:** bubble (legacy, not part of BRAIN)
**Lives in:** `index.html:15786-15852`
**Inside BRAIN?** no (predates BRAIN — separate audit log + anomaly detection; **Bundle 31 candidate ADR: "Migrate AUDITOR into BRAIN.audit as a tiered observer layer"**)
**Smoke coverage:** none (Bundle 31+)
**Reads from:** `S.bal`, `getGenuineSurplus()`, `S.debts`, etc.
**Writes to:** `AUDITOR.log[]`, `localStorage['slyght_audit_log']`
**Triggers:** Anomaly badge on UI, console warnings
**Related features:**
- peer: `BRAIN → AUDIT` (parallel log with different shape)
- displayed-in: `UI → SETTINGS → DIAGNOSTICS → ACTIVITY_LOG_CARD` (merged with BRAIN.audit in Bundle 30 1.A.7)
- shim: `BUNDLE-30-AUDITOR-SHIM` (Phase 1.B) — `BRAIN.balance` writers also call `AUDITOR.record` so anomaly detection survives the migration
**Notes:** 17 call sites across the codebase. Anomaly detection uses balance-before/balance-after/expected-change semantics. The BUNDLE-30-AUDITOR-SHIM marker enables grep-driven removal when the Bundle 31 ADR lands. Until then: dual-log.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.7 (merge into Activity Log view, no semantic changes)

### Inventory: MathInvariants registry
**Path:** `MATH_INVARIANTS`
**Type:** bubble (legacy, not part of BRAIN)
**Lives in:** `index.html:4593-...` (registry definition; ~16 entries currently)
**Inside BRAIN?** no (predates BRAIN — **Bundle 31 candidate ADR: "Migrate MathInvariants into BRAIN.invariants and bridge with FINANCIAL-INVARIANTS.md namespace"**)
**Smoke coverage:** none for the registry itself; one consumer (Math Health card) has smoke coverage for the expand interaction
**Reads from:** `S.*` (cross-cutting state checks)
**Writes to:** `S._invariantViolationCounts` (session counts)
**Triggers:** Tier-based banner/card surfacing
**Related features:**
- displayed-in: `UI → SETTINGS → DIAGNOSTICS → MATH_HEALTH_CARD`
- peer: `BRAIN → SELF_TEST` (separate registry — structural-bubble checks vs cross-cutting math)
- spec-source: `FINANCIAL-INVARIANTS.md` (Bundle 31+ bridge)
**Notes:** Three tiers — critical/fail/warn. Runs at end of every renderAll (≤5ms budget). 16 invariants currently. Naming convention (`state-shape-balance`, `paidbills-key-not-future`, etc.) is registry-internal, NOT mapped to INV-NN from FINANCIAL-INVARIANTS.md (the spec) — Bundle 31+ bridge.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.6 (Math Health card expanded to show all entries)

### Inventory: SNAPSHOTS module
**Path:** `SNAPSHOTS`
**Type:** bubble (legacy, not part of BRAIN)
**Lives in:** `index.html:15992-16188`
**Inside BRAIN?** no (predates BRAIN — **Bundle 32+ candidate ADR: "Migrate SNAPSHOTS into BRAIN.snapshots"** — low priority)
**Smoke coverage:** none directly (smoke verifies one snapshot's existence + tagging via SNAPSHOTS.load)
**Reads from:** `localStorage['slyght_snapshots']`
**Writes to:** `localStorage['slyght_snapshots']`
**Triggers:** —
**Related features:**
- consumer: `BRAIN → BALANCE → _INIT_PRE_BUNDLE_30_SNAPSHOT`
- displayed-in: `UI → SETTINGS → DATA_AND_BACKUP → SNAPSHOTS`
- creator-of: `UI → SETTINGS → DATA_AND_BACKUP → SNAPSHOTS → PRE_BUNDLE_30_ENTRY`
**Notes:** Tiered eviction (24h/7d/30d/weekly+). Tagged snapshots pinned forever. 250 hard cap. `take(reason)` returns the new snapshot object. Bundle 21 fixed the slice-direction bug. Bundle 30 1.A.5 fixed the idempotency-by-wrong-field bug for the pre-bundle-30 entry path.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.5 (consumer fix-forward; module itself unchanged)

---

## Features (v2 schema) — Smoke infrastructure (Bundle 30 1.A.6)

### Smoke spec: diagnostics
**Path:** `TESTS → SMOKE → DIAGNOSTICS`
**Type:** element (test artifact)
**Lives in:** `tests/smoke/diagnostics.smoke.js`
**Inside BRAIN?** no (test infrastructure)
**Smoke coverage:** N/A (this IS the smoke)
**Reads from:** `state-snapshot.json` fixture, deployed/local app via Playwright
**Writes to:** — (read-only verification)
**Triggers:** Playwright assertions
**Related features:**
- verifies: `UI → SETTINGS → DIAGNOSTICS → MATH_HEALTH_CARD → VIEW_DETAILED_CHECKS_EXPAND`
- verifies: `UI → SETTINGS → DIAGNOSTICS → BOOT_SELF_TEST_CARD → VIEW_DETAILED_CHECKS_EXPAND`
- verifies: `UI → SETTINGS → DIAGNOSTICS → DEV_INSPECT_CARD → CHECK_BUTTON_<N>`
- verifies: `UI → SETTINGS → DATA_AND_BACKUP → SNAPSHOTS → PRE_BUNDLE_30_ENTRY`
- verifies: `UI → GLOBAL → GET_LIVE_BAL` (alias contract)
- config: `playwright.smoke.config.js`
- run-via: `npm run smoke`
**Notes:** 5 assertions across 5 tests. Local default; deployed via `$env:SMOKE_BASE_URL` (PowerShell) or `SMOKE_BASE_URL` env var (Unix). Per CC manual §3 Deploy-check amendment, this is the mandatory pre-phone-verify check for any commit adding interactive surfaces.
**Last touched:** Bundle 30 Phase 1 Commit 1.A.6 fix-forward (2026-05-18)

---

**End of v2-schema diagnostic-surface backfill. Legacy v1 tables continue below.**

---

## CURRENT — Dashboard tab (`#pg-dash`)

| Surface | Render fn | DOM target | Reads | Writes via | Cross-references |
|---|---|---|---|---|---|
| Hero balance | `renderAll` inline (~L4960) | `#h-bal` | `S.bal` via `getLiveBal()` | `openHeroBalEdit` → `confirmHeroBalEdit` → `runRecon` → `applyBalanceCorrection` → `BRAIN.transaction.recordCorrection` | Footer NW, Settings hero (removed), persistent strip |
| Today's spent text | `renderAll` inline (~L5261) | `#h-note` | `BRAIN.dashboard.todayOutflows()` (Bundle 28 round 24 — canonical superset of `todayTxns`, includes debt + bills + savings + loan + CC payment cats; splits via `_DEBT_CATEGORIES_SET` for debt subline + Bills filter for bills subline) · `getTodaySpent()` for the discretionary headline | `BRAIN.transaction.record` (LOG_EXPENSE) | Footer "$X left today", MAX PER DAY math. **Round 24 fix:** debt subline used to string-match `'Debt repayment'` only (1/4 debt cats) — $780 KIA Loan payments were invisible. Now uses canonical Set. |
| Liquid net worth | `renderAll` inline (~L4978) | `#nw-val` | `MODEL.liquidNet` from `calculateNetWorth()` | Various BRAIN.assets writers | NW modal, footer NW |
| Days to payday bar | `renderAll` inline (~L4985-5010) | `#pd-fill`, `#pd-lbl` | `MODEL.daysToPayday` | `BRAIN.config.setPayday` | MAX PER DAY math, Ask AI prompt |
| Survival banner | `renderSurvivalBanner` (~L2336) | `#dash-survival-banner` | `MODEL.survivalMode`, `getLiveBal`, `getActiveDebtsDueBeforePayday` | n/a (read-only render) | Alert cards, MAX PER DAY context |
| MAX PER DAY card | `renderAll` inline (~L5040) | `#max-day-display`, `#max-day-context`, `#pace-display` | `getDynamicDailyBudget()` (which reads S.bal, getBillsDue, getActiveDebtsDueBeforePayday, S.weekdayBudget/weekendBudget, getTodaySpent) | Cap edited via Settings → `BRAIN.config.setWeekdayBudget` / `BRAIN.config.setWeekendBudget` | Tap → `explainMaxPerDay()` modal (Bundle 28 P1) |
| Pace tile ("Running $X over pace") | `renderAll` inline (~L5475) | `#pace-display` | `getThisWeekProjection()` (Bundle 28 round 31 — aligned with Bills tab Week Projection so both surfaces show same number) | n/a | Tappable (Bundle 28 round 34) → opens `explainWeekProjection()` math modal — same explainer the Bills tab "?" button uses |
| Alert cards | `renderAlerts` (~L5468) | `#dash-alerts` | `MODEL.shouldShowSpendingAlert`, `MODEL.survivalMode`, debts/bills math | n/a | Survival banner suppresses these when mode ≠ 'normal' |
| Immediate debts | `renderDebtTiles` | `#debt-grid` | `S.debts.filter(d => !d.paid && !d.viaRent)` | `BRAIN.debts.markPaid`/`unmark`/`update` | Add via `openAddDebtModal` → `saveNewDebt` → `BRAIN.debts.add` |
| Recent Spending | `renderDashTxns` | (~txn list area) | `S.txns` recent slice | Tap row → `editTransaction` → `txn-edit-modal` → `saveEditedTransaction` (DIRECT mutation — needs `BRAIN.transaction.update` Bundle 29) / `deleteEditedTransaction` (DIRECT — needs canonical) / `convertEditedTransactionToLoan` (Bundle 28 → `BRAIN.transaction.reclassify`) | Hero today, footer, Analysis pivot all read S.txns separately |
| Monthly position | `renderMonthlyPosition` | (~near alerts) | `MODEL` cycle fields, `getGenuineSurplus` | n/a (read) | Surplus tile |

**Modals on Dashboard:**
- `#h-bal-edit` (inline below hero) — balance edit UI
- `#recon-modal` — reason picker after balance change (z-index 620)
- `#debt-modal` — edit/clear debt (z-index 600)
- `#nw-modal` — Net Worth breakdown (z-index 600)
- `#txn-edit-modal` — edit transaction (incl Convert-to-loan) (z-index 600)
- `#add-debt-modal` — create new debt (z-index 600)
- `#bucket-modal` — edit savings bucket (z-index 600)
- `#add-bucket-modal` — create new bucket (z-index 600)
- `#quick-log-modal` — log transaction (z-index 600)
- `#cat-modal` — category detail (z-index 600)
- `#mark-paid-modal` — mark bill paid mode picker

---

## PLAN mode (`#plan-mode` slide-over)

Opens via `openPlanMode()` (L14460). z-index 500. Contains:

| Surface | Render fn | DOM target | Reads | Writes via |
|---|---|---|---|---|
| Liquid NW header | `renderPlanMode` inline (~L17518) | inline html | `nw.liquidNet`, `nw.breakdown.superBalance` | n/a |
| Payday Plan tile (Bundle 28.2: moved above WRX) | `renderAllocateTile` (~L18092) | inline html | `BRAIN.plan.getSnapshot()`, `BRAIN.allocation` | `openPaydayPlan()` → canvas |
| WRX status card | `renderWrxCard` (~L17558) | inline html | `S.wrxStatus`, `S.wrxValue`, `S.carloan`, `S.kiaEarlyRepayFee` | Direct mutation (Bundle 29 candidate for `BRAIN.assets.setWrxState`) |
| Trips section | `renderTrips` (~L19324) | inline html | `PLAN.getTrips()` | + Add trip → `addNewTrip` → `confirmNewTrip` → `PLAN.saveTrip` + `BRAIN.plan.intent.add` (Bundle 28 round 5) |
| Goals section | `renderGoalCards` (~L19797) | inline html | `PLAN.getGoals()` | + Add goal → `addNewGoal` → `confirmNewGoal` → `PLAN.saveGoal` + `BRAIN.plan.intent.add` |
| Goal card buttons | inline in renderGoalCards | each goal card | n/a | ✏️ `editGoal` · `addGoalSavings` · ✅ `markGoalComplete` · 🗑️ `confirmDeleteGoal` (Bundle 28 round 6) |
| Super card | `renderSuperCard` | inline html | `S.superBalance`, `S.superMonthlyContrib`, `S.superGrowthRate` | n/a (settings-bound) |
| Annual Provisions | `renderAnnualProvisions` (~L18980) | inline html | `PLAN.getAnnualProvisions()` + `getCustomProvisions()` | Direct localStorage `slyght_provisions` (Bundle 29 canonical writer candidate) |
| Income Simulator | `renderIncomeSimulator` | inline html | `S.income`, `S.bonusQuarterly` | `BRAIN.config.setIncome` |
| Expected Extra Income | inline | `#bonus-list` | `S.bonuses` array | `addBonus` → modal → `confirmBonusAmount` (direct write, Bundle 29 candidate) |

**Modal hoisted out of PLAN mode** (Bundle 28 round 6):
- `#plan-modal-overlay` — used by `PLAN_MODAL.open/close` for goal/trip/bonus dialogs. NOW at top-level body, z-index 601 applies globally.

---

## Payday Plan canvas (`#pg-payday-plan` slide-over over PLAN mode)

Opens via `openPaydayPlan()` (~L7679). z-index 510. Contains a root view + 5 sub-screens.

| Surface | Render fn | DOM target | Reads | Writes via |
|---|---|---|---|---|
| Canvas root | `renderPaydayPlanRoot` (~L7795) | `#pg-payday-plan-content` | `BRAIN.plan.getSnapshot()` | n/a (read) |
| Bills sub-screen | `renderPaydayBills` (~L8550) | `#payday-bills-body` | `BRAIN.bills.getThisCycle()`, `S.activePlan.overrides`, `S.activePlan.ticks.bill` | `openEditPaydayBill` → `BRAIN.plan.setOverride('bill', ...)` · tick → `paydayTick('bill', ...)` → `BRAIN.plan.tickItem` |
| Debts sub-screen | `renderPaydayDebts` (~L8665) | `#payday-debts-body` | `S.debts` filter !paid && !viaRent | `openEditPaydayDebt` → `BRAIN.plan.setOverride('debt', ...)` |
| Daily Living sub | `renderPaydayLiving` | `#payday-living-body` | `S.activePlan.dailyLivingFloor`, `snap.daysInCycle` | `openEditPaydayDailyFloor` → `BRAIN.plan.setDailyLivingFloor` |
| Savings sub-screen | `renderPaydaySavings` (~L8705) | `#payday-savings-body` | `BRAIN.savings.getBuckets()`, `PLAN.getTrips()`, `S.activePlan.overrides`/`ticks.savings`/`savings` | `openEditPaydaySavings`/`openEditPaydayTripAlloc` → `BRAIN.plan.setOverride('savings', ...)` · `openEditPaydayKiaExtra` (Bundle 28 round 1) → setOverride on 'kia-extra' |
| Upcoming sub | `renderPaydayUpcoming` (~L8833) | `#payday-upcoming-body` | `S.activePlan.knownUpcoming` | `BRAIN.plan.addKnownUpcoming`/`removeKnownUpcoming`/`updateKnownUpcoming` |
| Footer of Savings sub | inline in `renderPaydaySavings` (~L9219) | `#payday-savings-body` (end) | n/a | + 🎯 `addNewGoal` · + ✈️ `addNewTrip` · + 💰 `openAddBucketModal` (Bundle 28 round 5) |

**EDIT_MODAL** (canvas dialogs) — `.edit-modal` class, z-index 700. Used for every Payday-canvas editor. Created via `EDIT_MODAL.openCustom({title, hint, bodyHtml, onReady, save})` or `EDIT_MODAL.openInfo({title, body})`.

**Boot self-test** — fires DOMContentLoaded+500ms, ~25 checks (Bundle 27 onwards). Failures log to `console.error` + `BRAIN.audit` as `boot_self_test_fail`. Visible in Settings → Diagnostics → Activity Log.

---

## Settings (`#pg-settings`)

Bundle 22 v3 IA: Samsung-style root nav + 6 sub-screens (slide animations, z-index 5 within settings). Each sub-screen has settings-edit-rows. Tap to open `EDIT_MODAL`. Save → `BRAIN.config.set*` canonical writer.

| Sub-screen | Edits | Canonical writer |
|---|---|---|
| Financial Data | income, payday, weekday budget, weekend budget, super balance, mum balance, carloan, ccLimit | `BRAIN.config.set{Income,Payday,WeekdayBudget,WeekendBudget}` + `BRAIN.assets.set*` |
| Strategies | debt strategy (snowball/avalanche) | `BRAIN.config.setStrategy` |
| AI Assistant | api key, round-ups on/off, round-up destination, api alert threshold | (`S.apiKey` still direct, Bundle 29) + `BRAIN.config.setRoundUpsEnabled` + `BRAIN.savings.setRoundUpDestination` |
| Notifications | smart notifications toggle | (NOTIFY module direct writes — Bundle 29 → BRAIN.notifications) |
| Data & Backup | snapshots list, export, import, time machine | `SNAPSHOTS.take`/`SNAPSHOTS.restore` · `copyExport` · `buildFullExport` |
| Diagnostics | math health, activity log, build info, debug toggles | n/a (read-only) |

Hero balance was REMOVED from Settings Bundle 28 round 2 — dashboard hero is single source.

---

## State shape — where each field lives + writer

| `S.X` | Purpose | Canonical writer | Read by |
|---|---|---|---|
| `S.bal` | Current bank balance | `applyBalanceCorrection` (recon) + per-flow math | Hero, footer, MAX PER DAY, surplus calcs |
| `S.txns` | Transaction ledger | `BRAIN.transaction.record` / `recordCorrection` / `reclassify` / `removeByTs` | Analysis pivot, Recent Spending, getTodaySpent, etc. |
| `S.debts` | Debt entries | `BRAIN.debts.{add,markPaid,unmark,update,delete}` | Immediate Debts tile, MAX PER DAY math, debt strategies |
| `S.paidBills` | Paid-bill flags | `BRAIN.bills.{markPaid,unmark}` | Bills tab, getBillsDue, calendar markers |
| `S.savingsBuckets` | Savings money piles | `BRAIN.savings.{setBucketSaved,addToBucket,addBucket,updateBucket,removeBucket}` (Bundle 28) | Savings sub-screen, Goals (via bucket-link), AI context |
| `S.activePlan` | Per-cycle payday plan | `BRAIN.plan.{setOverride,clearOverride,tickItem,untickItem,addKnownUpcoming,removeKnownUpcoming,updateKnownUpcoming,setBonus,setDailyLivingFloor,setBufferFloor,lock,unlock,...}` | Canvas root + sub-screens, getSnapshot |
| `S.planIntents` | Canonical intent entities (Bundle 28 Phase 0) | `BRAIN.plan.intent.{add,update,remove,setBucket}` | (Future readers — currently parallel structure populated by seedV25) |
| `S.tripDefs` / `S.goalDefs` | Legacy trip/goal stores (pre-intents) | `PLAN.saveTrip` / `PLAN.saveGoal` (legacy — Bundle 29 migration to intents) | PLAN mode renderTrips, renderGoalCards |
| `S.income` / `S.payday` / `S.weekdayBudget` / `S.weekendBudget` | Config scalars | `BRAIN.config.set*` (Bundle 22 v3) | MAX PER DAY math, getDynamicDailyBudget |
| `S.debtStrategy` | "snowball" or "avalanche" | `BRAIN.config.setStrategy` | renderDebtTiles, getSurplusSuggestion |
| `S.mumAccountBalance` / `S.superBalance` / `S.cc` / `S.ccLimit` / `S.carloan` / `S.carloanOriginal` | Asset/liability balances | `BRAIN.assets.set*` (Bundle 24, partial) | calculateNetWorth, debt math |
| `S.wrxStatus` / `S.wrxValue` / `S.wrxSalePrice` | WRX sale state | Direct (Bundle 29 → `BRAIN.assets.setWrxState`) | WRX card, KIA payoff calc |
| `S.apiKey` | Anthropic API key | Direct (Bundle 29 → `BRAIN.config.setApiKey`) | Chat send |
| `S.paydayReceived` / `S.paydayReceivedDate` | Salary-landed flag | Direct in balance-edit + month rollover (Bundle 29 → BRAIN.cycle) | Hero text, MAX PER DAY context, banner |
| `S.chatHistory` | Chat ledger | Direct in sendChatMessage (Bundle 29 → BRAIN.chat) | Chat tab |
| `S.notifications` | In-app notifications | NOTIFY module (not BRAIN bubble — Bundle 29 candidate) | Notification bell |
| `S._auditLog` | Append-only mutation event log | `BRAIN.audit.append` | Diagnostics activity log, AI agent context |

---

## Critical helpers (pure readers — composable)

| Helper | Returns | Filter |
|---|---|---|
| `getLiveBal()` | Current real balance (S.bal + projection adjustments) | n/a |
| `getTodaySpent()` | Today's discretionary spend | `_NON_SPEND_CATS.has(cat)` excluded |
| `getDiscretionaryByCategory(from, to)` | { cat: {total, count, txns} } STRICT | excludes `_NON_SPEND_CATS` |
| `getAllOutflowsByCategory(from, to)` | { cat: {total, count, txns} } BROAD (Bundle 28 round 5) | excludes only income/corrections/roundups |
| `getDiscretionarySpend(from, to)` | Number — LAX filter | Bundle 28 round 5: deprecated in favour of strict OR all-outflows depending on intent |
| `getDynamicDailyBudget()` | Live max-per-day (cap-aware) | n/a — composes balance/bills/debts/days/cap/today-spent |
| `getGenuineSurplus()` | Balance-based "what's truly free" | n/a — Bundle 29 candidate to migrate consumers to BRAIN.plan.getSnapshot |
| `getBillsDue()` | Bills due BEFORE payday | excludes paid + non-recurring + future-month |
| `getActiveDebtsDueBeforePayday()` | Total debt minimums BEFORE payday | excludes paid + viaRent |
| `computeFinancialModel()` | Rebuilds MODEL — every render-time number | All canonical inputs |
| `_NON_SPEND_CATS` (Set) | Categories NOT counted as discretionary spend | `['Debt repayment','Income','Savings','Bills','Transfer','Loan','Car Loan','CC Payment']` |

---

## Layer V capture surfaces (visual regression)

`scripts/layerV-capture.js` (~611 lines) hits LIVE_URL (xetonx.github.io/slyght or local). Fixture: `state-snapshot.json`. 40+ captures across Dashboard / Bills / Plan / Chat / Analysis / Settings / Modals. Bundle 28 round 4 added captures #38-#42 for balance edit + z-index verification.

---

## How to add a new feature without breaking adjacent code

1. **Find the surface** in this map (or the nearest related surface)
2. **Identify the writer** — if no canonical writer exists, add one to BRAIN before mutating state
3. **Identify other readers** — which surfaces will see the change? Update or invalidate as needed
4. **Add boot self-test entry** for the new fn (mirrors the canary at L9460+)
5. **Layer V capture** of the new surface
6. **Update this map** — add the row before declaring done

---

## Self-correction queue (gaps I caught in retrospect)

- Round 6 — I bumped z-index numbers in round 4 without checking parent stacking context. Won't repeat: always check `transform` / `filter` / `opacity<1` on parents.
- Round 7 — I migrated dead renderers (renderTrend/renderCatBreakdown DOM IDs don't exist). Won't repeat: grep `id="X"` in DOM before migrating consumers of `$('X')`.
- Round 8 — I added `confirmNewGoal` intent creation in round 5 but forgot the matching `confirmDeleteGoal` intent removal. Won't repeat: add CREATE + DELETE pair in same round; cross-reference both in this map.
- Round 9 — I added a 🗑️ button to renderGoalCards in round 6 but DIDN'T add the parallel button to renderTrips cards AND didn't add an in-canvas delete affordance for bucket/trip rows in Savings sub-screen. John flagged both. Won't repeat: when adding an action to one card-type, audit ALL sibling card-types (goal/trip/bucket/provision) for the same affordance.
- Round 9 — I used `EDIT_MODAL.openInfo` with plain-pre-text body for explainers. That produced "just lines, not bubbles". Now I use rich HTML cards inside the body string + wrap in `<div style="white-space:normal">` to negate the pre-line CSS. Pattern locked: explainer/info modals use HTML cards, not plain text.
- Ongoing — when a render fn calls another (e.g. confirmDeleteGoal needs renderPaydaySavings refresh), check ALL surfaces that read the affected state, not just the obvious parent surface.

## Round 9 additions to the map

- `renderGoalCards` → 🗑️ button (round 6)
- `renderTrips` → 🗑️ button (round 9 — parallel to goal cards)
- `confirmDeleteTrip(tripId)` → new (round 9). Mirrors confirmDeleteGoal: removes from S.tripDefs + cascades auto-bucket cleanup + removes linked intent (for 'trip-*' ids) + refreshes PLAN mode + canvas
- `openEditPaydaySavings` → Delete-this-savings-goal footer button (round 9). Calls confirmDeleteBucketFromCanvas
- `openEditPaydayTripAlloc` → Delete-this-trip footer button (round 9). Calls confirmDeleteTrip
- `confirmDeleteBucketFromCanvas(bucketName)` → new (round 9). Wrapper for the canvas-context delete: removes bucket via BRAIN.savings.removeBucket + manual intent cascade + closes EDIT_MODAL + refreshes everywhere
- `explainMaxPerDay` → rich HTML rebuild (round 9). Hero gradient card + progress bar with colour-by-percentage + money breakdown grid table + time math + today's outflow split + timing-aware warning card
- `buildSpendingPivot` debt category tip → reformatted (round 9). Bulleted category list + bold total + recommendation in muted text

## Rounds 43–51 additions to the map

**Phone-verify-driven fixes (rounds 45–51):**
- `renderAlerts` "safe" calc — round 45 removed bucket double-subtraction + strict `< paydayDate` for debts on the safe line. The Canvas-wide `safe` value now matches John's "$11 - $31 = -$20" mental model.
- `renderAllocateTile` (PLAN dashboard) — round 47 rewired to read `BRAIN.plan.getSnapshot()` (same source as Canvas) so both surfaces show identical "$X left to allocate" headline. Includes annual provisions in essentials.
- `renderPaydayPlanRoot` — round 47 added Annual Provisions as 4th Essentials category with `🏦` icon. Tap → `explainAnnualProvisions()` modal showing per-month + per-year for each (Teachers Health / KIA insurance/service/rego/green slip).
- `renderPaydayBills` — round 47 split each section (Before/After payday) into UNPAID (visible) + PAID (collapsed `<details>`). r50 then merged `today + week + next + later` into Monthly section so the comprehensive monthly view shows every bill in the cycle. r51 tightened row density (~25% denser).
- `renderPaydayDebts` — round 47 includes viaRent debts sorted to the end with `🏠 VIA RENT` + `$X/mo via salary` subline tags. autoDebit debts get `🤖 AUTO`.
- `openEditPaydayBill` — round 49 rewrote with Paid/Deferred toggle (was quick-pick grid). Defer mode opens amount + late-fee fields with live "carries to next cycle $X" preview.
- `openEditPaydayDebt` — round 49 dropped 125%/150% rows from quick picks; now 0/25%/50%/75%/100% + Custom.
- `openPaydayAutoAllocate` — round 49 led with `🔒 Already covered first` essentials breakdown; r51 added unlinked-trips section with `[+ Bucket]` action button (triggers `_createBucketForTrip`).
- `buildDebtFreedomProjection` — r39 urgency-bucket sort; r42 within-bucket daysUntil tiebreaker; r48 included monthly-payment-freed compound effect.
- `explainMaxPerDay` + `explainWeekProjection` — r45/r48 added "📈 What is pace?" card with concrete numbers (daily target / expected / actual / over-under).
- New `fmtAuDate(d, opts)` helper at top of script (after `fmtC`). Style short `21 May` / long `21st May`. Auto-includes year when out-of-current-year.
- `openBnplModal` — r36/r41/r48: per-payment + payments-remaining + freq + start. r48 calendar-aware date math via `setDate` (was UTC-via-toISOString — off-by-one). r50 preview now uses fmtAuDate.

**Canonical writers (rounds 10–23, doc reference):**
- `BRAIN.transaction.update(ts, patch, source)` + `removeByTsWithBalance` — round 10 + r11 (sign-fix) + r12 (idempotency)
- `BRAIN.assets.setWrxValue` / `setWrxStatus` — round 13
- `BRAIN.assets.setKiaEarlyRepayFee` / `resetKiaEarlyRepayFee` — round 19
- `BRAIN.chat` bubble (12th) — round 14
- `BRAIN.cycle` bubble (13th) — round 17 for paydayReceived lifecycle
- `BRAIN.config.setApiKey` / `setApiAlertThreshold` — rounds 15/21
- `BRAIN.audit.appendReconLog` / `query(criteria)` — rounds 18/20
- 60+ `BRAIN.SOURCES` tags (frozen + `_SOURCE_SET` literal)
- `_autoExpireDebts` helper called from `onStateChange` + post-load (r35/r42)
- `_isBillActiveAsOf(b, asOfDate)` filter inside `getExpandedBills` (r35)
- `BRAIN.audit.query({type, typePrefix, source, sourcePrefix, sinceTs, untilTs, predicate, limit})` — AI introspection API (r20)

**ADRs + docs:**
- `docs/adr/ADR-001-canonical-writer-pattern.md` — accepted, captures pattern + 13 bubbles
- `docs/manual-amendments/AMENDMENT-001-noticed-action-plans.md` — phone-verify format

## Rounds 29–42 additions to the map

**Debt tiles (round 29):**
- `renderDebtTiles` now includes viaRent + autoDebit debts with distinct visual modes (amber/blue themes, VIA-RENT / 🤖 AUTO badges). Round 32 split badges onto their own row above the name (round 27's 2-line clamp). IMMEDIATE total ($1,031) stays manual-only — viaRent doesn't inflate.
- `autoSortDebts` (round 26) → custom `EDIT_MODAL.openCustom` instead of native confirm(). Score: +40 for autoDebit, +60 for viaRent (round 29) so manual-pay debts always sort first.

**Schema additions (rounds 29, 35):**
- Debts: `autoDebit` flag (round 29), `endDate` (round 35). Both surfaced in add-debt + edit-debt modals. `BRAIN.debts.update` MUTABLE allow-set extended.
- Bills: `endDate` (round 35) for time-bounded bills. `getExpandedBills` filters expired bills via new `_isBillActiveAsOf` helper.

**New helpers (rounds 35, 37, 39, 42):**
- `_autoExpireDebts()` — scans for endDate-past debts, flips `paid:true` via canonical writer (no clearance txn). Called from `onStateChange` (action-triggered) AND post-load (round 42).
- `buildDebtFreedomProjection()` — phased cascade replacing the pre-r37 single-number estimate. Round 39 urgency-bucket sort + round 42 daysUntil tiebreaker.

**BNPL quick-add (rounds 36, 41):**
- New `bnpl-modal` HTML + `openBnplModal()` / `_bnplRecompute()` / `saveBnpl()` / `_bnplSelect()` JS. Round 41 refactor: inputs are per-payment + remaining (not total + count) so John can backfill mid-plan Afterpay debts. Chips 1/2/3/4 (was 4/6/8).
- Triggered by `💳 BNPL` button next to `+ Add A Bill` on Bills tab.

**Quick Log type chips (rounds 34, 38, 42):**
- Native `<select>` for txn-type replaced with chip-row pattern. Round 38 types: Expense / Savings / Income / Transfer (removed From-person + One-off; added Savings as first-class type; migrated Income from category). Round 42: category row hides when type=Income/Savings.
- `selectTxnType` auto-syncs `ql-cat-hidden` for non-Expense types.
- Round 34 removed auto-focus on `ql-amt` (round 38 deferred a re-add — current: no auto-focus, user taps to focus).

**Dashboard pace tappable (round 34):**
- `#pace-display` now has `cursor:pointer + onclick="explainWeekProjection()"` so the dashboard tile opens the same math modal the Bills tab "?" uses.
- Round 31 aligned the calc with `getThisWeekProjection()` so both surfaces show the same number.
- Round 40 added a dedicated "What does pace mean?" amber-tinted card at the top of the explainer modal.

**Bill modal additions:**
- `bm-end-date` field (round 35)
- `bm-freq` options expanded to quarterly / biannual / yearly (round 34)
- `bm-autodebit` checkbox (Bundle 7-era; consistent with new debt `modal-autodebit`)

## Round 72 additions to the map (2026-05-14 audit + fix sprint)

**New canonical writers:**
- `BRAIN.plan.markPaydayLanded(ts, source)` (~L17746-pre-bonus) — writes `S.activePlan.actualPaydayTs` + defers to `BRAIN.cycle.markPaydayReceived` for the global flag. Source tag `PAYDAY_MANUAL_LANDED`.

**New SOURCES tag:**
- `PAYDAY_MANUAL_LANDED` → `'payday-manual-landed'`. Added to both `BRAIN.SOURCES` and `_SOURCE_SET`.

**Canvas root (`renderPaydayPlanRoot`) changes (R3):**
- DROPPED: Mum-summary bubble at L9646-9665 (r46) — was redundant with ESSENTIALS section + REMAINDER tile.
- ADDED: coloured-dot legend below proportion bar — Bills (blue) · Debts (red) · Savings (green) · Upcoming (amber) · Living (grey). Replaces the grey-on-grey caption.
- ADDED: payday-landed pill / paid badge in cycle-label (P0.2). Toggles based on `S.paydayReceived`.
- COPY FIX: cycle-end-day suffix reads "Cycle ended — next payday begins this cycle" instead of "0 days left."
- WRAPPER FN: `markPaydayLandedToday()` next to `paydayUndoLast` — confirm + canonical write + re-render.

**Canvas Savings sub (`renderPaydaySavings`) changes (R1):**
- NEW HELPER (closure): `_intentForBucket(bucketName)` — reverse-lookup via `BRAIN.plan.intent.byBucket` filtered by `kind === 'goal'`.
- ENRICHED BUCKET ROWS: render goal name (from `S.goalDefs[intent.id].name`) as primary; bucket name moves to "stored in X" subline when names differ. Emoji prefers `goalDef.emoji`.
- NEW SECTION: "Other savings goals" — renders intents linked to synthetic-bucket tokens (e.g. `__mum-account__`). No per-cycle slider; tap opens `editGoal`.
- MODAL: `openEditPaydaySavings` title is goal-name-with-emoji when bucket is goal-linked.

**PLAN-tab Annual Provisions (`renderAnnualProvisions`) changes (R2):**
- REPLACED: inline 5-row list → single nav-row "🏦 Manage provisions · $X/mo · N items ›".
- NEW: `openManageProvisions()` modal — info-modal pattern (via `EDIT_MODAL.openInfo`) with the editable provision rows + per-row ✏️ button calling existing `editProvision`.

**rolloverIfNeeded changes (P0.1):**
- ADDED: bonus-carry block at L17984+ — preserves `prevPlan.income.bonus` when `included && status === 'expected' && amount > 0`. Audit event `plan_bonus_carried_to_new_cycle`. Return envelope extended with `bonusCarried` field.

**openPaydayPlan (caller of rolloverIfNeeded) changes:**
- TOAST: extended to report both deferred-items count AND bonus-carry on rollover ("🔁 New cycle started — N deferred items carried over · $X bonus carried forward").

**Boot self-test additions:**
- `BRAIN.plan.rolloverIfNeeded callable`
- `BRAIN.plan.setBonus callable`
- `BRAIN.plan.markPaydayLanded reachable`
- `markPaydayLandedToday wrapper reachable`
- `BRAIN.SOURCES.PAYDAY_MANUAL_LANDED defined`

**SDDs shipped:**
- `docs/sdd/SDD-2026-05-14-bonus-rollover-preserve.md`
- `docs/sdd/SDD-2026-05-14-mark-payday-landed.md`
- `docs/sdd/SDD-2026-05-14-intent-driven-goal-subtitle.md`

**Audit doc shipped:**
- `AUDIT-PLAN-MODE-2026-05-14.md` (~2,000 lines) — 24 surfaces walked + cross-cutting passes + vision UI + strategic synthesis (4 John questions answered).

**Open follow-ups queued (per audit doc Summary):**
- Bundle 29: full Tier-3 intent-driven canvas Savings redesign (R1 today is the quick-fix variant)
- Bundle 29: drop legacy `S.tripDefs` / `S.goalDefs` once readers migrate
- Bundle 29: cleanup migration for test-pollution intents (Test goal · Kia detail)
- Bundle 29: TDZ at boot investigation (L1646 family — script-eval-order vs const declarations)
- P1 next session: Debts sub viaRent/autoDebit caption · KIA Extra label rephrase · per-cycle cycleEndDate override · untick affordance on ticked rows · tap-bar-segment explainer

— end FEATURE-MAP.md —
