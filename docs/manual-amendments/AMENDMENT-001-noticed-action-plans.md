# AMENDMENT-001 — Noticed items require action plan + timeline

Date: 2026-05-13
Section affected: §11 (Proactive improvement obligation), §3 Step 8 (Surface 3-5 noticed items)
Driver: recurring-pattern (John's directive after first session under the manual)
Status: proposed → awaiting John's accept/reject

## Trigger

End of the 2026-05-13 artifact-infra session, I surfaced 4 Noticed items per manual §11:

1. 2 pre-existing FAILs from `npm test` (`no-hardcoded-bill-name` L12118, `no-third-discretionary-filter-array` L14846)
2. 116 untracked Layer V PNGs in `captures/` not in `.gitignore` and not tracked
3. `scripts/bundle-15.2-cleanup.js` untracked one-off

Format used: bare flat list with priority tags and a "saving for end of next code-touching session" disclaimer.

John's response: "after noticing adding an action plan and timeline to ensure nothing is missed or nothing piles up in the background."

The pattern observed: flagged items without commitments tend to never get picked up. The Noticed list is intended to PREVENT backlog accumulation, not contribute to it.

## Change

### Before (current manual §11 — approximate, paraphrased from memory of read pass)

> Surface 3–5 noticed items at end of each session. These are observations the user hasn't asked about but that you spotted while doing the requested work — small wins, technical debt, future risks, naming oddities. Priority-tagged. Brief.

### After (proposed)

> Surface 3–5 noticed items at end of each session. Each item MUST include both an action plan and a timeline, structured as:
>
> `[priority] [type] <observation> → ACTION: <what should happen> → WHEN: <this session | next code-touching round | Bundle NN | by <YYYY-MM-DD>>`
>
> - "WHEN" must be concrete. "TBD" and "later" are not allowed.
> - If an item is small enough to action in the current session and isn't blocked by scope or authorisation, action it now and report it as shipped, not as noticed.
> - Items deferred to a future bundle MUST also be added to that bundle's deferred-items table in `BUNDLE-NN-NOTES.md` so the timeline actually binds.
> - When a deferred Noticed item ships, cross-link in `CHANGELOG.md` (`Closes Noticed item from session YYYY-MM-DD`).

Also update §3 Step 8 (the session-loop step that produces the Noticed list) to reference the structured format.

## Rationale

The bare-list pattern fails because:
- No commitment → no accountability → backlog growth
- No timeline → no review trigger → items decay into noise
- No bundle-binding → the deferred-items table in NOTES drifts from reality

The structured format addresses each:
- ACTION forces concrete plan, not just observation
- WHEN forces commitment with a review trigger
- Bundle-table binding gives the timeline a place to live where it actually shapes work

Alternative considered: instead of structuring Noticed items, add a separate "Action queue" section. Rejected because it bifurcates the discipline — easier to enforce one well-structured list than two parallel lists.

## Migration

- Add new format to the 4 already-surfaced items from this session (apply retroactively in BUNDLE-28-NOTES.md and the CHANGELOG entry for `315431c`).
- Going forward, every session-end Noticed surfacing follows the new format.
- No manual rewrite needed until John accepts — once accepted, edit `CC-PRINCIPAL-ENGINEER-MANUAL.md` §11 + §3 Step 8 + log the applied amendment here with Status: applied + commit SHA.

## Cross-links

- Memory: `feedback-noticed-action-plans` (auto-memory file)
- Triggering session commit: `315431c`
- Sibling process rule: existing memory `process-discipline-no-reframes`
