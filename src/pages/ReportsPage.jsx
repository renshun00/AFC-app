import React, { useState } from 'react';
import { useMalaysiaToday, useReporting } from '../hooks/useReporting';
import { monthPeriod, validatePeriod } from '../utils/reportingCalculator.js';
import { ReportActions, ReportingStatus, ReportMetrics, CoverageNotice, ReportCharts, DailyReportTable, SalesDetail, WasteDetail, CostDetail, CostNotes } from '../components/ReportingViews';

export default function ReportsPage() {
  const today = useMalaysiaToday();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [mode, setMode] = useState('month');
  const [custom, setCustom] = useState(() => monthPeriod(month, today));
  const [applied, setApplied] = useState(custom);
  const [validation, setValidation] = useState('');
  const [tab, setTab] = useState('overview');
  const period = mode === 'month' ? monthPeriod(month, today) : applied;
  const { report, loading, error, refresh } = useReporting(period.from, period.to);
  const apply = e => { e.preventDefault(); try { validatePeriod(custom.from, custom.to); setApplied({ ...custom }); setValidation(''); } catch (err) { setValidation(err.message); } };
  return <div className="report-page">
    <div className="report-header"><div><h2>Reports</h2><p className="report-subtitle">Sales, CoS, StaffCosts and NettGain · {period.from} to {period.to} · Malaysia dates</p></div><ReportActions report={report} refresh={refresh} /></div>
    <div className="card report-section no-print"><div className="report-controls"><label>Period<select value={mode} onChange={e => setMode(e.target.value)}><option value="month">Month</option><option value="custom">Custom dates</option></select></label>
      {mode === 'month' ? <label>Month<input aria-label="Reporting month" type="month" value={month} max={today.slice(0, 7)} onChange={e => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value); }} /></label> : <form className="report-controls" onSubmit={apply}><label>From<input type="date" required value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} /></label><label>To<input type="date" required value={custom.to} max={today} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} /></label><button className="btn btn-primary" style={{ alignSelf: 'end' }}>Apply dates</button></form>}
    </div>{validation && <p className="report-negative" role="alert">{validation}</p>}</div>
    <ReportingStatus loading={loading} error={error} retry={refresh} />
    {report && <><ReportMetrics report={report} /><CoverageNotice report={report} />
      <div className="report-tabs no-print" role="tablist" aria-label="Report sections">{[['overview', 'Overview'], ['daily', 'Daily profit & loss'], ['sales', 'Sales detail'], ['costs', 'CoS & StaffCosts'], ['waste', 'Fried waste']].map(([key, label]) => <button className="btn btn-outline" key={key} role="tab" aria-selected={tab === key} aria-controls="report-tab-content" id={`report-tab-${key}`} onClick={() => setTab(key)}>{label}</button>)}</div>
      <div id="report-tab-content" role="tabpanel" aria-labelledby={`report-tab-${tab}`}>
        {tab === 'overview' && <ReportCharts report={report} />}
        {tab === 'daily' && <section className="card report-section"><h3>Daily profit & loss / NettGain</h3><p className="report-hint">Net gain = POS sales − estimated CoS − StaffCosts − rent, utilities & Wi-Fi − other expenses.</p><DailyReportTable report={report} /></section>}
        {tab === 'sales' && <SalesDetail report={report} />}
        {tab === 'costs' && <CostDetail report={report} />}
        {tab === 'waste' && <WasteDetail report={report} />}
      </div><CostNotes /></>}
  </div>;
}
