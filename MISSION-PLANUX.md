Read index.html fully — especially lines 9200–9285 (WRX card 
inline in renderPlanMode) and lines 3725–3740 (markDebtCovered).
Run node guardian-all.js and confirm 50/50 before starting.

You are doing two things in this session:
1. Fix all "Owed to Mum" string references that will silently 
   break after the _mumReframed migration renames it.
2. Build the full Plan Mode UX overhaul — proper modals,
   editable tiles, info bubbles, validated locking.

Design philosophy:
Every number in plan mode must be tappable and explainable.
Every edit must use a proper slide-up modal — no prompt(),
no confirm(), no alert() anywhere in plan mode.
Every calculation must show its working when tapped.
Title Case on every user-facing string in plan mode.
The user is learning financial literacy through this app —
confusion is failure, clarity is success.

One fix at a time. Verify each. Guardian after each.
Do not push until all verification strings confirmed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 1 — REPAIR "OWED TO MUM" STRING REFERENCES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The _mumReframed migration renames the debt to 
"Property Deposit (via Mum)" but 14 string literals 
still search for "Owed to Mum" and will silently fail.

Fix each location to search for BOTH names so it works
before and after migration:

Helper to add before closing </script>:
function findMumDebt() {
  return S.debts.find(d => 
    d.name === 'Property Deposit (via Mum)' || 
    d.name === 'Owed to Mum'
  );
}

Now find and update every location that does:
S.debts.find(d => d.name === 'Owed to Mum')
Replace each with:
findMumDebt()

Locations to fix (from snapshot report):
- Line ~3725: markDebtCovered mum debt lookup
- Line ~3735: another markDebtCovered reference  
- Line ~3738: and another
- Line ~4822: quickLogTxn from-person path
- Line ~4827: another from-person reference
- Line ~4828: another
- Line ~5225: generateSnapshot fallback
- Line ~5635: chat system prompt — update to:
  'Property Deposit (via Mum) / Owed to Mum: $' + 
  (findMumDebt()?.amt?.toFixed(2) || '0')
- Line ~8806: goal tracker
- Line ~8809: goal tracker

Also update seed defaults:
Find index.html line ~1163: wrxValue: 21000
Change to: wrxValue: 25000

Find the two seed entries that create "Owed to Mum" 
(lines ~6039 and ~6156):
Change name: 'Owed to Mum' to 
name: 'Property Deposit (via Mum)'
in both seed entries so fresh installs are consistent.

VERIFY: Search "Owed to Mum" — should only appear in 
migration lookup code (the _mumReframed block itself)
and nowhere else as a standalone string.
VERIFY: Search "findMumDebt" — must find at 8+ locations.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 2 — PLAN MODAL SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PLAN_MODAL does not exist. Build it.

Add this HTML inside the #plan-mode div,
BEFORE the #plan-content div:

<div id="plan-modal-overlay" style="
  display:none;
  position:fixed;
  inset:0;
  background:rgba(0,0,0,0.85);
  z-index:601;
  align-items:flex-end;
  justify-content:center;
  padding-bottom:env(safe-area-inset-bottom)">
  <div id="plan-modal-content" style="
    background:#0f1623;
    border-radius:24px 24px 0 0;
    padding:24px 24px 40px;
    width:100%;
    max-width:480px;
    max-height:88vh;
    overflow-y:auto;
    box-sizing:border-box">
  </div>
</div>

Add the PLAN_MODAL controller object before closing </script>:

const PLAN_MODAL = {
  open(html) {
    const overlay = document.getElementById('plan-modal-overlay');
    const content = document.getElementById('plan-modal-content');
    if (!overlay || !content) return;
    content.innerHTML = html;
    overlay.style.display = 'flex';
    // Focus first input if present
    setTimeout(() => {
      const first = content.querySelector('input, textarea');
      if (first) first.focus();
    }, 100);
  },

  close() {
    const overlay = document.getElementById('plan-modal-overlay');
    if (overlay) overlay.style.display = 'none';
  },

  header(title, subtitle) {
    return `
    <div style="display:flex;justify-content:space-between;
      align-items:flex-start;margin-bottom:20px">
      <div style="flex:1;padding-right:12px">
        <div style="color:#fff;font-size:18px;font-weight:700;
          line-height:1.3">${title}</div>
        ${subtitle ? `<div style="color:rgba(255,255,255,0.4);
          font-size:13px;margin-top:6px;line-height:1.5">
          ${subtitle}</div>` : ''}
      </div>
      <button onclick="PLAN_MODAL.close()" style="
        background:rgba(255,255,255,0.08);border:none;
        border-radius:50%;min-width:32px;height:32px;
        color:rgba(255,255,255,0.6);font-size:20px;
        cursor:pointer;line-height:1;flex-shrink:0">×</button>
    </div>`;
  },

  field(label, id, value, type, hint) {
    return `
    <div style="margin-bottom:16px">
      <div style="color:rgba(255,255,255,0.5);font-size:11px;
        text-transform:uppercase;letter-spacing:1px;
        margin-bottom:6px">${label}</div>
      ${hint ? `<div style="color:rgba(255,255,255,0.3);
        font-size:11px;margin-bottom:8px;line-height:1.5">
        ${hint}</div>` : ''}
      <input id="${id}" type="${type || 'text'}" 
        value="${String(value || '').replace(/"/g, '&quot;')}"
        autocomplete="off" autocorrect="off" spellcheck="false"
        inputmode="${type === 'number' ? 'decimal' : 'text'}"
        style="width:100%;padding:14px;
        background:rgba(255,255,255,0.07);
        border:1px solid rgba(255,255,255,0.12);
        border-radius:12px;color:#fff;font-size:16px;
        box-sizing:border-box;-webkit-appearance:none">
    </div>`;
  },

  textarea(label, id, value, hint) {
    return `
    <div style="margin-bottom:16px">
      <div style="color:rgba(255,255,255,0.5);font-size:11px;
        text-transform:uppercase;letter-spacing:1px;
        margin-bottom:6px">${label}</div>
      ${hint ? `<div style="color:rgba(255,255,255,0.3);
        font-size:11px;margin-bottom:8px;line-height:1.5">
        ${hint}</div>` : ''}
      <textarea id="${id}" rows="3" autocomplete="off"
        style="width:100%;padding:14px;
        background:rgba(255,255,255,0.07);
        border:1px solid rgba(255,255,255,0.12);
        border-radius:12px;color:#fff;font-size:15px;
        resize:none;box-sizing:border-box;
        font-family:inherit">${value || ''}</textarea>
    </div>`;
  },

  select(label, id, options, selected, hint) {
    return `
    <div style="margin-bottom:16px">
      <div style="color:rgba(255,255,255,0.5);font-size:11px;
        text-transform:uppercase;letter-spacing:1px;
        margin-bottom:6px">${label}</div>
      ${hint ? `<div style="color:rgba(255,255,255,0.3);
        font-size:11px;margin-bottom:8px">${hint}</div>` : ''}
      <select id="${id}" style="width:100%;padding:14px;
        background:rgba(255,255,255,0.07);
        border:1px solid rgba(255,255,255,0.12);
        border-radius:12px;color:#fff;font-size:15px;
        box-sizing:border-box;-webkit-appearance:none">
        ${options.map(o => `
        <option value="${o.value}" 
          ${o.value === selected ? 'selected' : ''}
          style="background:#0f1623">
          ${o.label}
        </option>`).join('')}
      </select>
    </div>`;
  },

  info(text) {
    return `
    <div style="background:rgba(78,205,196,0.08);
      border:1px solid rgba(78,205,196,0.2);
      border-radius:10px;padding:12px;margin-bottom:16px">
      <div style="color:rgba(255,255,255,0.6);font-size:13px;
        line-height:1.6">💡 ${text}</div>
    </div>`;
  },

  warning(text) {
    return `
    <div style="background:rgba(255,107,53,0.1);
      border:1px solid rgba(255,107,53,0.3);
      border-radius:10px;padding:12px;margin-bottom:16px">
      <div style="color:#FF6B35;font-size:13px;
        line-height:1.6">⚠️ ${text}</div>
    </div>`;
  },

  btn(label, onclick, primary, danger) {
    const bg = danger ? 'rgba(231,76,60,0.2)' :
      primary ? 'linear-gradient(135deg,#4ECDC4,#26d0ce)' :
      'rgba(255,255,255,0.08)';
    const border = danger ? '1px solid rgba(231,76,60,0.5)' :
      primary ? 'none' : '1px solid rgba(255,255,255,0.12)';
    const color = primary ? '#000' : 
      danger ? '#E74C3C' : '#fff';
    return `
    <button onclick="${onclick}" style="
      width:100%;padding:14px;margin-bottom:8px;
      background:${bg};border:${border};
      border-radius:12px;color:${color};
      font-weight:${primary ? '800' : '500'};
      font-size:15px;cursor:pointer;
      font-family:inherit">${label}</button>`;
  }
};

// Close modal when tapping overlay background
document.getElementById('plan-modal-overlay')
  ?.addEventListener('click', function(e) {
    if (e.target === this) PLAN_MODAL.close();
  });

VERIFY: Search "PLAN_MODAL" — must find at 5+ locations.
VERIFY: Search "plan-modal-overlay" — must find.
VERIFY: Search "plan-modal-content" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 3 — WRX CARD EXTRACTION AND REBUILD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The WRX card is inline in renderPlanMode (lines ~9230–9285).
Extract it to a standalone function and rebuild with:
- Correct framing (WRX unencumbered, proceeds pay off KIA)
- Editable sale price via PLAN_MODAL
- Info tap on KIA loan balance
- Correct early repayment fee calculation (~$395 not $17)
- Freed per month shows breakdown
- Negative net worth with correct sign and red colour

Add this function before renderPlanMode():

function renderWrxCard() {
  const wrxSold = S.wrxStatus === 'sold';
  const wrxListed = S.wrxStatus === 'listed';
  const salePrice = S.wrxValue || 25000;
  const kiaLoan = S.carloan || 0;
  const kiaRate = S.carLoanRate || 9.87;
  const monthlyInterest = kiaLoan * kiaRate / 100 / 12;
  const earlyRepayFee = parseFloat((monthlyInterest * 2).toFixed(2));
  const netAfterPayoff = salePrice - kiaLoan - earlyRepayFee;
  const interestSaved = parseFloat((monthlyInterest * 18).toFixed(2));
  const daysListed = S.wrxListedDate
    ? Math.ceil((Date.now() - new Date(S.wrxListedDate)) / 86400000)
    : 0;
  const dailyInterest = parseFloat(
    (kiaLoan * kiaRate / 100 / 365).toFixed(2)
  );

  const borderColor = wrxSold ? '#4ECDC4' :
    wrxListed ? '#FF6B35' : '#E74C3C';
  const bgColor = wrxSold ? 'rgba(78,205,196,0.08)' :
    wrxListed ? 'rgba(255,107,53,0.06)' : 
    'rgba(231,76,60,0.06)';

  return `
  <div style="background:${bgColor};border:1px solid ${borderColor};
    border-radius:16px;padding:16px;margin-bottom:16px">

    <!-- Header -->
    <div style="display:flex;justify-content:space-between;
      align-items:center;margin-bottom:16px">
      <div style="color:#fff;font-size:15px;font-weight:700">
        🚗 WRX — ${wrxSold ? 'Sold ✅' :
          wrxListed ? 'Listed — Waiting For Buyer' :
          'Not Listed Yet'}
      </div>
      ${!wrxSold ? `
      <div style="color:rgba(255,255,255,0.4);font-size:11px;
        text-align:right">
        $${dailyInterest}/day<br>KIA interest
      </div>` : ''}
    </div>

    ${wrxSold ? `
    <div style="color:#4ECDC4;font-size:14px;text-align:center;
      padding:12px">
      ✅ WRX Sold — KIA Loan Being Cleared
    </div>` : `

    <!-- The Plan -->
    <div style="background:rgba(255,255,255,0.04);border-radius:12px;
      padding:12px;margin-bottom:12px">
      <div style="color:rgba(255,255,255,0.4);font-size:10px;
        text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">
        The Plan
      </div>
      <div style="color:rgba(255,255,255,0.7);font-size:13px;
        line-height:1.7">
        Sell WRX → Pay Off KIA Loan → Free $780/Month
      </div>
    </div>

    <!-- Sale Price — editable -->
    <div style="background:rgba(255,255,255,0.05);border-radius:12px;
      padding:14px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;
        align-items:center">
        <div>
          <div style="color:rgba(255,255,255,0.4);font-size:10px;
            text-transform:uppercase;letter-spacing:1px;
            margin-bottom:6px">Listed Sale Price</div>
          <div style="color:#fff;font-size:24px;font-weight:800">
            $${salePrice.toLocaleString()}
          </div>
        </div>
        <button onclick="editWrxPrice()" style="
          background:rgba(255,255,255,0.08);
          border:1px solid rgba(255,255,255,0.15);
          border-radius:10px;color:rgba(255,255,255,0.7);
          padding:8px 14px;font-size:13px;cursor:pointer">
          ✏️ Edit
        </button>
      </div>
    </div>

    <!-- KIA Loan Balance — with info -->
    <div style="background:rgba(255,107,53,0.08);border-radius:12px;
      padding:14px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;
        align-items:center">
        <div>
          <div style="color:rgba(255,255,255,0.4);font-size:10px;
            text-transform:uppercase;letter-spacing:1px;
            margin-bottom:6px">KIA Loan Balance (Firstmac)</div>
          <div style="color:#FF6B35;font-size:24px;font-weight:800">
            $${kiaLoan.toLocaleString()}
          </div>
          <div style="color:rgba(255,255,255,0.3);font-size:11px;
            margin-top:4px">
            ${kiaRate}% p.a. · $${monthlyInterest.toFixed(0)}/month interest
          </div>
        </div>
        <button onclick="showKiaLoanInfo()" style="
          background:rgba(255,255,255,0.06);
          border:1px solid rgba(255,255,255,0.1);
          border-radius:50%;width:36px;height:36px;
          color:rgba(255,255,255,0.6);font-size:16px;
          cursor:pointer">ℹ️</button>
      </div>
    </div>

    <!-- Outcome grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;
      gap:8px;margin-bottom:12px">
      <div style="background:rgba(255,255,255,0.05);
        border-radius:10px;padding:12px">
        <div style="color:rgba(255,255,255,0.4);font-size:10px;
          margin-bottom:6px">Cash After KIA Payoff</div>
        <div style="color:${netAfterPayoff >= 0 ? '#4ECDC4' : '#E74C3C'};
          font-size:18px;font-weight:700">
          ${netAfterPayoff >= 0 ? '+' : '-'}$${Math.abs(
            Math.round(netAfterPayoff)).toLocaleString()}
        </div>
        <div style="color:rgba(255,255,255,0.3);font-size:10px;
          margin-top:4px">
          ${netAfterPayoff >= 0
            ? 'Goes To Deposit Savings'
            : 'Need $' + Math.abs(Math.round(netAfterPayoff)).toLocaleString() + ' Extra'}
        </div>
      </div>
      <div style="background:rgba(78,205,196,0.08);
        border-radius:10px;padding:12px">
        <div style="color:rgba(255,255,255,0.4);font-size:10px;
          margin-bottom:6px">Freed Per Month</div>
        <div style="color:#4ECDC4;font-size:18px;font-weight:700">
          +$780
        </div>
        <div style="color:rgba(255,255,255,0.3);font-size:10px;
          margin-top:4px">KIA Loan Payment Stops</div>
      </div>
    </div>

    <!-- Early repayment -->
    <div style="background:rgba(255,255,255,0.04);border-radius:10px;
      padding:12px;margin-bottom:12px">
      <div style="color:rgba(255,255,255,0.6);font-size:12px;
        font-weight:600;margin-bottom:8px">Early Repayment Analysis</div>
      <div style="display:flex;justify-content:space-between;
        font-size:12px;margin-bottom:4px">
        <span style="color:rgba(255,255,255,0.4)">
          Fee (2 months interest)
        </span>
        <span style="color:#FF6B35">$${earlyRepayFee.toFixed(0)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;
        font-size:12px;margin-bottom:10px">
        <span style="color:rgba(255,255,255,0.4)">
          Interest Saved (~18 months)
        </span>
        <span style="color:#4ECDC4">$${interestSaved.toFixed(0)}</span>
      </div>
      <div style="color:#4ECDC4;font-size:13px;font-weight:700">
        ✅ Net Saving: $${Math.round(interestSaved - earlyRepayFee).toLocaleString()}
        — Pay Off Early
      </div>
      <div style="color:rgba(255,255,255,0.3);font-size:11px;
        margin-top:4px">
        Confirm exact fee with Firstmac before paying
      </div>
    </div>

    <!-- Listed status -->
    ${wrxListed ? `
    <div style="text-align:center;color:rgba(255,255,255,0.3);
      font-size:12px">
      Listed ${daysListed} Day${daysListed !== 1 ? 's' : ''} Ago ·
      Every Day Costs $${dailyInterest} In KIA Interest
    </div>` : ''}

    <!-- Not listed CTA -->
    ${!wrxListed && !wrxSold ? `
    <button onclick="markWrxListed()" style="
      width:100%;padding:12px;
      background:rgba(231,76,60,0.15);
      border:1px solid rgba(231,76,60,0.4);
      border-radius:10px;color:#E74C3C;
      font-size:13px;font-weight:600;cursor:pointer">
      🚗 Mark As Listed On Carsales
    </button>` : ''}
    `}
  </div>`;
}

function editWrxPrice() {
  const current = S.wrxValue || 25000;
  PLAN_MODAL.open(
    PLAN_MODAL.header('Update WRX Sale Price',
      'Enter the price you\'ve listed it for on Carsales') +
    PLAN_MODAL.field('Listed Price ($)', 'wrx-price-input',
      current, 'number',
      'This updates the cash-after-payoff and net worth calculations.') +
    PLAN_MODAL.info(
      'At $' + current.toLocaleString() + ' listed, after paying off the ' +
      'KIA loan ($' + Math.round(S.carloan||0).toLocaleString() + ') and ' +
      'early repayment fee you\'ll have approximately $' +
      Math.round(current - (S.carloan||0) - 
        ((S.carloan||0)*(S.carLoanRate||9.87)/100/12*2)).toLocaleString() +
      ' remaining.'
    ) +
    PLAN_MODAL.btn('Update Price', 'confirmWrxPrice()', true) +
    PLAN_MODAL.btn('Cancel', 'PLAN_MODAL.close()', false)
  );
}

function confirmWrxPrice() {
  const val = parseFloat(
    document.getElementById('wrx-price-input')?.value
  );
  if (isNaN(val) || val < 1000) {
    showToast('Please Enter A Valid Price');
    return;
  }
  S.wrxValue = val;
  S._wrxSlider = val;
  S._wrxPriceUpdated = true;
  onStateChange('wrx_price_updated');
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('✅ WRX Price Updated To $' + val.toLocaleString());
}

function showKiaLoanInfo() {
  const loan = S.carloan || 0;
  const rate = S.carLoanRate || 9.87;
  const original = S.carloanOriginal || 37400;
  const paidOff = original - loan;
  const pctPaid = Math.round(paidOff / original * 100);
  const monthlyInterest = loan * rate / 100 / 12;

  PLAN_MODAL.open(
    PLAN_MODAL.header('KIA Loan — Firstmac', 
      'Understanding your car loan') +
    `<div style="color:rgba(255,255,255,0.6);font-size:14px;
      line-height:1.7;margin-bottom:16px">
      This is the loan for your KIA, held by Firstmac at ${rate}% p.a.
      The loan is in your parents\' names but you manage the repayments.
      Selling the WRX gives you cash to pay this off early.
    </div>
    <div style="background:rgba(255,255,255,0.05);border-radius:12px;
      padding:14px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;
        margin-bottom:10px">
        <span style="color:rgba(255,255,255,0.5)">Original Loan</span>
        <span style="color:#fff">$${original.toLocaleString()}</span>
      </div>
      <div style="display:flex;justify-content:space-between;
        margin-bottom:10px">
        <span style="color:rgba(255,255,255,0.5)">Paid Off So Far</span>
        <span style="color:#4ECDC4">
          $${Math.round(paidOff).toLocaleString()} (${pctPaid}%)
        </span>
      </div>
      <div style="display:flex;justify-content:space-between;
        margin-bottom:10px">
        <span style="color:rgba(255,255,255,0.5)">Remaining Balance</span>
        <span style="color:#FF6B35">$${Math.round(loan).toLocaleString()}</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:rgba(255,255,255,0.5)">Monthly Interest Cost</span>
        <span style="color:#E74C3C">$${monthlyInterest.toFixed(0)}</span>
      </div>
    </div>` +
    PLAN_MODAL.info(
      'You pay $780/fortnight ($1,560/month total, ~$780/month net). ' +
      'Every month you carry this loan costs $' + 
      monthlyInterest.toFixed(0) + ' in interest alone. ' +
      'Paying it off with the WRX proceeds saves ~$' +
      Math.round(monthlyInterest * 18).toLocaleString() + 
      ' over the remaining term.'
    ) +
    PLAN_MODAL.btn('Got It', 'PLAN_MODAL.close()', true)
  );
}

function markWrxListed() {
  S.wrxStatus = 'listed';
  S.wrxListedDate = new Date().toISOString().substring(0, 10);
  onStateChange('wrx_listed');
  renderPlanMode();
  showToast('✅ WRX Marked As Listed');
}

Now find the WRX inline block inside renderPlanMode()
(lines ~9230–9285) and replace it entirely with:
html += renderWrxCard();

VERIFY: Search "renderWrxCard" — must find as function def AND call.
VERIFY: Search "editWrxPrice" — must find.
VERIFY: Search "showKiaLoanInfo" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 4 — NET WORTH SIGN AND DISPLAY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find the net worth header in renderPlanMode()
(the section showing the big net worth number at top).

The number must show:
- Negative sign when negative: -$7,305 not $7,305
- Red (#E74C3C) when negative, teal (#4ECDC4) when positive
- Subtext: "Your Real Financial Position" always

Replace the NW display block with:

const nwData = calculateNetWorth();
const nwVal = nwData.net !== undefined ? nwData.net : nwData;
const nwPositive = nwVal >= 0;
const nwDisplay = (nwPositive ? '+' : '-') + '$' +
  Math.abs(Math.round(nwVal)).toLocaleString();
const nwColour = nwPositive ? '#4ECDC4' : '#E74C3C';

html += `
<div style="text-align:center;padding:24px 0 8px">
  <div style="font-size:11px;color:rgba(255,255,255,0.35);
    text-transform:uppercase;letter-spacing:2px;margin-bottom:10px">
    Net Worth Today
  </div>
  <div style="font-size:44px;font-weight:800;color:${nwColour};
    font-variant-numeric:tabular-nums;line-height:1">
    ${nwDisplay}
  </div>
  <div style="font-size:12px;color:rgba(255,255,255,0.35);
    margin-top:8px">
    Your Real Financial Position
  </div>
  <button onclick="showNetWorthBreakdown()" style="
    margin-top:10px;background:rgba(255,255,255,0.06);
    border:1px solid rgba(255,255,255,0.1);
    border-radius:20px;color:rgba(255,255,255,0.5);
    padding:6px 16px;font-size:12px;cursor:pointer">
    See Breakdown ›
  </button>
</div>`;

Add showNetWorthBreakdown():
function showNetWorthBreakdown() {
  const nw = calculateNetWorth();
  const b = nw.breakdown || {};
  PLAN_MODAL.open(
    PLAN_MODAL.header('Net Worth Breakdown',
      'Assets minus everything you owe') +
    `<div style="margin-bottom:16px">
      <div style="color:#4ECDC4;font-size:12px;font-weight:700;
        text-transform:uppercase;letter-spacing:1px;
        margin-bottom:8px">Assets</div>
      ${[
        ['WRX (Listed For Sale)', b.wrxValue || 0],
        ['Virgin Money Balance', b.cashBalance || 0],
        ['Deposit Account (Mum)', b.mumAccount || 0],
        ['Savings Buckets', b.savings || 0]
      ].map(([label, val]) => `
      <div style="display:flex;justify-content:space-between;
        padding:6px 0;font-size:13px;
        border-bottom:1px solid rgba(255,255,255,0.04)">
        <span style="color:rgba(255,255,255,0.6)">${label}</span>
        <span style="color:#fff">$${Math.round(val).toLocaleString()}</span>
      </div>`).join('')}
      <div style="display:flex;justify-content:space-between;
        padding:8px 0;font-size:14px;font-weight:700">
        <span style="color:rgba(255,255,255,0.8)">Total Assets</span>
        <span style="color:#4ECDC4">
          $${Math.round(nw.assets).toLocaleString()}
        </span>
      </div>
    </div>
    <div style="margin-bottom:16px">
      <div style="color:#E74C3C;font-size:12px;font-weight:700;
        text-transform:uppercase;letter-spacing:1px;
        margin-bottom:8px">Liabilities</div>
      ${[
        ['KIA Loan (Firstmac)', b.kiaLoan || 0],
        ['Credit Card', b.creditCard || 0],
        ['Immediate Debts', b.immediateDebts || 0]
      ].filter(([,v]) => v > 0).map(([label, val]) => `
      <div style="display:flex;justify-content:space-between;
        padding:6px 0;font-size:13px;
        border-bottom:1px solid rgba(255,255,255,0.04)">
        <span style="color:rgba(255,255,255,0.6)">${label}</span>
        <span style="color:#E74C3C">
          -$${Math.round(val).toLocaleString()}
        </span>
      </div>`).join('')}
      <div style="display:flex;justify-content:space-between;
        padding:8px 0;font-size:14px;font-weight:700">
        <span style="color:rgba(255,255,255,0.8)">Total Liabilities</span>
        <span style="color:#E74C3C">
          -$${Math.round(nw.liabilities).toLocaleString()}
        </span>
      </div>
    </div>
    <div style="background:rgba(255,255,255,0.05);border-radius:12px;
      padding:14px;display:flex;justify-content:space-between;
      align-items:center">
      <span style="color:#fff;font-size:16px;font-weight:700">
        Net Worth
      </span>
      <span style="font-size:20px;font-weight:800;
        color:${nw.net >= 0 ? '#4ECDC4' : '#E74C3C'}">
        ${nw.net >= 0 ? '+' : '-'}$${Math.abs(Math.round(nw.net)).toLocaleString()}
      </span>
    </div>` +
    PLAN_MODAL.btn('Close', 'PLAN_MODAL.close()', true)
  );
}

VERIFY: Search "showNetWorthBreakdown" — must find.
VERIFY: Net worth header uses nwColour variable.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 5 — PAYDAY ALLOCATION REBUILD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find renderPaydayAllocation() and rebuild it to reflect:
- Rent $500 + Deposit Savings $2,500 shown separately
- Validation before locking warns if living costs too low
- LOCKED ✓ state shows after locking
- Info bubble on each slider category

In the locked non-negotiable section replace the 
single "Rent $3,000" line with:

// Get mum structure
const mumDebt = findMumDebt();
const rentAmt = mumDebt?.rentComponent || 500;
const depositAmt = mumDebt?.debtComponent || 2500;
const mumBalance = S.mumAccountBalance || 0;
const mumTarget = 50000;
const mumPct = Math.min(100, (mumBalance / mumTarget * 100));
const monthsToTarget = depositAmt > 0
  ? Math.ceil((mumTarget - mumBalance) / depositAmt)
  : 999;

Show these two lines in the locked section:
- "🏠 Rent (To Mum): $500"  
- "💰 Deposit Savings: $2,500 → [progress bar showing mumBalance/$50k]"

Below the deposit savings line show:
"$${mumBalance.toLocaleString()} saved of $50,000 · 
 On track for [dateFromMonths(monthsToTarget)]"

In lockPaydayPlan() add validation:
function lockPaydayPlan() {
  // Calculate what's left for living
  const stored = JSON.parse(
    localStorage.getItem('slyght_payday_plan') || '{}'
  );
  const totalGoalAlloc = 
    (stored.china || 0) + (stored.apartment || 0) + 
    (stored.freedom || 0) + (stored.darwin || 0);
  const income = PLAN.INCOME_MONTHLY + (S._pendingBonus || 0);
  const fixedTotal = BILLS
    .filter(b => b.recurring && 
      ['Fixed','Loan'].includes(b.tag))
    .reduce((s,b) => s+b.amt, 0);
  const provisions = PLAN.getTotalProvisions();
  const discretionary = Math.max(0, 
    income - fixedTotal - provisions - 500 - 2500
  );
  const living = Math.max(0, discretionary - totalGoalAlloc);
  const days = daysLeft();
  const perDay = days > 0 ? living / days : 0;

  if (perDay < 15) {
    PLAN_MODAL.open(
      PLAN_MODAL.header('⚠️ Living Budget Very Tight',
        'Before you lock this plan') +
      PLAN_MODAL.warning(
        'This plan leaves only $' + perDay.toFixed(0) + 
        '/day for food, transport and daily life. ' +
        'That\'s very tight — consider reducing your ' +
        'savings allocations by $' + 
        Math.round((15 - perDay) * days).toLocaleString() + 
        ' to give yourself more breathing room.'
      ) +
      PLAN_MODAL.btn(
        'Lock Anyway — I\'ll Be Disciplined', 
        'confirmLockPaydayPlan()', true
      ) +
      PLAN_MODAL.btn(
        'Go Back And Adjust', 
        'PLAN_MODAL.close()', false
      )
    );
    return;
  }

  confirmLockPaydayPlan();
}

function confirmLockPaydayPlan() {
  const stored = JSON.parse(
    localStorage.getItem('slyght_payday_plan') || '{}'
  );
  stored.locked = true;
  stored.lockedAt = new Date().toISOString();
  stored.payday = S.payday;
  localStorage.setItem('slyght_payday_plan', 
    JSON.stringify(stored));
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('✅ Plan Locked — SLYGHT Will Hold You To This');
}

Show LOCKED state in the UI:
In renderPaydayAllocation() check if plan is locked:
const planData = JSON.parse(
  localStorage.getItem('slyght_payday_plan') || '{}'
);
const isLocked = planData.locked && 
  planData.payday === S.payday;

If locked show a green "PLAN LOCKED ✓" banner at top
of the allocation section and change the lock button to:
"Update Plan" (which calls unlockAndEdit())

function unlockAndEdit() {
  const stored = JSON.parse(
    localStorage.getItem('slyght_payday_plan') || '{}'
  );
  stored.locked = false;
  localStorage.setItem('slyght_payday_plan', 
    JSON.stringify(stored));
  renderPlanMode();
  showToast('Plan Unlocked — Adjust And Re-Lock');
}

Add info bubbles — each slider label has an ℹ️ button:

function showSliderInfo(id) {
  const info = {
    china: {
      title: '🇨🇳 China Holiday',
      body: 'Your monthly contribution to the China trip at ' +
        'end of 2026. Staying with her family and friends ' +
        'so this is spending money only. Her estimate: ' +
        '$5,000 excluding flights.',
      tip: 'The June bonus alone could put you halfway there.'
    },
    apartment: {
      title: '🏠 Deposit Savings (Extra)',
      body: 'Additional savings on top of the $2,500/month ' +
        'already going to Mum\'s deposit account. ' +
        'Every dollar here accelerates your apartment timeline.',
      tip: 'Once the KIA is paid off post-WRX sale, redirect ' +
        'the $780/month here.'
    },
    freedom: {
      title: '🛡️ Freedom Buffer',
      body: 'Your safety net if something goes wrong. ' +
        'Target: $9,000 (3 months expenses). ' +
        'First milestone: $1,000. ' +
        'Once you have this you never need to borrow again.',
      tip: 'Build $1,000 here before anything else. ' +
        'It changes how stress-free your life feels.'
    },
    darwin: {
      title: '🐊 Darwin Trip',
      body: 'Spending budget for June 7-15 in Darwin with your GF. ' +
        'Flights, accommodation and car are covered by your uncle. ' +
        'This is for food, activities, drinks and fun across 9 days.',
      tip: 'Budget around $100/day each. Split costs with your GF.'
    }
  };

  const i = info[id];
  if (!i) return;

  PLAN_MODAL.open(
    PLAN_MODAL.header(i.title) +
    `<div style="color:rgba(255,255,255,0.7);font-size:14px;
      line-height:1.7;margin-bottom:16px">${i.body}</div>` +
    PLAN_MODAL.info(i.tip) +
    PLAN_MODAL.btn('Got It', 'PLAN_MODAL.close()', true)
  );
}

VERIFY: Search "confirmLockPaydayPlan" — must find.
VERIFY: Search "showSliderInfo" — must find.
VERIFY: Search "unlockAndEdit" — must find.
VERIFY: Search "rentComponent" in renderPaydayAllocation — must be used.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 6 — TRIP MODAL FORMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find all trip functions that use prompt() or confirm():
editTrip(), addNewTrip(), addTripSavings()

Replace each with PLAN_MODAL forms.

function editTrip(tripId) {
  const trip = PLAN.getTrips().find(t => t.id === tripId);
  if (!trip) return;

  const coveredItems = ['Flights','Accommodation',
    'Car Hire','Food','Activities'];

  PLAN_MODAL.open(
    PLAN_MODAL.header(
      'Edit ' + trip.emoji + ' ' + trip.name,
      'Update your trip details and budget'
    ) +
    PLAN_MODAL.field('Spending Budget ($)', 
      'trip-budget', trip.budget, 'number',
      trip.covered?.length
        ? 'Already covered: ' + trip.covered.join(', ') + 
          '. This is your personal spending money.'
        : 'How much do you want to spend on this trip?'
    ) +
    PLAN_MODAL.field('Start Date', 'trip-start',
      trip.startDate, 'date') +
    PLAN_MODAL.field('End Date', 'trip-end',
      trip.endDate, 'date') +
    PLAN_MODAL.textarea('Notes', 'trip-notes', 
      trip.notes || '',
      'Anything to remember — what\'s covered, ' +
      'who you\'re going with, activities planned'
    ) +
    `<div style="margin-bottom:16px">
      <div style="color:rgba(255,255,255,0.5);font-size:11px;
        text-transform:uppercase;letter-spacing:1px;
        margin-bottom:10px">What\'s Already Covered</div>
      ${coveredItems.map(item => {
        const key = item.toLowerCase().replace(' ', '-');
        const checked = (trip.covered||[])
          .some(c => c.toLowerCase().includes(
            item.toLowerCase().split(' ')[0]
          ));
        return `
        <label style="display:flex;align-items:center;
          gap:12px;padding:10px 0;cursor:pointer;
          border-bottom:1px solid rgba(255,255,255,0.04)">
          <input type="checkbox" id="cover-${key}"
            ${checked ? 'checked' : ''}
            style="width:20px;height:20px;
            accent-color:#4ECDC4;flex-shrink:0">
          <span style="color:#fff;font-size:14px">${item}</span>
        </label>`;
      }).join('')}
    </div>` +
    PLAN_MODAL.btn('Save Trip', 
      'confirmEditTrip("' + tripId + '")', true) +
    PLAN_MODAL.btn('Cancel', 'PLAN_MODAL.close()', false)
  );
}

function confirmEditTrip(tripId) {
  const trips = PLAN.getTrips();
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return;

  const budget = parseFloat(
    document.getElementById('trip-budget')?.value || trip.budget
  );
  const start = document.getElementById('trip-start')?.value 
    || trip.startDate;
  const end = document.getElementById('trip-end')?.value 
    || trip.endDate;
  const notes = document.getElementById('trip-notes')?.value 
    || '';
  const covered = ['flights','accommodation','car-hire',
    'food','activities']
    .filter(id => 
      document.getElementById('cover-' + id)?.checked
    )
    .map(id => id.replace('-', ' '));

  if (!isNaN(budget)) trip.budget = budget;
  trip.startDate = start;
  trip.endDate = end;
  trip.notes = notes;
  trip.covered = covered;
  if (start && end) {
    trip.days = Math.ceil(
      (new Date(end) - new Date(start)) / 86400000
    ) + 1;
  }

  PLAN.saveTrip(trip);
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('✅ ' + trip.name + ' Updated');
}

function addNewTrip() {
  PLAN_MODAL.open(
    PLAN_MODAL.header('Plan A New Trip',
      'Add any upcoming travel to track your savings') +
    PLAN_MODAL.field('Destination', 'new-trip-name', '',
      'text', 'e.g. Japan, Bali, Melbourne, Fiji') +
    PLAN_MODAL.field('Emoji', 'new-trip-emoji', '✈️',
      'text', 'Pick an emoji that represents this trip') +
    PLAN_MODAL.field('Start Date', 'new-trip-start', '', 'date') +
    PLAN_MODAL.field('End Date', 'new-trip-end', '', 'date') +
    PLAN_MODAL.field('Spending Budget ($)', 
      'new-trip-budget', '', 'number',
      'How much do you want to spend total? ' +
      'Exclude anything already covered.'
    ) +
    PLAN_MODAL.textarea('Notes', 'new-trip-notes', '',
      'What\'s covered, who you\'re going with, ' +
      'what you want to do...'
    ) +
    PLAN_MODAL.btn('Add Trip', 'confirmNewTrip()', true) +
    PLAN_MODAL.btn('Cancel', 'PLAN_MODAL.close()', false)
  );
}

function confirmNewTrip() {
  const name = document.getElementById(
    'new-trip-name')?.value?.trim();
  if (!name) { 
    showToast('Please Enter A Destination'); 
    return; 
  }
  const emoji = document.getElementById(
    'new-trip-emoji')?.value || '✈️';
  const start = document.getElementById(
    'new-trip-start')?.value || '';
  const end = document.getElementById(
    'new-trip-end')?.value || '';
  const budget = parseFloat(
    document.getElementById('new-trip-budget')?.value || '0'
  );
  const notes = document.getElementById(
    'new-trip-notes')?.value || '';
  const days = start && end
    ? Math.ceil(
        (new Date(end) - new Date(start)) / 86400000
      ) + 1
    : 7;

  PLAN.saveTrip({
    id: 'trip-' + Date.now(),
    name, emoji, startDate: start, endDate: end,
    days, budget, saved: 0, covered: [], notes,
    gfSplitting: false
  });
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('✅ ' + emoji + ' ' + name + ' Added');
}

function addTripSavings(tripId) {
  const trip = PLAN.getTrips().find(t => t.id === tripId);
  if (!trip) return;
  const saved = trip.saved || 0;
  const remaining = Math.max(0, trip.budget - saved);
  const pct = trip.budget > 0
    ? Math.min(100, saved / trip.budget * 100) : 0;

  PLAN_MODAL.open(
    PLAN_MODAL.header(
      'Add To ' + trip.emoji + ' ' + trip.name,
      'Every dollar saved now is one less to worry about later'
    ) +
    `<div style="background:rgba(255,255,255,0.05);
      border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="background:rgba(255,255,255,0.08);
        border-radius:6px;height:8px;margin-bottom:12px">
        <div style="background:linear-gradient(
          90deg,#4ECDC4,#26d0ce);
          width:${pct}%;height:100%;border-radius:6px">
        </div>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:rgba(255,255,255,0.5);font-size:13px">
          Saved: $${Math.round(saved).toLocaleString()}
        </span>
        <span style="color:rgba(255,255,255,0.5);font-size:13px">
          Still Needed: $${Math.round(remaining).toLocaleString()}
        </span>
      </div>
    </div>` +
    PLAN_MODAL.field('Amount To Add ($)', 
      'trip-save-amt', '', 'number',
      'How much are you putting in today?') +
    PLAN_MODAL.btn(
      'Add Savings', 
      'confirmTripSavings("' + tripId + '")', true
    ) +
    PLAN_MODAL.btn('Cancel', 'PLAN_MODAL.close()', false)
  );
}

function confirmTripSavings(tripId) {
  const amt = parseFloat(
    document.getElementById('trip-save-amt')?.value || '0'
  );
  if (isNaN(amt) || amt <= 0) {
    showToast('Please Enter A Valid Amount');
    return;
  }
  const trips = PLAN.getTrips();
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return;
  trip.saved = (trip.saved || 0) + amt;
  PLAN.saveTrip(trip);
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('✅ $' + amt.toLocaleString() + 
    ' Added To ' + trip.name + ' Fund');
}

VERIFY: Search "confirmEditTrip" — must find.
VERIFY: Search "confirmNewTrip" — must find.
VERIFY: Search "confirmTripSavings" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 7 — GOAL MODAL FORMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find all goal functions using prompt() or confirm():
editGoal(), addGoalSavings(), addNewGoal(), 
markGoalComplete()

Replace each with PLAN_MODAL forms.

function editGoal(goalId) {
  const goal = PLAN.getGoals().find(g => g.id === goalId);
  if (!goal) return;

  PLAN_MODAL.open(
    PLAN_MODAL.header(
      'Edit ' + goal.emoji + ' ' + goal.name,
      'Update your goal details and monthly contribution'
    ) +
    PLAN_MODAL.field('Goal Name', 'goal-name',
      goal.name, 'text') +
    PLAN_MODAL.field('Target Amount ($)', 'goal-target',
      goal.target, 'number',
      'How much do you need to save in total?') +
    PLAN_MODAL.field('Monthly Contribution ($)', 
      'goal-monthly', goal.monthly || 0, 'number',
      'How much will you put toward this goal ' +
      'each month from your payday allocation?') +
    PLAN_MODAL.textarea('Description', 'goal-desc',
      goal.description || '',
      'What is this goal for? Being specific ' +
      'keeps you motivated when it gets hard.') +
    PLAN_MODAL.btn('Save Goal', 
      'confirmEditGoal("' + goalId + '")', true) +
    PLAN_MODAL.btn('Cancel', 'PLAN_MODAL.close()', false)
  );
}

function confirmEditGoal(goalId) {
  const goals = PLAN.getGoals();
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return;
  const name = document.getElementById(
    'goal-name')?.value?.trim() || goal.name;
  const target = parseFloat(
    document.getElementById('goal-target')?.value 
    || goal.target
  );
  const monthly = parseFloat(
    document.getElementById('goal-monthly')?.value || 0
  );
  const desc = document.getElementById(
    'goal-desc')?.value || '';
  goal.name = name;
  if (!isNaN(target) && target > 0) goal.target = target;
  if (!isNaN(monthly)) goal.monthly = monthly;
  goal.description = desc;
  PLAN.saveGoal(goal);
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('✅ ' + name + ' Updated');
}

function addGoalSavings(goalId) {
  const goal = PLAN.getGoals().find(g => g.id === goalId);
  if (!goal) return;
  const saved = goal.saved || 0;
  const remaining = Math.max(0, goal.target - saved);
  const pct = Math.min(100, saved / goal.target * 100);

  PLAN_MODAL.open(
    PLAN_MODAL.header(
      'Add To ' + goal.emoji + ' ' + goal.name,
      'Every contribution brings this closer to reality'
    ) +
    `<div style="background:rgba(255,255,255,0.05);
      border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="background:rgba(255,255,255,0.08);
        border-radius:6px;height:8px;margin-bottom:12px">
        <div style="background:linear-gradient(90deg,
          ${goal.colour||'#4ECDC4'},#26d0ce);
          width:${pct}%;height:100%;border-radius:6px">
        </div>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:rgba(255,255,255,0.5);font-size:13px">
          Saved: $${Math.round(saved).toLocaleString()}
        </span>
        <span style="color:rgba(255,255,255,0.5);font-size:13px">
          To Go: $${Math.round(remaining).toLocaleString()}
        </span>
      </div>
    </div>` +
    PLAN_MODAL.field('Amount To Add ($)', 
      'goal-save-amt', '', 'number',
      'How much are you adding today?') +
    PLAN_MODAL.btn(
      'Add To ' + goal.name,
      'confirmGoalSavings("' + goalId + '")', true
    ) +
    PLAN_MODAL.btn('Cancel', 'PLAN_MODAL.close()', false)
  );
}

function confirmGoalSavings(goalId) {
  const amt = parseFloat(
    document.getElementById('goal-save-amt')?.value || '0'
  );
  if (isNaN(amt) || amt <= 0) {
    showToast('Please Enter A Valid Amount');
    return;
  }
  const goals = PLAN.getGoals();
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return;
  goal.saved = (goal.saved || 0) + amt;
  PLAN.saveGoal(goal);
  if (goalId === 'china') {
    const bucket = S.savingsBuckets?.find(
      b => b.name === 'China Holiday'
    );
    if (bucket) { bucket.saved = goal.saved; save(); }
  }
  if (goalId === 'apartment') {
    S.mumAccountBalance = goal.saved;
    save();
  }
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('🎯 $' + amt.toLocaleString() + 
    ' Added To ' + goal.name + '!');
}

function addNewGoal() {
  PLAN_MODAL.open(
    PLAN_MODAL.header('Add A New Goal',
      'What are you working toward?') +
    PLAN_MODAL.field('Goal Name', 'new-goal-name', '',
      'text', 
      'e.g. Japan Trip, New Laptop, Emergency Buffer') +
    PLAN_MODAL.field('Emoji', 'new-goal-emoji', '🎯', 'text') +
    PLAN_MODAL.field('Target Amount ($)', 
      'new-goal-target', '', 'number',
      'How much do you need in total?') +
    PLAN_MODAL.field('Monthly Savings ($)', 
      'new-goal-monthly', '', 'number',
      'How much will you put toward this each month?') +
    PLAN_MODAL.textarea('Description', 'new-goal-desc', '',
      'Why does this goal matter to you? ' +
      'Being specific helps you stay committed ' +
      'when it gets hard.') +
    PLAN_MODAL.btn('Create Goal', 'confirmNewGoal()', true) +
    PLAN_MODAL.btn('Cancel', 'PLAN_MODAL.close()', false)
  );
}

function confirmNewGoal() {
  const name = document.getElementById(
    'new-goal-name')?.value?.trim();
  if (!name) { 
    showToast('Please Enter A Goal Name'); 
    return; 
  }
  const emoji = document.getElementById(
    'new-goal-emoji')?.value || '🎯';
  const target = parseFloat(
    document.getElementById('new-goal-target')?.value || '0'
  );
  const monthly = parseFloat(
    document.getElementById('new-goal-monthly')?.value || '0'
  );
  const desc = document.getElementById(
    'new-goal-desc')?.value || '';
  if (isNaN(target) || target <= 0) {
    showToast('Please Enter A Target Amount');
    return;
  }
  PLAN.saveGoal({
    id: 'goal-' + Date.now(),
    name, emoji, target, saved: 0, monthly,
    description: desc, colour: '#4ECDC4', priority: 99
  });
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('🎯 ' + emoji + ' ' + name + ' Goal Created!');
}

function markGoalComplete(goalId) {
  const goal = PLAN.getGoals().find(g => g.id === goalId);
  if (!goal) return;
  PLAN_MODAL.open(
    PLAN_MODAL.header(
      '🎉 Mark ' + goal.name + ' Complete?',
      'This will archive the goal and celebrate your win'
    ) +
    `<div style="text-align:center;font-size:48px;
      padding:20px 0">🎉</div>` +
    PLAN_MODAL.btn(
      'Yes — I Did It!', 
      'confirmGoalComplete("' + goalId + '")', true
    ) +
    PLAN_MODAL.btn('Not Yet', 'PLAN_MODAL.close()', false)
  );
}

function confirmGoalComplete(goalId) {
  const goals = PLAN.getGoals();
  const goal = goals.find(g => g.id === goalId);
  if (goal) { 
    goal.completed = true; 
    goal.completedDate = new Date().toISOString();
    PLAN.saveGoal(goal); 
  }
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('🎉 Goal Complete — Well Done!');
}

VERIFY: Search "confirmEditGoal" — must find.
VERIFY: Search "confirmNewGoal" — must find.
VERIFY: Search "confirmGoalSavings" — must find.
VERIFY: Search "confirmGoalComplete" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 8 — ANNUAL PROVISIONS EDITABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Find renderAnnualProvisions() and update each row
to show an edit button and correct frequency text.

Add provisions storage functions if not present:
const PROVISIONS_KEY = 'slyght_provisions';

function getCustomProvisions() {
  try {
    const stored = localStorage.getItem(PROVISIONS_KEY);
    if (stored) return JSON.parse(stored);
  } catch(e) {}
  return PLAN.getAnnualProvisions();
}

function saveProvisions(provisions) {
  localStorage.setItem(PROVISIONS_KEY, 
    JSON.stringify(provisions));
}

Update each provision row display to show:
frequency + cost per payment + annual total

For Teachers Health specifically show:
"Quarterly · $259.41 Per Quarter · $1,037.64/Year"

Helper:
function provisionFreqText(p) {
  const divisors = {
    quarterly: 4, biannual: 2, annual: 1, monthly: 12
  };
  const payments = divisors[p.frequency] || 1;
  const perPayment = (p.annual / payments).toFixed(2);
  const labels = {
    quarterly: 'Quarterly',
    biannual: 'Every 6 Months', 
    annual: 'Annual',
    monthly: 'Monthly'
  };
  return (labels[p.frequency] || 'Annual') + 
    ' · $' + perPayment + ' Per Payment · ' +
    '$' + Math.round(p.annual).toLocaleString() + '/Year';
}

Add edit button to each provision row:
<button onclick="editProvision('${p.name}')" style="
  background:rgba(255,255,255,0.06);
  border:1px solid rgba(255,255,255,0.1);
  border-radius:8px;color:rgba(255,255,255,0.5);
  padding:6px 10px;font-size:11px;cursor:pointer">
  ✏️
</button>

function editProvision(name) {
  const provisions = getCustomProvisions();
  const p = provisions.find(p => p.name === name);
  if (!p) return;

  PLAN_MODAL.open(
    PLAN_MODAL.header('Edit ' + p.name,
      'Update if the cost changes') +
    PLAN_MODAL.field('Annual Total ($)', 'prov-annual',
      p.annual, 'number',
      'Total cost per year. Monthly provision = annual ÷ 12.') +
    PLAN_MODAL.select('How Often Is This Charged?',
      'prov-freq',
      [
        {value:'annual', label:'Once A Year'},
        {value:'biannual', label:'Every 6 Months'},
        {value:'quarterly', label:'Every 3 Months (Quarterly)'},
        {value:'monthly', label:'Monthly'}
      ],
      p.frequency
    ) +
    PLAN_MODAL.field('Next Due Date', 'prov-due',
      p.nextDue, 'date') +
    PLAN_MODAL.btn('Save', 
      'confirmEditProvision("' + name + '")', true) +
    PLAN_MODAL.btn('Cancel', 'PLAN_MODAL.close()', false)
  );
}

function confirmEditProvision(name) {
  const provisions = getCustomProvisions();
  const p = provisions.find(p => p.name === name);
  if (!p) return;
  const annual = parseFloat(
    document.getElementById('prov-annual')?.value || p.annual
  );
  const freq = document.getElementById('prov-freq')?.value 
    || p.frequency;
  const due = document.getElementById('prov-due')?.value 
    || p.nextDue;
  const divisors = {
    quarterly:4, biannual:2, annual:1, monthly:12
  };
  if (!isNaN(annual) && annual > 0) {
    p.annual = annual;
    p.monthly = parseFloat(
      (annual / 12).toFixed(2)
    );
  }
  p.frequency = freq;
  p.nextDue = due;
  saveProvisions(provisions);
  PLAN_MODAL.close();
  renderPlanMode();
  showToast('✅ ' + name + ' Updated');
}

VERIFY: Search "editProvision" — must find.
VERIFY: Search "PROVISIONS_KEY" — must find.
VERIFY: Search "provisionFreqText" — must find.
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 9 — TITLE CASE AND FINAL POLISH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A) Add toTitleCase helper if not present:
function toTitleCase(str) {
  if (!str) return '';
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

B) Go through ALL user-facing strings in:
renderPlanMode(), renderWrxCard(), 
renderPaydayAllocation(), renderTrips(),
renderGoalCards(), renderAnnualProvisions(),
renderIncomeSimulator()

Apply Title Case to every label, heading, 
button text and section title.

Exceptions — do NOT title case:
- Number displays ($1,234)
- Dynamic data (goal.name if user set it)
- Toast messages (these can stay sentence case)
- Dates

C) Net worth in persistent footer strip:
Ensure the footer strip also shows correct sign:
NW: -$7,305 in red OR NW: +$4,422 in green

Find the updatePersistentStrip() function.
Update the NW display:
const nwResult = calculateNetWorth();
const nwNet = nwResult.net !== undefined 
  ? nwResult.net : nwResult;
nwEl.textContent = 'NW: ' + 
  (nwNet >= 0 ? '+' : '-') + '$' + 
  Math.abs(Math.round(nwNet)).toLocaleString();
nwEl.style.color = nwNet >= 0 
  ? 'var(--green)' : 'var(--red)';

D) Deposit goal in renderGoalCards():
The apartment goal description must NOT mention 
guarantors. Remove any reference to parents or 
guarantors from the goal description.

Update the default description for apartment goal:
description: 'Building toward your own place. ' +
  'Inner West, Meadowbank, Kogarah or Wolli Creek area. ' +
  '$50,000 deposit target. Account managed by Mum.'

VERIFY: Search "toTitleCase" — must find.
VERIFY: Footer NW uses calculateNetWorth().
Run guardian. Continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Run node guardian-all.js — must pass 100%.

Final verification — search for ALL:
1.  "findMumDebt" ✓
2.  "PLAN_MODAL" ✓
3.  "plan-modal-overlay" ✓
4.  "renderWrxCard" ✓
5.  "editWrxPrice" ✓
6.  "showKiaLoanInfo" ✓
7.  "showNetWorthBreakdown" ✓
8.  "confirmLockPaydayPlan" ✓
9.  "showSliderInfo" ✓
10. "unlockAndEdit" ✓
11. "confirmEditTrip" ✓
12. "confirmNewTrip" ✓
13. "confirmTripSavings" ✓
14. "confirmEditGoal" ✓
15. "confirmNewGoal" ✓
16. "confirmGoalSavings" ✓
17. "confirmGoalComplete" ✓
18. "editProvision" ✓
19. "provisionFreqText" ✓
20. "toTitleCase" ✓

All 20 must be found before pushing.

git add index.html
git commit -m "feat: plan mode UX — PLAN_MODAL system, WRX card editable, KIA loan correct, mum deposit framing, goal/trip modals, provisions editable, net worth sign, title case"
git push