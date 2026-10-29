import React from 'react';
import { where } from 'firebase/firestore';
import { useFirestore } from '../hooks/useFirestore';
import { useMalaysiaToday, useReporting } from '../hooks/useReporting';
import { shiftDate } from '../utils/dailyFlowCalculator.js';
import LockedAccountsPanel from '../components/LockedAccountsPanel';
import ReportingCostEditor from '../components/ReportingCostEditor';
import { ReportActions, ReportingStatus, Metric, CoverageNotice, ReportCharts, rm, number } from '../components/ReportingViews';

export default function AdminDashboardPage({ navigate }) {
  const today = useMalaysiaToday();
  const { report, sources, loading, error, refresh } = useReporting(shiftDate(today, -6), today);
  const inventory = useFirestore('products', where('isInventoryItem', '==', true));
  const current = report?.daily.find(d => d.date === today);
  const previous = report?.daily.find(d => d.date === shiftDate(today, -1));
  const change = previous?.revenue ? `${((current.revenue - previous.revenue) / previous.revenue * 100).toFixed(1)}% vs yesterday` : 'Completed POS orders';
  const products = inventory.data.filter(p => p.isActive !== false && !p.isArchived);
  const stock = products.filter(p => ['chicken (pieces)', 'chicken pieces'].includes((p.name || '').trim().toLowerCase()));
  const chickenPieces = stock.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  const alerts = products.filter(p => p.minStock != null && p.stock != null && Number(p.stock) <= Number(p.minStock) && !/chicken.*whole/i.test(p.name || ''));
  return <div className="report-page">
    <div className="report-header"><div><h2>Today at AFC</h2><p className="report-subtitle">{today} · Malaysia trading date · Live operating overview</p></div><ReportActions report={report} refresh={refresh} compact /></div>
    <div className="report-actions no-print">{[['pos', 'Open POS'], ['daily', 'Daily closing'], ['staff', 'Review payroll'], ['reports', 'View reports'], ['inventory', 'Inventory']].map(([page, label]) => <button className="btn btn-outline" key={page} onClick={() => navigate?.(page)}>{label}</button>)}</div>
    <ReportingStatus loading={loading} error={error} retry={refresh} />
    {current && <><div className="report-metrics"><Metric label="Today's POS sales" value={rm(current.revenue)} note={change} /><Metric label="Estimated CoS" value={rm(current.costOfSales)} note="Includes fried waste" /><Metric label="StaffCosts" value={rm(current.staffCosts)} note="Gross wages + management" /><Metric label="Estimated net gain" value={rm(current.netGain)} highlight note={current.margin == null ? 'Closing and payroll must be complete' : `${current.margin.toFixed(1)}% margin`} /></div>
      <div className="report-charts"><section className="card report-section"><h3>Today's reconciliation</h3>
        <div className="report-pair"><span>Completed orders</span><strong>{current.count}</strong></div>
        <div className="report-pair"><span>Daily closing</span><strong>{current.closingStatus === 'submitted' ? 'Submitted' : current.closingStatus === 'draft' ? 'Draft' : 'Not submitted'}</strong></div>
        <div className="report-pair"><span>Payroll</span><strong>{current.payrollSaved ? 'Saved' : 'Not saved'}</strong></div>
        <div className="report-pair"><span>Rent, utilities & Wi-Fi</span><strong>{rm(current.overhead)}</strong></div>
        <div className="report-pair"><span>Other expenses</span><strong>{rm(current.extraExpenses)}</strong></div>
        {current.issues.length > 0 && <p className="report-notice">{current.issues.join(' · ')}</p>}
      </section><section className="card report-section"><h3>Current inventory</h3>{inventory.error ? <p role="alert">Unable to load inventory: {inventory.error}</p> : inventory.loading ? <p role="status">Loading inventory…</p> : <>
        <div className="report-pair"><span>Chicken pieces available</span><strong>{number(chickenPieces)} pcs</strong></div><p className="report-hint">Whole-bird bookkeeping stock is not added to the piece balance.</p>
        <h3 style={{ marginTop: 18 }}>Low-stock alerts</h3>{alerts.length ? alerts.slice(0, 6).map(p => <div className="report-pair" key={p.id}><span>{p.name}</span><strong className={Number(p.stock) <= 0 ? 'report-negative' : ''}>{number(p.stock)} {p.uomCode || p.unit || ''}</strong></div>) : <p className="report-hint">No low-stock alerts for items with a configured minimum.</p>}
      </>}</section></div>
      <div><h3>Last 7 days</h3><p className="report-subtitle">{report.from} to {report.to}</p></div><CoverageNotice report={report} /><ReportCharts report={report} compact />
    </>}
    {sources && <ReportingCostEditor versions={sources.overhead} today={today} />}
    <div className="no-print"><LockedAccountsPanel /></div>
  </div>;
}
