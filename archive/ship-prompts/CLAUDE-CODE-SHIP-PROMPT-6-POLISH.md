# Claude Code Ship Prompt — Bundle 6 (UI Polish Wave)

> **Purpose:** Wave of small visual + copy fixes from the Layer V
> at-rest audit (pass 2). Each fix is small, low-risk, high-confidence.
> Batched into one commit because reviewing 8 small commits is more
> overhead than 1 commit with 8 clearly-labelled fixes.
>
> **Source baseline:** Fresh zip @ HEAD 59e008b. Ships AFTER Bundles
> 4 and 5 (Plan persistence, trust-the-math). Line numbers may have
> shifted; use content-search throughout.
>
> **Discipline:** Same as prior bundles. Surface don't reframe. STOP
> at any mismatch. Phone-verify post-deploy.
>
> **Scope:** Single commit. Net diff ~30 lines, mostly text and
> color. Risk: very low — no logic changes, only display.

---

## What this fixes

8 polish items from the audit, in order of effort:

1. **F1 — "1 transactions" pluralisation** in spending pivot
2. **F2 — Net Worth modal duplicate value** (header rounded vs
   footer precise)
3. **F3 — Edit Bill "LAST PAID Not yet this month"** chip rendered
   green even when not paid
4. **F4 — Round-up preview** still visible at $0 in quick-log modal
5. **F5 — TRACKED badge** is green; should be amber for "needs
   verification" state
6. **F6 — Cautious Mode banner** wraps mid-phrase; tighten copy
7. **F7 — Recent Spending list** filter out round-ups (interleave
   noise)
8. **F8 — "Of" capitalisation** in plan provisions ("Saved: $75 Of
   $5,000" → "Saved: $75 of $5,000")

---

## Step 1 — Pre-flight

```
git status
git log --oneline -3
git pull origin main
```

Working tree clean. Note current HEAD.

---

## Step 2 — F1: Pluralisation in spending pivot

**Find** the pivot row rendering. Content-search:

```
grep -n "transactions · " index.html
```

Should return 2 matches. The relevant one is in `renderSpendingPivot`
(~L9858 in pre-Bundle-5 source).

**Find this exact substring:**

```
'<span style="color:var(--text3);font-size:11px">'+row.count+' transactions · '+row.pct+'%</span>
```

**Replace with:**

```
'<span style="color:var(--text3);font-size:11px">'+row.count+' transaction'+(row.count===1?'':'s')+' · '+row.pct+'%</span>
```

Only `transactions` becomes `transaction'+(row.count===1?'':'s')+'`.
Everything else identical.

The other match (~L7687, in a balance-check status message) is a
debug/dev message, not user-facing in the same way. Optional fix:
same pattern. Skip if guardian-static doesn't flag.

### Verification

```
grep -c "transaction'+(row.count===1" index.html
```

Should return 1.

```
grep -c "transactions · " index.html
```

Should return 0 or 1 (depending on whether you fixed the second
match).

---

## Step 3 — F2: Net Worth modal duplicate value

**Find** the net worth modal header. Content-search:

```
grep -n "Math.abs(Math.round(nw.liquidNet))" index.html
```

Should return 1 match (~L4023).

**Find this exact line:**

```
      (nw.liquidNet>=0?'+':'-') + '$' + Math.abs(Math.round(nw.liquidNet)).toLocaleString() +
```

**Replace with:**

```
      (nw.liquidNet>=0?'+':'') + fmtC(nw.liquidNet) +
```

Three changes:
- `'+':'-'` becomes `'+':''` (because fmtC handles the negative sign)
- `'$' + Math.abs(Math.round(...))` becomes `fmtC(...)` (full precision)
- `.toLocaleString()` removed (fmtC already formats)

The result: header now shows `+$3,625.51` matching footer
`$3,625.51`. Same value, two locations, finally agreeing.

### Verification

```
grep -n "Math.abs(Math.round(nw.liquidNet))" index.html
```

Should return 0 matches.

```
grep -n "fmtC(nw.liquidNet)" index.html
```

Should return 2 matches (header + footer).

---

## Step 4 — F3: Edit Bill LAST PAID chip color logic

**Find** the LAST PAID chip rendering. Content-search:

```
grep -n "Last Paid" index.html
```

Should return 1 match in `openBillModal` (~L4579).

The chip uses hardcoded `color:var(--green)` regardless of state.
Need conditional based on `lastPaidStr`.

**Find this block (multi-line):**

```
    extraInfo.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">' +
      '<div style="background:var(--bg3);border-radius:var(--r-sm);padding:10px;text-align:center">' +
        '<div style="font-size:10px;color:var(--text3);margin-bottom:3px;text-transform:uppercase">Last Paid</div>' +
        '<div style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--green)">' + lastPaidStr + '</div>' +
      '</div>' +
```

**Replace with:**

```
    // Bundle 6: green only when actually paid (lastPaidStr is a
    // m/yyyy date). 'Not yet this month' is the un-paid state and
    // should render amber to match other "action needed" cues.
    const lastPaidColor = (lastPaidStr === 'Not yet this month')
      ? 'var(--amber)'
      : 'var(--green)';
    extraInfo.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">' +
      '<div style="background:var(--bg3);border-radius:var(--r-sm);padding:10px;text-align:center">' +
        '<div style="font-size:10px;color:var(--text3);margin-bottom:3px;text-transform:uppercase">Last Paid</div>' +
        '<div style="font-family:var(--mono);font-size:13px;font-weight:700;color:' + lastPaidColor + '">' + lastPaidStr + '</div>' +
      '</div>' +
```

Two additions:
- `const lastPaidColor` line above the innerHTML assignment
- `color:var(--green)` becomes `color:' + lastPaidColor + '` in the
  template

### Verification

```
grep -n "lastPaidColor" index.html
```

Should return 2 matches (definition + use).

---

## Step 5 — F4: Round-up preview hide-when-zero

**Find** the updateRoundUpPreview function. Content-search:

```
grep -n "function updateRoundUpPreview" index.html
```

Should return 1 match (~L5764).

**Read the function — it ALREADY has hide logic:**

```
function updateRoundUpPreview() {
  const amt = parseFloat($('ql-amt')?.value || 0);
  const cat = $('ql-cat-hidden')?.value || '';
  const preview = $('ql-roundup-preview');
  if (!preview) return;
  if (!amt || amt <= 0 || cat === 'Income' || cat === 'Income / Refund ↑' || !S.roundUpsEnabled) {
    preview.style.display = 'none'; return;
  }
  ...
}
```

**The bug isn't here. The bug is the modal's INITIAL state — the
preview element renders with whatever default style it has on modal
open, before updateRoundUpPreview fires.**

**Find** the preview element's HTML definition. Content-search:

```
grep -n "ql-roundup-preview" index.html | head -3
```

Should return 1 HTML match (~L947) plus 2-3 JS matches.

**The HTML at L947:**

```
<div id="ql-roundup-preview" style="display:none;margin:-8px 0 10px;padding:8px 12px;...
```

It's `display:none` by default. So why does it appear at $0 in the
modal?

**Hypothesis:** `updateRoundUpPreview` is called on `oninput` of the
amount field (per L940's `oninput="updateRoundUpPreview()"`). When
modal opens, no input has fired yet — preview should still be
display:none. The Layer V capture showing it visible is suspicious.

**Look at openQuickLogModal:** content-search:

```
grep -n "function openQuickLogModal" index.html
```

Read the function. If it's calling `updateRoundUpPreview()` on
modal open with empty amount, the function's early-return on
`!amt` is correct AND would set `display:none`. So preview should
NOT show at $0.

**Either:**
- (A) The Layer V capture was taken at a stale state where preview
  was previously shown (modal reopened?)
- (B) Some other path flips display to flex

**Defensive fix:** Make `openQuickLogModal` call
`updateRoundUpPreview()` immediately after opening, AND ensure the
initial HTML is `display:none`.

**Find** the openQuickLogModal function. Add a call to
updateRoundUpPreview before the modal opens:

Content-search:
```
grep -n "openQuickLogModal\b" index.html
```

Find the function definition. Inside the function body, find where
the modal is shown (likely a `.classList.add('open')` or similar).
**Just before that show line, add:**

```
  // Bundle 6: ensure round-up preview is hidden at modal open
  // (defensive against stale display:flex from prior session)
  const _ruPreview = document.getElementById('ql-roundup-preview');
  if (_ruPreview) _ruPreview.style.display = 'none';
```

If openQuickLogModal already calls updateRoundUpPreview at open,
this defensive prep is redundant but harmless.

### Verification

```
grep -n "Bundle 6: ensure round-up preview is hidden" index.html
```

Should return 1 match.

If after this fix the preview still appears at $0 on phone, the
bug is elsewhere — surface for next debug session.

---

## Step 6 — F5: TRACKED badge color

**Find** the TRACKED badge rendering. Content-search:

```
grep -n "TRACKED</span>\|TRACKED</div>" index.html
```

Should return 2 matches (one inline, one in a list view).

**Match 1 (~L5029, inline badge):**

Find:
```
const paidBadge = isPaid ? '<span style="font-size:10px;font-family:var(--mono);font-weight:700;background:var(--green-dim);color:var(--green);border:1px solid var(--green-border);border-radius:3px;padding:1px 5px;margin-left:4px">TRACKED</span>' : '';
```

Replace `var(--green-dim)`, `var(--green)`, and `var(--green-border)`
with their amber equivalents. The substituted line:

```
const paidBadge = isPaid ? '<span style="font-size:10px;font-family:var(--mono);font-weight:700;background:var(--amber-dim);color:var(--amber);border:1px solid var(--amber-border);border-radius:3px;padding:1px 5px;margin-left:4px">TRACKED</span>' : '';
```

**Match 2 (~L5215, badge variant):**

Find:
```
'<div style="background:var(--green);color:#000;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px">TRACKED</div></div>';
```

Replace with:
```
'<div style="background:var(--amber);color:#000;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px">TRACKED</div></div>';
```

Only `var(--green)` becomes `var(--amber)`.

### Verification

```
grep -c "TRACKED</span>\|TRACKED</div>" index.html
```

Should still return 2 (only colors changed, not structure).

```
grep -n "background:var(--amber).*TRACKED\|color:var(--amber).*TRACKED" index.html
```

Should return matches.

If the user objects after deploy ("amber feels too alarming"), the
fallback is to use a neutral grey: `var(--text3)` color with
`var(--bg3)` background. But amber is the recommended starting
point — it matches "needs your attention" cues elsewhere.

---

## Step 7 — F6: Cautious Mode banner copy

**Find** the cautious mode banner text. Content-search:

```
grep -n "Cautious Mode\|Watch Your Spending" index.html
```

Should return 1-2 matches (banner template).

**Find the banner string template** — likely something like:

```
'Cautious Mode — Watch Your Spending — $' + buffer + ' buffer after bills'
```

**Replace with:**

```
'Cautious Mode: $' + buffer + ' buffer after bills'
```

Drops the redundant "Watch Your Spending" middle clause. Mode name
already implies that. Single shorter line, less likely to wrap.

If the actual source uses different wording, find the closest match
and apply the same simplification: keep the mode name and the
buffer value, drop redundant verbal flourish.

### Verification

```
grep -n "Watch Your Spending" index.html
```

Should return 0 matches.

```
grep -n "Cautious Mode:" index.html
```

Should return 1 match.

---

## Step 8 — F7: Recent Spending filter round-ups

**Find** the recent spending render path. Content-search:

```
grep -n "RECENT SPENDING\|Recent Spending" index.html | head -5
```

There should be a section render that pulls from `S.txns`.

**Find the slice/filter that builds the list.** Likely something
like:

```
const recentTxns = (S.txns || []).filter(t => !t.income).slice(-5).reverse();
```

Or similar. Read the actual current implementation, then add the
round-up filter:

**Replace** `(S.txns || []).filter(t => !t.income)` (or whatever
the current filter is) with the same filter PLUS `&& !t._isRoundup`.

So if current code is:
```
const recentTxns = (S.txns || []).filter(t => !t.income).slice(-5).reverse();
```

Becomes:
```
// Bundle 6: filter round-ups out of Recent Spending (they appeared
// 3-of-5 in dashboard list, dominating real spend visibility).
// Round-ups still tracked elsewhere (Plan goals, Spending Pivot
// under Savings).
const recentTxns = (S.txns || []).filter(t => !t.income && !t._isRoundup).slice(-5).reverse();
```

Adapt to whatever the current line actually is. The point: AND
`!t._isRoundup` to whatever filter exists.

If recent spending uses a different render path (e.g., shared list
from a helper), find that helper and apply the filter at the call
site, NOT at the helper definition (which might be used elsewhere
where round-ups should be visible).

### Verification

```
grep -n "Recent Spending\|RECENT SPENDING" index.html
```

Should still find the section (just filter changed).

After phone-verify: open dashboard → Recent Spending should show 5
non-round-up txns (FIFA, Uber Eats, etc.), no "Round-up → China
Holiday" rows.

---

## Step 9 — F8: Plan provisions "Of" capitalisation

**Find** the Plan provisions row rendering. Content-search:

```
grep -n " Of \$" index.html
```

May return matches in templates. Also check:

```
grep -n "Saved.*Of" index.html | head -5
```

The capitalised "Of" appears in rendered output. Find the template
string responsible.

The fix is straightforward: change `Of` to `of` in user-facing
strings. But there may be a `toUpperCase()` or `toLocaleUpperCase()`
applied somewhere — investigate.

If a CSS `text-transform: uppercase` is applied to the parent div,
the issue is that it capitalises EVERYTHING including "of". The fix
in that case is to either:
- Remove `text-transform: uppercase` from that specific row
- Use `text-transform: capitalize` instead (but that capitalises
  every word)
- Restructure HTML so labels and values are in separate spans, only
  labels get uppercase

**Recommended:** Read the actual rendering. If template literals
have `Of`, change to `of`. If CSS forces it, remove the css from
the row containing "of $X" and apply only to the labels above.

After the change, "Saved: $75 of $5,000" reads correctly.

### Verification

```
grep -n "Of \$" index.html
```

Should return 0 user-facing matches.

---

## Step 10 — Validation

```
node guardian-static.js     # exit 0
node guardian-runtime.js    # 47/50 (3 known fixture-drift)
node tests/core.test.js     # 41/41
```

If any test fails, STOP and surface. Polish changes shouldn't
trigger logic guardians, but a pluralisation rule or copy-check
might exist. Read the failure carefully before deciding.

---

## Step 11 — Commit

```
git add index.html
git status
git diff --cached --stat
git commit -m "polish: 8 small visual + copy fixes from Layer V audit

Bundle 6 batches the small fixes from the at-rest visual audit
(pass 2). All low-risk, no logic changes.

F1: '1 transactions' → '1 transaction' singular pluralisation in
    spending pivot (renderSpendingPivot row template).
F2: Net Worth modal header now uses fmtC(liquidNet) for full
    precision instead of Math.round + toLocaleString. Header and
    footer now display the same value (was off by 49¢ from rounding).
F3: Edit Bill 'LAST PAID' chip now renders amber when value is
    'Not yet this month' (the un-paid state), green only when
    actually paid. Color logic now matches semantic state.
F4: Defensive fix in openQuickLogModal to ensure round-up preview
    starts hidden at modal open. Existing updateRoundUpPreview hide
    logic was correct but didn't fire on initial show.
F5: TRACKED badge color changed from green to amber. Green = good,
    but TRACKED specifically means 'pre-marked paid awaiting txn
    verification' — amber matches 'needs attention' semantic.
F6: Cautious Mode banner copy tightened: 'Cautious Mode — Watch
    Your Spending — \$X buffer after bills' → 'Cautious Mode: \$X
    buffer after bills'. Single shorter line, no mid-phrase wrap.
F7: Recent Spending filter excludes _isRoundup txns. 3-of-5 dashboard
    rows were round-ups dominating real spend visibility. Round-ups
    still tracked in Plan goals + Spending Pivot.
F8: 'Of' capitalisation in Plan provisions ('Saved: \$75 Of
    \$5,000' → 'Saved: \$75 of \$5,000'). Native readers process
    capital 'Of' as a stutter; sentence case reads cleanly.

Verification:
- guardian-static: exit 0
- guardian-runtime: 47/50 (3 known fixture-drift)
- tests: 41/41

Phone-verify post-deploy: walk through Layer V audit checklist
items F1-F8 individually."
git push origin main
```

---

## Step 12 — Phone-verify

Wait 5–10 min for GH Pages. Force-refresh PWA.

Walk the 8 fixes:

**F1** Open Analysis tab → spending pivot. Check rows with count=1
(Health, Shopping, Fixed). Should read "1 transaction" not "1
transactions".

**F2** Tap "Liquid net worth · tap for full picture" on dashboard.
Net Worth modal opens. Header value (top) should match Footer value
(bottom). Both `+$3,625.51`. No 49¢ gap.

**F3** Bills tab → tap any bill that hasn't been paid this month.
Edit Bill modal opens. LAST PAID chip should be amber if "Not yet
this month". (If a bill IS paid, it'll show m/yyyy in green —
that's the original behavior preserved.)

**F4** Tap + on dashboard. Quick-log modal opens. Round-up preview
row should be HIDDEN initially (before any amount is typed). Type
$3.50 — preview appears with "+$0.50 → China Holiday". Clear field
back to empty — preview disappears.

**F5** Open MI-13 banner from dashboard or open a tracked bill.
TRACKED badge should be amber, not green.

**F6** If Cautious Mode is the active survival mode (typical for
mid-cycle), the banner should be one line: "Cautious Mode: $X
buffer after bills". No wrap.

**F7** Dashboard → Recent Spending list. Should show 5 non-round-up
transactions. No "Round-up → China Holiday" rows.

**F8** Open PLAN. Provisions sliders. "Saved: $X of $Y" — lowercase
"of".

User reports PASS or FAIL per fix. If 6/8 pass, commit stays as-is
and the 2 failures get follow-up. If <5 pass, consider revert.

---

## Failure modes

| Symptom | Action |
|---|---|
| F1 still says "1 transactions" | check the second match in renderSpendingPivot vs balance-check |
| F2 header still rounded | maybe two fmtC variants — check the format helper |
| F3 chip still green when not paid | const declaration must come BEFORE the innerHTML assignment |
| F4 preview shows at $0 on first open | the openQuickLogModal patch didn't fire — check the show line position |
| F5 badge still green | grep for any other TRACKED badge variants — there may be a third |
| F6 banner still wraps | the simplification still too long; further trim |
| F7 round-ups still in list | the filter might be applied elsewhere — find the actual render path |
| F8 still capital "Of" | text-transform CSS — fix the CSS rule, not the template |

---

## Step 13 — Handoff block

After commit + push lands, generate a compact handoff block. Same
format as Bundle 5.

Include phone-verify results inline if available — given Bundle 6
has 8 separate verifications, list them as F1: PASS / F2: PASS / F3:
PENDING etc.

---

## End of prompt
