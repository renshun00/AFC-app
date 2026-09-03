import React, { useState } from 'react';
import { Search, Truck, Phone, Mail, User, Package } from 'lucide-react';
import { suppliers, supplierPurchases } from '../data/placeholder';
import { Modal } from '../components/Layout';

// Roll up each supplier's purchase history into the totals the acceptance
// criteria calls for: item count, total spend, last order date.
function summarize(supplier) {
  const rows = supplierPurchases.filter(p => p.supplier === supplier.name);
  const totalSpend = rows.reduce((sum, r) => sum + r.amount, 0);
  const itemsBought = new Set(rows.map(r => r.item)).size;
  const lastOrder = rows.reduce((latest, r) => (!latest || r.date > latest ? r.date : latest), null);
  return { rows, totalSpend, itemsBought, lastOrder };
}

export default function SuppliersPage({ isMobile }) {
  const [search, setSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.category.toLowerCase().includes(search.toLowerCase())
  );

  const allSummaries = suppliers.map(s => ({ supplier: s, ...summarize(s) }));
  const totalSpendAll = allSummaries.reduce((sum, s) => sum + s.totalSpend, 0);
  const topSupplier = allSummaries.reduce((top, s) => (!top || s.totalSpend > top.totalSpend ? s : top), null);

  const detail = selectedSupplier ? summarize(selectedSupplier) : null;

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-3)' }}/>
          <input className="inp" placeholder="Search suppliers…" value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:32 }}/>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${isMobile?2:3},1fr)`, gap:10, marginBottom:14 }}>
        <div className="card" style={{ padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Total Suppliers</div>
          <div style={{ fontSize:22, fontWeight:700, color:'var(--text-1)' }}>{suppliers.length}</div>
        </div>
        <div className="card" style={{ padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Total Spend</div>
          <div style={{ fontSize:22, fontWeight:700, color:'var(--text-1)' }}>RM{totalSpendAll.toLocaleString('en-MY',{minimumFractionDigits:2})}</div>
        </div>
        <div className="card" style={{ padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Top Supplier</div>
          <div style={{ fontSize:18, fontWeight:700, color:'var(--text-1)' }}>{topSupplier?.supplier.name ?? '—'}</div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Category</th>
                <th>Contact</th>
                <th>Items Supplied</th>
                <th>Total Spent</th>
                <th>Last Order</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const sum = summarize(s);
                return (
                  <tr key={s.id} onClick={() => setSelectedSupplier(s)} style={{ cursor:'pointer' }}>
                    <td style={{ fontWeight:600 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:28, height:28, borderRadius:8, background:'var(--primary-light)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--primary)', flexShrink:0 }}>
                          <Truck size={14}/>
                        </div>
                        {s.name}
                      </div>
                    </td>
                    <td style={{ color:'var(--text-2)' }}>{s.category}</td>
                    <td style={{ color:'var(--text-2)' }}>{s.contact}</td>
                    <td style={{ fontWeight:600 }}>{sum.itemsBought}</td>
                    <td style={{ fontWeight:700 }}>RM{sum.totalSpend.toFixed(2)}</td>
                    <td style={{ color:'var(--text-3)' }}>{sum.lastOrder ?? '—'}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign:'center', color:'var(--text-3)', padding:'24px 0' }}>No suppliers match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Supplier Detail Modal */}
      {selectedSupplier && detail && (
        <Modal title={selectedSupplier.name} onClose={() => setSelectedSupplier(null)} maxWidth={560}>
          <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : '1fr 1fr', gap:10, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'var(--text-2)' }}>
              <User size={14}/> {selectedSupplier.contact}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'var(--text-2)' }}>
              <Phone size={14}/> {selectedSupplier.phone}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'var(--text-2)' }}>
              <Mail size={14}/> {selectedSupplier.email}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'var(--text-2)' }}>
              <Package size={14}/> {selectedSupplier.category}
            </div>
          </div>

          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <div style={{ flex:1, background:'var(--main-bg)', borderRadius:'var(--radius-sm)', padding:'10px 14px' }}>
              <div style={{ fontSize:11, color:'var(--text-3)', marginBottom:2 }}>Items Bought</div>
              <div style={{ fontSize:18, fontWeight:700 }}>{detail.itemsBought}</div>
            </div>
            <div style={{ flex:1, background:'var(--green)', borderRadius:'var(--radius-sm)', padding:'10px 14px' }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.75)', marginBottom:2 }}>Total Spent</div>
              <div style={{ fontSize:18, fontWeight:700, color:'#fff' }}>RM{detail.totalSpend.toFixed(2)}</div>
            </div>
          </div>

          <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>Purchase History</div>
          <div style={{ maxHeight:240, overflowY:'auto', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {detail.rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ color:'var(--text-3)' }}>{r.date}</td>
                    <td style={{ fontWeight:600 }}>{r.item}</td>
                    <td>{r.qty} {r.unit}</td>
                    <td style={{ fontWeight:600 }}>RM{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}
