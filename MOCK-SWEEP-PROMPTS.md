# MOCK-SWEEP-PROMPTS.md (v2)

> Coordinated prompts for the Layer V mock-app scenario sweep workflow.
> **Canonical input format: ordered PNG sequence.** CC runs the 5-phase protocol against the sequence; Opus reviews the packaged output with AI vision.
>
> Loop: John triggers → CC sweeps → CC packages → Opus reviews → CC acts on review → John verifies. Each handoff is a file, not chat.
>
> **Supersedes:** v1 — adds PNG-sequence canonical format, structured METADATA, explicit state-persistence trace, return-path prompt for CC after Opus review, loop-closure metrics, and failure-mode recovery.

---

## 0. The loop, end to end

```
[1] John triggers a sweep
       ↓ paste Prompt A + file path
[2] CC reads PNG sequence, confirms interpretation
       ↓ "I see N frames, scenario is X, confirm?"
[3] CC runs 5-phase protocol
       ↓ produces phase1/2/3/4 markdown files
[4] CC STOPS at Phase 5, surfaces Phase 4 proposals
       ↓ John approves / rejects / defers each
[5] CC packages sweep folder
       ↓ docs/reviews/sweep-YYYY-MM-DD-<slug>/
[6] John brings package to Opus
       ↓ paste Prompt B + folder path or file uploads
[7] Opus produces vision review
       ↓ structured findings report saved as a file
[8] CC reads Opus review, addresses items
       ↓ produces handoff report (Prompt C format)
[9] John verifies on phone
       ↓ phone-walk on actual device
[10] Loop closes — or returns to [3] if new findings emerge
```

Every step has a file artifact. Nothing important lives in chat.

---

## 1. PROMPT A — for Claude Code (sweep trigger)

> Reminder: this is a Layer V mock-app scenario sweep. The 5-phase protocol from your feedback memory applies in full. Output is for Opus vision review — package per §1.7 below.

**Input file/folder path:** `[INSERT PATH HERE]`

**Direct asks beyond default protocol:**
- [list anything specific John wants you to focus on, or leave blank]

### 1.1 Pre-flight (mandatory before Phase 1)

In your first response, confirm:

1. **File type detection.** Expected: folder of ordered PNG screenshots. Confirm: how many frames? Filename ordering convention? Is there a `state-snapshot.json` or fixture data alongside?

2. **Scenario interpretation.** Based on filenames alone (don't peek at the images yet), what do you think this sequence is testing?
   - What user flow is being walked?
   - What "value of interest" (a number, a state field, a UI element) is being tracked across frames?
   - Where in the sequence do you anticipate the critical assertion (e.g. "frame 8 should show bonus=$1,200 — does it?")

3. **Fixture state.** If a `state-snapshot.json` is included, summarise its key values. If not, declare "no fixture provided — interpreting state from screenshots alone, with reduced confidence."

4. **Pre-hypothesis.** Before running Phase 1, what do you predict the sweep will find? One paragraph. This anchors against confirmation bias. Phase 3 re-eval compares reality to this prediction.

**STOP** here. Wait for John to confirm interpretation before running Phase 1. This costs 30 seconds and prevents misreading the entire sequence.

### 1.2 Phase 1 — Full metadata capture (per frame)

For **every PNG in the sequence**, in order, produce:

| Field | What to capture |
|---|---|
| `frame_id` | The filename, exactly |
| `sequence_position` | N of M |
| `inferred_state` | What state values would have to be true to produce this view |
| `visible_text` | Every readable text string (numbers, labels, button text) |
| `interactive_elements` | Every tappable element with rough position |
| `value_of_interest` | What the value-of-interest from §1.1 step 2 looks like in THIS frame |
| `anomalies_visible` | Anything that looks wrong, off, or unexpected |
| `accessibility_eyeball` | Touch targets that look <44×44, contrast issues, text wrapping/overflow |

If a field is genuinely unclear in a frame, write "obscured" or "unclear" — never skip or guess.

### 1.3 Phase 2 — Curiosity loop (per finding, not per frame)

For every observation from Phase 1 that warrants explanation, chase the "why" to ground:

- **file:line** in `index.html` or `scripts/*`
- **design token** / CSS variable
- **data field** in `S` or BRAIN bubble (e.g. `S.activePlan.income.bonus.amount`)
- **named convention** (e.g. `BRAIN.SOURCES.PLAN_BONUS_EDIT`)
- **Open Question for John** when no grounding is found

Format each:

```
Q: Why does frame 8 show bonus=$0 when frame 5 showed bonus=$1,200?
A (candidate 1): Modal binds to a `_bonusDraft` field that resets on open.
                 Evidence: would need to read modal-open code at ~L[?]
A (candidate 2): Canvas re-init wipes activePlan.income on re-entry.
                 Evidence: would need to read openPaydayPlan() at ~L7679
A (candidate 3): Open Question for John — is this expected behaviour?

→ Action: read the two candidate code paths. Confirm which is the actual cause.
```

**If you reach 5+ Open Questions without grounding any, STOP and surface to John.** The protocol exists to ground questions, not collect them.

### 1.4 Phase 3 — Critical re-eval

Three structured passes:

1. **Phase 1 holes.** What did I miss in the inventory? Re-scan with fresh eyes — every PNG has ~30% more detail than first-pass.

2. **Phase 2 confidence audit.** Where did I declare a why-chain "grounded" but only made a plausible inference? Mark down to Open Questions or do the actual grounding read.

3. **Pre-hypothesis check (from §1.1 step 4).** What did I predict? What did I actually find? Where am I most surprised? Surprise is the signal — it usually points at the real bug, not the obvious one.

Re-eval produces additions/corrections to Phases 1 and 2, not a separate list.

### 1.5 Phase 4 — Proposed changes

Group findings:

- **🚨 Bugs (always-fix)** — broken behaviour, state errors, financial-math issues, anything visible as ✗ in state-persistence trace
- **⚠️ UX gaps with clear answers** — missing legends, redundant elements, jargon, layout breaks
- **🎨 UX gaps that need design (defer to Opus)** — IA questions, mental-model misfits, anything where the right fix isn't obvious
- **💨 Code smells** — dead handlers, parallel paths, direct S mutations, missing canonical writers
- **❓ Open questions for John** — anything that needs his decision

Each finding has all seven fields, no exceptions:

```
## Finding F-NN: [one-line summary]

**Category:** 🚨 Bug | ⚠️ UX clear | 🎨 UX defer | 💨 Smell | ❓ Question

**What:** [the issue in 1-2 sentences]

**Where:**
- File: index.html
- Line(s): L7679-L7715 (function openPaydayPlan)
- Surfaces: Payday Plan canvas root + Bonus modal
- Frames affected: 02, 08

**Why (grounded):** [the why-chain from Phase 2, ending at a file:line / data field / convention OR explicitly marked Open Question]

**Effort (naive → 2x adjusted):** 45 min → 90 min, confidence medium
[Per Opus manual §6 — always show both numbers]

**Risk if fix is wrong:** [what breaks if we get this wrong]

**Cross-references:** [other surfaces that read same state — from FEATURE-MAP]

**CC's recommendation:** [your call, framed as input — "I would fix this by ..."]

**John's call:** [empty until approved/rejected/deferred]
```

Rank findings within each category by impact × confidence. State the impact metric explicitly: "John uses this every payday" or "edge case, low-frequency."

### 1.6 Phase 5 — STOP

No Edit/Write calls until John approves Phase 4 proposals. Surface the full report. Wait for Y/N/alternatives on each item. Then act.

### 1.7 Package the sweep output (after Phase 5 OR after John-approved fixes land)

Folder structure (mandatory):

```
docs/reviews/sweep-YYYY-MM-DD-<short-slug>/
├── METADATA.md                    ← THE anchor doc; format in §1.8
├── input/
│   ├── 01-canvas-opened.png       ← original sequence, copied not moved
│   ├── 02-modal-opened.png
│   ├── ...
│   └── state-snapshot.json        ← fixture state, if provided
├── phase1-inventory.md            ← per-frame Phase 1 tables
├── phase2-why-chains.md           ← grounded why-chains + open questions
├── phase3-reeval.md               ← three structured passes
├── phase4-proposals.md            ← findings F-01, F-02, ... with John's column updated
├── before/                        ← if fixes landed: same surfaces, pre-fix
│   ├── 01-canvas-opened.png
│   └── ...
├── after/                         ← if fixes landed: same surfaces, post-fix, FILENAMES MATCH before/
│   ├── 01-canvas-opened.png
│   └── ...
└── handoff-to-opus.md             ← short note: what to look at, what John asked, what fixes shipped
```

**Filename convention for PNGs (mandatory):**

- Two-digit zero-padded prefix: `01-`, `02-`, ..., `99-`
- Hyphen-separated descriptive slug: what's shown / what action just occurred
- Lowercase, ASCII only, no spaces, no special chars
- Example: `05-root-after-save-shows-1200.png`
- The descriptive slug should match what's in METADATA's frame catalogue (§1.8)

### 1.8 METADATA.md — required format

This is the document Opus reads first. It must be self-contained: a fresh Opus session in 2 months should understand the sweep without context.

```markdown
# Sweep METADATA — <YYYY-MM-DD> — <slug>

## 1. Origin

**John's original instruction:**
> [paste verbatim what John typed]

**File CC swept:** [path]
**Sweep run at:** [ISO timestamp]
**Commit at sweep time:** [git SHA]
**Branch:** [branch name]

## 2. Scenario

**One-line description:** [e.g. "Test bonus value persistence across canvas exit/re-entry"]

**User flow walked:**
1. [step 1 — what user does]
2. [step 2 — what user does]
3. [...]

**Value of interest:** [e.g. `S.activePlan.income.bonus.amount`]

**Pre-hypothesis (from Phase 1 §1.1):** [what CC predicted before running]

**Critical assertion(s):** [what frame N is supposed to prove]

## 3. Frame catalogue

| Frame | Filename | State (what should be true) | Action just taken |
|---|---|---|---|
| 01 | 01-canvas-opened.png | bonus.amount = 0 | Canvas opened cold |
| 02 | 02-modal-opened.png | bonus.amount = 0, modal visible | Tapped bonus row |
| 03 | 03-amount-typed-1200.png | input field = "1200" | Typed value |
| ... | | | |

## 4. Fixture state

**state-snapshot.json provided?** Yes / No

**Key fixture values relevant to scenario:**
- `S.bal`: $340
- `S.activePlan.cycleId`: "2026-04-14"
- `S.activePlan.income.netPay`: 7282
- `S.activePlan.income.bonus.amount`: 0  ← the value being tested
- [etc — only relevant fields]

## 5. What CC CAN verify from this sweep

- Visual states across N frames
- Whether value-of-interest is displayed correctly per frame
- Whether intended UI changes landed (if before/after included)

## 6. What CC CANNOT verify from this sweep

(Explicit — Opus will not chase these as missing.)

- Canonical writer firing correctly (would need audit log inspection)
- Animation/transition behaviour (single frames don't show timing)
- Race conditions or timing-dependent state
- Performance/jank
- Anything not rendered on screen
- [scenario-specific limits]

## 7. Findings summary (filled in after Phase 4)

**Total findings:** N

| ID | Category | Severity | John's call |
|---|---|---|---|
| F-01 | 🚨 Bug | High | Approved |
| F-02 | ⚠️ UX clear | Medium | Approved |
| F-03 | 🎨 UX defer | — | Deferred to Opus |
| ... | | | |

## 8. Fixes shipped this session (if any)

- F-01 fixed in commit [SHA]
- F-02 fixed in commit [SHA]
- F-03 deferred
- F-04 declined by John

## 9. Direct asks for Opus

[Anything John specifically wants Opus to vision-review, beyond default protocol. E.g.:
"Confirm in pixels that the bonus row in frame 5 actually reads $1,200 and not
$1200.00 — formatting consistency across the cycle."]

## 10. Open questions still parked

[Anything from Phase 2 not grounded, not yet asked to John, awaiting decision.]
```

### 1.9 Hard rules for CC during the sweep

- No Edit/Write calls until Phase 4 approved
- Every why grounded or marked Open Question — no "looks like" without follow-up
- 5+ Open Questions in one phase → STOP and surface
- Output to files, not chat — Opus reads files in the next session
- If input is missing / malformed / unreadable → STOP, report what failed, ask John
- If frame ordering ambiguous (filenames don't sort meaningfully) → STOP, request renaming
- If fixture state contradicts what frames show → STOP, flag the contradiction (it's evidence)
- METADATA.md must be complete before declaring the sweep packaged
- Before-and-after captures must use matching filenames so Opus pairs them correctly

### 1.10 Tone

Methodical. Honest. Same energy as the persona-audit and phone-verify discipline. Surface before fix. No declared victories without verification. Investigative first; remediation second.

---

## 2. PROMPT B — for Opus (vision review trigger)

> Anchor: CC has run a Layer V mock-app scenario sweep using the 5-phase protocol. Output is packaged in `docs/reviews/sweep-YYYY-MM-DD-<slug>/`. Vision review is your job.

**Sweep folder:** `[INSERT PATH HERE]`
**OR images uploaded to this chat:** [list]

### 2.1 Pre-review checklist (read FIRST, before opening any PNG)

1. **Read `METADATA.md` end-to-end.** Confirm: John's instruction, scenario, value of interest, pre-hypothesis, fixture state, what CC committed to as verifiable, what CC explicitly listed as NOT verifiable, direct asks for me.

2. **If METADATA.md is missing or incomplete:** STOP. Tell John what's missing. Don't review screenshots without context — speculation without anchor produces bad reviews.

3. **Skim Phase 4 proposals.** Note what John approved, rejected, deferred. I should not re-litigate decided items — but I should flag if I disagree with a decision based on visible evidence.

4. **Skim Phase 2 grounded why-chains.** Where did CC ground at file:line vs leave Open? My review should focus where CC was uncertain, not where he was confident.

5. **Open the PNGs in sequence order.** Frames numbered NN- sort in filesystem order, which is what I want.

### 2.2 Vision review — the structured passes

#### Pass A — Per-frame inventory check (sanity check on Phase 1)

For each frame, spot-check 2-3 items from CC's Phase 1 inventory. If I see anything CC missed or got wrong, note it. I'm not redoing Phase 1 — I'm sanity-checking it.

#### Pass B — State-persistence trace (the critical pass)

Name the value-of-interest from METADATA. For each frame in order, record what it looks like:

```
### State persistence trace — bonus.amount

| Frame | Visible state of bonus.amount | Coherent with prior? |
|---|---|---|
| 01 | $0 (canvas root, no bonus shown) | baseline |
| 02 | empty input field in modal | ✓ matches $0 |
| 03 | input shows "1200" | ✓ user is editing |
| 04 | Save tapped (still 1200 in field) | ✓ |
| 05 | canvas root: "+ $1,200 bonus" visible | ✓ persistence intact through save |
| 06 | (Dashboard, not relevant to value) | — |
| 07 | canvas root: "+ $1,200 bonus" still visible | ✓ persistence intact through nav |
| 08 | modal reopened: input field shows "0" | 🚨 PERSISTENCE LOST — divergence point |

**Conclusion:** Value persists in `S.activePlan.income.bonus.amount` (frame 7 confirms).
Modal reads from a different state path. Bug is in the modal's open handler reading
wrong source, not in the writer.
```

This is the killer pass. PNG sequences exist for exactly this reason — pinpointing where state drifts.

#### Pass C — Intended changes confirmed (if before/after included)

For each surface in before/ and after/:
- ✅ What CC claims changed, that I can see in pixels
- ⚠️ What CC claims changed, but I cannot confirm in pixels (with reason)
- 🚨 What CC didn't claim but changed anyway

#### Pass D — Unintended changes I see

Beyond what CC named:
- Layout shifts
- Font weight / size / colour drifts
- Element spacing changes
- Touch target size changes
- Stub text left visible
- Text overflow/truncation at 380px
- Cross-frame inconsistency (same data shown differently across captures)
- Empty states missing or broken
- Hierarchy mistakes (competing visual weights)

#### Pass E — Concerns I have visible in pixels

Things that look wrong even though CC may not have flagged them. Specific. Cited to frame number. Severity:

- 🚨 BLOCKING — financial math visibly wrong, stub shipped, data corruption visible
- ⚠️ HIGH — user-visible bug, broken flow visible in frames
- 🟡 MEDIUM — cosmetic but worth fixing
- 🔵 LOW — hygiene

#### Pass F — Cannot verify from screenshots

Be ruthlessly honest. The temptation is to claim review thoroughness. The corrective is to enumerate what I genuinely cannot see:

- Canonical writer actually firing → would need audit-log inspection
- State persistence beyond what frames capture → would need more frames or audit-log
- Animation timing/behaviour
- Race conditions
- Tap-target sizes precisely (eyeball at 44×44 only)
- Anything hidden in DOM but not rendered

#### Pass G — Open questions for John

Items where my review surfaces an ambiguity that needs his call. Group at the end. Format:

```
Q-01: In frame 5, the bonus row shows "+ $1,200 bonus" with "Expected" status in
italic. Should "Confirmed" status remove the italic? CC's Phase 2 left this as
Open Question — recommend John decides as part of this review.
```

### 2.3 Review output — structure

Save the review to: `docs/reviews/sweep-YYYY-MM-DD-<slug>/opus-vision-review.md`

```markdown
# Opus vision review — sweep-YYYY-MM-DD-<slug>

## 0. Context (from METADATA)

- John's instruction: [1-line restatement]
- Scenario: [1-line]
- Value of interest: [name]
- Frame count: N

## 1. Pre-flight notes

- [Anything I noticed in METADATA before opening PNGs]
- [Anything missing or incomplete in METADATA that I noted]

## 2. Per-frame sanity check (Pass A)

[Spot-check notes — only items where I disagree or extend CC's Phase 1]

## 3. State persistence trace (Pass B)

[The killer table — frame × value × coherent?]

**Divergence point identified:** [frame N — what the data tells us about the bug location]

## 4. Intended changes (Pass C)

✅ Confirmed: [list]
⚠️ Cannot confirm: [list with reason]
🚨 Unflagged changes: [list]

## 5. Unintended changes (Pass D)

[List with frame references and severity]

## 6. Concerns (Pass E)

🚨 BLOCKING:
⚠️ HIGH:
🟡 MEDIUM:
🔵 LOW:

## 7. Cannot verify (Pass F)

[Honest enumeration]

## 8. Open questions for John (Pass G)

Q-01: ...
Q-02: ...

## 9. Loop closure — recommendations for CC

[What CC should do next based on this review — fix items, gather more data, run a follow-up sweep, etc.]

### Items where I align with CC's Phase 4
- [list]

### Items where I disagree with CC's Phase 4
- [list with reasoning]

### Items CC missed that I see
- [list]

### Items CC flagged that I can't substantiate from pixels
- [list — these likely need state-level or scripted-interaction tests, not vision]
```

### 2.4 Hard rules for Opus

- No review without METADATA — if missing, ask John before proceeding
- Don't declare a state persistence question "verified" from a single frame
- Don't recommend code changes without checking against FEATURE-MAP / manual constraints
- Don't manufacture concerns to look thorough — flag only genuinely visible items
- When I surface something CC missed, note it explicitly for protocol amendment
- Output to file, not chat — CC reads the file in the next session
- Tone matches CC's: methodical, honest, surface-before-fix, no theatre

### 2.5 What if vision can't answer the question?

Sometimes screenshots will be insufficient. Explicit decision tree:

- **Question answerable from pixels?** → Answer it.
- **Question NOT answerable from pixels?** → Don't speculate. Recommend the right test:
  - State persistence → scripted-interaction sweep (Workflow B with more frames)
  - Canonical writer firing → audit log inspection by CC
  - Animation behaviour → screen recording (not PNG sequence)
  - Performance → phone-side observation

Recommending the right test is more valuable than guessing.

---

## 3. PROMPT C — for Claude Code (return path after Opus review)

> Reminder: Opus has produced a vision review at `docs/reviews/sweep-YYYY-MM-DD-<slug>/opus-vision-review.md`. Loop closure is your job.

### 3.1 Read the review end-to-end

Don't skim. Don't act on the headlines. Read the whole document. Particularly:
- Pass B (state persistence trace) — this is where the killer findings usually live
- Pass G (open questions) — these need John's decision before code
- Section 9 (loop closure recommendations) — Opus's recommended next moves

### 3.2 Categorise Opus's findings

For each finding in the review, classify:

- **Pixel-fixable** → CC can act, normal Phase 4 cycle applies (propose, John approves, fix)
- **State-level** → CC needs to read code (Phase 2 grounding) and follow up — may need a follow-up sweep with audit-log inspection
- **Design-level** → defer to Opus for proper design pass
- **Wrong / I disagree** → push back, with reasoning. Opus may have misread a frame.

### 3.3 Produce the handoff report

Save to: `docs/reviews/sweep-YYYY-MM-DD-<slug>/cc-handoff-after-opus.md`

```markdown
# CC handoff — after Opus vision review

## Items I'll act on this session (pixel-fixable)

- [F-NN from Opus or O-NN, with proposed fix and effort estimate]
- ...

## Items I need to investigate (state-level)

- [What I'll read in code, what I'll look for in audit log]
- [Estimated time to ground]

## Items deferred to Opus (design-level)

- [Item + why it's design-level, not implementation]

## Items I disagree with

- [Opus finding + my counter-reading of the pixels or code]

## Follow-up sweeps needed

- [If applicable: what scenario to capture, what value of interest, what fixture state]

## Updated Phase 4 from this loop iteration

[New findings F-NN added based on Opus review, with all seven fields]
```

### 3.4 Wait for John's go-ahead

Same Phase 5 STOP rule applies. No Edit/Write until John approves the handoff plan.

### 3.5 After acting

Update METADATA.md sections 7 (findings summary) and 8 (fixes shipped). Update the calibration log per Opus manual Appendix C. Add "noticed" items per CC manual §11.

---

## 4. Loop closure metrics

After each full loop (steps 1-10 from §0), track:

| Metric | Source | Target |
|---|---|---|
| Time from trigger to package | Phase 1 start → METADATA timestamp | < 2 hours |
| Findings in Phase 4 | Count | Whatever the scenario warrants |
| % findings grounded (not Open Question) | Phase 2 audit | > 80% |
| Findings surfaced by Opus that CC missed | Opus review Section 9 | track over time — if rising, sweep protocol needs sharpening |
| Findings CC pushed back on | CC handoff "disagree" section | track — high disagreement = misalignment in protocol |
| Findings that needed follow-up sweep | CC handoff "follow-up sweeps" | low is good |
| Time from package to John's phone-verify | METADATA timestamp → John report | < 24 hours |

Log to `docs/reviews/_metrics.md` after each loop. After 5 sweeps, review metrics with John. Adjust protocol if patterns emerge.

---

## 5. Failure modes and recovery

| Mode | Symptom | Recovery |
|---|---|---|
| Missing METADATA | Opus says "can't review" | CC produces METADATA before retry |
| Frames out of order | Filenames don't sort sensibly | CC renames to NN- convention |
| Fixture missing | No state-snapshot.json | CC documents in METADATA §4 "no fixture" |
| Frame contradicts METADATA | "frame 5 should show $1,200 but shows $0" | This is evidence — flag as Finding, don't suppress |
| Vision review uncertain | Opus says "cannot verify from pixels" | CC runs follow-up sweep with more frames OR state-level investigation |
| Loop ping-pongs | 3+ Opus↔CC iterations on same surface | Escalate to Opus design pass, not more sweeps |
| Opus disagrees with John's decision | Opus review flags Phase 4 item John approved as harmful | Opus surfaces with reasoning, John decides — Opus does not override |

---

## 6. Reminder trigger (paste with file path each session)

You don't need to re-paste the whole thing. Short trigger:

```
Mock-app scenario sweep. 5-phase protocol from feedback memory.
Input: [PATH]

Direct asks beyond default:
- [scenario-specific focus, or "none"]
```

CC pulls the protocol from memory, runs the sweep, packages output, surfaces to John. John brings to Opus with a short "review the sweep at [path]" trigger.

---

**End of MOCK-SWEEP-PROMPTS.md v2.**

The loop is the discipline. Each handoff is a file. Each handoff has structure. No critical context lives in chat.
