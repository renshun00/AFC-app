import React, { useState } from 'react';
import { Plus, Minus, Trash2, Printer, ShoppingBag, Search, Tag, ToggleLeft, ToggleRight, Banknote, QrCode, CheckCircle } from 'lucide-react';
import { menuItems, posOrders } from '../data/placeholder';
import { Modal } from '../components/Layout';

const CATEGORIES = ['All', 'Combo', 'Chicken', 'Sides', 'Drinks', 'Sauce'];

// ── TnG QR placeholder (base64 simple QR-like SVG) ──────────────────────────
const TNG_QR_SVG = (amount) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" width="200" height="220">
  <rect width="200" height="220" fill="#fff" rx="12"/>
  <!-- TnG header -->
  <rect width="200" height="44" fill="#FF6600" rx="12"/>
  <rect y="32" width="200" height="12" fill="#FF6600"/>
  <text x="100" y="28" text-anchor="middle" font-family="Arial" font-weight="700" font-size="15" fill="#fff">Touch 'n Go eWallet</text>
  <!-- QR body (simplified pattern) -->
  <rect x="20" y="54" width="160" height="120" fill="#f9f9f9" rx="6" stroke="#eee" stroke-width="1"/>
  <!-- corner squares -->
  <rect x="28" y="62" width="30" height="30" rx="3" fill="#222"/>
  <rect x="31" y="65" width="24" height="24" rx="2" fill="#fff"/>
  <rect x="34" y="68" width="18" height="18" rx="1" fill="#222"/>
  <rect x="142" y="62" width="30" height="30" rx="3" fill="#222"/>
  <rect x="145" y="65" width="24" height="24" rx="2" fill="#fff"/>
  <rect x="148" y="68" width="18" height="18" rx="1" fill="#222"/>
  <rect x="28" y="132" width="30" height="30" rx="3" fill="#222"/>
  <rect x="31" y="135" width="24" height="24" rx="2" fill="#fff"/>
  <rect x="34" y="138" width="18" height="18" rx="1" fill="#222"/>
  <!-- data dots -->
  <rect x="72" y="62" width="6" height="6" fill="#222"/><rect x="82" y="62" width="6" height="6" fill="#222"/>
  <rect x="92" y="62" width="6" height="6" fill="#222"/><rect x="112" y="62" width="6" height="6" fill="#222"/>
  <rect x="122" y="62" width="6" height="6" fill="#222"/><rect x="72" y="72" width="6" height="6" fill="#222"/>
  <rect x="92" y="72" width="6" height="6" fill="#222"/><rect x="102" y="72" width="6" height="6" fill="#222"/>
  <rect x="122" y="72" width="6" height="6" fill="#222"/><rect x="72" y="82" width="6" height="6" fill="#222"/>
  <rect x="82" y="82" width="6" height="6" fill="#222"/><rect x="102" y="82" width="6" height="6" fill="#222"/>
  <rect x="112" y="82" width="6" height="6" fill="#222"/><rect x="72" y="92" width="6" height="6" fill="#222"/>
  <rect x="92" y="92" width="6" height="6" fill="#222"/><rect x="122" y="92" width="6" height="6" fill="#222"/>
  <rect x="72" y="102" width="6" height="6" fill="#222"/><rect x="82" y="102" width="6" height="6" fill="#222"/>
  <rect x="112" y="102" width="6" height="6" fill="#222"/><rect x="92" y="112" width="6" height="6" fill="#222"/>
  <rect x="102" y="112" width="6" height="6" fill="#222"/><rect x="122" y="112" width="6" height="6" fill="#222"/>
  <rect x="72" y="122" width="6" height="6" fill="#222"/><rect x="102" y="122" width="6" height="6" fill="#222"/>
  <rect x="112" y="122" width="6" height="6" fill="#222"/><rect x="72" y="132" width="6" height="6" fill="#222"/>
  <rect x="82" y="132" width="6" height="6" fill="#222"/><rect x="92" y="132" width="6" height="6" fill="#222"/>
  <rect x="112" y="142" width="6" height="6" fill="#222"/><rect x="122" y="142" width="6" height="6" fill="#222"/>
  <rect x="142" y="102" width="6" height="6" fill="#222"/><rect x="152" y="102" width="6" height="6" fill="#222"/>
  <rect x="142" y="112" width="6" height="6" fill="#222"/><rect x="152" y="122" width="6" height="6" fill="#222"/>
  <rect x="142" y="132" width="6" height="6" fill="#222"/><rect x="152" y="142" width="6" height="6" fill="#222"/>
  <!-- amount -->
  <text x="100" y="194" text-anchor="middle" font-family="Arial" font-weight="700" font-size="14" fill="#FF6600">RM ${amount}</text>
  <text x="100" y="212" text-anchor="middle" font-family="Arial" font-size="10" fill="#aaa">Scan to pay · AFC Main Branch</text>
</svg>`;

export default function POSPage({ isMobile }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [currentOrders, setCurrentOrders] = useState(posOrders);

  // Discount state
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] = useState('percentage'); // 'percentage' | 'fixed'
  const [discountValue, setDiscountValue] = useState('');

  // Payment flow state:
  // null → 'method' (choose Cash/TnG) → 'cash' → 'tng' → 'done'
  const [payStep, setPayStep] = useState(null);
  const [cashTendered, setCashTendered] = useState('');

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

  // Discount calculation
  const discountAmt = (() => {
    if (!discountEnabled || !discountValue || isNaN(Number(discountValue))) return 0;
    const v = Number(discountValue);
    if (discountType === 'percentage') return Math.min(subtotal, subtotal * (v / 100));
    return Math.min(subtotal, v);
  })();

  const afterDiscount = subtotal - discountAmt;

  // ── SST disabled for now — keeping variables so it's easy to re-enable ──
  // const SST_RATE = 0.06;
  // const tax = afterDiscount * SST_RATE;
  const tax = 0; // SST disabled
  // ─────────────────────────────────────────────────────────────────────────

  const grandTotal = afterDiscount + tax;

  const resetPayment = () => {
    setPayStep(null);
    setCashTendered('');
  };

  const confirmOrder = () => {
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
    resetPayment();
  };

  const cashChange = cashTendered ? Math.max(0, Number(cashTendered) - grandTotal) : 0;
  const cashValid  = Number(cashTendered) >= grandTotal;

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

          {/* Discount toggle */}
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
              <span style={{ fontSize: 13, fontWeight: 600, color: discountEnabled ? '#ea580c' : 'var(--text-2)' }}>Apply Discount</span>
            </div>
            {discountEnabled ? <ToggleRight size={22} style={{ color: '#ea580c' }} /> : <ToggleLeft size={22} style={{ color: 'var(--text-3)' }} />}
          </div>

          {/* Discount inputs */}
          {discountEnabled && (
            <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {[{ key: 'percentage', label: '% Percentage' }, { key: 'fixed', label: 'RM Fixed Amount' }].map(opt => (
                  <button key={opt.key} onClick={() => { setDiscountType(opt.key); setDiscountValue(''); }}
                    style={{ flex: 1, padding: '7px', borderRadius: 'var(--radius-sm)', border: `1.5px solid ${discountType === opt.key ? '#ea580c' : 'var(--border)'}`, background: discountType === opt.key ? '#ea580c' : '#fff', color: discountType === opt.key ? '#fff' : 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 700, color: '#ea580c' }}>
                  {discountType === 'percentage' ? '%' : 'RM'}
                </span>
                <input className="inp" type="number" min="0" max={discountType === 'percentage' ? 100 : undefined} step="0.01"
                  placeholder={discountType === 'percentage' ? 'e.g. 10' : 'e.g. 5.00'}
                  value={discountValue} onChange={e => setDiscountValue(e.target.value)}
                  style={{ paddingLeft: 32, borderColor: '#fed7aa' }} onClick={e => e.stopPropagation()} />
              </div>
              {discountAmt > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#ea580c', fontWeight: 600, textAlign: 'right' }}>
                  Saving: −RM{discountAmt.toFixed(2)}{discountType === 'percentage' && ` (${discountValue}% off)`}
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
              <span>Discount {discountType === 'percentage' ? `(${discountValue}%)` : '(Fixed)'}</span>
              <span>−RM{discountAmt.toFixed(2)}</span>
            </div>
          )}
          {/* SST row — disabled for now, re-enable by uncommenting below and setting tax = afterDiscount * 0.06 above */}
          {/* <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13, color: 'var(--text-2)' }}>
            <span>SST (6%)</span><span>RM{tax.toFixed(2)}</span>
          </div> */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontSize: 16, fontWeight: 700, borderTop: '2px solid var(--border)', paddingTop: 10 }}>
            <span>Total</span><span style={{ color: 'var(--primary)' }}>RM{grandTotal.toFixed(2)}</span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => { setCart([]); setDiscountEnabled(false); setDiscountValue(''); }}>Clear</button>
            <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }}
              onClick={() => { if (cart.length) setPayStep('method'); }}>
              Pay RM{grandTotal.toFixed(2)}
            </button>
          </div>
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8, fontSize: 12 }} onClick={confirmOrder}>
            + Save as New Order
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ── PAYMENT MODALS ──
          Step 1: Choose method (Cash or TnG)
          Step 2a: Cash — enter amount, show change
          Step 2b: TnG  — show QR code
          Step 3: Done confirmation
      ══════════════════════════════════════════════════════════════════════ */}

      {/* Step 1 — Choose payment method */}
      {payStep === 'method' && (
        <Modal title="Select Payment Method" onClose={resetPayment} maxWidth={380}>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20, textAlign: 'center' }}>
            Total to collect: <strong style={{ fontSize: 18, color: 'var(--text-1)' }}>RM{grandTotal.toFixed(2)}</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Cash */}
            <button onClick={() => { setCashTendered(''); setPayStep('cash'); }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                padding: '24px 16px', borderRadius: 'var(--radius)',
                border: '2px solid var(--border)', background: '#fafafa',
                cursor: 'pointer', transition: 'all .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#16a34a'; e.currentTarget.style.background = '#f0fdf4'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '#fafafa'; }}
            >
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Banknote size={26} style={{ color: '#16a34a' }} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Cash</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Physical notes & coins</div>
            </button>

            {/* TnG QR */}
            <button onClick={() => setPayStep('tng')}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                padding: '24px 16px', borderRadius: 'var(--radius)',
                border: '2px solid var(--border)', background: '#fafafa',
                cursor: 'pointer', transition: 'all .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#FF6600'; e.currentTarget.style.background = '#fff7ed'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '#fafafa'; }}
            >
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <QrCode size={26} style={{ color: '#FF6600' }} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>TnG eWallet</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Touch 'n Go QR scan</div>
            </button>
          </div>
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={resetPayment}>
            Cancel
          </button>
        </Modal>
      )}

      {/* Step 2a — Cash payment */}
      {payStep === 'cash' && (
        <Modal title="Cash Payment" onClose={resetPayment} maxWidth={360}>
          {/* Amount due */}
          <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#166534', fontWeight: 600, marginBottom: 4 }}>AMOUNT DUE</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#166534' }}>RM{grandTotal.toFixed(2)}</div>
          </div>

          {/* Quick amounts */}
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8 }}>QUICK AMOUNTS</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {[Math.ceil(grandTotal / 5) * 5, Math.ceil(grandTotal / 10) * 10, Math.ceil(grandTotal / 50) * 50, 100].filter((v, i, a) => a.indexOf(v) === i && v >= grandTotal).slice(0, 4).map(amt => (
              <button key={amt} onClick={() => setCashTendered(String(amt))}
                style={{ flex: 1, minWidth: 60, padding: '8px', borderRadius: 'var(--radius-sm)', border: `1.5px solid ${Number(cashTendered) === amt ? '#16a34a' : 'var(--border)'}`, background: Number(cashTendered) === amt ? '#dcfce7' : '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: Number(cashTendered) === amt ? '#166534' : 'var(--text-1)' }}>
                RM{amt}
              </button>
            ))}
          </div>

          {/* Manual input */}
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>CASH TENDERED</div>
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-2)' }}>RM</span>
            <input className="inp" type="number" min="0" step="0.01" placeholder="0.00"
              value={cashTendered} onChange={e => setCashTendered(e.target.value)}
              style={{ paddingLeft: 38, fontSize: 16, fontWeight: 700 }} autoFocus />
          </div>

          {/* Change due */}
          {Number(cashTendered) > 0 && (
            <div style={{
              background: cashValid ? '#f0fdf4' : '#fef2f2',
              border: `1.5px solid ${cashValid ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: cashValid ? '#166534' : '#dc2626' }}>
                {cashValid ? 'Change to return' : 'Insufficient amount'}
              </span>
              {cashValid && <span style={{ fontSize: 20, fontWeight: 700, color: '#166534' }}>RM{cashChange.toFixed(2)}</span>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setPayStep('method')}>← Back</button>
            <button className="btn btn-green" style={{ flex: 2, justifyContent: 'center', opacity: cashValid ? 1 : 0.5 }}
              disabled={!cashValid} onClick={() => setPayStep('done')}>
              <CheckCircle size={15} /> Confirm Payment
            </button>
          </div>
        </Modal>
      )}

      {/* Step 2b — TnG QR */}
      {payStep === 'tng' && (
        <Modal title="Touch 'n Go eWallet" onClose={resetPayment} maxWidth={340}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
              Ask the customer to scan the QR code below to pay <strong>RM{grandTotal.toFixed(2)}</strong>
            </div>
            {/* QR code SVG */}
            <div style={{ display: 'inline-block', borderRadius: 12, overflow: 'hidden', border: '1px solid #eee', marginBottom: 16 }}
              dangerouslySetInnerHTML={{ __html: TNG_QR_SVG(grandTotal.toFixed(2)) }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>
              Waiting for payment confirmation…
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setPayStep('method')}>← Back</button>
              <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} onClick={() => setPayStep('done')}>
                <CheckCircle size={15} /> Payment Received
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Step 3 — Done */}
      {payStep === 'done' && (
        <Modal title="Payment Complete" onClose={confirmOrder} maxWidth={340}>
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle size={38} style={{ color: '#16a34a' }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 6 }}>Payment Successful!</div>
            <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 20 }}>
              RM{grandTotal.toFixed(2)} collected
              {payStep === 'done' && cashTendered && cashChange > 0 && (
                <div style={{ marginTop: 4, color: '#16a34a', fontWeight: 600 }}>Change: RM{cashChange.toFixed(2)}</div>
              )}
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 14 }} onClick={confirmOrder}>
              <Printer size={15} /> Print Receipt & New Order
            </button>
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8, fontSize: 13 }} onClick={confirmOrder}>
              Skip Receipt
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}
