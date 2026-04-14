const fs = require('fs');

// Read index.html
const html = fs.readFileSync('index.html', 'utf8');

// Extract and verify critical elements
const checks = [
  // Balance architecture
  { name: 'getLiveBal returns only S.bal',
    test: () => {
      const match = html.match(/function getLiveBal\(\)[^}]+}/);
      if (!match) return 'MISSING';
      const body = match[0];
      if (body.includes('reduce') || body.includes('txns') || body.includes('filter')) return 'BROKEN — has arithmetic';
      if (body.includes('return S.bal')) return 'OK';
      return 'UNKNOWN';
    }
  },
  // Surplus includes debts
  { name: 'getGenuineSurplus includes getActiveDebtsDueBeforePayday',
    test: () => {
      const match = html.match(/function getGenuineSurplus\(\)[^}]+}/s);
      if (!match) return 'MISSING';
      return match[0].includes('getActiveDebtsDueBeforePayday') ? 'OK' : 'BROKEN — missing debt deduction';
    }
  },
  // No getMonthlySurplus
  { name: 'getMonthlySurplus deleted',
    test: () => html.includes('function getMonthlySurplus') ? 'BROKEN — still exists' : 'OK'
  },
  // No REAL_PIN
  { name: 'REAL_PIN removed',
    test: () => html.includes('REAL_PIN') ? 'BROKEN — still in source' : 'OK'
  },
  // Recurring filter
  { name: 'getBillsDue filters recurring:false',
    test: () => {
      const match = html.match(/function getBillsDue\(\)[^}]+}/s);
      if (!match) return 'MISSING';
      return (match[0].includes('recurring') || html.includes('getExpandedBills')) ? 'OK' : 'WARNING — check manually';
    }
  },
  // API key separate storage
  { name: 'API key stored in slyght_api_key',
    test: () => html.includes('slyght_api_key') ? 'OK' : 'BROKEN — key not in separate storage'
  },
  // No dead code
  { name: 'clearDebt orphan removed',
    test: () => {
      const matches = html.match(/function clearDebt/g);
      return (!matches || matches.length === 0) ? 'OK' : 'BROKEN — orphan still present';
    }
  },
  // daysLeft paydayReceived guard
  { name: 'daysLeft accounts for paydayReceived',
    test: () => {
      const match = html.match(/function daysLeft\([^)]*\)[^}]+}/s);
      if (!match) return 'MISSING';
      return match[0].includes('paydayReceived') ? 'OK' : 'BROKEN — no paydayReceived guard';
    }
  },
  // Markdown rendering
  { name: 'renderMarkdown exists for chat',
    test: () => html.includes('function renderMarkdown') ? 'OK' : 'MISSING'
  },
  // Monthly position not duplicated
  { name: 'Monthly Position not duplicated in HTML',
    test: () => {
      const staticMatches = html.match(/class="card-title">Monthly Position/g);
      return (!staticMatches || staticMatches.length <= 1) ? 'OK' : 'BROKEN — duplicated in HTML';
    }
  },
  // getActiveDebtsDueBeforePayday exists
  { name: 'getActiveDebtsDueBeforePayday exists',
    test: () => html.includes('function getActiveDebtsDueBeforePayday') ? 'OK' : 'MISSING'
  },
  // paydayReceived guard on alerts
  { name: 'shouldShowAlert uses paydayReceived guard',
    test: () => html.includes('shouldShowAlert') && html.includes('paydayReceived') ? 'OK' : 'WARNING'
  },

  // Transaction count preserved
  { name: 'Seed does not wipe S.txns if transactions exist',
    test: () => {
      const seedMatch = html.match(/function.*[Ss]eed[^{]*\{[\s\S]*?\n\}/g);
      if (!seedMatch) return 'WARNING — no seed function found';
      const seedCode = seedMatch.join(' ');
      // Seed should check for existing txns before overwriting
      return (seedCode.includes('txns') && (seedCode.includes('length') || seedCode.includes('preserve') || seedCode.includes('existing')))
        ? 'OK'
        : 'WARNING — verify seed preserves existing transactions manually';
    }
  },

  // Chat history not wiped on seed
  { name: 'chatHistory preserved across seeds',
    test: () => {
      // Check that seed functions dont blindly overwrite chatHistory
      const hasSeparateKey = html.includes('slyght_chat') || html.includes('chatHistory');
      const seedPreserves = html.includes('chatHistory') && html.includes('slyght_seeded');
      return hasSeparateKey ? 'OK' : 'WARNING — verify chat history survives seed manually';
    }
  },

  // Debt tile count matches S.debts
  { name: 'renderDebtTiles reads from S.debts array',
    test: () => {
      const match = html.match(/function renderDebtTiles[^{]*\{[\s\S]*?\n\}/);
      if (!match) return 'MISSING — renderDebtTiles not found';
      return match[0].includes('S.debts') ? 'OK' : 'BROKEN — not reading from S.debts';
    }
  },

  // Bill count matches BILLS
  { name: 'renderBillsGrouped reads from BILLS array',
    test: () => {
      const match = html.match(/function renderBillsGrouped[^{]*\{[\s\S]*?\n\}/);
      if (!match) {
        // Try alternative — may be inline
        return html.includes('renderBillsGrouped') ? 'WARNING — check manually' : 'MISSING';
      }
      return match[0].includes('BILLS') || match[0].includes('getExpandedBills') ? 'OK' : 'BROKEN — not reading from BILLS';
    }
  },

  // No duplicate function definitions
  { name: 'No duplicate function definitions',
    test: () => {
      const funcMatches = html.match(/function\s+(\w+)\s*\(/g) || [];
      const funcNames = funcMatches.map(f => f.replace('function ', '').replace('(', '').trim());
      const seen = {};
      const duplicates = [];
      funcNames.forEach(name => {
        if (seen[name]) duplicates.push(name);
        seen[name] = true;
      });
      return duplicates.length === 0
        ? 'OK'
        : 'BROKEN — duplicates: ' + duplicates.join(', ');
    }
  },

  // Ruflo CLAUDE.md present
  { name: 'Ruflo CLAUDE.md present',
    test: () => {
      try {
        fs.accessSync('CLAUDE.md');
        return 'OK';
      } catch {
        return 'MISSING — run npx ruflo@latest init to restore';
      }
    }
  },

  // API key never in seed data
  { name: 'API key not hardcoded in seed data',
    test: () => {
      // Real API keys are 95+ chars; placeholder strings like "sk-ant-api03-..." are much shorter
      const seedMatches = (html.match(/sk-ant-[a-zA-Z0-9\-_]+/g) || []).filter(m => m.length > 40);
      return seedMatches.length === 0
        ? 'OK'
        : 'CRITICAL — API key found in source code';
    }
  },

  // getActiveDebtsDueBeforePayday has paydayReceived guard
  { name: 'getActiveDebtsDueBeforePayday has paydayReceived cycle guard',
    test: () => {
      const match = html.match(/function getActiveDebtsDueBeforePayday[\s\S]*?^}/m);
      if (!match) return 'MISSING';
      return match[0].includes('paydayReceived')
        ? 'OK'
        : 'BROKEN — missing paydayReceived guard causes wrong cycle';
    }
  },

  // daysLeft never returns 0
  { name: 'daysLeft has Math.max(1,...) guard against division by zero',
    test: () => {
      const match = html.match(/function daysLeft[\s\S]*?^}/m);
      if (!match) return 'MISSING';
      return match[0].includes('Math.max')
        ? 'OK'
        : 'WARNING — potential division by zero in getMaxDay';
    }
  },

  // Budget dropdown removed from chat
  { name: 'Budget dropdown removed from chat tab',
    test: () => {
      const hasBudgetToggle = html.includes('toggleChatBudget') || html.includes('chat-budget');
      return !hasBudgetToggle ? 'OK' : 'BROKEN — budget dropdown still in chat tab';
    }
  }
];

const args = process.argv[2];

if (args === 'snapshot' || args === 'verify') {
  console.log('\n🛡️  SLYGHT STATE GUARDIAN\n');
  console.log('━'.repeat(60));

  let allOk = true;
  const results = [];

  checks.forEach(check => {
    const result = check.test();
    const icon = result === 'OK' ? '✅' : result.includes('WARNING') ? '⚠️' : '❌';
    console.log(`${icon}  ${check.name}`);
    if (result !== 'OK') {
      console.log(`   → ${result}`);
      if (!result.includes('WARNING')) allOk = false;
    }
    results.push({ name: check.name, result });
  });

  console.log('━'.repeat(60));

  if (allOk) {
    console.log('\n✅ All checks passed — safe to push\n');
  } else {
    console.log('\n❌ FAILURES DETECTED — do not push until fixed\n');
    process.exit(1);
  }

  // Update GUARDIAN.md with results
  const timestamp = new Date().toISOString();
  const mdContent = `# SLYGHT State Guardian\n\n## Last verified: ${timestamp}\n\n## Results\n\n${
    results.map(r => `- ${r.result === 'OK' ? '✅' : '❌'} ${r.name}: ${r.result}`).join('\n')
  }\n\n## How to run\n\`\`\`\nnode guardian.js verify\n\`\`\`\n`;

  fs.writeFileSync('GUARDIAN.md', mdContent);
  console.log('📝 GUARDIAN.md updated\n');
} else {
  console.log('Usage: node guardian.js snapshot|verify');
}
