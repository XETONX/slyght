# State Audit — 2026-05-05

First audit. Future fixture refreshes diff against this for drift surfacing.

Source: `state-snapshot.json` captured via Mission EXPORT's `📁 Download
Export` button at 20:59 Sydney 5 May. Test clock locked at 22:00
Sydney 5 May (1 hour clear of export to avoid MI-12 false fire on
late-day txns).

## Real-state observations

### Financial snapshot
- Balance: **$381.35**
- Liquid net worth: **+$3,625.51**
- Days to payday: **10** (next payday May 15)
- Survival mode: **cautious**
- 7-day discretionary spend: $510.34 (Food $269 / Health $149 /
  Entertainment $59 / Shopping $30 / Fixed $3)
- Today spent: $91 (per dashboard)

### Transactions
- **104** entries

### BILLS (14 entries)

| # | Name | Day | Amt | Notes |
|---|---|---|---|---|
| 1 | Rent + Deposit Savings | 15 | $3000 | |
| 2 | KIA Loan — Firstmac | 15 | $780 | monthly |
| 3 | Amazon Prime | 3 | $9.99 | |
| 4 | Microsoft PC Game Pass | 7 | $19.45 | |
| 5 | Pet Insurance — Bowtie | 8 | $60.20 | |
| 6 | Claude Plus | 9 | $34 | |
| 7 | Netflix | 10 | $28.99 | |
| 8 | Optus — Phone + Internet | 16 | $194 | |
| 9 | YouTube Premium | 20 | $16.99 | |
| 10 | Adobe | 25 | $23.99 | monthly |
| 11 | Spotify | 26 | $15.99 | monthly |
| 12 | NRMA KIA Insurance | 2 | $1023.06 | yearly, dueMonth:4, **`recurring:false`** in fixture |
| 13 | Teachers Health | 1 | $259.41 | quarterly, dueMonths:[1,4,7,10] |
| 14 | Google Microsoft | 1 | $3 | monthly (custom — not in defaults) |

**Customizations vs. default BILLS (16 entries in seedV13):**
- DELETED: `Fuel` ($110, day 5), `Food at Work` ($100, day 28),
  `Afterpay instalment`, `Parking — CBD Secure`, `Pet Food`
- ADDED: `Google Microsoft` ($3, day 1)
- FLIPPED: `NRMA KIA Insurance` from `recurring: true` → `recurring: false`

The 14 count is correct for John's actual usage; surface to John if
anything looks like accidental deletion vs. intentional cleanup.

### paidBills (9 entries — categorized vs today=2026-05-05)

**Past-dated (correctly NOT firing MI-13) — 3:**
- `2026-5-Amazon Prime-3` (day 3 ≤ 5)
- `2026-5-Google Microsoft-1` (day 1 ≤ 5)
- `2026-5-Teachers Health-1` (day 1 ≤ 5)

**Future-dated (firing MI-13) — 6:**
- `2026-5-KIA Loan — Firstmac-15` (day 15, +10 days)
- `2026-5-YouTube Premium-20` (day 20, +15)
- `2026-5-Adobe-25` (day 25, +20)
- `2026-5-Spotify-26` (day 26, +21)
- `2026-5-Microsoft PC Game Pass-7` (day 7, +2)
- `2026-5-Claude Plus-9` (day 9, +4)

**Note re: mission spec's count.** The mission instruction listed
only 4 future-dated (KIA, YouTube, Adobe, Spotify) and put `Game
Pass day 7` + `Claude Plus day 9` in the past-dated bucket. On May 5,
day 7 is +2 days and day 9 is +4 days — both future. **MI-13
correctly identifies 6, not 4.** The "4 vs 6" framing in the mission
spec was an enumeration error; the invariant implementation is
correct. No bug, no calibration mission needed for this. OPEN-BUGS
#23 (calibration question about scheduled-auto-debit distinction)
remains the right home for the underlying ergonomic concern.

### Debts (6 total, 3 active for calendar markers)

**Active (not paid, not viaRent, has delayDate):**
- Afterpay — Concert Tickets — $93.56 — due 2026-05-14
- Borrowed from Michael — $500 — due 2026-05-16
- NRMA KIA Insurance — $1023.06 — due 2026-05-02

**Excluded from calendar:**
- Property Deposit (via Mum) — viaRent: true
- Borrowed from Michael (id:11) — viaRent: true ($450, May 15)
- Teachers Health — paid: true

Calendar diamonds (Mission B) render correctly on May 14 ($94) and
May 16 ($694 = Optus $194 bill + Borrowed from Michael $500 debt).
May 2 shows $1023 (NRMA — single item, red round dot for bill, even
though there's a separate debt entry; the bill renders win in the
visual).

### Savings buckets (4)
- China Holiday: $70.44 / $4000
- Rainy Day Fund: $0 / $2000
- (2 others not enumerated by audit query)

## Layer 2 invariant status (13 active)

### CRITICAL tier — 3 (all PASS)
- ✅ `state-shape-balance`
- ✅ `state-shape-txns`
- ✅ `state-shape-paidbills`

### FAIL tier — 9 (8 PASS, 1 FIRE)
- ✅ `cycle-spend-bounded`
- ✅ `borrow-recommendation-sane`
- ✅ `roundup-direction`
- ✅ `tomorrow-bill-matches-state`
- ✅ `alert-coherence`
- ✅ `consistency-fail-not-marked-ok`
- ✅ `no-future-dated-txns` *(would fire if test clock were noon Sydney instead of 22:00 — see Anomaly D)*
- 🔥 **`paidbills-key-not-future` — 6 violations** (the 6 future-dated paidBills above; correct behavior, OPEN-BUGS #23 covers the calibration question)
- ✅ `payday-interpretation-canonical`

### WARN tier — 1 (PASS)
- ✅ `bill-recurrence-coherent`

**Net: 12 pass / 1 fire / 0 critical. The fire is real-state behavior
working as designed (Mission D MI-13 catching the bug class it was
built for).**

## Anomalies worth investigating (not fixed; logged for follow-up)

### A. NRMA dual-represented as `recurring:false` BILLS entry + active S.debts entry
Fixture has NRMA KIA Insurance with `recurring: false` in BILLS
(meaning `getExpandedBills` excludes it from monthly expansion) AND
as an active `S.debts` entry with `delayDate: 2026-05-02`. So:
- Calendar's bill expansion: NRMA NOT shown (recurring:false filter)
- Calendar's debt iteration: NRMA shown as active debt on May 2
- Net visual: May 2 cell shows $1023 with red dot (rendered as debt)

Working-as-designed or accidental drift? If intentional, document
the pattern. If accidental (e.g., user converted to debt manually
when the yearly hit), consider whether `recurring:false` on a
yearly bill should automatically migrate to a debt entry instead
of staying in BILLS as dead data. Surface for John's call.

### B. fullPage screenshot truncates Settings tab
Settings page DOM has Math Health panel at y=2980 (verified via
`getBoundingClientRect()` debug query), but the Playwright
`fullPage: true` screenshot captures only 412×915 (viewport size,
NOT scroll height). DOM-level inspection confirms Math Health
renders correctly with the 6 MI-13 violations, but the visual
baseline doesn't capture it. The body's `scrollHeight` is reported
as 915 even though content extends to 2980+ — likely a CSS height
constraint on `<body>` or `pg-settings` that bounds the layout
flow.

Investigate Playwright fullPage + `scale: 'css'` + body height
mismatch in a Mission V follow-up. Not blocking Option A; limits
visual coverage of the Math Health panel and any other off-screen
Settings content.

### C. Survival forecast still shows "Projected to run out 8 days"
Per Analysis tab: "Projected to run out 8 days (Tue, 12 May)" with
breakdown showing `Unpaid bills (3) -$3,089.19`. This is RC8 /
OPEN-BUGS #19 — forecast doesn't credit the upcoming May 15
payday salary as a positive cashflow event. **Confirmed firing on
real state.** Mission C is scoped to fix.

### D. Test clock at 22:00 Sydney to avoid MI-12 false fire
Fixture captures real txns up to 8:59pm Sydney (export time). The
original test clock at noon Sydney would render those txns as
"future-dated" relative to the test clock and trip MI-12 — that's
a test-environment artifact, not real-state behavior. The clock is
now locked to 22:00 Sydney, 1 hour clear of export. Documented in
`visual/regression.spec.js`. Future fixture refreshes that capture
later in the day need to bump FROZEN_ISO accordingly (or shift to
midnight-of-next-day if exports are routinely past 23:00).

### E. Side-channel localStorage state required for fidelity
Mission V's spec now seeds `slyght_bills_reset_month` (so L7720's
monthly reset doesn't fire on first boot in test environment) and
the `slyght_seeded_v11/v12/v13` legacy compat flags. Without
`slyght_bills_reset_month`, the test boot CLEARS S.paidBills and
the auto-detect logic re-marks only those bills whose amount/name
matches recent txns — losing 7 of 9 entries and producing a
distorted MI-13 firing count.

This is a test-environment fix; on John's actual phone the reset
key has been set since first boot of the current month, so no
real-state divergence. Documented inline in the spec.

## Comparison to previous audit

None — this is the inaugural audit. Mission V follow-ups should
capture before/after deltas of:
- balance trajectory
- BILLS additions/deletions
- paidBills lifecycle (past-paid → reset on month rollover)
- debts added/cleared
- invariant pass/fail flip events

If future fixture captures show a different invariant firing
profile, this audit is the reference.
