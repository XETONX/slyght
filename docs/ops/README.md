# Operational notes

Per `CC-PRINCIPAL-ENGINEER-MANUAL.md` §8.

## What goes here

Operational runbooks and procedures:
- Snapshot procedures (export/import, recovery from bad migration)
- Deploy steps (currently: push to main → GitHub Pages auto-rebuilds ~2min)
- Layer V capture invocation + reset
- Guardian gate troubleshooting
- State-file repair runbooks

## What does NOT go here

- Design decisions → `docs/adr/`
- Design proposals → `docs/sdd/`
- Per-bundle work log → `CHANGELOG.md` + `BUNDLE-NN-NOTES.md`
- Open bugs → `OPEN-BUGS.md`

## Format

Free-form markdown. One runbook per file. Suggested naming: `ops-<verb>-<noun>.md` (e.g. `ops-restore-snapshot.md`, `ops-redeploy.md`).

## Index

(none yet)
