import React, { useState } from 'react';
import { Plus, Edit2, ToggleLeft, ToggleRight, TrendingUp } from 'lucide-react';
import { engineeredMenu } from '../data/placeholder';
import { Modal, FormRow } from '../components/Layout';

export default function MenuEngineeringPage({ isMobile }) {
  const [items, setItems] = useState(engineeredMenu);
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name:'',category:'Combo',price:0,cost:0,active:true });
  const [activeRoster, setActiveRoster] = useState('Active Menu Roster');

  const margin = (item) => (((item.price - item.cost) / item.price) * 100).toFixed(1);

  const classify = (item) => {
    const avgSold = items.reduce((s,i)=>s+i.sold,0)/items.length;
    const avgMargin = items.reduce((s,i)=>s+(i.price-i.cost)/i.price*100,0)/items.length;
    const m = (item.price-item.cost)/item.price*100;
    if (item.sold >= avgSold && m >= avgMargin) return { label:'Star', cls:'badge-green' };
    if (item.sold >= avgSold && m < avgMargin) return { label:'Plow Horse', cls:'badge-blue' };
    if (item.sold < avgSold && m >= avgMargin) return { label:'Puzzle', cls:'badge-amber' };
    return { label:'Dog', cls:'badge-gray' };
  };

  const handleSave = () => {
    if (editItem) {
      setItems(prev => prev.map(i => i.id===editItem.id ? { ...i, ...form, price:Number(form.price), cost:Number(form.cost) } : i));
    } else {
      setItems(prev => [...prev, { id:Date.now(), ...form, price:Number(form.price), cost:Number(form.cost), sold:0 }]);
    }
    setForm({ name:'',category:'Combo',price:0,cost:0,active:true });
    setEditItem(null);
    setShowAdd(false);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ name:item.name, category:item.category, price:item.price, cost:item.cost, active:item.active });
    setShowAdd(true);
  };

  const toggleActive = (id) => {
    setItems(prev => prev.map(i => i.id===id ? {...i, active:!i.active} : i));
  };

  const activeItems = items.filter(i => i.active);
  const totalRevenue = items.reduce((s,i)=>s+i.price*i.sold,0);
  const avgMarginPct = (items.reduce((s,i)=>s+(i.price-i.cost)/i.price*100,0)/items.length).toFixed(1);

  return (
    <div>
      {/* Stats */}
      <div style={{ display:'grid',gridTemplateColumns:`repeat(${isMobile?2:4},1fr)`,gap:10,marginBottom:14 }}>
        {[
          { label:'Active Items', value:activeItems.length },
          { label:'Avg. Margin', value:`${avgMarginPct}%` },
          { label:'Total Items Sold', value:items.reduce((s,i)=>s+i.sold,0) },
          { label:'Est. Revenue', value:`RM${totalRevenue.toLocaleString()}` },
        ].map(s=>(
          <div key={s.label} className="card" style={{ padding:'14px 16px' }}>
            <div style={{ fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:22,fontWeight:700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs + Add */}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8 }}>
        <div style={{ display:'flex',gap:6 }}>
          {['Active Menu Roster','Item Details'].map(tab=>(
            <button key={tab}
              onClick={()=>setActiveRoster(tab)}
              className="btn btn-sm"
              style={{ background:activeRoster===tab?'var(--primary)':'#f4f4f5', color:activeRoster===tab?'#fff':'var(--text-2)', border:'none' }}>
              {tab}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={()=>{ setEditItem(null); setForm({ name:'',category:'Combo',price:0,cost:0,active:true }); setShowAdd(true); }}>
          <Plus size={13}/> Add Menu Item
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Price</th>
                <th>Cost</th>
                <th>Margin</th>
                <th>Sold</th>
                <th>Classification</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item=>{
                const cls = classify(item);
                return (
                  <tr key={item.id} style={{ opacity: item.active ? 1 : 0.5 }}>
                    <td style={{ fontWeight:600 }}>{item.name}</td>
                    <td style={{ color:'var(--text-2)' }}>{item.category}</td>
                    <td style={{ fontWeight:600 }}>RM{item.price.toFixed(2)}</td>
                    <td style={{ color:'var(--text-2)' }}>RM{item.cost.toFixed(2)}</td>
                    <td>
                      <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                        <div style={{ width:50,height:5,borderRadius:99,background:'#f0f0f0',overflow:'hidden' }}>
                          <div style={{ width:`${margin(item)}%`,height:'100%',background: parseFloat(margin(item))>60?'var(--green)':'var(--amber)',borderRadius:99 }}/>
                        </div>
                        <span style={{ fontSize:12,fontWeight:600 }}>{margin(item)}%</span>
                      </div>
                    </td>
                    <td style={{ fontWeight:600 }}>{item.sold}</td>
                    {/* Rating column removed — no longer needed */}
                    <td><span className={`badge ${cls.cls}`}>{cls.label}</span></td>
                    <td>
                      <button onClick={()=>toggleActive(item.id)} style={{ background:'none',border:'none',cursor:'pointer',color: item.active?'var(--green)':'var(--text-3)' }}>
                        {item.active ? <ToggleRight size={20}/> : <ToggleLeft size={20}/>}
                      </button>
                    </td>
                    <td>
                      <button onClick={()=>openEdit(item)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-2)',padding:4 }}>
                        <Edit2 size={14}/>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAdd && (
        <Modal title={editItem ? 'Edit Menu Item' : 'Add New Menu Item'} onClose={()=>{ setShowAdd(false); setEditItem(null); }}>
          <FormRow label="Item Name">
            <input className="inp" placeholder="e.g. Spicy Chicken Combo" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
          </FormRow>
          <FormRow label="Category">
            <select className="inp" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
              {['Combo','Chicken','Burger','Sides','Drinks'].map(c=><option key={c}>{c}</option>)}
            </select>
          </FormRow>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
            <FormRow label="Selling Price (RM)">
              <input className="inp" type="number" min="0" step="0.10" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))}/>
            </FormRow>
            <FormRow label="Cost Price (RM)">
              <input className="inp" type="number" min="0" step="0.10" value={form.cost} onChange={e=>setForm(f=>({...f,cost:e.target.value}))}/>
            </FormRow>
          </div>
          {form.price > 0 && form.cost > 0 && (
            <div style={{ background:'var(--green-light)',borderRadius:'var(--radius-sm)',padding:'8px 12px',marginBottom:14,fontSize:13 }}>
              <TrendingUp size={13} style={{ marginRight:6,color:'var(--green)' }}/>
              Estimated margin: <strong style={{ color:'var(--green)' }}>{(((form.price-form.cost)/form.price)*100).toFixed(1)}%</strong>
            </div>
          )}
          <FormRow label="Active on Menu">
            <div style={{ display:'flex',alignItems:'center',gap:8 }}>
              <input type="checkbox" checked={form.active} onChange={e=>setForm(f=>({...f,active:e.target.checked}))} style={{ width:16,height:16,accentColor:'var(--primary)' }}/>
              <span style={{ fontSize:13 }}>Show this item on the POS menu</span>
            </div>
          </FormRow>
          <div style={{ display:'flex',gap:8,marginTop:6 }}>
            <button className="btn btn-outline" style={{ flex:1,justifyContent:'center' }} onClick={()=>{ setShowAdd(false); setEditItem(null); }}>Cancel</button>
            <button className="btn btn-primary" style={{ flex:1,justifyContent:'center' }} onClick={handleSave}>
              {editItem ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
