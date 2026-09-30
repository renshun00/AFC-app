import React, { useState, useEffect } from 'react';
import { Search, Truck, Phone, Mail, User, Package, Plus, Pencil, Trash2, Loader } from 'lucide-react';
import { where, orderBy } from 'firebase/firestore';
import { useFirestore } from '../hooks/useFirestore';
import { supplierService, supplierPurchaseService } from '../services/firestoreService';
import { Modal, FormRow } from '../components/Layout';

const emptySupplier = { name: '', category: '', contact: '', phone: '', email: '' };

export default function SuppliersPage({ isMobile }) {
  // ── Real-time Firestore subscriptions ──────────────────────────────────────
  const { data: supplierDocs, loading, error } = useFirestore(
    'suppliers',
    where('isActive', '==', true),
    orderBy('name'),
  );

  // Subscribe to ALL supplier_purchases so we can compute stats per supplier
  const { data: purchaseDocs } = useFirestore(
    'supplier_purchases',
    orderBy('createdAt', 'desc'),
  );

  // Also subscribe to inventory items so we can show linked products
  const { data: inventoryDocs } = useFirestore(
    'products',
    where('isInventoryItem', '==', true),
    where('isActive', '==', true),
    orderBy('name'),
  );

  const [search, setSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [addForm, setAddForm] = useState(emptySupplier);
  const [editForm, setEditForm] = useState(emptySupplier);
  const [saving, setSaving] = useState(false);

  // ── Derived data ──────────────────────────────────────────────────────────
  const filtered = supplierDocs.filter(s =>
    (s.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (s.category ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Summarise purchases per supplier
  function summarize(supplierId) {
    const rows = purchaseDocs.filter(p => p.supplierId === supplierId);
    const totalSpend = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0);
    const itemsBought = new Set(rows.map(r => r.productId)).size;
    const lastOrder = rows.length > 0 ? (rows[0].date ?? null) : null;
    return { rows, totalSpend, itemsBought, lastOrder };
  }

  // Products linked to a supplier via supplierId field on the product doc
  function getLinkedProducts(supplierId) {
    return inventoryDocs.filter(p => p.supplierId === supplierId);
  }

  const totalSpendAll = purchaseDocs.reduce((sum, p) => sum + (p.totalCost ?? 0), 0);
  const topSupplier = supplierDocs.reduce((top, s) => {
    const spend = summarize(s.id).totalSpend;
    if (!top || spend > top.spend) return { name: s.name, spend };
    return top;
  }, null);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!addForm.name.trim()) return;
    setSaving(true);
    try {
      await supplierService.create(addForm);
      setAddForm(emptySupplier);
      setShowAdd(false);
    } catch (err) {
      console.error('[SuppliersPage] add failed:', err);
      alert('Could not add supplier. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (supplier) => {
    setEditForm({
      name: supplier.name ?? '',
      category: supplier.category ?? '',
      contact: supplier.contact ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
    });
    setSelectedSupplier(supplier);
    setShowEdit(true);
  };

  const handleEdit = async () => {
    setSaving(true);
    try {
      await supplierService.update(selectedSupplier.id, editForm);
      setShowEdit(false);
      setSelectedSupplier(null);
    } catch (err) {
      console.error('[SuppliersPage] edit failed:', err);
      alert('Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openDelete = (supplier, e) => {
    e?.stopPropagation();
    setSelectedSupplier(supplier);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await supplierService.delete(selectedSupplier.id);
      setShowDeleteConfirm(false);
      setSelectedSupplier(null);
    } catch (err) {
      console.error('[SuppliersPage] delete failed:', err);
      alert('Could not delete supplier. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading suppliers…</div>;
  }

  if (error) {
    return (
      <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 'var(--radius)', padding: 16, color: '#dc2626', fontSize: 13 }}>
        Couldn't load suppliers from Firestore: {error}
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input className="inp" placeholder="Search suppliers…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add Supplier
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : 3},1fr)`, gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Total Suppliers</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>{supplierDocs.length}</div>
        </div>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Total Spend</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>RM{totalSpendAll.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Top Supplier</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{topSupplier?.name ?? '—'}</div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Category</th>
                <th>Contact</th>
                <th>Items Supplied</th>
                <th>Total Spent</th>
                <th>Last Order</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const sum = summarize(s.id);
                return (
                  <tr key={s.id} onClick={() => setSelectedSupplier(s)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0 }}>
                          <Truck size={14} />
                        </div>
                        {s.name}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-2)' }}>{s.category}</td>
                    <td style={{ color: 'var(--text-2)' }}>{s.contact}</td>
                    <td style={{ fontWeight: 600 }}>{sum.itemsBought}</td>
                    <td style={{ fontWeight: 700 }}>RM{sum.totalSpend.toFixed(2)}</td>
                    <td style={{ color: 'var(--text-3)' }}>{sum.lastOrder ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)} style={{ padding: 6 }}>
                          <Pencil size={14} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={(e) => openDelete(s, e)} style={{ padding: 6, color: '#dc2626' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '24px 0' }}>
                  {supplierDocs.length === 0 ? 'No suppliers yet. Click "Add Supplier" to get started.' : 'No suppliers match your search.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Supplier Detail Modal ──────────────────────────────────────────── */}
      {selectedSupplier && !showEdit && !showDeleteConfirm && (() => {
        const detail = summarize(selectedSupplier.id);
        const linked = getLinkedProducts(selectedSupplier.id);
        return (
          <Modal title={selectedSupplier.name} onClose={() => setSelectedSupplier(null)} maxWidth={600}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
                <User size={14} /> {selectedSupplier.contact || '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
                <Phone size={14} /> {selectedSupplier.phone || '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
                <Mail size={14} /> {selectedSupplier.email || '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
                <Package size={14} /> {selectedSupplier.category || '—'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, background: 'var(--main-bg)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Items Bought</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{detail.itemsBought}</div>
              </div>
              <div style={{ flex: 1, background: 'var(--green)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.75)', marginBottom: 2 }}>Total Spent</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>RM{detail.totalSpend.toFixed(2)}</div>
              </div>
            </div>

            {/* Linked Inventory Items */}
            {linked.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Linked Inventory Items</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                  {linked.map(p => (
                    <span key={p.id} className="badge badge-green" style={{ fontSize: 12, padding: '4px 10px' }}>
                      {p.name}
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* Purchase History */}
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Purchase History</div>
            {detail.rows.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '16px 0', textAlign: 'center' }}>No purchases recorded yet.</div>
            ) : (
              <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
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
                        <td style={{ color: 'var(--text-3)' }}>{r.date}</td>
                        <td style={{ fontWeight: 600 }}>{r.productName}</td>
                        <td>{r.qty} {r.unit}</td>
                        <td style={{ fontWeight: 600 }}>RM{(r.totalCost ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Modal>
        );
      })()}

      {/* ── Add Supplier Modal ─────────────────────────────────────────────── */}
      {showAdd && (
        <Modal title="Add Supplier" onClose={() => setShowAdd(false)}>
          <FormRow label="Supplier Name">
            <input className="inp" placeholder="e.g. FreshFarm" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
          </FormRow>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FormRow label="Category">
              <input className="inp" placeholder="Fresh Produce" value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} />
            </FormRow>
            <FormRow label="Contact Person">
              <input className="inp" placeholder="Ahmad Razak" value={addForm.contact} onChange={e => setAddForm(f => ({ ...f, contact: e.target.value }))} />
            </FormRow>
            <FormRow label="Phone">
              <input className="inp" placeholder="+60 12-345 6789" value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} />
            </FormRow>
            <FormRow label="Email">
              <input className="inp" placeholder="orders@supplier.com" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
            </FormRow>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleAdd} disabled={saving || !addForm.name.trim()}>
              <Plus size={14} /> {saving ? 'Saving…' : 'Add Supplier'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Edit Supplier Modal ────────────────────────────────────────────── */}
      {showEdit && selectedSupplier && (
        <Modal title={`Edit ${selectedSupplier.name}`} onClose={() => { setShowEdit(false); setSelectedSupplier(null); }}>
          <FormRow label="Supplier Name">
            <input className="inp" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
          </FormRow>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FormRow label="Category">
              <input className="inp" value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} />
            </FormRow>
            <FormRow label="Contact Person">
              <input className="inp" value={editForm.contact} onChange={e => setEditForm(f => ({ ...f, contact: e.target.value }))} />
            </FormRow>
            <FormRow label="Phone">
              <input className="inp" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </FormRow>
            <FormRow label="Email">
              <input className="inp" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </FormRow>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setShowEdit(false); setSelectedSupplier(null); }}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleEdit} disabled={saving || !editForm.name.trim()}>
              <Pencil size={14} /> {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirmation Modal ──────────────────────────────────────── */}
      {showDeleteConfirm && selectedSupplier && (
        <Modal title="Delete Supplier" onClose={() => { setShowDeleteConfirm(false); setSelectedSupplier(null); }}>
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 16 }}>
            Are you sure you want to <strong>permanently delete</strong> <strong>{selectedSupplier.name}</strong>? This will not affect existing purchase records.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setShowDeleteConfirm(false); setSelectedSupplier(null); }}>Cancel</button>
            <button className="btn btn-danger" style={{ flex: 1, justifyContent: 'center' }} onClick={handleDelete} disabled={saving}>
              <Trash2 size={14} /> {saving ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
