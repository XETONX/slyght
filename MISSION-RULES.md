# slyght — Mission Rules

> John's own standing QA / dev rules and directives. Editable from the Mission
> Control cockpit (a labelled field + save appends a new rule here). These are
> John's calls, in his words — the engineering pipeline (`docs/PIPELINE.md`) is
> the *how*; this file is *what John wants enforced*.

---

## Walk the ledger before trusting any number

Transactions and the running app are ground truth; flags and derived state are
convenience that can drift. Never promote a state-derived finding to a bug without
walking the txns / audit-lands that back it.

## Find everything before fixing anything

On a QA sweep, complete the walk and surface every finding first. Then batch the
fixes through the pipeline in priority order — don't fix mid-walk.

## Phone-verify on the real S23 Ultra

Every user-visible change ends with a PASS/FAIL block (Open · Do · PASS · FAIL) so
it can be validated on John's actual phone (Android Chrome PWA). Green smoke is not
enough.

## Preserve history — never regenerate a hand-maintained doc from a parse

OPEN-BUGS.md and the like hold investigation trails worth keeping. Append, or edit
the one changed line surgically. Don't rewrite the whole file from a model.

## No autonomous push on money-logic; John approves every push

The Human Verdict gate is John's. The deploy button asks before it fires.
