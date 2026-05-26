#!/usr/bin/env node
/* ============================================================================
 * slyght — Mission Control case-pack generator (the data layer)
 *
 * Builds mission-control/cases.json: one DEEP case per finding, so the cockpit's
 * translator reads rich data — not the thin one-line OPEN-BUGS entry that made
 * v1's generated prompts hollow. Each deep case carries: plain-English summary,
 * technical mechanism, root cause (file:line), the proposed fix, AND live walk
 * EVIDENCE pulled programmatically from the latest walk.json (the real audit
 * "lands" + S-deltas + probes for that finding's flow).
 *
 * Deep findings are hand-authored below (SEED) from the real analysis
 * (docs/walk-and-judge/audit-2026-05-26.md + coverage-map + ux-recs). Active
 * OPEN-BUGS.md entries are pulled in as lighter "tracked" cases so bugs and the
 * translator are one surface. Re-run after each walk to refresh evidence:
 *     node scripts/mc/build-cases.js
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const r = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// ── deep findings, authored from the real root-cause analysis ────────────────
// status: confirmed (walked + evidenced) | candidate (code-read/UX, not yet walked-confirmed)
const SEED = [
  {
    id: 'savings-no-picker', title: 'Quick Log → Savings silently loses money',
    group: 'savings', surface: 'save', severity: 'P0', status: 'confirmed', flow: 'darwin-A-quicklog', openBug: 11,
    plain: "When you log money as “Savings” in Quick Log, the app takes it out of your cash but never puts it into any goal — because there's no box to choose which goal it's for. So $300 leaves your balance and lands nowhere. Worse, the success toast says it worked: it reads “−$300 · Savings · — · Tap to undo”, with a dash sitting where the goal name should be.",
    mechanism: "The Quick Log modal hides the category row when you pick the “Savings” type but renders no destination (bucket/goal) picker in its place. quickLogTxn() then records a Savings-category transaction that decrements cash via the balance writer but never calls the bucket-credit path — so no goal's `saved` total moves.",
    rootCause: "openQuickLogModal (index.html:10154-10291) has no goal-picker for type=savings; quickLogTxn (index.html:10311) records the txn through the balance delta but not through a bucket destination — so `bucket_saved_change` never fires.",
    fix: "Add a required goal-picker to the Savings type in the Quick Log modal; block the save if no destination is chosen; route the save through `recordWithAllocation` with the chosen bucket as destination. The crediting machinery already works — the round-up path proves `bucket_saved_change` fires correctly (see log-transaction flow). This is a missing picker, not broken crediting.",
    files: ['index.html:10154-10291 (openQuickLogModal — no picker)', 'index.html:10311 (quickLogTxn)', 'index.html:24524 (recordWithAllocation — the path it should use)'],
  },
  {
    id: 'bills-undo-key-mismatch', title: 'Bills “undo” silently no-ops — bill stuck paid, cash not returned',
    group: 'bills', surface: 'bills', severity: 'P0', status: 'confirmed', flow: 'bills-mark-paid', openBug: null,
    plain: "Pay a bill that's due before payday, then change your mind and hit undo — nothing happens. The bill stays marked paid and the money doesn't come back. It affects every bill due before payday.",
    mechanism: "Marking a pre-payday bill paid files it under NEXT month's key (a “cycle bump”, because day < payday means it belongs to the coming cycle). But the undo path looks up THIS month's key. Writer-key ≠ reader-key, so undo searches the wrong drawer, finds nothing, and quietly does nothing.",
    rootCause: "markPaid cycle-bumps the paidBills key for day<payday bills to the next month (~index.html:25192, e.g. `2026-6-Phone Plan-10`), but undoBillPaid (index.html:8809) and unmarkBillFromCal read `paidBillKey(name,day)` = the current month (`2026-5-Phone Plan-10`). The keys never match.",
    fix: "Make undo compute the SAME cycle-bumped key markPaid wrote (share one key-builder across mark + undo), or store the actual written key on the paidBills entry so undo reverses by stored key rather than recomputing. Pair with a regression spec asserting pay→undo restores balance + clears the flag for a pre-payday bill.",
    files: ['index.html:~25192 (markPaid cycle-bump writes next-month key)', 'index.html:8809 (undoBillPaid reads current-month key)', 'unmarkBillFromCal (same reader-key bug)'],
  },
  {
    id: 'ai-prompt-provenance', title: 'AI coach is fed a stale hand-written cheat-sheet (and the wrong spendable number)',
    group: 'ai', surface: 'ai', severity: 'P0', status: 'confirmed', flow: 'ai-provenance', openBug: null,
    plain: "The in-app AI is given a “what you know about John” brief built from hard-coded, out-of-date facts and the wrong “spendable per day” figure — so its advice rests on numbers you can't even see. There's a correct version of that brief already written in the code, but nothing calls it: the app uses a hand-maintained copy instead.",
    mechanism: "Two prompt builders exist. The correct one uses your live balance, your genuine surplus, and includes the licensed-advice disclaimer — but it has zero callers (dead code). The one actually sent to the model reads the raw stored balance and a “dynamic daily budget” (not genuine surplus), carries no disclaimer, and hard-codes facts that have drifted (a savings goal it can't find falls back to a made-up $9k; a trip date written as “June 7-15” when the real plan is August).",
    rootCause: "buildSystemPrompt (index.html:15332 — uses getLiveBal + getGenuineSurplus + disclaimer) is dead code (0 callers). The live prompt is an inline string (index.html:15665, sent at :15766) reading raw S.bal (:15672) + getDynamicDailyBudget (:15676); it looks up goal id `rainy-day-fund` (:15649) but the intent id is `rainy-day` → miss → hard-coded $9k. Darwin hard-coded “June 7-15” (:15704) vs intent Aug 1–10.",
    fix: "Route the live AI call through buildSystemPrompt (or replace the inline literal with it) so the prompt uses getLiveBal + getGenuineSurplus + the live intent data + the disclaimer; delete the hard-coded stale facts; fix the `rainy-day-fund`→`rainy-day` id. NOTE: on the current fixture S.bal == getLiveBal (balance divergence 0), so the raw-balance read is a structural risk here — the demonstrated harm is spend-power ($0 surplus shown as $60/day), the id-miss, the stale dates, and the missing disclaimer.",
    files: ['index.html:15332 (buildSystemPrompt — correct, DEAD)', 'index.html:15665-15743 (live inline prompt — raw S.bal, stale facts)', 'index.html:15649 (rainy-day-fund id miss)', 'index.html:15766 (the fetch using the inline prompt)'],
  },
  {
    id: 'hero-render-drift', title: 'Dashboard headline number visibly drifts across renders',
    group: 'dashboard', surface: 'dash', severity: 'P1', status: 'candidate', flow: 'log-transaction', openBug: 13,
    plain: "After a single log, the big balance on the dashboard was seen showing three different values across consecutive frames ($2,045 → $1,914 → $1,782) — the headline appears to move on its own. The state underneath is correct (the ledger shows a clean change); it's the on-screen number that wobbles.",
    mechanism: "Most likely the animated “counter roll” (the number tweening to its new value) caught mid-animation by the screenshot — the walker's CSS freeze stops CSS animations but not a JS requestAnimationFrame counter. The alternative is a genuine render-vs-state divergence. Needs a walk with the counter settled before capture to tell which.",
    rootCause: "Unconfirmed — candidate. Either a rAF counter-roll caught mid-tween (display-layer, benign) or a render path reading a pre-settle value (would be a real display bug). Do NOT promote until re-walked with the counter stable.",
    fix: "Add a counter-settle wait to the walker (poll the rendered number until stable before screenshot), re-walk, and compare to the clean S.bal. If it still drifts with the counter settled, trace the hero render path.",
    files: ['walker: settle the hero counter before screenshot', 'dashboard hero render path (TBD on confirm)'],
  },
  {
    id: 'no-commit-feedback', title: 'Lock / unlock / undo give no visible confirmation',
    group: 'plan', surface: 'plan', severity: 'P1', status: 'candidate', flow: 'plan-lock', openBug: null,
    plain: "State-changing actions — locking a plan, unlocking it, undoing a bill — produced screens that are pixel-identical before and after. For a money app, an action that changes something with no visible “it happened” is a trust gap: you can't tell if it worked.",
    mechanism: "The lock/unlock loop (6 frames) and the bill undo (3 frames) render no badge, frozen field, or toast that distinguishes the new state from the old.",
    rootCause: "UX finding (Layer-C). The state changes correctly (audit lands confirm lock/unlock fired) but the UI gives no feedback signal.",
    fix: "Add a lock badge + frozen-field styling when a plan is locked; an explicit toast/confirmation on undo; a visible state marker on unlock. Pair with the bills-undo fix (which currently no-ops anyway).",
    files: ['plan canvas lock/unlock render', 'bill undo render'],
  },
  {
    id: 'legibility-debt', title: 'Low-contrast + malformed money lines on the surfaces that must be trusted',
    group: 'dashboard', surface: 'dash', severity: 'P1', status: 'candidate', flow: null, openBug: null,
    plain: "Some of the exact lines that justify the headline numbers are hard to read or broken: grey-on-grey calendar bill amounts, “debug-look” multi-colour monospace math lines, and a malformed “$#0” in the canvas reconciliation line (“WHERE THE $5,000 SITS NOW”). The justifications for your money should be the most legible thing, not the least.",
    mechanism: "Decorative low-contrast text used where primary numbers belong; a formatting bug producing `$#0` in the canvas reconciliation string.",
    rootCause: "UX finding (Layer-C) + a string-format bug for the `$#0` line.",
    fix: "Lift money figures to high-contrast (white) with secondary labels; fix the `$#0` format bug in the canvas reconciliation line. Cross-ref the slyght contrast rule (numbers always --text).",
    files: ['canvas reconciliation line ($#0 format bug)', 'calendar bill-amount styling'],
  },
  {
    id: 'plan-lock-legacy-path', title: 'Plan lock-state: only the canonical unlock path is proven clean',
    group: 'plan', surface: 'plan', severity: 'P2', status: 'candidate', flow: 'plan-lock', openBug: null,
    plain: "Locking and unlocking a plan through the main (canonical) path leaves all three places that track “is it locked?” agreeing. But there's a second, older unlock path (used by some UI) that wasn't exercised — and history says the two paths clear different subsets of those three stores, which can leave a stale lock.",
    mechanism: "Lock-state lives in three stores (activePlan.lockedAt + a localStorage key + a BRAIN getter). The canonical unlock clears all three; a legacy/UI unlock path historically clears only some.",
    rootCause: "Not yet walked — candidate. The canonical path is verified clean (probe shows all three cleared); the legacy path is unexercised (ADR Bundle 32.7 territory).",
    fix: "Walk the legacy/UI unlock path; if it leaves a stale store, consolidate to a single unlock that clears all three (or one source of truth).",
    files: ['BRAIN.plan.unlock (canonical — clean)', 'legacy/UI unlock path (unwalked)'],
  },
];

// ── attach live walk evidence to each seed case (the real lands + S-deltas) ──
function loadLatestWalk() {
  const root = path.join(REPO, 'tests', 'walker-out');
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root).filter(d => fs.existsSync(path.join(root, d, 'walk.json'))).sort();
  if (!dirs.length) return null;
  const dir = dirs[dirs.length - 1];
  return { dir, walk: JSON.parse(fs.readFileSync(path.join(root, dir, 'walk.json'), 'utf8')) };
}
function evidenceFor(flowId, walk) {
  if (!flowId || !walk) return null;
  const fl = (walk.walk.flows || []).find(f => f.flow === flowId);
  if (!fl) return null;
  // compact every step: id, lands (types), the watched S-delta, any probe
  const steps = (fl.steps || []).map(s => {
    const before = s.before || {}, after = s.after || {}, delta = {};
    Object.keys(after).forEach(k => { if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) delta[k] = `${fmt(before[k])} → ${fmt(after[k])}`; });
    return { step: s.id, action: s.action, lands: (s.lands || []).map(l => l.type), delta, probe: s.probe || null, error: s.error || null };
  });
  return { flow: flowId, walkDir: walk.dir, steps };
}
const fmt = (v) => v === undefined ? '∅' : (typeof v === 'object' ? JSON.stringify(v) : String(v));

// ── pull active OPEN-BUGS entries as lighter "tracked" cases (fuse bugs in) ──
function openBugCases() {
  let md; try { md = r('OPEN-BUGS.md'); } catch { return []; }
  const out = [], re = /^##\s+(\d+)\.\s+(.*)$/gm, idx = []; let m;
  while ((m = re.exec(md))) idx.push({ num: +m[1], title: m[2].trim(), at: m.index });
  idx.forEach((b, i) => {
    const seg = md.slice(b.at, (idx[i + 1] || { at: md.length }).at);
    const status = ((seg.match(/^- \*\*Status:\*\*\s*(.*)$/m) || [])[1] || 'open').trim();
    if (!/^(open|investigating)/i.test(status)) return; // active only
    const bug = ((seg.match(/^- \*\*Bug:\*\*\s*([\s\S]*?)(?=\n- \*\*|\n##|$)/m) || [])[1] || '').replace(/\s+/g, ' ').trim();
    out.push({
      id: 'bug-' + b.num, title: b.title, group: 'tracked', surface: null,
      severity: /silent|loss|stuck|wrong|poison|double|overdraw/i.test(b.title + bug) ? 'P1' : 'P2',
      status: 'tracked', flow: null, openBug: b.num,
      plain: bug.slice(0, 280) || '(see OPEN-BUGS.md #' + b.num + ')',
      mechanism: '', rootCause: 'Canonical record in OPEN-BUGS.md #' + b.num + ' — not yet walked for depth.',
      fix: 'Walk this surface to produce a deep case, or scope from the OPEN-BUGS entry.',
      files: ['OPEN-BUGS.md #' + b.num],
    });
  });
  return out;
}

// ── build ────────────────────────────────────────────────────────────────────
const walk = loadLatestWalk();
const deep = SEED.map(c => ({ ...c, evidence: evidenceFor(c.flow, walk) }));
const cases = [...deep, ...openBugCases()];
const out = {
  generatedAt: new Date().toISOString(),
  walkDir: walk ? walk.dir : null,
  counts: { deep: deep.length, tracked: cases.length - deep.length, total: cases.length,
            confirmed: deep.filter(c => c.status === 'confirmed').length,
            candidate: deep.filter(c => c.status === 'candidate').length },
  cases,
};
fs.writeFileSync(path.join(REPO, 'mission-control', 'cases.json'), JSON.stringify(out, null, 2));
console.log(`cases.json: ${out.counts.deep} deep (${out.counts.confirmed} confirmed, ${out.counts.candidate} candidate) + ${out.counts.tracked} tracked = ${out.counts.total}; walk ${out.walkDir || 'none'}`);
