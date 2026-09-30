import React, { useState, useMemo } from 'react';
import { where, orderBy } from 'firebase/firestore';
import { Plus, Search, AlertTriangle, PackagePlus, Trash2, Pencil, Package, Truck, Calendar, ArrowUpRight, ArrowDownRight, Tag, ShoppingCart, Archive, ArchiveRestore } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { productService, inventoryTransactionService, supplierPurchaseService } from '../services/firestoreService';
import { Modal, FormRow } from '../components/Layout';

// Firestore `products` docs use different field names than this page's UI.
// These two helpers translate between them so the rest of the component
// can keep working with the simple { name, unit, stock, minStock, cost,
// category, supplier, isArchived } shape it already uses.
const fromDoc = (d) => ({
  id: d.id,
  name: d.name ?? '',
  unit: d.uomCode ?? 'kg',
  stock: d.stock ?? 0,
  minStock: d.minStock ?? 0,
  cost: d.standardCost ?? 0,
  category: d.categoryId ?? '',
  supplierId: d.supplierId ?? '',
  isArchived: d.isArchived ?? false,
});

const toDoc = (form) => ({
  name: form.name,
  uomCode: form.unit,
  stock: Number(form.stock),
  minStock: Number(form.minStock),
  standardCost: Number(form.cost),
  categoryId: form.category,
  supplierId: form.supplierId,
  isInventoryItem: true,
  showOnPos: false,
  isArchived: form.isArchived ?? false,
});

const emptyForm = { name:'',unit:'kg',stock:0,minStock:0,cost:0,category:'',supplierId:'',isArchived:false };

export default function InventoryPage({ isMobile }) {
  const { data: productDocs, loading, error } = useFirestore(
    'products',
    where('isInventoryItem', '==', true),
    where('isActive', '==', true),
    orderBy('name'),
  );
  const items = productDocs.map(fromDoc);

  // Subscribe to suppliers for the dropdown
  const { data: supplierDocs } = useFirestore(
    'suppliers',
    where('isActive', '==', true),
    orderBy('name'),
  );

  // Build a supplierId → name lookup
  const supplierMap = useMemo(() => {
    const m = {};
    for (const s of supplierDocs) m[s.id] = s.name;
    return m;
  }, [supplierDocs]);

  // Subscribe to supplier_purchases to show purchase history in item expand view
  const { data: purchaseDocs } = useFirestore(
    'supplier_purchases',
    orderBy('createdAt', 'desc'),
  );

  // Subscribe to inventory_transactions to show movements/wastage history
  const { data: transactionDocs } = useFirestore(
    'inventory_transactions',
    orderBy('createdAt', 'desc'),
  );

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'archived'
  const [showAdd, setShowAdd] = useState(false);
  const [showPurchase, setShowPurchase] = useState(false);
  const [showWastage, setShowWastage] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [saving, setSaving] = useState(false);

  // Add Stock form state
  const [addForm, setAddForm] = useState(emptyForm);
  // Edit Stock form state
  const [editForm, setEditForm] = useState(emptyForm);
  // Wastage form
  const [wastageForm, setWastageForm] = useState({ itemId:'', qty:0, reason:'', type:'Wastage' });
  // Purchase stock form state
  const [purchaseForm, setPurchaseForm] = useState({
    itemId: '',
    qty: '',
    unitCost: '',
    supplierId: '',
    note: '',
  });

  // Filter items by tab (active vs archived) and search term
  const activeItems = useMemo(() => items.filter(i => !i.isArchived), [items]);
  const archivedItems = useMemo(() => items.filter(i => !!i.isArchived), [items]);

  const displayedItems = useMemo(() => {
    const pool = activeTab === 'active' ? activeItems : archivedItems;
    return pool.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase()));
  }, [activeTab, activeItems, archivedItems, search]);

  // Low stock banner ONLY alerts for active, unarchived inventory items!
  const lowStock = useMemo(() => activeItems.filter(i => i.stock <= i.minStock), [activeItems]);

  const stockStatus = (item) => {
    if (item.isArchived) return { label: 'Archived', cls: 'badge-gray' };
    const ratio = item.stock / item.minStock;
    if (ratio <= 1) return { label: 'Low', cls: 'badge-red' };
    if (ratio <= 1.5) return { label: 'Medium', cls: 'badge-amber' };
    return { label: 'OK', cls: 'badge-green' };
  };

  const handleAddStock = async () => {
    setSaving(true);
    try {
      const newId = await productService.create(toDoc(addForm));
      const openingStock = Number(addForm.stock);
      if (openingStock > 0) {
        await inventoryTransactionService.logPurchase(newId, openingStock);
        // Log supplier purchase if a supplier was selected
        if (addForm.supplierId) {
          await supplierPurchaseService.create({
            supplierId: addForm.supplierId,
            supplierName: supplierMap[addForm.supplierId] ?? '',
            productId: newId,
            productName: addForm.name,
            qty: openingStock,
            unit: addForm.unit,
            unitCost: Number(addForm.cost),
            totalCost: openingStock * Number(addForm.cost),
          });
        }
      }
      setAddForm(emptyForm);
      setShowAdd(false);
    } catch (err) {
      console.error('[InventoryPage] add stock failed:', err);
      alert('Could not add the item. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item) => {
    setSelectedItem(item);
    setEditForm({ name:item.name, unit:item.unit, stock:item.stock, minStock:item.minStock, cost:item.cost, category:item.category, supplierId:item.supplierId });
    setShowEdit(true);
  };

  const handleEditStock = async () => {
    setSaving(true);
    try {
      await productService.update(selectedItem.id, toDoc(editForm));
      const stockDelta = Number(editForm.stock) - selectedItem.stock;
      if (stockDelta !== 0) {
        await inventoryTransactionService.log({
          productId: selectedItem.id,
          type: 'ADJUSTMENT',
          qty: stockDelta,
        });
      }
      setShowEdit(false);
      setSelectedItem(null);
    } catch (err) {
      console.error('[InventoryPage] edit stock failed:', err);
      alert('Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteConfirm = (item) => {
    setSelectedItem(item);
    setShowDeleteConfirm(true);
  };

  const handleDeleteStock = async () => {
    setSaving(true);
    try {
      // Permanent delete (team decision): removes the document from
      // Firestore entirely, matching Darren's implementation. Note this
      // means any past sales_orders / inventory_transactions that reference
      // this product id will no longer resolve to a name/category if looked
      // up later — that trade-off was made deliberately, not accidentally.
      await productService.delete(selectedItem.id);
      setShowDeleteConfirm(false);
      setSelectedItem(null);
    } catch (err) {
      console.error('[InventoryPage] delete stock failed:', err);
      alert('Could not delete the item. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleWastage = async () => {
    const item = items.find(i => i.id === wastageForm.itemId);
    if (!item) return;
    setSaving(true);
    try {
      const qty = Number(wastageForm.qty);
      const newStock = Math.max(0, item.stock - qty);
      await productService.update(item.id, { stock: newStock });
      await inventoryTransactionService.logWastage(item.id, qty);
      setWastageForm({ itemId:'', qty:0, reason:'', type:'Wastage' });
      setShowWastage(false);
    } catch (err) {
      console.error('[InventoryPage] log wastage failed:', err);
      alert('Could not log wastage. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Purchase Stock (restock existing inventory item) ──────────────────────
  const openPurchaseModal = (preselectedItem = null) => {
    const target = preselectedItem || items[0] || null;
    setPurchaseForm({
      itemId: target ? target.id : '',
      qty: '',
      unitCost: target ? String(target.cost) : '',
      supplierId: target ? target.supplierId : '',
      note: '',
    });
    setShowPurchase(true);
  };

  const handlePurchaseStock = async () => {
    const item = items.find(i => i.id === purchaseForm.itemId);
    if (!item) {
      alert('Please select an inventory item to purchase.');
      return;
    }
    const qtyNum = Number(purchaseForm.qty);
    if (!qtyNum || qtyNum <= 0) {
      alert('Please enter a valid purchase quantity.');
      return;
    }
    const unitCostNum = purchaseForm.unitCost !== '' ? Number(purchaseForm.unitCost) : item.cost;
    const totalCost = qtyNum * unitCostNum;
    const chosenSupplierId = purchaseForm.supplierId || item.supplierId || '';

    setSaving(true);
    try {
      // 1. Update product stock (and unit cost if provided)
      const newStock = item.stock + qtyNum;
      await productService.update(item.id, {
        stock: newStock,
        standardCost: unitCostNum,
        supplierId: chosenSupplierId || item.supplierId,
      });

      // 2. Log purchase transaction in inventory_transactions
      await inventoryTransactionService.logPurchase(item.id, qtyNum);

      // 3. Log supplier purchase event
      await supplierPurchaseService.create({
        supplierId: chosenSupplierId,
        supplierName: supplierMap[chosenSupplierId] ?? '',
        productId: item.id,
        productName: item.name,
        qty: qtyNum,
        unit: item.unit,
        unitCost: unitCostNum,
        totalCost,
        note: purchaseForm.note || '',
        date: new Date().toISOString().slice(0, 10),
      });

      setShowPurchase(false);
      setPurchaseForm({ itemId: '', qty: '', unitCost: '', supplierId: '', note: '' });
      if (selectedItem && selectedItem.id === item.id) {
        setSelectedItem({ ...selectedItem, stock: newStock, cost: unitCostNum });
      }
    } catch (err) {
      console.error('[InventoryPage] purchase stock failed:', err);
      alert('Could not record purchase. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Archive / Unarchive item ──────────────────────────────────────────────
  const handleToggleArchive = async (item, e) => {
    if (e) e.stopPropagation();
    const willArchive = !item.isArchived;
    const confirmMsg = willArchive
      ? `Archive "${item.name}"? It will be hidden from the active inventory list and low-stock alerts will be muted.`
      : `Unarchive "${item.name}"? It will return to the active inventory list.`;

    if (!window.confirm(confirmMsg)) return;

    setSaving(true);
    try {
      if (willArchive) {
        await productService.archive(item.id);
      } else {
        await productService.unarchive(item.id);
      }
      if (selectedItem && selectedItem.id === item.id) {
        setSelectedItem({ ...selectedItem, isArchived: willArchive });
      }
    } catch (err) {
      console.error('[InventoryPage] toggle archive failed:', err);
      alert('Could not update archive status. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding:40, textAlign:'center', color:'var(--text-3)', fontSize:13 }}>Loading inventory…</div>;
  }

  if (error) {
    return (
      <div style={{ background:'#fef2f2',border:'1.5px solid #fecaca',borderRadius:'var(--radius)',padding:16,color:'#dc2626',fontSize:13 }}>
        Couldn't load inventory from Firestore: {error}
      </div>
    );
  }

  return (
    <div>
      {/* Low stock banner */}
      {lowStock.length > 0 && (
        <div style={{ background:'#fef2f2',border:'1.5px solid #fecaca',borderRadius:'var(--radius)',padding:'10px 16px',marginBottom:14,display:'flex',alignItems:'center',gap:10 }}>
          <AlertTriangle size={16} style={{ color:'#dc2626',flexShrink:0 }}/>
          <span style={{ fontSize:13,fontWeight:600,color:'#dc2626' }}>
            {lowStock.length} item{lowStock.length>1?'s':''} below minimum stock: {lowStock.map(i=>i.name).join(', ')}
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input className="inp" placeholder="Search inventory…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        <button className="btn btn-outline" onClick={() => setShowWastage(true)}>
          <Trash2 size={14} /> Log Wastage
        </button>
        <button
          className="btn btn-outline"
          onClick={() => openPurchaseModal()}
          style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
        >
          <ShoppingCart size={14} /> Purchase Stock
        </button>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add New Stock
        </button>
      </div>

      {/* Tabs: Active vs Archived Inventory */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => setActiveTab('active')}
          className="btn btn-sm"
          style={{
            background: activeTab === 'active' ? 'var(--primary)' : '#f4f4f5',
            color: activeTab === 'active' ? '#fff' : 'var(--text-2)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Package size={13} /> Active Inventory ({activeItems.length})
        </button>
        <button
          onClick={() => setActiveTab('archived')}
          className="btn btn-sm"
          style={{
            background: activeTab === 'archived' ? 'var(--primary)' : '#f4f4f5',
            color: activeTab === 'archived' ? '#fff' : 'var(--text-2)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Archive size={13} /> Archived Inventory ({archivedItems.length})
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : 4},1fr)`, gap: 10, marginBottom: 14 }}>
        {[
          { label: activeTab === 'active' ? 'Active SKUs' : 'Archived SKUs', value: displayedItems.length },
          { label: 'Low Stock (Active)', value: lowStock.length, warn: lowStock.length > 0 },
          { label: 'Total Value', value: `RM${displayedItems.reduce((s, i) => s + i.stock * i.cost, 0).toLocaleString('en-MY', { minimumFractionDigits: 2 })}` },
          { label: 'Suppliers', value: new Set(displayedItems.map(i => i.supplierId).filter(Boolean)).size },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.warn ? '#dc2626' : 'var(--text-1)' }}>{s.value}</div>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedItems.map(item => {
                const st = stockStatus(item);
                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    style={{
                      cursor: 'pointer',
                      transition: 'background .1s',
                      opacity: item.isArchived ? 0.75 : 1,
                      background: item.isArchived ? '#fcfcfc' : 'transparent',
                    }}
                  >
                    <td style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 8,
                          background: item.isArchived ? '#e4e4e7' : 'var(--primary-light)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: item.isArchived ? 'var(--text-3)' : 'var(--primary)',
                          flexShrink: 0
                        }}>
                          {item.isArchived ? <Archive size={14} /> : <Package size={14} />}
                        </div>
                        <div>
                          <div>{item.name}</div>
                          {item.isArchived && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>(Archived - Muted)</span>}
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-2)' }}>{item.category}</td>
                    <td style={{ fontWeight: 700 }}>{item.stock} {item.unit}</td>
                    <td style={{ color: 'var(--text-3)' }}>{item.minStock} {item.unit}</td>
                    <td>RM{item.cost.toFixed(2)}</td>
                    <td style={{ fontWeight: 600 }}>RM{(item.stock * item.cost).toFixed(2)}</td>
                    <td style={{ color: 'var(--text-2)' }}>{supplierMap[item.supplierId] || item.supplierId || '—'}</td>
                    <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                        {!item.isArchived && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => openPurchaseModal(item)}
                            title="Purchase / Restock Stock"
                            style={{ padding: 6, color: 'var(--primary)' }}
                          >
                            <ShoppingCart size={14} />
                          </button>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => openEdit(item)}
                          aria-label={`Edit ${item.name}`}
                          title="Edit Details"
                          style={{ padding: 6 }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => handleToggleArchive(item, e)}
                          title={item.isArchived ? 'Unarchive (Restore to active list)' : 'Archive Inventory (Hide and mute alerts)'}
                          style={{ padding: 6, color: item.isArchived ? 'var(--green)' : 'var(--text-3)' }}
                        >
                          {item.isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => openDeleteConfirm(item)}
                          aria-label={`Delete ${item.name}`}
                          title="Delete Permanently"
                          style={{ padding: 6, color: '#dc2626' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {displayedItems.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '28px 0' }}>
                    {activeTab === 'archived'
                      ? 'No archived inventory items.'
                      : (search ? 'No inventory items match your search.' : 'No active inventory items yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Stock Modal */}
      {showAdd && (
        <Modal title="Add New Stock" onClose={()=>setShowAdd(false)}>
          <FormRow label="Item Name">
            <input className="inp" placeholder="e.g. Chicken Wings" value={addForm.name} onChange={e=>setAddForm(f=>({...f,name:e.target.value}))}/>
          </FormRow>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
            <FormRow label="Category">
              <input className="inp" placeholder="Protein" value={addForm.category} onChange={e=>setAddForm(f=>({...f,category:e.target.value}))}/>
            </FormRow>
            <FormRow label="Unit">
              <select className="inp" value={addForm.unit} onChange={e=>setAddForm(f=>({...f,unit:e.target.value}))}>
                {['kg','L','pcs','box','pack'].map(u=><option key={u}>{u}</option>)}
              </select>
            </FormRow>
            <FormRow label="Opening Stock">
              <input className="inp" type="number" min="0" value={addForm.stock} onChange={e=>setAddForm(f=>({...f,stock:e.target.value}))}/>
            </FormRow>
            <FormRow label="Min Stock">
              <input className="inp" type="number" min="0" value={addForm.minStock} onChange={e=>setAddForm(f=>({...f,minStock:e.target.value}))}/>
            </FormRow>
            <FormRow label="Cost per Unit (RM)">
              <input className="inp" type="number" min="0" step="0.01" value={addForm.cost} onChange={e=>setAddForm(f=>({...f,cost:e.target.value}))}/>
            </FormRow>
            <FormRow label="Supplier">
              <select className="inp" value={addForm.supplierId} onChange={e=>setAddForm(f=>({...f,supplierId:e.target.value}))}>
                <option value="">-- Select Supplier --</option>
                {supplierDocs.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FormRow>
          </div>
          <div style={{ display:'flex',gap:8,marginTop:6 }}>
            <button className="btn btn-outline" style={{ flex:1,justifyContent:'center' }} onClick={()=>setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:1,justifyContent:'center' }} onClick={handleAddStock} disabled={saving}>
              <PackagePlus size={14}/> {saving ? 'Saving…' : 'Add to Inventory'}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit Stock Modal */}
      {showEdit && selectedItem && (
        <Modal title={`Edit ${selectedItem.name}`} onClose={()=>{setShowEdit(false);setSelectedItem(null);}}>
          <FormRow label="Item Name">
            <input className="inp" placeholder="e.g. Chicken Wings" value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))}/>
          </FormRow>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
            <FormRow label="Category">
              <input className="inp" placeholder="Protein" value={editForm.category} onChange={e=>setEditForm(f=>({...f,category:e.target.value}))}/>
            </FormRow>
            <FormRow label="Unit">
              <select className="inp" value={editForm.unit} onChange={e=>setEditForm(f=>({...f,unit:e.target.value}))}>
                {['kg','L','pcs','box','pack'].map(u=><option key={u}>{u}</option>)}
              </select>
            </FormRow>
            <FormRow label="Current Stock">
              <input className="inp" type="number" min="0" value={editForm.stock} onChange={e=>setEditForm(f=>({...f,stock:e.target.value}))}/>
            </FormRow>
            <FormRow label="Min Stock">
              <input className="inp" type="number" min="0" value={editForm.minStock} onChange={e=>setEditForm(f=>({...f,minStock:e.target.value}))}/>
            </FormRow>
            <FormRow label="Cost per Unit (RM)">
              <input className="inp" type="number" min="0" step="0.01" value={editForm.cost} onChange={e=>setEditForm(f=>({...f,cost:e.target.value}))}/>
            </FormRow>
            <FormRow label="Supplier">
              <select className="inp" value={editForm.supplierId} onChange={e=>setEditForm(f=>({...f,supplierId:e.target.value}))}>
                <option value="">-- Select Supplier --</option>
                {supplierDocs.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FormRow>
          </div>
          <div style={{ display:'flex',gap:8,marginTop:6 }}>
            <button className="btn btn-outline" style={{ flex:1,justifyContent:'center' }} onClick={()=>{setShowEdit(false);setSelectedItem(null);}}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:1,justifyContent:'center' }} onClick={handleEditStock} disabled={saving}>
              <Pencil size={14}/> {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedItem && (
        <Modal title="Delete Stock Item" onClose={()=>{setShowDeleteConfirm(false);setSelectedItem(null);}}>
          <p style={{ fontSize:14, color:'var(--text-2)', marginBottom:16 }}>
            Are you sure you want to <strong>permanently delete</strong> <strong>{selectedItem.name}</strong> from the database? This cannot be undone.
          </p>
          <div style={{ display:'flex',gap:8 }}>
            <button className="btn btn-outline" style={{ flex:1,justifyContent:'center' }} onClick={()=>{setShowDeleteConfirm(false);setSelectedItem(null);}}>Cancel</button>
            <button className="btn btn-danger" style={{ flex:1,justifyContent:'center' }} onClick={handleDeleteStock} disabled={saving}>
              <Trash2 size={14}/> {saving ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {/* Wastage Modal */}
      {showWastage && (
        <Modal title="Log Material Wastage" onClose={()=>setShowWastage(false)}>
          <FormRow label="Select Item">
            <select className="inp" value={wastageForm.itemId} onChange={e=>setWastageForm(f=>({...f,itemId:e.target.value}))}>
              <option value="">-- Select Item --</option>
              {items.map(i=><option key={i.id} value={i.id}>{i.name} ({i.stock} {i.unit} available)</option>)}
            </select>
          </FormRow>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
            <FormRow label="Quantity">
              <input className="inp" type="number" min="0" value={wastageForm.qty} onChange={e=>setWastageForm(f=>({...f,qty:e.target.value}))}/>
            </FormRow>
            <FormRow label="Type">
              <select className="inp" value={wastageForm.type} onChange={e=>setWastageForm(f=>({...f,type:e.target.value}))}>
                {['Wastage','Spoilage','Damaged','Stolen','Used for Training'].map(t=><option key={t}>{t}</option>)}
              </select>
            </FormRow>
          </div>
          <FormRow label="Reason / Notes">
            <textarea className="inp" rows={3} placeholder="Describe the reason for wastage…" value={wastageForm.reason} onChange={e=>setWastageForm(f=>({...f,reason:e.target.value}))} style={{ resize:'vertical' }}/>
          </FormRow>
          <div style={{ display:'flex',gap:8,marginTop:6 }}>
            <button className="btn btn-outline" style={{ flex:1,justifyContent:'center' }} onClick={()=>setShowWastage(false)}>Cancel</button>
            <button className="btn btn-danger" style={{ flex:1,justifyContent:'center' }} onClick={handleWastage} disabled={saving}>
              {saving ? 'Logging…' : 'Log Wastage'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Purchase Stock Modal ── */}
      {showPurchase && (
        <Modal title="Purchase Stock (Restock)" onClose={() => setShowPurchase(false)} maxWidth={500}>
          <FormRow label="Select Inventory Item">
            <select
              className="inp"
              value={purchaseForm.itemId}
              onChange={e => {
                const chosenId = e.target.value;
                const found = items.find(i => i.id === chosenId);
                setPurchaseForm(f => ({
                  ...f,
                  itemId: chosenId,
                  unitCost: found ? String(found.cost) : f.unitCost,
                  supplierId: found?.supplierId || f.supplierId,
                }));
              }}
            >
              <option value="">-- Choose Item to Purchase --</option>
              {items.map(i => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.stock} {i.unit} in stock) {i.isArchived ? '[Archived]' : ''}
                </option>
              ))}
            </select>
          </FormRow>

          {(() => {
            const currentItem = items.find(i => i.id === purchaseForm.itemId);
            const qtyNum = Number(purchaseForm.qty) || 0;
            const costNum = Number(purchaseForm.unitCost) || 0;
            const total = qtyNum * costNum;

            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <FormRow label={`Quantity to Add (${currentItem?.unit || 'Units'})`}>
                    <input
                      className="inp"
                      type="number"
                      min="0.01"
                      step="any"
                      placeholder="e.g. 50"
                      value={purchaseForm.qty}
                      onChange={e => setPurchaseForm(f => ({ ...f, qty: e.target.value }))}
                      autoFocus
                    />
                  </FormRow>
                  <FormRow label="Unit Cost (RM)">
                    <input
                      className="inp"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={purchaseForm.unitCost}
                      onChange={e => setPurchaseForm(f => ({ ...f, unitCost: e.target.value }))}
                    />
                  </FormRow>
                </div>

                <FormRow label="Supplier">
                  <select
                    className="inp"
                    value={purchaseForm.supplierId}
                    onChange={e => setPurchaseForm(f => ({ ...f, supplierId: e.target.value }))}
                  >
                    <option value="">-- Select Supplier (Optional) --</option>
                    {supplierDocs.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.category || 'Supplier'})</option>
                    ))}
                  </select>
                </FormRow>

                <FormRow label="Purchase Note / PO Ref (Optional)">
                  <input
                    className="inp"
                    placeholder="e.g. Invoice #PO-9021 or regular weekly delivery"
                    value={purchaseForm.note}
                    onChange={e => setPurchaseForm(f => ({ ...f, note: e.target.value }))}
                  />
                </FormRow>

                {qtyNum > 0 && currentItem && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, color: 'var(--text-2)' }}>
                      <span>New Projected Stock:</span>
                      <strong style={{ color: 'var(--green)' }}>{(currentItem.stock + qtyNum).toFixed(2)} {currentItem.unit}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: '#166534' }}>
                      <span>Total Purchase Cost:</span>
                      <span>RM{total.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowPurchase(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1, justifyContent: 'center', gap: 6 }}
              onClick={handlePurchaseStock}
              disabled={saving || !purchaseForm.itemId || !Number(purchaseForm.qty)}
            >
              <ShoppingCart size={14} /> {saving ? 'Recording…' : 'Confirm Purchase'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Inventory Item Detail Modal ── */}
      {selectedItem && !showEdit && !showDeleteConfirm && !showPurchase && (() => {
        const st = stockStatus(selectedItem);
        const supplierName = supplierMap[selectedItem.supplierId] || '—';
        const itemPurchases = purchaseDocs.filter(p => p.productId === selectedItem.id);
        const totalPurchasedSpend = itemPurchases.reduce((sum, p) => sum + (p.totalCost ?? 0), 0);
        const totalPurchasedQty = itemPurchases.reduce((sum, p) => sum + (p.qty ?? 0), 0);
        const itemTransactions = transactionDocs.filter(t => t.productId === selectedItem.id).slice(0, 10);

        return (
          <Modal title={selectedItem.name} onClose={() => setSelectedItem(null)} maxWidth={640}>
            {/* Archived warning banner inside modal if item is archived */}
            {selectedItem.isArchived && (
              <div style={{ background: '#f4f4f5', border: '1px solid #d4d4d8', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
                <Archive size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <span>This item is <strong>Archived</strong>. It is hidden from active inventory and all stock notifications are muted.</span>
              </div>
            )}

            {/* Meta info grid */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
                <Tag size={14} /> Category: <strong style={{ color: 'var(--text-1)' }}>{selectedItem.category || 'General'}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
                <Truck size={14} /> Supplier: <strong style={{ color: 'var(--text-1)' }}>{supplierName}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
                <Package size={14} /> Unit Cost: <strong style={{ color: 'var(--text-1)' }}>RM{selectedItem.cost.toFixed(2)} / {selectedItem.unit}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
                <AlertTriangle size={14} /> Min Threshold: <strong style={{ color: 'var(--text-1)' }}>{selectedItem.minStock} {selectedItem.unit}</strong>
              </div>
            </div>

            {/* Metric KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              <div style={{ background: 'var(--main-bg)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Current Stock</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: st.label === 'Low' ? '#dc2626' : 'var(--text-1)' }}>
                  {selectedItem.stock} {selectedItem.unit}
                </div>
                <span className={`badge ${st.cls}`} style={{ marginTop: 4 }}>{st.label} Stock</span>
              </div>
              <div style={{ background: 'var(--main-bg)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Inventory Value</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>
                  RM{(selectedItem.stock * selectedItem.cost).toFixed(2)}
                </div>
              </div>
              <div style={{ background: 'var(--main-bg)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Total Spend Logged</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>
                  RM{totalPurchasedSpend.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Purchase History */}
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Purchase History ({itemPurchases.length})</span>
              {totalPurchasedQty > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>
                  Total restocked: {totalPurchasedQty} {selectedItem.unit}
                </span>
              )}
            </div>
            {itemPurchases.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '12px 0', textAlign: 'center', background: '#fafafa', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
                No restock purchases recorded for this item yet.
              </div>
            ) : (
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
                <table className="data-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Supplier</th>
                      <th>Quantity</th>
                      <th>Unit Cost</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemPurchases.map(p => (
                      <tr key={p.id}>
                        <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{p.date}</td>
                        <td style={{ fontWeight: 600 }}>{p.supplierName || supplierName}</td>
                        <td>{p.qty} {p.unit}</td>
                        <td>RM{(p.unitCost ?? 0).toFixed(2)}</td>
                        <td style={{ fontWeight: 700 }}>RM{(p.totalCost ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recent Inventory Movements */}
            {itemTransactions.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Recent Stock Logs & Wastage</div>
                <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
                  <table className="data-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Movement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemTransactions.map(t => {
                        const timeStr = t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString('en-MY', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                        const isNeg = (t.qty ?? 0) < 0;
                        return (
                          <tr key={t.id}>
                            <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{timeStr}</td>
                            <td>
                              <span className={`badge ${t.type === 'PURCHASE' ? 'badge-green' : t.type === 'WASTAGE' ? 'badge-red' : 'badge-gray'}`} style={{ fontSize: 10 }}>
                                {t.type}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700, color: isNeg ? '#dc2626' : 'var(--green)' }}>
                              {isNeg ? `${t.qty} ${selectedItem.unit}` : `+${t.qty} ${selectedItem.unit}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Modal footer actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={(e) => handleToggleArchive(selectedItem, e)}
                  style={{ color: selectedItem.isArchived ? 'var(--green)' : 'var(--text-2)', gap: 6 }}
                >
                  {selectedItem.isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  {selectedItem.isArchived ? 'Unarchive Item' : 'Archive Item'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!selectedItem.isArchived && (
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      const it = selectedItem;
                      setSelectedItem(null);
                      openPurchaseModal(it);
                    }}
                    style={{ borderColor: 'var(--primary)', color: 'var(--primary)', gap: 6 }}
                  >
                    <ShoppingCart size={13} /> Purchase Stock
                  </button>
                )}
                <button className="btn btn-outline" onClick={() => setSelectedItem(null)}>
                  Close
                </button>
                <button className="btn btn-primary" onClick={() => openEdit(selectedItem)}>
                  <Pencil size={13} /> Edit Item
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
