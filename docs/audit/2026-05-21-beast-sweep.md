# Beast-Mode Sweep — 2026-05-21

**Status:** Phase 1 complete. Awaiting John's triage.
**Tip-of-main:** `a7759eb` (Bug 1 hotfix shipped — trip list no longer renders `[object Object]`).
**Live fixture:** pulled to `tests/state-dump/live-2026-05-21.json` (286 kB · bal $802.66 · 227 txns · 12 intents). Smoke fixture restored to 2026-05-19 baseline so 148/148 stays green.

---

## How to read this report

The findings are organized **by theme (broken assumption), not by file or severity**, per John's reframe. Each theme is a disease; its symptoms are individual code-level findings. Bundles should be scoped per theme.

Inside each theme:
- **Symptoms** — verified findings with file:line evidence
- **Root assumption** — what the code assumed that real usage violates
- **Sibling-symptom check** — where else the same assumption is baked in
- **Beast-mode questions at the theme level** (downstream / future / BRAIN-MODEL / conservation / SSOT)
- **Structural fix candidate** — kills the assumption everywhere vs patching one symptom

All findings here passed the Auditor agent's verification pass. Two **NEEDS-RECHECK** items are called out explicitly and recommended for re-investigation before being treated as confirmed.

---

## Bundle priority — recommended

Based on (a) live impact on John's daily decisions, (b) security exposure timer, and (c) substrate-leverage (one fix kills many symptoms):

| Order | Theme | Type | Why this priority |
|---|---|---|---|
| 1 | **G — Trust boundary / secrets in public code** | Security hygiene | Two real keys in public git history, exposure timer running |
| 2 | **A — Idealized cashflow / model-vs-bank reality** | Cashflow-truth bundle | The live "what's safe to spend" blocker John reported; pulls in F2 + F3 + F5 + H1 + H2 + H3 + M1 |
| 3 | **B — Calc duplication / substrate not reached** | Canonical adoption bundle | Closes 7 verified duplicate-formula classes; absorbs Bug 2 (32.9) naturally |
| 4 | **F — Canonical-writer bypasses** | Cleanup, partially overlaps B | Closes FR-03 (AI chat bypasses) + L21681 category-2 + 5 other raw-S.bal sites |
| 5 | **E — Flow dead-ends / descriptive-not-actionable** | UX polish | 4 modal dead-ends + toast-on-data-loss + native alert() violations |
| 6 | **D — Naming drift / vocabulary** | Design-led | 7 concept clusters; "Buffer" homonym is the worst |
| 7 | **C — Static-state assumptions / brittle specs** | Test architecture | Operationally relevant only when fixture refresh happens (rare cadence) |
| 8 | **H — Tooling silent failure** | One-line doc | `wrangler kv key list` needs `--remote` in v4.x |

Bug 2 (Bundle 32.9) was rated MED in earlier surface — confirmed correct. It's a symptom of Theme B (substrate not reached) and folds in cleanly there. Stay deferred until cashflow-truth ships.

---

## Theme A — Idealized cashflow / model-vs-bank reality

The app assumes cycle income arrives clean and bills are tracked by intent; reality is John's already-spent payday, invisible auto-debits, and manual reconciliations that close dollars but not bill-state.

### Symptoms

- **F2 (refined) · HIGH · substrate-gap** — `processAutoDebits` at `index.html:24875` skips bills with `billDateMs < S.autodebitProcessingStartTs` with `reason: 'pre-floor'`. The skip path doesn't mark them paid. So May 15-16 bills (Rent $3,000, KIA $780, Optus $194) stay `paid: false` indefinitely. Bank paid them; app model thinks they're still pending. `billsUnpaidTotal` stays inflated at $5,638.62 against $802.66 cash.

- **F3 · HIGH · multiple-sources** — same snapshot `BRAIN.plan.getSnapshot()` at `index.html:21042` produces two answers to "how much is left this cycle":
  - `remainder = totalToPlan − essentialsTotal` (planning view, `totalToPlan = netPay+bonus`) → currently **+$369.11**
  - `projectedEndBalance = currentBalance + expectedSalaryStill − billsUnpaidTotal − ...` (cashflow view) → currently **−$5,765.96**
  Dashboard headline shows the reassuring `remainder`. User makes decisions on the lie.

- **F5 · MED → HIGH** — bill-paid detection has two readers:
  - Calendar (`index.html:4596, 4628`): `isPaid = isPaidByKey || _isPaidByMatchingTxn(b, billDate)` — txn-match fallback at L4560-4576 (±5d window, ±$2 amount, name keyword)
  - Snapshot (`L21069`): `billsList.filter(b => !b.paid)` — flag-only, no fallback
  John logs a Pet Insurance $60.27 txn 05-20 → calendar credits it → snapshot's `billsUnpaidTotal` still counts it. Two surfaces disagree.

- **H1 · HIGH (sibling of F5)** — `getBillsDue()` at `index.html:4455-4478` uses `isThisMonthlyBillPaid` flag-only at L4461-4463. **12+ surfaces consume it**: Dashboard ribbon, WeekProjection, AI prompt L15208, AUDITOR.verifyState L17022, getDynamicBuffer L3605, getGenuineSurplus L2949. F5's gap is everywhere `getBillsDue` is.

- **H2 · HIGH (sibling of F2)** — `applyBalanceCorrection` at `index.html:7430-7446` + `BRAIN.balance.reconcileTo` at L20425-20458 write `S.bal` + correction-txn but never touch `paidBills`. Recon closes the dollar gap, not the model gap. John reconciles to $1,113 — system absorbs $3,974 as one `_isCorrection` txn but Rent/KIA/Optus stay `paid:false`.

- **H3 · HIGH (sibling of F3)** — `PREDICTOR.project` at `index.html:18087` ignores paid state entirely: `BILLS.filter(b=>b.recurring!==false).reduce(...)`. Net-worth projection disagrees with `projectedEndBalance`. Third long-view number for the same question.

- **M1 · MED** — `quickLogTxn` HABIT_MSGS at `index.html:10050`: `S.debts.filter(d => !d.paid).reduce(...)` — omits the `viaRent` exclusion every other reader uses (L18090, L21081, L20013 AI prompt). HABIT_MSGS shows a debt total ~$5,681 higher than the rest of the app (Mum-managed Property Deposit gets counted as immediate-owed).

### Root assumption

*Bill state changes only via app actions. Cash truth lives in `S.bal` but bill truth lives in `paidBills`; they're updated together.*

### Reality

- Bank pays via autodebit invisibly. The app model never learns.
- Manual reconciliation closes `S.bal` but doesn't propagate to `paidBills`.
- The chat AI mutates `paidBills` directly without txn (see Theme F).
- A logged txn that matches a bill auto-credits in some readers but not others.

### Beast-mode at theme level

- **Downstream impact:** every "how much is left" surface (12+ in cashflow-truth alone) reads at least one of these poisoned values.
- **Future implications:** Bundle 33 AI layer would compound the lie — it reads `getBillsDue` / `snap.derived` and would tell John he's fine when he's not.
- **BRAIN/MODEL alignment:** moves the codebase decisively toward BRAIN — the structural fix introduces `BRAIN.bills.isPaidInCycle()` as the canonical paid-detection.
- **Conservation:** the math invariant *would* hold (paid + unpaid = total) once paid-detection is canonical.
- **SSOT:** collapses 3-4 paid-detection paths to one.

### Structural fix candidate

1. **One canonical paid-detection reader.** `BRAIN.bills.isPaidInCycle(bill, cycleDate)` — accepts both the explicit `paidBills` flag AND the `_isPaidByMatchingTxn` fallback. Every consumer (snapshot, calendar, `getBillsDue`, predictor) calls it.
2. **Pre-floor reconciliation.** When `S.autodebitProcessingStartTs` is set (today: 2026-05-19), one-shot mark all bills with billDate ≤ floor as paid for the current cycle. Idempotent. Audit-logged.
3. **Reconciliation closes model state.** `BRAIN.balance.reconcileTo` extends to also reconcile bill state — given a balance delta, identify which bills likely fired (amount + day match) and mark them paid, surface for user review.
4. **Dashboard surfaces BOTH views.** The hero number is `projectedEndBalance` (cashflow). The "$369 to allocate" becomes a secondary "planning headroom" sub-line clearly labelled. User sees reality first.
5. **Bug 2 (Bundle 32.9) — trip-aware allocation** — folds in here. The split between forecast (trip-aware) and allocation (trip-blind) is the same disease at a different surface.

### Values calls for John

- **A.1** — Reconciliation auto-marks pre-floor bills paid, or surface for user to confirm? (auto = faster, manual = safer if reconcile-amount didn't actually clear those bills)
- **A.2** — Dashboard hero number — `projectedEndBalance` (cashflow truth) or `remainder` (planning headroom)? Both, clearly labelled? This is the F3 design decision and central to "stop lying to John."
- **A.3** — QuickLog → markPaid matching shape: amount + name fuzzy match (current `_isPaidByMatchingTxn`) extended app-wide, OR explicit "this pays bill X" picker on the QuickLog modal?

---

## Theme B — Calc duplication / substrate didn't reach surface

Canonical readers shipped in Bundle 30 / 32.1 / 32.4. Consumers stayed on legacy paths or computed inline. Drift accumulates per-feature ship.

### Symptoms (all verified)

| # | Concept | Sites | Severity |
|---|---|---|---|
| D1 | "Surplus / free money" | 4 formulas (L21199 `surplusVal`, L21124 `freeTotal`, L21175 `remainder`, L3363 `getGenuineSurplus`) — intersecting-but-different commitment sets | HIGH |
| D2 | Daily living budget | 3 (floor, days) pairs (L21121 trip-blind full cycle, L5848 trip-aware to-payday, L17668 avg×days) | HIGH (= Bug 2) |
| D3 | Max affordable per day | 2+ (L21147 snap vs L14884 QuickLog vs L2968 getDynamicDailyBudget) | HIGH |
| D4 | Bills total this cycle | 2 readers — L21068 with overrides vs L4671 MODEL path without | HIGH (post-Bundle 32.1) |
| D5 | Days to payday | 3 implementations — L2896 daysLeft (Feb-clamp + paydayReceived gate), L21058 snap round, L4657 ceil. INV-15 partial; snap not asserted equal to either. Maps to OPEN-BUGS FR-06. | HIGH |
| D6 | Discretionary cycle spend | 4 filters — L3622, L3853, L6100-6101, L5720 (already on OPEN-BUGS #6B) | MED |
| D7 | Bucket saved totals | 3 readers — L21105 snap walks overrides, L16962 `getBucketTotal` raw, inline at L8827/L14876/L15193/L3360 | MED → HIGH post-override |

### Root assumption

*Shipping a canonical reader is the same as adopting it everywhere.* The Pass 3 changelog explicitly defers Pass 4 ("phase out legacy stores... deferrable indefinitely"). That phrase is the smoking gun.

### Structural fix candidate

1. **Migration sprint.** Each duplicate formula either (a) re-routes to `snap.derived.<X>`, or (b) is deleted as dead code if its surface is gone.
2. **Guardian rule** that flags inline formulas mirroring `snap.derived` shape (`totalToPlan - X - Y` patterns) and suggests the canonical reader.
3. **Bug 2 (Bundle 32.9) — trip-aware allocation** is D2's structural fix and ships with this bundle.

### Note on D7 — bucket reads

Live state currently has zero `savings:*` overrides. The duplication is dormant. **The next allocation John makes will activate D7's drift** — getBucketTotal users will read raw S.savingsBuckets, snap will respect the override, they disagree. Pre-emptive fix.

---

## Theme C — Static-state assumptions / brittle specs

Smoke specs hardcode values that real John behavior changes (target amounts, bucket renames, trip dates). When fixture is refreshed, specs treat user edits as regressions.

### Symptoms

**Verified — F6 family in 2 files:**

- `tests/smoke/trip-forecast-uplift.smoke.js` — Cases 3, 4, 7, 10 hardcode Darwin target=$900, days=9, dates Jun 7-15
- `tests/smoke/pass-3-consumer-migration.smoke.js` — 2c hardcodes $400 coverage example, 4a `expect(r.target).toBe(50000)` (apartment goal), 5a `expect(r.rdfTarget).toBe(9000)` (RDF target), 3a-3b hardcode bucket name `'Darwin Trip'` string

**NEEDS-RECHECK — separate cause suspected** (Worker 2 flagged, grep confirmed):
- `essentials-lifecycle-split.smoke.js` Case 3
- `plan-reset-cycle.smoke.js` Case 2
- `reset-cycle-ui.smoke.js` Case 6

These three failed in the fixture-refresh smoke run but contain **no $900/$800/target literals**. Failure cause is likely: EOD modal interception, `_auditLog` 500-entry cap, or `MODEL.paydayDate` advancing past `paydayReceived=true`. **Recommend short investigation before treating them as Theme C — they may be different bugs.**

### Robust patterns observed

`snap-derived-allocation.smoke.js`, `allocation-framing.smoke.js`, `essentials-lifecycle-split.smoke.js`, `inv*.smoke.js`, `intent-activation.smoke.js`, `autodebit-batch.smoke.js`, `transaction-paths.smoke.js`, `phase-a-auth.smoke.js`, `phase-g-discretionary-canonical.smoke.js`, `plan-lock-unlock.smoke.js`, `plan-hero-money-breakdown.smoke.js`, `analysis-essentials.smoke.js`, `essentials-drilldown.smoke.js`, `diagnostics.smoke.js`, `push-on-save.smoke.js` — all use relationship / structural / pre-post-equality assertions. Strong patterns to emulate.

### Root assumption

*Specs assert what they assert; fixture state is part of the spec definition.* Reality: live fixture is operator-defined (John's actual state), and what John edits in the app is not a regression.

### Structural fix candidate

1. **Assertion-style guide** in `tests/README.md`: ABSOLUTE only for test-controlled values (the test sets the input). RELATIONSHIP / DERIVED / STRUCTURAL for fixture-derived values.
2. **`darwinFixture(page)` helper pattern** (Worker 2's proposal): each spec reads `intent.targetAmount`, `intent.meta.days`, `intent.startDate` from the fixture and asserts relationships. Drop-in for the affected 7 Darwin assertions.
3. **Two-tier fixture choice (architectural):** synthetic frozen fixture for absolute-value specs (e.g., `tests/fixtures/synthetic-baseline.json`) vs live fixture for relationship-asserting specs. Allow both. Specs declare which they use.

---

## Theme D — Naming drift / vocabulary multiple-sources

7 concept clusters with divergent labels. Same conceptual entity reads as different things on different surfaces.

### Symptoms (Worker 4)

| Cluster | Labels in flight | File:line samples |
|---|---|---|
| Discretionary money this cycle | Free to allocate / Pool to allocate / Still to allocate / left to allocate / Cycle remainder / free surplus / monthly surplus | L11116, L13370, L26418-20, L12061, L7369, L7418 |
| Daily living budget | Max per day / Daily living / Daily floor / Daily minimum / daily target / dailyRate / dailyCap / weekdayBudget | L881, L10726, L6555, L12655, L3114, L3140, L6271 |
| Buffer / safety / rainy day | **3 distinct numbers**: Rainy Day Fund (bucket goal) / Safety buffer (snap.bufferFloor) / dynamic buffer (getDynamicBuffer) — all labelled "buffer / cushion / safety" | L2237, L11140, L3602 |
| Allocated / committed / locked | Already allocated / Mark as allocated / totalCommitted / billsCommitted / Plan locked / pre-committed | L11168, L9496, L2949, L3510, L1931 |
| Covered (trip/debt) | Mum covered / uncle covered / covered first / gfSplitting / isBillCoveredByDebt — **4 distinct meanings** | L8027, L15553, L12240, L3822 |
| Bill states | Mark as paid / Mark Cleared / Auto-debits / count it as paid / cleared | L257, L1835, L1732, L4282 |
| Income / pay | Monthly salary / Income / net pay / Payday / paydayReceived / LANDED / markPaydayLanded | L1152, L10543, L3880, L10938 |

**Same-word-different-meaning highlights:**
- **"Buffer"** = 3 distinct numbers on the same screen
- **"Locked"** = 4 meanings (plan canvas / bucket / fixed-rate debt / super age-locked)
- **"$X/day"** = 2 values (Max-per-day dynamic vs Daily-living static)
- **"Covered"** = 4 meanings
- **"Cleared"** = 2 stores (bills `paidBills` vs debts `paidAt`)

### Root assumption

*Consistent naming follows from consistent code.* Reality: features ship with their own copy. The Pass 3 RDF rename principle was the right move but hasn't propagated.

### Structural fix candidate

**Vocabulary registry.** Per canonical state key, one approved user label. Enforced via Guardian rule: scan string literals near known state-key reads, flag off-label terms.

Proposed initial registry:
```
snap.derived.remainder        → "Free to allocate"
snap.derived.stillToAllocate  → "Left after goals"
snap.bufferFloor              → "Safety buffer"
S.buckets[rainyDay]           → "Rainy Day Fund" (drop "Emergency Fund")
S.dailyLivingFloor            → "Daily living floor"
(bal − committed) / days      → "Max per day"
```

This is design-led work — recommend looping Opus for the registry definition. Engineering follows.

---

## Theme E — Flow dead-ends / descriptive-not-actionable

Modals show the problem as text + 5-bullet remediation menu, but only Cancel button. User has to manually navigate to the named surfaces.

### Symptoms (Worker 5)

| # | File:line | What user sees | Severity |
|---|---|---|---|
| 1 | `explainNegativeProjection` L12296-L12307 | "Overcommitted by $X" + 5 options as text · Cancel only | HIGH |
| 2 | `openPaydayLockPlan` shortfall L12321-L12328 | "Can't lock yet" + same 5 options · Cancel only | HIGH |
| 3 | `openPaydayAutoAllocate` shortfall L12136-L12143 | "Can't auto-allocate" + options · Cancel only | HIGH |
| 4 | Bill coverage alert L9594 | "At this rate you will not cover [bill]" inline text · NO tap-handler | HIGH |
| 5 | Negative free-money advisory L11138 | Inline text in `renderPaydayPlanRoot` · descriptive only | HIGH |
| 6 | WRX allocation fail L7804 | Toast only | MED |
| 7 | Mark-bill-paid fail L19859, L19896 | Toast only | MED |
| 8 | **Lock-disk-write fail L21800** | **Toast only — data-loss-risk path** | **MED → HIGH (data risk)** |
| 9 | Storage quota L2482 | Toast only on data-loss event | MED |
| 10 | INV-28 `insufficient-free-money` refusal L24191 | Raw machine reason shown via showToast | MED |
| 12 | Native `alert()` fallback L12300, L10556, L11594, L10578 | Violates CLAUDE.md §8 | LOW |
| 13-14 | Auto-dismiss on major state events (markPaydayLandedToday L10571, auto-allocate L12287) | User may miss critical info | LOW |

### Structural fix candidate

**Shared `openOvercommittedModal({snap, returnTo})` helper.** Real action buttons: jump-to-Savings · jump-to-Bills(Defer mode) · jump-to-DailyLiving. Collapses the 4 sibling dead-ends into one actionable affordance. Reset-cycle modal at L10656 is the pattern to emulate (well-built — receipt-style, danger styling, jump-back render).

For data-loss-risk paths (L21800, L2482) — upgrade from toast to modal with explicit "Export now" action.

Native `alert()` calls at 4 sites — replace with `EDIT_MODAL.openInfo` per §8.

---

## Theme F — Canonical-writer bypasses / BRAIN-MODEL boundary

State mutations outside the canonical `BRAIN.<domain>.<verb>` pattern. Guardian Layer 1 catches most; these slipped through (or sit inside Brain writers without composing through `BRAIN.balance`).

### Symptoms (verified)

| File:line | Code | Context | Severity |
|---|---|---|---|
| `index.html:3914` | `S.bal = b` | `launchApp()` onboarding submit — no source tag, no audit | HIGH |
| `index.html:7438` | `S.bal = parseFloat(newBal.toFixed(2))` | `applyBalanceCorrection` — recordCorrection runs but bal write is raw | HIGH |
| `index.html:10249-10252` | `S.bal -= t.amt` + `S.txns.splice` | `rmTxn()` user delete-transaction handler. `BRAIN.transaction.removeByTsWithBalance` exists but isn't called | HIGH |
| `index.html:15721-15722` | `S.paidBills[paidBillKey(...)] = true` | **chatAction `mark_bill_paid`** — AI tool. No paired txn, no audit, no `BRAIN.bills.markPaid`. **Companion to FR-03.** | HIGH |
| `index.html:19862` | `S.bal = parseFloat((S.bal - billAmt).toFixed(2))` | `markBillPaidNow` user action after `BRAIN.bills.markPaid` — bal write is the caller's responsibility instead of the writer's | HIGH |
| `index.html:21681` | `S.bal = parseFloat((S.bal + (+findRes.amt || 0)).toFixed(2))` | **`BRAIN.plan.untickItem` — category-2: BRAIN writer raw-writes S.bal instead of composing through BRAIN.balance.applyDelta** | HIGH |
| `index.html:24524, 24571, 24575, 24984, 24999, 25329` | `S.bal ± balDelta` patterns | Inside `BRAIN.transaction.updateTxn`, `removeByTsWithBalance`, `BRAIN.bills.unmark`, `BRAIN.debts.unmark` — raw bal mutations inside other BRAIN writers | MED → HIGH (category-2 siblings) |
| `index.html:19048` | `S.txns.push({ amt: 0, note: 'No spend...' })` | Service-worker NO_SPEND msg handler. Guardian allow-block claims "permanent — narrow surface" — recommend re-evaluation | MED |
| `index.html:16150` | `S.txns.splice(idx, 1)` after raw `S.bal` adjust | One-shot `bootResetTestState` cleanup. Idempotent, boot-time. | LOW |

### Root assumption

*BRAIN writers fully encapsulate state mutations.* Reality: some compose correctly (`BRAIN.transaction.recordWithAllocation` composes through `BRAIN.balance.applyDelta`), others raw-write `S.bal` inside their own bodies. Inconsistent contract.

### Structural fix candidate

1. **Composition rule (documented + Guardian-enforced):** every BRAIN.<X> that touches balance must compose through `BRAIN.balance.applyDelta`. Raw `S.bal = ...` inside another writer's body is a category-2 violation.
2. **Chat AI bypass at L15721** — route through `BRAIN.bills.markPaid` per FR-03 family. AI tools are no exception.
3. **`rmTxn()` at L10249-10252** — swap call to `BRAIN.transaction.removeByTsWithBalance` (already exists).
4. **Onboarding bal set at L3914** — `BRAIN.balance.set(b, BRAIN.SOURCES.ONBOARDING_INITIAL)` (new source tag).
5. **Service-worker NO_SPEND allow-block** — re-evaluate. Add `BRAIN.SOURCES.SW_NO_SPEND` if keeping; route through `BRAIN.transaction.record`.

This Theme overlaps Theme A (where canonical paid-detection is the structural fix) and Theme B (where canonical readers are the structural fix). Recommend folding Theme F's high-severity items into Theme A's bundle scope — they share the same root.

---

## Theme G — Trust boundary / secrets in public code

GitHub Pages = source viewable + git history permanent. Two real keys committed.

### Symptoms

| # | Finding | File:line | Classification | Rotation | History scrub |
|---|---|---|---|---|---|
| F7 | OpenWeatherMap API key `7fb97ad9a88a00311f37516f8712075d` | `index.html:18409` | genuine-secret | y | y |
| F8 | RECON_TOKEN `427169922a24fe022647e3463834e2f77c20cc160033c955` | `slyght-worker/src/index.js:428` + `index.html:13964` | genuine-secret | y (or delete endpoint) | y |
| — | VAPID public key `BJ2ihjc6OXMN...` | `index.html:18588` | **public-by-design** (required for push subscribe) | n | n |
| — | Anthropic `S.apiKey` / `localStorage['slyght_api_key']` | user-provided | **user-provided**; redacted on export at L14942 | n | n |
| — | VAPID private key | `slyght-worker/src/index.js:826, 840, 890` reads `env.VAPID_PRIVATE_KEY` | clean (worker secret) | n | n |
| — | wrangler.toml | `[vars]` only contains `WORKER_ENV='production'` | clean | n | n |
| — | scripts/recon/pull-from-kv.js | reads from CLI arg / env var / fixture field — no hardcoded fallback | clean | n | n |
| Process gap LOW | `tests/visual-captures/.../index.json` serializes `S.apiKey` to disk (gitignored but on disk) | leak surface narrow but exists | classify | n | n |

### Action commands for John

**F7 — OpenWeatherMap (recommend proxy via worker; OWM doesn't support strict origin restriction):**

```bash
# 1. Rotate at openweathermap.org/api → revoke 7fb97ad9... → generate new
# 2. Set new key as worker secret:
cd slyght-worker
npx wrangler secret put OWM_API_KEY
# (paste new key)

# 3. Worker code change: add GET /weather endpoint that reads env.OWM_API_KEY,
#    fetches OWM, caches 10 min in KV, returns trimmed JSON.
# 4. Client change in index.html:18417 — replace OWM URL with worker proxy:
#    'https://slyght-worker.johndounas.workers.dev/weather?lat=...'
# 5. Remove WEATHER.apiKey from client entirely.
```

**F8 — RECON_TOKEN: recommend DELETE the endpoint (functionally redundant with device-token-auth'd `/pull-full-state`):**

```bash
# 1. Delete /recon-payload handler + RECON_TOKEN const from slyght-worker/src/index.js
# 2. Delete URL_RECON constant + any callers from index.html (~L13964 region)
# 3. Deploy:
cd slyght-worker && npx wrangler deploy
```

Cleaner than rotating a redundant token. If kept (e.g. for ADR-E promotion): `npx wrangler secret put RECON_TOKEN` with a new value; worker reads `env.RECON_TOKEN`.

**Git history scrub** — both F7 and F8 secrets are in commit history. Rotation makes the leaked values inert; scrubbing is best-practice for a public repo. Flag for John's BFG / `git filter-repo` decision. Recommend doing it once after both rotations land (single force-push event).

**Visual-capture redactor (LOW)** — add a `_redactSecrets(state)` step in `tests/helpers/capture-state.js` that nulls `apiKey` / `slyght_device_token` / `_deviceToken` fields before serializing. Defends if a capture bundle is ever shared externally.

### SECURITY.md decision log entry (per John's spec)

> 2026-05-21 — secret/credential audit run as part of beast-mode sweep; findings + migrations in `docs/audit/2026-05-21-beast-sweep.md` Theme G. F7 (OWM key) + F8 (RECON_TOKEN) flagged for rotation + history scrub.

---

## Theme H — Tooling silent failure

Single-finding theme; minor but real.

- **F1 · LOW · tooling** — `wrangler kv key list --namespace-id=<X>` in wrangler 4.x defaults to `--local` mode (empty namespace). Production namespace requires explicit `--remote`. Caught during Step 0 of this sweep (initial list returned `[]`; `--remote` returned 9 keys). Admin tooling that omits `--remote` silently lies.

**Fix:** add a one-line note to `scripts/recon/README.md` (if exists) or `README.md` reconciliation section: *"All wrangler KV operations pass `--remote` explicitly to avoid local-mode default in wrangler 4.x."* Wrapper script `scripts/recon/kv-list.sh` optional.

---

## Bug 2 — explicit scope call

**Per the May 20 surface and John's direction:** Bundle 32.9 (trip-aware allocation) is its own bundle, not a patch. **Confirmed correct.**

But: with Theme A's live impact, **Bundle 32.9 should NOT be next**. Sequence:

1. Theme G (secrets — exposure timer)
2. Theme A (cashflow-truth — live blocker)
3. Theme B + 32.9 + Theme F (substrate adoption — Bug 2 folds in here naturally; D2 is Bug 2's structural fix)
4. Theme E (UX dead-ends)
5. Theme D (vocabulary, design-led)
6. Theme C + the 3 NEEDS-RECHECK specs

Bug 2's $0 current impact on John's live state (Darwin is fully bucket-covered, Option C net-of-bucket = 0) confirms it can wait until Theme B's bundle.

---

## Feature-map reconciliation

Quick survey — full audit is its own task. Items flagged as **stale or needing entries**:

- `FEATURE-MAP.md` does not have entries for several recent additions: `BRAIN.plan.intent.getUpliftPerDay`, `BRAIN.plan.intent.getHybridPropertyDeposit`, `BRAIN.plan.resetCycle`, `snap.derived.essentialsBreakdown` / `discretionaryBreakdown` / `essentialsPaidTotal` / `essentialsUpcomingTotal`, the receipt-pattern modal shape (`data-receipt-row`)
- `BRAIN.transaction.recordWithAllocation` is present but its bucket-credit semantics (INV-28 + bucket destination) may be under-documented
- The `paidBills` map's schema (`{[key]: true | {paid: true, ...}}`) and `paidBillKey()` conventions deserve their own section — Theme A's structural fix depends on them
- `_isPaidByMatchingTxn` (L4560) is undocumented in FEATURE-MAP — it's a load-bearing helper for the calendar's paid view

**Action:** small follow-up commit to update FEATURE-MAP after Theme A or B ships. Not blocking.

---

## NEEDS-RECHECK items

Two items that survived audit but warrant short re-investigation before being treated as confirmed:

1. **3 failing specs without $900 hardcoding** — `essentials-lifecycle-split.smoke.js` Case 3, `plan-reset-cycle.smoke.js` Case 2, `reset-cycle-ui.smoke.js` Case 6 all failed against the fresh fixture but contain NO `$900` / `$800` / target literals. Likely cause: EOD modal interception of pointer events, `_auditLog` 500-entry cap collision, or `MODEL.paydayDate` advancing past `paydayReceived=true`. Worth ~15 min investigation — may reveal a separate theme. Not blocking.

2. **L21681 BRAIN.plan.untickItem raw-write** — verified during audit. This is the only category-2 violation in a BRAIN writer body (others were caller-side). Worth confirming whether the 6 other raw-S.bal sites inside BRAIN writers (L24524, L24571, L24575, L24984, L24999, L25329) follow the same pattern or differ in shape — quick read before Theme F fix lands.

---

## Method notes (for next sweep)

What worked:
- Parallel worker agents (7 categories) returned in ~3 minutes wall-clock for what would have been 30 min sequential
- Auditor agent caught 0 disputes but flagged 2 NEEDS-RECHECK items — both load-bearing, both confirmed on follow-up
- Theme-by-disease grouping (per John's reframe) makes the bundle scoping decisions obvious

What to refine:
- Worker agents over-reached on some sibling claims (e.g., declaring "12+ surfaces" without enumerating all). Tighter brief next time: "enumerate the sibling sites; don't claim a count without listing them."
- Auditor spot-checked load-bearing claims but didn't re-verify every cited file:line. Acceptable trade-off given the time saved, but next sweep should explicitly NEEDS-RECHECK the un-verified ones rather than treating absence-of-objection as verification.
- The "fix-forward Bug 1 vs surface substrate-shaped" autonomy line held cleanly. Bug 1 shipped in 30 min isolated; 8 themes captured for triage without scope blur.

---

**End of report.** Surfaced. Awaiting John's triage.
