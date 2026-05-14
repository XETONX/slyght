// Verify Analysis "BREAKDOWN TO PAYDAY" now includes Rent + Deposit Savings.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'state-snapshot.json'), 'utf8'));
  const seed = { S: fixture.S || fixture, BILLS: fixture.BILLS || [] };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await ctx.addInitScript((args) => {
    if (!localStorage.getItem('slyght_v5')) {
      localStorage.setItem('slyght_v5', JSON.stringify(args.seed));
    }
    localStorage.setItem('slyght_payday_canvas_seen', '1');
  }, { seed });

  await page.goto('http://localhost:4567/slyght/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { if (typeof splashTap === 'function') splashTap(); });
  await page.waitForTimeout(800);

  const compare = await page.evaluate(() => {
    // Plan mode's bills (canonical)
    const snap = BRAIN.plan.getSnapshot();
    // Analysis's breakdown
    const forecast = (typeof getSurvivalForecast === 'function') ? getSurvivalForecast() : null;
    // All this-cycle bills with paid flag
    const cycleBills = BRAIN.bills.getThisCycle();
    return {
      planMode: {
        billsTotal: snap.bills.total,
        billsCount: snap.bills.items,
        billsPaid: snap.bills.paid,
      },
      analysis: forecast ? {
        upcomingBillsTotal: forecast.upcomingBillsTotal,
        upcomingBills: (forecast.upcomingBills || []).map(b => ({ name: b.name, amt: b.amt, day: b.day })),
      } : 'getSurvivalForecast not available',
      allCycleBills: cycleBills.map(b => ({ name: b.name, amt: b.amt, day: b.day, paid: b.paid })),
      rentBill: cycleBills.find(b => /Rent/i.test(b.name)),
    };
  });

  console.log('=== Comparison ===');
  console.log('Plan mode bills.total:', '$' + compare.planMode.billsTotal);
  console.log('Plan mode bills count:', compare.planMode.billsCount, '(paid:', compare.planMode.billsPaid + ')');
  console.log('');
  console.log('Analysis upcomingBillsTotal:', '$' + (compare.analysis.upcomingBillsTotal || 'N/A'));
  console.log('Analysis upcoming bills count:', (compare.analysis.upcomingBills || []).length);
  console.log('');
  console.log('Rent + Deposit Savings:', compare.rentBill ? `day ${compare.rentBill.day}, $${compare.rentBill.amt}, paid=${compare.rentBill.paid}` : 'NOT FOUND');
  console.log('');
  console.log('Rent in analysis upcoming?', (compare.analysis.upcomingBills || []).find(b => /Rent/i.test(b.name)) ? 'YES ✓' : 'NO ❌');
  console.log('');
  console.log('All analysis upcoming bills:');
  (compare.analysis.upcomingBills || []).forEach(b => console.log(`  day ${String(b.day).padStart(2)}  $${String(b.amt).padStart(8)}  ${b.name}`));

  await browser.close();
})();
