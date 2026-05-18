# STOP-gate message template

> Standard structure for surfacing the end of a commit / phase / bundle so John can review without re-deriving status. Added Bundle 30.5 Phase D per visual-feedback-loop integration. Phase 5 should fold the file's intent into the CC manual §3 session-loop step that fires after smoke + verify-visual land.

## When to use

After every commit that ships to `main`, especially when:
- A phase boundary is reached (per-commit STOP gates per Q1) or end-of-phase gate
- Smoke + verify-visual have both run on a deployed-and-verified SHA
- John needs to review before the next phase / bundle can proceed

## Template

```markdown
## <Phase / Commit name> — STOP gate

**Status:** <one-line outcome — what shipped, ground-truth signal>
**SHA:** `<short-sha>` (pushed <time> AEST) · **Deploy:** live at <time> AEST
**Smoke:** **<pass>/<total>** in <duration>s
**Verify-visual:** **<match>/<total>** MATCH · **<flag>** flagged · cost **$<amount>** · report → `<relative path to verification-report.md>`

### What shipped

<bullet list, each line file:lineNo or BRAIN.X.Y reference where applicable>

### Smoke + verify-visual artifacts

| Run | Captures | MATCH | DIVERGENCE | ERROR | MANUAL | Cost | Wall |
|---|---|---|---|---|---|---|---|
| Local smoke | <N> | <M> | <D> | <E> | <U> | $<amount> | <s>s |
| Deployed smoke | <N> | <M> | <D> | <E> | <U> | $<amount> | <s>s |

### Flagged items (priority review)

<For each DIVERGENCE/ERROR/MANUAL: feature_path · label · reason. Link to screenshot file. If none: "✓ no flagged items.">

### FEATURE-MAP updates (v2 entries added/updated this commit)

<bullet list>

### Phone-verify checklist (PASS/FAIL block per feedback_post_commit_phone_verify)

<Per-check: Open · Do · PASS criterion · FAIL criterion>

### Auto-continue / halt status

**AUTO-CONTINUING TO <next phase>** (criteria met):
- <criterion 1> ✅
- <criterion 2> ✅
- ...

OR

**HALTING — REASON: <one sentence>**

### Open questions (if any)

<Concrete questions John needs to answer before next phase>
```

## Field semantics

- **Status one-liner** — what changed in the codebase + what signal proves it works. Not "phase X done" — "FR-02 closed: bucket credits land atomically; 17/17 smoke pass against deployed SHA."
- **SHA + Deploy time** — gives John a citable ground-truth that the work IS on his phone (not just local).
- **Smoke + verify-visual headers** — capture count, flag count, cost, report link in one line. Lets John skim status before drilling in.
- **Flagged items** — surfaced at top so John doesn't scroll past them. If zero, explicit "✓ no flagged items."
- **Phone-verify checklist** — every commit that touches user-facing surfaces gets the 4-part PASS/FAIL block per memory `feedback_phone_verify_instructiveness` (what to open · what to do · PASS criterion · FAIL criterion · no CSS jargon).
- **Auto-continue / halt** — explicit decision call per the pre-authorization framework. If auto-continuing, state which criteria are met. If halting, state the reason.

## Anti-patterns to avoid

- ❌ "All looks good!" without specific evidence
- ❌ "Smoke pass" without capture/flag counts and report link
- ❌ Phone-verify steps that reference non-existent UI surfaces (4 incidents in Bundle 30 caused by this — code-read first, write checklist second)
- ❌ Auto-continue claim without listing the criteria
- ❌ Halt without a one-sentence reason
- ❌ Long preamble before status — lead with the outcome

## Phase 5 integration target

CC manual §3 session-loop step 7+ should reference this template. Each commit-end surfacing follows the structure. Variations only when the work doesn't ship a SHA (pure docs, planning, etc.).
