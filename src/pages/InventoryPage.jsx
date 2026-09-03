import React, { useState } from 'react';
import { where, orderBy } from 'firebase/firestore';
import { Plus, Search, AlertTriangle, PackagePlus, Trash2, Pencil } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { productService, inventoryTransactionService } from '../services/firestoreService';
import { Modal, FormRow } from '../components/Layout';

// Firestore `products` docs use different field names than this page's UI.
// These two helpers translate between them so the rest of the component
// can keep working with the simple { name, unit, stock, minStock, cost,
// category, supplier } shape it already uses.
const fromDoc = (d) => ({
  id: d.id,
  name: d.name ?? '',
  unit: d.uomCode ?? 'kg',
  stock: d.stock ?? 0,
  minStock: d.minStock ?? 0,
  cost: d.standardCost ?? 0,
  category: d.categoryId ?? '',
  supplier: d.supplier ?? '',
});

const toDoc = (form) => ({
  name: form.name,
  uomCode: form.unit,
  stock: Number(form.stock),
  minStock: Number(form.minStock),
  standardCost: Number(form.cost),
  categoryId: form.category,
  supplier: form.supplier,
  isInventoryItem: true,
  showOnPos: false,
});

const emptyForm = { name:'',unit:'kg',stock:0,minStock:0,cost:0,category:'',supplier:'' };

export default function InventoryPage({ isMobile }) {
  const { data: productDocs, loading, error } = useFirestore(
    'products',
    where('isInventoryItem', '==', true),
    where('isActive', '==', true),
    orderBy('name'),
  );
  const items = productDocs.map(fromDoc);

  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
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

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const lowStock = items.filter(i => i.stock <= i.minStock);

  const stockStatus = (item) => {
    const ratio = item.stock / item.minStock;
    if (ratio <= 1) return { label:'Low', cls:'badge-red' };
    if (ratio <= 1.5) return { label:'Medium', cls:'badge-amber' };
    return { label:'OK', cls:'badge-green' };
  };

  const handleAddStock = async () => {
    setSaving(true);
    try {
      const newId = await productService.create(toDoc(addForm));
      const openingStock = Number(addForm.stock);
      if (openingStock > 0) {
        await inventoryTransactionService.logPurchase(newId, openingStock);
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
    setEditForm({ name:item.name, unit:item.unit, stock:item.stock, minStock:item.minStock, cost:item.cost, category:item.category, supplier:item.supplier });
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
      // Soft delete: matches the pattern already used for products/staff/
      // outlets in firestoreService.js, so past sales/transactions that
      // reference this product id stay intact. The isActive filter on the
      // query above makes it disappear from this list immediately.
      await productService.deactivate(selectedItem.id);
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
      <div style={{ display:'flex',gap:10,alignItems:'center',marginBottom:14,flexWrap:'wrap' }}>
        <div style={{ position:'relative',flex:1,minWidth:200 }}>
          <Search size={14} style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text-3)' }}/>
          <input className="inp" placeholder="Search inventory…" value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:32 }}/>
        </div>
        <button className="btn btn-outline" onClick={()=>setShowWastage(true)}>
          <Trash2 size={14}/> Log Wastage
        </button>
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)}>
          <Plus size={14}/> Add New Stock
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid',gridTemplateColumns:`repeat(${isMobile?2:4},1fr)`,gap:10,marginBottom:14 }}>
        {[
          { label:'Total SKUs', value: items.length },
          { label:'Low Stock', value: lowStock.length, warn: lowStock.length>0 },
          { label:'Total Value', value:`RM${items.reduce((s,i)=>s+i.stock*i.cost,0).toLocaleString('en-MY',{minimumFractionDigits:2})}` },
          { label:'Suppliers', value: new Set(items.map(i=>i.supplier)).size },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding:'14px 16px' }}>
            <div style={{ fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:22,fontWeight:700,color: s.warn ? '#dc2626' : 'var(--text-1)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
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
              {filtered.map(item => {
                const st = stockStatus(item);
                return (
                  <tr key={item.id}>
                    <td style={{ fontWeight:600 }}>{item.name}</td>
                    <td style={{ color:'var(--text-2)' }}>{item.category}</td>
                    <td style={{ fontWeight:700 }}>{item.stock} {item.unit}</td>
                    <td style={{ color:'var(--text-3)' }}>{item.minStock} {item.unit}</td>
                    <td>RM{item.cost.toFixed(2)}</td>
                    <td style={{ fontWeight:600 }}>RM{(item.stock*item.cost).toFixed(2)}</td>
                    <td style={{ color:'var(--text-2)' }}>{item.supplier}</td>
                    <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => openEdit(item)}
                          aria-label={`Edit ${item.name}`}
                          style={{ padding:6 }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => openDeleteConfirm(item)}
                          aria-label={`Delete ${item.name}`}
                          style={{ padding:6, color:'#dc2626' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
              <input className="inp" placeholder="FreshFarm" value={addForm.supplier} onChange={e=>setAddForm(f=>({...f,supplier:e.target.value}))}/>
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
              <input className="inp" placeholder="FreshFarm" value={editForm.supplier} onChange={e=>setEditForm(f=>({...f,supplier:e.target.value}))}/>
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
            Are you sure you want to delete <strong>{selectedItem.name}</strong> from inventory? This can't be undone.
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
    </div>
  );
}
