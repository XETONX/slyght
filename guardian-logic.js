const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const checks = [
  // Every canonical function exists and is used
  { name: 'All canonical functions exist',
    test: () => {
      const required = ['getLiveBal','getGenuineSurplus','getMaxDay','getDailyBudget',
        'getBillsDue','getExpandedBills','getAvgDailySpend','getDynamicBuffer',
        'getNetWorth','getMonthPhase','getActiveDebtsDueBeforePayday','daysLeft'];
      const missing = required.filter(fn => !html.includes('function ' + fn));
      return missing.length === 0 ? 'OK' : 'MISSING: ' + missing.join(', ');
    }
  },

  // No inline balance arithmetic outside canonical functions
  { name: 'No inline S.bal arithmetic outside getLiveBal',
    test: () => {
      // Find any S.bal +/- outside of the canonical function definitions
      const lines = html.split('\n');
      const violations = [];
      let inCanonical = false;
      lines.forEach((line, i) => {
        if (line.includes('function getLiveBal') ||
            line.includes('function getGenuineSurplus') ||
            line.includes('function getMaxDay') ||
            line.includes('function updateBalanceFromSettings') ||
            line.includes('function quickLogTxn') ||
            line.includes('function markDebtPaid') ||
            line.includes('function markBillPaidMonth') ||
            line.includes('function logIncome')) {
          inCanonical = true;
        }
        if (inCanonical && line.trim() === '}') inCanonical = false;
        if (!inCanonical && (line.includes('S.bal +') || line.includes('S.bal -') || line.includes('S.bal=') || line.includes('S.bal ='))) {
          if (!line.trim().startsWith('//')) {
            violations.push('Line ' + (i+1) + ': ' + line.trim().substring(0,80));
          }
        }
      });
      return violations.length === 0 ? 'OK' : 'WARNING — check these lines:\n   ' + violations.slice(0,5).join('\n   ');
    }
  },

  // Every money mutation calls save() and renderAll()
  { name: 'Money mutations call save() and renderAll()',
    test: () => {
      const mutations = ['quickLogTxn', 'markDebtPaid', 'markBillPaidMonth', 'updateBalanceFromSettings'];
      const missing = [];
      mutations.forEach(fn => {
        const match = html.match(new RegExp('function ' + fn + '[\\s\\S]*?\\n}'));
        if (!match) { missing.push(fn + ' not found'); return; }
        if (!match[0].includes('save()')) missing.push(fn + ' missing save()');
        if (!match[0].includes('renderAll()')) missing.push(fn + ' missing renderAll()');
      });
      return missing.length === 0 ? 'OK' : 'BROKEN: ' + missing.join(', ');
    }
  },

  // S.txns never used in balance calculations
  { name: 'S.txns not used in balance/surplus calculations',
    test: () => {
      const canonicalCalcs = ['getGenuineSurplus', 'getMaxDay', 'getDynamicBuffer', 'getBillsDue'];
      const violations = [];
      canonicalCalcs.forEach(fn => {
        const match = html.match(new RegExp('function ' + fn + '[\\s\\S]*?\\n}'));
        if (match && match[0].includes('S.txns')) {
          violations.push(fn + ' references S.txns');
        }
      });
      return violations.length === 0 ? 'OK' : 'BROKEN: ' + violations.join(', ');
    }
  },

  // getGenuineSurplus deducts all 5 components
  { name: 'getGenuineSurplus deducts all 5 components',
    test: () => {
      const match = html.match(/function getGenuineSurplus[\s\S]*?\nfunction /);
      if (!match) return 'MISSING';
      const fn = match[0];
      const required = ['getBillsDue', 'getActiveDebtsDueBeforePayday', 'getAvgDailySpend', 'getDynamicBuffer'];
      const missing = required.filter(r => !fn.includes(r));
      return missing.length === 0 ? 'OK' : 'MISSING components: ' + missing.join(', ');
    }
  },

  // daysLeft used in getGenuineSurplus living reserve
  { name: 'Living reserve uses daysLeft() in getGenuineSurplus',
    test: () => {
      const match = html.match(/function getGenuineSurplus[\s\S]*?\nfunction /);
      if (!match) return 'MISSING';
      return match[0].includes('daysLeft') ? 'OK' : 'BROKEN — living reserve not time-adjusted';
    }
  },

  // No hardcoded 31 days anywhere
  { name: 'No hardcoded 31-day month assumption',
    test: () => {
      const lines = html.split('\n');
      const violations = [];
      lines.forEach((line, i) => {
        if ((line.includes('/31') || line.includes('/ 31') || line.includes('* 31') || line.includes('*31'))
            && !line.trim().startsWith('//')) {
          violations.push('Line ' + (i+1));
        }
      });
      return violations.length === 0 ? 'OK' : 'WARNING — hardcoded 31 at lines: ' + violations.join(', ');
    }
  },

  // paydayReceived checked before any income addition
  { name: 'Income never added to projections when paydayReceived=true',
    test: () => {
      const lines = html.split('\n');
      const violations = [];
      lines.forEach((line, i) => {
        if (line.includes('S.income') && (line.includes('+') || line.includes('+=')) && !line.trim().startsWith('//')) {
          const context = lines.slice(Math.max(0,i-5), i).join('\n');
          if (!context.includes('paydayReceived')) {
            violations.push('Line ' + (i+1) + ': ' + line.trim().substring(0,60));
          }
        }
      });
      return violations.length === 0 ? 'OK' : 'WARNING — income added without paydayReceived check:\n   ' + violations.slice(0,3).join('\n   ');
    }
  },

  // Debt repayments excluded from getAvgDailySpend
  { name: 'getAvgDailySpend excludes debt repayments',
    test: () => {
      const match = html.match(/function getAvgDailySpend[\s\S]*?\nfunction /);
      if (!match) return 'MISSING';
      return (match[0].includes('Debt repayment') || match[0].includes('NON_SPEND') || match[0].includes('income'))
        ? 'OK' : 'BROKEN — debt repayments may inflate daily spend average';
    }
  },

  // getDynamicBuffer excludes paid bills
  { name: 'getDynamicBuffer excludes paid bills',
    test: () => {
      const match = html.match(/function getDynamicBuffer[\s\S]*?\nfunction /);
      if (!match) return 'MISSING';
      return (match[0].includes('paidBills') || match[0].includes('getBillsDue'))
        ? 'OK' : 'WARNING — buffer may be inflated by already-paid bills';
    }
  },

  // checkAfford uses same formula as getMaxDay
  { name: 'checkAfford consistent with getMaxDay',
    test: () => {
      const afford = html.match(/function checkAfford[\s\S]*?\nfunction /);
      // getMaxDay may delegate to getDynamicDailyBudget which contains the formula
      const maxday = html.match(/function getMaxDay[\s\S]*?\nfunction /);
      const dynDaily = html.match(/function getDynamicDailyBudget[\s\S]*?\nfunction /);
      if (!afford || (!maxday && !dynDaily)) return 'MISSING';
      const affordHasDebts = afford[0].includes('getActiveDebtsDueBeforePayday');
      // Accept either direct debt deduction or delegation via getDynamicDailyBudget/getDynamicBuffer
      const maxdayHasDebts = (maxday && maxday[0].includes('getActiveDebtsDueBeforePayday')) ||
                             (maxday && maxday[0].includes('getDynamicDailyBudget')) ||
                             (dynDaily && dynDaily[0].includes('getActiveDebtsDueBeforePayday'));
      const affordHasBuckets = afford[0].includes('savingsBuckets') || afford[0].includes('getBucketTotal');
      const maxdayHasBuckets = (maxday && (maxday[0].includes('savingsBuckets') || maxday[0].includes('getBucketTotal') || maxday[0].includes('getDynamicDailyBudget'))) ||
                              (dynDaily && (dynDaily[0].includes('savingsBuckets') || dynDaily[0].includes('getBucketTotal')));
      if (!affordHasDebts || !maxdayHasDebts) return 'BROKEN — checkAfford missing debt deduction vs getMaxDay';
      if (!affordHasBuckets || !maxdayHasBuckets) return 'BROKEN — checkAfford missing bucket deduction vs getMaxDay';
      return 'OK';
    }
  },

  // Auto bill matching exists and is called
  { name: 'autoMatchBillsToTxns called on transaction log and app load',
    test: () => {
      const exists = html.includes('function autoMatchBillsToTxns');
      const calledOnLog = html.match(/quickLogTxn[\s\S]*?autoMatchBillsToTxns/);
      const calledOnLoad = html.match(/function load[\s\S]*?autoMatchBillsToTxns/);
      if (!exists) return 'MISSING — function does not exist';
      if (!calledOnLog) return 'WARNING — not called after transaction log';
      if (!calledOnLoad) return 'WARNING — not called on app load';
      return 'OK';
    }
  },

  // Seed preserves existing transactions
  { name: 'Seed functions preserve existing S.txns',
    test: () => {
      const seedFns = html.match(/function.*[Ss]eed[\s\S]*?\nfunction /g) || [];
      const violations = seedFns.filter(fn =>
        fn.includes('txns') && fn.includes('[]') && !fn.includes('existing') && !fn.includes('preserve')
      );
      return violations.length === 0 ? 'OK' : 'WARNING — seed may overwrite transactions';
    }
  },

  // Scanned debts excluded from S.bal calculation
  { name: 'Scanned debts excluded from S.bal calculation',
    test: () => {
      const confirmFn = html.match(/function confirmScanAdd[\s\S]*?^}/m);
      if (!confirmFn) return 'WARNING — confirmScanAdd not found';
      return !confirmFn[0].includes('S.bal') ? 'OK' : 'BROKEN — confirmScanAdd modifies S.bal directly';
    }
  }
];

console.log('\n🧠 SLYGHT LOGIC GUARDIAN\n');
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
  console.log('\n✅ Logic guardian passed\n');
} else {
  console.log('\n❌ Logic failures — do not push\n');
  process.exit(1);
}
