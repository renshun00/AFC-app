import React from 'react';
import {
  LayoutDashboard, Monitor, Package, Users,
  Building2, BarChart2, Settings, FileText, X,
} from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: Monitor, label: 'POS' },
  { icon: Package, label: 'Inventory' },
  { icon: Users, label: 'Staff' },
  { icon: Building2, label: 'Accounting' },
  { icon: BarChart2, label: 'Reports' },
];

export default function Sidebar({ open, onClose, isMobile }) {
  return (
    <>
      {isMobile && open && (
        <div onClick={onClose} style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)', zIndex: 99,
        }} />
      )}

      <aside style={{
        width: 'var(--sidebar-width)',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        padding: '28px 0 24px',
        position: 'fixed', left: 0, top: 0, bottom: 0,
        zIndex: 100,
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        transform: isMobile && !open ? 'translateX(-100%)' : 'translateX(0)',
        boxShadow: isMobile && open ? '4px 0 24px rgba(0,0,0,0.12)' : 'none',
      }}>
        {/* Brand */}
        <div style={{ padding: '0 20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--text-dark)', lineHeight: 1.2 }}>
              AFC<br />Management
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 6 }}>
              Active Session: Admin
            </div>
          </div>
          {isMobile && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', padding: 4 }}>
              <X size={18} />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0 12px' }}>
          {navItems.map(({ icon: Icon, label, active }) => (
            <button key={label} onClick={isMobile ? onClose : undefined} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              width: '100%', padding: '11px 14px', borderRadius: 10,
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
              fontSize: 14, fontWeight: active ? 600 : 500,
              color: active ? 'var(--primary)' : 'var(--text-mid)',
              background: active ? 'var(--primary-light)' : 'transparent',
              marginBottom: 2, transition: 'background 0.15s',
            }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f7f7f7'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon size={18} />{label}
            </button>
          ))}
        </nav>

        {/* Daily Report */}
        <div style={{ padding: '0 12px 20px' }}>
          <button style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, width: '100%', padding: '13px 14px', borderRadius: 10,
            border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
            fontSize: 14, fontWeight: 600, color: '#fff', background: 'var(--primary)',
          }}>
            <FileText size={16} /> Daily Report
          </button>
        </div>

        {/* Settings */}
        <div style={{ padding: '16px 12px 0', borderTop: '1px solid var(--border)' }}>
          <button style={{
            display: 'flex', alignItems: 'center', gap: 12,
            width: '100%', padding: '11px 14px', borderRadius: 10,
            border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
            fontSize: 14, fontWeight: 500, color: 'var(--text-mid)', background: 'transparent',
          }}>
            <Settings size={18} /> Settings
          </button>
        </div>
      </aside>
    </>
  );
}
