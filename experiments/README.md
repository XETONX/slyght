# slyght/experiments/

> **Purpose:** Sandbox for "future architecture" pilots — code that demonstrates the target shape, not yet integrated.
>
> **Not shipped.** Nothing here is loaded by `index.html`. Pure reference implementations + design probes.
>
> **Audit A1 lineage:** This folder was created 2026-05-13 as part of the long-form investigation following Audit A1. The pilot rewrite of the Savings sub-screen lives here as the reference implementation for Bundle 28.3.

## Files

| File | Purpose |
|---|---|
| `savings-subscreen-v2.js` | Pilot rewrite of `renderPaydaySavings` + `BRAIN.plan.intent.*` + new components, demonstrating the "future architecture" |
| `invariants/*.json` | Sample declarative invariants showing the rules-as-data direction (Layer 1 + Layer 3 future shape) |

## How to use

1. Read `savings-subscreen-v2.js` end-to-end to understand the target shape.
2. Read `../REWRITE-COMPARISON-2026-05-13.md` for the migration analysis + direct-replacement candidates.
3. When Bundle 28.3 ships, code lifts from here into `index.html` per the migration doc.

## Rules

- Nothing here is wired to the app. No `<script>` tag in `index.html` references this folder.
- Experiments age out fast — anything older than 60 days that hasn't migrated should be archived under `slyght/archive/experiments/` or deleted.
