# SDD-2026-05-14-mark-payday-landed

**Author:** Claude (Opus 4.7 1M-context) · **Date:** 2026-05-14 · **Bundle:** 28 round 72+ · **Status:** approved, in-flight

## Problem

John has been paid in his bank account today but `S.paydayReceived === false` in the app (deliberate — he wants to log it manually as part of tonight's planning session). The app has automatic payday detection (`detectPaydayCycleRollover` + `BRAIN.cycle.markPaydayReceived`) but no user-initiated "I got paid today" affordance. When payday lands early or on a non-standard day, there's no clean way to tell the app "now."

This blocks the Darwin-cycle planning flow tonight: John wants to (1) log payday landed, (2) add bonus, (3) walk allocations, (4) see realistic math. Step 1 has no surface today.

Audit trace: AUDIT-PLAN-MODE-2026-05-14.md Surface 1 Tonight-session check + Summary P0.2.

## Surfaces touched

- `BRAIN.plan` namespace (~L17389) — new method `markPaydayLanded(ts, source)`.
- `BRAIN.SOURCES` + `_SOURCE_SET` — add `PAYDAY_MANUAL_LANDED` tag.
- `S.activePlan` schema — add optional `actualPaydayTs` field.
- `_resolveNextPayday` (L11234) + `_resolvePreviousPayday` (L11245) — honor `actualPaydayTs` when set for current cycle resolution.
- `BRAIN.plan.getSnapshot()` (L17391) — include `actualPaydayTs` in envelope so renderers can show it.
- `renderPaydayPlanRoot` (L9573) — add affordance: when `paydayReceived === false`, show small pill next to cycle label `Pay landed today?` linking to `markPaydayLanded`. When already received, show small `✓ Paid {date}` label instead.
- `BRAIN.cycle.markPaydayReceived` — `markPaydayLanded` defers to this for the `S.paydayReceived` flag (avoid duplicating logic).
- Boot self-test array — add reachability entry.
- Guardian-runtime — add structural check.
- Artifacts: `BUNDLE-28-NOTES.md`, `CHANGELOG.md`, `FEATURE-MAP.md`.

## Proposed change

### 1. New BRAIN.plan method

```js
// In BRAIN.plan, alongside setBonus (~L17746):
markPaydayLanded(tsArg, source) {
  if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source' };
  const ts = +tsArg || Date.now();
  if (!isFinite(ts) || ts <= 0) return { ok: false, reason: 'invalid-ts' };
  S.activePlan = S.activePlan || _emptyActivePlan();
  const old = S.activePlan.actualPaydayTs || null;
  S.activePlan.actualPaydayTs = ts;
  // Defer to BRAIN.cycle for the S.paydayReceived flag (canonical single
  // owner; markPaydayLanded is a per-cycle annotation, not a state replace).
  if (typeof BRAIN.cycle !== 'undefined' && BRAIN.cycle.markPaydayReceived) {
    BRAIN.cycle.markPaydayReceived(BRAIN.SOURCES.CYCLE_PAYDAY_RECEIVED, ts);
  } else {
    // Fallback for environments where cycle bubble isn't loaded
    S.paydayReceived = true;
    S.paydayReceivedDate = new Date(ts).toISOString().slice(0, 10);
  }
  BRAIN.audit.append({ type: 'payday_manual_landed', old, new: ts, source, ts: Date.now() });
  try { save(); } catch (_) {}
  return { ok: true, old, new: ts };
},
```

### 2. New source tag

```js
// Bundle 28 round 72+ — manual payday-landed affordance
PAYDAY_MANUAL_LANDED: 'payday-manual-landed',
```

Added to both `SOURCES` enum AND `_SOURCE_SET` literal.

### 3. _resolveNext/PreviousPayday honor `actualPaydayTs`

```js
function _resolveNextPayday(fromDate) {
  // If activePlan.actualPaydayTs is set, the cycle "started early" — anchor
  // the next payday to that landed timestamp + cycle length so projections
  // reflect reality.
  const actual = S.activePlan && S.activePlan.actualPaydayTs;
  if (actual) {
    const actualDate = new Date(actual);
    // If actual is in the past and we're still on this cycle, next payday
    // is roughly one month after actual.
    const next = new Date(actualDate.getFullYear(), actualDate.getMonth() + 1, actualDate.getDate());
    return next;
  }
  // Existing fallback path:
  const d = fromDate ? new Date(fromDate) : new Date();
  const payday = +S.payday || 15;
  const today = d.getDate();
  const result = new Date(d.getFullYear(), d.getMonth(), payday);
  if (today >= payday) {
    result.setMonth(result.getMonth() + 1);
  }
  return result;
}
```

Similar conservative fallback for `_resolvePreviousPayday`.

### 4. Canvas-root affordance

In `renderPaydayPlanRoot` cycle-label section (~L9579), append a small pill:

```js
const paydayReceivedLabel = S.paydayReceived
  ? '<span style="margin-left:8px;font-size:11px;color:var(--green)">✓ Paid ' + (S.paydayReceivedDate ? new Date(S.paydayReceivedDate).toLocaleDateString('en-AU', {day:'numeric',month:'short'}) : '') + '</span>'
  : '<button onclick="markPaydayLandedToday()" style="margin-left:8px;background:rgba(34,197,94,0.10);border:1px solid var(--green-border);color:var(--green);font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;cursor:pointer">Pay landed today?</button>';
```

### 5. Wrapper function

```js
function markPaydayLandedToday() {
  if (!confirm('Mark today as the payday-landed day for this cycle?')) return;
  const r = BRAIN.plan.markPaydayLanded(Date.now(), BRAIN.SOURCES.PAYDAY_MANUAL_LANDED);
  if (!r.ok) {
    if (typeof showToast === 'function') showToast('Couldn\'t mark payday: ' + r.reason);
    return;
  }
  if (typeof renderPaydayPlanRoot === 'function') renderPaydayPlanRoot();
  if (typeof renderAll === 'function') renderAll();
  if (typeof showToast === 'function') showToast('✓ Payday marked landed today');
}
```

### 6. Boot self-test + guardian-runtime

Add to the tests array (L11748-area):

```js
['BRAIN.plan.markPaydayLanded reachable', () => typeof BRAIN.plan.markPaydayLanded === 'function'],
['markPaydayLandedToday wrapper reachable', () => typeof markPaydayLandedToday === 'function'],
```

Guardian-runtime: optional new structural check `BRAIN.plan.markPaydayLanded exists` so the affordance can't silently disappear.

## Invariants that must hold after

- `BRAIN.plan.markPaydayLanded` is a canonical writer — typed source-set check, audit-log entry, save call, validated input.
- `S.paydayReceived` flag still flips correctly via the existing `BRAIN.cycle.markPaydayReceived` path (no duplication of writer logic).
- `actualPaydayTs` is per-cycle (lives on activePlan, gets reset on rollover via `_emptyActivePlan`).
- `MODEL.daysToPayday` reflects the actualPaydayTs anchor when set.
- All math invariants stay green.

## How I'll verify

- Live walk: open canvas → see "Pay landed today?" pill → tap → confirm dialog → toast appears → re-render shows "✓ Paid {today}" → `S.paydayReceived === true` in state.
- Audit log: `payday_manual_landed` event present with correct ts.
- Boot self-test: 2 new entries pass on boot.
- Layer V capture: post-fix should show the pill in unconfirmed state, ✓ label in confirmed state.

## Rollback plan

All additions; no edits to existing logic except `_resolveNextPayday/_resolvePreviousPayday` which have a guarded early-return. Revert: remove the early-return + new function + new source tag + new affordance markup. Existing payday-received flow remains untouched.

## Surface to John before code?

NO — approved as P0.2 in audit Summary. Proceed.
