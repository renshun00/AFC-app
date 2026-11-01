import React from 'react';
import { where } from 'firebase/firestore';
import { useFirestore } from '../hooks/useFirestore';

export default function CashDiscrepancyAlerts({ navigate }) {
  const { data, loading, error } = useFirestore('daily_inventory', where('cashReconciliation.matched', '==', false));
  if (loading) return <p role="status">Checking cash closing notifications…</p>;
  if (error) return <p role="alert">Unable to load cash closing notifications: {error}</p>;
  if (!data.length) return null;
  const entries = [...data].sort((a, b) => (b.date || b.id).localeCompare(a.date || a.id));
  return <section className="card report-section" aria-label="Cash closing notifications" style={{ borderColor: '#f59e0b' }}>
    <h3>Cash differences need review ({entries.length})</h3>
    <p className="report-hint">These cash counts differ from cash-paid POS sales. Follow up with the staff member.</p>
    <div className="report-table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Counted by</th><th>POS cash sales</th><th>Cash on hand</th><th>Difference</th></tr></thead><tbody>
      {entries.map(entry => {
        const cash = entry.cashReconciliation;
        return <tr key={entry.id}><td>{entry.date || entry.id}</td><td>{cash.countedByName || 'Staff'}</td><td>RM{cash.expectedCash.toFixed(2)}</td><td>RM{cash.cashOnHand.toFixed(2)}</td><td style={{ color: '#b45309', fontWeight: 600 }}>{cash.variance < 0 ? 'Shortage' : 'Excess'} RM{Math.abs(cash.variance).toFixed(2)}</td></tr>;
      })}
    </tbody></table></div>
    <button className="btn btn-outline" onClick={() => navigate?.('daily')}>Open daily closing</button>
  </section>;
}
