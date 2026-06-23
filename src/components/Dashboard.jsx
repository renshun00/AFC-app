import React from 'react';
import {
  CreditCard, ShoppingCart, Wallet, Utensils,
  Users, AlertTriangle, ChevronDown, FileDown,
  Receipt, Truck, Menu,
} from 'lucide-react';
import SalesChart from './SalesChart';
import { useWindowSize } from '../hooks/useWindowSize';

function StatCard({ label, value, change, changeType, highlight, isMobile }) {
  const isUp = changeType === 'up';
  return (
    <div style={{
      background: highlight ? 'var(--green)' : 'var(--card-bg)',
      borderRadius: 14,
      padding: isMobile ? '16px 18px' : '22px 24px',
      border: highlight ? 'none' : '1px solid var(--border)',
      flex: 1, minWidth: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{
          fontSize: isMobile ? 10 : 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: highlight ? 'rgba(255,255,255,0.75)' : 'var(--text-light)',
        }}>
          {label}
        </div>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: highlight ? 'rgba(255,255,255,0.15)' : '#f5f5f5',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: highlight ? '#fff' : 'var(--text-mid)',
        }}>
          {label === 'DAILY REVENUE' && <CreditCard size={14} />}
          {label === 'COST OF SALES' && <ShoppingCart size={14} />}
          {label === 'GROSS PROFIT' && <Wallet size={14} />}
        </div>
      </div>
      <div style={{
        fontSize: isMobile ? 20 : 30,
        fontWeight: 700,
        color: highlight ? '#fff' : 'var(--text-dark)',
        lineHeight: 1.1, marginBottom: 8,
      }}>
        {value}
      </div>
      {change && (
        <div style={{
          fontSize: 12, fontWeight: 500,
          color: highlight ? 'rgba(255,255,255,0.8)' : (isUp ? '#e8624a' : '#888'),
        }}>
          {isUp ? '↗' : '↘'} {change}
        </div>
      )}
      {label === 'GROSS PROFIT' && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>73.6% Margin</div>
      )}
    </div>
  );
}

function InfoCard({ icon, title, value, compact }) {
  return (
    <div style={{
      background: 'var(--card-bg)', borderRadius: 14,
      padding: compact ? '14px 16px' : '18px 20px',
      border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: 'var(--blue-light)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#4f6ef7', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: compact ? 18 : 22, fontWeight: 700 }}>{value}</div>
      </div>
    </div>
  );
}

function AlertCard({ compact }) {
  return (
    <div style={{
      background: '#fff9f9', borderRadius: 14,
      padding: compact ? '14px 16px' : '18px 20px',
      border: '1.5px solid var(--alert-border)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 12, color: '#e8624a',
        fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      }}>
        <AlertTriangle size={14} /> Active Alerts
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AlertRow label="Low Chicken Stock" badge="Urgent" urgent />
        <AlertRow label="Fryer Oil Replacement" badge="Pending" />
      </div>
    </div>
  );
}

function AlertRow({ label, badge, urgent }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: '#fff', border: '1px solid #eee',
      borderRadius: 9, padding: '9px 12px',
    }}>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
      <span style={{
        fontSize: 11, fontWeight: 600,
        color: urgent ? 'var(--primary)' : '#666',
        background: urgent ? '#fde8e4' : '#f0f0f0',
        borderRadius: 6, padding: '3px 10px',
      }}>
        {badge}
      </span>
    </div>
  );
}

function ReconciliationRow({ icon, title, sub, amount, status }) {
  const isMatched = status === 'Matched';
  const isDelivery = status === 'delivery';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0', borderBottom: '1px solid #f0f0f0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: '#f0f3ff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f6ef7',
        }}>
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 1 }}>{sub}</div>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{amount}</div>
        <div style={{
          fontSize: 11, fontWeight: 600, marginTop: 1,
          color: isMatched ? '#1a7a4a' : isDelivery ? 'var(--text-light)' : '#e8624a',
        }}>
          {isDelivery ? 'Logged by Admin' : status}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ onMenuClick }) {
  const { isMobile, isTablet, width } = useWindowSize();
  const isNarrow = isMobile || isTablet;
  const pad = isMobile ? 16 : isTablet ? 24 : 32;

  return (
    <div style={{
      marginLeft: isMobile ? 0 : 'var(--sidebar-width)',
      padding: `${pad}px ${pad}px 48px`,
      minHeight: '100vh',
      background: 'var(--main-bg)',
      transition: 'margin-left 0.25s',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: isMobile ? 20 : 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isMobile && (
            <button onClick={onMenuClick} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dark)', padding: 4, marginTop: 2,
            }}>
              <Menu size={22} />
            </button>
          )}
          <div>
            <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 700, marginBottom: 3 }}>
              Dashboard Overview
            </h1>
            {!isMobile && (
              <p style={{ fontSize: 13, color: 'var(--text-light)' }}>
                High-level operations summary for today.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {!isMobile && (
            <button style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10,
              border: '1.5px solid var(--border)', background: '#fff',
              cursor: 'pointer', fontFamily: 'var(--font)',
              fontSize: 13, fontWeight: 600, color: 'var(--text-dark)',
            }}>
              <Receipt size={13} style={{ color: 'var(--primary)' }} />
              AFC – Main Branch
              <ChevronDown size={13} />
            </button>
          )}
          <button style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 10,
            border: '1.5px solid var(--border)', background: '#fff',
            cursor: 'pointer', fontFamily: 'var(--font)',
            fontSize: 13, fontWeight: 600, color: 'var(--text-dark)',
          }}>
            <FileDown size={13} />
            {!isMobile && 'Export PDF'}
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 12, marginBottom: 14,
      }}>
        <StatCard label="DAILY REVENUE" value="RM4,250.00" change="+12% from yesterday" changeType="up" isMobile={isMobile} />
        <StatCard label="COST OF SALES" value="RM1,120.50" change="-2% from yesterday" changeType="down" isMobile={isMobile} />
        <StatCard label="GROSS PROFIT" value="RM3,129.50" highlight isMobile={isMobile} />
      </div>

      {/* Main Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isNarrow ? '1fr' : '1fr 1.6fr',
        gap: 14,
      }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <InfoCard icon={<Utensils size={18} />} title="Total Chicken Used" value="145 kg" compact={isMobile} />
          <InfoCard icon={<Users size={18} />} title="Staff Wages Today" value="RM 480.00" compact={isMobile} />
          <AlertCard compact={isMobile} />
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SalesChart />

          {/* Reconciliation */}
          <div style={{
            background: '#f0f3ff', borderRadius: 14,
            padding: isMobile ? '14px 16px' : '18px 20px',
            border: '1px solid #e0e5ff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Recent Sales Reconciliation</div>
              <button style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, color: 'var(--primary)',
              }}>
                View All
              </button>
            </div>
            <ReconciliationRow
              icon={<Receipt size={15} />}
              title="Register 1 Closed"
              sub="Cashier: Sarah M. • 2 mins ago"
              amount="RM1,240.00"
              status="Matched"
            />
            <ReconciliationRow
              icon={<Receipt size={15} />}
              title="Register 2 Closed"
              sub="Cashier: Mike T. • 45 mins ago"
              amount="RM980.50"
              status="-RM5.00 Discrepancy"
            />
            <ReconciliationRow
              icon={<Truck size={15} />}
              title="Inventory Delivery Received"
              sub="Supplier: FreshFarm • 2 hours ago"
              amount="+200kg Chicken"
              status="delivery"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
