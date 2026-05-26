# Jarvis — QA Pass (rest of app)

**Date:** 2026-05-27
**Method:** Playwright (chromium 1.59.1), viewport 2300×1320, non-destructive. Every interactive element on Insights, Command Deck, Prompts, Knowledge, Roadmap, Calendar, Planning, the ⌘K palette, and the topbar was clicked / opened / driven. No writes were committed (no walk fired, no prompt saved, no release grouped, no ticket created — Add/Deploy/Group forms opened and cancelled only).
**Server:** http://127.0.0.1:5050 (left running, not restarted).
**Data at test time:** 34 tickets · all status `Open` · sev P0=4 P1=10 P2=20 · type bug=33 feature=1 · 0 due-dated · 0 bundled · walk coverage 9/9 · 1 history snapshot.
**Console / page errors during the entire pass: 0.**

---

## Results

| Area | Item | Verdict | Note |
|---|---|---|---|
| **TOPBAR** | App boots, brand renders | PASS | "Jarvis · slyght mission control" |
| TOPBAR | Status strip (Tickets/P0/Gaps/Health) | PASS | `34 Tickets · 4 P0 · 0 Gaps · 0% Health` — all match data |
| TOPBAR | Live · localhost indicator | PASS | dot + label render |
| TOPBAR | Agents-Running chip (idle) | PASS | `#dspAgents` slot present, empty when idle (correct) |
| TOPBAR | ⌘K hint button | PASS | renders + opens palette on click |
| **INSIGHTS** | App Health Score ring | PASS | 54 / "At Risk" (amber) — composite matches drivers |
| INSIGHTS | Top Drivers | PASS | 3 drivers, worst-first |
| INSIGHTS | Severity donut + legend | PASS | SVG + 3 legend rows (P0/P1/P2) |
| INSIGHTS | Status Funnel (6 rows) | PASS | row click → Board pre-filtered by status |
| INSIGHTS | Tickets By Type bars | PASS | bar click → Board filtered by type |
| INSIGHTS | Tickets By Surface bars | PASS | renders + clickable |
| INSIGHTS | Walk Coverage gauge + counters | PASS | 9/9 green ring, 4 stat counters |
| INSIGHTS | Oldest Open Tickets (aging) | PASS | 6 rows, row click → ticket |
| INSIGHTS | Live Activity Feed | PASS | 0 events → honest empty copy ("No activity recorded yet…") |
| INSIGHTS | Trends — sparse state | PASS | 1 snapshot → "History Starts Now" (correct, no fake chart) |
| **COMMAND** | 5 agent cards render | PASS | Walk Drone + Trace/Auditor/UX Expert/Integrator |
| COMMAND | Walk Drone Deploy → group dropdown | PASS | modal opens, 10 scope options; cancelled w/o firing |
| COMMAND | Trace Drone Deploy → mission prompt | PASS | 492-char copyable prompt in `<pre>` |
| COMMAND | Trace Drone surface dropdown (`{group}`) | PASS | present (only agents with `{group}` show it) |
| COMMAND | Trace Drone ticket-context dropdown | PASS | 35 options; selecting a ticket re-renders prompt (492→1393 chars, "Ticket context" appended) |
| COMMAND | Auditor — no surface dropdown | PASS | correctly absent (no `{group}` token); ticket dropdown present |
| COMMAND | UX Expert / Integrator Deploy | PASS | both render copyable prompts |
| COMMAND | Copy Mission Prompt button | PASS | present in every prompt modal |
| **PROMPTS** | Template list (5 templates) | PASS | titles + previews + var counts |
| PROMPTS | Click template → fill form | PASS | live-substituted `<pre>` output |
| PROMPTS | `{ticket}` var → ticket dropdown | PASS | select renders; choosing a ticket substitutes the token live |
| PROMPTS | Text var → live substitution | PASS | typing replaces `{name}` in output instantly |
| PROMPTS | Copy Prompt button | PASS | present |
| PROMPTS | Add Template form | PASS | opens; blocks empty title (toast "title required", modal stays) |
| PROMPTS | Edit Template form | PASS | opens prefilled |
| PROMPTS | Delete → confirm dialog | PASS | opens "Delete template?" confirm; cancelled (not deleted) |
| **KNOWLEDGE** | 9 doc cards, 3 groups | PASS | Security & Governance / The Contract / Project |
| KNOWLEDGE | Each doc renders markdown | PASS | all 9 load + render (Security 122 blocks, Feature Map 291, Open Bugs 428, etc.) — none failed |
| KNOWLEDGE | Back-to-list | PASS | `‹ All documents` returns to grid |
| **ROADMAP** | Now / Next / Recently Shipped lanes | PASS | 3 lanes; all 34 cards in "Next" (all tickets Open), Now + Shipped honest-empty |
| ROADMAP | Summary chips | PASS | 4 chips (0 Now / 34 Next / 0 Shipped / 0 Ship-Ready) |
| ROADMAP | Card → ticket | PASS | severity + status pills, surface, age |
| ROADMAP | Summary chip → focus lane | PASS | scrolls + flashes lane (no nav) |
| **CALENDAR** | Month grid (42 cells, Mon-first) | PASS | 6 rows always |
| CALENDAR | Prev / Next / Today nav | PASS | May→June→May, Today resets |
| CALENDAR | Today cell highlighted | PASS | `.cal-today` dot |
| CALENDAR | Dated tickets / empty state | PASS | 0 dated → honest "No scheduled items yet" |
| **PLANNING** | Features lane | PASS | 1 feature card ("Opal integration via API key") |
| PLANNING | Candidates For Next Release | PASS | 9 P0/P1 bug cards + "+1 more on the Board →" |
| PLANNING | Releases section | PASS | honest empty (no bundles) |
| PLANNING | Group Into A Release modal | PASS | opens; ship-ready-only gate correctly shows "No tickets are ship-ready yet" (all tickets Open) |
| PLANNING | + New Feature → ticket modal | PASS | opens New Ticket modal |
| PLANNING | Card → ticket | PASS | |
| **⌘K PALETTE** | Ctrl+K opens | PASS | |
| PALETTE | Default grouped results | PASS | 29 rows · Actions / Views / Surfaces / Tickets |
| PALETTE | Fuzzy view search ("insights") | PASS | |
| PALETTE | Fuzzy surface search ("savings") | PASS | |
| PALETTE | Fuzzy ticket title ("Quick" → SLY-1) | PASS | top-ranked in Tickets group |
| PALETTE | Fuzzy ticket id | PASS | |
| PALETTE | No-match empty state | PASS | "No matches for …" |
| PALETTE | Arrow + Enter navigates | PASS | closes + routes (→ #/roadmap) |
| PALETTE | Click row navigates | PASS | → #/calendar |
| PALETTE | Esc closes / Ctrl+K toggles / backdrop closes | PASS | all three close paths work |

**Tally:** ~60 checks. All functional PASS. One genuine cross-cutting bug + several polish items below.

---

## Bugs to fix (ranked)

1. **[P2 · real] Ticket-style modals have no Esc-to-close.**
   The shared `#scrim`/`#modal` dialogs — every Deploy modal, the prompt fill form, Add/Edit/Delete prompt, Group Into A Release, and New Ticket — only close via the Cancel/Close button or a backdrop click. There is **no `Escape` keydown handler** for them (`closeModal()` is never bound to a key). The ⌘K palette *does* support Esc, so the inconsistency is jarring: muscle-memory Esc dismisses the palette but not a deploy modal. `jarvis.js:21-22` (`modal()`/`closeModal()` — no key listener) vs `jarvis.js:2897` (palette has one). Fix: add a single `document.keydown` listener that calls `closeModal()` when `#scrim.on` and `key === 'Escape'`. Low blast radius, high daily-feel payoff.

   *(No other functional bug found. The two "FAIL" lines in the raw run were test-harness artifacts of this same missing-Esc behavior, not separate app defects — confirmed by re-running with backdrop-close.)*

---

## Polish wins

1. **Lowercase toasts vs Title-Case UI (premium-consistency).** Toasts are all lowercase — "title required", "copied", "templates saved", "copy failed", "tick at least one ticket". The rest of the UI is meticulously Title Case ("Add Template", "Group Into A Release", "Mission Prompt"). Lowercase toasts read as dev-console output, not a finished product. Recommend sentence case at minimum: "Title required.", "Copied.", "Templates saved." (`jarvis.js` — every `toast('…','err'|'ok')` call site, ~12 strings.)

2. **Command Deck card-height raggedness.** The 5 agent cards have uneven content heights (Walk Drone is much taller than the prompt-agent cards), so the grid bottoms out unevenly. A min-height or flex-stretch on `.cmd-card` would tidy the column.

3. **Fuzzy palette is *loose* on short common words.** Typing "insights" returns 10 rows (subsequence fallback drags in weak matches) before the exact view. The exact match is correctly top-ranked, so it's not broken — but a small score-floor for subsequence hits when an exact substring exists elsewhere would tighten the list. Minor.

4. **Trace/UX agents `{group}` dropdown defaults silently.** When no surface is picked, the prompt fills `{group}` → "target" (fine, intentional) but there's no visual hint that the first dropdown option is the active default. A one-line helper under the prompt ("Showing for: All / <surface>") would close the loop. Minor.

5. **Insights "0% Health" topbar stat.** Health = % Shipped+ConfirmedLive, and with all 34 tickets Open it reads `0% Health` (amber) while the Insights hero reads `54 / At Risk`. Both are internally correct (different formulas) but a first-time reader may see "0%" in the topbar and "54" in the hero and wonder which is the truth. Consider labelling the topbar one "Shipped" rather than "Health", or aligning the two reads. Not a bug — a clarity nit.

---

## Notes for confidence

- **Non-destructive guarantee held:** no walk was deployed (Walk Drone modal opened → Cancel), no prompt persisted (Add form opened → empty-title validation kept it from saving; Edit/Delete opened → cancelled), no release grouped (modal showed the ship-ready-empty state, nothing ticked), no ticket created (New Feature modal opened → cancelled). `prompts.json` / `tickets.json` untouched.
- **Concurrency:** other agents were working live; the only mutation paths I touched were read-only or cancelled before commit.
- **Empty/sparse states are honest throughout** — Insights Trends ("History Starts Now"), Activity Feed, Calendar ("No scheduled items"), Roadmap empty lanes, Planning Releases empty, and the Group-Release ship-ready gate all show real, well-written copy rather than blank panels or fake data. This is a strong signal of finished feel.
- Temp QA driver + screenshots were created under `mission-control/` and removed after the run; no source code was edited.
