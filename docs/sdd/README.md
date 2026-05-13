# Software Design Documents

Per `CC-PRINCIPAL-ENGINEER-MANUAL.md` §3 Step 4 and §8.

## Format

`SDD-YYYYMMDD-<short-name>.md` — date-prefixed, kebab-case slug.

## When to write one

Anything non-trivial:
- New BRAIN bubble or canonical writer namespace
- New surface (tab, sub-screen, modal flow)
- Migration touching >50 lines or state-shape changes
- Anything affecting >1 file in a build with multiple files
- Anything touching guardian rules

Trivial fixes (single function, single bug) do NOT need an SDD — note in `BUNDLE-NN-NOTES.md` instead.

## Structure

```
# SDD-YYYYMMDD — <title>

Bundle: NN
Author: <session>
Status: draft | accepted | implemented | superseded

## Problem
<what's broken or missing; one paragraph>

## Goals / non-goals
<what this delivers; what is explicitly out of scope>

## Design
<the approach; sketches, function signatures, state shape>

## Migration / backwards-compat
<how existing state flows through; idempotent gating; snapshot before>

## Test plan
<what guardian rules cover this; what runtime tests; what phone-verify proves>

## Risks
<what could go wrong; rollback plan>
```

## Rules

- Write BEFORE the code lands.
- One SDD per design — don't bundle unrelated designs into one doc.
- After implementation, update Status. Add commit SHAs.

## Index

(none yet)
