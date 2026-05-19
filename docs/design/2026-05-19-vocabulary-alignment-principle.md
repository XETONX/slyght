# Vocabulary alignment principle

**Status:** ACTIVE — applies to all future user-facing naming decisions
**Date established:** 2026-05-19 (Bundle 32.3 canonicalization decision batch)
**First instance:** Freedom Buffer → Rainy Day Fund

---

## Principle

slyght's user-facing vocabulary should match **financial-planning industry standards** where a standard exists. When choosing or renaming user-facing labels, prefer the term that an external financial advisor would recognize over an internally-invented term, unless slyght's invented term encodes meaning the standard term lacks.

## Why this matters

slyght's Bundle 33+ roadmap includes an AI layer that:

- Generates advisor-style audits ("here's where your money's going this quarter")
- Cross-references external structured reports (banking statements, super statements, tax records)
- Translates between slyght's internal model and external tools the user might consult

Every vocabulary mismatch between slyght and the broader financial-planning ecosystem creates a **translation tax** at the AI boundary. The AI must either (a) translate every output back to industry standard for advisor readers, or (b) generate slyght-vocabulary outputs that confuse non-slyght readers. Both options weaken the AI layer's usefulness.

Picking standard terminology now reduces the translation burden when the AI ships. Each non-standard term left in place becomes future debt.

## The first instance — Freedom Buffer → Rainy Day Fund

- **Pre-decision:** intent named "Freedom buffer", linked to `S.savingsBuckets['Rainy Day Fund']` via a hardcoded mapping in `PLAN.readSavedFromSource`. Two labels for the same conceptual entity. Internal mapping required to reconcile.
- **Industry standard:** "Rainy Day Fund" — used by every Australian financial advisor, retail bank emergency-savings product, and personal-finance book published in the last 20 years.
- **Decision (2026-05-19):** rename the intent to "Rainy Day Fund" so intent name and bucket name match. Removes the hardcoded translation mapping; aligns user-facing label with the industry standard.

The "Freedom buffer" framing wasn't wrong; it was personal. But its personal flavor doesn't carry advisor weight — and when slyght's AI starts cross-referencing John's emergency savings against advisor-style frameworks, "Rainy Day Fund" reads as the same thing he sees on his bank statements.

## How to apply this principle

When introducing or renaming a user-facing label:

1. **Ask:** what would a competent Australian financial advisor call this?
2. **If a clear industry standard exists:** use it.
3. **If multiple standards exist:** use the one most-aligned with retail consumer finance (vs institutional / academic terminology).
4. **If no industry standard exists:** invent — but document the term clearly so future renames have a baseline.
5. **If an invented term encodes meaning industry terms lack:** keep the invention, but add a `notes` field explaining the deliberate divergence.

## Examples of where this principle applies / doesn't apply

### Applies (industry standard exists, prefer it)

- "Rainy Day Fund" not "Freedom Buffer"
- "Mortgage offset account" not "interest-saving sub-account"
- "Salary sacrifice" not "pre-tax voluntary super contribution"
- "Term deposit" not "locked savings account"
- "HISA" / "High Interest Savings Account" not "premium-rate bucket"

### Doesn't apply (slyght-invented concepts carry useful meaning)

- "Payday Plan canvas" — there's no industry equivalent for a per-cycle allocation drag-and-drop tool. Keep the slyght name.
- "BRAIN bubble" — internal architectural concept, never user-facing.
- "Survival forecast" — the slyght framing (forecasted balance trajectory with discretionary uplift) is specific to slyght's model. Industry alternatives ("cash flow projection", "spending forecast") don't capture the underlying-day-counting math.
- "Living floor" — slyght-specific framing for the daily-spend baseline; "discretionary budget" is the rough industry analog but slyght's floor encodes a hard daily lower bound that the industry term doesn't.

## Process for proposed renames

When a future rename is proposed:

1. Check this doc against existing labels in slyght.
2. If the proposed rename aligns slyght with an industry standard AND slyght's existing label has no meaning the standard lacks → **rename**.
3. If the proposed rename diverges from industry standard → **document the rationale** before shipping.
4. If unclear → **ask John**.

Renames are user-visible changes; treat them as values judgments per the existing rule (anything that changes what the user sees gets John's sign-off).

## Open instances flagged but not yet renamed

These have been flagged during Bundle 32.3 canonicalization investigation but the rename is deferred to a future bundle:

- **"China holiday" intent** vs `S.savingsBuckets['China Holiday']` bucket — naming consistent (modulo capitalization); not a vocab issue.
- **"Property Deposit"** (intent) vs **"Property Deposit (via Mum)"** (debt) — both already use the industry term; the qualifier "(via Mum)" is slyght-specific context, retained.
- **"Darwin"** trip — destination name, no industry-standard rename applies.
- **"WRX"** — proper noun (the car), no rename.
- **"Mum account"** — slyght-specific (the deposit-builder account managed by John's mother). No industry equivalent; the name is descriptive and correct.

---

## Maintenance

This doc updates when:

- A future rename is proposed and the decision logic above is applied
- A new industry standard emerges that slyght could adopt
- The list of "flagged but not yet renamed" items grows or shrinks

Keep entries short. Each rename instance should fit in 3-5 lines: what changed, what it was called before, why the standard term won. The doc is a decision log, not a glossary.
