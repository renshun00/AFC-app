import React from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  CreditCard, ShoppingCart, Wallet, Utensils,
  Users, AlertTriangle, Receipt, Truck, FileDown, ChevronDown,
} from 'lucide-react';
import { dashboardStats, salesChartData, reconciliationItems } from '../data/placeholder';

function StatCard({ label, value, change, up, highlight, icon: Icon, sub }) {
  return (
    <div style={{
      background: highlight ? 'var(--green)' : 'var(--card)',
      borderRadius: 'var(--radius)', border: highlight ? 'none' : '1px solid var(--border)',
      padding: '18px 20px', flex: 1, minWidth: 0,
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', color: highlight ? 'rgba(255,255,255,.65)' : 'var(--text-3)' }}>{label}</div>
        <div style={{ width:30,height:30,borderRadius:8,background: highlight ? 'rgba(255,255,255,.15)' : '#f4f4f5', display:'flex',alignItems:'center',justifyContent:'center', color: highlight ? '#fff' : 'var(--text-2)' }}>
          <Icon size={14}/>
        </div>
      </div>
      <div style={{ fontSize:28, fontWeight:700, color: highlight ? '#fff' : 'var(--text-1)', lineHeight:1.1, marginBottom:6 }}>{value}</div>
      {change && (
        <div style={{ fontSize:12, fontWeight:500, color: highlight ? 'rgba(255,255,255,.75)' : (up ? '#16a34a' : '#dc2626') }}>
          {up ? '↗' : '↘'} {change}
        </div>
      )}
      {sub && <div style={{ fontSize:12, color:'rgba(255,255,255,.65)', marginTop:2 }}>{sub}</div>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'10px 14px', fontSize:12, boxShadow:'var(--shadow)' }}>
      <div style={{ fontWeight:600, marginBottom:4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.name==='sales' ? '#c0392b' : '#e8624a', marginBottom:2 }}>
          {p.name==='sales'?'Sales':'Expenses'}: RM{p.value.toLocaleString()}
        </div>
      ))}
    </div>
  );
};

export default function DashboardPage({ isMobile }) {
  const d = dashboardStats;
  return (
    <div>
      {/* Action row */}
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginBottom:16 }}>
        {!isMobile && (
          <button className="btn btn-outline" style={{ fontSize:13 }}>
            <span style={{ width:8,height:8,borderRadius:'50%',background:'var(--primary)',display:'inline-block' }}/>
            AFC – Main Branch <ChevronDown size={13}/>
          </button>
        )}
        <button className="btn btn-outline" style={{ fontSize:13 }}>
          <FileDown size={14}/>{!isMobile && ' Export PDF'}
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display:'flex', flexDirection: isMobile ? 'column' : 'row', gap:12, marginBottom:14 }}>
        <StatCard label="Daily Revenue" value={`RM${d.dailyRevenue.toFixed(2)}`} change="+12% from yesterday" up icon={CreditCard}/>
        <StatCard label="Cost of Sales" value={`RM${d.costOfSales.toFixed(2)}`} change="-2% from yesterday" icon={ShoppingCart}/>
        <StatCard label="Gross Profit" value={`RM${d.grossProfit.toFixed(2)}`} highlight icon={Wallet} sub={`${d.margin}% Margin`}/>
      </div>

      {/* Main grid */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.65fr', gap:12 }}>
        {/* Left */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Chicken used */}
          <div className="card" style={{ padding:'16px 18px', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:42,height:42,borderRadius:10,background:'var(--indigo-light)',display:'flex',alignItems:'center',justifyContent:'center',color:'#4f6ef7',flexShrink:0 }}>
              <Utensils size={18}/>
            </div>
            <div>
              <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:2 }}>Total Chicken Used</div>
              <div style={{ fontSize:22, fontWeight:700 }}>{d.chickenUsed} kg</div>
            </div>
          </div>
          {/* Staff wages */}
          <div className="card" style={{ padding:'16px 18px', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:42,height:42,borderRadius:10,background:'var(--indigo-light)',display:'flex',alignItems:'center',justifyContent:'center',color:'#4f6ef7',flexShrink:0 }}>
              <Users size={18}/>
            </div>
            <div>
              <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:2 }}>Staff Wages Today</div>
              <div style={{ fontSize:22, fontWeight:700 }}>RM {d.staffWages.toFixed(2)}</div>
            </div>
          </div>
          {/* Alerts */}
          <div style={{ background:'#fff9f9', borderRadius:'var(--radius)', border:'1.5px solid #fecaca', padding:'16px 18px' }}>
            <div style={{ display:'flex',alignItems:'center',gap:7,marginBottom:12,color:'var(--primary)',fontSize:11,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase' }}>
              <AlertTriangle size={13}/> Active Alerts
            </div>
            <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
              {[
                { label:'Low Chicken Stock', badge:'Urgent', urgent:true },
                { label:'Fryer Oil Replacement', badge:'Pending', urgent:false },
              ].map(a => (
                <div key={a.label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fff',border:'1px solid #eee',borderRadius:'var(--radius-sm)',padding:'9px 12px' }}>
                  <span style={{ fontSize:13,fontWeight:500 }}>{a.label}</span>
                  <span className={`badge ${a.urgent?'badge-red':'badge-gray'}`}>{a.badge}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Chart */}
          <div className="card" style={{ padding:'18px 20px 12px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
              <div style={{ fontSize:15,fontWeight:700 }}>Sales vs Expenses (7 Days)</div>
              <div style={{ fontSize:11,color:'var(--text-3)' }}>Nov 10 – Nov 17</div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={salesChartData} margin={{ top:4, right:4, left:-20, bottom:0 }}>
                <CartesianGrid vertical={false} stroke="#f0f0f0"/>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize:11, fill:'#aaa' }}/>
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize:10, fill:'#bbb' }} tickFormatter={v=>`${v/1000}k`}/>
                <Tooltip content={<CustomTooltip/>} cursor={{ fill:'rgba(0,0,0,.03)' }}/>
                <Bar dataKey="sales" fill="#c0392b" radius={[4,4,0,0]} maxBarSize={36}/>
                <Line type="monotone" dataKey="expenses" stroke="#e8624a" strokeWidth={2} dot={false}/>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Reconciliation */}
          <div style={{ background:'var(--indigo-light)', borderRadius:'var(--radius)', border:'1px solid #dde4ff', padding:'16px 18px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2 }}>
              <div style={{ fontSize:14,fontWeight:700 }}>Recent Sales Reconciliation</div>
              <button className="btn btn-ghost btn-sm" style={{ color:'var(--primary)',padding:'4px 8px' }}>View All</button>
            </div>
            {reconciliationItems.map((r,i) => (
              <div key={r.id} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 0',borderBottom: i<reconciliationItems.length-1?'1px solid #e0e5ff':'none' }}>
                <div style={{ display:'flex',alignItems:'center',gap:10,minWidth:0 }}>
                  <div style={{ width:32,height:32,borderRadius:8,background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',color:'#4f6ef7',flexShrink:0 }}>
                    {r.type==='delivery' ? <Truck size={14}/> : <Receipt size={14}/>}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.title}</div>
                    <div style={{ fontSize:11,color:'var(--text-3)',marginTop:1 }}>{r.sub}</div>
                  </div>
                </div>
                <div style={{ textAlign:'right',flexShrink:0,marginLeft:12 }}>
                  <div style={{ fontSize:13,fontWeight:700 }}>{r.amount}</div>
                  <div style={{ fontSize:11,fontWeight:600,marginTop:1,
                    color: r.status==='Matched' ? 'var(--green)' : r.status==='Logged' ? 'var(--text-3)' : '#dc2626'
                  }}>
                    {r.status==='Discrepancy' ? r.disc+' Discrepancy' : r.status==='Logged' ? 'Logged by Admin' : r.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
