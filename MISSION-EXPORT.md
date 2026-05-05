# MISSION: EXPORT TRUNCATION FIX (Mission EXPORT)

## Why this mission exists

John attempted to export current state from phone (Settings → 
Export) for use in refreshing Mission V's fixture. The export 
truncates mid-stream around "Google Microsoft" in the BILLS array. 
Output is incomplete — missing rest of BILLS, closing braces, any 
trailing state.

This blocks:
- Mission V fixture refresh (can't replace state-snapshot.json with 
  current reality)
- Mission B follow-up (#4/#18 investigation needs real BILLS schema)
- Future visual regression fidelity (baselines stay anchored to 
  April 15 capture instead of John's actual life)

Desktop console workaround exists (`copy(JSON.stringify({S, BILLS}))`) 
but desktop state is severely outdated and shouldn't be used as the 
canonical source.

After this mission ships:
- Phone export produces complete, parseable JSON regardless of state size
- John can re-export cleanly and fixture refresh can proceed
- A regression test or invariant prevents the truncation from 
  silently returning

## Required reading before starting

1. PROJECT-EXTRACT-2026-05-05.md § 2.4 (localStorage side-channel 
   keys, including any related to export)
2. The `copyExport` function in index.html — locate by searching 
   for "copyExport" or "Export" button handler
3. Any related export/share/serialize functions (could be 
   `exportState`, `shareData`, `getExportString`, etc. — search 
   broadly)

## What to do

### Step 1 — Investigate (no code, STOP gate)

Locate the export pipeline. There are at least two stages:
1. **Build** — JSON.stringify the state into a string
2. **Output** — write the string somewhere user-visible (clipboard, 
   textarea, share sheet, share intent)

Each stage has its own truncation risk. Investigate both.

**Build stage questions:**
- Does the function call `JSON.stringify(S)` or 
  `JSON.stringify({S, BILLS, ...})` or some custom serializer?
- Does the function strip any fields before stringify? (Per existing 
  pattern, chat history is stripped. Are other fields stripped that 
  shouldn't be?)
- Is there a manual string concatenation building the export 
  piecewise? (Manual concat plus a length cap would explain mid-array 
  truncation.)
- Does it slice or substring the result anywhere?
- Is there any `.slice(0, N)` or `.substr(0, N)` or `.substring()` 
  call that would cap length?

**Output stage questions:**
- How is the result delivered to user — `navigator.clipboard.writeText()`, 
  textarea.value, native share, prompt(), download blob?
- Does the output target have a size limit?
- For mobile Chrome specifically: clipboard write has historically 
  had ~1MB limits but those are usually handled gracefully (truncation 
  happens silently on the clipboard side, not in the source string)
- For textarea display: if the export is shown in a textarea before 
  copy, the textarea may have a maxlength attribute or CSS overflow 
  that visually clips but doesn't truncate the underlying string
- For navigator.share: payload size limits exist on iOS/Android

**Likely candidates ranked by probability:**

1. **Manual string concatenation with a length cap.** Most common 
   cause of "truncates around X" bugs. The function builds the 
   export incrementally and stops at some limit. Look for any 
   `if (str.length > N)` checks.
2. **Textarea-based copy with maxlength.** If the export goes to a 
   textarea first and the textarea has maxlength="N" or is set 
   programmatically, the underlying string is fine but the displayed 
   value is clipped. Copy from clipped textarea = truncated copy.
3. **Clipboard API failure.** `navigator.clipboard.writeText()` 
   silently fails over a size limit on some Android Chrome versions. 
   Fallback to execCommand might write partial.
4. **Custom serializer with logic bug.** If the function manually 
   walks state and builds JSON, a bug in array iteration could cut 
   off mid-array. Particularly suspicious: a forEach with an early 
   return condition.

Print findings:
- Function name(s) involved
- Stage where truncation occurs (build vs output)
- Specific line(s) that cause the cap
- Proposed fix

STOP for John's review before any code.

### Step 2 — Fix (after Step 1 approval)

Fix the identified truncation. Likely a one-line or few-line change.

If the fix involves replacing a custom serializer with native 
`JSON.stringify`, surface that — it's a bigger change worth 
explicit confirmation.

If the fix involves changing the output mechanism (e.g., switching 
from textarea-display-then-copy to direct clipboard write), surface 
the UX implications: does the user still see what was copied? Does 
that surface need replacement?

### Step 3 — Verify

After fix:
1. Add a test (small, in tests/core.test.js or equivalent) that 
   builds an export from a state with > 100 transactions + 16 
   bills + 9 paidBills, and verifies the parsed result equals the 
   original state. Catches regression of this exact bug class.
2. Run all gates: guardian-static, npm test, npm run visual.
3. Manually verify on phone: tap Export, paste to a notes app, 
   confirm complete JSON ending with proper closing braces.

### Step 4 — Add Layer 1 rule (optional, surface during Step 1)

If the truncation came from a manual string-builder pattern, 
consider adding a Layer 1 rule:
- "no-string-concat-of-state-fields" — detect functions that build 
  state representations via string concatenation instead of 
  JSON.stringify

This prevents the regression class entirely. But: only add if 
Step 1 confirms manual concat was the cause. Don't speculate.

If added, the new rule increments Layer 1's catalog (15 → 16, 
or 16 → 17 if dom-id-must-exist already re-added by then).

### Step 5 — Commit and push

Single commit. Example message (adjust based on actual root cause):

```
fix(export): repair truncation in copyExport — was capping at N chars

Root cause: [actual root cause from Step 1]

[Specific fix description]

Added test: full state round-trip — build export from large state, 
parse, deep-equal to original. Catches regression of this bug 
class.

[Optional: Added Layer 1 rule no-string-concat-of-state-fields]

Unblocks: Mission V fixture refresh (state-snapshot.json can now 
be replaced with John's actual current state).
```

Push immediately.

## Constraints

- **No regressions** to any prior commit
- **Single commit** for the fix + test (and optional Layer 1 rule)
- **35 tests must still pass + 1 new test for the round-trip case**
- **Layer 1 must still exit 0** with same allow-list count (or 
  +1 entry if a new rule is added that surfaces existing patterns)
- **Don't touch UI** unless the fix requires it (e.g., if textarea 
  is the truncation source and replacement is needed)

## Push back if

- Step 1 finds no truncation in the code path — the bug might be 
  on the clipboard or browser side, not the app side. Surface 
  with diagnosis, propose alternatives (e.g., split export into 
  chunks the user pastes one at a time, or add a download-as-file 
  option that bypasses clipboard entirely)
- The truncation is in a third-party library or browser API we 
  can't fix directly
- The fix has wider blast radius than expected (e.g., the entire 
  export pipeline needs rewriting)
- Round-trip test reveals other bugs in the export path beyond 
  truncation (e.g., field mutation, type coercion)

## Estimate

Small. Investigation is the bulk; the fix itself is likely trivial. 
Should ship in one short cycle.

## Run with

```
Read C:\Users\admin\slyght\MISSION-EXPORT.md and execute.

Step 1 first — locate the export function, identify truncation 
stage (build vs output), propose fix. STOP for John's review 
before any code.

Phone export is cutting off mid-BILLS-array around "Google 
Microsoft". Blocks Mission V fixture refresh and Mission B 
follow-up. After this fix, John re-exports cleanly and fixture 
refresh can proceed.

Single commit. Add round-trip test. Push immediately.
```
