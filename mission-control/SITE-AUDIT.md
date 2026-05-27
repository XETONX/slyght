# Full-site audit — every tab, honestly

> John, 2026-05-27: *"Do the candid pathway audit across all the tabs — what needs to change, what
> clashes, is it easy to read, is the info correct, too much/too little, should this button exist or
> be removed, how to group better, does it need a redesign? Make it a seamless product where every
> tab is there for a reason, has its own function, updates dynamically, and pulls in info where needed."*

## The headline finding
There are **15 tabs but only ~7 real jobs.** The biggest incoherence isn't styling — it's that the
**ticket-list family is duplicated six ways**: Flightdeck, Board, Recommends, Planning, Roadmap, and
Insights all render the same tickets in a different layout. So the nav *feels* huge and you can't tell
which screen to use for what. "Every tab for a reason" is the right test — and several fail it.

Second finding: **most tabs don't update live.** Only Flightdeck, Board, ticket, Briefing, Command Centre
and Epic re-render on the poll. Recommends, Planning, Roadmap, Insights, Calendar and Fleet are
static-on-load — they go stale while drones work, which is the opposite of "updates dynamically."

Third: **two real placeholders** ship as if they're features — Calendar (almost no tickets have due
dates) and the Insights *Trends* section (loading stub, history not wired).

## Per-tab verdict

| Tab | Job | Verdict | Why |
|---|---|---|---|
| **Flightdeck** | Manage by action (home) | **KEEP — the hub** | The one screen that earns its place. Make it the spine. |
| **Board** | The power list (search/filter/group/bulk) | **KEEP + absorb** | Fold Recommends (→ a "by leverage" sort) and Roadmap (→ it already has "group by status") into it. Fix: status dropdown lets illegal jumps; bulk checkboxes do nothing (wire or remove); too many controls on phone. |
| **Recommends** | AI-ranked "what next" | **RETIRE → Board sort + Flightdeck** | Overlaps the Flightdeck SITREP and Board. Its leverage score becomes a Board sort. |
| **Roadmap** | Status lanes (Kanban) | **RETIRE → Board "group by status"** | Pure duplicate of Board grouping + Flightdeck columns. |
| **Planning** | Features/tasks + release bundles | **SLIM → "Releases"** | Keep the genuinely-distinct part (forward features + release grouping tied to Deploy); drop the status lanes (that's Board). Manual bundle-grouping is clunky — needs quick-assign. |
| **App Map** | The system shape (constellation) | **KEEP** | Distinct + just rebuilt. Fix: untraced surface nodes dismiss with "not traced" — disable them or offer "trace it". Not live. |
| **Insights** | Health + analytics | **KEEP, de-placeholder** | Distinct value (health score, distributions). Wire the Trends history or remove that section. Make it refresh. |
| **Calendar** | Due-dated tickets by date | **GATE** | Mostly empty — no due dates in use. Hide until dates exist, or auto-populate from bundle targets. Don't ship an empty tab. |
| **Briefing** | Autonomous triage report | **KEEP** | The "Ask Jarvis what matters" surface. Distinct from the deck. |
| **Agents / Command Centre** | Deploy drones (dispatch) | **KEEP + absorb Fleet** | The tactical deck. Its fleet panel + the Fleet tab are the same data — make the panel expandable and retire the separate Fleet tab. |
| **Fleet** | Drone status (deep) | **MERGE → Command Centre** | Redundant with the CC fleet panel. Not live (no refresh). |
| **Architecture** | Docs + bundles + system-audit + new-initiative | **SLIM (4-in-1 → 1)** | Too many intents. Keep docs + **system audit** (that's "system health"); move bundles → Releases; make "new initiative" a global "+ New" action. |
| **Deploy** | The push gate | **KEEP + finish** | Solid. The deploy-loop pt.2 adds ticket-linked, audited, push-ready commits (in progress). |
| **Prompts** | Reusable prompt templates | **KEEP (minor)** | Fine. Fix: doesn't refresh after edit/delete. |
| **Knowledge** | Reference docs | **KEEP (minor)** | Fine. Could add search + a TOC for long docs. |

## Cross-cutting fixes (the "seamless" part)
1. **Collapse the ticket-list family** to **Flightdeck (act) + Board (find) + Releases (ship-plan)**. Retire
   Recommends & Roadmap; their value becomes a Board *sort* and *group*. This alone removes the "which
   screen?" confusion.
2. **Everything live.** Add every surviving data view to the poll sig-block so it reflects drone activity
   without a manual refresh (your "updates dynamically").
3. **Kill the placeholders.** Gate Calendar; wire or remove Insights Trends. A tab that's empty teaches
   the user the app is half-built.
4. **One status language everywhere** — the STATUS_INFO map (meaning · who · what's-needed) we just added
   on tickets should show on every status pill across Board/Insights/Releases, with the legend one click away.
5. **Tighten the nav** to match the ~9 real jobs, grouped by intent:
   - **Work:** Flightdeck · Board · Releases · Deploy
   - **See:** App Map · Insights
   - **Jarvis:** Briefing · Command Centre
   - **Reference:** Knowledge · Prompts
   (From 15 items in 4 fuzzy groups → 10 items in 4 clear ones.)

## Sequence
1. **Nav + IA consolidation** — retire Recommends/Roadmap (fold into Board sort/group), merge Fleet→CC,
   slim Architecture, gate Calendar, regroup the rail. Biggest legibility win, mostly deletion.
2. **Everything live** — add the survivors to the poll re-render.
3. **De-placeholder** — Insights Trends + Calendar.
4. **Finish the deploy-loop** (pt.2: Deploy shows ticket-linked audited commits) — already underway.

## The fork for John
This consolidation **retires/merges four tabs** (Recommends, Roadmap, Fleet, and folds Architecture's
bundles into Releases). That's the right call for "every tab has a reason" — but it's deletion, so I want
your yes before I cut. Alternative: keep them all and just make them live + de-duplicate the content.
Recommendation: **consolidate** — fewer, clearer, each with one job.
