import React, { useEffect, useState } from 'react';
import { subscribeMonthlyPayroll } from '../services/payrollService';

const rm = value => `RM${Number(value || 0).toFixed(2)}`;

export function MonthlyPayrollView({ summary, isMobile }) {
  return <>
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 1 : 3}, minmax(0, 1fr))`, gap: 12, margin: '16px 0' }}>
      {[
        ['Monthly wages earned', summary.grossPay],
        ['Pinjam Makan already advanced', summary.mealAdvance],
        ['Remaining month-end payout', summary.totalPay],
      ].map(([label, amount]) => <div key={label} style={{ background: 'var(--bg)', padding: 16, borderRadius: 8 }}>
        <div style={{ fontSize: 12 }}>{label}</div><strong style={{ fontSize: 24, color: 'var(--primary)' }}>{rm(amount)}</strong>
      </div>)}
    </div>
    <p style={{ fontSize: 12 }}>Totals update automatically from saved daily payroll: {summary.dates.length} saved dates in this month. Unsaved days and draft edits are excluded.</p>
    <p style={{ fontSize: 12 }}>Month-end payout = wages earned (including bonuses) − Pinjam Makan − other cash advances − penalties. Pinjam Makan is salary already paid in advance.</p>
    {summary.correctedRecords > 0 && <p style={{ fontSize: 12, color: '#92400e' }}>Pinjam Makan has been corrected from an allowance to an advance for {summary.correctedRecords} older records in this view. Their stored records are unchanged until the day is recalculated and saved.</p>}
    {summary.managementCorrections > 0 && <p style={{ fontSize: 12, color: '#92400e' }}>Management fees in {summary.managementCorrections} older records have been excluded from employee wages in this view. Recalculate and save the affected days to update their stored records.</p>}
    {summary.entries.length ? <div style={{ overflowX: 'auto' }}><table className="data-table">
      <thead><tr><th>Staff</th><th>Wages earned</th><th>Pinjam Makan</th><th>Other advances</th><th>Penalties</th><th>Remaining payout</th></tr></thead>
      <tbody>{summary.entries.map(entry => <tr key={entry.staffId}>
        <td>{entry.staffName}</td><td>{rm(entry.grossPay)}</td><td>{rm(entry.mealAdvance)}</td><td>{rm(entry.cashAdvance)}</td><td>{rm(entry.friedDeduction)}</td><td><strong>{rm(entry.totalPay)}</strong>{entry.excessAdvance > 0 && <div style={{ fontSize: 11, color: '#92400e' }}>Deductions exceed earnings by {rm(entry.excessAdvance)}</div>}</td>
      </tr>)}</tbody>
      <tfoot><tr><th>Total</th><th>{rm(summary.grossPay)}</th><th>{rm(summary.mealAdvance)}</th><th>{rm(summary.cashAdvance)}</th><th>{rm(summary.friedDeduction)}</th><th>{rm(summary.totalPay)}</th></tr></tfoot>
    </table></div> : <p>No saved payroll for this month. Open the daily breakdown to prepare and save a day.</p>}
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 12 }}>
      <strong>StaffCosts reporting</strong>
      <p style={{ fontSize: 13 }}>Employee wages {rm(summary.grossPay)} + admin management fees {rm(summary.managementFee)} = <strong>{rm(summary.totalStaffCosts)}</strong></p>
      <p style={{ fontSize: 12 }}>Management fees are counted once per saved day and excluded from employee payout. Payroll follows PaySummStaff1; PaySummStaff2 is not used.</p>
    </div>
  </>;
}

export default function MonthlyPayrollSummary({ month, onMonthChange, disabled, isMobile }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(null); setError('');
    const unsubscribe = subscribeMonthlyPayroll(month,
      summary => { if (active) { setResult(summary); setError(''); } },
      failure => { if (active) { setResult(null); setError(failure.message); } });
    return () => { active = false; unsubscribe(); };
  }, [month, retry]);
  return <section aria-label="Monthly payroll" className="card" style={{ padding: 16, marginBottom: 14 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <strong>Monthly payroll</strong>
      <label style={{ fontSize: 12 }}>Payroll month (Malaysia)<input className="inp" aria-label="Payroll month" type="month" value={month} disabled={disabled} onChange={e => { if (e.target.value) onMonthChange(e.target.value); }} /></label>
    </div>
    {error ? <p role="alert">Unable to load monthly payroll: {error} <button className="btn btn-outline btn-sm" onClick={() => setRetry(v => v + 1)}>Retry</button></p>
      : result?.month === month ? <MonthlyPayrollView summary={result} isMobile={isMobile} /> : <p role="status">Loading monthly wages…</p>}
  </section>;
}
