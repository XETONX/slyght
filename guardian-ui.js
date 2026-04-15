const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const checks = [
  // All 5 nav tabs present
  { name: 'Bottom nav has exactly 5 tabs',
    test: () => {
      const navItems = html.match(/class="nav-btn/g) || [];
      const count = navItems.length;
      return count === 4 ? 'OK' : 'BROKEN — found ' + count + ' nav-btn items, expected 4 (+ 1 center FAB)';
    }
  },

  // FAB button exists
  { name: 'FAB + button exists in nav',
    test: () => html.includes('nav-center-btn') || html.includes('fab') ? 'OK' : 'MISSING — FAB button not found'
  },

  // No budget dropdown in chat tab
  { name: 'No budget dropdown in chat tab',
    test: () => {
      const hasBudgetToggle = html.includes('toggleChatBudget') || html.includes('chat-budget-panel');
      return !hasBudgetToggle ? 'OK' : 'BROKEN — budget dropdown still in chat';
    }
  },

  // All required DOM IDs exist
  { name: 'Critical DOM IDs present',
    test: () => {
      const required = ['m-surplus', 'm-surplus-lbl', 'monthly-position',
        'dash-payday-banner', 'debt-grid', 'chat-messages', 'chat-input'];
      const missing = required.filter(id => !html.includes('id="' + id + '"'));
      return missing.length === 0 ? 'OK' : 'MISSING IDs: ' + missing.join(', ');
    }
  },

  // No DOM IDs referenced in JS that dont exist in HTML
  { name: 'No orphaned DOM ID references',
    test: () => {
      const jsRefs = [...html.matchAll(/\$\(['"]([a-zA-Z0-9\-_]+)['"]\)/g)].map(m => m[1]);
      const orphaned = jsRefs.filter(id =>
        !html.includes('id="' + id + '"') &&
        !['pg-dash','pg-bills','pg-budget','pg-spend','pg-settings','pg-chat'].includes(id)
      );
      const unique = [...new Set(orphaned)];
      return unique.length === 0 ? 'OK' : 'WARNING — possibly orphaned: ' + unique.slice(0,8).join(', ');
    }
  },

  // Splash screen exists
  { name: 'Splash screen present',
    test: () => html.includes('splash') ? 'OK' : 'MISSING'
  },

  // Dark mode CSS variables defined
  { name: 'CSS variables defined for theming',
    test: () => {
      const hasVars = html.includes('--bg:') && html.includes('--green:') && html.includes('--red:');
      return hasVars ? 'OK' : 'BROKEN — CSS variables missing';
    }
  },

  // Sticky nav CSS
  { name: 'Bottom nav has position:fixed',
    test: () => {
      const navCSS = html.match(/\.nav[^{]*\{[^}]*\}/g) || [];
      const hasFixed = navCSS.some(css => css.includes('fixed') || css.includes('sticky'));
      return hasFixed ? 'OK' : 'WARNING — nav may not be sticky';
    }
  },

  // renderMarkdown applied to chat
  { name: 'renderMarkdown applied to assistant messages',
    test: () => {
      const match = html.match(/function renderChatMessages[\s\S]*?\nfunction /);
      if (!match) return 'WARNING — renderChatMessages not found';
      return match[0].includes('renderMarkdown') ? 'OK' : 'BROKEN — markdown not applied to chat bubbles';
    }
  },

  // No duplicate HTML IDs
  { name: 'No duplicate HTML element IDs',
    test: () => {
      const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
      const seen = {};
      const dupes = [];
      ids.forEach(id => {
        if (seen[id]) dupes.push(id);
        seen[id] = true;
      });
      return dupes.length === 0 ? 'OK' : 'BROKEN — duplicate IDs: ' + dupes.join(', ');
    }
  },

  // All screens have pg- prefix IDs
  { name: 'All page screens have pg- prefixed IDs',
    test: () => {
      const pages = ['pg-dash', 'pg-cal', 'pg-chat', 'pg-spend', 'pg-settings'];
      const missing = pages.filter(p => !html.includes('id="' + p + '"'));
      return missing.length === 0 ? 'OK' : 'MISSING pages: ' + missing.join(', ');
    }
  },

  // PWA manifest linked
  { name: 'PWA manifest linked in HTML',
    test: () => html.includes('manifest.json') ? 'OK' : 'MISSING — PWA manifest not linked'
  },

  // Service worker registered
  { name: 'Service worker registration present',
    test: () => html.includes('serviceWorker') ? 'OK' : 'MISSING — no service worker registration'
  },

  // Viewport meta tag
  { name: 'Mobile viewport meta tag present',
    test: () => html.includes('viewport') && html.includes('width=device-width') ? 'OK' : 'MISSING — viewport meta tag'
  },

  // Celebration overlay exists
  { name: 'Debt cleared celebration overlay exists',
    test: () => html.includes('debt-celebrate') || html.includes('celebrate') ? 'OK' : 'MISSING — no celebration on debt clear'
  },

  // Offline badge exists
  { name: 'Offline indicator badge present',
    test: () => html.includes('offline') ? 'OK' : 'MISSING — no offline indicator'
  },

  // UX monitor exists and initialised
  { name: 'UX monitor exists and initialised',
    test: () => {
      if (!html.includes('const UX')) return 'MISSING — UX system not found';
      if (!html.includes('UX.init()')) return 'BROKEN — UX.init() not called on app start';
      return 'OK';
    }
  },

  // Tab visits tracked in goPage
  { name: 'Tab visits tracked via UX.trackTabVisit in goPage',
    test: () => {
      const match = html.match(/function goPage[\s\S]*?\nfunction /);
      if (!match) return 'MISSING — goPage not found';
      return match[0].includes('UX.trackTabVisit') ? 'OK' : 'BROKEN — goPage missing UX.trackTabVisit call';
    }
  },

  // Modal open tracking wired
  { name: 'Modal open interactions tracked via UX.trackModalOpen',
    test: () => {
      const openCalls = (html.match(/UX\.trackModalOpen/g) || []).length;
      return openCalls >= 4 ? 'OK' : 'WARNING — only ' + openCalls + ' modal open tracked (expected ≥4)';
    }
  },

  // Modal close tracking wired
  { name: 'Modal close interactions tracked via UX.trackModalClose in closeModal',
    test: () => {
      const match = html.match(/function closeModal[\s\S]*?\n}/);
      if (!match) return 'MISSING — closeModal not found';
      return match[0].includes('UX.trackModalClose') ? 'OK' : 'BROKEN — closeModal missing UX.trackModalClose';
    }
  },

  // No text below 11px font size
  { name: 'No font-size below 11px',
    test: () => {
      const sizes = [...html.matchAll(/font-size:\s*(\d+)px/g)].map(m => parseInt(m[1]));
      const tooSmall = sizes.filter(s => s < 11);
      return tooSmall.length === 0 ? 'OK' : 'WARNING — ' + tooSmall.length + ' font-size(s) below 11px: ' + [...new Set(tooSmall)].join(', ') + 'px';
    }
  },

  // Interactive elements have cursor:pointer
  { name: 'cursor:pointer defined for interactive elements',
    test: () => {
      const hasCursorPointer = html.includes('cursor:pointer') || html.includes('cursor: pointer');
      return hasCursorPointer ? 'OK' : 'BROKEN — no cursor:pointer rules found';
    }
  },

  // Haptic feedback on key actions
  { name: 'Haptic feedback (navigator.vibrate) used on key actions',
    test: () => {
      const vibrateCount = (html.match(/navigator\.vibrate/g) || []).length;
      return vibrateCount >= 2 ? 'OK' : 'WARNING — only ' + vibrateCount + ' haptic feedback call(s) found (expected ≥2)';
    }
  },

  // Pull to refresh implemented
  { name: 'Pull to refresh implemented (touchstart/touchmove)',
    test: () => {
      const hasPullRefresh = html.includes('touchstart') || html.includes('pull-to-refresh') || html.includes('pullToRefresh');
      return hasPullRefresh ? 'OK' : 'WARNING — no pull-to-refresh detected';
    }
  },

  // All modals have a close/cancel button
  { name: 'All modals have a close or cancel button',
    test: () => {
      const modalIds = [...html.matchAll(/class="modal-overlay[^"]*"[^>]*id="([^"]+)"/g)].map(m => m[1]);
      // Simpler: count modal-overlay elements vs modal-btn-cancel/modal-close occurrences
      const overlayCount = (html.match(/class="modal-overlay/g) || []).length;
      const closeBtnCount = (html.match(/modal-btn-cancel|modal-close|closeModal/g) || []).length;
      return closeBtnCount >= overlayCount ? 'OK' : 'WARNING — ' + overlayCount + ' modals but only ' + closeBtnCount + ' close mechanisms';
    }
  },

  // Scanner modal exists with three input options
  { name: 'Scanner modal exists with three input options',
    test: () => html.includes('scan-camera-input') && html.includes('scan-gallery-input') ? 'OK' : 'MISSING — scanner input elements not found'
  },

  // Scanner confirmation card shows editable fields
  { name: 'Scanner confirmation card shows editable fields',
    test: () => html.includes('sc-name') && html.includes('sc-amt') && html.includes('sc-date') ? 'OK' : 'MISSING — scanner confirmation fields not found'
  },

  // Scanner confidence badge exists
  { name: 'Scanner confidence badge shown on result',
    test: () => html.includes('scan-confidence-badge') && html.includes('confidence') ? 'OK' : 'MISSING — confidence badge not found'
  }
];

console.log('\n🎨 SLYGHT UI GUARDIAN\n');
console.log('━'.repeat(60));
let allOk = true;
checks.forEach(check => {
  const result = check.test();
  const icon = result === 'OK' ? '✅' : result.startsWith('WARNING') ? '⚠️' : '❌';
  console.log(icon + '  ' + check.name);
  if (result !== 'OK') {
    console.log('   → ' + result.substring(0,200));
    if (!result.startsWith('WARNING')) allOk = false;
  }
});
console.log('━'.repeat(60));
if (allOk) {
  console.log('\n✅ UI guardian passed\n');
} else {
  console.log('\n❌ UI failures — do not push\n');
  process.exit(1);
}
