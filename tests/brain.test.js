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
    debts: [
      { id: 1, name: 'Owed to Mum', amt: 5000, rate: 0, paid: false, viaRent: true },
      { id: 2, name: 'Pet Insurance', amt: 120, rate: 0, paid: false, delayDate: '2026-05-01' },
      { id: 3, name: 'Afterpay', amt: 50, rate: 0, paid: false }
    ],
    nextDebtId: 4,
    _auditLog: [],
    _billUnmarkLog: {},
    _invariantViolationCounts: {}
  };
}

// ── Mock BILLS array (used by BRAIN.bills.autoMatch / autoDetect) ──
const BILLS = [
  { name: 'YouTube Premium', amt: 16.99, day: 18, tag: 'Streaming', recurring: true },
  { name: 'Spotify', amt: 15.99, day: 28, tag: 'Streaming', recurring: true },
  { name: 'Rent', amt: 3000, day: 15, tag: 'Fixed', recurring: true }
];

// ── Canonical key helper (verbatim from index.html) ─────
function paidBillKey(billName, billDay, month, year) {
  const now = new Date();
  const y = (year !== undefined) ? year : now.getFullYear();
  const m = (month !== undefined) ? month + 1 : now.getMonth() + 1;
  return y + '-' + m + '-' + billName + '-' + billDay;
}

// Free-function readers (BRAIN.bills.isPaid / isAutoDebit delegate
// to these in production for TDZ safety during boot-time reads).
function isPaidBillKeyTruthy(key) {
  if (!S.paidBills) return false;
  const v = S.paidBills[key];
  return v === true || (v && v.paid === true);
}
function isPaidBillAutoDebit(key) {
  if (!S.paidBills) return false;
  const v = S.paidBills[key];
  return !!(v && typeof v === 'object' && v._scheduledAutoDebit);
}
function isThisMonthlyBillPaid(billName, billDay) {
  return isPaidBillKeyTruthy(paidBillKey(billName, billDay));
}

// Stubs for the showToast / showUndoToast functions BRAIN.bills.autoMatch / autoDetect call.
function showToast() {}
function showUndoToast() {}

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
    UNMARK_BILL:     'unmark-bill',
    AUTO_MATCH:      'auto-match',
    AUTO_DETECT:     'auto-detect',
    ADD_DEBT:        'add-debt',
    CLEAR_DEBT:      'clear-debt',
    UNMARK_DEBT:     'unmark-debt',
    UPDATE_DEBT:     'update-debt',
    DELETE_DEBT:     'delete-debt',
    WRX_ALLOCATE:    'wrx-allocate',
    RECONCILE_CORRECTION: 'reconcile-correction',
  }),
  _SOURCE_SET: new Set([
    'roundup', 'undo-roundup', 'plan-add', 'plan-edit', 'manual',
    'reconcile', 'migration', 'chat',
    'log-expense', 'log-income', 'log-from-person', 'pay-bill-now',
    'mark-bill-paid', 'bucket-quick-add',
    'unmark-bill', 'auto-match', 'auto-detect',
    'add-debt', 'clear-debt', 'unmark-debt', 'update-debt',
    'delete-debt', 'wrx-allocate', 'reconcile-correction',
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
    },
    // Bundle 15
    recordCorrection(diff, reason) {
      if (typeof diff !== 'number' || isNaN(diff)) {
        return { ok: false, reason: 'invalid-diff' };
      }
      return this.record({
        amt: Math.abs(diff),
        note: reason || 'Balance correction',
        cat: diff > 0 ? 'Income' : 'Adjustment',
        income: diff > 0,
        _balAffected: true,
        _isCorrection: true
      }, BRAIN.SOURCES.RECONCILE_CORRECTION);
    }
  },

  // BRAIN.bills (Bundle 14) — verbatim copy from index.html for test
  // surface. STRICT-on-CREATE / LENIENT-on-DESTROY composition per spec v1.3.
  bills: {
    _pendingPay: null,
    setPendingPay(key, opts) {
      this._pendingPay = { key, autoDebit: !!(opts && opts.autoDebit) };
    },
    clearPendingPay() { this._pendingPay = null; },
    consumePendingPay(txnTs) {
      if (!this._pendingPay) return { ok: false, reason: 'no-pending-pay' };
      const ctx = this._pendingPay;
      this._pendingPay = null;
      return this._setPaidEntry(ctx.key, {
        autoDebit: ctx.autoDebit, txnTs, source: BRAIN.SOURCES.MARK_BILL_PAID
      });
    },
    markPaid(bill, source, options) {
      if (!source || !BRAIN._SOURCE_SET.has(source)) {
        return { ok: false, reason: 'unknown-source:' + source };
      }
      if (!bill || !bill.name || typeof bill.day !== 'number') {
        return { ok: false, reason: 'invalid-bill' };
      }
      const opts = options || {};
      const key = paidBillKey(bill.name, bill.day);
      let txnTs;
      let autoDebit = !!opts.autoDebit;
      if (typeof opts.txnTs === 'number') {
        const linked = BRAIN.transaction.findByTs(opts.txnTs);
        if (!linked) return { ok: false, reason: 'linked-txn-missing', txnTs: opts.txnTs };
        txnTs = opts.txnTs;
        const now = new Date();
        if (bill.day > now.getDate()) autoDebit = true;
      } else {
        const billAmt = (typeof bill.amt === 'number') ? bill.amt : 0;
        const txnSource = (source === BRAIN.SOURCES.PAY_BILL_NOW)
          ? BRAIN.SOURCES.PAY_BILL_NOW : BRAIN.SOURCES.MARK_BILL_PAID;
        const rec = BRAIN.transaction.record(
          { amt: billAmt, note: bill.name + ' paid', cat: bill.tag || 'Bills', income: false, _balAffected: true },
          txnSource
        );
        if (!rec.ok) return { ok: false, reason: 'inner-' + rec.reason };
        txnTs = rec.ts;
      }
      return this._setPaidEntry(key, { autoDebit, txnTs, source });
    },
    _setPaidEntry(key, ctx) {
      if (!S.paidBills) S.paidBills = {};
      S.paidBills[key] = ctx.autoDebit
        ? { paid: true, _scheduledAutoDebit: true, ts: ctx.txnTs, _txnTs: ctx.txnTs }
        : { paid: true, ts: ctx.txnTs, _txnTs: ctx.txnTs };
      BRAIN.audit.append({
        type: 'bill_mark_paid', key, autoDebit: ctx.autoDebit,
        txnTs: ctx.txnTs, source: ctx.source, ts: Date.now()
      });
      try { save(); } catch(_) {}
      return { ok: true, key, entry: S.paidBills[key] };
    },
    unmark(key, source) {
      if (!source) source = BRAIN.SOURCES.UNMARK_BILL;
      if (!BRAIN._SOURCE_SET.has(source)) {
        return { ok: false, reason: 'unknown-source:' + source };
      }
      if (!S.paidBills || !S.paidBills[key]) {
        return { ok: false, reason: 'not-paid', key };
      }
      const entry = S.paidBills[key];
      const txnTs = (entry && typeof entry === 'object') ? entry._txnTs : null;
      let txnReversed = false;
      if (txnTs) {
        const removed = BRAIN.transaction.removeByTs(txnTs);
        if (!removed.ok) {
          if (removed.reason === 'not-found' || removed.reason === 'no-txns') {
            // LENIENT — proceed.
          } else {
            return { ok: false, reason: 'inner-' + removed.reason };
          }
        } else {
          const t = removed.removed;
          if (t && t._balAffected) {
            if (t.income) S.bal -= (t.amt || 0);
            else S.bal += (t.amt || 0);
            S.bal = parseFloat(S.bal.toFixed(2));
          }
          txnReversed = true;
        }
      }
      if (!S._billUnmarkLog) S._billUnmarkLog = {};
      S._billUnmarkLog[key] = Date.now();
      delete S.paidBills[key];
      if (S._invariantViolationCounts) {
        S._invariantViolationCounts['paidbills-key-not-future'] = { count: 0, firstSeenTs: Date.now() };
      }
      BRAIN.audit.append({
        type: 'bill_unmark', key, txnReversed, source, ts: Date.now()
      });
      try { save(); } catch(_) {}
      return { ok: true, key, txnReversed };
    },
    isPaid(key) { return isPaidBillKeyTruthy(key); },
    isAutoDebit(key) { return isPaidBillAutoDebit(key); },
    dueBeforePayday() { return []; }, // simplified for tests
    autoMatch(opts) {
      const silent = !!(opts && opts.silent);
      const now = new Date();
      const todayStr = now.toDateString();
      const todayM = now.getMonth(), todayY = now.getFullYear();
      const todayTxns = (S.txns || []).filter(t => new Date(t.ts).toDateString() === todayStr);
      const matched = [];
      (BILLS || []).filter(b => b.recurring !== false).forEach(b => {
        if (this.isPaid(paidBillKey(b.name, b.day))) return;
        if (this._isRecentlyUnmarked(b.name, b.day, todayM, todayY)) return;
        const matchTxn = todayTxns.find(t => this._txnMatches(t, b));
        if (!matchTxn) return;
        const r = this.markPaid(b, BRAIN.SOURCES.AUTO_MATCH, { txnTs: matchTxn.ts });
        if (r.ok) matched.push(b.name);
      });
      return { ok: true, matched };
    },
    autoDetect() {
      const now = new Date();
      const todayM = now.getMonth(), todayY = now.getFullYear();
      const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
      const recentTxns = (S.txns || []).filter(t => !t.income && t.ts >= sevenDaysAgo);
      const detected = [];
      (BILLS || []).filter(b => b.recurring !== false).forEach(b => {
        if (this.isPaid(paidBillKey(b.name, b.day))) return;
        if (this._isRecentlyUnmarked(b.name, b.day, todayM, todayY)) return;
        const matchTxn = recentTxns.find(t => this._txnMatches(t, b));
        if (!matchTxn) return;
        const r = this.markPaid(b, BRAIN.SOURCES.AUTO_DETECT, { txnTs: matchTxn.ts });
        if (r.ok) detected.push(b.name);
      });
      return { ok: true, detected };
    },
    _txnMatches(t, b) {
      if (t.income || t._isRoundup || t._isCorrection) return false;
      const amt = b.amt || 0;
      const tolerance = amt <= 20 ? 0.50 : 1.00;
      if (Math.abs((t.amt || 0) - amt) > tolerance) return false;
      const keyword = (b.name || '').toLowerCase().split(/[\s\-]+/)
        .filter(w => w.length >= 4)
        .sort((a, x) => x.length - a.length)[0];
      if (!keyword) return false;
      return ((t.note || '').toLowerCase()).indexOf(keyword) >= 0;
    },
    _isRecentlyUnmarked(billName, billDay, m, y) {
      const log = S._billUnmarkLog;
      if (!log) return false;
      const key = paidBillKey(billName, billDay, m, y);
      const ts = log[key];
      if (!ts) return false;
      if (Date.now() - ts > 30 * 86400000) { delete log[key]; return false; }
      return true;
    },
    invariants: {
      checkFutureKeyNotPaid() {
        const now = new Date();
        const todayY = now.getFullYear(), todayM = now.getMonth(), todayD = now.getDate();
        const future = Object.keys(S.paidBills || {}).filter(k => {
          if (BRAIN.bills.isAutoDebit(k)) return false;
          const m2 = k.match(/^(\d{4})-(\d{1,2})-.*-(\d{1,2})$/);
          if (!m2) return false;
          const y = +m2[1], mo = +m2[2]-1, d = +m2[3];
          if (y > todayY) return true;
          if (y === todayY && mo > todayM) return true;
          if (y === todayY && mo === todayM && d > todayD) return true;
          return false;
        });
        if (future.length === 0) return null;
        return { displayValue: future.length + ' bill(s)', keys: future };
      }
    }
  },

  // BRAIN.debts (Bundle 15) — verbatim from index.html.
  debts: {
    add(debt, source) {
      if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source:' + source };
      if (!debt || typeof debt.name !== 'string' || !debt.name.trim()) return { ok: false, reason: 'invalid-name' };
      if (typeof debt.amt !== 'number' || isNaN(debt.amt) || debt.amt <= 0) return { ok: false, reason: 'invalid-amt' };
      if (!Array.isArray(S.debts)) S.debts = [];
      if (!S.nextDebtId) S.nextDebtId = S.debts.length;
      if (S.debts.length) {
        const _maxId = Math.max(...S.debts.map(d => d.id || 0));
        if (S.nextDebtId <= _maxId) S.nextDebtId = _maxId + 1;
      }
      const newDebt = Object.assign({ id: S.nextDebtId++, rate: 0, paid: false, delayed: false }, debt);
      S.debts.push(newDebt);
      BRAIN.audit.append({ type: 'debt_add', id: newDebt.id, name: newDebt.name, amt: newDebt.amt, source, ts: Date.now() });
      try { save(); } catch(_) {}
      return { ok: true, debt: newDebt, id: newDebt.id };
    },
    markPaid(id, source) {
      if (!source || !BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source:' + source };
      const debt = (S.debts || []).find(d => d.id === id);
      if (!debt) return { ok: false, reason: 'debt-not-found', id };
      if (debt.paid) return { ok: false, reason: 'already-paid', id };
      const rec = BRAIN.transaction.record(
        { amt: debt.amt, note: debt.name + ' cleared', cat: 'Debt repayment', income: false, _balAffected: true },
        source === BRAIN.SOURCES.WRX_ALLOCATE ? BRAIN.SOURCES.WRX_ALLOCATE : BRAIN.SOURCES.CLEAR_DEBT
      );
      if (!rec.ok) return { ok: false, reason: 'inner-' + rec.reason };
      debt.paid = true;
      debt._clearedTxnTs = rec.ts;
      BRAIN.audit.append({ type: 'debt_mark_paid', id, name: debt.name, amt: debt.amt, txnTs: rec.ts, source, ts: Date.now() });
      try { save(); } catch(_) {}
      return { ok: true, debt, txnTs: rec.ts };
    },
    unmark(id, source) {
      if (!source) source = BRAIN.SOURCES.UNMARK_DEBT;
      if (!BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source:' + source };
      const debt = (S.debts || []).find(d => d.id === id);
      if (!debt) return { ok: false, reason: 'debt-not-found', id };
      if (!debt.paid) return { ok: false, reason: 'not-paid', id };
      const txnTs = debt._clearedTxnTs;
      let txnReversed = false;
      if (typeof txnTs === 'number') {
        const removed = BRAIN.transaction.removeByTs(txnTs);
        if (!removed.ok) {
          if (removed.reason === 'not-found' || removed.reason === 'no-txns') {
            // LENIENT
          } else {
            return { ok: false, reason: 'inner-' + removed.reason };
          }
        } else {
          const t = removed.removed;
          if (t && t._balAffected) {
            if (t.income) S.bal -= (t.amt || 0);
            else S.bal += (t.amt || 0);
            S.bal = parseFloat(S.bal.toFixed(2));
          }
          txnReversed = true;
        }
      }
      debt.paid = false;
      delete debt._clearedTxnTs;
      BRAIN.audit.append({ type: 'debt_unmark', id, name: debt.name, txnReversed, source, ts: Date.now() });
      try { save(); } catch(_) {}
      return { ok: true, debt, txnReversed };
    },
    update(id, fields, source) {
      if (!source) source = BRAIN.SOURCES.UPDATE_DEBT;
      if (!BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source:' + source };
      const debt = (S.debts || []).find(d => d.id === id);
      if (!debt) return { ok: false, reason: 'debt-not-found', id };
      const MUTABLE = new Set(['name', 'amt', 'rate', 'notes', 'delayDate', 'priority', 'delayed', 'coveredBy', 'coveredDate', '_noBaladjust', 'viaRent', 'longTerm', 'paid', 'originalAmt', 'linkedLiability']);
      const changed = [];
      Object.keys(fields || {}).forEach(k => {
        if (!MUTABLE.has(k)) return;
        if (debt[k] !== fields[k]) { debt[k] = fields[k]; changed.push(k); }
      });
      if (changed.length === 0) return { ok: true, debt, changed: [] };
      BRAIN.audit.append({ type: 'debt_update', id, name: debt.name, changed, source, ts: Date.now() });
      try { save(); } catch(_) {}
      return { ok: true, debt, changed };
    },
    delete(id, source) {
      if (!source) source = BRAIN.SOURCES.DELETE_DEBT;
      if (!BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source:' + source };
      if (!Array.isArray(S.debts)) return { ok: false, reason: 'no-debts' };
      const idx = S.debts.findIndex(d => d.id === id);
      if (idx < 0) return { ok: false, reason: 'debt-not-found', id };
      const removed = S.debts.splice(idx, 1)[0];
      BRAIN.audit.append({ type: 'debt_delete', id, name: removed.name, amt: removed.amt, source, ts: Date.now() });
      try { save(); } catch(_) {}
      return { ok: true, removed };
    },
    findById(id) { return (S.debts || []).find(d => d.id === id); },
    active() { return (S.debts || []).filter(d => !d.paid && !d.viaRent); },
    total(opts) {
      const includeViaRent = !!(opts && opts.includeViaRent);
      return (S.debts || []).filter(d => !d.paid && (includeViaRent || !d.viaRent)).reduce((s, d) => s + (d.amt || 0), 0);
    },
    isViaRent(id) {
      const debt = (S.debts || []).find(d => d.id === id);
      return !!(debt && debt.viaRent);
    },
    allocateWrxProceeds(allocations, saleNet, source) {
      if (!source) source = BRAIN.SOURCES.WRX_ALLOCATE;
      if (!BRAIN._SOURCE_SET.has(source)) return { ok: false, reason: 'unknown-source:' + source };
      if (!Array.isArray(allocations)) return { ok: false, reason: 'invalid-allocations' };
      if (typeof saleNet !== 'number' || isNaN(saleNet)) return { ok: false, reason: 'invalid-saleNet' };
      for (const a of allocations) {
        if (a.type === 'debt') {
          if (typeof a.id !== 'number') return { ok: false, reason: 'invalid-debt-allocation', allocation: a };
          const d = this.findById(a.id);
          if (!d) return { ok: false, reason: 'debt-not-found', id: a.id };
          if (d.paid) return { ok: false, reason: 'already-paid', id: a.id };
        } else if (a.type === 'car') {
          if (typeof a.amt !== 'number' || isNaN(a.amt) || a.amt < 0) return { ok: false, reason: 'invalid-car-allocation', allocation: a };
        } else {
          return { ok: false, reason: 'unknown-allocation-type', allocation: a };
        }
      }
      const cleared = [];
      const carPaydowns = [];
      for (const a of allocations) {
        if (a.type === 'debt') {
          const r = this.markPaid(a.id, source);
          if (!r.ok) return { ok: false, reason: 'inner-markPaid-' + r.reason, allocation: a };
          cleared.push({ id: a.id, name: a.name, txnTs: r.txnTs });
        } else if (a.type === 'car') {
          S.carloan = Math.max(0, (S.carloan || 0) - a.amt);
          const rec = BRAIN.transaction.record(
            { amt: a.amt, note: 'WRX sale ' + a.name, cat: 'Debt repayment', income: false, _balAffected: true },
            source
          );
          if (!rec.ok) return { ok: false, reason: 'inner-record-' + rec.reason, allocation: a };
          carPaydowns.push({ amt: a.amt, txnTs: rec.ts });
        }
      }
      S.bal += saleNet;
      S.wrxValue = 0;
      S.wrxStatus = 'sold';
      BRAIN.audit.append({
        type: 'wrx_proceeds_allocated', saleNet,
        cleared: cleared.map(c => c.name),
        carPaydowns: carPaydowns.map(c => c.amt),
        source, ts: Date.now()
      });
      try { save(); } catch(_) {}
      return { ok: true, cleared, carPaydowns, saleNet };
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

// ── BRAIN.bills ─────────────────────────────────────────
test('bills.markPaid: default mode creates paired txn and structured entry', () => {
  resetS();
  const r = BRAIN.bills.markPaid(
    { name: 'Spotify', day: 28, amt: 15.99, tag: 'Streaming' },
    BRAIN.SOURCES.MARK_BILL_PAID
  );
  expect(r.ok).toBe(true);
  expect(r.key).toBe(paidBillKey('Spotify', 28));
  // paidBills entry created with structured shape and _txnTs back-ref
  expect(r.entry.paid).toBe(true);
  expect(typeof r.entry._txnTs).toBe('number');
  // Paired txn pushed to S.txns
  expect(S.txns.length).toBe(1);
  expect(S.txns[0].amt).toBe(15.99);
  // Audit emission
  const last = S._auditLog[S._auditLog.length - 1];
  expect(last.type).toBe('bill_mark_paid');
});

test('bills.markPaid: autoDebit mode sets _scheduledAutoDebit flag', () => {
  resetS();
  const r = BRAIN.bills.markPaid(
    { name: 'YouTube Premium', day: 18, amt: 16.99 },
    BRAIN.SOURCES.MARK_BILL_PAID,
    { autoDebit: true }
  );
  expect(r.ok).toBe(true);
  expect(r.entry._scheduledAutoDebit).toBe(true);
});

test('bills.markPaid: txnTs link mode does NOT create new txn', () => {
  resetS();
  // Pre-existing txn (simulates autoDetect found match)
  const existingTs = Date.now();
  S.txns.push({ amt: 15.99, note: 'Spotify monthly', cat: 'Streaming', ts: existingTs });
  const before = S.txns.length;
  const r = BRAIN.bills.markPaid(
    { name: 'Spotify', day: 28, amt: 15.99 },
    BRAIN.SOURCES.AUTO_DETECT,
    { txnTs: existingTs }
  );
  expect(r.ok).toBe(true);
  // No new txn pushed — links to existing
  expect(S.txns.length).toBe(before);
  expect(r.entry._txnTs).toBe(existingTs);
});

test('bills.markPaid: unknown source rejected (no mutation)', () => {
  resetS();
  const r = BRAIN.bills.markPaid(
    { name: 'Spotify', day: 28, amt: 15.99 },
    'bogus-bill-source'
  );
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('unknown-source:bogus-bill-source');
  expect(S.txns.length).toBe(0);
  expect(Object.keys(S.paidBills).length).toBe(0);
});

test('bills.markPaid: invalid bill rejected', () => {
  resetS();
  const r = BRAIN.bills.markPaid({ name: 'NoDay' }, BRAIN.SOURCES.MARK_BILL_PAID);
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('invalid-bill');
});

test('bills.markPaid: link mode with missing txnTs returns linked-txn-missing', () => {
  resetS();
  const r = BRAIN.bills.markPaid(
    { name: 'Spotify', day: 28, amt: 15.99 },
    BRAIN.SOURCES.AUTO_DETECT,
    { txnTs: 99999 } // doesn't exist
  );
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('linked-txn-missing');
});

// ── Composition: STRICT abort on CREATE direction inner failure ────
test('composition: markPaid default mode aborts cleanly when transaction.record fails (strict)', () => {
  resetS();
  const original = BRAIN.transaction.record;
  BRAIN.transaction.record = () => ({ ok: false, reason: 'forced-test-failure' });
  try {
    const result = BRAIN.bills.markPaid(
      { name: 'Test Bill', day: 15, amt: 50, tag: 'Streaming' },
      BRAIN.SOURCES.MARK_BILL_PAID
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('inner-forced-test-failure');
    // NO paidBills entry created — strict abort means no orphan flag.
    const key = paidBillKey('Test Bill', 15);
    expect(!!(S.paidBills && S.paidBills[key])).toBe(false);
  } finally {
    BRAIN.transaction.record = original;
  }
});

// ── Composition: LENIENT-WITH-WARNING on DESTROY direction ─────────
test('composition: unmark proceeds when removeByTs returns not-found (lenient)', () => {
  resetS();
  // Setup: paidBills has entry with _txnTs pointing at a ts that's NOT in S.txns
  const key = paidBillKey('Orphan Bill', 10);
  const orphanTs = 12345; // not in S.txns
  S.paidBills[key] = { paid: true, ts: orphanTs, _txnTs: orphanTs };
  const r = BRAIN.bills.unmark(key, BRAIN.SOURCES.UNMARK_BILL);
  // LENIENT: returns ok despite missing paired txn
  expect(r.ok).toBe(true);
  // paidBills entry removed
  expect(!!S.paidBills[key]).toBe(false);
  // un-mark log written
  expect(typeof S._billUnmarkLog[key]).toBe('number');
});

test('composition: unmark aborts on UNEXPECTED inner failure (strict for non-lenient reasons)', () => {
  resetS();
  // Set up a paidBills entry pointing at a real txn so removeByTs has a target.
  const key = paidBillKey('Probe Bill', 15);
  const txnTs = Date.now();
  S.txns.push({ amt: 30, note: 'Probe', cat: 'Bills', ts: txnTs });
  S.paidBills[key] = { paid: true, ts: txnTs, _txnTs: txnTs };
  const original = BRAIN.transaction.removeByTs;
  BRAIN.transaction.removeByTs = () => ({ ok: false, reason: 'system-error' });
  try {
    const result = BRAIN.bills.unmark(key, BRAIN.SOURCES.UNMARK_BILL);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('inner-system-error');
    // STRICT abort preserves state when failure mode wasn't an exception.
    expect(!!S.paidBills[key]).toBe(true);
  } finally {
    BRAIN.transaction.removeByTs = original;
  }
});

// ── unmark mechanics ───────────────────────────────────
test('bills.unmark: removes entry + records _billUnmarkLog + resets invariant counts', () => {
  resetS();
  const key = paidBillKey('Spotify', 28);
  const txnTs = Date.now();
  S.txns.push({ amt: 15.99, note: 'Spotify', cat: 'Streaming', ts: txnTs, _balAffected: true });
  S.paidBills[key] = { paid: true, ts: txnTs, _txnTs: txnTs };
  S._invariantViolationCounts['paidbills-key-not-future'] = { count: 5, firstSeenTs: 0 };
  const r = BRAIN.bills.unmark(key, BRAIN.SOURCES.UNMARK_BILL);
  expect(r.ok).toBe(true);
  expect(r.txnReversed).toBe(true);
  expect(!!S.paidBills[key]).toBe(false);
  expect(typeof S._billUnmarkLog[key]).toBe('number');
  expect(S._invariantViolationCounts['paidbills-key-not-future'].count).toBe(0);
});

test('bills.unmark: not-paid case returns not-paid envelope', () => {
  resetS();
  const r = BRAIN.bills.unmark(paidBillKey('Phantom', 1), BRAIN.SOURCES.UNMARK_BILL);
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('not-paid');
});

// ── pendingPay context ─────────────────────────────────
test('bills.setPendingPay + consumePendingPay round-trip (manual mode)', () => {
  resetS();
  const key = paidBillKey('Rent', 15);
  BRAIN.bills.setPendingPay(key, { autoDebit: false });
  expect(BRAIN.bills._pendingPay.key).toBe(key);
  expect(BRAIN.bills._pendingPay.autoDebit).toBe(false);
  const r = BRAIN.bills.consumePendingPay(Date.now());
  expect(r.ok).toBe(true);
  expect(!!S.paidBills[key]).toBe(true);
  expect(BRAIN.bills._pendingPay).toBe(null);
});

test('bills.setPendingPay + consumePendingPay round-trip (autoDebit mode)', () => {
  resetS();
  const key = paidBillKey('YouTube Premium', 18);
  BRAIN.bills.setPendingPay(key, { autoDebit: true });
  const r = BRAIN.bills.consumePendingPay(Date.now());
  expect(r.ok).toBe(true);
  expect(S.paidBills[key]._scheduledAutoDebit).toBe(true);
});

test('bills.clearPendingPay clears the context', () => {
  resetS();
  BRAIN.bills.setPendingPay('some-key', {});
  BRAIN.bills.clearPendingPay();
  expect(BRAIN.bills._pendingPay).toBe(null);
});

test('bills.consumePendingPay: returns no-pending-pay envelope when context is null', () => {
  resetS();
  BRAIN.bills.clearPendingPay();
  const r = BRAIN.bills.consumePendingPay(Date.now());
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('no-pending-pay');
});

// ── Readers ────────────────────────────────────────────
test('bills.isPaid: handles legacy true shape', () => {
  resetS();
  S.paidBills[paidBillKey('Rent', 15)] = true;
  expect(BRAIN.bills.isPaid(paidBillKey('Rent', 15))).toBe(true);
});

test('bills.isPaid: handles structured shape', () => {
  resetS();
  S.paidBills[paidBillKey('Rent', 15)] = { paid: true, ts: Date.now() };
  expect(BRAIN.bills.isPaid(paidBillKey('Rent', 15))).toBe(true);
});

test('bills.isAutoDebit: returns true only for _scheduledAutoDebit entries', () => {
  resetS();
  const key1 = paidBillKey('A', 1);
  const key2 = paidBillKey('B', 2);
  S.paidBills[key1] = { paid: true, ts: 1 }; // no autoDebit flag
  S.paidBills[key2] = { paid: true, _scheduledAutoDebit: true, ts: 1 };
  expect(BRAIN.bills.isAutoDebit(key1)).toBe(false);
  expect(BRAIN.bills.isAutoDebit(key2)).toBe(true);
});

// ── Invariant ──────────────────────────────────────────
test('bills.invariants.checkFutureKeyNotPaid: returns null when no future paid keys', () => {
  resetS();
  expect(BRAIN.bills.invariants.checkFutureKeyNotPaid()).toBe(null);
});

test('bills.invariants.checkFutureKeyNotPaid: returns violation for future non-autoDebit keys', () => {
  resetS();
  // Create a paidBills entry for far-future date
  S.paidBills['2030-12-Future Bill-25'] = { paid: true, ts: Date.now() };
  const v = BRAIN.bills.invariants.checkFutureKeyNotPaid();
  expect(v !== null).toBe(true);
  expect(v.keys.length).toBe(1);
});

test('bills.invariants.checkFutureKeyNotPaid: skips autoDebit-flagged keys', () => {
  resetS();
  S.paidBills['2030-12-Future Bill-25'] = { paid: true, _scheduledAutoDebit: true, ts: Date.now() };
  expect(BRAIN.bills.invariants.checkFutureKeyNotPaid()).toBe(null);
});

// ── BRAIN.transaction.recordCorrection ─────────────────
test('transaction.recordCorrection: positive diff creates Income+correction txn', () => {
  resetS();
  const r = BRAIN.transaction.recordCorrection(50, 'Bank synced up');
  expect(r.ok).toBe(true);
  expect(r.txn.amt).toBe(50);
  expect(r.txn.income).toBe(true);
  expect(r.txn.cat).toBe('Income');
  expect(r.txn._isCorrection).toBe(true);
});

test('transaction.recordCorrection: negative diff creates Adjustment+correction txn', () => {
  resetS();
  const r = BRAIN.transaction.recordCorrection(-25, 'Bank short');
  expect(r.ok).toBe(true);
  expect(r.txn.amt).toBe(25);
  expect(r.txn.income).toBe(false);
  expect(r.txn.cat).toBe('Adjustment');
  expect(r.txn._isCorrection).toBe(true);
});

test('transaction.recordCorrection: invalid diff rejected', () => {
  resetS();
  const r = BRAIN.transaction.recordCorrection(NaN);
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('invalid-diff');
});

// ── BRAIN.debts ────────────────────────────────────────
test('debts.add: happy path returns envelope with debt + id', () => {
  resetS();
  const r = BRAIN.debts.add({ name: 'New Debt', amt: 100, rate: 5 }, BRAIN.SOURCES.ADD_DEBT);
  expect(r.ok).toBe(true);
  expect(typeof r.id).toBe('number');
  expect(r.debt.name).toBe('New Debt');
  expect(r.debt.amt).toBe(100);
});

test('debts.add: rejects invalid name', () => {
  resetS();
  const r = BRAIN.debts.add({ name: '', amt: 100 }, BRAIN.SOURCES.ADD_DEBT);
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('invalid-name');
});

test('debts.add: rejects invalid amt', () => {
  resetS();
  const r = BRAIN.debts.add({ name: 'X', amt: -5 }, BRAIN.SOURCES.ADD_DEBT);
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('invalid-amt');
});

test('debts.add: ID-collision guard preserves Mission #42 era logic', () => {
  resetS();
  // Set nextDebtId BELOW the existing max id
  S.nextDebtId = 1;
  const r = BRAIN.debts.add({ name: 'Should Get High ID', amt: 50 }, BRAIN.SOURCES.ADD_DEBT);
  expect(r.ok).toBe(true);
  // Should exceed the highest existing id (which is 3 in resetS())
  expect(r.id >= 4).toBe(true);
});

test('debts.markPaid: happy path sets paid + creates clearance txn + _clearedTxnTs back-ref', () => {
  resetS();
  const r = BRAIN.debts.markPaid(2, BRAIN.SOURCES.CLEAR_DEBT); // Pet Insurance
  expect(r.ok).toBe(true);
  expect(r.debt.paid).toBe(true);
  expect(typeof r.txnTs).toBe('number');
  expect(r.debt._clearedTxnTs).toBe(r.txnTs);
  // Paired txn in S.txns
  expect(S.txns.length).toBe(1);
  expect(S.txns[0].cat).toBe('Debt repayment');
});

test('debts.markPaid: debt-not-found returns envelope', () => {
  resetS();
  const r = BRAIN.debts.markPaid(99999, BRAIN.SOURCES.CLEAR_DEBT);
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('debt-not-found');
});

test('debts.markPaid: already-paid rejected', () => {
  resetS();
  BRAIN.debts.markPaid(2, BRAIN.SOURCES.CLEAR_DEBT);
  const r2 = BRAIN.debts.markPaid(2, BRAIN.SOURCES.CLEAR_DEBT);
  expect(r2.ok).toBe(false);
  expect(r2.reason).toBe('already-paid');
});

// ── Composition: STRICT abort on CREATE (debts.markPaid)
test('composition: debts.markPaid aborts cleanly when transaction.record fails (strict)', () => {
  resetS();
  const original = BRAIN.transaction.record;
  BRAIN.transaction.record = () => ({ ok: false, reason: 'forced-test-failure' });
  try {
    const r = BRAIN.debts.markPaid(2, BRAIN.SOURCES.CLEAR_DEBT);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('inner-forced-test-failure');
    // debt.paid stays false — strict abort means no half-state
    const debt = S.debts.find(d => d.id === 2);
    expect(debt.paid).toBe(false);
  } finally {
    BRAIN.transaction.record = original;
  }
});

// ── Composition: LENIENT for unmark (DESTROY)
test('composition: debts.unmark proceeds when removeByTs returns not-found (lenient)', () => {
  resetS();
  // Setup: debt is paid with a _clearedTxnTs that doesn't exist in S.txns
  const debt = S.debts.find(d => d.id === 2);
  debt.paid = true;
  debt._clearedTxnTs = 99999; // orphan ts
  const r = BRAIN.debts.unmark(2, BRAIN.SOURCES.UNMARK_DEBT);
  expect(r.ok).toBe(true);
  expect(r.txnReversed).toBe(false);
  // debt.paid back to false
  expect(debt.paid).toBe(false);
});

test('composition: debts.unmark aborts on UNEXPECTED inner failure (strict for non-lenient reasons)', () => {
  resetS();
  const debt = S.debts.find(d => d.id === 2);
  const txnTs = Date.now();
  S.txns.push({ amt: 120, ts: txnTs, _balAffected: true });
  debt.paid = true;
  debt._clearedTxnTs = txnTs;
  const original = BRAIN.transaction.removeByTs;
  BRAIN.transaction.removeByTs = () => ({ ok: false, reason: 'system-error' });
  try {
    const r = BRAIN.debts.unmark(2, BRAIN.SOURCES.UNMARK_DEBT);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('inner-system-error');
    // debt.paid still true — strict abort preserves state
    expect(debt.paid).toBe(true);
  } finally {
    BRAIN.transaction.removeByTs = original;
  }
});

test('debts.unmark: happy path reverses paired txn + restores balance', () => {
  resetS();
  const balBefore = S.bal;
  const r1 = BRAIN.debts.markPaid(2, BRAIN.SOURCES.CLEAR_DEBT);
  expect(r1.ok).toBe(true);
  // Simulate balance deduction (caller responsibility per contract)
  S.bal -= 120;
  // Now unmark
  const r2 = BRAIN.debts.unmark(2, BRAIN.SOURCES.UNMARK_DEBT);
  expect(r2.ok).toBe(true);
  expect(r2.txnReversed).toBe(true);
  expect(S.bal).toBe(balBefore); // balance restored
  expect(S.txns.length).toBe(0); // clearance txn removed
});

test('debts.update: whitelist enforces field set', () => {
  resetS();
  const r = BRAIN.debts.update(2, {
    name: 'Renamed',
    amt: 99,
    secretField: 'should-be-ignored',
    __proto__: 'no-pollution'
  }, BRAIN.SOURCES.UPDATE_DEBT);
  expect(r.ok).toBe(true);
  expect(r.changed.length).toBe(2); // only name + amt counted
  const debt = S.debts.find(d => d.id === 2);
  expect(debt.name).toBe('Renamed');
  expect(debt.amt).toBe(99);
  expect(debt.secretField).toBe(undefined);
});

test('debts.update: debt-not-found returns envelope', () => {
  resetS();
  const r = BRAIN.debts.update(99999, { name: 'X' }, BRAIN.SOURCES.UPDATE_DEBT);
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('debt-not-found');
});

test('debts.delete: removes by id', () => {
  resetS();
  const before = S.debts.length;
  const r = BRAIN.debts.delete(2, BRAIN.SOURCES.DELETE_DEBT);
  expect(r.ok).toBe(true);
  expect(r.removed.name).toBe('Pet Insurance');
  expect(S.debts.length).toBe(before - 1);
});

test('debts.findById / active / total: readers correctness', () => {
  resetS();
  expect(BRAIN.debts.findById(2).name).toBe('Pet Insurance');
  expect(BRAIN.debts.findById(99999)).toBe(undefined);
  // active() excludes viaRent (Owed to Mum id=1)
  const active = BRAIN.debts.active();
  expect(active.length).toBe(2); // Pet Insurance + Afterpay
  // total() excludes viaRent by default
  expect(BRAIN.debts.total()).toBe(170); // 120 + 50
  // total({includeViaRent:true}) includes Mum
  expect(BRAIN.debts.total({ includeViaRent: true })).toBe(5170);
});

// ── Bundle 15.1: isViaRent + allocateWrxProceeds ────────
test('debts.isViaRent: true for viaRent-flagged debt, false otherwise', () => {
  resetS();
  expect(BRAIN.debts.isViaRent(1)).toBe(true);  // Owed to Mum (viaRent)
  expect(BRAIN.debts.isViaRent(2)).toBe(false); // Pet Insurance (not viaRent)
  expect(BRAIN.debts.isViaRent(99999)).toBe(false); // missing debt
});

test('debts.allocateWrxProceeds: happy path clears multiple debts + carloan + saleNet', () => {
  resetS();
  S.carloan = 1000;
  const balBefore = S.bal;
  const allocs = [
    { type: 'debt', id: 2, name: 'Pet Insurance', amt: 120 },
    { type: 'debt', id: 3, name: 'Afterpay', amt: 50 },
    { type: 'car', name: 'KIA Loan', amt: 500 }
  ];
  const r = BRAIN.debts.allocateWrxProceeds(allocs, 9330, BRAIN.SOURCES.WRX_ALLOCATE);
  expect(r.ok).toBe(true);
  expect(r.cleared.length).toBe(2);
  expect(r.carPaydowns.length).toBe(1);
  expect(r.saleNet).toBe(9330);
  // State mutations applied
  expect(S.debts.find(d => d.id === 2).paid).toBe(true);
  expect(S.debts.find(d => d.id === 3).paid).toBe(true);
  expect(S.carloan).toBe(500);
  expect(S.bal).toBe(balBefore + 9330);
  expect(S.wrxStatus).toBe('sold');
});

test('composition: allocateWrxProceeds phase-1 validation catches invalid debt id BEFORE any mutation', () => {
  resetS();
  S.carloan = 1000;
  const balBefore = S.bal;
  const allocs = [
    { type: 'debt', id: 2, name: 'Pet Insurance', amt: 120 },
    { type: 'debt', id: 99999, name: 'Phantom', amt: 50 }, // doesn't exist
    { type: 'car', name: 'KIA Loan', amt: 500 }
  ];
  const r = BRAIN.debts.allocateWrxProceeds(allocs, 9330, BRAIN.SOURCES.WRX_ALLOCATE);
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('debt-not-found');
  // NOTHING mutated — phase-1 abort means no partial WRX state
  expect(S.debts.find(d => d.id === 2).paid).toBe(false);
  expect(S.carloan).toBe(1000);
  expect(S.bal).toBe(balBefore);
  expect(S.wrxStatus === 'sold').toBe(false);
});

test('composition: allocateWrxProceeds STRICT abort when inner markPaid fails', () => {
  resetS();
  S.carloan = 1000;
  const original = BRAIN.transaction.record;
  // Stub: first record() (Pet Insurance clearance) succeeds; second (Afterpay) fails.
  let calls = 0;
  BRAIN.transaction.record = function(txn, source) {
    calls++;
    if (calls === 2) return { ok: false, reason: 'forced-test-failure' };
    return original.call(this, txn, source);
  };
  try {
    const allocs = [
      { type: 'debt', id: 2, name: 'Pet Insurance', amt: 120 },
      { type: 'debt', id: 3, name: 'Afterpay', amt: 50 },
    ];
    const r = BRAIN.debts.allocateWrxProceeds(allocs, 1000, BRAIN.SOURCES.WRX_ALLOCATE);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('inner-markPaid-inner-forced-test-failure');
    // Pet Insurance got cleared (phase 2 fired) — STRICT abort means
    // the partial state is visible. The caller (confirmWrxAlloc) shows
    // the failure toast. Note: phase-1 validation already ran on the
    // FULL list so we know all debts existed at start; the failure here
    // is mid-phase-2 racy state (transaction layer broken). Document
    // this in spec as "STRICT abort = no further allocations; partial
    // earlier-in-batch mutations remain — caller surfaces error."
    expect(S.debts.find(d => d.id === 2).paid).toBe(true);
    expect(S.debts.find(d => d.id === 3).paid).toBe(false);
    expect(S.wrxStatus === 'sold').toBe(false);
  } finally {
    BRAIN.transaction.record = original;
  }
});

test('debts.allocateWrxProceeds: unknown allocation type rejected', () => {
  resetS();
  const r = BRAIN.debts.allocateWrxProceeds(
    [{ type: 'mystery', amt: 50 }],
    100,
    BRAIN.SOURCES.WRX_ALLOCATE
  );
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('unknown-allocation-type');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
