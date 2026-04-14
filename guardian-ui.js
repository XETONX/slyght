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
