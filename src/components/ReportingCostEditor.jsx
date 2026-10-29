import React, { useState } from 'react';
import { saveReportingOverhead } from '../services/reportingService';
import { overheadForDate, OVERHEAD_FIELDS, validateOverhead } from '../utils/reportingCalculator.js';
import { rm } from './ReportingViews';

export default function ReportingCostEditor({ versions, today }) {
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [rates, setRates] = useState(() => overheadForDate(today, versions));
  const [revision, setRevision] = useState(() => versions.find(v => v.effectiveFrom === today)?.revision || 0);
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(''), [error, setError] = useState('');
  const loadDate = date => {
    setEffectiveFrom(date); setRates(overheadForDate(date, versions));
    setRevision(versions.find(v => v.effectiveFrom === date)?.revision || 0); setFeedback(''); setError('');
  };
  const save = async event => {
    event.preventDefault(); setError(''); setFeedback('');
    try {
      const values = validateOverhead(rates); setBusy(true);
      await saveReportingOverhead(effectiveFrom, values, revision);
      setRevision(r => r + 1); setRates(values); setFeedback(`Costs saved from ${effectiveFrom}. Earlier dates keep their previous rates.`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <section className="card report-section no-print"><h3>Rent, utilities & Wi-Fi</h3>
    <p>Enter the cost per calendar day. Initial Excel rates: rent RM19.35 (RM600 ÷ 31), utilities RM10.00, Wi-Fi RM1.10 (RM68 ÷ 2 ÷ 31). Royalty is excluded.</p>
    <form onSubmit={save}><div className="report-cost-fields"><label>Effective from<input type="date" required value={effectiveFrom} disabled={busy} onChange={e => loadDate(e.target.value)} /></label>
      {Object.entries(OVERHEAD_FIELDS).map(([key, label]) => <label key={key}>{label} (RM/day)<input type="number" min="0" max="100000" step="0.01" required value={rates[key]} disabled={busy} onChange={e => setRates(r => ({ ...r, [key]: e.target.value }))} /></label>)}
    </div><p className="report-hint">Rates apply from this date until the next saved change, including closed days. Saving an earlier effective date recalculates reporting for that period.</p>
      <div className="report-actions" style={{ marginTop: 12 }}><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save daily costs'}</button><button type="button" className="btn btn-outline" disabled={busy} onClick={() => loadDate(effectiveFrom)}>Reload saved rates</button></div>
    </form>{error && <p className="report-feedback report-negative" role="alert">{error}</p>}{feedback && <p className="report-feedback" role="status">{feedback}</p>}
    {versions.length > 0 && <details style={{ marginTop: 16 }}><summary>Saved cost changes</summary><div className="report-table-wrap"><table className="data-table"><thead><tr><th>Effective from</th><th>Rent/day</th><th>Utilities/day</th><th>Wi-Fi/day</th></tr></thead><tbody>{[...versions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).map(v => <tr key={v.id || v.effectiveFrom}><td>{v.effectiveFrom}</td><td>{rm(v.rates.rent)}</td><td>{rm(v.rates.utilities)}</td><td>{rm(v.rates.wifi)}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
