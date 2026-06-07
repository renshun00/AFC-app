import React, { useState } from 'react';
import { Plus, Minus, Trash2, Printer, ShoppingBag, Search, Tag, ToggleLeft, ToggleRight } from 'lucide-react';
import { menuItems, posOrders } from '../data/placeholder';
import { Modal } from '../components/Layout';

const CATEGORIES = ['All', 'Combo', 'Chicken', 'Sides', 'Drinks', 'Sauce'];

export default function POSPage({ isMobile }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [currentOrders, setCurrentOrders] = useState(posOrders);

  // Discount state
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] = useState('percentage'); // 'percentage' | 'fixed'
  const [discountValue, setDiscountValue] = useState('');

  const filtered = menuItems.filter(m =>
    (activeCategory === 'All' || m.category === activeCategory) &&
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const addItem = (item) => {
    setCart(c => {
      const ex = c.find(x => x.id === item.id);
      if (ex) return c.map(x => x.id === item.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { ...item, qty: 1 }];
    });
  };

  const changeQty = (id, delta) => {
    setCart(c => c.map(x => x.id === id ? { ...x, qty: Math.max(0, x.qty + delta) } : x).filter(x => x.qty > 0));
  };

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  // Compute discount amount
  const discountAmt = (() => {
    if (!discountEnabled || !discountValue || isNaN(Number(discountValue))) return 0;
    const v = Number(discountValue);
    if (discountType === 'percentage') return Math.min(subtotal, subtotal * (v / 100));
    return Math.min(subtotal, v);
  })();

  const afterDiscount = subtotal - discountAmt;
  const tax = afterDiscount * 0.06;
  const grandTotal = afterDiscount + tax;

  const placeOrder = () => {
    if (!cart.length) return;
    const newOrder = {
      id: `ORD-00${currentOrders.length + 1}`,
      table: `T${currentOrders.length + 1}`,
      items: cart.reduce((s, i) => s + i.qty, 0),
      total: grandTotal,
      status: 'open',
      time: new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }),
    };
    setCurrentOrders(o => [...o, newOrder]);
    setCart([]);
    setDiscountEnabled(false);
    setDiscountValue('');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: 14, height: isMobile ? 'auto' : 'calc(100vh - 140px)' }}>
      {/* ── Menu Panel ── */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Search & filter */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input className="inp" placeholder="Search menu…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setActiveCategory(c)} className="btn btn-sm"
                style={{ background: activeCategory === c ? 'var(--primary)' : '#f4f4f5', color: activeCategory === c ? '#fff' : 'var(--text-2)', border: 'none', flexShrink: 0 }}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Menu grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
            {filtered.map(item => {
              const inCart = cart.find(x => x.id === item.id);
              return (
                <div key={item.id} onClick={() => addItem(item)}
                  style={{
                    background: inCart ? 'var(--primary-light)' : '#fafafa',
                    border: `1.5px solid ${inCart ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)', padding: '12px 10px', cursor: 'pointer',
                    transition: 'all .12s', position: 'relative',
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  <div style={{ fontSize: 28, marginBottom: 6, textAlign: 'center' }}>{item.img}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3, lineHeight: 1.3 }}>{item.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>RM{item.price.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Stock: {item.stock}</div>
                  {inCart && (
                    <div style={{ position: 'absolute', top: 8, right: 8, background: 'var(--primary)', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                      {inCart.qty}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Current Orders strip */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px', background: '#fafafa' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Current Orders</div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {currentOrders.map(o => (
              <div key={o.id} style={{ flexShrink: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', minWidth: 110 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{o.table}</span>
                  <span className={`badge ${o.status === 'ready' ? 'badge-green' : 'badge-amber'}`}>{o.status}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{o.items} items · RM{o.total.toFixed(2)}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{o.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Order Panel ── */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', maxHeight: isMobile ? 'none' : '100%' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 15 }}>
          Current Order
          <span style={{ marginLeft: 8, background: 'var(--primary)', color: '#fff', borderRadius: '50%', padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
            {cart.reduce((s, i) => s + i.qty, 0)}
          </span>
        </div>

        {/* Cart items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-3)' }}>
              <ShoppingBag size={32} style={{ marginBottom: 8, opacity: .4 }} />
              <div style={{ fontSize: 13 }}>No items added yet.<br />Tap a menu item to add.</div>
            </div>
          ) : cart.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border-soft)' }}>
              <div style={{ fontSize: 20, flexShrink: 0 }}>{item.img}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>RM{(item.price * item.qty).toFixed(2)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button onClick={() => changeQty(item.id, -1)} style={{ width: 24, height: 24, borderRadius: '50%', border: '1.5px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Minus size={11} />
                </button>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{item.qty}</span>
                <button onClick={() => changeQty(item.id, 1)} style={{ width: 24, height: 24, borderRadius: '50%', border: '1.5px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Plus size={11} />
                </button>
                <button onClick={() => setCart(c => c.filter(x => x.id !== item.id))} style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'var(--red-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: 2 }}>
                  <Trash2 size={11} style={{ color: '#dc2626' }} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ── Totals + Discount ── */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>

          {/* Discount toggle row */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px', borderRadius: 'var(--radius-sm)',
            background: discountEnabled ? '#fff7ed' : '#f9f9f9',
            border: `1.5px solid ${discountEnabled ? '#fed7aa' : 'var(--border)'}`,
            marginBottom: 12, cursor: 'pointer',
          }}
            onClick={() => { setDiscountEnabled(e => !e); setDiscountValue(''); }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag size={14} style={{ color: discountEnabled ? '#ea580c' : 'var(--text-3)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: discountEnabled ? '#ea580c' : 'var(--text-2)' }}>
                Apply Discount
              </span>
            </div>
            {discountEnabled
              ? <ToggleRight size={22} style={{ color: '#ea580c' }} />
              : <ToggleLeft size={22} style={{ color: 'var(--text-3)' }} />
            }
          </div>

          {/* Discount inputs — shown only when enabled */}
          {discountEnabled && (
            <div style={{
              background: '#fff7ed', border: '1.5px solid #fed7aa',
              borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: 12,
            }}>
              {/* Type selector */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {[
                  { key: 'percentage', label: '% Percentage' },
                  { key: 'fixed', label: 'RM Fixed Amount' },
                ].map(opt => (
                  <button key={opt.key} onClick={() => { setDiscountType(opt.key); setDiscountValue(''); }}
                    style={{
                      flex: 1, padding: '7px', borderRadius: 'var(--radius-sm)',
                      border: `1.5px solid ${discountType === opt.key ? '#ea580c' : 'var(--border)'}`,
                      background: discountType === opt.key ? '#ea580c' : '#fff',
                      color: discountType === opt.key ? '#fff' : 'var(--text-2)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Value input */}
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 13, fontWeight: 700, color: '#ea580c',
                }}>
                  {discountType === 'percentage' ? '%' : 'RM'}
                </span>
                <input
                  className="inp"
                  type="number"
                  min="0"
                  max={discountType === 'percentage' ? 100 : undefined}
                  step="0.01"
                  placeholder={discountType === 'percentage' ? 'e.g. 10' : 'e.g. 5.00'}
                  value={discountValue}
                  onChange={e => setDiscountValue(e.target.value)}
                  style={{ paddingLeft: 32, borderColor: '#fed7aa' }}
                  onClick={e => e.stopPropagation()}
                />
              </div>

              {/* Live discount preview */}
              {discountAmt > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#ea580c', fontWeight: 600, textAlign: 'right' }}>
                  Saving: −RM{discountAmt.toFixed(2)}
                  {discountType === 'percentage' && ` (${discountValue}% off)`}
                </div>
              )}
            </div>
          )}

          {/* Summary rows */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13, color: 'var(--text-2)' }}>
            <span>Subtotal</span><span>RM{subtotal.toFixed(2)}</span>
          </div>
          {discountEnabled && discountAmt > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13, color: '#ea580c', fontWeight: 600 }}>
              <span>
                Discount {discountType === 'percentage' ? `(${discountValue}%)` : '(Fixed)'}
              </span>
              <span>−RM{discountAmt.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13, color: 'var(--text-2)' }}>
            <span>SST (6%)</span><span>RM{tax.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontSize: 16, fontWeight: 700, borderTop: '2px solid var(--border)', paddingTop: 10 }}>
            <span>Total</span><span style={{ color: 'var(--primary)' }}>RM{grandTotal.toFixed(2)}</span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setCart([]); setDiscountEnabled(false); setDiscountValue(''); }}>Clear</button>
            <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} onClick={() => { if (cart.length) setShowReceipt(true); }}>
              Pay RM{grandTotal.toFixed(2)}
            </button>
          </div>
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8, fontSize: 12 }} onClick={placeOrder}>
            + Save as New Order
          </button>
        </div>
      </div>

      {/* ── Receipt Modal ── */}
      {showReceipt && (
        <Modal title="Order Receipt" onClose={() => setShowReceipt(false)} maxWidth={360}>
          <div style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.8 }}>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <img src="/afc_logo.jpg" alt="AFC" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', marginBottom: 6 }} />
              <div style={{ fontWeight: 700, fontSize: 16 }}>Alang Fried Chicken</div>
              <div style={{ color: 'var(--text-3)', fontSize: 11 }}>AFC – Main Branch</div>
              <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{new Date().toLocaleString('en-MY')}</div>
            </div>
            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 10, marginBottom: 10 }}>
              {cart.map(i => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{i.qty}x {i.name}</span>
                  <span>RM{(i.price * i.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>RM{subtotal.toFixed(2)}</span></div>
              {discountEnabled && discountAmt > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ea580c' }}>
                  <span>Discount {discountType === 'percentage' ? `(${discountValue}%)` : '(Fixed)'}</span>
                  <span>−RM{discountAmt.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>SST 6%</span><span>RM{tax.toFixed(2)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, marginTop: 4 }}><span>TOTAL</span><span>RM{grandTotal.toFixed(2)}</span></div>
            </div>
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: 'var(--text-3)' }}>Thank you for dining with us!</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowReceipt(false)}>Close</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { placeOrder(); setShowReceipt(false); }}>
              <Printer size={14} /> Print & Confirm
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
