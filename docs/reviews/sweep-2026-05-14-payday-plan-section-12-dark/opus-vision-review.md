# Opus vision review — sweep-2026-05-14-payday-plan-section-12-dark

## 0. Context (from METADATA)

- **John's instruction:** captures should be in dark mode to match John's phone-default theme; this is a re-capture of the earlier "retro" light-mode sweep.
- **Scenario:** three sequential scenarios (A: bonus + Darwin + auto-allocate + lock · B: buffer set to $1,000 "impossible" · C: bonus confirmed + payday landed + lock) captured across 21 dark-mode PNGs.
- **Value(s) of interest per METADATA:** `bonus.amount`, `savings.total`, `maxAffordablePerDay`, `paydayReceived`.
- **Frame count:** 21 (13 A · 4 B · 4 C).
- **Pre-hypothesis (CC):** retro F-01..F-14 findings hold in dark; no new structural bugs; dark improves hierarchy.
- **Commit at sweep:** `6ce96cd`.

## 1. Pre-flight notes

**Two material issues with the package before I look at pixels:**

1. **The companion retro (light-mode) sweep is referenced 6 times in METADATA but is not included in this ZIP.** I cannot do a true light-vs-dark delta — only dark-mode assessment + finding-by-finding sanity check against the descriptions CC gives. I am taking F-01..F-14 on trust based on CC's verbal descriptions in METADATA §7. **Recommend John verify the retro folder lives at `docs/reviews/sweep-2026-05-14-payday-plan-section-12-retro/` before approving Phase 4 line-by-line.**

2. **The phase1-4 markdown files in this folder are placeholders.** They say "_To be filled in per MOCK-SWEEP-PROMPTS v2_" and explicitly delegate to the retro folder. This works as long as I have the retro folder (I don't, see above). The handoff doc compensates, but the official protocol expects the phase files to be self-contained. **Process note for amendment:** future dark-companion sweeps should at least repeat the F-NN reference table inline, not delegate.

Beyond those: METADATA §5/§6 (verifiable / not-verifiable) are well-defined. The fixture `state-snapshot.json` is included. Filename convention is clean (NN-scenario-X-...). I can proceed but with the caveat that retro-context cross-references are inferred from CC's descriptions, not directly verified.

## 2. Per-frame sanity check (Pass A)

Sanity-check on CC's reading. Nothing major to extend in CC's Phase 1 inventory based on what's described in METADATA — but several specific observations CC didn't surface in the dark-mode table (§7 of METADATA) that I'll raise as concerns in Pass E.

The frames sort correctly. Every frame matches its filename description. State across frames is coherent within each scenario.

## 3. State persistence trace (Pass B)

### Trace 1 — `bonus.amount` across Scenario A (frames 01-13)

| Frame | Visible state of `bonus.amount` | Coherent? |
|---|---|---|
| 01 | $1,500 EXPECTED (carried-forward toast confirms) | Baseline post-rollover (note: fixture says 0; carried-forward toast is the explanation) |
| 02 | Modal open, $1,500 chip highlighted | ✓ persists from canvas to modal |
| 03 | Modal Custom input $1,341, $1,500 chip no longer highlighted | ✓ active state moves with edit |
| 04 | Canvas root: $7,282 net + $1,341 bonus EXPECTED | ✓ save propagates to root |
| 05–11 | $1,341 EXPECTED persists through 7 frames + sub-screen navigations | ✓ persistence intact across nav |
| 12 | Lock confirm modal — bonus still $1,341 | ✓ |
| 13 | Locked canvas — $7,282 + $1,341 bonus EXPECTED, edit pencil still present | ⚠ see Pass E E-04 — bonus still shows EXPECTED and edit pencil after lock |

**Conclusion:** Bonus amount persists correctly across the full scenario A. **This is the bug John reported (bonus wiping on canvas re-entry) and it appears RESOLVED in this build.** The state-persistence trace shows clean propagation from modal save → root display → through sub-screen navigation → through lock. Great work. The retro F-NN finding that addressed this should be marked verified-by-vision.

### Trace 2 — `bonus.amount` + status across Scenario C (frames 18-21)

| Frame | bonus.amount | bonus.status | Coherent? |
|---|---|---|---|
| 18 | $1,341 (carried from prior) | EXPECTED | Baseline |
| 19 | Modal: $1,000 chip highlighted, status dropdown set to "Confirmed (already landed)" | switching | ✓ both fields editable simultaneously |
| 20 | Canvas: $1,000 bonus, "✓ LANDED" green pill | Confirmed | ✓ status change propagates; visual changes from amber EXPECTED → green LANDED |
| 21 | Locked canvas: $1,000 bonus, "✓ LANDED" persists | Confirmed | ✓ persists through lock |

**Conclusion:** Status change Expected → Confirmed propagates correctly. Visual badge changes from amber to green. **However**: see C-01 below — when status flips to Confirmed, OTHER display logic changes in non-obvious ways. The status change is correct; the cascade is hazardous.

### Trace 3 — `paydayReceived` across Scenario C

| Frame | paydayReceived? | Visible affordance |
|---|---|---|
| 18 | false (fixture) | No payday CTA in header |
| 19 | false (modal open) | n/a |
| 20 | false but bonus Confirmed | **NEW green pill "Pay landed today?" appears in header** ✓ |
| 21 | true (after pill tap presumably) | Header shows "✓ Paid 14 May" + lock banner |

**Conclusion:** **🎯 Genuinely good UX I want to call out positively.** When bonus is marked Confirmed but paydayReceived is still false, the canvas surfaces a proactive "Pay landed today?" CTA in the header. This is the kind of inferred-need affordance that justifies the whole canvas existing. CC: this is the design pattern worth replicating elsewhere — proactive prompts when state implies the user is about to do something.

### Trace 4 — `bufferFloor` impact on `maxAffordablePerDay` (Scenario B)

| Frame | bufferFloor | maxAffordable/day | Coherent? |
|---|---|---|---|
| 14 (canvas) | $364 (fixture) | n/a (canvas doesn't show) | baseline |
| 15 (modal fresh) | $364 | $66 shown in preview | ✓ |
| 16 (modal $1,000) | $1,000 (preview only) | $45 shown in preview | ✓ math: higher buffer → lower max |
| 17 (after save) | $1,000 | $45 shown on daily living card | ✓ persisted |

**Conclusion:** Buffer math propagates correctly. **However**: see B-01 below — when buffer becomes "impossible" relative to history, the canvas does NOT visually escalate.

## 4. Intended changes (Pass C)

This sweep is a re-capture, not a code change. CC's METADATA §7 makes 10 dark-vs-light claims. I cannot verify them without the retro folder. Based on dark-mode pixels alone:

✅ **Confirmed in pixels (the dark mode is functioning):**
- Save/Apply buttons render in bright/saturated green on dark — primary action visually unmistakable (frames 02, 07, 10, 12, 19)
- EXPECTED amber pill renders with rich amber tone on dark (frames 01, 04, 09, 13, 18)
- LANDED green pill renders crisp on dark (frames 20, 21)
- Locked-plan banner amber gradient renders warmly on dark (frames 13, 21)
- Negative red figures ("-$5,205 / -$5,546") have visual urgency without being shouty (multiple frames)

⚠ **Cannot confirm (need retro folder for true delta):**
- "dark wins" claims in CC's §7 table — without paired light frames, I can confirm dark renders well, not that it's better than the alternative

🚨 **Unflagged change I can see (CC didn't claim, but visible):**
- Toast pills appear to NOT auto-dismiss within the capture window across at least 7 consecutive frames in Scenario A. CC's D-1 mentions toast visibility but characterises it as a contrast property, not a persistence property. **This is either (a) a real bug where dismiss doesn't fire, or (b) a capture artifact where Playwright captures too fast for dismiss timer.** Either way, it deserves more than D-1's note. See E-02.

## 5. Unintended changes (Pass D)

Re-capture only, so unintended-change interpretation differs from a code-ship sweep. Re-framing: things in dark mode that look unintended *structurally*, not theme-deltas.

- **Slider marker chips (🎯 / 🚫 max) overlap each other AND overlap content below the slider** (frames 05, 17). The chips are positioned beneath the slider thumb but their vertical stack collides with the "Last 30 days you actually spent $X/day" text immediately below. Text reads "Last 30 [chip][chip] u actually spent ..." — significant readability loss. CC's METADATA §7 says marker readability is "parity" with light. Marker-vs-track-color readability may be parity. Marker-vs-content-below readability is broken on both themes — this is a layout bug, not a theme bug. CC's framing missed it.

- **Locked-plan wide banner clips at the right edge at 380px** (frame 13): "🔥 2 cycle stre[ak]" — the word "streak" is cut off. **Worse in frame 21**: "Tick items..." becomes "ick items..." AND "💰 payday r" — clipped on BOTH sides this time. Banner is wider than viewport. Layout bug.

- **Cross-frame inconsistency on `1,609` (canvas remainder) vs `1,245` (savings pool)** — these are two different "free money" figures computed differently, displayed on two surfaces (canvas root vs savings sub-screen) with no visible reconciliation. See C-04 in §6.

## 6. Concerns visible in pixels (Pass E)

These are concerns I see in the dark-mode frames. Some likely confirm existing F-NN findings (which I can't directly check without the retro folder), some are new. I've labeled them with my own naming (E-NN) and CC can reconcile against F-NN during loop-closure (Prompt C step 3.2).

---

### 🚨 BLOCKING

**E-01 — Math sub-line on Savings sub-screen is arithmetically wrong (frames 06, 08)**

Frame 06 displays: `$1,907 surplus - $364 safety buffer = $1,245`

Arithmetic check: $1,907 − $364 = **$1,543**, not $1,245.

The discrepancy is $298, which is the Annual Provisions line item. The actual computation is `$1,907 − $364 − $298 = $1,245`, but the displayed formula omits the $298 deduction.

Frame 08 displays: `$1,407 surplus - $364 safety buffer = $745` (after Darwin allocation).
Same pattern: $1,407 − $364 = $1,043, not $745. Same hidden $298.

**Severity:** BLOCKING for a financial app. A user who sanity-checks the math will conclude either the app is wrong or they don't understand it. Either erodes trust.

**Fix scope:** add the missing line to the displayed formula. `$1,907 surplus − $364 buffer − $298 provisions = $1,245`. Three changes (formula label, formula line, balancing arithmetic). Naive 20 min · 2x adjusted 45 min · low risk.

This is almost certainly the F-02 referenced in METADATA §7 — but the description there says "Math sub-line still doesn't balance" without naming the cause. Confirming via vision: it doesn't balance because a deduction is hidden.

---

### ⚠️ HIGH

**E-02 — Toast pills persist across multiple frame captures, obscuring content (frames 01-03, 04-09, 10-11, 13, 14-17, 18-21)**

Toast pills in this build appear to remain visible for many seconds. Across scenario A, the "✓ Pay + bonus updated" toast is visible from frame 04 through frame 09 — six frames of navigation. In every case, it obscures content beneath it (essentials total label, modal preview lines, sub-screen headers).

**Two possible root causes:**

(a) Toast dismiss timer is long (5s+) or not firing — actual bug.
(b) Capture script captures faster than dismiss timer — capture artifact, real-use behaviour different.

**I cannot distinguish these from pixels alone.** This is exactly the kind of question Prompt B §2.5 flags as "vision can't answer."

**Recommendation for CC:** read the toast dismiss code, confirm the timer. If timer is correct (e.g. 2s), the captures are racing it and obstruction is overstated. If timer is long/missing, F-03 is real and BLOCKING. Either way, document the finding.

This may be F-03 from METADATA §7 ("still obscures content though — F-03 stands"). Confirming or refining requires the code read.

---

**E-03 — Cross-surface inconsistency: same conceptual quantity ("free money this cycle") shown three different values across three surfaces**

| Surface | Frame | Value | Definition (inferred) |
|---|---|---|---|
| Canvas root "REMAINDER AFTER ESSENTIALS" | 04, 09, 11 | $1,609 | `coming-in − essentials-including-provisions` |
| Savings sub-screen "POOL TO ALLOCATE" | 06 | $1,245 | `surplus(excl provisions) − buffer − provisions` |
| Darwin alloc modal preview "Pool still free" | 07 | $1,109 | `$1,609 − $500 Darwin` |
| Auto-allocate modal "ALLOCATABLE" | 10 | $1,245 | matches savings sub-screen, NOT canvas root |

**User-facing problem:** the user cannot reconcile these. The canvas root shouts "$1,609" in big green. The savings sub-screen says they have $1,245 to split. The auto-allocate also says $1,245. The user is shown three different "free" numbers in 5 frames of normal use.

**Math invariant breach per CC manual §7:** "Cross-surface coherence is required. If the same logical number appears on two surfaces, both surfaces compute from the same source."

**Fix scope:** decide one canonical definition of "free this cycle" — likely the auto-allocate `$1,245` because it's the figure backed by clear math (essentials + buffer subtracted from income). Migrate canvas root remainder to compute identically. Naive 1h · 2x adjusted 2h · medium risk (touches at least 3 readers).

**Likely subsumes part of F-02** (the math doesn't balance because it's computed differently across surfaces). Confirm against the retro folder.

---

**E-04 — "$X now → $Y left ..." line changes meaning AND copy AND colour based on bonus.status, hazardously**

This single screen position takes three different forms across the scenarios:

| State | Frame | Display | Copy | Colour |
|---|---|---|---|---|
| Expected bonus, plan unlocked | 04, 09, 11 | `$12 now → $5,205 left to cover this cycle` | "left to cover" | red |
| Confirmed bonus, plan unlocked, paydayReceived=false | 20 | `$12 now → $1,736 left when next pay hits` | "left when next pay hits" | green |
| Confirmed bonus, plan locked, paydayReceived=true | 21 | `$12 now → $5,546 left to cover this cycle` | "left to cover" | red |

The number `$5,205` (Expected) means "shortfall relative to essentials." The number `$1,736` (Confirmed, unlocked) appears to mean "projected end-of-cycle balance." The number `$5,546` (Confirmed, locked, paydayLanded) reverts to red "to cover" framing — but the user already received the payday, so "to cover" is semantically wrong.

**The same screen position cycles through meanings the user cannot predict.** This is more than a copy issue — it's a model-of-the-world issue. The number isn't telling a stable story about anything.

**Severity:** HIGH. A user looking at frame 20 vs frame 21 will think the app went from "you have money" to "you owe money" because they locked the plan, which is incoherent.

**Fix scope:** pick ONE meaning. Recommend "projected balance at next payday" everywhere — always green when positive, always red when negative, always "by [date]" framing. Naive 1h · 2x adjusted 2.5h · medium-low risk (single helper, multiple call sites).

---

**E-05 — Locked-plan wide banner clips at viewport edge at 380px (frames 13, 21)**

Frame 13: "🔥 2 cycle stre" — "streak" cut off right edge.
Frame 21: "ick items as you handle them · 🔥 3 cycle streak · 💰 payday r" — clipped LEFT and RIGHT.

The banner is a full-width gradient pill that exceeds viewport width. Either it's missing horizontal padding-aware sizing, or its content overflow doesn't truncate gracefully.

**Severity:** HIGH (user-visible, repeating, hits core flow). The locked-state banner is the FIRST thing John sees after locking — clipping it on payday is a bad moment.

**Fix scope:** add `max-width: 100%; overflow: hidden; text-overflow: ellipsis;` to the banner OR shorten the copy OR multi-line wrap the content. Naive 15 min · 2x adjusted 30 min · low risk.

---

**E-06 — Daily Living slider marker chips overlap each other AND obscure the "Last 30 days" text below (frames 05, 17)**

The 🎯 (target) chip and 🚫 max chip are positioned vertically below the slider thumb. They stack on top of one another AND collide with the "📊 Last 30 days you actually spent..." line immediately below. Result: "Last 30 [chip][chip] u actually spent $63/day" — text occluded.

In frame 17 (after buffer bumped to $1,000) the target moves to $40 and chips still overlap each other AND the text.

**Severity:** HIGH. Information loss in a key surface (Daily Living = where the financial reality check lives).

**Fix scope:** vertically separate the chips, or move them above the slider (label "max → 🚫" / "target → 🎯"), or use connector lines instead of stacked chips. Naive 30 min · 2x adjusted 1h · low risk.

CC's METADATA §7 said this was "parity" with light mode. **The parity claim is for chip-on-track readability; the chip-on-content-below readability is broken on both themes.** Recommend CC re-eval this in Phase 3 against the retro frames.

---

### 🟡 MEDIUM

**E-07 — Bonus status remains amber EXPECTED + edit pencil enabled after Lock (frame 13)**

After Lock, the canvas locks bills/debts/savings amounts (per the lock confirm modal copy). But the bonus row still shows orange "EXPECTED" pill + editable pencil. Either bonus is intentionally always editable (which is consistent with "bonus uncertainty doesn't fit the lock concept") OR this is an inconsistency.

If intentional: needs subtle visual signaling — maybe the pencil is dimmed-but-tappable. If unintentional: lock should freeze bonus or strip the EXPECTED uncertainty.

**Severity:** MEDIUM. Doesn't break anything but reveals incoherence in the lock model.

**Fix scope:** decide intent first (Opus design call), then 30 min implementation.

---

**E-08 — Safety Buffer modal doesn't highlight the user's current value (frame 15)**

When the modal opens with bufferFloor=$364 in state, no chip is highlighted. The current value only appears in the "IF YOU SAVE" preview at the bottom. A user opening the modal cold can't see what their current setting is from the chips. They have to read the preview to find $364, realize that's their CURRENT value (not what they'd change to), and infer the modal state.

**Severity:** MEDIUM. Cognitive friction every time the modal opens.

**Fix scope:** highlight nearest chip (e.g. $300 or $500) with a "currently $364" sub-label, OR add "Current: $364" pill above the chip grid. Naive 20 min · 2x adjusted 40 min · low risk.

---

**E-09 — Auto-allocate overrides manual Darwin allocation without explicit warning (frames 09 → 10)**

In frame 09, the user has manually allocated $500 to Darwin. In frame 10 (auto-allocate modal), the suggested split shows Darwin at $755 with `+$255` (an INCREMENT over the manual $500) and the original $500 struck through. The user's manual choice is being absorbed and modified.

This may be the intended design (auto-allocate works with current state, refines it). It may also surprise users who expect "auto" to fill in WHERE manual hasn't, not OVER manual.

**Severity:** MEDIUM. Genuine ambiguity in product behaviour, depending on user mental model.

**Fix scope:** decide intent (Opus design call), then refine modal copy to either confirm "I'll respect your manual allocations" or "I'll re-balance everything including manual."

---

**E-10 — Daily Living card surfaces three competing numbers (frame 05, 17)**

"$25/day × 30 days = $750" (top), "$25/day" (slider label), "max $66/day" or "max $45/day" (chip): three numbers, similar weights, asking the user to figure out which is current vs target vs maximum.

Combined with the chip-overlap of E-06, this card asks the user to triangulate too much.

**Severity:** MEDIUM. Functional, just dense.

**Fix scope:** design pass to determine the spine of this card. Defer to Opus.

---

### 🔵 LOW

**E-11 — Input fields drop the `$` prefix while everywhere else shows it (frames 02, 03, 19)**

Net pay input shows "7282", not "$7,282". Custom bonus input shows "1341", not "$1,341". Everywhere else in the app shows currency-formatted dollars. Minor inconsistency.

**Severity:** LOW. Cosmetic, but adds friction when reading.

**Fix scope:** input prefix `$` + auto-format thousands. Naive 30 min · low risk. OR document as a deliberate input-vs-display distinction.

---

**E-12 — Lock confirm modal shows green "Lock" button while warning about tight buffer (frame 12)**

The buffer-tight warning is amber (correct), but the Lock button stays bright green primary. Mixed signal: "danger, but go ahead." Either lower the button's visual weight when warnings are present, or move the warning into a stronger guard (require John tap "yes, lock anyway").

**Severity:** LOW. Doesn't break anything; just inconsistent visual hierarchy.

---

**E-13 — Bonus carried-forward toast covers "Essentials total" + modal preview content (frames 01, 02, 14, 18)**

Slightly different from E-02 (toast persistence) — this is positional. The bottom toast position overlaps the bottom of the essentials list, hiding the "Essentials total $7,014" label for several frames at start-of-cycle.

**Severity:** LOW.

**Fix scope:** position the toast above the action-button row, or push it into a stack at the very bottom. Naive 30 min.

---

## 7. Cannot verify from screenshots (Pass F)

Honest list:

- **Toast auto-dismiss behaviour** (E-02) — cannot tell from frames whether dismiss timer is correct
- **Canonical writer firing for bonus.status change** — frame 20 shows green LANDED pill, but I cannot verify `BRAIN.transaction.record` actually created an income transaction (need audit log)
- **Whether locking actually freezes Bills/Debts/Savings amounts** — frame 13 shows chevrons still on rows; need to tap each post-lock to verify modals open in read-only mode
- **Whether "Pay landed today?" CTA actually flips `paydayReceived` to true and creates the right transaction** (between frame 20 → 21 this happens off-frame)
- **Animation timing of toast appearance/dismiss**
- **Touch target sizes precisely** — eyeball check only; nothing under 44×44 jumped out, but not measured
- **Whether the "🔁 New cycle started — $X bonus carried forward" toast is the result of an actual cycle rollover transaction or a UI-only banner** — fixture says bonus=0 but UI shows $1,500/$1,341 carried, so state mutation happens between fixture-load and first paint
- **Race conditions, performance / jank**

## 8. Open questions for John (Pass G)

**Q-01:** Does dark mode become the new capture default? CC's OQ7 + METADATA §9 primary ask. Based on this review: **strongly recommend yes**. Dark mode reads cleanly. The phone-default match is high-value. Light-mode captures remain available via `--theme light`.

**Q-02:** The framing of "$X now → $Y left ..." (E-04) — three meanings on one screen position. **John needs to decide what this number is meant to convey.** My recommendation is "projected end-of-cycle balance" always, but other models are defensible.

**Q-03:** Auto-allocate behaviour relative to manual allocations (E-09). Should auto override manual, augment, or skip-when-manual-set?

**Q-04:** Bonus editability after Lock (E-07). Is bonus intentionally always editable (because it's uncertain) or should Lock freeze it?

**Q-05:** The Savings sub-screen math sub-line (E-01) — the missing $298 provisions deduction. Confirm this is a display bug to fix, not an intentional simplification.

**Q-06:** The retro folder — is it deployed at `docs/reviews/sweep-2026-05-14-payday-plan-section-12-retro/`? If yes, CC's references resolve and I can do a true light/dark delta on Phase 4 closure. If no, the retro work needs to be re-package or the Phase 4 findings re-stated inline.

## 9. Loop closure — recommendations for CC

### Items where I likely align with CC's Phase 4 (need retro folder to confirm)

- F-02 Math sub-line — confirmed by E-01 in pixels; the cause is the hidden $298 provisions deduction. Recommend fix as described in E-01.
- F-03 Toast obstruction — confirmed by E-02 + E-13 in pixels with the caveat that I cannot distinguish "dismiss timer too long" from "captures too fast." Recommend CC read the dismiss code first to decide severity.
- Bonus persistence — appears RESOLVED based on Trace 1 (frames 01-13). Whichever retro F-NN tracked this should be marked verified-by-vision.

### Items where I have NEW concerns CC didn't surface in METADATA §7

- E-04 — "$X now → $Y left..." three-state framing inconsistency (HIGH)
- E-05 — Locked banner clip at 380px (HIGH)
- E-06 — Slider chips obscure content below (HIGH) — CC's "parity" claim was for chip-on-track only
- E-09 — Auto-allocate override of manual (MEDIUM)
- E-08 — Buffer modal doesn't highlight current value (MEDIUM)

These should be added as new F-NN findings to Phase 4 if they don't already exist.

### Items I disagree with (none material)

CC's reading that dark mode is OBJECTIVELY better — I largely concur on the surfaces named, with the caveat that I cannot do a true delta. Where CC says "parity" on slider markers, I think the marker-vs-content-below readability is broken on both themes (not theme-dependent), so "parity" is technically correct but understates an existing bug. See E-06.

### Items CC flagged that I can't substantiate from pixels

- The "dark wins" claims for Save/Apply buttons, EXPECTED pills, etc. — I can confirm these render *well* in dark, not that they're *better than light*. Without paired frames, "wins" is unverifiable.
- D-3 "Status dropdown chevron + native option panel matches dark theme natively" — I can see the dropdown chevron and the closed state; I cannot see the opened native options panel (would need a frame mid-tap).

### Recommended next moves for CC

1. **Read the toast dismiss code** to resolve E-02 (real bug vs capture artifact). 30 min.
2. **Add the new findings E-04, E-05, E-06, E-08, E-09 to Phase 4** with all 7 fields, John's column empty.
3. **Verify the retro folder location** so John can review the unified Phase 4 line-by-line.
4. **For E-01** (math sub-line) — propose the corrected formula. Quick win.
5. **For E-03** (cross-surface free-money inconsistency) — write an SDD before fixing; this touches the math invariant contract from CC manual §7 and deserves architecture-level thinking. Probably needs an Opus design pass on what the canonical definition of "free money this cycle" is.

### Positive callouts (don't lose these in the bug list)

- **The "Pay landed today?" green CTA in frame 20** — proactive UX that detects state implications and prompts. This is the design pattern slyght should keep reaching for.
- **The 🔥 N cycle streak counter on the lock banner** — gamification that's appropriate (rewards locking discipline, doesn't shame).
- **The "1st cycle = trial" badge + explanation in auto-allocate** — explaining bucket-creation-on-first-cycle is exactly the right onboarding pattern.
- **The bonus persistence fix** — based on the trace, this works correctly through the entire scenario A flow.
- **Dark mode generally reads clean** — agree with CC's claim, even without retro for delta.

### Metric notes for `_metrics.md`

- Time from trigger to package: METADATA timestamp 2026-05-14T09:56:39Z, John's instruction earlier same morning — ~2-4h, within target.
- Findings surfaced by Opus that CC missed: 5 (E-04, E-05, E-06, E-08, E-09) — track over time; not alarming for first sweep but worth monitoring.
- Findings I aligned with: 3 (E-01/F-02, E-02/F-03, bonus persistence)
- Pushback items: 0 material
- Follow-up sweeps needed: 1 — a "post-lock interaction" sweep where John taps each row in the locked canvas to verify the lock contract holds.

---

**End of opus-vision-review.md**

CC: read end-to-end (don't skim), categorise per Prompt C §3.2, produce `cc-handoff-after-opus.md`, then wait for John's line-by-line on Phase 4 before any code lands.

John: questions Q-01 through Q-06 in §8 are the items you need to weigh in on. Q-02 (the "$X now → $Y left" framing) is the one I think most impacts your daily experience of the canvas. Q-06 (retro folder presence) is the operational unblock.
