const fs = require('fs');

const captureCode = `
(function() {
  const raw = JSON.parse(localStorage.getItem('slyght_v5') || '{}');
  const state = {
    capturedAt: new Date().toISOString(),
    S: raw.S || {},
    BILLS: raw.BILLS || [],
    paidBills: raw.S?.paidBills || {},
    notifications: raw.S?.notifications || [],
    auditLog: JSON.parse(localStorage.getItem('slyght_audit_log') || '[]'),
    apiCosts: JSON.parse(localStorage.getItem('slyght_api_costs') || '[]'),
    snapshots: JSON.parse(localStorage.getItem('slyght_snapshots') || '[]').length,
    uxReport: JSON.parse(localStorage.getItem('slyght_ux_report') || '{}'),
    chatHistoryCount: (raw.S?.chatHistory || []).length,
    apiKeySet: !!localStorage.getItem('slyght_api_key'),
    allLocalStorageKeys: Object.keys(localStorage)
  };

  // Strip sensitive data
  if (state.S) {
    delete state.S.apiKey;
    delete state.S.pin;
    delete state.S.pinHash;
    delete state.S.chatHistory;
    delete state.S._prevState;
  }

  const json = JSON.stringify(state, null, 2);

  // Try to download automatically
  try {
    const blob = new Blob([json], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'slyght-state-' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('Downloaded state file');
  } catch(e) {}

  console.log('=== SLYGHT STATE START ===');
  console.log(json);
  console.log('=== SLYGHT STATE END ===');
  return 'State captured';
})();
`;

console.log('\n📸 SLYGHT STATE CAPTURE INSTRUCTIONS\n');
console.log('Step 1: Open SLYGHT at xetonx.github.io/slyght in Chrome');
console.log('Step 2: Press F12 to open DevTools');
console.log('Step 3: Click the Console tab');
console.log('Step 4: Paste and run the code below');
console.log('Step 5: Save the downloaded JSON as state-snapshot.json in C:\\Users\\admin\\slyght\\');
console.log('Step 6: Run: node guardian-runtime.js\n');
console.log('─'.repeat(70));
console.log(captureCode);
console.log('─'.repeat(70));
