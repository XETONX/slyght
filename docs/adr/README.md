# Architecture Decision Records

Per `CC-PRINCIPAL-ENGINEER-MANUAL.md` §3 Step 4 and §8.

## Format

`ADR-NNN-<short-name>.md` — three-digit zero-padded sequence, kebab-case slug.

## Structure

```
# ADR-NNN — <title>

Date: YYYY-MM-DD
Status: proposed | accepted | superseded by ADR-MMM | deprecated
Driver: <bundle | bug | RFC>

## Context
<the forces at play; what we know>

## Decision
<the thing we are doing>

## Consequences
<what becomes easier; what becomes harder; what we accept>

## Alternatives considered
<options rejected and why>
```

## Rules

- Append-only. Never delete an ADR — supersede it by writing a new one and updating Status on the old.
- One decision per ADR. If a bundle makes three decisions, write three ADRs.
- Write the ADR BEFORE the code lands, not after. Per manual §3 Step 4.
- Cross-link from `BUNDLE-NN-NOTES.md` and `CHANGELOG.md` entries.

## Index

(none yet — first ADR will be ADR-001)
