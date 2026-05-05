# Visual Regression — Mission V (Option A)

The fourth validation layer alongside Layer 1 (static), Layer 2
(runtime invariants) and Layer 3 (deferred audit). Catches what the
others can't: bugs that only manifest when **rendered**.

## What this catches (and what it doesn't)

**Catches** — layout shifts, copy regressions, computed-value display
drift, modal-on-load contradictions, style/color regressions, broken
JS on tab load (via the `pageerror` listener).

**Doesn't catch** — interaction-shaped bugs: dead buttons, modals that
fail to save, action sequences. Those are Option B (action recording)
territory; ship as a follow-up if Option A proves valuable.

**Honest framing**: Option A would have caught roughly 30–50% of the
visual / layout regressions in OPEN-BUGS at the time of writing. The
rest of the bug set needs Options B (interactions) and C (multi-state
fixtures, AI-vision diff). This commit ships the foundation only.

## Workflow

```bash
# One-time setup after cloning
npm install
npx playwright install chromium

# Compare current rendering against baselines
npm run visual

# Open the HTML report (after a failing run)
npm run visual:report

# Update baselines after an INTENTIONAL visual change
npm run visual:update
```

When `npm run visual` reports a diff that you didn't intend, that's
a regression — investigate before shipping. When a diff matches a
change you made on purpose (e.g., deleted a tile, renamed a label),
run `npm run visual:update` and commit the new baselines alongside
the code change in the same commit so the diff is reviewable in one
hunk.

## Baselines reflect REALITY, not aspiration

This is load-bearing: **if a fixture triggers a Layer 2 violation
banner, the baseline captures the banner**. A baseline showing
"All 13 invariants passing" when the real-state fixture should fire
MI-13 (paidbills-key-not-future) would be aspirational — and worse,
silently invalidates the test.

When the underlying bug is later fixed (e.g., Mission B clears the
paid-before-due data), the visual diff will fire because the banner
is now absent. That's correct. Run `npm run visual:update` to
re-baseline against the post-fix state, and commit the new baselines
with the fix.

Future-Opus picking this up: don't "clean" baselines to make them
look better. The point is to anchor whatever the system actually
produces against the fixture, including its warts. A "messy" baseline
is a true baseline.

## What lives where

```
visual/
  regression.spec.js      Playwright spec — determinism plumbing + 4 tabs
  baselines/              Committed PNGs (one per tab × fixture)
    dashboard.png
    analysis.png
    calendar.png
    settings.png
  README.md               This file

playwright.config.js      Test runner config (project root)
scripts/serve.js          Tiny static HTTP server used by Playwright

# Generated, gitignored:
playwright-report/        HTML report from last run
test-results/             Per-test artifacts (actual + diff PNGs on failure)
```

## Determinism plumbing — what makes pixels stable

The screenshot mechanism is ~50 lines. The bulk of Mission V is the
plumbing that makes "same input → same pixels" actually true. Each
of these matters:

1. **Clock locked** via `page.clock.install({ time: FROZEN_ISO })`.
   index.html has 184 `new Date()` / `Date.now()` callers. Without
   this, every run differs.
2. **Service worker blocked** at the browser context level. The app
   registers `/slyght/sw.js`; tests neutralize it to avoid cache
   carry-over and unhandled registration rejections.
3. **localStorage seeded** via `addInitScript` BEFORE app boot, so
   the seed-from-defaults path at index.html L6708 doesn't preempt
   the fixture.
4. **Splash screen dismissed** programmatically (`splashTap()`) —
   index.html L9420 always shows the splash; tests advance past it.
5. **Web fonts awaited** via `await document.fonts.ready` — Google
   Fonts CDN load is async; without the wait, screenshots can show
   fallback metrics.
6. **Animations disabled** via Playwright's `animations: 'disabled'`
   plus a belt-and-braces `*` stylesheet override.
7. **Viewport pinned** to 412 × 915 @ DPR 3 (Samsung Galaxy S23 Ultra
   logical — see "Viewport choice" below).
8. **Mouse off-canvas** (`page.mouse.move(0, 0)`) to neutralize
   `:hover` state.
9. **Console-error listener** — fold-in #9 from Mission V Step 1.
   Catches "tab loads but JS exploded" regressions that pixel diff
   alone misses if the broken state still renders something.

## Viewport choice

Baselines target John's actual device — Samsung Galaxy S23 Ultra,
**412 × 915 logical pixels @ devicePixelRatio 3.0**. This is the
primary surface the app gets used on, so baselines anchor against
"what John sees" rather than a generic mid-size phone.

Future contributors changing viewport must regenerate **all**
baselines (`npm run visual:update`) — a viewport change invalidates
every existing baseline. Don't mix viewports across baselines; that
would defeat the determinism guarantee. If multi-device coverage is
ever wanted, that's a follow-up mission (separate `project` configs
in `playwright.config.js`, separate baseline directories per device).

## Tolerance

`maxDiffPixelRatio: 0.001` (0.1%) — about 660 pixels in the 390×844
@ DPR 2 fullPage screenshot. Survives subpixel anti-aliasing jitter
without going blind to genuine drift. Tune in `playwright.config.js`
if false-positive flake appears.

## Future missions (not this commit)

- **Option B — action recording.** Record click/tap/type sequences
  to capture flows: open Add Bill modal → fill form → save →
  screenshot result. Catches the "broken modal" / "dead button"
  bug class that pure pixel diff misses.
- **Option C — multi-fixture matrix.** Capture each tab against
  N state fixtures (post-payday flush, near-zero balance, debt
  overdue, etc.) — catches state-dependent rendering bugs.
- **CI integration.** GitHub Actions workflow that runs `npm run
  visual` on every PR, posts diff link on failure. Defer to its own
  mission once Option A proves stable locally.
- **Local font bundle.** Replace the Google Fonts CDN dependency with
  bundled fonts only if cross-machine flake appears in practice.
- **Modal screenshots.** Open each modal (Add Bill, Mark Paid, Net
  Worth, etc.) and capture against current fixture. ~20 modals → 20
  more baselines; defer until pattern is proven on tabs.
