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
