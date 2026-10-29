import React from 'react';
import { Truck, ChevronRight, RefreshCw, PackageCheck } from 'lucide-react';
import { STALL_ITEMS } from '../utils/stallOpening.js';

const formatQty = value => Number(value || 0).toLocaleString('en-MY', { maximumFractionDigits: 2 });

export default function StallOpeningSection({ data, previousDate, hasPreviousDay, inventoryWarnings = [], isSaturday,
  isSubmitted, isOpen, onToggle, onReceivedChange, onRefresh, onSend, busy, stockReceivedSynced }) {
  const opening = data.opening_stock;
  return (
    <section className="card" style={{ marginBottom: 12, border: '1.5px solid #ddd6fe', overflow: 'hidden' }}>
      <button type="button" onClick={onToggle} aria-expanded={isOpen} style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: 18, border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
        <Truck size={22} color="#7c3aed" />
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 15 }}>Brought to Stall <span style={{ fontWeight: 400 }}>(Bawa ke Gerai)</span></strong>
          <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 4 }}>Carryover + received today = opening stock</div>
        </div>
        <ChevronRight size={18} style={{ transform: isOpen ? 'rotate(90deg)' : undefined }} />
      </button>
      {isOpen && <div style={{ padding: '0 18px 18px' }}>
        <div style={{ padding: 12, borderRadius: 8, background: isSaturday ? '#fff7ed' : '#f5f3ff', color: '#5b21b6', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
          {isSaturday ? 'Saturday closed: brought-to-stall quantities are zero. Existing stock stays in inventory.' : <>
            Carryover uses the uncooked/remaining stock from <strong>{previousDate}</strong> and any additional stock already in Central Inventory. Stock shown in both sources is counted once.
            {!hasPreviousDay && <div>No report for {previousDate}. Available inventory is used as carryover.</div>}
          </>}
          {isSubmitted && <div>Submitted quantities are preserved.{!opening && ' This older report has no saved carryover breakdown.'}</div>}
          <div>Chicken and carcass receipts come from Raw Materials. Neck pieces are grouped into sets of four. Enter new mushroom, rice and sauce stock below.</div>
        </div>
        {inventoryWarnings.map(message => <div key={message} role="status" style={{ fontSize: 12, color: '#92400e', marginBottom: 8 }}>{message}</div>)}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', minWidth: 470 }}>
            <thead><tr><th>Item</th><th>Carryover</th><th>Received today</th><th>Brought to stall</th></tr></thead>
            <tbody>{STALL_ITEMS.map(item => {
              const carry = opening?.carryover?.[item.key];
              const received = opening?.received?.[item.key];
              const isNeck = item.key === 'chicken_neck_set';
              const reportQty = opening?.fromReport?.[item.key] || 0;
              const inventoryQty = opening?.fromInventory?.[item.key] || 0;
              return <tr key={item.key}>
                <td><strong>{item.label}</strong><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{item.unit}{isNeck && ' (4 pcs)'}</div></td>
                <td>
                  {carry == null ? '—' : isNeck ? `${formatQty(carry * 4)} pcs` : formatQty(carry)}
                  {opening && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
                    Report: {formatQty(reportQty * (isNeck ? 4 : 1))} · Inventory: {formatQty(inventoryQty * (isNeck ? 4 : 1))}{isNeck ? ' pcs' : ''}
                  </div>}
                </td>
                <td>{item.rawKey || isSubmitted ? <>
                  {received == null ? '—' : isNeck ? `${formatQty(received * 4)} pcs` : formatQty(received)}
                  {item.rawKey && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>From Raw Materials</div>}
                </> : <input aria-label={`${item.label} received today`} type="number" min="0" step="any" className="inp"
                  value={data.stock_received?.[item.key] ?? 0} disabled={busy}
                  onChange={event => onReceivedChange(item.key, Math.max(0, Number(event.target.value) || 0))}
                  style={{ width: 85, padding: '6px 8px', textAlign: 'right' }} />}</td>
                <td style={{ fontWeight: 700, color: '#6d28d9' }}>
                  <output aria-label={`${item.label} brought to stall`}>{formatQty(data.brought_to_stall?.[item.key])}</output> {item.unit}
                  {isNeck && !isSaturday && opening && <div style={{ fontSize: 10, fontWeight: 400 }}>{formatQty(((carry + received) * 4) % 4)} loose pcs stay in inventory</div>}
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {!isSubmitted && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={onRefresh} disabled={busy}><RefreshCw size={13} /> Refresh carryover & sales</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onSend} disabled={busy}><PackageCheck size={13} /> {stockReceivedSynced ? 'Update Received Stock' : 'Send Received Stock to Inventory'}</button>
        </div>}
      </div>}
    </section>
  );
}
