import React, { useState, useRef } from 'react';
import { where, orderBy } from 'firebase/firestore';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, TrendingUp, ImageOff, Upload, X } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { productService } from '../services/firestoreService';
import { Modal, FormRow } from '../components/Layout';

// ── Firestore doc ↔ UI shape mappers ──────────────────────────────────────────
// products collection fields → component-friendly shape
const fromDoc = (d) => ({
  id: d.id,
  name: d.name ?? '',
  category: d.categoryId ?? '',
  price: d.sellingPrice ?? 0,
  cost: d.standardCost ?? 0,
  active: d.showOnPos ?? true,
  img: d.img ?? null,
  imgPlaceholder: d.imgPlaceholder ?? '🍽️',
});

const toDoc = (form) => ({
  name: form.name,
  categoryId: form.category,
  sellingPrice: Number(form.price),
  standardCost: Number(form.cost),
  showOnPos: form.active,
  isInventoryItem: false,
  isActive: true,
  img: form.img ?? null,
  imgPlaceholder: form.imgPlaceholder ?? '🍽️',
});

// ── Shared image display: real photo > emoji placeholder > grey box ─────────
function ItemImage({ item, size = 40, radius = 6 }) {
  if (item.img) {
    return (
      <img src={item.img} alt={item.name}
        style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', display: 'block', flexShrink: 0 }} />
    );
  }
  if (item.imgPlaceholder) {
    return (
      <div style={{ width: size, height: size, borderRadius: radius, background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45, flexShrink: 0 }}>
        {item.imgPlaceholder}
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', flexShrink: 0 }}>
      <ImageOff size={size * 0.4} />
    </div>
  );
}

// ── Image upload / preview widget used inside the Add/Edit modal ─────────────
function ImageUploader({ value, onChange }) {
  const inputRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target.result); // base64 data URL
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      {value ? (
        // Preview with remove button
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img src={value} alt="Preview"
            style={{ width: 120, height: 120, borderRadius: 10, objectFit: 'cover', display: 'block', border: '2px solid var(--border)' }} />
          <button onClick={() => onChange(null)}
            style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: '#dc2626', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
            <X size={11} />
          </button>
        </div>
      ) : (
        // Drop zone
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-light)'; }}
          onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '#fafafa'; }}
          onDrop={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '#fafafa'; handleDrop(e); }}
          style={{
            border: '2px dashed var(--border)', borderRadius: 10, padding: '24px 16px',
            textAlign: 'center', cursor: 'pointer', background: '#fafafa',
            transition: 'all .15s',
          }}
        >
          <Upload size={24} style={{ color: 'var(--text-3)', marginBottom: 8 }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 3 }}>Click or drag & drop</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>JPG, PNG, WEBP · max 5 MB</div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  );
}

const emptyForm = { name: '', category: 'Combo', price: 0, cost: 0, active: true, img: null, imgPlaceholder: '🍽️' };

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MenuEngineeringPage({ isMobile }) {
  // Real-time Firestore subscription — all products that are menu items
  const { data: productDocs, loading, error } = useFirestore(
    'products',
    where('isActive', '==', true),
    orderBy('name'),
  );
  // Show all products but mark which are on POS menu
  const items = productDocs
    .filter(d => d.showOnPos === true)
    .map(fromDoc);

  const [showAdd, setShowAdd]   = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeRoster, setActiveRoster] = useState('Active Menu Roster');

  const [form, setForm] = useState(emptyForm);

  const margin = (item) => item.price > 0 ? (((item.price - item.cost) / item.price) * 100).toFixed(1) : '0.0';

  // ── Firestore CRUD ────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      if (editItem) {
        await productService.update(editItem.id, toDoc(form));
      } else {
        await productService.create(toDoc(form));
      }
      setForm(emptyForm);
      setEditItem(null);
      setShowAdd(false);
    } catch (err) {
      console.error('[MenuEngineeringPage] save failed:', err);
      alert('Could not save the item. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ name: item.name, category: item.category, price: item.price, cost: item.cost, active: item.active, img: item.img ?? null, imgPlaceholder: item.imgPlaceholder ?? '🍽️' });
    setShowAdd(true);
  };

  const toggleActive = async (item) => {
    try {
      await productService.update(item.id, { showOnPos: !item.active });
    } catch (err) {
      console.error('[MenuEngineeringPage] toggle active failed:', err);
      alert('Could not update the item. Please try again.');
    }
  };

  const openDeleteConfirm = (item) => {
    setDeleteTarget(item);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await productService.delete(deleteTarget.id);
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    } catch (err) {
      console.error('[MenuEngineeringPage] delete failed:', err);
      alert('Could not delete the item. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const activeItems  = items.filter(i => i.active);
  const avgMarginPct = items.length > 0
    ? (items.reduce((s, i) => s + (i.price > 0 ? (i.price - i.cost) / i.price * 100 : 0), 0) / items.length).toFixed(1)
    : '0.0';

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading menu items…</div>;
  }

  if (error) {
    return (
      <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 'var(--radius)', padding: 16, color: '#dc2626', fontSize: 13 }}>
        Couldn't load menu items from Firestore: {error}
      </div>
    );
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : 4},1fr)`, gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Total Menu Items', value: items.length },
          { label: 'Active Items',     value: activeItems.length },
          { label: 'Avg. Margin',      value: `${avgMarginPct}%` },
          { label: 'Categories',       value: new Set(items.map(i => i.category)).size },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs + Add */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['Active Menu Roster', 'Item Details'].map(tab => (
            <button key={tab} onClick={() => setActiveRoster(tab)} className="btn btn-sm"
              style={{ background: activeRoster === tab ? 'var(--primary)' : '#f4f4f5', color: activeRoster === tab ? '#fff' : 'var(--text-2)', border: 'none' }}>
              {tab}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm"
          onClick={() => { setEditItem(null); setForm(emptyForm); setShowAdd(true); }}>
          <Plus size={13} /> Add Menu Item
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Item</th>
                <th>Category</th>
                <th>Price</th>
                <th>Cost</th>
                <th>Margin</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ opacity: item.active ? 1 : 0.5 }}>
                  {/* Photo cell */}
                  <td>
                    <ItemImage item={item} size={44} radius={8} />
                  </td>
                  <td style={{ fontWeight: 600 }}>{item.name}</td>
                  <td style={{ color: 'var(--text-2)' }}>{item.category}</td>
                  <td style={{ fontWeight: 600 }}>RM{item.price.toFixed(2)}</td>
                  <td style={{ color: 'var(--text-2)' }}>RM{item.cost.toFixed(2)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 50, height: 5, borderRadius: 99, background: '#f0f0f0', overflow: 'hidden' }}>
                        <div style={{ width: `${margin(item)}%`, height: '100%', background: parseFloat(margin(item)) > 60 ? 'var(--green)' : 'var(--amber)', borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{margin(item)}%</span>
                    </div>
                  </td>
                  <td>
                    <button onClick={() => toggleActive(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.active ? 'var(--green)' : 'var(--text-3)' }}>
                      {item.active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4 }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => openDeleteConfirm(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showAdd && (
        <Modal title={editItem ? 'Edit Menu Item' : 'Add New Menu Item'} onClose={() => { setShowAdd(false); setEditItem(null); }} maxWidth={520}>
          {/* Image upload */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
              Item Photo
            </label>
            <ImageUploader value={form.img} onChange={img => setForm(f => ({ ...f, img }))} />
            {!form.img && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
                No photo yet — the emoji placeholder <strong>{form.imgPlaceholder}</strong> will be shown instead.
              </div>
            )}
          </div>

          <FormRow label="Item Name">
            <input className="inp" placeholder="e.g. Spicy Chicken Combo" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </FormRow>

          <FormRow label="Category">
            <select className="inp" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {['Combo', 'Chicken', 'Burger', 'Sides', 'Drinks', 'Sauce'].map(c => <option key={c}>{c}</option>)}
            </select>
          </FormRow>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FormRow label="Selling Price (RM)">
              <input className="inp" type="number" min="0" step="0.10" value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </FormRow>
            <FormRow label="Cost Price (RM)">
              <input className="inp" type="number" min="0" step="0.10" value={form.cost}
                onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
            </FormRow>
          </div>

          {Number(form.price) > 0 && Number(form.cost) > 0 && (
            <div style={{ background: 'var(--green-light)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 14, fontSize: 13 }}>
              <TrendingUp size={13} style={{ marginRight: 6, color: 'var(--green)' }} />
              Estimated margin: <strong style={{ color: 'var(--green)' }}>
                {(((Number(form.price) - Number(form.cost)) / Number(form.price)) * 100).toFixed(1)}%
              </strong>
            </div>
          )}

          <FormRow label="Active on Menu">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: 'var(--primary)' }} />
              <span style={{ fontSize: 13 }}>Show this item on the POS menu</span>
            </div>
          </FormRow>

          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => { setShowAdd(false); setEditItem(null); }}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editItem ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deleteTarget && (
        <Modal title="Delete Menu Item" onClose={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}>
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 16 }}>
            Are you sure you want to <strong>permanently delete</strong> <strong>{deleteTarget.name}</strong> from the menu? This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setShowDeleteConfirm(false); setDeleteTarget(null); }}>Cancel</button>
            <button className="btn btn-danger" style={{ flex: 1, justifyContent: 'center' }} onClick={handleDelete} disabled={saving}>
              <Trash2 size={14} /> {saving ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
