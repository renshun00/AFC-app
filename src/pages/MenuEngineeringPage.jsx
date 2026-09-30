import React, { useState, useRef, useMemo } from 'react';
import { where, orderBy } from 'firebase/firestore';
import { Plus, Search, Edit2, Pencil, Trash2, ToggleLeft, ToggleRight, TrendingUp, ImageOff, Upload, X, Link2, Package, AlertTriangle, Tag, DollarSign, CheckCircle2 } from 'lucide-react';
import { useFirestore } from '../hooks/useFirestore';
import { productService, recipeService, RECIPE_UNITS_FOR_BASE, convertToBaseUnit } from '../services/firestoreService';
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
  recipe: d.recipe ?? [],
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
  recipe: form.recipe ?? [],
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

// ── Recipe Ingredient Row ─────────────────────────────────────────────────────
function RecipeIngredientRow({ ingredient, inventoryItems, onUpdate, onRemove }) {
  const invItem = inventoryItems.find(i => i.id === ingredient.inventoryItemId);
  const baseUnit = invItem?.uomCode ?? ingredient.baseUnit ?? 'kg';
  const availableUnits = RECIPE_UNITS_FOR_BASE[baseUnit] || [baseUnit];

  // Calculate the cost for this ingredient row
  const unitCostPerBase = invItem?.standardCost ?? 0;
  const qtyInBase = convertToBaseUnit(ingredient.qtyPerUnit || 0, ingredient.unit);
  const rowCost = qtyInBase * unitCostPerBase;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
      background: '#fafafa', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
    }}>
      {/* Ingredient name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ingredient.inventoryItemName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
          Stock: {invItem ? `${invItem.stock} ${baseUnit}` : 'N/A'}
          {unitCostPerBase > 0 && <> · RM{unitCostPerBase.toFixed(2)}/{baseUnit}</>}
        </div>
      </div>

      {/* Qty input */}
      <input
        className="inp"
        type="number"
        min="0"
        step="0.1"
        value={ingredient.qtyPerUnit}
        onChange={e => onUpdate({ ...ingredient, qtyPerUnit: Number(e.target.value) || 0 })}
        style={{ width: 70, textAlign: 'center', padding: '5px 6px', fontSize: 13 }}
        placeholder="Qty"
      />

      {/* Unit selector */}
      <select
        className="inp"
        value={ingredient.unit}
        onChange={e => onUpdate({ ...ingredient, unit: e.target.value })}
        style={{ width: 60, padding: '5px 4px', fontSize: 12 }}
      >
        {availableUnits.map(u => <option key={u} value={u}>{u}</option>)}
      </select>

      {/* Cost display */}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', minWidth: 60, textAlign: 'right' }}>
        RM{rowCost.toFixed(2)}
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4, flexShrink: 0 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

const emptyForm = { name: '', category: 'Combo', price: 0, cost: 0, active: true, img: null, imgPlaceholder: '🍽️', recipe: [] };

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MenuEngineeringPage({ isMobile }) {
  // Real-time Firestore subscription — all products that are menu items
  const { data: productDocs, loading, error } = useFirestore(
    'products',
    where('isActive', '==', true),
    orderBy('name'),
  );

  // Real-time subscription to inventory items (for recipe picker + available qty)
  const { data: inventoryDocs } = useFirestore(
    'products',
    where('isInventoryItem', '==', true),
    where('isActive', '==', true),
    orderBy('name'),
  );

  // Show all menu-type products (including toggled-off ones, so they grey out instead of vanishing)
  const items = productDocs
    .filter(d => d.isInventoryItem !== true)
    .map(fromDoc);

  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(emptyForm);

  // Recipe ingredient picker state
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [showIngredientPicker, setShowIngredientPicker] = useState(false);

  // ── Dynamic cost & margin calculation based on live inventory ingredient costs ──
  // If an item has recipe ingredients, its cost is computed dynamically from the latest
  // inventory standardCost. If inventory cost goes up or down, this auto-adjusts immediately!
  const getItemCost = (item) => {
    if (item.recipe && item.recipe.length > 0) {
      return recipeService.calculateCostFromRecipe(item.recipe, inventoryDocs);
    }
    return item.cost ?? 0;
  };

  const margin = (item) => {
    const cost = getItemCost(item);
    return item.price > 0 ? (((item.price - cost) / item.price) * 100).toFixed(1) : '0.0';
  };

  // ── Available qty per menu item (computed from recipe + inventory) ─────────
  const availableQtyMap = useMemo(() => {
    const map = {};
    for (const item of items) {
      map[item.id] = recipeService.calculateAvailableQty(item.recipe, inventoryDocs);
    }
    return map;
  }, [items, inventoryDocs]);

  // ── Filtered menu items by search query ────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.category && i.category.toLowerCase().includes(q))
    );
  }, [items, search]);

  // ── Auto-cost from recipe in the Add/Edit form ──────────────────────────────
  const recipeCost = useMemo(() => {
    if (!form.recipe || form.recipe.length === 0) return 0;
    return recipeService.calculateCostFromRecipe(form.recipe, inventoryDocs);
  }, [form.recipe, inventoryDocs]);

  // Update cost when recipe changes (auto-calculate)
  const hasRecipe = form.recipe && form.recipe.length > 0;

  // ── Filtered inventory items for ingredient picker ────────────────────────
  const filteredInventory = inventoryDocs.filter(inv => {
    // Exclude items already in the recipe
    const alreadyAdded = form.recipe.some(r => r.inventoryItemId === inv.id);
    if (alreadyAdded) return false;
    // Search filter
    if (ingredientSearch && !inv.name?.toLowerCase().includes(ingredientSearch.toLowerCase())) return false;
    return true;
  });

  // ── Recipe CRUD helpers ───────────────────────────────────────────────────
  const addIngredient = (invItem) => {
    const baseUnit = invItem.uomCode ?? 'kg';
    const defaultUnit = RECIPE_UNITS_FOR_BASE[baseUnit]?.[0] ?? baseUnit;
    setForm(f => ({
      ...f,
      recipe: [...f.recipe, {
        inventoryItemId: invItem.id,
        inventoryItemName: invItem.name,
        qtyPerUnit: 0,
        unit: defaultUnit,
        baseUnit: baseUnit,
      }],
    }));
    setShowIngredientPicker(false);
    setIngredientSearch('');
  };

  const updateIngredient = (index, updated) => {
    setForm(f => ({
      ...f,
      recipe: f.recipe.map((r, i) => i === index ? updated : r),
    }));
  };

  const removeIngredient = (index) => {
    setForm(f => ({
      ...f,
      recipe: f.recipe.filter((_, i) => i !== index),
    }));
  };

  // ── Firestore CRUD ────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      // If recipe exists, auto-set cost from recipe
      const saveForm = { ...form };
      if (saveForm.recipe.length > 0) {
        saveForm.cost = recipeCost;
      }

      if (editItem) {
        await productService.update(editItem.id, toDoc(saveForm));
      } else {
        await productService.create(toDoc(saveForm));
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
    setForm({
      name: item.name,
      category: item.category,
      price: item.price,
      cost: getItemCost(item),
      active: item.active,
      img: item.img ?? null,
      imgPlaceholder: item.imgPlaceholder ?? '🍽️',
      recipe: item.recipe ?? [],
    });
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
  const activeItems = items.filter(i => i.active);
  const avgMarginPct = items.length > 0
    ? (items.reduce((s, i) => {
        const cost = getItemCost(i);
        return s + (i.price > 0 ? (i.price - cost) / i.price * 100 : 0);
      }, 0) / items.length).toFixed(1)
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
          { label: 'Active Items', value: activeItems.length },
          { label: 'Avg. Margin', value: `${avgMarginPct}%` },
          { label: 'Categories', value: new Set(items.map(i => i.category)).size },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Action Header: Search & Add Menu Item */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: isMobile ? '100%' : 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input
            className="inp"
            placeholder="Search menu items…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
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
                <th>Recipe</th>
                <th>Avail. Qty</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-3)' }}>
                    {search ? `No menu items found matching "${search}"` : 'No menu items yet.'}
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => {
                const avail = availableQtyMap[item.id];
                const hasRecipeLink = item.recipe && item.recipe.length > 0;
                const isLowStock = hasRecipeLink && avail !== Infinity && avail <= 5;
                const dynamicCost = getItemCost(item);
                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    style={{ opacity: item.active ? 1 : 0.5, cursor: 'pointer', transition: 'background .1s' }}
                  >
                    {/* Photo cell */}
                    <td>
                      <ItemImage item={item} size={44} radius={8} />
                    </td>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td style={{ color: 'var(--text-2)' }}>{item.category}</td>
                    <td style={{ fontWeight: 600 }}>RM{item.price.toFixed(2)}</td>
                    <td style={{ color: 'var(--text-2)' }}>
                      RM{dynamicCost.toFixed(2)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 50, height: 5, borderRadius: 99, background: '#f0f0f0', overflow: 'hidden' }}>
                          <div style={{ width: `${margin(item)}%`, height: '100%', background: parseFloat(margin(item)) > 60 ? 'var(--green)' : 'var(--amber)', borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{margin(item)}%</span>
                      </div>
                    </td>
                    {/* Recipe column */}
                    <td>
                      {hasRecipeLink ? (
                        <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Link2 size={10} /> {item.recipe.length} item{item.recipe.length > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="badge" style={{ background: '#f4f4f5', color: 'var(--text-3)' }}>No recipe</span>
                      )}
                    </td>
                    {/* Available Qty column */}
                    <td>
                      {hasRecipeLink ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {isLowStock && <AlertTriangle size={12} style={{ color: '#dc2626', flexShrink: 0 }} />}
                          <span style={{
                            fontWeight: 700,
                            color: avail === 0 ? '#dc2626' : isLowStock ? '#ea580c' : 'var(--text-1)',
                          }}>
                            {avail === 0 ? 'Out of stock' : avail}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={e => { e.stopPropagation(); toggleActive(item); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.active ? 'var(--green)' : 'var(--text-3)' }}
                      >
                        {item.active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4 }}>
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => openDeleteConfirm(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showAdd && (
        <Modal title={editItem ? 'Edit Menu Item' : 'Add New Menu Item'} onClose={() => { setShowAdd(false); setEditItem(null); }} maxWidth={600}>
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
              {hasRecipe ? (
                <div style={{ position: 'relative' }}>
                  <input className="inp" type="number" value={recipeCost.toFixed(2)} readOnly disabled
                    style={{ background: '#f0fdf4', color: 'var(--green)', fontWeight: 700, cursor: 'default' }} />
                  <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 2 }}>
                    Auto-calculated from recipe
                  </div>
                </div>
              ) : (
                <input className="inp" type="number" min="0" step="0.10" value={form.cost}
                  onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
              )}
            </FormRow>
          </div>

          {Number(form.price) > 0 && (hasRecipe ? recipeCost > 0 : Number(form.cost) > 0) && (
            <div style={{ background: 'var(--green-light)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 14, fontSize: 13 }}>
              <TrendingUp size={13} style={{ marginRight: 6, color: 'var(--green)' }} />
              Estimated margin: <strong style={{ color: 'var(--green)' }}>
                {(((Number(form.price) - (hasRecipe ? recipeCost : Number(form.cost))) / Number(form.price)) * 100).toFixed(1)}%
              </strong>
            </div>
          )}

          {/* ── Recipe / Ingredients Section ──────────────────────────────────── */}
          <div style={{
            border: '1.5px solid var(--border)', borderRadius: 'var(--radius)',
            padding: '14px 14px 10px', marginBottom: 14, background: '#fafbfc',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Package size={15} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Recipe / Ingredients</span>
                {form.recipe.length > 0 && (
                  <span style={{
                    background: 'var(--primary)', color: '#fff', borderRadius: '50%',
                    padding: '0 6px', fontSize: 10, fontWeight: 700, lineHeight: '18px',
                  }}>
                    {form.recipe.length}
                  </span>
                )}
              </div>
              <button
                className="btn btn-sm"
                style={{ background: 'var(--primary-light)', color: 'var(--primary)', border: '1.5px solid var(--primary)', fontSize: 12 }}
                onClick={() => setShowIngredientPicker(true)}
              >
                <Plus size={12} /> Add Ingredient
              </button>
            </div>

            {form.recipe.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 8px', color: 'var(--text-3)', fontSize: 12 }}>
                <Link2 size={20} style={{ marginBottom: 6, opacity: 0.4 }} /><br />
                No ingredients linked yet.<br />
                Link inventory items to auto-calculate cost and track stock.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  <div style={{ flex: 1 }}>Ingredient</div>
                  <div style={{ width: 70, textAlign: 'center' }}>Qty</div>
                  <div style={{ width: 60, textAlign: 'center' }}>Unit</div>
                  <div style={{ width: 60, textAlign: 'right' }}>Cost</div>
                  <div style={{ width: 22 }} />
                </div>

                {form.recipe.map((ing, idx) => (
                  <RecipeIngredientRow
                    key={ing.inventoryItemId}
                    ingredient={ing}
                    inventoryItems={inventoryDocs}
                    onUpdate={updated => updateIngredient(idx, updated)}
                    onRemove={() => removeIngredient(idx)}
                  />
                ))}

                {/* Total cost row */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 10px', borderTop: '1.5px solid var(--border)', marginTop: 4,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>Total Recipe Cost</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>RM{recipeCost.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Ingredient Picker Dropdown */}
          {showIngredientPicker && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1001,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} onClick={() => { setShowIngredientPicker(false); setIngredientSearch(''); }}>
              <div style={{
                background: '#fff', borderRadius: 'var(--radius)', padding: 16,
                width: 360, maxHeight: 420, display: 'flex', flexDirection: 'column',
                boxShadow: 'var(--shadow-lg)',
              }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Select Inventory Item</div>
                <input
                  className="inp"
                  placeholder="Search inventory…"
                  value={ingredientSearch}
                  onChange={e => setIngredientSearch(e.target.value)}
                  autoFocus
                  style={{ marginBottom: 10 }}
                />
                <div style={{ flex: 1, overflowY: 'auto', maxHeight: 280 }}>
                  {filteredInventory.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-3)', fontSize: 12 }}>
                      No inventory items found.
                    </div>
                  ) : filteredInventory.map(inv => (
                    <div
                      key={inv.id}
                      onClick={() => addIngredient(inv)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 12px', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                        transition: 'background .1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-light)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{inv.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {inv.categoryId} · RM{(inv.standardCost ?? 0).toFixed(2)}/{inv.uomCode ?? 'unit'}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
                        {inv.stock ?? 0} {inv.uomCode ?? ''}
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn btn-ghost" style={{ marginTop: 8, justifyContent: 'center' }}
                  onClick={() => { setShowIngredientPicker(false); setIngredientSearch(''); }}>
                  Cancel
                </button>
              </div>
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

      {/* ── Menu Item Detail Modal ── */}
      {selectedItem && !showAdd && !showDeleteConfirm && (() => {
        const avail = availableQtyMap[selectedItem.id];
        const hasRecipeLink = selectedItem.recipe && selectedItem.recipe.length > 0;
        const isLowStock = hasRecipeLink && avail !== Infinity && avail <= 5;
        const currentItemCost = getItemCost(selectedItem);
        const profitRM = (selectedItem.price - currentItemCost);
        const marginPct = selectedItem.price > 0 ? ((profitRM / selectedItem.price) * 100).toFixed(1) : '0.0';

        return (
          <Modal title={selectedItem.name} onClose={() => setSelectedItem(null)} maxWidth={620}>
            {/* Header / Image + Key info banner */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, padding: '12px 14px', background: '#fafbfc', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <ItemImage item={selectedItem} size={64} radius={10} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 600 }}>
                    {selectedItem.category || 'General'}
                  </span>
                  <span className={`badge ${selectedItem.active ? 'badge-green' : 'badge-gray'}`}>
                    {selectedItem.active ? 'Active on POS' : 'Hidden from POS'}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  Availability:{' '}
                  {hasRecipeLink ? (
                    <strong style={{ color: avail === 0 ? '#dc2626' : isLowStock ? '#ea580c' : 'var(--text-1)' }}>
                      {avail === 0 ? 'Out of stock' : `${avail} portions can be made`}
                    </strong>
                  ) : (
                    <span>Direct item (no recipe attached)</span>
                  )}
                </div>
              </div>
            </div>

            {/* Financial metrics row */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              <div style={{ background: 'var(--main-bg)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Selling Price</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>
                  RM{selectedItem.price.toFixed(2)}
                </div>
              </div>
              <div style={{ background: 'var(--main-bg)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>
                  Cost Price
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>
                  RM{currentItemCost.toFixed(2)}
                </div>
              </div>
              <div style={{ background: parseFloat(marginPct) > 60 ? 'var(--green-light)' : '#fff7ed', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: parseFloat(marginPct) > 60 ? 'var(--green)' : '#ea580c', marginBottom: 2 }}>
                  Profit Margin
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: parseFloat(marginPct) > 60 ? 'var(--green)' : '#ea580c' }}>
                  {marginPct}% <span style={{ fontSize: 12, fontWeight: 600 }}> (+RM{profitRM.toFixed(2)})</span>
                </div>
              </div>
            </div>

            {/* Recipe Ingredients Breakdown */}
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Package size={14} style={{ color: 'var(--primary)' }} />
              Recipe & Ingredients Breakdown ({selectedItem.recipe?.length || 0})
            </div>

            {(!selectedItem.recipe || selectedItem.recipe.length === 0) ? (
              <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '20px 0', textAlign: 'center', background: '#fafafa', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
                No recipe ingredients linked to this menu item yet.<br />
                <span style={{ fontSize: 12 }}>Click "Edit Item" to link ingredients from inventory.</span>
              </div>
            ) : (
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
                <table className="data-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Ingredient</th>
                      <th style={{ textAlign: 'center' }}>Portion Needed</th>
                      <th style={{ textAlign: 'center' }}>In Stock</th>
                      <th style={{ textAlign: 'right' }}>Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItem.recipe.map(ing => {
                      const invItem = inventoryDocs.find(i => i.id === ing.inventoryItemId);
                      const qtyInBase = convertToBaseUnit(ing.qtyPerUnit, ing.unit);
                      const unitCost = invItem?.standardCost ?? 0;
                      const lineCost = qtyInBase * unitCost;
                      const currentStock = invItem ? `${invItem.stock} ${invItem.uomCode ?? ''}` : 'Not found';

                      return (
                        <tr key={ing.inventoryItemId}>
                          <td style={{ fontWeight: 600 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Link2 size={12} style={{ color: 'var(--primary)' }} />
                              {ing.inventoryItemName || invItem?.name || ing.inventoryItemId}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>
                            {ing.qtyPerUnit} {ing.unit}
                          </td>
                          <td style={{ textAlign: 'center', color: 'var(--text-2)' }}>
                            {currentStock}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            RM{lineCost.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Actions footer */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <button className="btn btn-outline" onClick={() => setSelectedItem(null)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const it = selectedItem;
                  setSelectedItem(null);
                  openEdit(it);
                }}
              >
                <Edit2 size={13} /> Edit Menu Item
              </button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
