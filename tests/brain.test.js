// SLYGHT BRAIN canonical-writer contract tests
// Run with: node tests/brain.test.js
//
// Locks the result envelope shape settled in Bundle 13 + the canonical
// writer/reader contracts established in Bundles 8 (savings/audit),
// 10 (dashboard), 11 (transaction + SOURCES). Without these tests the
// envelope contract drifts silently as new bubbles seed.

// ── Mock Date (April 29, 2026 — weekday) ────────────────
const TEST_TIMESTAMP = new Date(2026, 3, 29).getTime();
const OrigDate = Date;
global.Date = class extends OrigDate {
  constructor(...args) {
    if (args.length === 0) { super(TEST_TIMESTAMP); return; }
    super(...args);
  }
  static now() { return TEST_TIMESTAMP; }
};

// ── Mock S + reset helper ───────────────────────────────
let S = {};
function resetS() {
  S = {
    bal: 500,
    txns: [],
    savingsBuckets: [
      { name: 'China Holiday', goal: 4000, saved: 100, account: 'ING' },
      { name: 'Rainy Day Fund', goal: 2000, saved: 50, account: 'ING' }
    ],
    paidBills: {},
    _auditLog: []
  };
}

// Mock save (no-op — tests don't persist)
function save() {}

// Canonical helpers required by BRAIN.dashboard
const _NON_SPEND_CATS = new Set(['Debt repayment','Income','Savings','Bills','Transfer','Loan','Car Loan','CC Payment']);

function computeSpentInRange(fromTs, toTs) {
  return (S.txns||[]).filter(t =>
    t.ts >= fromTs && t.ts <= toTs &&
    !t.income && !_NON_SPEND_CATS.has(t.cat) &&
    !t._isCorrection && !t._isRoundup
  ).reduce((s,t) => s+t.amt, 0);
}
function computeSpentToday(now) {
  const start = new Date(now || Date.now()); start.setHours(0,0,0,0);
  return computeSpentInRange(start.getTime(), Date.now());
}
function todayTxnsCanonical(now) {
  const ref = new Date(now || Date.now()); ref.setHours(0,0,0,0);
  const start = ref.getTime();
  return (S.txns || []).filter(t =>
    t.ts >= start &&
    !t.income && !_NON_SPEND_CATS.has(t.cat) &&
    !t._isCorrection && !t._isRoundup
  );
}

const MODEL = { cycleSpent: 0, weekSpent: 0 };

// ── BRAIN object (verbatim from index.html post-Bundle-13) ─
const BRAIN = {
  SOURCES: Object.freeze({
    ROUNDUP:         'roundup',
    UNDO_ROUNDUP:    'undo-roundup',
    PLAN_ADD:        'plan-add',
    PLAN_EDIT:       'plan-edit',
    MANUAL:          'manual',
    RECONCILE:       'reconcile',
    MIGRATION:       'migration',
    CHAT:            'chat',
    LOG_EXPENSE:     'log-expense',
    LOG_INCOME:      'log-income',
    LOG_FROM_PERSON: 'log-from-person',
    PAY_BILL_NOW:    'pay-bill-now',
    MARK_BILL_PAID:  'mark-bill-paid',
    BUCKET_QUICK_ADD: 'bucket-quick-add',
  }),
  _SOURCE_SET: new Set([
    'roundup', 'undo-roundup', 'plan-add', 'plan-edit', 'manual',
    'reconcile', 'migration', 'chat',
    'log-expense', 'log-income', 'log-from-person', 'pay-bill-now',
    'mark-bill-paid', 'bucket-quick-add',
  ]),
  audit: {
    append(entry) {
      if (!S._auditLog) S._auditLog = [];
      S._auditLog.push(entry);
      if (S._auditLog.length > 500) S._auditLog = S._auditLog.slice(-500);
    },
    recent(n) { return (S._auditLog || []).slice(-(n || 20)); }
  },
  savings: {
    setBucketSaved(bucketName, newValue, source) {
      if (!source || !BRAIN._SOURCE_SET.has(source)) {
        return { ok: false, reason: 'unknown-source:' + source };
      }
      if (!S.savingsBuckets) S.savingsBuckets = [];
      const bucket = S.savingsBuckets.find(b => b.name === bucketName);
      if (!bucket) return { ok: false, reason: 'no-bucket', bucketName };
      const safeNew = parseFloat(Number(newValue).toFixed(2));
      if (isNaN(safeNew)) return { ok: false, reason: 'invalid-value', value: newValue };
      const oldValue = bucket.saved || 0;
      bucket.saved = safeNew;
      const delta = parseFloat((safeNew - oldValue).toFixed(2));
      BRAIN.audit.append({
        type: 'bucket_saved_change',
        bucket: bucketName, oldValue, newValue: safeNew, delta,
        source, ts: Date.now()
      });
      try { save(); } catch(_) {}
      return { ok: true, bucket: bucketName, oldValue, newValue: safeNew, delta };
    },
    addToBucket(bucketName, delta, source) {
      const bucket = (S.savingsBuckets || []).find(b => b.name === bucketName);
      if (!bucket) return { ok: false, reason: 'no-bucket', bucketName };
      return this.setBucketSaved(bucketName, (bucket.saved || 0) + delta, source);
    }
  },
  dashboard: {
    todaySpend(now) { return (typeof computeSpentToday === 'function') ? computeSpentToday(now) : 0; },
    todayTxns(now) { return (typeof todayTxnsCanonical === 'function') ? todayTxnsCanonical(now) : []; },
    cycleSpend() { return (typeof MODEL !== 'undefined' && MODEL && typeof MODEL.cycleSpent === 'number') ? MODEL.cycleSpent : 0; },
    weekSpend() { return (typeof MODEL !== 'undefined' && MODEL && typeof MODEL.weekSpent === 'number') ? MODEL.weekSpent : 0; }
  },
  transaction: {
    record(txn, source) {
      if (!source || !BRAIN._SOURCE_SET.has(source)) {
        return { ok: false, reason: 'unknown-source:' + source };
      }
      if (!txn || typeof txn.amt !== 'number' || isNaN(txn.amt) || txn.amt < 0) {
        return { ok: false, reason: 'invalid-amt' };
      }
      if (!Array.isArray(S.txns)) S.txns = [];
      const ts = txn.ts || Date.now();
      const finalTxn = { ...txn, ts };
      S.txns.push(finalTxn);
      BRAIN.audit.append({
        type: 'txn_record',
        amt: finalTxn.amt, cat: finalTxn.cat || null,
        note: finalTxn.note || null, income: !!finalTxn.income,
        roundup: !!finalTxn._isRoundup, source,
        ts: Date.now(), txnTs: ts
      });
      try { save(); } catch(_) {}
      return { ok: true, txn: finalTxn, ts };
    },
    findByTs(ts) { return (S.txns || []).find(t => t.ts === ts); },
    removeByTs(ts) {
      if (!Array.isArray(S.txns)) return { ok: false, reason: 'no-txns' };
      const idx = S.txns.findIndex(t => t.ts === ts);
      if (idx < 0) return { ok: false, reason: 'not-found' };
      const removed = S.txns.splice(idx, 1)[0];
      BRAIN.audit.append({ type: 'txn_remove', amt: removed.amt, ts: Date.now(), txnTs: ts });
      try { save(); } catch(_) {}
      return { ok: true, removed };
    },
    list(predicate) {
      const txns = S.txns || [];
      return predicate ? txns.filter(predicate) : txns;
    }
  }
};

// ── Test framework (matches tests/core.test.js style) ───
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('✅ ' + name); passed++; }
  catch (e) { console.log('❌ ' + name + ' — ' + e.message); failed++; }
}
function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error('expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error('expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    },
    toBeTruthy() {
      if (!actual) throw new Error('expected truthy, got ' + JSON.stringify(actual));
    },
    toBeFalsy() {
      if (actual) throw new Error('expected falsy, got ' + JSON.stringify(actual));
    }
  };
}

// ── BRAIN.savings ───────────────────────────────────────
test('savings.setBucketSaved: valid call returns ok envelope with payload', () => {
  resetS();
  const r = BRAIN.savings.setBucketSaved('China Holiday', 200, BRAIN.SOURCES.MANUAL);
  expect(r.ok).toBe(true);
  expect(r.bucket).toBe('China Holiday');
  expect(r.oldValue).toBe(100);
  expect(r.newValue).toBe(200);
  expect(r.delta).toBe(100);
});

test('savings.setBucketSaved: mutation is actually applied to S', () => {
  resetS();
  BRAIN.savings.setBucketSaved('China Holiday', 250, BRAIN.SOURCES.PLAN_ADD);
  const bucket = S.savingsBuckets.find(b => b.name === 'China Holiday');
  expect(bucket.saved).toBe(250);
});

test('savings.setBucketSaved: unknown source rejected, no mutation', () => {
  resetS();
  // Typo: underscore instead of dash
  const r = BRAIN.savings.setBucketSaved('China Holiday', 200, 'plan_add');
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('unknown-source:plan_add');
  const bucket = S.savingsBuckets.find(b => b.name === 'China Holiday');
  expect(bucket.saved).toBe(100); // unchanged
});

test('savings.setBucketSaved: missing bucket rejected with bucketName payload', () => {
  resetS();
  const r = BRAIN.savings.setBucketSaved('Phantom Bucket', 200, BRAIN.SOURCES.MANUAL);
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('no-bucket');
  expect(r.bucketName).toBe('Phantom Bucket');
});

test('savings.setBucketSaved: NaN value rejected', () => {
  resetS();
  const r = BRAIN.savings.setBucketSaved('China Holiday', 'abc', BRAIN.SOURCES.MANUAL);
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('invalid-value');
});

test('savings.setBucketSaved: appends bucket_saved_change to audit log', () => {
  resetS();
  BRAIN.savings.setBucketSaved('China Holiday', 200, BRAIN.SOURCES.ROUNDUP);
  const last = S._auditLog[S._auditLog.length - 1];
  expect(last.type).toBe('bucket_saved_change');
  expect(last.bucket).toBe('China Holiday');
  expect(last.source).toBe('roundup');
  expect(last.oldValue).toBe(100);
  expect(last.newValue).toBe(200);
  expect(last.delta).toBe(100);
});

test('savings.setBucketSaved: rounds to 2dp', () => {
  resetS();
  const r = BRAIN.savings.setBucketSaved('China Holiday', 123.456789, BRAIN.SOURCES.MANUAL);
  expect(r.newValue).toBe(123.46);
});

test('savings.addToBucket: increments by delta', () => {
  resetS();
  const r = BRAIN.savings.addToBucket('Rainy Day Fund', 25, BRAIN.SOURCES.MANUAL);
  expect(r.ok).toBe(true);
  expect(r.newValue).toBe(75); // 50 + 25
  expect(r.delta).toBe(25);
});

test('savings.addToBucket: missing bucket returns envelope (no setBucketSaved call)', () => {
  resetS();
  const r = BRAIN.savings.addToBucket('Phantom', 10, BRAIN.SOURCES.MANUAL);
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('no-bucket');
});

test('savings.addToBucket: unknown source rejected (propagates from setBucketSaved)', () => {
  resetS();
  const r = BRAIN.savings.addToBucket('China Holiday', 10, 'bogus-source');
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('unknown-source:bogus-source');
});

// ── Composition-failure invariant (Bundle 14+ abort-on-inner-failure) ───
test('composition: setBucketSaved with unknown source aborts and returns failure envelope (no mutation)', () => {
  resetS();
  const result = BRAIN.savings.setBucketSaved('China Holiday', 9999, 'totally-bogus-source');
  expect(result.ok).toBe(false);
  expect(result.reason).toBe('unknown-source:totally-bogus-source');
  const bucket = S.savingsBuckets.find(b => b.name === 'China Holiday');
  // Critical: source rejection must abort BEFORE the write. Bundle 14
  // composition (BRAIN.bills.markPaid -> BRAIN.transaction.record) relies
  // on this invariant — if the inner write rejected its source AFTER
  // already mutating, the outer couldn't safely abort and roll back.
  expect(bucket.saved).toBe(100); // unchanged from resetS() default
});

// ── BRAIN.transaction ───────────────────────────────────
test('transaction.record: valid call returns ok envelope with ts', () => {
  resetS();
  const r = BRAIN.transaction.record({ amt: 10, note: 'test', cat: 'Food' }, BRAIN.SOURCES.LOG_EXPENSE);
  expect(r.ok).toBe(true);
  expect(typeof r.ts).toBe('number');
  expect(r.txn.amt).toBe(10);
  expect(S.txns.length).toBe(1);
});

test('transaction.record: pre-set ts is preserved (back-ref consistency)', () => {
  resetS();
  const r = BRAIN.transaction.record({ amt: 10, ts: 12345, note: 'test' }, BRAIN.SOURCES.LOG_EXPENSE);
  expect(r.ts).toBe(12345);
  expect(r.txn.ts).toBe(12345);
});

test('transaction.record: unknown source rejected, no push', () => {
  resetS();
  const r = BRAIN.transaction.record({ amt: 10 }, 'expense'); // not a real tag
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('unknown-source:expense');
  expect(S.txns.length).toBe(0);
});

test('transaction.record: invalid amt rejected', () => {
  resetS();
  const r = BRAIN.transaction.record({ amt: NaN }, BRAIN.SOURCES.LOG_EXPENSE);
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('invalid-amt');
  expect(S.txns.length).toBe(0);
});

test('transaction.record: negative amt rejected', () => {
  resetS();
  const r = BRAIN.transaction.record({ amt: -5 }, BRAIN.SOURCES.LOG_EXPENSE);
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('invalid-amt');
});

test('transaction.record: missing amt rejected', () => {
  resetS();
  const r = BRAIN.transaction.record({ note: 'no amount' }, BRAIN.SOURCES.LOG_EXPENSE);
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('invalid-amt');
});

test('transaction.record: appends txn_record to audit log with source + txnTs', () => {
  resetS();
  const r = BRAIN.transaction.record({ amt: 15, cat: 'Food', note: 'lunch' }, BRAIN.SOURCES.LOG_EXPENSE);
  const last = S._auditLog[S._auditLog.length - 1];
  expect(last.type).toBe('txn_record');
  expect(last.source).toBe('log-expense');
  expect(last.txnTs).toBe(r.ts);
  expect(last.amt).toBe(15);
});

test('transaction.findByTs: round-trips via the ts from record()', () => {
  resetS();
  const r = BRAIN.transaction.record({ amt: 25, note: 'lunch' }, BRAIN.SOURCES.LOG_EXPENSE);
  const found = BRAIN.transaction.findByTs(r.ts);
  expect(found.amt).toBe(25);
  expect(found.note).toBe('lunch');
});

test('transaction.findByTs: missing ts returns undefined (not error)', () => {
  resetS();
  const found = BRAIN.transaction.findByTs(99999);
  expect(found).toBe(undefined);
});

test('transaction.removeByTs: removes correct txn, leaves others', () => {
  resetS();
  const r1 = BRAIN.transaction.record({ amt: 10 }, BRAIN.SOURCES.LOG_EXPENSE);
  // bump ts so they're distinguishable
  const r2 = BRAIN.transaction.record({ amt: 20, ts: r1.ts + 1 }, BRAIN.SOURCES.LOG_EXPENSE);
  const rem = BRAIN.transaction.removeByTs(r1.ts);
  expect(rem.ok).toBe(true);
  expect(rem.removed.amt).toBe(10);
  expect(S.txns.length).toBe(1);
  expect(S.txns[0].amt).toBe(20);
});

test('transaction.removeByTs: missing ts returns envelope (not-found)', () => {
  resetS();
  const r = BRAIN.transaction.removeByTs(99999);
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('not-found');
});

test('transaction.list: no predicate returns full list', () => {
  resetS();
  BRAIN.transaction.record({ amt: 10 }, BRAIN.SOURCES.LOG_EXPENSE);
  BRAIN.transaction.record({ amt: 20, ts: Date.now() + 1 }, BRAIN.SOURCES.LOG_EXPENSE);
  expect(BRAIN.transaction.list().length).toBe(2);
});

test('transaction.list: predicate filters correctly', () => {
  resetS();
  BRAIN.transaction.record({ amt: 10, cat: 'Food' }, BRAIN.SOURCES.LOG_EXPENSE);
  BRAIN.transaction.record({ amt: 20, cat: 'Bills', ts: Date.now() + 1 }, BRAIN.SOURCES.LOG_EXPENSE);
  const food = BRAIN.transaction.list(t => t.cat === 'Food');
  expect(food.length).toBe(1);
  expect(food[0].amt).toBe(10);
});

// ── BRAIN.dashboard ─────────────────────────────────────
test('dashboard.todaySpend: matches canonical filter (excludes Bills, roundups, corrections)', () => {
  resetS();
  S.txns.push({ amt: 15, cat: 'Food', ts: Date.now() });
  S.txns.push({ amt: 20, cat: 'Bills', ts: Date.now() });                  // excluded (non-spend cat)
  S.txns.push({ amt: 5, cat: 'Coffee', ts: Date.now(), _isRoundup: true }); // excluded (roundup)
  S.txns.push({ amt: 10, cat: 'Other', ts: Date.now(), _isCorrection: true }); // excluded
  S.txns.push({ amt: 100, cat: 'Income', ts: Date.now(), income: true });  // excluded
  expect(BRAIN.dashboard.todaySpend()).toBe(15);
});

test('dashboard.todayTxns: returns array, same filter as todaySpend', () => {
  resetS();
  S.txns.push({ amt: 15, cat: 'Food', ts: Date.now() });
  S.txns.push({ amt: 20, cat: 'Bills', ts: Date.now() });
  const txns = BRAIN.dashboard.todayTxns();
  expect(txns.length).toBe(1);
  expect(txns[0].cat).toBe('Food');
});

test('dashboard.cycleSpend: delegates to MODEL.cycleSpent', () => {
  MODEL.cycleSpent = 350;
  expect(BRAIN.dashboard.cycleSpend()).toBe(350);
  MODEL.cycleSpent = 0;
});

test('dashboard.weekSpend: delegates to MODEL.weekSpent', () => {
  MODEL.weekSpent = 120;
  expect(BRAIN.dashboard.weekSpend()).toBe(120);
  MODEL.weekSpent = 0;
});

// ── BRAIN.audit ─────────────────────────────────────────
test('audit.append + recent: round-trip works', () => {
  resetS();
  BRAIN.audit.append({ type: 'test', value: 1 });
  BRAIN.audit.append({ type: 'test', value: 2 });
  const recent = BRAIN.audit.recent();
  expect(recent.length).toBe(2);
  expect(recent[1].value).toBe(2);
});

test('audit.append: caps at 500 entries (drops oldest)', () => {
  resetS();
  for (let i = 0; i < 510; i++) BRAIN.audit.append({ type: 'test', value: i });
  expect(S._auditLog.length).toBe(500);
  // First should now be value 10 (oldest 10 dropped)
  expect(S._auditLog[0].value).toBe(10);
});

test('audit.recent: respects n parameter', () => {
  resetS();
  for (let i = 0; i < 30; i++) BRAIN.audit.append({ type: 'test', value: i });
  const last5 = BRAIN.audit.recent(5);
  expect(last5.length).toBe(5);
  expect(last5[4].value).toBe(29);
});

// ── BRAIN.SOURCES ───────────────────────────────────────
test('SOURCES: every enum value is in _SOURCE_SET', () => {
  for (const key in BRAIN.SOURCES) {
    const value = BRAIN.SOURCES[key];
    if (!BRAIN._SOURCE_SET.has(value)) {
      throw new Error('SOURCES.' + key + ' = ' + value + ' missing from _SOURCE_SET');
    }
  }
  // sanity
  expect(true).toBe(true);
});

test('SOURCES: frozen (write attempts silently fail or throw)', () => {
  try {
    BRAIN.SOURCES.NEW_TAG = 'new-tag';
  } catch (_) {
    // strict mode throws — acceptable
  }
  // In sloppy mode the write silently fails; either way the new key is undefined
  expect(BRAIN.SOURCES.NEW_TAG).toBe(undefined);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
