import React, { useState, useEffect } from 'react';
import { Plus, Search, AlertTriangle, PackagePlus, Trash2 } from 'lucide-react';
import { Modal, FormRow } from '../components/Layout';
import { productService, inventoryTransactionService } from '../services/firestoreService';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export default function InventoryPage({ isMobile }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showWastage, setShowWastage] = useState(false);

  // Add Stock form state
  const [addForm, setAddForm] = useState({
    name: '',
    unit: 'kg',
    stock: 0,
    minStock: 0,
    cost: 0,
    category: '',
    supplier: ''
  });

  // Wastage form state
  const [wastageForm, setWastageForm] = useState({
    itemId: '',
    qty: 0,
    reason: '',
    type: 'Wastage'
  });

  // Real-time listener for products designated as inventory items
  useEffect(() => {
    const q = query(
      collection(db, 'products'),
      where('isInventoryItem', '==', true),
      where('isActive', '==', true)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const inventoryData = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || '',
            category: data.categoryId || 'General',
            stock: Number(data.stock) || 0,
            minStock: Number(data.minStock) || 0,
            cost: Number(data.standardCost) || 0,
            unit: data.uomCode || 'pcs',
            supplier: data.supplier || 'N/A'
          };
        });
        setItems(inventoryData);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching inventory:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );
  const lowStock = items.filter((i) => i.stock <= i.minStock);

  const stockStatus = (item) => {
    if (item.minStock <= 0) return { label: 'OK', cls: 'badge-green' };
    const ratio = item.stock / item.minStock;
    if (ratio <= 1) return { label: 'Low', cls: 'badge-red' };
    if (ratio <= 1.5) return { label: 'Medium', cls: 'badge-amber' };
    return { label: 'OK', cls: 'badge-green' };
  };

  const handleAddStock = async () => {
    if (!addForm.name.trim()) return;

    try {
      await productService.create({
        name: addForm.name,
        categoryId: addForm.category || 'General',
        uomCode: addForm.unit,
        stock: Number(addForm.stock),
        minStock: Number(addForm.minStock),
        standardCost: Number(addForm.cost),
        supplier: addForm.supplier,
        isInventoryItem: true,
        showOnPos: false,
        isActive: true
      });

      setAddForm({
        name: '',
        unit: 'kg',
        stock: 0,
        minStock: 0,
        cost: 0,
        category: '',
        supplier: ''
      });
      setShowAdd(false);
    } catch (error) {
      console.error('Failed to add stock item:', error);
    }
  };

  const handleWastage = async () => {
    const qty = Number(wastageForm.qty);
    if (!wastageForm.itemId || qty <= 0) return;

    const targetItem = items.find((i) => i.id === wastageForm.itemId);
    if (!targetItem) return;

    try {
      // 1. Log wastage transaction
      await inventoryTransactionService.logWastage(
        wastageForm.itemId,
        qty,
        wastageForm.reason ? `${wastageForm.type}: ${wastageForm.reason}` : wastageForm.type
      );

      // 2. Decrement physical stock count
      const updatedStock = Math.max(0, targetItem.stock - qty);
      await productService.update(wastageForm.itemId, { stock: updatedStock });

      setWastageForm({ itemId: '', qty: 0, reason: '', type: 'Wastage' });
      setShowWastage(false);
    } catch (error) {
      console.error('Failed to log wastage:', error);
    }
  };

  const handleDeleteItem = async (id) => {
    if (window.confirm('Are you sure you want to deactivate/delete this stock item?')) {
      try {
        await productService.deactivate(id);
      } catch (error) {
        console.error('Failed to delete item:', error);
      }
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-3)' }}>
        Loading inventory from Firebase...
      </div>
    );
  }

  return (
    <div>
      {/* Low stock banner */}
      {lowStock.length > 0 && (
        <div
          style={{
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            borderRadius: 'var(--radius)',
            padding: '10px 16px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>
            {lowStock.length} item{lowStock.length > 1 ? 's' : ''} below minimum stock:{' '}
            {lowStock.map((i) => i.name).join(', ')}
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search
            size={14}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
          />
          <input
            className="inp"
            placeholder="Search inventory…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>
        <button className="btn btn-outline" onClick={() => setShowWastage(true)}>
          <Trash2 size={14} /> Log Wastage
        </button>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add New Stock
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : 4},1fr)`, gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Total SKUs', value: items.length },
          { label: 'Low Stock', value: lowStock.length, warn: lowStock.length > 0 },
          {
            label: 'Total Value',
            value: `RM${items.reduce((s, i) => s + i.stock * i.cost, 0).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
          },
          { label: 'Suppliers', value: new Set(items.map((i) => i.supplier).filter(Boolean)).size }
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.warn ? '#dc2626' : 'var(--text-1)' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Min Stock</th>
                <th>Unit Cost</th>
                <th>Value</th>
                <th>Supplier</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-3)' }}>
                    No inventory records found in Firestore. Add a new stock item to begin.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const st = stockStatus(item);
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>{item.name}</td>
                      <td style={{ color: 'var(--text-2)' }}>{item.category}</td>
                      <td style={{ fontWeight: 700 }}>{item.stock} {item.unit}</td>
                      <td style={{ color: 'var(--text-3)' }}>{item.minStock} {item.unit}</td>
                      <td>RM{item.cost.toFixed(2)}</td>
                      <td style={{ fontWeight: 600 }}>RM{(item.stock * item.cost).toFixed(2)}</td>
                      <td style={{ color: 'var(--text-2)' }}>{item.supplier}</td>
                      <td>
                        <span className={`badge ${st.cls}`}>{st.label}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn-icon"
                          title="Deactivate item"
                          onClick={() => handleDeleteItem(item.id)}
                          style={{ color: '#dc2626', background: 'transparent', border: 'none', cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Stock Modal */}
      {showAdd && (
        <Modal title="Add New Stock" onClose={() => setShowAdd(false)}>
          <FormRow label="Item Name">
            <input
              className="inp"
              placeholder="e.g. Chicken Wings"
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
            />
          </FormRow>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FormRow label="Category">
              <input
                className="inp"
                placeholder="Protein"
                value={addForm.category}
                onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Unit">
              <select
                className="inp"
                value={addForm.unit}
                onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))}
              >
                {['kg', 'L', 'pcs', 'box', 'pack'].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Opening Stock">
              <input
                className="inp"
                type="number"
                min="0"
                value={addForm.stock}
                onChange={(e) => setAddForm((f) => ({ ...f, stock: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Min Stock">
              <input
                className="inp"
                type="number"
                min="0"
                value={addForm.minStock}
                onChange={(e) => setAddForm((f) => ({ ...f, minStock: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Cost per Unit (RM)">
              <input
                className="inp"
                type="number"
                min="0"
                step="0.01"
                value={addForm.cost}
                onChange={(e) => setAddForm((f) => ({ ...f, cost: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Supplier">
              <input
                className="inp"
                placeholder="FreshFarm"
                value={addForm.supplier}
                onChange={(e) => setAddForm((f) => ({ ...f, supplier: e.target.value }))}
              />
            </FormRow>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowAdd(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleAddStock}>
              <PackagePlus size={14} /> Add to Inventory
            </button>
          </div>
        </Modal>
      )}

      {/* Wastage Modal */}
      {showWastage && (
        <Modal title="Log Material Wastage" onClose={() => setShowWastage(false)}>
          <FormRow label="Select Item">
            <select
              className="inp"
              value={wastageForm.itemId}
              onChange={(e) => setWastageForm((f) => ({ ...f, itemId: e.target.value }))}
            >
              <option value="">-- Select Item --</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.stock} {i.unit} available)
                </option>
              ))}
            </select>
          </FormRow>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FormRow label="Quantity">
              <input
                className="inp"
                type="number"
                min="0"
                value={wastageForm.qty}
                onChange={(e) => setWastageForm((f) => ({ ...f, qty: e.target.value }))}
              />
            </FormRow>
            <FormRow label="Type">
              <select
                className="inp"
                value={wastageForm.type}
                onChange={(e) => setWastageForm((f) => ({ ...f, type: e.target.value }))}
              >
                {['Wastage', 'Spoilage', 'Damaged', 'Stolen', 'Used for Training'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </FormRow>
          </div>
          <FormRow label="Reason / Notes">
            <textarea
              className="inp"
              rows={3}
              placeholder="Describe the reason for wastage…"
              value={wastageForm.reason}
              onChange={(e) => setWastageForm((f) => ({ ...f, reason: e.target.value }))}
              style={{ resize: 'vertical' }}
            />
          </FormRow>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowWastage(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" style={{ flex: 1, justifyContent: 'center' }} onClick={handleWastage}>
              Log Wastage
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}