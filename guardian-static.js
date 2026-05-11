#!/usr/bin/env node
/**
 * Guardian Layer 1 — AST-based static analysis.
 *
 * Parses index.html's script blob with acorn, walks the AST, evaluates
 * each rule in the catalog, and exits non-zero on any `fail`-severity
 * finding.
 *
 * Override mechanism: `// guardian-allow: <rule> — <reason> (removable when X)`
 * comment on the line directly preceding a violation suppresses that finding.
 *
 * Catalog: 16 rules. `dom-id-must-exist` deferred to follow-up (post Dead
 * Code Cleanup mission) — see MISSION-GUARDIAN-LAYER-1.md Step 1 findings.
 * Mission F (2026-05-05) added rule #16 `no-inline-daysleft-outside-canonical`
 * — bans daysLeft(...) calls outside the function definition itself, MI-15's
 * canonical comparison, and the HEALTH/diagnostic allow-list. Anchors
 * OPEN-BUGS #22.
 *
 * See MISSION-GUARDIAN-LAYER-1.md for the full spec.
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');

// ─── Configuration ────────────────────────────────────────────────────────
const HTML_FILE = path.join(__dirname, 'index.html');
const ALLOW_LIST_PATH = path.join(__dirname, 'audit', 'allow-list.json');
const VAGUE_REASON_DENYLIST = [
  /^needs to work$/i, /^WIP$/i, /^TODO$/i, /^temp(orary)?$/i, /^fixme$/i,
  /^later$/i, /^TBD$/i, /^placeholder$/i, /^hack$/i, /^needed$/i,
];
const MIN_REASON_LENGTH = 10;

// Canonical-helper sets (rules use these for fn-context exemptions).
const PAIDBILLS_HELPERS = new Set(['paidBillKey', 'isThisMonthlyBillPaid']);
const TXNS_FILTER_HELPERS = new Set([
  'getTxnSpent', 'computeSpentInRange', 'getDiscretionaryByCategory',
  'getDiscretionarySpend', 'getNoSpendStreak', 'getAvgDailySpend',
  'getMinDailySpend',
]);
// Functions where reading S.paidBills directly is sanctioned (migrations or
// operate on existing keys handed in by callers — no key construction).
// Bundle 7.2.4: undoBillPaid joins the migration-fn allow-list alongside
// undoPaidBillByKey. Both are un-mark helpers that need to read paidBills
// by stored key (to fetch the entry's _txnTs back-reference for txn
// reversal) and then delete it. Keeping them in this set keeps the
// rule's intent — direct paidBills access is allowed in well-named
// migration / un-mark helpers; everywhere else routes via paidBillKey.
const PAIDBILLS_MIGRATION_FNS = new Set(['load', 'undoPaidBillByKey', 'undoBillPaid']);

// Bundle 8: parallel allow-set for the no-direct-bucket-saved-write rule.
// BRAIN.savings.setBucketSaved is the canonical chokepoint for any
// S.savingsBuckets[i].saved mutation. The only legitimate exception is
// the load() migration path which patches data shapes during boot.
const BUCKET_SAVED_WRITER_FNS = new Set(['setBucketSaved', 'load']);

// Bundle 10: allow-set for the no-inline-todayspend-computation rule.
// BRAIN.dashboard.todaySpend / todayTxns are the canonical chokepoints
// for "today's discretionary spend" computation. The canonical helpers
// themselves (computeSpentToday, todayTxnsCanonical, getTodaySpent and
// its aliases, getNoSpendStreak which legitimately walks days using
// date strings, computeSpentInRange which uses ts-range not date-string
// matching) are exempt. The PUSH worker's pre-Bundle-10 inline logic
// was the bug source — that's now gone.
const TODAYSPEND_CANONICAL_FNS = new Set([
  'computeSpentToday', 'todayTxnsCanonical', 'getTodaySpent',
  'getTodayDiscretionarySpend', 'computeSpentInRange',
  'getDiscretionaryByCategory', 'getNoSpendStreak'
]);
// Survival-mode strings (rule no-hardcoded-survival-mode-string).
const SURVIVAL_MODE_STRINGS = new Set(['critical', 'survival', 'tight', 'cautious', 'normal']);
// Debt strategy strings.
const DEBT_STRATEGY_STRINGS = new Set(['avalanche', 'snowball']);
// TDZ-guard wrapper function names — calls to these mean the body is TDZ-safe.
const TDZ_GUARD_WRAPPERS = new Set(['_safePlan']);

// ─── Source extraction ───────────────────────────────────────────────────
let html;
try {
  html = fs.readFileSync(HTML_FILE, 'utf8');
} catch (e) {
  console.error('❌ Cannot read index.html:', e.message);
  process.exit(2);
}

const scriptStart = html.indexOf('<script>');
const scriptEnd = html.indexOf('</script>', scriptStart);
if (scriptStart < 0 || scriptEnd < 0) {
  console.error('❌ Could not locate <script>...</script> in index.html');
  process.exit(2);
}

const SCRIPT_OFFSET = html.slice(0, scriptStart + '<script>'.length).split('\n').length - 1;
const SCRIPT_SRC = html.slice(scriptStart + '<script>'.length, scriptEnd);

const fileLine = (scriptLine) => scriptLine + SCRIPT_OFFSET;

// ─── Comment collection (declared before parse — onComment is called inline) ─
const COMMENTS = [];
function collectComment(block, text, start, end, startLoc, endLoc) {
  COMMENTS.push({
    block, text, start, end,
    line: startLoc.line,
    fileLine: fileLine(startLoc.line),
  });
}

// ─── AST parse ────────────────────────────────────────────────────────────
let ast;
const parseStart = Date.now();
try {
  ast = acorn.parse(SCRIPT_SRC, {
    ecmaVersion: 2022,
    sourceType: 'script',
    locations: true,
    ranges: true,
    onComment: collectComment,
  });
} catch (e) {
  console.error('❌ AST parse failed:', e.message);
  if (e.loc) console.error('   at script line', e.loc.line, '(file line ~' + fileLine(e.loc.line) + ')');
  process.exit(2);
}
const parseMs = Date.now() - parseStart;

// ─── Pre-pass: build enclosing-function map ──────────────────────────────
// Maps every range to the smallest-enclosing function's name. Used by rules
// for fn-context exemptions (e.g. "S.paidBills[X] is OK inside isThisMonthlyBillPaid").
const FN_RANGES = []; // { start, end, name, hasTryAncestor: bool, ... }

function nameOfFunctionLikeNode(node) {
  if (node.type === 'FunctionDeclaration' && node.id) return node.id.name;
  return null;
}

walk.simple(ast, {
  FunctionDeclaration(node) {
    if (node.id) {
      FN_RANGES.push({ start: node.range[0], end: node.range[1], name: node.id.name, kind: 'fn' });
    }
  },
  Property(node) {
    // Method shorthand or property: function — capture name for AUDITOR.record etc.
    if (node.value && (node.value.type === 'FunctionExpression' || node.value.type === 'ArrowFunctionExpression')) {
      const name = (node.key.name || node.key.value);
      if (typeof name === 'string') {
        FN_RANGES.push({ start: node.value.range[0], end: node.value.range[1], name, kind: 'method' });
      }
    }
  },
  // const X = function ... { } / X = function ... { }
  VariableDeclarator(node) {
    if (node.init && (node.init.type === 'FunctionExpression' || node.init.type === 'ArrowFunctionExpression')) {
      if (node.id && node.id.name) {
        FN_RANGES.push({ start: node.init.range[0], end: node.init.range[1], name: node.id.name, kind: 'var' });
      }
    }
  },
});

// Sort by range size (smallest first) so smallest enclosing wins.
FN_RANGES.sort((a, b) => (a.end - a.start) - (b.end - b.start));

function enclosingFn(rangeStart) {
  for (const fn of FN_RANGES) {
    if (fn.start <= rangeStart && rangeStart <= fn.end) return fn.name;
  }
  return null;
}

// Walk-up for TDZ guards. Returns true if `nodePos` is inside a TryStatement
// or inside a call to a TDZ_GUARD_WRAPPERS function (e.g. _safePlan).
const TRY_RANGES = []; // { start, end }
walk.simple(ast, {
  TryStatement(node) {
    TRY_RANGES.push({ start: node.range[0], end: node.range[1] });
  },
});

const GUARDED_CALL_RANGES = []; // ranges of calls to _safePlan etc., with their callback bodies
walk.simple(ast, {
  CallExpression(node) {
    if (node.callee && node.callee.type === 'Identifier' && TDZ_GUARD_WRAPPERS.has(node.callee.name)) {
      // The callback (first arg) is the guarded scope.
      const cb = node.arguments[0];
      if (cb && cb.range) {
        GUARDED_CALL_RANGES.push({ start: cb.range[0], end: cb.range[1] });
      }
    }
  },
});

function isTdzGuarded(rangeStart) {
  for (const r of TRY_RANGES) {
    if (r.start <= rangeStart && rangeStart <= r.end) return true;
  }
  for (const r of GUARDED_CALL_RANGES) {
    if (r.start <= rangeStart && rangeStart <= r.end) return true;
  }
  return false;
}

// ─── Allow-comment parsing + map ─────────────────────────────────────────
function parseAllowComment(text) {
  // Forms supported:
  //  A) guardian-allow: <rule> — <reason> (removable when <cond>)        — single line
  //  B) guardian-allow: <rule> — <reason> (permanent — see <ref>)        — single line
  //  C) guardian-allow-block-start: <rule> — <reason> (removable when ..) — opens block
  //  D) guardian-allow-block-end: <rule>                                  — closes block
  const blockEnd = text.match(/^\s*guardian-allow-block-end:\s*([\w-]+)\s*$/i);
  if (blockEnd) {
    return { kind: 'block-end', rule: blockEnd[1], ok: true };
  }
  const blockStart = text.match(/^\s*guardian-allow-block-start:\s*([\w-]+)\s*[—-]\s*(.+?)\s*\((removable when\s+(.+)|permanent\s*[—-]\s*(.+))\)\s*$/i);
  if (blockStart) {
    const rule = blockStart[1];
    const reason = blockStart[2].trim();
    const kind = blockStart[4] ? 'removable' : 'permanent';
    const condition = (blockStart[4] || blockStart[5] || '').trim();
    if (reason.length < MIN_REASON_LENGTH) {
      return { ok: false, error: `reason too short ("${reason}", need ≥ ${MIN_REASON_LENGTH} chars)` };
    }
    for (const re of VAGUE_REASON_DENYLIST) {
      if (re.test(reason)) {
        return { ok: false, error: `vague reason "${reason}" — must reference a specific cause` };
      }
    }
    return { kind: 'block-start', rule, reason, condition, removability: kind, ok: true };
  }
  const m = text.match(/^\s*guardian-allow:\s*([\w-]+)\s*[—-]\s*(.+?)\s*\((removable when\s+(.+)|permanent\s*[—-]\s*(.+))\)\s*$/i);
  if (!m) {
    if (/guardian-allow/i.test(text)) {
      return { ok: false, error: 'malformed — must be: // guardian-allow: <rule> — <reason> (removable when X)  OR  (permanent — see Y)  OR  guardian-allow-block-start: ... / guardian-allow-block-end: <rule>' };
    }
    return null;
  }
  const rule = m[1];
  const reason = m[2].trim();
  const removability = m[4] ? 'removable' : 'permanent';
  const condition = (m[4] || m[5] || '').trim();

  if (reason.length < MIN_REASON_LENGTH) {
    return { ok: false, error: `reason too short ("${reason}", need ≥ ${MIN_REASON_LENGTH} chars)` };
  }
  for (const re of VAGUE_REASON_DENYLIST) {
    if (re.test(reason)) {
      return { ok: false, error: `vague reason "${reason}" — must reference a specific cause` };
    }
  }
  return { kind: 'single', rule, reason, condition, removability, ok: true };
}

// Allow records: per-line single allows (allowMap), and per-rule blocks (blockAllows).
const allowMap = new Map();         // file-line of TARGET → { rule -> parsed }
const blockAllows = [];             // { rule, startLine, endLine, reason, condition, removability }
const malformedAllows = [];

// Track open blocks while iterating comments in source order.
const openBlocks = new Map(); // rule -> { startLine, reason, ... }

// Sort comments by file line so block-start/block-end ordering is preserved.
const sortedComments = COMMENTS.filter(c => !c.block).slice().sort((a, b) => a.fileLine - b.fileLine);

sortedComments.forEach(c => {
  const parsed = parseAllowComment(c.text);
  if (!parsed) return;
  if (!parsed.ok) {
    malformedAllows.push({ fileLine: c.fileLine, error: parsed.error });
    return;
  }
  if (parsed.kind === 'single') {
    const targetLine = c.fileLine + 1;
    if (!allowMap.has(targetLine)) allowMap.set(targetLine, {});
    allowMap.get(targetLine)[parsed.rule] = parsed;
  } else if (parsed.kind === 'block-start') {
    if (openBlocks.has(parsed.rule)) {
      malformedAllows.push({
        fileLine: c.fileLine,
        error: `nested block-start for rule "${parsed.rule}" (previous start at L${openBlocks.get(parsed.rule).startLine} not yet closed)`,
      });
      return;
    }
    openBlocks.set(parsed.rule, { startLine: c.fileLine, ...parsed });
  } else if (parsed.kind === 'block-end') {
    const open = openBlocks.get(parsed.rule);
    if (!open) {
      malformedAllows.push({
        fileLine: c.fileLine,
        error: `block-end for rule "${parsed.rule}" without matching start`,
      });
      return;
    }
    blockAllows.push({
      rule: parsed.rule,
      startLine: open.startLine,
      endLine: c.fileLine,
      reason: open.reason,
      condition: open.condition,
      removability: open.removability,
      used: false,  // updated when a violation is suppressed by this block
    });
    openBlocks.delete(parsed.rule);
  }
});

// Any blocks left open at end-of-source are an error.
for (const [rule, open] of openBlocks.entries()) {
  malformedAllows.push({
    fileLine: open.startLine,
    error: `block-start for rule "${rule}" never closed (missing guardian-allow-block-end)`,
  });
}

function isInBlockAllow(rule, fileLine) {
  for (const b of blockAllows) {
    if (b.rule === rule && fileLine > b.startLine && fileLine < b.endLine) {
      b.used = true;
      return true;
    }
  }
  return false;
}

// ─── Helper: extract BILLS names ─────────────────────────────────────────
let billNames = new Set();
let billsRangeEnd = -1;
walk.simple(ast, {
  VariableDeclarator(node) {
    if (node.id && node.id.name === 'BILLS' && node.init && node.init.type === 'ArrayExpression') {
      billsRangeEnd = node.init.range[1];
      node.init.elements.forEach(el => {
        if (el && el.type === 'ObjectExpression') {
          const nameProp = el.properties.find(p => p.key && (p.key.name === 'name' || p.key.value === 'name'));
          if (nameProp && nameProp.value && nameProp.value.type === 'Literal') {
            billNames.add(nameProp.value.value);
          }
        }
      });
    }
  },
});

// ─── Helper: PLAN const declaration line (for tdz rule) ──────────────────
let planDeclEnd = -1;
walk.simple(ast, {
  VariableDeclaration(node) {
    if (node.kind !== 'const') return;
    node.declarations.forEach(d => {
      if (d.id && d.id.name === 'PLAN') planDeclEnd = node.range[1];
    });
  },
});

// ─── Rule catalog (16 rules) ──────────────────────────────────────────────
function flattenConcat(node) {
  const parts = [];
  function visit(n) {
    if (n.type === 'BinaryExpression' && n.operator === '+') { visit(n.left); visit(n.right); }
    else parts.push(n);
  }
  visit(node);
  return parts;
}

const RULES = [

  // ─── 1. no-direct-paidbills-access ──────────────────────
  {
    name: 'no-direct-paidbills-access',
    severity: 'fail',
    anchor: 'RC11',
    check() {
      const violations = [];
      walk.simple(ast, {
        MemberExpression(node) {
          if (node.object && node.object.type === 'MemberExpression'
              && node.object.object && node.object.object.name === 'S'
              && node.object.property && node.object.property.name === 'paidBills') {
            const fn = enclosingFn(node.range[0]);
            if (PAIDBILLS_HELPERS.has(fn)) return;        // canonical helpers — exempt
            if (PAIDBILLS_MIGRATION_FNS.has(fn)) return;  // migrations — exempt

            // Refinement: S.paidBills[paidBillKey(...)] is the sanctioned write
            // pattern (Bundle B). The KEY goes through canonical helper; the
            // direct bracket-write is unavoidable absent a setBillPaid() helper.
            if (node.computed && node.property
                && node.property.type === 'CallExpression'
                && node.property.callee
                && node.property.callee.type === 'Identifier'
                && PAIDBILLS_HELPERS.has(node.property.callee.name)) {
              return; // sanctioned: key comes from canonical helper
            }

            violations.push({
              line: fileLine(node.loc.start.line),
              col: node.loc.start.column,
              evidence: `S.paidBills[...] inside ${fn || '<top-level>'} — key not from canonical helper`,
            });
          }
        },
      });
      return violations;
    },
  },

  // ─── 2. no-inline-paidbills-key-construction ────────────
  {
    name: 'no-inline-paidbills-key-construction',
    severity: 'fail',
    anchor: 'RC11',
    check() {
      const violations = [];
      walk.simple(ast, {
        BinaryExpression(node) {
          if (node.operator !== '+') return;
          const parts = flattenConcat(node);
          let dashLits = 0, dynParts = 0;
          parts.forEach(p => {
            if (p.type === 'Literal' && typeof p.value === 'string' && p.value === '-') dashLits++;
            else dynParts++;
          });
          // year-month-name-day key has 4 dynamic parts + 3 dash literals = 7 parts.
          if (dashLits >= 3 && dynParts >= 4 && parts.length >= 7) {
            const fn = enclosingFn(node.range[0]);
            if (PAIDBILLS_HELPERS.has(fn)) return;
            violations.push({
              line: fileLine(node.loc.start.line),
              col: node.loc.start.column,
              evidence: `paidBills-key-shaped concat (${parts.length} parts) inside ${fn || '<top-level>'}`,
            });
          }
        },
      });
      return violations;
    },
  },

  // ─── 2b. no-direct-bucket-saved-write (Bundle 8 architectural barrier) ─
  // S.savingsBuckets[i].saved is the canonical storage for plan-mode trip
  // and goal savings totals (Bundle 4's source-of-truth flip). Direct
  // writes outside BRAIN.savings.setBucketSaved drift state across the
  // three-store pattern (plan items / buckets / mum account) — the China
  // Holiday $70/$74/$76 drift that motivated Bundle 8.
  //
  // Patterns flagged:
  //   - S.savingsBuckets[<expr>].saved = <expr>     (direct subscript)
  //   - <ident>.saved = <expr>  WHERE <ident> is named like a bucket
  //     ('bucket', 'chinaHol', or starts with 'savings'). goal.saved /
  //     trip.saved / b.saved are not flagged because the LHS shape can't
  //     be statically distinguished — those callers should still route
  //     through BRAIN.savings if the value sync's to a bucket, but we
  //     prefer false negatives over false positives in this rule.
  {
    name: 'no-direct-bucket-saved-write',
    severity: 'fail',
    anchor: 'arch-barrier-bundle-8',
    check() {
      const BUCKETISH_IDENTS = new Set(['bucket', 'chinaHol', 'b']);
      const violations = [];
      walk.simple(ast, {
        AssignmentExpression(node) {
          if (node.operator !== '=' && node.operator !== '+=' && node.operator !== '-=') return;
          const lhs = node.left;
          if (!lhs || lhs.type !== 'MemberExpression') return;
          if (!lhs.property || lhs.property.name !== 'saved') return;
          const fn = enclosingFn(node.range[0]);
          if (BUCKET_SAVED_WRITER_FNS.has(fn)) return;
          // Pattern A: S.savingsBuckets[<expr>].saved = ...
          const obj = lhs.object;
          const isSavingsBucketSubscript = obj && obj.type === 'MemberExpression'
            && obj.computed
            && obj.object && obj.object.type === 'MemberExpression'
            && obj.object.object && obj.object.object.name === 'S'
            && obj.object.property && obj.object.property.name === 'savingsBuckets';
          // Pattern B: <ident>.saved = ... where <ident> is bucketish.
          // 'b' is included reluctantly because saveBucketModal aliases the
          // bucket as `b`; legitimate non-bucket uses of `b.saved` (none
          // in the current codebase) can carry a guardian-allow.
          const isBucketishIdent = obj && obj.type === 'Identifier'
            && BUCKETISH_IDENTS.has(obj.name);
          if (!isSavingsBucketSubscript && !isBucketishIdent) return;
          violations.push({
            line: fileLine(node.loc.start.line),
            col: node.loc.start.column,
            evidence: `bucket .saved write inside ${fn || '<top-level>'} — route through BRAIN.savings.setBucketSaved`,
          });
        },
      });
      return violations;
    },
  },

  // ─── 2c. no-inline-todayspend-computation (Bundle 10 architectural barrier) ─
  // "Today's discretionary spend" computation belongs in the canonical
  // chain (computeSpentToday -> computeSpentInRange) exposed via
  // BRAIN.dashboard.todaySpend / todayTxns. Pre-Bundle-10 two surfaces
  // rebuilt the filter inline — chat system prompt (L7236-7240) was
  // missing the _NON_SPEND_CATS exclusion, and the PUSH worker state
  // (L9548-9554) was missing both _NON_SPEND_CATS AND _isRoundup.
  // Result: the AI saw Bills as "today's spend", push worker fired
  // false "over budget" alarms when bills auto-debited.
  //
  // Rule shape: flag any S.txns.filter(<cb>) where the callback contains
  // a "today date-string match" — `new Date(t.ts).toDateString() === <expr>`.
  // AST-based, not regex — precise. Allow-list TODAYSPEND_CANONICAL_FNS
  // (the canonical chain itself can read S.txns this way; it just uses
  // ts-range comparison, not date-string match, so this pattern doesn't
  // fire on it anyway, but the allow-list is defensive).
  {
    name: 'no-inline-todayspend-computation',
    severity: 'fail',
    anchor: 'arch-barrier-bundle-10',
    check() {
      const violations = [];
      // Walks a callback's body looking for the discretionary-today
      // signature: BOTH a `new Date(<x>).toDateString() === <y>` match
      // AND a `t._isCorrection` or `t._isRoundup` exclusion. The legit
      // non-spend "today" filters (Last 7 Days chart, debt-repayment
      // breakdown, reconciler totals, character scoring) all match on
      // toDateString but never combine it with the correction/roundup
      // exclusion that's signature of "discretionary spend" computation.
      // Combining both signals narrows the rule to the actual drift
      // pattern the chat handler + PUSH worker had before Bundle 10.
      const cbHasTodayDateMatch = (cb) => {
        if (!cb || !cb.range) return false;
        let found = false;
        walk.simple(cb, {
          BinaryExpression(node) {
            if (node.operator !== '===' && node.operator !== '==') return;
            const sides = [node.left, node.right];
            for (const side of sides) {
              if (!side || side.type !== 'CallExpression') continue;
              const callee = side.callee;
              if (!callee || callee.type !== 'MemberExpression') continue;
              if (!callee.property || callee.property.name !== 'toDateString') continue;
              found = true;
              return;
            }
          },
        });
        return found;
      };
      const cbHasDiscretionaryExclusion = (cb) => {
        if (!cb || !cb.range) return false;
        let found = false;
        walk.simple(cb, {
          MemberExpression(node) {
            if (!node.property) return;
            const name = node.property.name;
            if (name === '_isCorrection' || name === '_isRoundup') {
              found = true;
              return;
            }
          },
        });
        return found;
      };
      const cbContainsTodayDateMatch = (cb) =>
        cbHasTodayDateMatch(cb) && cbHasDiscretionaryExclusion(cb);
      walk.simple(ast, {
        CallExpression(node) {
          if (!node.callee || node.callee.type !== 'MemberExpression') return;
          if (!node.callee.property || node.callee.property.name !== 'filter') return;
          // Target is S.txns or (S.txns || []) — the actual transaction store.
          const obj = node.callee.object;
          const isTxns =
            (obj && obj.type === 'MemberExpression' && obj.object
              && obj.object.name === 'S'
              && obj.property && obj.property.name === 'txns')
            || (obj && obj.type === 'LogicalExpression' && obj.operator === '||'
              && obj.left && obj.left.type === 'MemberExpression'
              && obj.left.object && obj.left.object.name === 'S'
              && obj.left.property && obj.left.property.name === 'txns');
          if (!isTxns) return;
          const cb = node.arguments[0];
          if (!cb) return;
          if (!cbContainsTodayDateMatch(cb)) return;
          const fn = enclosingFn(node.range[0]);
          if (TODAYSPEND_CANONICAL_FNS.has(fn)) return;
          violations.push({
            line: fileLine(node.loc.start.line),
            col: node.loc.start.column,
            evidence: `inline today-spend filter (toDateString match) inside ${fn || '<top-level>'} — route through BRAIN.dashboard.todayTxns / todaySpend`,
          });
        },
      });
      return violations;
    },
  },

  // ─── 3. no-bare-non-income-filter-on-txns ───────────────
  {
    name: 'no-bare-non-income-filter-on-txns',
    severity: 'fail',
    anchor: 'RC2, OPEN-BUGS #6',
    check() {
      const violations = [];
      walk.simple(ast, {
        CallExpression(node) {
          if (!node.callee || node.callee.type !== 'MemberExpression') return;
          if (!node.callee.property || node.callee.property.name !== 'filter') return;
          const obj = node.callee.object;
          const isTxns = (obj.type === 'MemberExpression' && obj.object && obj.object.name === 'S' && obj.property && obj.property.name === 'txns');
          if (!isTxns) return;
          const cb = node.arguments[0];
          if (!cb || (cb.type !== 'ArrowFunctionExpression' && cb.type !== 'FunctionExpression')) return;
          if (!cb.range) return;
          const bodySrc = SCRIPT_SRC.slice(cb.range[0], cb.range[1]);
          if (!bodySrc.includes('!t.income')) return;

          // Refinement (Decision 4): allow if the body uses positive cat selection
          // (filter FOR a category) OR uses canonical filter constants/flags.
          const allowed =
            bodySrc.includes('_NON_SPEND_CATS') ||
            bodySrc.includes('EXCLUDED_CATS') ||
            bodySrc.includes('_isCorrection') ||
            bodySrc.includes('_isRoundup') ||
            /t\.cat\s*===/.test(bodySrc) ||         // positive selection like t.cat === 'X'
            /\(\s*t\.cat[^)]*\)\s*===/.test(bodySrc); // (t.cat || 'Other') === cat

          if (allowed) return;
          const fn = enclosingFn(node.range[0]);
          if (TXNS_FILTER_HELPERS.has(fn)) return;

          violations.push({
            line: fileLine(node.loc.start.line),
            col: node.loc.start.column,
            evidence: `S.txns.filter with bare !t.income inside ${fn || '<top-level>'} — body: ${bodySrc.slice(0, 80).replace(/\s+/g, ' ').trim()}`,
          });
        },
      });
      return violations;
    },
  },

  // ─── 4. no-render-fn-mutates-state ──────────────────────
  // Sanctioned exception: renderAll snapshot + payday-detection block (lines 3030–3220).
  // After the Decision-2 refactor (payday detection moved to detectPaydayReceived()),
  // the exception range narrows to 3030–3047 (snapshot writer only).
  {
    name: 'no-render-fn-mutates-state',
    severity: 'fail',
    anchor: 'architectural',
    check() {
      const violations = [];
      walk.simple(ast, {
        FunctionDeclaration(fnNode) {
          if (!fnNode.id || !fnNode.id.name || !fnNode.id.name.startsWith('render')) return;
          const fnName = fnNode.id.name;

          walk.simple(fnNode.body, {
            AssignmentExpression(node) {
              if (node.left && node.left.type === 'MemberExpression'
                  && node.left.object && node.left.object.name === 'S') {
                violations.push({
                  fnName,
                  line: fileLine(node.loc.start.line),
                  col: node.loc.start.column,
                  evidence: `S.${node.left.property.name || '?'} ${node.operator} (inside ${fnName})`,
                });
              }
            },
            CallExpression(node) {
              if (node.callee && node.callee.type === 'MemberExpression'
                  && node.callee.object && node.callee.object.type === 'MemberExpression'
                  && node.callee.object.object && node.callee.object.object.name === 'S'
                  && ['push', 'splice', 'pop', 'shift', 'unshift'].includes(node.callee.property.name)) {
                violations.push({
                  fnName,
                  line: fileLine(node.loc.start.line),
                  col: node.loc.start.column,
                  evidence: `S.${node.callee.object.property.name}.${node.callee.property.name}(...) (inside ${fnName})`,
                });
              }
            },
          });
        },
      });
      return violations;
    },
  },

  // ─── 5. no-hardcoded-bill-name ──────────────────────────
  {
    name: 'no-hardcoded-bill-name',
    severity: 'fail',
    anchor: 'RC3',
    check() {
      const violations = [];
      walk.simple(ast, {
        Literal(node) {
          if (typeof node.value !== 'string') return;
          if (!billNames.has(node.value)) return;
          if (node.range[0] <= billsRangeEnd) return; // inside BILLS decl — exempt
          violations.push({
            line: fileLine(node.loc.start.line),
            col: node.loc.start.column,
            evidence: `string literal "${node.value}" matches BILLS[].name`,
          });
        },
      });
      return violations;
    },
  },

  // ─── 6. nw-renderers-consume-MODEL.liquidNet ────────────
  {
    name: 'nw-renderers-consume-MODEL.liquidNet',
    severity: 'fail',
    anchor: 'cross-tile NW agreement',
    check() {
      // Find $('nw-val') and $('strip-networth') call sites.
      // For each, the enclosing function MUST contain a reference to MODEL.liquidNet.
      const targets = [];
      walk.simple(ast, {
        CallExpression(node) {
          let isDollar = node.callee && node.callee.type === 'Identifier' && node.callee.name === '$';
          let isGetById = node.callee && node.callee.type === 'MemberExpression'
                          && node.callee.property && node.callee.property.name === 'getElementById';
          if (!(isDollar || isGetById)) return;
          if (!node.arguments[0] || node.arguments[0].type !== 'Literal') return;
          const id = node.arguments[0].value;
          if (id === 'nw-val' || id === 'strip-networth') {
            targets.push({ id, range: node.range, line: fileLine(node.loc.start.line) });
          }
        },
      });
      const violations = [];
      // For each target, find enclosing fn body and check for MODEL.liquidNet —
      // either as a direct reference OR via an alias (e.g. const _m = MODEL; _m.liquidNet).
      targets.forEach(t => {
        const fnName = enclosingFn(t.range[0]);
        const fn = FN_RANGES.find(f => f.start <= t.range[0] && t.range[0] <= f.end && f.name === fnName);
        if (!fn) return;
        const fnBody = SCRIPT_SRC.slice(fn.start, fn.end);
        // Direct reference is the strict case.
        if (fnBody.includes('MODEL.liquidNet')) return; // ✓
        // Aliased: body assigns `<var> = MODEL` AND reads `<var>.liquidNet` (or a destructure).
        // Heuristic: body mentions `MODEL` AND mentions `.liquidNet` somewhere.
        const aliasedRead = fnBody.includes('MODEL') && /\.liquidNet\b/.test(fnBody);
        if (aliasedRead) return; // ✓ via alias
        violations.push({
          line: t.line,
          col: 0,
          evidence: `renderer of "${t.id}" (fn ${fnName}) does not reference MODEL.liquidNet (direct or aliased) — must read from MODEL`,
        });
      });
      return violations;
    },
  },

  // ─── 7. no-hardcoded-survival-mode-string ───────────────
  {
    name: 'no-hardcoded-survival-mode-string',
    severity: 'warn',
    anchor: 'future-proofing (no shipped bug)',
    check() {
      // The canonical "declaration" is the return-string set inside getSurvivalMode().
      // Any string literal matching survival modes OUTSIDE that function is flagged.
      const violations = [];
      walk.simple(ast, {
        Literal(node) {
          if (typeof node.value !== 'string') return;
          if (!SURVIVAL_MODE_STRINGS.has(node.value)) return;
          const fn = enclosingFn(node.range[0]);
          if (fn === 'getSurvivalMode') return; // canonical
          violations.push({
            line: fileLine(node.loc.start.line),
            col: node.loc.start.column,
            evidence: `string "${node.value}" — extract to SURVIVAL_MODES constant (in ${fn || '<top-level>'})`,
          });
        },
      });
      return violations;
    },
  },

  // ─── 8. no-hardcoded-debt-strategy-string ───────────────
  {
    name: 'no-hardcoded-debt-strategy-string',
    severity: 'warn',
    anchor: 'future-proofing (no shipped bug)',
    check() {
      const violations = [];
      walk.simple(ast, {
        Literal(node) {
          if (typeof node.value !== 'string') return;
          if (!DEBT_STRATEGY_STRINGS.has(node.value)) return;
          // `S.debtStrategy = 'avalanche'` initialization in S declaration is canonical.
          // Hard to detect that purely — exempt the S const-init range (lines 1103–1146 region).
          // Use a simpler heuristic: exempt if the literal is the right-hand of `S.debtStrategy =`.
          // (Probably overkill; just flag and let allow-list document.)
          violations.push({
            line: fileLine(node.loc.start.line),
            col: node.loc.start.column,
            evidence: `string "${node.value}" — extract to DEBT_STRATEGIES constant`,
          });
        },
      });
      return violations;
    },
  },

  // ─── 9. auditor-record-no-trivial-pass ──────────────────
  {
    name: 'auditor-record-no-trivial-pass',
    severity: 'fail',
    anchor: 'RC10',
    check() {
      // Find AUDITOR.record method body; verify it has the Bundle-A fix
      // (action === 'CONSISTENCY_FAIL' ? false : ...) preceding the < 0.02 trivial-pass formula.
      const violations = [];
      let auditorRecordBody = null;

      walk.simple(ast, {
        VariableDeclarator(node) {
          if (node.id && node.id.name === 'AUDITOR' && node.init && node.init.type === 'ObjectExpression') {
            const recordProp = node.init.properties.find(p => {
              const key = p.key && (p.key.name || p.key.value);
              return key === 'record';
            });
            if (recordProp && recordProp.value && recordProp.value.body) {
              auditorRecordBody = recordProp.value;
            }
          }
        },
      });

      if (!auditorRecordBody) {
        violations.push({
          line: 0, col: 0,
          evidence: 'AUDITOR.record method not found (or shape changed)',
        });
        return violations;
      }

      const bodySrc = SCRIPT_SRC.slice(auditorRecordBody.range[0], auditorRecordBody.range[1]);
      // Look for the conditional shape:
      //   ok: action === 'CONSISTENCY_FAIL' ? false : (... < 0.02 ...)
      const hasFailGuard = /['"]CONSISTENCY_FAIL['"]\s*\?\s*false/.test(bodySrc);
      const hasTrivialFallthrough = /<\s*0\.02\s*:\s*true/.test(bodySrc);

      if (!hasFailGuard && hasTrivialFallthrough) {
        // Bundle-A fix missing — find the line with < 0.02 to point at.
        const idx = bodySrc.indexOf('< 0.02');
        const linesBefore = bodySrc.slice(0, idx).split('\n').length - 1;
        violations.push({
          line: fileLine(auditorRecordBody.loc.start.line + linesBefore),
          col: 0,
          evidence: `AUDITOR.record marks failures as ok:true via "Math.abs(...) < 0.02 : true" without CONSISTENCY_FAIL guard`,
        });
      }
      return violations;
    },
  },

  // ─── 10. tdz-safe-engine-access ─────────────────────────
  {
    name: 'tdz-safe-engine-access',
    severity: 'fail',
    anchor: '56896d8',
    check() {
      const violations = [];
      walk.simple(ast, {
        MemberExpression(node) {
          if (!node.object || node.object.name !== 'PLAN') return;
          if (planDeclEnd < 0) return; // PLAN not found
          if (node.range[0] >= planDeclEnd) return; // after declaration — fine
          if (isTdzGuarded(node.range[0])) return;
          violations.push({
            line: fileLine(node.loc.start.line),
            col: node.loc.start.column,
            evidence: `PLAN.${node.property && node.property.name} referenced before const declaration without TDZ guard`,
          });
        },
      });
      return violations;
    },
  },

  // ─── 11. copy-export-strips-secrets ─────────────────────
  // Mission EXPORT (commit bb30b86) factored the export-build path out
  // into buildFullExport(); both copyExport and exportAsFile call it.
  // This rule now follows the build wherever it lives — checks
  // buildFullExport's body if present, falls back to copyExport for
  // backwards compat. Either function must strip apiKey + chatHistory.
  {
    name: 'copy-export-strips-secrets',
    severity: 'fail',
    anchor: 'security',
    check() {
      const violations = [];
      let buildBody = null;
      let copyExportBody = null;
      walk.simple(ast, {
        FunctionDeclaration(node) {
          if (!node.id) return;
          if (node.id.name === 'buildFullExport') buildBody = node;
          if (node.id.name === 'copyExport') copyExportBody = node;
        },
      });
      const target = buildBody || copyExportBody;
      const targetName = buildBody ? 'buildFullExport' : 'copyExport';
      if (!target) {
        violations.push({ line: 0, col: 0, evidence: 'neither buildFullExport nor copyExport found' });
        return violations;
      }
      const src = SCRIPT_SRC.slice(target.range[0], target.range[1]);
      if (!/delete\s+\w+\.apiKey/.test(src)) {
        violations.push({
          line: fileLine(target.loc.start.line),
          col: 0,
          evidence: targetName + ' does not delete apiKey from export payload',
        });
      }
      if (!/delete\s+\w+\.chatHistory/.test(src)) {
        violations.push({
          line: fileLine(target.loc.start.line),
          col: 0,
          evidence: targetName + ' does not delete chatHistory from export payload',
        });
      }
      return violations;
    },
  },

  // ─── 12. no-third-discretionary-filter-array ────────────
  {
    name: 'no-third-discretionary-filter-array',
    severity: 'fail',
    anchor: 'RC2',
    check() {
      // Walk for ArrayExpression literals containing 3+ category strings that
      // overlap with _NON_SPEND_CATS or EXCLUDED_CATS contents.
      const KNOWN_CAT_STRINGS = new Set([
        'Debt repayment', 'Income', 'Savings', 'Bills', 'Transfer',
        'Loan', 'Car Loan', 'CC Payment',
      ]);
      const violations = [];
      walk.simple(ast, {
        ArrayExpression(node) {
          if (!node.elements || node.elements.length < 3) return;
          let catStringCount = 0;
          for (const el of node.elements) {
            if (el && el.type === 'Literal' && typeof el.value === 'string'
                && KNOWN_CAT_STRINGS.has(el.value)) {
              catStringCount++;
            }
          }
          if (catStringCount < 3) return;
          // Exempt the canonical declarations (_NON_SPEND_CATS, EXCLUDED_CATS).
          // Detect by: parent is a Set constructor, or assigned to a name starting with _NON_SPEND or EXCLUDED.
          const localSrcStart = Math.max(0, node.range[0] - 60);
          const ctxBefore = SCRIPT_SRC.slice(localSrcStart, node.range[0]);
          if (/_NON_SPEND_CATS\s*=/.test(ctxBefore)) return;
          if (/EXCLUDED_CATS\s*=/.test(ctxBefore)) return;
          if (/new\s+Set\s*\(\s*$/.test(ctxBefore)) return;
          // Additionally exempt inside getMinDailySpend (its NON_DISC list)
          const fn = enclosingFn(node.range[0]);
          if (fn === 'getMinDailySpend') return;
          violations.push({
            line: fileLine(node.loc.start.line),
            col: node.loc.start.column,
            evidence: `array literal of ${catStringCount} category strings inside ${fn || '<top-level>'} — likely third parallel discretionary filter`,
          });
        },
      });
      return violations;
    },
  },

  // ─── (was) magic-key-format-only-via-helper — DROPPED ──
  // First-run probe showed 18 false positives (HTML templates with multi-part
  // expressions and dashes). The codebase doesn't actually use template
  // literals for paidBills key construction — Bundle B uses BinaryExpression
  // concat, which is caught by no-inline-paidbills-key-construction (rule 2).
  // The template-literal form was speculative; dropping until/unless a real
  // paidBills key template literal appears in source.

  // ─── 13. no-getmonthlysurplus ───────────────────────────
  {
    name: 'no-getmonthlysurplus',
    severity: 'fail',
    anchor: 'historical (deleted helper)',
    check() {
      const violations = [];
      walk.simple(ast, {
        Identifier(node) {
          if (node.name === 'getMonthlySurplus') {
            violations.push({
              line: fileLine(node.loc.start.line),
              col: node.loc.start.column,
              evidence: 'identifier "getMonthlySurplus" — helper was deleted; reintroduction forbidden',
            });
          }
        },
      });
      return violations;
    },
  },

  // ─── 15. no-real-pin-constant ───────────────────────────
  {
    name: 'no-real-pin-constant',
    severity: 'fail',
    anchor: 'security',
    check() {
      const violations = [];
      walk.simple(ast, {
        Identifier(node) {
          if (node.name === 'REAL_PIN') {
            violations.push({
              line: fileLine(node.loc.start.line),
              col: node.loc.start.column,
              evidence: 'identifier "REAL_PIN" — security legacy lint',
            });
          }
        },
      });
      return violations;
    },
  },

  // ─── 16. daysleft-uses-math-max-1 ───────────────────────
  {
    name: 'daysleft-uses-math-max-1',
    severity: 'fail',
    anchor: 'division-by-zero severity',
    check() {
      const violations = [];
      let daysLeftBody = null;
      walk.simple(ast, {
        FunctionDeclaration(node) {
          if (node.id && node.id.name === 'daysLeft') daysLeftBody = node;
        },
      });
      if (!daysLeftBody) {
        violations.push({ line: 0, col: 0, evidence: 'daysLeft function not found' });
        return violations;
      }
      const src = SCRIPT_SRC.slice(daysLeftBody.range[0], daysLeftBody.range[1]);
      if (!/Math\.max\(\s*1\b/.test(src)) {
        violations.push({
          line: fileLine(daysLeftBody.loc.start.line),
          col: 0,
          evidence: 'daysLeft body lacks Math.max(1, ...) guard — division-by-zero risk in getMaxDay',
        });
      }
      return violations;
    },
  },

  // ─── 17. no-inline-daysleft-outside-canonical ───────────
  // Mission F: after migration, every renderer/helper consumes
  // MODEL.daysToPayday as the single source of truth for "days until
  // payday." The only callers of daysLeft(...) post-migration are:
  //   1. the function definition body (no recursive calls today, but
  //      scope-allowed for future refactors)
  //   2. MI-15's canonical comparison (the structural-sanity check)
  //   3. HEALTH self-check that validates the helper's contract
  //   4. diagnostic export field that reports the helper's value
  // Sites 2-4 carry guardian-allow comments. Anything else firing this
  // rule is a regression to the parallel-implementation pattern that
  // OPEN-BUGS #22 documents.
  {
    name: 'no-inline-daysleft-outside-canonical',
    severity: 'fail',
    anchor: 'OPEN-BUGS#22',
    check() {
      const violations = [];
      // Find the daysLeft function body's range so we can exempt internal calls.
      let daysLeftRange = null;
      walk.simple(ast, {
        FunctionDeclaration(node) {
          if (node.id && node.id.name === 'daysLeft') {
            daysLeftRange = node.range;
          }
        },
      });
      walk.simple(ast, {
        CallExpression(node) {
          if (!node.callee || node.callee.type !== 'Identifier') return;
          if (node.callee.name !== 'daysLeft') return;
          // Exempt calls inside the daysLeft function definition itself.
          if (daysLeftRange
              && node.range[0] >= daysLeftRange[0]
              && node.range[1] <= daysLeftRange[1]) {
            return;
          }
          violations.push({
            line: fileLine(node.loc.start.line),
            col: node.loc.start.column,
            evidence: 'inline daysLeft(...) call — use MODEL.daysToPayday instead (single source of truth)',
          });
        },
      });
      return violations;
    },
  },

];

// ─── Run rules ────────────────────────────────────────────────────────────
const findings = [];
const allowsUsed = new Set();

for (const rule of RULES) {
  let raw;
  try {
    raw = rule.check(ast, SCRIPT_SRC);
  } catch (e) {
    console.error(`❌ Rule "${rule.name}" threw during check: ${e.message}`);
    if (e.stack) console.error(e.stack.split('\n').slice(0, 4).join('\n'));
    findings.push({
      rule: rule.name, severity: 'fail', line: 0, col: 0,
      evidence: '(rule check threw)', error: e.message,
    });
    continue;
  }
  for (const v of raw) {
    // Per-line single allow.
    const allows = allowMap.get(v.line);
    if (allows && allows[rule.name]) {
      allowsUsed.add(`${rule.name}:${v.line}`);
      continue;
    }
    // Block allow.
    if (isInBlockAllow(rule.name, v.line)) {
      allowsUsed.add(`${rule.name}:block:${v.line}`);
      continue;
    }
    findings.push({
      rule: rule.name,
      severity: rule.severity,
      anchor: rule.anchor,
      line: v.line,
      col: v.col,
      evidence: v.evidence,
    });
  }
}

// ─── Manifest ─────────────────────────────────────────────────────────────
function writeAllowListManifest() {
  const byRule = {};
  // Single allows.
  for (const [targetLine, ruleMap] of allowMap.entries()) {
    for (const [rule, parsed] of Object.entries(ruleMap)) {
      if (!byRule[rule]) byRule[rule] = [];
      byRule[rule].push({
        type: 'single',
        line: targetLine,
        removability: parsed.removability,
        reason: parsed.reason,
        condition: parsed.condition,
        used: allowsUsed.has(`${rule}:${targetLine}`),
      });
    }
  }
  // Block allows.
  for (const b of blockAllows) {
    if (!byRule[b.rule]) byRule[b.rule] = [];
    byRule[b.rule].push({
      type: 'block',
      startLine: b.startLine,
      endLine: b.endLine,
      removability: b.removability,
      reason: b.reason,
      condition: b.condition,
      used: b.used,
    });
  }
  for (const rule of Object.keys(byRule)) {
    byRule[rule].sort((a, b) => (a.line || a.startLine) - (b.line || b.startLine));
  }
  const totalAllows = Object.values(byRule).reduce((s, arr) => s + arr.length, 0);
  const unused = Object.values(byRule).flat().filter(e => !e.used).length;
  const manifest = {
    lastGenerated: new Date().toISOString(),
    totalAllows,
    unusedAllows: unused,
    byRule,
  };
  if (!fs.existsSync(path.dirname(ALLOW_LIST_PATH))) {
    fs.mkdirSync(path.dirname(ALLOW_LIST_PATH), { recursive: true });
  }
  fs.writeFileSync(ALLOW_LIST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
const manifest = writeAllowListManifest();

// ─── Output ───────────────────────────────────────────────────────────────
console.log('🛡️  GUARDIAN LAYER 1 — STATIC ANALYSIS\n');
console.log('━'.repeat(64));
console.log(`Script: ${SCRIPT_SRC.length} bytes, parsed in ${parseMs}ms`);
console.log(`Rules: ${RULES.length} active`);
console.log(`Allow-list: ${manifest.totalAllows} entries (${manifest.unusedAllows} unused)`);
console.log('━'.repeat(64));

if (malformedAllows.length) {
  console.log(`\n⚠️  ${malformedAllows.length} malformed guardian-allow comment(s):`);
  malformedAllows.forEach(m => console.log(`   L${m.fileLine}: ${m.error}`));
}

const fails = findings.filter(f => f.severity === 'fail');
const warns = findings.filter(f => f.severity === 'warn');

if (fails.length) {
  console.log(`\n❌ ${fails.length} FAIL finding(s):\n`);
  // Group by rule for readability.
  const byRuleF = {};
  fails.forEach(f => { (byRuleF[f.rule] = byRuleF[f.rule] || []).push(f); });
  Object.entries(byRuleF).forEach(([rule, list]) => {
    console.log(`   ${rule} (anchor: ${list[0].anchor || 'n/a'}) — ${list.length} violation(s)`);
    list.slice(0, 8).forEach(f => console.log(`     L${f.line}:${f.col}  ${f.evidence}`));
    if (list.length > 8) console.log(`     ... and ${list.length - 8} more`);
  });
}

if (warns.length) {
  console.log(`\n⚠️  ${warns.length} WARN finding(s):\n`);
  const byRuleW = {};
  warns.forEach(f => { (byRuleW[f.rule] = byRuleW[f.rule] || []).push(f); });
  Object.entries(byRuleW).forEach(([rule, list]) => {
    console.log(`   ${rule} (anchor: ${list[0].anchor || 'n/a'}) — ${list.length} violation(s)`);
    list.slice(0, 6).forEach(f => console.log(`     L${f.line}:${f.col}  ${f.evidence}`));
    if (list.length > 6) console.log(`     ... and ${list.length - 6} more`);
  });
}

if (!fails.length && !warns.length && !malformedAllows.length) {
  console.log('\n✅ No findings. All rules pass.');
}

console.log('\n' + '━'.repeat(64));

const hasFail = fails.length > 0 || malformedAllows.length > 0;
process.exit(hasFail ? 1 : 0);
