# archive/scripts — completed one-off scripts

Per `CC-PRINCIPAL-ENGINEER-MANUAL.md` artifact discipline (§8).

## What goes here

One-off scripts that have served their purpose and shouldn't sit in `scripts/` cluttering the active toolkit. Kept for forensic reference — if a similar problem returns, the prior approach is here.

## What does NOT go here

- Active scripts (Layer V capture, runtime tests, etc.) → `scripts/`
- Sweeping migrations that might re-run → keep in `scripts/` with idempotent gate

## Index

| File | Bundle | What it did |
|---|---|---|
| `bundle-15.2-cleanup.js` | Bundle 15.2 | One-off state cleanup script. Archived 2026-05-13 by Bundle 28 round 20. |
