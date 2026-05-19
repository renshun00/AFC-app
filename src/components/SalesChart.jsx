import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const data = [
  { day: 'Mon', sales: 2800, expenses: 1100 },
  { day: 'Tue', sales: 3400, expenses: 1300 },
  { day: 'Wed', sales: 3100, expenses: 1200 },
  { day: 'Thu', sales: 3800, expenses: 1450 },
  { day: 'Fri', sales: 3600, expenses: 1380 },
  { day: 'Sat', sales: 4100, expenses: 1500 },
  { day: 'Sun', sales: 4250, expenses: 1120 },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: '#fff',
        border: '1px solid #e5e5e5',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 13,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
        {payload.map(p => (
          <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
            {p.name === 'sales' ? 'Sales' : 'Expenses'}: RM{p.value.toLocaleString()}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function SalesChart() {
  return (
    <div style={{
      background: 'var(--card-bg)',
      borderRadius: 14,
      padding: '20px 20px 12px',
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Sales vs Expenses (7 Days)</div>
        <div style={{ fontSize: 12, color: 'var(--text-light)' }}>Nov 10 – Nov 17</div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} barGap={2} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f0f0f0" />
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: '#888' }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: '#aaa' }}
            tickFormatter={v => `${v / 1000}k`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
          <Bar dataKey="sales" fill="#c0392b" radius={[4, 4, 0, 0]} maxBarSize={40} />
          <Line
            type="monotone"
            dataKey="expenses"
            stroke="#e8624a"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
