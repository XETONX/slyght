# Handoff to Opus — sweep-2026-05-14-payday-plan-section-12-retro

## What to look at first

1. **`METADATA.md`** — full context, scenario, fixture, frame catalogue, what I can/cannot verify, direct asks for you.
2. **`phase1-inventory.md`** — frame-by-frame visible-state inventory + interactivity map + a11y notes.
3. **`phase2-why-chains.md`** — grounded why-chains. Every finding pinned at `file:line` or marked Open Question.
4. **`phase3-reeval.md`** — three structured passes: holes I likely missed, confidence audit, pre-hypothesis vs reality.
5. **`phase4-proposals.md`** — 14 findings + 1 Open Question with the seven mandatory fields each. **Phase 5 STOP rule is active — no Edit/Write until John approves.**
6. **`input/`** — 21 PNGs in scenario order (01-21) + state-snapshot.json fixture.

## What John asked

> "PASS, i think there is so much still left to do right? Can you actually go demon time now with your sweep and AI vision export to Opus and then from there we regroup and aim to push bundle 29"

Context: this sweep wraps the demon-time push toward closing Bundle 29 (Mother Redesign + Mock-Sweep-Prompts v2 ratification). The 21 captures span three scenarios (happy / frustrating / paydayLanded) walking the full Payday Plan flow. Bundle 29 demon-time shipped ~18 commits before this sweep; the captures show their visual landing state.

## What CC did before this handoff (demon-time timeline)

| Commit | Subject |
|---|---|
| 5184381 | Daily Living 5-state model + cross-screen allocation canonicalisation |
| aee164a | IMPOSSIBLE state fires when floor > max even at max=$0 |
| bdeabdc | Lock-persist verification + audit trail |
| bb59d41 | Preview CSS class · dashboard = canvas remainder · trip-bucket self-healing |
| c56c0ab | Savings-count counts trip overrides · rollover guard · Live-Preview kind-changes surgical |
| b61c610 | Filter abandoned buckets · status dropdown styled |
| 2480248 | Smart auto-allocate (target−saved + per-line reasoning) + bonus.confirmed→paydayLanded on lock |
| ed2053c | Upcoming type-picker visual chips |
| cb6c98b | Bonus modal polish (renderPlanMode, display:none, aria-labels, settings roundup canonical class) |
| c39cc71 | Hide abandoned buckets · dedupe trips from Savings |
| 0b4388a | Prominent locked banner in canvas hero |
| 462f995 | Section 12 scenario walkthroughs + drift-banner grace period + always-show alloc deltas + stacked slider markers |
| 6d6c923 | Bonus status pill (LANDED/EXPECTED) + paydayReceived-aware projection label |
| 15bcf7c | Drop chevron from `<input>` styling |
| 7dd37c8 | Auto-allocate current→proposed delta now fires for trip-id-keyed overrides |
| d81c781 | Post-lock allocation status modal (Savings) |
| 0cb9fed | MOCK-SWEEP-PROMPTS v2 sweep-package emit |
| 764be56 | Post-lock status modal extended to Upcoming category |

## What I'm confident about

- **F-01 savings double-count** — grounded at index.html:19390-19412 and 18247-18266. Manifests in frame 12 lock warning "Buffer is tight $162 vs $364 floor" — that $162 is the $500 ghost trip-id override eating into freeTotal.
- **F-02 math sub-line equation imbalance** — grounded at index.html:11983-11984. Equation as printed omits the $298 provisions subtraction.
- **F-08 lock-shortfall ignores provisions** — grounded at index.html:10937. Uses freeTotal (no provisions) instead of surplus.
- **F-09 streak inflation** — grounded at index.html:11097. Unconditional increment.
- **F-10 no actionable hint on negative projection** — grounded at index.html:9788. Pure display, no advisory.
- Bonus EXPECTED / LANDED pill rendering ✓ (frames 04, 20, 21)
- Projection-label adapts ✓ (frame 20 vs 21)
- Auto-allocate current→proposed delta ✓ (frame 10 Darwin $500→$755 +$255 visible)
- Locked banner ✓ (frames 13, 21)
- Drift-banner grace ✓ (frames 13, 21 — no false-positive)
- Section 12 scenarios captured end-to-end ✓

## What I'm uncertain about (please verify in pixels)

- **F-03 toast overlay severity** — I see it across many frames, but Opus pixel-precise check could quantify the obstruction.
- **F-04 slider marker overlap** — pixel-measure the gap between max chip's bottom and the "Last 30 days" text row.
- **F-05 LANDED vs paydayReceived in frame 20** — is the visual separation enough that a real user wouldn't notice the divergence?
- The toast at bottom of every frame — is it actually obstructing something the user needs to read, or just decorative noise?

## What I cannot verify (recommended follow-up tests)

- Canonical writer firing for tick → real txn → balance update — needs audit log inspection in a separate session.
- Animation timing (counter-roll, slider thumb pulse) — needs screen recording, not PNG stills.
- Race conditions in lock + save sequence — needs scripted interaction with await-state checks.
- Whether F-01 manifests in audit log too (would explain stale state lingering past Apply).
- F-13 (locked plan reads live S not lockedSnapshot) — needs a scenario where bill amount changes post-lock. Defer to a dedicated follow-up sweep.

## What I want Opus to focus on

Per MOCK-SWEEP-PROMPTS v2 Prompt B §2.2, prioritise:

**Pass B — State-persistence trace** for `savings.total` across the Scenario A frames:
- Frame 06: $0 allocated (savings.total=$0)
- Frame 08: "$500 allocated" header (savings.total=$500)
- Frame 11: post auto-applied — what does savings.total visibly equal?
- Frame 12: lock warning says $162 free — what does this imply about savings.total?

If the trace shows savings.total ≠ Apply's reported $1,245, that's the smoking gun for F-01.

**Pass A — Phase 1 sanity check** — spot-check 2-3 items per frame, flag where I missed something.

**Pass C — pre-hypothesis vs reality** — what did I predict accurately? What did I miss that you can see in pixels?

**Pass G — open questions for John** — surface anything where your pixel analysis raises a new ambiguity beyond F-05 / OQ-rollover.

## What happens next

1. Opus produces `opus-vision-review.md` in this folder.
2. CC reads it end-to-end, categorises findings (Pixel-fixable / State-level / Design / Disagree).
3. CC writes `cc-handoff-after-opus.md` with proposed actions.
4. John approves the action plan (Phase 5 STOP applies).
5. CC ships approved fixes in batched commits.
6. METADATA §7 + §8 updated as commits land.
7. Bundle 29 closes if all critical findings resolved. Otherwise feed remaining into Bundle 30 (intent-driven canvas).

## File index

- `METADATA.md` — anchor doc (sections 1-10 complete)
- `phase1-inventory.md` — per-frame visible-state inventory
- `phase2-why-chains.md` — grounded why-chains
- `phase3-reeval.md` — critical re-evaluation
- `phase4-proposals.md` — 14 findings + 1 OQ with seven-field structure
- `handoff-to-opus.md` — this doc
- `input/01-..21-.png` — 21 ordered PNGs
- `input/state-snapshot.json` — fixture
- _expected to follow:_ `opus-vision-review.md` (Opus output) → `cc-handoff-after-opus.md` (CC return path) → `before/` + `after/` (post-fix captures, if applicable)
