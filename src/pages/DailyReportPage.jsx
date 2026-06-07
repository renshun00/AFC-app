import React, { useState } from 'react';
import { CheckCircle, AlertCircle, Printer, Download } from 'lucide-react';
import { dailyReportData } from '../data/placeholder';

function Section({ title, children }) {
  return (
    <div className="card" style={{ marginBottom:14,overflow:'hidden' }}>
      <div style={{ padding:'12px 16px',borderBottom:'1px solid var(--border)',background:'#fafafa',fontWeight:700,fontSize:14 }}>
        {title}
      </div>
      <div style={{ padding:'0' }}>{children}</div>
    </div>
  );
}

export default function DailyReportPage({ isMobile }) {
  const d = dailyReportData;
  const pl = d.plSummary;
  const netColor = pl.netProfit > 0 ? 'var(--green)' : '#dc2626';

  const totalWages = d.staffToday.reduce((s,m)=>s+m.wage,0);
  const totalInvCost = d.inventoryUsed.reduce((s,i)=>s+i.cost,0);
  const totalOpEx = d.operatingExpenses.reduce((s,e)=>s+e.amount,0);

  return (
    <div>
      {/* Header actions */}
      <div style={{ display:'flex',justifyContent:'flex-end',gap:8,marginBottom:16 }}>
        <button className="btn btn-outline btn-sm"><Download size={13}/> Export</button>
        <button className="btn btn-primary btn-sm"><Printer size={13}/> Print Report</button>
      </div>

      {/* Date & summary band */}
      <div style={{ background:'var(--primary)',borderRadius:'var(--radius)',padding:'16px 20px',marginBottom:14,color:'#fff' }}>
        <div style={{ fontSize:12,fontWeight:600,opacity:.75,marginBottom:4 }}>DAILY RECONCILIATION</div>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-end',flexWrap:'wrap',gap:12 }}>
          <div>
            <div style={{ fontSize:28,fontWeight:700 }}>RM{pl.netProfit.toLocaleString('en-MY',{minimumFractionDigits:2})}</div>
            <div style={{ fontSize:13,opacity:.75 }}>Net Profit · {d.date}</div>
          </div>
          <div style={{ display:'flex',gap:20 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:18,fontWeight:700 }}>RM{pl.revenue.toLocaleString()}</div>
              <div style={{ fontSize:11,opacity:.75 }}>Revenue</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:18,fontWeight:700 }}>RM{pl.foodCost.toLocaleString()}</div>
              <div style={{ fontSize:11,opacity:.75 }}>Food Cost</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:18,fontWeight:700 }}>RM{pl.labour.toLocaleString()}</div>
              <div style={{ fontSize:11,opacity:.75 }}>Labour</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display:'grid',gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',gap:14 }}>
        {/* Left col */}
        <div>
          {/* Register Check */}
          <Section title="① Register Check">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Register</th>
                  <th>Cashier</th>
                  <th>Opening</th>
                  <th>Sales</th>
                  <th>Discrepancy</th>
                </tr>
              </thead>
              <tbody>
                {d.cashRegister.map(r=>(
                  <tr key={r.register}>
                    <td style={{ fontWeight:600 }}>{r.register}</td>
                    <td>{r.cashier}</td>
                    <td>RM{r.openingCash}</td>
                    <td style={{ fontWeight:600 }}>RM{r.totalSales.toFixed(2)}</td>
                    <td>
                      {r.discrepancy === 0 ? (
                        <div style={{ display:'flex',alignItems:'center',gap:4,color:'var(--green)',fontWeight:600,fontSize:12 }}>
                          <CheckCircle size={13}/> Matched
                        </div>
                      ) : (
                        <div style={{ display:'flex',alignItems:'center',gap:4,color:'#dc2626',fontWeight:600,fontSize:12 }}>
                          <AlertCircle size={13}/> RM{r.discrepancy.toFixed(2)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* Daily P&L */}
          <Section title="② Daily P&L Summary">
            <div style={{ padding:'14px 16px' }}>
              {[
                { label:'Gross Revenue', value: pl.revenue, positive:true },
                { label:'Food Cost', value: -pl.foodCost },
                { label:'Labour Cost', value: -pl.labour },
                { label:'Operating Expenses', value: -pl.operatingExpenses },
              ].map(row=>(
                <div key={row.label} style={{ display:'flex',justifyContent:'space-between',marginBottom:10,fontSize:13 }}>
                  <span style={{ color:'var(--text-2)' }}>{row.label}</span>
                  <span style={{ fontWeight:600,color: row.positive ? 'var(--text-1)' : '#dc2626' }}>
                    {row.positive ? '' : '- '}RM{Math.abs(row.value).toFixed(2)}
                  </span>
                </div>
              ))}
              <div style={{ display:'flex',justifyContent:'space-between',paddingTop:10,borderTop:'2px solid var(--border)',fontSize:15,fontWeight:700 }}>
                <span>Net Profit</span>
                <span style={{ color:netColor }}>RM{pl.netProfit.toFixed(2)}</span>
              </div>
              <div style={{ textAlign:'right',fontSize:12,color:'var(--text-3)',marginTop:4 }}>
                Margin: {((pl.netProfit/pl.revenue)*100).toFixed(1)}%
              </div>
            </div>
          </Section>

          {/* Operating Expenses */}
          <Section title="③ Operating Expenses">
            <table className="data-table">
              <thead><tr><th>Category</th><th>Amount</th></tr></thead>
              <tbody>
                {d.operatingExpenses.map(e=>(
                  <tr key={e.category}>
                    <td>{e.category}</td>
                    <td style={{ fontWeight:600 }}>RM{e.amount.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight:700 }}>Total</td>
                  <td style={{ fontWeight:700,color:'var(--primary)' }}>RM{totalOpEx.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </Section>
        </div>

        {/* Right col */}
        <div>
          {/* Inventory Used */}
          <Section title="④ Inventory Used Today">
            <table className="data-table">
              <thead>
                <tr><th>Item</th><th>Used</th><th>Cost</th></tr>
              </thead>
              <tbody>
                {d.inventoryUsed.map(i=>(
                  <tr key={i.item}>
                    <td style={{ fontWeight:600 }}>{i.item}</td>
                    <td>{i.used} {i.unit}</td>
                    <td style={{ fontWeight:600 }}>RM{i.cost.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight:700 }} colSpan={2}>Total Material Cost</td>
                  <td style={{ fontWeight:700,color:'var(--primary)' }}>RM{totalInvCost.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Staff Summary */}
          <Section title="⑤ Weekly Payroll Summary">
            <table className="data-table">
              <thead>
                <tr><th>Staff</th><th>Role</th><th>Hours</th><th>Wage</th></tr>
              </thead>
              <tbody>
                {d.staffToday.map(s=>(
                  <tr key={s.name}>
                    <td style={{ fontWeight:600 }}>{s.name}</td>
                    <td style={{ color:'var(--text-2)' }}>{s.role}</td>
                    <td>{s.hours}h</td>
                    <td style={{ fontWeight:600 }}>RM{s.wage.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight:700 }} colSpan={3}>Total Labour</td>
                  <td style={{ fontWeight:700,color:'var(--primary)' }}>RM{totalWages.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Notes */}
          <Section title="⑥ Manager Notes">
            <div style={{ padding:'14px 16px' }}>
              <textarea
                className="inp"
                rows={4}
                placeholder="Add end-of-day manager notes, observations, or issues here…"
                style={{ resize:'vertical' }}
              />
              <button className="btn btn-primary btn-sm" style={{ marginTop:10 }}>Save Notes</button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
