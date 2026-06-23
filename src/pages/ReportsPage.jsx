import React, { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, ComposedChart, Area,
} from 'recharts';
import { TrendingUp, TrendingDown, Maximize2, X } from 'lucide-react';
import {
  reportSummary, weeklyRevenue, topSellingItems,
  expenseBreakdown, revenueByOutlet,
} from '../data/placeholder';

const COLORS = ['#e8624a', '#1a7a4a', '#3b82f6', '#f59e0b', '#8b5cf6'];

// ── Shared tooltip ────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#fff', border:'1px solid #e4e4e7', borderRadius:10, padding:'10px 14px', fontSize:12, boxShadow:'0 4px 12px rgba(0,0,0,.1)' }}>
      {label && <div style={{ fontWeight:700, marginBottom:6, color:'#18181b' }}>{label}</div>}
      {payload.map(p => (
        <div key={p.name} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:p.color, flexShrink:0 }}/>
          <span style={{ color:'#52525b' }}>{p.name}:</span>
          <span style={{ fontWeight:700, color:'#18181b' }}>
            {typeof p.value === 'number' && p.name !== 'Share' ? `RM${p.value.toLocaleString()}` : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div style={{ background:'#fff', border:'1px solid #e4e4e7', borderRadius:10, padding:'10px 14px', fontSize:12, boxShadow:'0 4px 12px rgba(0,0,0,.1)' }}>
      <div style={{ fontWeight:700, marginBottom:4 }}>{p.name}</div>
      <div style={{ color:'#52525b' }}>RM{p.value.toLocaleString()}</div>
      <div style={{ color:'#a1a1aa', fontSize:11 }}>{(p.payload.percent * 100).toFixed(1)}% of total</div>
    </div>
  );
};

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, prev, prefix = 'RM', highlight }) {
  const change = prev ? (((value - prev) / prev) * 100).toFixed(1) : null;
  return (
    <div className="card" style={{ padding:'16px 18px', background: highlight ? 'var(--green)' : 'var(--card)', border: highlight ? 'none' : '1px solid var(--border)' }}>
      <div style={{ fontSize:11, fontWeight:600, color: highlight ? 'rgba(255,255,255,.65)' : 'var(--text-3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:700, color: highlight ? '#fff' : 'var(--text-1)', marginBottom:4 }}>
        {prefix}{typeof value === 'number' ? value.toLocaleString('en-MY', { minimumFractionDigits:2 }) : value}
      </div>
      {change && (
        <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:600, color: highlight ? 'rgba(255,255,255,.7)' : parseFloat(change) > 0 ? 'var(--green)' : '#dc2626' }}>
          {parseFloat(change) > 0 ? <TrendingUp size={13}/> : <TrendingDown size={13}/>}
          {Math.abs(change)}% vs last month
        </div>
      )}
    </div>
  );
}

// ── Expand button overlay ─────────────────────────────────────────────────────
function ExpandBtn({ onClick }) {
  return (
    <button onClick={onClick}
      title="Expand chart"
      style={{
        position:'absolute', top:12, right:12,
        background:'rgba(255,255,255,0.9)', border:'1.5px solid var(--border)',
        borderRadius:8, padding:'4px 8px', cursor:'pointer',
        display:'flex', alignItems:'center', gap:4,
        fontSize:11, fontWeight:600, color:'var(--text-2)',
        boxShadow:'0 1px 4px rgba(0,0,0,.08)',
        opacity:0, transition:'opacity .15s',
        zIndex:2,
      }}
      className="expand-btn"
    >
      <Maximize2 size={12}/> Expand
    </button>
  );
}

// ── Chart Card wrapper (hoverable, clickable) ─────────────────────────────────
function ChartCard({ title, onExpand, children, style }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="card"
      onClick={onExpand}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding:'16px 18px', position:'relative', cursor:'pointer',
        transition:'box-shadow .15s, transform .15s',
        boxShadow: hovered ? '0 6px 24px rgba(0,0,0,.12)' : 'var(--shadow-sm)',
        transform: hovered ? 'translateY(-1px)' : 'none',
        ...style,
      }}
    >
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div style={{ fontWeight:700, fontSize:14 }}>{title}</div>
        <div style={{
          display:'flex', alignItems:'center', gap:4,
          fontSize:11, fontWeight:600, color:'var(--text-3)',
          background:'#f4f4f5', borderRadius:6, padding:'3px 8px',
          opacity: hovered ? 1 : 0, transition:'opacity .15s',
        }}>
          <Maximize2 size={11}/> Click to expand
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Full-screen modal ─────────────────────────────────────────────────────────
function ChartModal({ title, onClose, children }) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,.55)',
        zIndex:500, display:'flex', alignItems:'center', justifyContent:'center',
        padding:20, animation:'fadeIn .15s ease',
      }}
    >
      <div style={{
        background:'#fff', borderRadius:16, width:'100%', maxWidth:900,
        maxHeight:'90vh', overflow:'auto',
        boxShadow:'0 24px 64px rgba(0,0,0,.25)',
        animation:'slideUp .2s ease',
      }}>
        {/* Modal header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 24px', borderBottom:'1px solid var(--border)', position:'sticky', top:0, background:'#fff', zIndex:1 }}>
          <div style={{ fontWeight:700, fontSize:18 }}>{title}</div>
          <button onClick={onClose} style={{ background:'#f4f4f5', border:'none', borderRadius:8, padding:'7px 10px', cursor:'pointer', display:'flex', alignItems:'center', color:'var(--text-2)' }}>
            <X size={16}/>
          </button>
        </div>
        {/* Modal body */}
        <div style={{ padding:'24px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Individual expanded chart contents ────────────────────────────────────────

function RevenueVsCostExpanded({ data }) {
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24 }}>
        {[
          { label:'Peak Week', value:`W4 — RM${data[3].revenue.toLocaleString()}` },
          { label:'Avg Weekly Revenue', value:`RM${Math.round(data.reduce((s,d)=>s+d.revenue,0)/data.length).toLocaleString()}` },
          { label:'Avg Gross Margin', value:`${(data.reduce((s,d)=>s+((d.revenue-d.cost)/d.revenue*100),0)/data.length).toFixed(1)}%` },
        ].map(s => (
          <div key={s.label} style={{ background:'#fafafa', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:11, color:'var(--text-3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:16, fontWeight:700 }}>{s.value}</div>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top:10, right:20, left:0, bottom:0 }}>
          <CartesianGrid stroke="#f0f0f0" strokeDasharray="3 3"/>
          <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize:13, fill:'#888' }}/>
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize:12, fill:'#bbb' }} tickFormatter={v=>`RM${v/1000}k`} width={65}/>
          <Tooltip content={<ChartTooltip/>} cursor={{ fill:'rgba(0,0,0,.03)' }}/>
          <Legend wrapperStyle={{ fontSize:13, paddingTop:12 }}/>
          <Bar dataKey="revenue" name="Revenue" fill="#e8624a" radius={[6,6,0,0]} maxBarSize={52}/>
          <Bar dataKey="cost" name="Cost" fill="#f0bdb5" radius={[6,6,0,0]} maxBarSize={52}/>
          <Line type="monotone" dataKey="revenue" name="Revenue Trend" stroke="#c0392b" strokeWidth={2.5} dot={{ r:4, fill:'#c0392b' }} strokeDasharray="5 3"/>
        </ComposedChart>
      </ResponsiveContainer>
      {/* Data table */}
      <table className="data-table" style={{ marginTop:20 }}>
        <thead><tr><th>Week</th><th>Revenue</th><th>Cost</th><th>Gross Profit</th><th>Margin</th></tr></thead>
        <tbody>
          {data.map(d => (
            <tr key={d.week}>
              <td style={{ fontWeight:600 }}>{d.week}</td>
              <td>RM{d.revenue.toLocaleString()}</td>
              <td>RM{d.cost.toLocaleString()}</td>
              <td style={{ fontWeight:700, color:'var(--green)' }}>RM{(d.revenue-d.cost).toLocaleString()}</td>
              <td>{((d.revenue-d.cost)/d.revenue*100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function RevenueByOutletExpanded({ data }) {
  const total = data.reduce((s,d)=>s+d.value,0);
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns: '1fr 1fr', gap:24 }}>
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" outerRadius={120} dataKey="value"
              label={({name,percent})=>`${name}\n${(percent*100).toFixed(1)}%`}
              labelLine={true} fontSize={12}>
              {data.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
            </Pie>
            <Tooltip content={<PieTooltip/>}/>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', gap:12 }}>
          {data.map((d,i) => (
            <div key={d.name} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'#fafafa', borderRadius:10, border:'1px solid var(--border)' }}>
              <div style={{ width:14, height:14, borderRadius:4, background:COLORS[i%COLORS.length], flexShrink:0 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:14 }}>{d.name}</div>
                <div style={{ fontSize:12, color:'var(--text-3)' }}>{((d.value/total)*100).toFixed(1)}% of total revenue</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontWeight:700, fontSize:15 }}>RM{d.value.toLocaleString()}</div>
              </div>
            </div>
          ))}
          <div style={{ padding:'12px 14px', background:'var(--primary-light)', borderRadius:10, border:'1px solid #fecaca' }}>
            <div style={{ fontSize:12, color:'var(--text-2)' }}>Total Revenue</div>
            <div style={{ fontWeight:700, fontSize:18, color:'var(--primary)' }}>RM{total.toLocaleString()}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function TopSellingExpanded({ data }) {
  const maxQty = data[0].qty;
  return (
    <>
      <div style={{ marginBottom:20 }}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} layout="vertical" margin={{ top:0, right:60, left:10, bottom:0 }}>
            <CartesianGrid horizontal={false} stroke="#f0f0f0"/>
            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize:11, fill:'#bbb' }} tickFormatter={v=>v} domain={[0,'dataMax+20']}/>
            <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize:12, fill:'#555' }} width={160}/>
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const d = data.find(x=>x.name===label);
              return (
                <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', fontSize:12, boxShadow:'0 4px 12px rgba(0,0,0,.1)' }}>
                  <div style={{ fontWeight:700, marginBottom:4 }}>{label}</div>
                  <div>Qty sold: <strong>{payload[0].value}</strong></div>
                  {d && <div>Revenue: <strong>RM{d.revenue.toLocaleString()}</strong></div>}
                </div>
              );
            }}/>
            <Bar dataKey="qty" name="Units Sold" fill="#e8624a" radius={[0,6,6,0]} maxBarSize={28}
              label={{ position:'right', fontSize:12, fontWeight:700, fill:'#555', formatter:v=>`${v} sold` }}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="data-table">
        <thead><tr><th>#</th><th>Item</th><th>Units Sold</th><th>Revenue</th><th>Avg Price</th><th>Share of Sales</th></tr></thead>
        <tbody>
          {data.map((item,i) => {
            const totalRev = data.reduce((s,d)=>s+d.revenue,0);
            return (
              <tr key={item.name}>
                <td><div style={{ width:22,height:22,borderRadius:'50%',background:'var(--primary-light)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'var(--primary)' }}>{i+1}</div></td>
                <td style={{ fontWeight:600 }}>{item.name}</td>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {item.qty}
                    <div style={{ flex:1, height:5, borderRadius:99, background:'#f0f0f0', overflow:'hidden', minWidth:60 }}>
                      <div style={{ width:`${(item.qty/maxQty)*100}%`, height:'100%', background:'var(--primary)', borderRadius:99 }}/>
                    </div>
                  </div>
                </td>
                <td style={{ fontWeight:700 }}>RM{item.revenue.toLocaleString()}</td>
                <td style={{ color:'var(--text-2)' }}>RM{(item.revenue/item.qty).toFixed(2)}</td>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:40,height:5,borderRadius:99,background:'#f0f0f0',overflow:'hidden' }}>
                      <div style={{ width:`${(item.revenue/totalRev)*100}%`,height:'100%',background:'var(--green)',borderRadius:99 }}/>
                    </div>
                    <span style={{ fontSize:12 }}>{((item.revenue/totalRev)*100).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function ExpenseBreakdownExpanded({ data }) {
  const total = data.reduce((s,d)=>s+d.value,0);
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, alignItems:'center' }}>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={70} outerRadius={120} dataKey="value" paddingAngle={4}
              label={({name,percent})=>`${(percent*100).toFixed(1)}%`} labelLine={false} fontSize={13} fontWeight={700}>
              {data.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
            </Pie>
            <Tooltip content={<PieTooltip/>}/>
          </PieChart>
        </ResponsiveContainer>
        <div>
          {data.map((d,i)=>(
            <div key={d.name} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 0', borderBottom:'1px solid var(--border-soft)' }}>
              <div style={{ width:12,height:12,borderRadius:3,background:COLORS[i%COLORS.length],flexShrink:0 }}/>
              <div style={{ flex:1, fontSize:14, fontWeight:500 }}>{d.name}</div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontWeight:700 }}>RM{d.value.toLocaleString()}</div>
                <div style={{ fontSize:11,color:'var(--text-3)' }}>{((d.value/total)*100).toFixed(1)}%</div>
              </div>
              <div style={{ width:60,height:6,borderRadius:99,background:'#f0f0f0',overflow:'hidden' }}>
                <div style={{ width:`${(d.value/total)*100}%`,height:'100%',background:COLORS[i%COLORS.length],borderRadius:99 }}/>
              </div>
            </div>
          ))}
          <div style={{ display:'flex',justifyContent:'space-between',paddingTop:10,fontWeight:700,fontSize:15 }}>
            <span>Total Expenses</span>
            <span style={{ color:'var(--primary)' }}>RM{total.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportsPage({ isMobile }) {
  const [period, setPeriod]     = useState('Monthly');
  const [expanded, setExpanded] = useState(null); // which chart is expanded
  const r = reportSummary;

  const CHARTS = {
    revenue:   { title: 'Revenue vs Cost — Detailed View' },
    outlet:    { title: 'Revenue by Outlet — Detailed View' },
    topsell:   { title: 'Top Selling Items — Detailed View' },
    expense:   { title: 'Expense Breakdown — Detailed View' },
  };

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
        <div style={{ fontSize:13,color:'var(--text-3)',display:'flex',alignItems:'center',gap:6 }}>
          <span>Nov 2025</span>
          <span style={{ fontSize:11,color:'var(--text-3)',background:'#f4f4f5',borderRadius:6,padding:'2px 8px' }}>
            Click any chart to expand
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid',gridTemplateColumns:`repeat(${isMobile?2:4},1fr)`,gap:10,marginBottom:14 }}>
        <KpiCard label="Total Revenue" value={r.totalRevenue} prev={r.revPrev}/>
        <KpiCard label="Total Cost" value={r.totalCost}/>
        <KpiCard label="Net Profit" value={r.netProfit} highlight/>
        <KpiCard label="Net Margin" value={`${r.margin}%`} prefix=""/>
      </div>

      {/* Charts row 1 */}
      <div style={{ display:'grid',gridTemplateColumns: isMobile?'1fr':'1fr 1fr',gap:14,marginBottom:14 }}>
        <ChartCard title="Revenue vs Cost (4 Weeks)" onExpand={()=>setExpanded('revenue')}>
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
        </ChartCard>

        <ChartCard title="Revenue by Outlet" onExpand={()=>setExpanded('outlet')}>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={revenueByOutlet} cx="50%" cy="50%" outerRadius={70} dataKey="value"
                label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                {revenueByOutlet.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Pie>
              <Tooltip content={<PieTooltip/>}/>
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div style={{ display:'grid',gridTemplateColumns: isMobile?'1fr':'1fr 1fr',gap:14 }}>
        {/* Top selling — list style but clickable */}
        <ChartCard title="Top Selling Items" onExpand={()=>setExpanded('topsell')}>
          <div>
            {topSellingItems.map((item,i)=>{
              const maxQty = topSellingItems[0].qty;
              return (
                <div key={item.name} style={{ display:'flex',alignItems:'center',gap:12,padding:'9px 0',borderBottom: i<topSellingItems.length-1?'1px solid var(--border-soft)':'none' }}>
                  <div style={{ width:20,height:20,borderRadius:'50%',background:'var(--primary-light)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'var(--primary)',flexShrink:0 }}>
                    {i+1}
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.name}</div>
                    <div style={{ marginTop:3 }}>
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
        </ChartCard>

        <ChartCard title="Expense Breakdown" onExpand={()=>setExpanded('expense')}>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={expenseBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3}>
                {expenseBreakdown.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Pie>
              <Tooltip content={<PieTooltip/>}/>
              <Legend iconType="circle" iconSize={10} formatter={v=><span style={{ fontSize:12 }}>{v}</span>}/>
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Payment table */}
      <div className="card" style={{ marginTop:14,overflow:'hidden' }}>
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

      {/* ── Expanded modals ── */}
      {expanded === 'revenue' && (
        <ChartModal title={CHARTS.revenue.title} onClose={()=>setExpanded(null)}>
          <RevenueVsCostExpanded data={weeklyRevenue}/>
        </ChartModal>
      )}
      {expanded === 'outlet' && (
        <ChartModal title={CHARTS.outlet.title} onClose={()=>setExpanded(null)}>
          <RevenueByOutletExpanded data={revenueByOutlet}/>
        </ChartModal>
      )}
      {expanded === 'topsell' && (
        <ChartModal title={CHARTS.topsell.title} onClose={()=>setExpanded(null)}>
          <TopSellingExpanded data={topSellingItems}/>
        </ChartModal>
      )}
      {expanded === 'expense' && (
        <ChartModal title={CHARTS.expense.title} onClose={()=>setExpanded(null)}>
          <ExpenseBreakdownExpanded data={expenseBreakdown}/>
        </ChartModal>
      )}
    </div>
  );
}
