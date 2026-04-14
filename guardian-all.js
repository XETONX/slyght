const { execSync } = require('child_process');
const fs = require('fs');

const guardians = [
  { name: 'Core Guardian', file: 'guardian.js' },
  { name: 'Logic Guardian', file: 'guardian-logic.js' },
  { name: 'UI Guardian', file: 'guardian-ui.js' }
];

console.log('\n🛡️  SLYGHT MASTER GUARDIAN SUITE\n');
console.log('═'.repeat(60));

let totalFailed = 0;
const results = [];

guardians.forEach(g => {
  console.log('\nRunning ' + g.name + '...\n');
  try {
    const output = execSync('node ' + g.file + ' verify', { encoding: 'utf8' });
    console.log(output);
    results.push({ name: g.name, status: 'PASSED' });
  } catch (e) {
    console.log(e.stdout || e.message);
    results.push({ name: g.name, status: 'FAILED' });
    totalFailed++;
  }
});

console.log('═'.repeat(60));
console.log('\n📊 MASTER GUARDIAN SUMMARY\n');
results.forEach(r => {
  console.log((r.status === 'PASSED' ? '✅' : '❌') + '  ' + r.name + ': ' + r.status);
});

const timestamp = new Date().toLocaleString('en-AU', {timeZone: 'Australia/Sydney'});
console.log('\nLast run: ' + timestamp + ' AEST');

if (totalFailed === 0) {
  console.log('\n✅ ALL GUARDIANS PASSED — safe to push\n');
} else {
  console.log('\n❌ ' + totalFailed + ' GUARDIAN(S) FAILED — fix before pushing\n');
  process.exit(1);
}

// Save combined report
const report = '# SLYGHT Guardian Suite Report\n\nLast run: ' + timestamp + '\n\n' +
  results.map(r => '- ' + (r.status === 'PASSED' ? '✅' : '❌') + ' ' + r.name + ': ' + r.status).join('\n') +
  '\n\n## How to run\n```\nnode guardian-all.js\n```\n';
fs.writeFileSync('GUARDIAN.md', report);
