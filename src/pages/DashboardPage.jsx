import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  CreditCard, ShoppingCart, Wallet, Utensils,
  Users, AlertTriangle, Receipt, Truck, FileDown, ChevronDown,
  Loader,
} from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { where, orderBy, limit } from 'firebase/firestore';
import {
  dailyProfitSummaryService,
  salesOrderService,
  cashRegisterService,
  payrollSummaryService,
  inventorySummaryService,
} from '../services/firestoreService';

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtRM(n) {
  return `RM${(n ?? 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Returns an array of the last N day-of-week labels + date strings */
function lastNDays(n) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const result = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push({
      day: days[d.getDay()],
      dateStr: d.toISOString().slice(0, 10),
    });
  }
  return result;
}

function timeAgo(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, change, up, highlight, icon: Icon, sub, loading }) {
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
      <div style={{ fontSize:28, fontWeight:700, color: highlight ? '#fff' : 'var(--text-1)', lineHeight:1.1, marginBottom:6 }}>
        {loading ? <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> : value}
      </div>
      {change && !loading && (
        <div style={{ fontSize:12, fontWeight:500, color: highlight ? 'rgba(255,255,255,.75)' : (up ? '#16a34a' : '#dc2626') }}>
          {up ? '↗' : '↘'} {change}
        </div>
      )}
      {sub && !loading && <div style={{ fontSize:12, color:'rgba(255,255,255,.65)', marginTop:2 }}>{sub}</div>}
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
          {p.name==='sales'?'Sales':'Expenses'}: {fmtRM(p.value)}
        </div>
      ))}
    </div>
  );
};

// ── Main component ──────────────────────────────────────────────────────────

export default function DashboardPage({ isMobile, navigate }) {
  // ─── Live Firestore subscriptions ────────────────────────────────────────
  // Today's completed sales orders
  const { data: todayOrders, loading: ordersLoading } = useFirestore(
    'sales_orders',
    where('status', '==', 'completed'),
    orderBy('createdAt', 'desc'),
    limit(500),
  );

  // Cash register sessions (recent)
  const { data: registerSessions, loading: sessionsLoading } = useFirestore(
    'cash_register_sessions',
    orderBy('createdAt', 'desc'),
    limit(20),
  );

  // All inventory products (for alerts)
  const { data: inventoryProducts, loading: invLoading } = useFirestore('products');

  // Payroll summaries for today
  const { data: payrollDocs, loading: payrollLoading } = useFirestore(
    'payroll_summary',
    where('date', '==', todayStr()),
  );

  // ─── Derived state ──────────────────────────────────────────────────────
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [yesterdayRevenue, setYesterdayRevenue] = useState(null);
  const [yesterdayCost, setYesterdayCost] = useState(null);
  const [todayProfitDoc, setTodayProfitDoc] = useState(null);

  // Fetch 7-day chart data + yesterday's P&L from daily_profit_summary
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const days = lastNDays(7);
        const recent = await dailyProfitSummaryService.getRecent(8);

        // Build a map: dateStr → doc
        const byDate = {};
        recent.forEach(d => { byDate[d.date] = d; });

        const chart = days.map(({ day, dateStr }) => {
          const doc = byDate[dateStr];
          return {
            day,
            sales: doc?.revenue ?? 0,
            expenses: (doc?.cost ?? 0) + (doc?.expense ?? 0),
          };
        });

        // Yesterday's P&L for comparison %
        const yestDate = new Date();
        yestDate.setDate(yestDate.getDate() - 1);
        const yestStr = yestDate.toISOString().slice(0, 10);
        const yestDoc = byDate[yestStr];

        // Today's P&L doc
        const todayDoc = byDate[todayStr()];

        if (!cancelled) {
          setChartData(chart);
          setYesterdayRevenue(yestDoc?.revenue ?? null);
          setYesterdayCost(yestDoc?.cost ?? null);
          setTodayProfitDoc(todayDoc);
          setChartLoading(false);
        }
      } catch (err) {
        console.error('[Dashboard] chart data error:', err);
        if (!cancelled) setChartLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Compute today's stats from live orders ─────────────────────────────
  const todayStats = useMemo(() => {
    const today = startOfDay();
    const todayEnd = endOfDay();

    // Filter orders to today only
    const filtered = todayOrders.filter(o => {
      if (!o.createdAt) return false;
      const d = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
      return d >= today && d <= todayEnd;
    });

    const dailyRevenue = filtered.reduce((s, o) => s + (o.total ?? 0), 0);

    // Cost of sales: use today's profit doc if available, else estimate from orders
    const costOfSales = todayProfitDoc?.cost ?? 0;
    const grossProfit = dailyRevenue - costOfSales;
    const margin = dailyRevenue > 0 ? ((grossProfit / dailyRevenue) * 100).toFixed(1) : '0.0';

    return { dailyRevenue, costOfSales, grossProfit, margin, orderCount: filtered.length };
  }, [todayOrders, todayProfitDoc]);

  // Revenue % change vs yesterday
  const revChange = useMemo(() => {
    if (yesterdayRevenue == null || yesterdayRevenue === 0) return null;
    const pct = ((todayStats.dailyRevenue - yesterdayRevenue) / yesterdayRevenue * 100).toFixed(0);
    return { text: `${pct >= 0 ? '+' : ''}${pct}% from yesterday`, up: pct >= 0 };
  }, [todayStats.dailyRevenue, yesterdayRevenue]);

  // Cost % change vs yesterday
  const costChange = useMemo(() => {
    if (yesterdayCost == null || yesterdayCost === 0) return null;
    const pct = ((todayStats.costOfSales - yesterdayCost) / yesterdayCost * 100).toFixed(0);
    return { text: `${pct >= 0 ? '+' : ''}${pct}% from yesterday`, up: pct >= 0 };
  }, [todayStats.costOfSales, yesterdayCost]);

  // ─── Chicken used today ─────────────────────────────────────────────────
  // Sum up inventory transactions of type PRODUCTION for chicken products today
  // Approximation: sum negative stock changes from inventory_transactions
  // For simplicity, we'll compute from total orders * average chicken per order
  // Or better: read from today's profit summary expense breakdown
  const chickenUsed = useMemo(() => {
    // Look for chicken items in inventory
    const chickenItems = inventoryProducts.filter(p =>
      p.name && p.name.toLowerCase().includes('chicken') && p.isInventoryItem
    );
    // Sum initial stock - current stock as rough "used" (this is a snapshot metric)
    // Better: if daily report tracks this, use that. For now show current stock.
    return chickenItems.reduce((s, p) => s + (p.stock ?? 0), 0);
  }, [inventoryProducts]);

  // ─── Staff wages today ──────────────────────────────────────────────────
  const staffWages = useMemo(() => {
    return payrollDocs.reduce((s, d) => s + (d.wage ?? 0), 0);
  }, [payrollDocs]);

  // ─── Low-stock alerts ───────────────────────────────────────────────────
  const alerts = useMemo(() => {
    return inventoryProducts
      .filter(p => p.isInventoryItem && p.isActive && p.stock != null && p.minStock != null && p.stock <= p.minStock)
      .map(p => ({
        label: `Low ${p.name} Stock`,
        badge: p.stock <= 0 ? 'Critical' : p.stock <= p.minStock * 0.5 ? 'Urgent' : 'Low',
        urgent: p.stock <= p.minStock * 0.5,
      }))
      .slice(0, 5);
  }, [inventoryProducts]);

  // ─── Reconciliation items from cash register sessions ───────────────────
  const reconciliation = useMemo(() => {
    return registerSessions.slice(0, 5).map(s => {
      const totalSales = s.closingCash != null ? s.closingCash - (s.openingCash ?? 0) : null;
      const discrepancy = totalSales != null && s.expectedSales != null
        ? totalSales - s.expectedSales : null;

      let status = 'Logged';
      let disc = null;
      if (s.status === 'closed' && discrepancy != null) {
        if (Math.abs(discrepancy) < 0.01) {
          status = 'Matched';
        } else {
          status = 'Discrepancy';
          disc = `${discrepancy >= 0 ? '+' : ''}${fmtRM(discrepancy)}`;
        }
      } else if (s.status === 'closed') {
        status = 'Matched';
      }

      return {
        id: s.id,
        type: 'register',
        title: `Register ${s.status === 'closed' ? 'Closed' : 'Open'}`,
        sub: `Staff: ${s.staffId ?? 'Unknown'} • ${timeAgo(s.createdAt)}`,
        amount: s.closingCash != null ? fmtRM(s.closingCash) : fmtRM(s.openingCash ?? 0),
        status,
        disc,
      };
    });
  }, [registerSessions]);

  // ─── Chart date range label ─────────────────────────────────────────────
  const chartDateRange = useMemo(() => {
    if (chartData.length === 0) return '';
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  }, [chartData]);

  // ─── Export PDF handler ─────────────────────────────────────────────────
  const handleExportPDF = useCallback(() => {
    window.print();
  }, []);

  // ─── Navigate to reports / daily ────────────────────────────────────────
  const handleViewAll = useCallback(() => {
    if (navigate) navigate('daily');
  }, [navigate]);

  const isLoading = ordersLoading || invLoading;

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
        <button className="btn btn-outline" style={{ fontSize:13 }} onClick={handleExportPDF}>
          <FileDown size={14}/>{!isMobile && ' Export PDF'}
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display:'flex', flexDirection: isMobile ? 'column' : 'row', gap:12, marginBottom:14 }}>
        <StatCard
          label="Daily Revenue"
          value={fmtRM(todayStats.dailyRevenue)}
          change={revChange?.text}
          up={revChange?.up}
          icon={CreditCard}
          loading={isLoading}
        />
        <StatCard
          label="Cost of Sales"
          value={fmtRM(todayStats.costOfSales)}
          change={costChange?.text}
          up={costChange?.up}
          icon={ShoppingCart}
          loading={isLoading}
        />
        <StatCard
          label="Gross Profit"
          value={fmtRM(todayStats.grossProfit)}
          highlight
          icon={Wallet}
          sub={`${todayStats.margin}% Margin`}
          loading={isLoading}
        />
      </div>

      {/* Main grid */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.65fr', gap:12 }}>
        {/* Left */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Chicken stock */}
          <div className="card" style={{ padding:'16px 18px', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:42,height:42,borderRadius:10,background:'var(--indigo-light)',display:'flex',alignItems:'center',justifyContent:'center',color:'#4f6ef7',flexShrink:0 }}>
              <Utensils size={18}/>
            </div>
            <div>
              <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:2 }}>Chicken Stock</div>
              <div style={{ fontSize:22, fontWeight:700 }}>
                {invLoading ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : `${chickenUsed} kg`}
              </div>
            </div>
          </div>
          {/* Staff wages */}
          <div className="card" style={{ padding:'16px 18px', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:42,height:42,borderRadius:10,background:'var(--indigo-light)',display:'flex',alignItems:'center',justifyContent:'center',color:'#4f6ef7',flexShrink:0 }}>
              <Users size={18}/>
            </div>
            <div>
              <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:2 }}>Staff Wages Today</div>
              <div style={{ fontSize:22, fontWeight:700 }}>
                {payrollLoading ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : fmtRM(staffWages)}
              </div>
            </div>
          </div>
          {/* Alerts */}
          <div style={{ background:'#fff9f9', borderRadius:'var(--radius)', border:'1.5px solid #fecaca', padding:'16px 18px' }}>
            <div style={{ display:'flex',alignItems:'center',gap:7,marginBottom:12,color:'var(--primary)',fontSize:11,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase' }}>
              <AlertTriangle size={13}/> Active Alerts
              {alerts.length > 0 && (
                <span style={{
                  background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 700,
                  borderRadius: 99, padding: '1px 7px', marginLeft: 4,
                }}>{alerts.length}</span>
              )}
            </div>
            <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
              {invLoading ? (
                <div style={{ textAlign:'center', padding:'12px 0', color:'var(--text-3)', fontSize:12 }}>
                  <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : alerts.length === 0 ? (
                <div style={{ textAlign:'center', padding:'12px 0', color:'var(--text-3)', fontSize:13 }}>
                  ✅ No active alerts — all stock levels OK
                </div>
              ) : (
                alerts.map(a => (
                  <div key={a.label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fff',border:'1px solid #eee',borderRadius:'var(--radius-sm)',padding:'9px 12px' }}>
                    <span style={{ fontSize:13,fontWeight:500 }}>{a.label}</span>
                    <span className={`badge ${a.urgent?'badge-red':'badge-gray'}`}>{a.badge}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Chart */}
          <div className="card" style={{ padding:'18px 20px 12px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
              <div style={{ fontSize:15,fontWeight:700 }}>Sales vs Expenses (7 Days)</div>
              <div style={{ fontSize:11,color:'var(--text-3)' }}>{chartDateRange}</div>
            </div>
            {chartLoading ? (
              <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-3)' }}>
                <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={chartData} margin={{ top:4, right:4, left:-20, bottom:0 }}>
                  <CartesianGrid vertical={false} stroke="#f0f0f0"/>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize:11, fill:'#aaa' }}/>
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize:10, fill:'#bbb' }} tickFormatter={v=>`${v/1000}k`}/>
                  <Tooltip content={<CustomTooltip/>} cursor={{ fill:'rgba(0,0,0,.03)' }}/>
                  <Bar dataKey="sales" fill="#c0392b" radius={[4,4,0,0]} maxBarSize={36}/>
                  <Line type="monotone" dataKey="expenses" stroke="#e8624a" strokeWidth={2} dot={false}/>
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Reconciliation */}
          <div style={{ background:'var(--indigo-light)', borderRadius:'var(--radius)', border:'1px solid #dde4ff', padding:'16px 18px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2 }}>
              <div style={{ fontSize:14,fontWeight:700 }}>Recent Sales Reconciliation</div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color:'var(--primary)',padding:'4px 8px' }}
                onClick={handleViewAll}
              >View All</button>
            </div>
            {sessionsLoading ? (
              <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text-3)' }}>
                <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : reconciliation.length === 0 ? (
              <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text-3)', fontSize:13 }}>
                No register sessions found yet.
              </div>
            ) : (
              reconciliation.map((r,i) => (
                <div key={r.id} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 0',borderBottom: i<reconciliation.length-1?'1px solid #e0e5ff':'none' }}>
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
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
