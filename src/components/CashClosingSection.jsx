import React from 'react';
import { reconcileCash } from '../utils/cashReconciliation.js';

const rm = value => `RM${Number(value).toFixed(2)}`;

export default function CashClosingSection({ cash, disabled = false, showSave = true }) {
  let result = null;
  try { if (cash.sales) result = reconcileCash(cash.amount, cash.sales.expectedCash); } catch { /* Blank count stays unconfirmed. */ }
  const locked = disabled || cash.loading || cash.busy;
  const countSaved = cash.saved && result && cash.saved.cashOnHand === result.cashOnHand && cash.saved.expectedCash === result.expectedCash;
  return <section className="card" style={{ padding: 18, marginBottom: 16 }} aria-label="Cash closing reconciliation">
    <h3 style={{ marginTop: 0 }}>Cash closing · {cash.date}</h3>
    <p style={{ fontSize: 13 }}>Count the cash collected from today's sales, after giving customers their change. Exclude the opening cash float. TnG sales are excluded. Any difference will be flagged for Admin review; you can still close and clock out.</p>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'end' }}>
      <div><div style={{ fontSize: 12 }}>POS sales paid with CASH</div><strong>{cash.loading ? 'Loading…' : cash.sales ? rm(cash.sales.expectedCash) : 'Unavailable'}</strong></div>
      <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>CASH ON HAND (RM) — required
        <input className="inp" aria-label="Cash on hand" type="number" min="0" step="0.01" required placeholder="Enter counted cash" value={cash.amount} onChange={event => cash.setAmount(event.target.value)} disabled={locked} />
      </label>
      <div aria-live="polite" style={{ color: result?.matched ? '#15803d' : '#b45309', fontSize: 13 }}>
        {result ? result.matched ? 'Matched — difference RM0.00' : `${result.variance < 0 ? 'Shortage' : 'Excess'}: ${rm(Math.abs(result.variance))}` : 'Enter a cash count to compare.'}
      </div>
    </div>
    {cash.error && <p role="alert" style={{ color: '#dc2626', fontSize: 13 }}>{cash.error}</p>}
    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <button type="button" className="btn btn-outline" disabled={locked} onClick={cash.refresh}>Refresh cash sales</button>
      {showSave && <button type="button" className="btn btn-outline" disabled={locked || !result} onClick={() => cash.save().catch(() => {})}>Save cash count</button>}
      {countSaved && <span style={{ color: result.matched ? '#15803d' : '#b45309', fontSize: 12 }}>{result.matched ? 'Cash count saved' : 'Saved — difference flagged for Admin review'}</span>}
    </div>
  </section>;
}
