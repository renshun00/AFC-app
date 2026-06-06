import React, { useState } from 'react';
import {
  LayoutDashboard, ShoppingCart, Package, Wrench,
  Users, BarChart2, ClipboardList, Settings,
  FileText, X, Menu, ChevronDown, Bell,
  LogOut,
} from 'lucide-react';

const NAV = [
  { key: 'dashboard',  label: 'Dashboard',       icon: LayoutDashboard },
  { key: 'pos',        label: 'Point of Sale',    icon: ShoppingCart },
  { key: 'inventory',  label: 'Inventory',        icon: Package },
  { key: 'menu',       label: 'Menu Engineering', icon: Wrench },
  { key: 'staff',      label: 'Staff & Payroll',  icon: Users },
  { key: 'reports',    label: 'Reports',          icon: BarChart2 },
];

export function Sidebar({ page, setPage, open, onClose, isMobile }) {
  return (
    <>
      {isMobile && open && (
        <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:99 }} />
      )}
      <aside style={{
        width: 'var(--sidebar-w)',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        padding: '24px 0 20px',
        position: 'fixed', left:0, top:0, bottom:0,
        zIndex: 100,
        transform: isMobile && !open ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform .25s cubic-bezier(.4,0,.2,1)',
        boxShadow: isMobile && open ? '4px 0 24px rgba(0,0,0,.14)' : 'none',
      }}>
        {/* Brand */}
        <div style={{ padding:'0 16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <img
              src="/afc_logo.jpg"
              alt="AFC"
              style={{
                width: 42, height: 42, borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--primary-light)',
                flexShrink: 0,
              }}
            />
            <div>
              <div style={{ fontWeight:700, fontSize:14, lineHeight:1.2, color:'var(--text-1)' }}>AFC Management</div>
              <div style={{ fontSize:10, color:'var(--text-3)', marginTop:2 }}>Active Session: Admin</div>
            </div>
          </div>
          {isMobile && (
            <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--text-3)',padding:4 }}>
              <X size={18}/>
            </button>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'0 10px', overflowY:'auto' }}>
          {NAV.map(({ key, label, icon: Icon }) => {
            const active = page === key;
            return (
              <button key={key}
                onClick={() => { setPage(key); if(isMobile) onClose(); }}
                style={{
                  display:'flex', alignItems:'center', gap:10,
                  width:'100%', padding:'10px 12px', borderRadius:'var(--radius-sm)',
                  border:'none', fontFamily:'var(--font)', fontSize:13.5,
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--primary)' : 'var(--text-2)',
                  background: active ? 'var(--primary-light)' : 'transparent',
                  marginBottom:2, cursor:'pointer',
                  transition:'background .12s',
                }}
                onMouseEnter={e => { if(!active) e.currentTarget.style.background='#f4f4f5'; }}
                onMouseLeave={e => { if(!active) e.currentTarget.style.background='transparent'; }}
              >
                <Icon size={16}/>{label}
              </button>
            );
          })}
        </nav>

        {/* Daily Report CTA */}
        <div style={{ padding:'0 10px 16px' }}>
          <button onClick={() => { setPage('daily'); if(isMobile) onClose(); }}
            className="btn btn-primary"
            style={{ width:'100%', justifyContent:'center', gap:8 }}>
            <FileText size={15}/>Daily Report
          </button>
        </div>

        {/* Settings */}
        <div style={{ padding:'0 10px', borderTop:'1px solid var(--border)', paddingTop:14 }}>
          <button style={{
            display:'flex', alignItems:'center', gap:10, width:'100%',
            padding:'10px 12px', borderRadius:'var(--radius-sm)', border:'none',
            background:'transparent', fontFamily:'var(--font)', fontSize:13.5,
            fontWeight:500, color:'var(--text-2)', cursor:'pointer',
          }}>
            <Settings size={16}/>Settings
          </button>
        </div>
      </aside>
    </>
  );
}

export function TopBar({ page, isMobile, onMenuClick, onLogout }) {
  const labels = {
    dashboard: 'Dashboard Overview',
    pos: 'Point of Sale',
    inventory: 'Inventory Management',
    menu: 'Menu Engineering',
    staff: 'Staff & Payroll Operations',
    daily: 'Daily Reconciliation',
    reports: 'Reports & Analytics',
  };
  const subs = {
    dashboard: 'High-level operations summary for today.',
    pos: 'Manage orders and process sales.',
    inventory: 'Track stock levels and materials.',
    menu: 'Manage menu items, pricing and costs.',
    staff: 'Track staff tasks and calculate wages.',
    daily: 'End-of-day summary and P&L.',
    reports: 'Monthly analytics and performance.',
  };
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      marginBottom: isMobile ? 16 : 24,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        {isMobile && (
          <button onClick={onMenuClick} style={{ background:'none',border:'none',color:'var(--text-1)',padding:4 }}>
            <Menu size={22}/>
          </button>
        )}
        <div>
          <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight:700, lineHeight:1.2 }}>{labels[page]}</h1>
          {!isMobile && <p style={{ fontSize:13, color:'var(--text-3)', marginTop:2 }}>{subs[page]}</p>}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {!isMobile && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 12px 5px 6px', borderRadius:'var(--radius-sm)', border:'1.5px solid var(--border)', background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            <img src="/afc_logo.jpg" alt="AFC" style={{ width:26, height:26, borderRadius:'50%', objectFit:'cover' }}/>
            AFC – Main Branch
            <ChevronDown size={13}/>
          </div>
        )}
        <button style={{ background:'#fff', border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'7px 10px', color:'var(--text-2)', display:'flex', alignItems:'center' }}>
          <Bell size={16}/>
        </button>
        <button onClick={onLogout} style={{ background:'#fff', border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'7px 10px', color:'var(--text-2)', display:'flex', alignItems:'center' }}>
          <LogOut size={16}/>
        </button>
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, maxWidth = 480 }) {
  return (
    <div className="modal-backdrop" onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontWeight:700, fontSize:16 }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-3)', cursor:'pointer', padding:4 }}>
            <X size={18}/>
          </button>
        </div>
        <div style={{ padding:'20px' }}>{children}</div>
      </div>
    </div>
  );
}

export function FormRow({ label, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'var(--text-2)', marginBottom:5 }}>{label}</label>
      {children}
    </div>
  );
}
