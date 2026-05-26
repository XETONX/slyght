# Spec 13 — Nav / chrome / onboarding / PIN gate

**Story:** The frame around everything — splash, onboarding chain, PIN gate, tab nav, modals,
back-button behaviour. Sam must be able to get in (or be gated by PIN) and move between surfaces
without a modal getting stuck or a security gate being bypassed.

**Fixture:** positive (`state-snapshot.fake.json`). Walker seeds `onboarded`/`ai_consent`/
`slyght_payday_canvas_seen` so onboarding is normally skipped — for the onboarding walk, seed a
FRESH (un-onboarded) variant.

## Level 1 — main UI
Boot → splash → (onboarding | app). Screenshot splash, each onboarding step, the tab bar.

## Level 2 — per control
| action | driver | expect | lands |
|---|---|---|---|
| boot | `load`→`refreshModel` | app paints, no errors | ⚠️ **7 pageErrors: TDZ `Cannot access 'BRAIN' before initialization` ~index.html:4512** |
| splash tap | `splashTap` :19919 | route into app | ⚠️ **never routes to pin-screen** |
| launch app | `launchApp` | app shown | ⚠️ native alert in launchApp |
| onboarding chain | onboarding steps | step-through to consent | — |
| tab nav | `goPage` | switch surface, sweep modals | candidate: misses EDIT_MODAL |
| back button | back-button intercept (Bundle 22 v3) | closes modal not app | — |

## Level 3 — cross-surface
- **PIN gate:** with a PIN set (Spec 12), boot MUST route to pin-screen before the app.
  Code-read: `splashTap` :19919 never routes to pin-screen → **gate orphaned**. Walk: set PIN,
  reload, confirm whether the app demands the PIN (security finding) or opens straight through.
- **goPage modal-sweep** must close ALL open modals incl EDIT_MODAL (candidate: misses it →
  stuck modal). Walk: open an edit modal, tap a tab, confirm modal closed.
- **Boot TDZ** (4512) → MODEL falls back to stub → first-paint numbers may be wrong. Walk boot,
  screenshot first paint, compare to settled state.

## Candidate findings
- **PIN gate orphaned on boot** — `splashTap` never routes to pin-screen [SECURITY / descope, pending walk].
- Boot TDZ at index.html:4512 (`isPaid`→`getBillsDue`→`computeFinancialModel`→`refreshModel`→`load`) — model stub fallback [✗ seen live, fixture-independent].
- native `alert()` in `launchApp` (CLAUDE.md §8) [pending].
- `goPage` modal-sweep may miss EDIT_MODAL → stuck modal [pending].
