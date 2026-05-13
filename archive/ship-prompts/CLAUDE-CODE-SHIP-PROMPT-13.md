# Claude Code Ship Prompt — Bundle 13

> **Status:** DRAFT. User reviews before CC executes.
> **Scope:** Envelope retrofit + `tests/brain.test.js` + setBucketSaved source validation + BRAIN_ARCHITECTURE.md v1.2 update.
> **Pre-reqs:** HEAD `ffdeb84` (Bundle 11 — BRAIN.transaction + SOURCES).
> **Risk:** Low. Pure-additive on canonical writers (existing callers don't check return value). New tests lock the contract.
> **Phone-verify:** Not required. No user-visible change. The envelope retrofit only affects the SHAPE writers return; behavior is identical.

---

## Standing Discipline (carried from Bundle 9-10 prompts)

**Pre-authorised decisions — do NOT surface, just resolve:**
- Build artifacts (`audit/allow-list.json`, `runtime-report.json`) → `git checkout --` them
- Guardian rule fires on canonical helper itself → inline `guardian-allow` with `(permanent - ...)` tag (ASCII dashes, not em-dashes — regex parser quirk)
- Tests fail because assertion targets removed code → comment out assertion, note in handoff ERRORS line

**Surface required (STOP and ask):**
- Unmigrated parallel store discovered mid-session
- Money-math behavior change
- A caller of `setBucketSaved` that DOES check the return value as bool (`if (BRAIN.savings.setBucketSaved(...))` truthy-checks) — pre-Bundle-13 audit said zero exist; if grep surfaces one, flag

**Handoff format v2:**
```
=== HANDOFF ===
COMMIT: <hash> <subject>
HEAD: <old> → <new>
DIFF: <file>: +N/-M
VERIFY: static <result>, runtime <p>/<t>, tests-core <p>/<t>, tests-brain <p>/<t>
DEVIATIONS: <one-line per deviation, "none" if clean>
ERRORS: <STOP-and-discuss items + unexpected fires, "none" if clean>
VERIFY-CHANNEL: skip (no user-visible change)
=== END ===
```

---

## Step 0 — Pre-flight

```
git status
git log --oneline -3
git pull origin main
```

HEAD `ffdeb84` (Bundle 11). Working tree clean (discard artifacts per Standing Discipline).

---

## Step 1 — Audit existing setBucketSaved / addToBucket callers

Before changing return shape, confirm zero callers truthy-check the result:

```
grep -n "BRAIN.savings\.\(setBucketSaved\|addToBucket\)" index.html
grep -n "if\s*(.*setBucketSaved\|if\s*(.*addToBucket" index.html
grep -n "\bsetBucketSaved\b" index.html
```

Expect zero `if (BRAIN.savings.setBucketSaved(...))` patterns. Pre-Bundle-13 audit confirms: every existing caller ignores the return value. New envelope shape is purely additive.

If audit surfaces a caller that bool-checks — **STOP, surface to user.** The envelope object is truthy in both success and failure cases; a bool-checking caller would silently mask failures.

---

## Step 2 — Retrofit `BRAIN.savings.setBucketSaved` to envelope

**Pre-Bundle-13 (current):**
```js
setBucketSaved(bucketName, newValue, source) {
  // ...
  if (!bucket) { console.warn(...); return false; }
  if (isNaN(safeNew)) { console.warn(...); return false; }
  // ...
  return true;
}
```

**Post-Bundle-13:**
```js
setBucketSaved(bucketName, newValue, source) {
  // Bundle 13: source validation matches BRAIN.transaction.record contract.
  // Typo'd tags fail at write time, not at audit-grep time.
  if (!source || !BRAIN._SOURCE_SET.has(source)) {
    console.warn('[BRAIN.savings] unknown source tag:', source);
    return { ok: false, reason: 'unknown-source:' + source };
  }
  if (!S.savingsBuckets) S.savingsBuckets = [];
  const bucket = S.savingsBuckets.find(b => b.name === bucketName);
  if (!bucket) {
    console.warn('[BRAIN.savings] no bucket named', bucketName);
    return { ok: false, reason: 'no-bucket', bucketName };
  }
  const safeNew = parseFloat(Number(newValue).toFixed(2));
  if (isNaN(safeNew)) {
    console.warn('[BRAIN.savings] invalid value', newValue);
    return { ok: false, reason: 'invalid-value', value: newValue };
  }
  const oldValue = bucket.saved || 0;
  // guardian-allow: ... (existing, unchanged)
  bucket.saved = safeNew;
  const delta = parseFloat((safeNew - oldValue).toFixed(2));
  BRAIN.audit.append({
    type: 'bucket_saved_change',
    bucket: bucketName,
    oldValue, newValue: safeNew, delta,
    source,                              // was: source || 'unknown' — now required
    ts: Date.now()
  });
  try { save(); } catch (_) {}
  return { ok: true, bucket: bucketName, oldValue, newValue: safeNew, delta };
}
```

**Three changes:**
1. Source validation added (parallel to `BRAIN.transaction.record`)
2. All `return false` → `{ ok: false, reason, ...context }`
3. `return true` → `{ ok: true, bucket, oldValue, newValue, delta }`

Document the BACKWARDS-COMPAT consequence in the function's docstring: object envelopes are truthy in both success and failure cases, so any bool-checking caller would silently mask failures. The Step 1 audit confirms zero such callers exist; this is documented as a precondition.

---

## Step 3 — Retrofit `BRAIN.savings.addToBucket` to envelope

**Pre-Bundle-13:**
```js
addToBucket(bucketName, delta, source) {
  const bucket = (S.savingsBuckets || []).find(b => b.name === bucketName);
  if (!bucket) return false;
  return this.setBucketSaved(bucketName, (bucket.saved || 0) + delta, source);
}
```

**Post-Bundle-13:**
```js
addToBucket(bucketName, delta, source) {
  const bucket = (S.savingsBuckets || []).find(b => b.name === bucketName);
  if (!bucket) return { ok: false, reason: 'no-bucket', bucketName };
  return this.setBucketSaved(bucketName, (bucket.saved || 0) + delta, source);
}
```

setBucketSaved already returns envelope, so the `return this.setBucketSaved(...)` line propagates correctly with no other change.

---

## Step 4 — Update header comment block on `BRAIN.savings`

Above the `savings:` block, add the envelope contract docstring (terse, points to spec for full rules):

```js
// Bundle 13: writer methods return the result envelope:
//   Success: { ok: true, bucket, oldValue, newValue, delta }
//   Failure: { ok: false, reason: '<code>', ...context }
// Reason codes: 'unknown-source:<tag>' | 'no-bucket' | 'invalid-value'.
// Callers MUST check `.ok` — envelope objects are truthy in both cases.
// Composition rule: if a caller calls another canonical writer and the
// inner returns { ok: false }, the caller should abort and bubble up
// the matching shape. See BRAIN_ARCHITECTURE.md "Composition contract".
```

---

## Step 5 — Add `tests/brain.test.js`

New file. Follows the `tests/core.test.js` convention (mock Date, mock S, copy BRAIN body verbatim, run `test(name, fn)` style assertions).

Coverage targets:
- **savings.setBucketSaved**: valid call → envelope shape; mutation actually applied to S; unknown source rejected (no mutation); missing bucket rejected; NaN value rejected; audit entry emitted; 2dp rounding
- **savings.addToBucket**: increments correctly; missing bucket envelope; unknown source propagates
- **transaction.record**: envelope with ts; pre-set ts preserved; unknown source rejected (no push); invalid amt rejected; negative amt rejected; missing amt rejected; audit entry emitted
- **transaction.findByTs**: round-trip via record() ts; missing ts returns undefined
- **transaction.removeByTs**: removes correct txn; missing ts envelope
- **transaction.list**: predicate-based filter
- **dashboard.todaySpend**: matches canonical filter (excludes Bills/roundups/corrections/income)
- **dashboard.todayTxns**: returns array with same filter
- **dashboard.cycleSpend / weekSpend**: delegate to MODEL
- **audit.append/recent**: round-trip + 500-cap drops oldest + n-parameter
- **SOURCES**: every enum value in _SOURCE_SET; frozen (write attempts fail)

Target: ~31 tests including one composition-failure invariant test that locks "source rejection means no mutation" — a synthetic of the Bundle 14 pattern:

```js
test('composition: setBucketSaved with unknown source aborts and returns failure envelope (no mutation)', () => {
  resetS();
  const result = BRAIN.savings.setBucketSaved('China Holiday', 9999, 'totally-bogus-source');
  expect(result.ok).toBe(false);
  expect(result.reason).toBe('unknown-source:totally-bogus-source');
  const bucket = S.savingsBuckets.find(b => b.name === 'China Holiday');
  // Critical: source rejection must abort BEFORE the write. Bundle 14
  // composition (BRAIN.bills.markPaid -> BRAIN.transaction.record) relies
  // on this invariant — if the inner write rejected its source AFTER
  // already mutating, the outer couldn't safely abort.
  expect(bucket.saved).toBe(100); // unchanged from resetS() default
});
```

Run via `node tests/brain.test.js`; exits non-zero on any failure.

Test framework copied from core.test.js (`test`, `expect` with `.toBe`/`.toEqual`/`.toBeTruthy`/`.toBeFalsy`). No new dependencies.

---

## Step 6 — Update BRAIN_ARCHITECTURE.md to v1.2

Three sections land. Surface proposed text to user before editing the file — user explicitly wants to review spec changes before they land.

### 6a — Add "Composition contract" section

After the existing "Bubble Migration Pattern" section. Content:

```markdown
## Composition Contract (v1.2)

When a canonical writer calls another canonical writer internally,
the rule is **abort-on-inner-failure with envelope propagation**.

Concrete example: `BRAIN.bills.markPaid(bill, source)` (Bundle 14) will
internally call `BRAIN.transaction.record(...)` to create the paired
txn. If `record()` returns `{ ok: false, reason: 'unknown-source:...' }`,
`markPaid` aborts BEFORE flipping `S.paidBills` and returns the same
envelope shape upward — no partial mutation, no orphan paid flag, no
attempted rollback.

**Why no rollback:** JS has no real transactions. Rollback paths fail
too often to trust (e.g., a `splice` after a `push` might race with
another async write; an undo that depends on `_txnTs` might miss a
round-up). Aborting BEFORE the second mutation is the only honest
contract.

**Rule for composition:**
1. Call the inner writer first.
2. If `inner.ok === false`, return `inner` (or a matching envelope
   that includes the inner's reason).
3. Only proceed with the outer mutation if `inner.ok === true`.

**Reason codes are namespaced when bubbling up** so callers two
levels deep can tell which layer rejected: `'inner-source-rejected:...'`,
`'inner-no-bucket'`, etc. Bills bubble exercises this in Bundle 14.
```

### 6b — Add "Invariant ownership" pattern

After "Composition contract". Content:

```markdown
## Invariant Ownership (v1.2)

Invariants live with their domain owner but stay registered cross-
cutting. This preserves the render-time safety net that catches drift
from paths the canonical writer didn't audit (snapshot restore,
load() migrations, future bugs that bypass the writer).

**Pattern:**
1. The invariant **logic** lives in `BRAIN.<bubble>.invariants.<name>()`
   — semantic ownership with the domain.
2. The **registry entry** stays in `MathInvariants.invariants[]` and
   calls into the bubble: `check() { return BRAIN.bills.invariants.checkPaidBillsKeyNotFuture(); }`
3. Render-time check runs on every render via `MathInvariants.render()` —
   unchanged. Banner/card UX preserved.

**Why this matters:** If the invariant moved INSIDE the canonical writer
(`BRAIN.bills.markPaid`), it would only fire on paths that go through
`markPaid`. The invariant exists to catch paths that don't — exactly
the class of drift it was built for.

**Bundle 14 example:** MI-13 (`paidbills-key-not-future`) logic
relocates to `BRAIN.bills.invariants.checkPaidBillsKeyNotFuture()`.
The registry entry's `check` function changes to call into the bubble.
Banner copy + dismiss/escalation logic unchanged.
```

### 6c — Add "Test coverage requirement"

After "The Strangler Antibiotic Discipline" section. Content:

```markdown
## Test Coverage Requirement (v1.2)

Every new canonical writer added to BRAIN MUST land with tests in
`tests/brain.test.js` that lock its contract. Minimum coverage per
writer:

- **Happy path:** valid call returns `{ ok: true, ...payload }` with
  the documented payload fields.
- **Source validation:** unknown source returns `{ ok: false, reason:
  'unknown-source:<tag>' }` AND mutation does not occur.
- **Domain validation:** invalid arguments (missing bucket, NaN value,
  negative amt, etc.) return matching `{ ok: false, reason }` envelopes.
- **Side effects:** audit entry emitted with the source tag + relevant
  payload.
- **Reader round-trip:** any back-ref-style reader (e.g., `findByTs`)
  retrieves what the writer recorded.
- **Composition-failure invariant:** when the writer composes with
  another canonical writer (Bundle 14+ pattern), tests must include
  at least one composition-failure case proving abort-on-inner-failure
  semantics — the outer mutation does not occur when the inner returns
  `{ ok: false }`.

Without these tests the envelope contract drifts silently as new
bubbles seed. Locking it at the surface-area-still-small moment
(3 bubbles after Bundle 13) makes future migration safer.
```

### 6d — Update bubble inventory table

Bump `BRAIN.savings` status to: `✅ Bundle 8, envelope v1.2 Bundle 13`.

### 6e — Queue snapshot audit emission as known gap

Add to "What BRAIN Does NOT Do" or a new "Known Gaps" section:

```markdown
## Known Gaps (queued)

- **Snapshot restoration audit emission.** `load()` is exempt from
  every guardian rule because it restores S from localStorage. But
  snapshot restoration writes don't emit `BRAIN.audit` entries — the
  audit log silently misses the most consequential mutations
  (full state replay). Future bundle: on restore, emit a single
  synthetic `{ type: 'snapshot_restore', from, ts }` audit entry.
  Tracked: Bundle 16 candidate after Bills + Debts bubbles land.
  Bundle 15 reserved for envelope retrofit completion if needed.
- **`BRAIN.savings` and `BRAIN.dashboard` retrofit to {ok, reason?}
  envelope.** ✅ Resolved in Bundle 13 (envelope landed).
- **PLAN, MODEL, NOTIFY, CHARACTER fold into bubbles.** PLAN folds
  into `BRAIN.dashboard.plan` per Q1; MODEL stays standalone; NOTIFY
  decomposes when bills/dashboard bubbles seed; CHARACTER folds into
  analysis. Tracked: Bundles 16-18ish.
```

---

## Step 7 — Validation

```
node guardian-static.js
node guardian-runtime.js
node tests/core.test.js
node tests/brain.test.js
```

Expected:
- `guardian-static` exit 0
- `guardian-runtime` 47/50 (same fixture-drift baseline)
- `tests/core` 41/41
- `tests/brain` ~30/~30 (all pass)

---

## Step 8 — Commit + push

```
git add index.html tests/brain.test.js BRAIN_ARCHITECTURE.md
git status
git diff --cached --stat
git commit -m "arch(13): envelope retrofit + brain.test.js + spec v1.2

[full message — see template below]"
git push origin main
```

Commit message template:
```
arch(13): envelope retrofit + brain.test.js + spec v1.2

Pre-Bundle-12 cleanup. Settles the result-envelope shape across all
three BRAIN bubbles before BRAIN.bills (next) lands native-envelope
from day one. Without this, Bills would bridge two return contracts
(envelope from Transaction, bool from Savings) — exactly the
asymmetric-shape friction Bundle 13 prevents.

BRAIN.savings.setBucketSaved + addToBucket:
- Returns { ok, bucket, oldValue, newValue, delta } on success.
- Returns { ok: false, reason, ...context } on failure. Reason codes:
  'unknown-source:<tag>' | 'no-bucket' | 'invalid-value'.
- Source validation added (matches BRAIN.transaction.record). Typo'd
  tags fail at write time, not at audit-grep time.
- Backwards-compat: all current callers ignore the return value
  (audited Step 1). Envelope objects are truthy in both cases — new
  callers MUST check `.ok` per the composition contract.

tests/brain.test.js:
- ~30 tests covering envelope contract, source rejection, back-ref
  round-trip (record → findByTs / removeByTs), audit emission,
  500-entry cap, SOURCES self-consistency, dashboard reader delegation.
- Locks the contract at the surface-area-still-small moment (3
  bubbles). Future bundles can extend without regressing existing
  writers silently.

BRAIN_ARCHITECTURE.md v1.2:
- Composition Contract section: abort-on-inner-failure with envelope
  propagation. No rollback attempts. Bundle 14 exercises this when
  BRAIN.bills.markPaid calls BRAIN.transaction.record.
- Invariant Ownership section: logic in BRAIN.<bubble>.invariants,
  registry stays cross-cutting in MathInvariants.invariants[]. Preserves
  render-time safety net for paths the canonical writer didn't audit.
- Test Coverage Requirement section: every new canonical writer lands
  with brain.test.js coverage. Minimum: happy path, source validation,
  domain validation, audit emission, reader round-trip.
- Bubble inventory table: BRAIN.savings bumped to 'envelope v1.2'.
- Known Gaps section: snapshot audit emission queued for ~Bundle 15.

Verification: static 0, runtime 47/50, tests-core 41/41,
tests-brain ~30/~30.
```

---

## End of prompt
