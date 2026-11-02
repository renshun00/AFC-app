import React, { useEffect, useState } from 'react';
import { startPayrollAutomation } from '../services/payrollAutomation';

export default function PayrollAutomation({ userId }) {
  const [status, setStatus] = useState({ errors: [] });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setStatus({ errors: [] });
    return startPayrollAutomation(setStatus);
  }, [userId, retry]);
  if (!status.errors.length) return status.syncing
    ? <p role="status" style={{ fontSize: 12, color: 'var(--text-2)' }}>Updating wages automatically…</p> : null;
  return <div role="alert" className="card" style={{ padding: 12, marginBottom: 14, color: '#92400e' }}>
    Payroll automatic saving needs attention. Operational records are retained; payroll will retry.
    <details><summary>Details</summary>{status.errors.map(error => <div key={error}>{error}</div>)}</details>
    <button className="btn btn-outline btn-sm" onClick={() => setRetry(value => value + 1)}>Retry payroll sync</button>
  </div>;
}
