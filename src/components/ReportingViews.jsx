import React, { useEffect, useRef, useState } from 'react';
import { ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { Download, Printer, RefreshCw, X, Maximize2 } from 'lucide-react';
import { reportCsv, SOLD_ITEMS, COST_RATES } from '../utils/reportingCalculator.js';
import './reporting.css';

export const rm = value => value == null ? 'Pending' : `RM${Number(value).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const number = value => Number(value || 0).toLocaleString('en-MY', { maximumFractionDigits: 2 });
const COLORS = ['#15805a', '#e8624a', '#5368bd', '#d89b27', '#8866b7', '#199ca5', '#9a7968', '#a1a1aa', '#c44569', '#6c8846', '#45556c'];
export function ReportActions({ report, refresh, compact = false }) {
  const unavailable = !report || report.fromCache;
  const download = section => {
    const url = URL.createObjectURL(new Blob([reportCsv(report, section)], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `AFC-${section}-${report.from}-to-${report.to}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="report-actions no-print">
    <button className="btn btn-outline" onClick={refresh}><RefreshCw size={14} />Refresh</button>
    <button className="btn btn-outline" disabled={unavailable} onClick={() => download('daily')}><Download size={14} />Daily CSV</button>
    {!compact && <><button className="btn btn-outline" disabled={unavailable} onClick={() => download('menu')}>Menu CSV</button><button className="btn btn-outline" disabled={unavailable} onClick={() => download('waste')}>Waste CSV</button></>}
    <button className="btn btn-outline" disabled={unavailable} onClick={() => window.print()}><Printer size={14} />Print / PDF</button>
  </div>;
}
export function ReportingStatus({ loading, error, retry }) {
  if (loading) return <div className="card report-message" role="status">Loading sales, closing reports and saved payroll…</div>;
  if (error) return <div className="card report-message" role="alert"><p>{error}</p><button className="btn btn-outline" onClick={retry}>Retry</button></div>;
  return null;
}
export function Metric({ label, value, note, highlight }) {
  return <div className={`card report-metric${highlight ? ' report-highlight' : ''}`}><div className="report-label">{label}</div><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
export function ReportMetrics({ report }) {
  const t = report.totals;
  return <div className="report-metrics">
    <Metric label="POS sales" value={rm(t.revenue)} note={`${report.orderCount} completed orders`} />
    <Metric label="Estimated CoS" value={rm(t.costOfSales)} note="Ingredients, packaging, ice & oil" />
    <Metric label="StaffCosts" value={rm(t.staffCosts)} note="Earned wages + management" />
    <Metric label="Estimated net gain" value={rm(t.netGain)} highlight note={t.netGain == null ? 'Requires closing and saved payroll' : t.margin == null ? 'No sales in this period' : `${t.margin.toFixed(1)}% margin after all included costs`} />
  </div>;
}
export function CoverageNotice({ report }) {
  return <div className="report-notice">
    {report.fromCache && <div><strong>Cached results.</strong> Waiting for Firebase to confirm current data. Reconnect before using these totals.</div>}
    {report.pending.length > 0 ? <><strong>{report.pending.length} day{report.pending.length === 1 ? '' : 's'} need review.</strong> Net gain is pending until closing, recipe quantities and saved payroll are available.</> : <><strong>{report.activeDays} day{report.activeDays === 1 ? '' : 's'} with trading records.</strong> Costs use the G1 recipe model and saved payroll.</>}
    {' '}Rent, utilities and Wi-Fi accrue on every elapsed calendar day, including Saturdays. Royalty is excluded.
    {report.totals.excludedExpenses > 0 && <div>{rm(report.totals.excludedExpenses)} of expense entries in categories already covered by CoS, payroll or overhead (including royalty) are excluded to prevent duplicate charges.</div>}
  </div>;
}
function ChartFrame({ title, children }) {
  const [expanded, setExpanded] = useState(false);
  const closeRef = useRef(null), openRef = useRef(null);
  useEffect(() => {
    if (!expanded) return;
    closeRef.current?.focus();
    const key = e => { if (e.key === 'Escape') setExpanded(false); if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus(); } };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); openRef.current?.focus(); };
  }, [expanded]);
  const content = <><div className="report-card-heading"><h3>{title}</h3>{expanded ? <button ref={closeRef} className="btn btn-outline" aria-label="Close expanded chart" onClick={() => setExpanded(false)}><X size={16} /></button> : <button ref={openRef} className="btn btn-ghost no-print" aria-label={`Expand ${title}`} onClick={() => setExpanded(true)}><Maximize2 size={15} /></button>}</div>{children}</>;
  return <section className="card report-chart">{!expanded && content}{expanded && <><h3>{title}</h3><div className="report-modal" onClick={e => { if (e.target === e.currentTarget) setExpanded(false); }}><div className="report-dialog" role="dialog" aria-modal="true" aria-label={title}>{content}</div></div></>}</section>;
}
const axis = { fontSize: 11, fill: '#71717a' };
const currencyTooltip = value => rm(value);
export function ReportCharts({ report, compact = false }) {
  const rows = report.daily.map(r => ({ ...r, label: r.date.slice(5), sales: r.revenue }));
  return <div className="report-charts">
    <ChartFrame title="Daily sales and costs"><ResponsiveContainer width="100%" height={280}><ComposedChart data={rows} margin={{ left: 0, right: 8, top: 10 }}>
      <CartesianGrid vertical={false} stroke="#eee" /><XAxis dataKey="label" tick={axis} /><YAxis tick={axis} width={62} /><Tooltip formatter={currencyTooltip} labelFormatter={(_, p) => p?.[0]?.payload?.date} /><Legend />
      <Bar dataKey="sales" name="POS sales" fill="#15805a" radius={[4, 4, 0, 0]} maxBarSize={28} /><Line dataKey="totalCost" name="Estimated total costs" stroke="#e8624a" dot={false} strokeWidth={2} connectNulls={false} />
    </ComposedChart></ResponsiveContainer></ChartFrame>
    <ChartFrame title="Daily net gain"><ResponsiveContainer width="100%" height={280}><ComposedChart data={rows} margin={{ left: 0, right: 8, top: 10 }}>
      <CartesianGrid vertical={false} stroke="#eee" /><XAxis dataKey="label" tick={axis} /><YAxis tick={axis} width={62} /><Tooltip formatter={currencyTooltip} labelFormatter={(_, p) => p?.[0]?.payload?.date} /><Legend />
      <Bar dataKey="netGain" name="Estimated net gain" radius={[3, 3, 0, 0]} maxBarSize={28}>{rows.map(r => <Cell key={r.date} fill={r.netGain < 0 ? '#cf4b46' : '#5368bd'} />)}</Bar>
    </ComposedChart></ResponsiveContainer><p className="report-hint">Gaps indicate pending data. Negative days remain visible.</p></ChartFrame>
    {!compact && <>
      <ChartFrame title="Cost breakdown">{report.costBreakdown.length ? <ResponsiveContainer width="100%" height={310}><PieChart><Pie data={report.costBreakdown} dataKey="value" nameKey="name" innerRadius={62} outerRadius={100} paddingAngle={1}>{report.costBreakdown.map((r, i) => <Cell key={r.name} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={currencyTooltip} /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart></ResponsiveContainer> : <p className="report-empty">No costs recorded.</p>}<p className="report-hint">Known costs only; pending costs are not included in this breakdown.</p></ChartFrame>
      <ChartFrame title="Top selling menu items">{report.menu.length ? <ResponsiveContainer width="100%" height={310}><BarChart data={report.menu.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 24 }}><CartesianGrid horizontal={false} stroke="#eee" /><XAxis type="number" tick={axis} /><YAxis type="category" dataKey="name" width={115} tick={axis} /><Tooltip formatter={v => [number(v), 'Menu units']} /><Bar dataKey="quantity" name="Menu units" fill="#15805a" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <p className="report-empty">No completed POS sales in this period.</p>}</ChartFrame>
    </>}
  </div>;
}
export function DailyReportTable({ report }) {
  return <div className="report-table-wrap"><table className="data-table report-table"><thead><tr><th>Date</th><th>POS sales</th><th>Est. CoS</th><th>StaffCosts</th><th>Overhead</th><th>Other</th><th>Est. net gain</th><th>Status</th></tr></thead><tbody>
    {report.daily.map(r => <tr key={r.date}><td>{r.date}</td><td>{rm(r.revenue)}</td><td>{rm(r.costOfSales)}</td><td>{rm(r.staffCosts)}</td><td>{rm(r.overhead)}</td><td>{rm(r.extraExpenses)}</td><td className={r.netGain < 0 ? 'report-negative' : ''}>{rm(r.netGain)}</td><td className="report-status-cell">{r.future ? 'Future' : r.issues.join(' · ') || (r.active ? 'Complete · estimated costs' : 'No trading records · overhead only')}</td></tr>)}
  </tbody><tfoot><tr><th>Total</th>{['revenue', 'costOfSales', 'staffCosts', 'overhead', 'extraExpenses', 'netGain'].map(key => <th key={key}>{rm(report.totals[key])}</th>)}<th>{report.pending.length ? 'Pending' : 'Estimated'}</th></tr></tfoot></table></div>;
}
export function SalesDetail({ report }) {
  return <div className="report-charts"><section className="card report-section"><h3>Menu sales</h3><p className="report-hint">Order discounts are allocated across line items. Revenue reconciles to completed POS totals.</p><div className="report-table-wrap"><table className="data-table"><thead><tr><th>Item</th><th>Units</th><th>Net sales</th></tr></thead><tbody>{report.menu.map(r => <tr key={r.id}><td>{r.name}</td><td>{number(r.quantity)}</td><td>{rm(r.revenue)}</td></tr>)}</tbody></table></div>{!report.menu.length && <p className="report-empty">No menu sales.</p>}</section>
    <section className="card report-section"><h3>Sold ingredients & portions</h3><p className="report-hint">From order recipe snapshots. Pieces and sets are kept separate. Missing mappings appear in the daily status.</p><table className="data-table"><thead><tr><th>Item</th><th>Quantity</th></tr></thead><tbody>{SOLD_ITEMS.map(i => <tr key={i.key}><td>{i.label}</td><td>{number(report.sold[i.key])} {i.unit}</td></tr>)}</tbody></table><h3 style={{ marginTop: 20 }}>Payment methods</h3>{report.payments.map(p => <div className="report-pair" key={p.name}><span>{p.name}</span><strong>{rm(p.value)}</strong></div>)}</section></div>;
}
export function WasteDetail({ report }) {
  return <section className="card report-section"><h3>Fried leftovers / Baki Dah Goreng</h3><p className="report-hint">Fried leftovers are waste, never raw carryover. Their ingredient costs are already included in CoS. Any employee penalty stays in payroll deductions.</p><div className="report-table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Chicken (pcs)</th><th>Carcass (pcs)</th><th>Neck (sets)</th><th>Mushroom (sets)</th><th>Closing</th></tr></thead><tbody>{report.daily.filter(r => r.active).map(r => <tr key={r.date}><td>{r.date}</td>{['chicken_pcs', 'carcass_pcs', 'neck', 'mushroom'].map(key => <td key={key}>{number(r.waste[key])}</td>)}<td>{r.closingStatus}</td></tr>)}</tbody></table></div></section>;
}
export function CostDetail({ report }) {
  return <div className="report-charts"><section className="card report-section"><h3>CoS and operating costs</h3><p className="report-hint">Known costs for the selected period. Missing costs are marked pending in daily profit & loss.</p><table className="data-table"><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>{report.costBreakdown.map(row => <tr key={row.name}><td>{row.name}</td><td>{rm(row.value)}</td></tr>)}</tbody></table></section>
    <section className="card report-section"><h3>StaffCosts by day</h3><p className="report-hint">Employee wages before advances and penalties. Management is counted once per included day.</p><div className="report-table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Earned wages</th><th>Management</th><th>StaffCosts</th></tr></thead><tbody>{report.daily.filter(row => row.active).map(row => <tr key={row.date}><td>{row.date}</td><td>{rm(row.payrollSaved ? row.employeeWages : null)}</td><td>{rm(row.payrollSaved ? row.managementFee : null)}</td><td>{rm(row.staffCosts)}</td></tr>)}</tbody></table></div></section></div>;
}
export function CostNotes() {
  return <details className="card report-section"><summary>How reporting costs are calculated</summary><p>POS is the source for sales. CoS uses G1 consumption quantities: sold portions plus fried waste, flour, sauce packets, packaging, ice and oil received. Chicken is estimated at 0.237 kg/piece and carcass at 0.443 kg/piece. Supplier bill weights represent receipts and are not charged again as consumed stock.</p><p>Rice uses RM23.50 / 5 kg = RM4.70/kg. Rice ingredients follow sold sets. Gas and gloves remain excluded as in G1 CoS. Costs are estimates based on the workbook rates below, not supplier invoice valuations.</p><div className="report-table-wrap"><table className="data-table"><thead><tr><th>Cost rate</th><th>RM / indicated unit</th></tr></thead><tbody>{Object.entries(COST_RATES).map(([key, value]) => <tr key={key}><td>{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</td><td>{rm(value)}</td></tr>)}</tbody></table></div><p>StaffCosts uses saved earned wages before salary advances and penalties, plus management once per day. Rent, utilities and Wi-Fi use the effective daily rates entered on the dashboard. Royalty is removed. Additional expense categories already covered by this model are excluded; other recorded expenses are added separately. No stock movements or payroll records are changed by these reports.</p></details>;
}
