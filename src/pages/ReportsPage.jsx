import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import {
  reportSummary, weeklyRevenue, topSellingItems,
  expenseBreakdown, revenueByOutlet,
} from '../data/placeholder';

const COLORS = ['#e8624a','#1a7a4a','#3b82f6','#f59e0b','#8b5cf6'];

function KpiCard({ label, value, prev, prefix='RM', highlight }) {
  const change = prev ? (((value - prev) / prev) * 100).toFixed(1) : null;
  return (
    <div className="card" style={{ padding:'16px 18px', background: highlight?'var(--green)':'var(--card)', border: highlight?'none':'1px solid var(--border)' }}>
      <div style={{ fontSize:11,fontWeight:600,color:highlight?'rgba(255,255,255,.65)':'var(--text-3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:26,fontWeight:700,color:highlight?'#fff':'var(--text-1)',marginBottom:4 }}>
        {prefix}{typeof value==='number' ? value.toLocaleString('en-MY',{minimumFractionDigits:2}) : value}
      </div>
      {change && (
        <div style={{ display:'flex',alignItems:'center',gap:4,fontSize:12,fontWeight:600,color:highlight?'rgba(255,255,255,.7)':parseFloat(change)>0?'var(--green)':'#dc2626' }}>
          {parseFloat(change)>0 ? <TrendingUp size={13}/> : <TrendingDown size={13}/>}
          {Math.abs(change)}% vs last month
        </div>
      )}
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#fff',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'10px 14px',fontSize:12,boxShadow:'var(--shadow)' }}>
      <div style={{ fontWeight:600,marginBottom:4 }}>{label}</div>
      {payload.map(p=>(
        <div key={p.name} style={{ color:p.color,marginBottom:2 }}>{p.name}: RM{Number(p.value).toLocaleString()}</div>
      ))}
    </div>
  );
};

export default function ReportsPage({ isMobile }) {
  const [period, setPeriod] = useState('Monthly');
  const r = reportSummary;

  return (
    <div>
      {/* Period selector */}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8 }}>
        <div style={{ display:'flex',gap:6 }}>
          {['Weekly','Monthly','Quarterly'].map(p=>(
            <button key={p} className="btn btn-sm" onClick={()=>setPeriod(p)}
              style={{ background:period===p?'var(--primary)':'#f4f4f5',color:period===p?'#fff':'var(--text-2)',border:'none' }}>
              {p}
            </button>
          ))}
        </div>
        <div style={{ fontSize:13,color:'var(--text-3)' }}>Nov 2025</div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid',gridTemplateColumns:`repeat(${isMobile?2:4},1fr)`,gap:10,marginBottom:14 }}>
        <KpiCard label="Total Revenue" value={r.totalRevenue} prev={r.revPrev}/>
        <KpiCard label="Total Cost" value={r.totalCost}/>
        <KpiCard label="Net Profit" value={r.netProfit} highlight/>
        <KpiCard label="Net Margin" value={`${r.margin}%`} prefix="" />
      </div>

      {/* Charts grid */}
      <div style={{ display:'grid',gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',gap:14,marginBottom:14 }}>
        {/* Weekly Revenue vs Cost */}
        <div className="card" style={{ padding:'16px 18px' }}>
          <div style={{ fontWeight:700,fontSize:14,marginBottom:14 }}>Revenue vs Cost (4 Weeks)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyRevenue} margin={{ top:4,right:4,left:-20,bottom:0 }}>
              <CartesianGrid vertical={false} stroke="#f0f0f0"/>
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize:11,fill:'#aaa' }}/>
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize:10,fill:'#bbb' }} tickFormatter={v=>`${v/1000}k`}/>
              <Tooltip content={<ChartTooltip/>} cursor={{ fill:'rgba(0,0,0,.03)' }}/>
              <Bar dataKey="revenue" name="Revenue" fill="#e8624a" radius={[4,4,0,0]} maxBarSize={32}/>
              <Bar dataKey="cost" name="Cost" fill="#f0bdb5" radius={[4,4,0,0]} maxBarSize={32}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue by outlet */}
        <div className="card" style={{ padding:'16px 18px' }}>
          <div style={{ fontWeight:700,fontSize:14,marginBottom:14 }}>Revenue by Outlet</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={revenueByOutlet} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                {revenueByOutlet.map((_,i)=>(
                  <Cell key={i} fill={COLORS[i%COLORS.length]}/>
                ))}
              </Pie>
              <Tooltip formatter={v=>`RM${v.toLocaleString()}`}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display:'grid',gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',gap:14 }}>
        {/* Top selling items */}
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'14px 16px',borderBottom:'1px solid var(--border)',fontWeight:700,fontSize:14 }}>
            Top Selling Items
          </div>
          <div style={{ padding:'0' }}>
            {topSellingItems.map((item,i)=>{
              const maxQty = topSellingItems[0].qty;
              return (
                <div key={item.name} style={{ display:'flex',alignItems:'center',gap:12,padding:'11px 16px',borderBottom: i<topSellingItems.length-1?'1px solid var(--border-soft)':'none' }}>
                  <div style={{ width:22,height:22,borderRadius:'50%',background:'var(--primary-light)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'var(--primary)',flexShrink:0 }}>
                    {i+1}
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.name}</div>
                    <div style={{ marginTop:4 }}>
                      <div style={{ height:4,borderRadius:99,background:'#f0f0f0',overflow:'hidden' }}>
                        <div style={{ width:`${(item.qty/maxQty)*100}%`,height:'100%',background:'var(--primary)',borderRadius:99 }}/>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign:'right',flexShrink:0 }}>
                    <div style={{ fontSize:13,fontWeight:700 }}>RM{item.revenue.toLocaleString()}</div>
                    <div style={{ fontSize:11,color:'var(--text-3)' }}>{item.qty} sold</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Expense breakdown */}
        <div className="card" style={{ padding:'16px 18px' }}>
          <div style={{ fontWeight:700,fontSize:14,marginBottom:14 }}>Expense Breakdown</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={expenseBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3}>
                {expenseBreakdown.map((_,i)=>(
                  <Cell key={i} fill={COLORS[i%COLORS.length]}/>
                ))}
              </Pie>
              <Tooltip formatter={v=>`RM${v.toLocaleString()}`}/>
              <Legend iconType="circle" iconSize={10} formatter={v=><span style={{ fontSize:12 }}>{v}</span>}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Payment collection table */}
      <div className="card" style={{ marginTop:14, overflow:'hidden' }}>
        <div style={{ padding:'14px 16px',borderBottom:'1px solid var(--border)',fontWeight:700,fontSize:14 }}>
          Payment Collection Summary
        </div>
        <table className="data-table">
          <thead><tr><th>Method</th><th>Transactions</th><th>Amount</th><th>Share</th></tr></thead>
          <tbody>
            {[
              { method:'Cash',tx:185,amount:22400 },
              { method:'DuitNow / QR',tx:142,amount:18650 },
              { method:'Card (Debit)',tx:98,amount:14200 },
              { method:'Grab/Foodpanda',tx:61,amount:9800 },
              { method:'Staff Meal',tx:12,amount:420 },
            ].map(p=>(
              <tr key={p.method}>
                <td style={{ fontWeight:600 }}>{p.method}</td>
                <td>{p.tx}</td>
                <td style={{ fontWeight:600 }}>RM{p.amount.toLocaleString()}</td>
                <td>
                  <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                    <div style={{ width:60,height:5,borderRadius:99,background:'#f0f0f0',overflow:'hidden' }}>
                      <div style={{ width:`${(p.amount/65470)*100}%`,height:'100%',background:'var(--primary)',borderRadius:99 }}/>
                    </div>
                    <span style={{ fontSize:12 }}>{((p.amount/65470)*100).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
