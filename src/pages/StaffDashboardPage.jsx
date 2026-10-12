import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Package, Truck, Flame, PackageOpen, MoreHorizontal,
  CalendarDays, Save, Send, ChevronDown, ChevronRight,
  Loader, CheckCircle2, AlertCircle, Clock, ArrowRight,
  ArrowLeft, ClipboardList, FileDown, History,
} from 'lucide-react';
import { dailyInventoryService } from '../services/firestoreService';
import {
  CATEGORIES,
  CATEGORY_PRODUCTS,
  buildEmptyDayData,
} from '../data/dailyInventoryTemplate';
import { useAuth } from '../context/AuthContext';
import { getFriedAndSoldQuantities } from '../utils/dailyFlowCalculator';

// ── Helpers ─────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function formatDateDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-MY', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const CATEGORY_ICONS = {
  raw_materials: Package,
  brought_to_stall: Truck,
  remaining_fried: Flame,
  remaining_unfried: PackageOpen,
  other_remaining: MoreHorizontal,
};

// ── Stat card for the top summary ────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon, color, sub, loading }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
      padding: '16px 18px', flex: 1, minWidth: 140,
      boxShadow: 'var(--shadow-sm)', transition: 'transform 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: color, flexShrink: 0,
        }}>
          <Icon size={17} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.1 }}>
        {loading ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Category accordion section ──────────────────────────────────────────────

function CategorySection({ category, products, values, onChange, isOpen, onToggle, isSubmitted }) {
  const CatIcon = CATEGORY_ICONS[category.key] || Package;
  const filledCount = products.filter(p => (values[p.key] ?? 0) > 0).length;

  return (
    <div style={{
      background: '#fff', borderRadius: 'var(--radius)',
      border: `1.5px solid ${isOpen ? category.color + '60' : 'var(--border)'}`,
      boxShadow: isOpen ? `0 0 0 3px ${category.color}12` : 'var(--shadow-sm)',
      transition: 'all 0.2s ease', overflow: 'hidden', marginBottom: 12,
    }}>
      {/* Header */}
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
          padding: '16px 18px', border: 'none', background: 'transparent',
          cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: category.color + '15', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: category.color, flexShrink: 0,
          transition: 'transform 0.2s',
          transform: isOpen ? 'scale(1.05)' : 'scale(1)',
        }}>
          <CatIcon size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{category.label}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
              background: filledCount > 0 ? category.color + '15' : '#f4f4f5',
              color: filledCount > 0 ? category.color : 'var(--text-3)',
            }}>
              {filledCount}/{products.length}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{category.description}</div>
        </div>
        <div style={{
          color: 'var(--text-3)', transition: 'transform 0.2s',
          transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>
          <ChevronRight size={18} />
        </div>
      </button>

      {/* Product rows */}
      {isOpen && (
        <div style={{
          padding: '0 18px 16px', borderTop: '1px solid var(--border-soft)',
          animation: 'fadeIn 0.15s ease',
        }}>
          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 80px',
            gap: 8, padding: '12px 0 8px',
            fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
            textTransform: 'uppercase', color: 'var(--text-3)',
          }}>
            <div>Product</div>
            <div style={{ textAlign: 'center' }}>UoM</div>
            <div style={{ textAlign: 'right' }}>Qty</div>
          </div>

          {products.map((prod, idx) => (
            <div
              key={prod.key}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 80px',
                gap: 8, alignItems: 'center',
                padding: '10px 0',
                borderBottom: idx < products.length - 1 ? '1px solid var(--border-soft)' : 'none',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>
                {prod.label}
              </div>
              <div style={{
                textAlign: 'center', fontSize: 11, fontWeight: 600,
                color: 'var(--text-3)', background: '#f4f4f5',
                borderRadius: 6, padding: '4px 0',
              }}>
                {prod.uomLabel}
              </div>
              <div>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={values[prod.key] ?? ''}
                  onChange={e => onChange(prod.key, e.target.value === '' ? 0 : parseFloat(e.target.value))}
                  disabled={isSubmitted}
                  placeholder="0"
                  style={{
                    width: '100%', padding: '7px 8px', border: '1.5px solid var(--border)',
                    borderRadius: 8, fontSize: 13, fontWeight: 600,
                    textAlign: 'right', fontFamily: 'var(--font)',
                    color: 'var(--text-1)', background: isSubmitted ? '#fafafa' : '#fff',
                    outline: 'none', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { if (!isSubmitted) e.target.style.borderColor = category.color; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recent entries sidebar widget ───────────────────────────────────────────

function RecentEntries({ entries, currentDate, onSelect, loading }) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)' }}>
        <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
      padding: '16px 18px', boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <History size={15} style={{ color: 'var(--text-3)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Recent Entries</span>
      </div>

      {entries.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>
          No entries yet. Start by filling in today's data.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {entries.slice(0, 7).map(entry => {
            const isActive = entry.date === currentDate;
            const dateObj = new Date(entry.date + 'T00:00:00');
            const dayLabel = dateObj.toLocaleDateString('en-MY', { weekday: 'short', month: 'short', day: 'numeric' });

            return (
              <button
                key={entry.date}
                onClick={() => onSelect(entry.date)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 12px', borderRadius: 8, border: 'none',
                  background: isActive ? 'var(--primary-light)' : 'transparent',
                  cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f4f4f5'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{
                  fontSize: 13, fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--primary)' : 'var(--text-2)',
                }}>
                  {dayLabel}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                  background: entry.status === 'submitted' ? 'var(--green-light)' : 'var(--amber-light)',
                  color: entry.status === 'submitted' ? '#15803d' : '#b45309',
                }}>
                  {entry.status === 'submitted' ? 'Submitted' : 'Draft'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard Page ─────────────────────────────────────────────────────

export default function StaffDashboardPage({ isMobile }) {
  const { profile } = useAuth();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [formData, setFormData] = useState(buildEmptyDayData());
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('draft');       // 'draft' | 'submitted'
  const [openCategories, setOpenCategories] = useState({ raw_materials: true });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);         // { type, text }
  const [loading, setLoading] = useState(true);
  const [recentEntries, setRecentEntries] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [prevDayData, setPrevDayData] = useState(null); // for carry-forward

  const isToday = selectedDate === todayStr();
  const isSubmitted = status === 'submitted';

  // ─── Load recent entries ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const recent = await dailyInventoryService.getRecent(14);
        if (!cancelled) setRecentEntries(recent);
      } catch (err) {
        console.error('[Dashboard] recent entries error:', err);
      } finally {
        if (!cancelled) setRecentLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [saveMsg]); // refresh after save

  // ─── Load data for selected date ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const doc = await dailyInventoryService.getByDate(selectedDate);
        if (!cancelled) {
          if (doc && doc.data) {
            // Merge loaded data with template to ensure all keys exist
            const merged = buildEmptyDayData();
            for (const catKey of Object.keys(merged)) {
              if (doc.data[catKey]) {
                for (const prodKey of Object.keys(merged[catKey])) {
                  if (doc.data[catKey][prodKey] != null) {
                    merged[catKey][prodKey] = doc.data[catKey][prodKey];
                  }
                }
              }
            }
            setFormData(merged);
            setNotes(doc.notes || '');
            setStatus(doc.status || 'draft');
          } else {
            setFormData(buildEmptyDayData());
            setNotes('');
            setStatus('draft');
          }
        }
      } catch (err) {
        console.error('[Dashboard] load error:', err);
        if (!cancelled) {
          setFormData(buildEmptyDayData());
          setNotes('');
          setStatus('draft');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDate]);

  // ─── Load previous day data for carry-forward ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prevDate = shiftDate(selectedDate, -1);
        const doc = await dailyInventoryService.getByDate(prevDate);
        if (!cancelled) {
          setPrevDayData(doc?.data || null);
        }
      } catch (err) {
        console.error('[Dashboard] prev day load error:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDate]);

  // ─── Update a single product value ──────────────────────────────────────
  const handleChange = useCallback((categoryKey, productKey, value) => {
    setFormData(prev => ({
      ...prev,
      [categoryKey]: {
        ...prev[categoryKey],
        [productKey]: value,
      },
    }));
  }, []);

  // ─── Toggle category accordion ──────────────────────────────────────────
  const toggleCategory = useCallback((catKey) => {
    setOpenCategories(prev => ({ ...prev, [catKey]: !prev[catKey] }));
  }, []);

  // ─── Save as draft ──────────────────────────────────────────────────────
  const handleSave = useCallback(async (finalSubmit = false) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const staffName = profile?.name || profile?.username || 'Unknown';
      await dailyInventoryService.save(
        selectedDate,
        formData,
        staffName,
        finalSubmit ? 'submitted' : 'draft',
        notes,
      );
      if (finalSubmit) setStatus('submitted');
      setSaveMsg({ type: 'success', text: finalSubmit ? 'Submitted successfully!' : 'Draft saved!' });
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      console.error('[Dashboard] save error:', err);
      setSaveMsg({ type: 'error', text: `Save failed: ${err.message}` });
    } finally {
      setSaving(false);
    }
  }, [selectedDate, formData, notes, profile]);

  // ─── Carry forward from yesterday ──────────────────────────────────────
  const handleCarryForward = useCallback(() => {
    if (!prevDayData) return;
    setFormData(prev => {
      const next = { ...prev };
      // Carry forward: remaining_unfried from yesterday becomes part of raw_materials today
      if (prevDayData.remaining_unfried) {
        const rawMaterials = { ...next.raw_materials };
        // Map common keys
        for (const key of Object.keys(prevDayData.remaining_unfried)) {
          if (rawMaterials[key] != null) {
            rawMaterials[key] = prevDayData.remaining_unfried[key];
          }
        }
        next.raw_materials = rawMaterials;
      }
      return next;
    });
    setSaveMsg({ type: 'success', text: 'Carried forward from previous day!' });
    setTimeout(() => setSaveMsg(null), 3000);
  }, [prevDayData]);

  // ─── Summary computations ──────────────────────────────────────────────
  const summaryStats = useMemo(() => {
    const rawTotal = Object.values(formData.raw_materials || {}).reduce((s, v) => s + (v || 0), 0);
    const stallTotal = Object.values(formData.brought_to_stall || {}).reduce((s, v) => s + (v || 0), 0);
    const friedTotal = Object.values(formData.remaining_fried || {}).reduce((s, v) => s + (v || 0), 0);
    const unfriedTotal = Object.values(formData.remaining_unfried || {}).reduce((s, v) => s + (v || 0), 0);
    const otherTotal = Object.values(formData.other_remaining || {}).reduce((s, v) => s + (v || 0), 0);

    return { rawTotal, stallTotal, friedTotal, unfriedTotal, otherTotal };
  }, [formData]);

  // ─── Fried / Sold reconciliation (Excel ProductInventory logic) ────────
  const friedAndSold = useMemo(
    () => getFriedAndSoldQuantities(formData),
    [formData]
  );
  const chickenSoldToday = friedAndSold.sold.chicken_pcs || 0;
  const carcassSoldToday = friedAndSold.sold.carcass_pcs || 0;

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ──── Date Navigation & Status ──── */}
      <div style={{
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 20,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#fff', borderRadius: 'var(--radius)',
          border: '1px solid var(--border)', padding: '6px 8px',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <button
            onClick={() => setSelectedDate(d => shiftDate(d, -1))}
            className="btn btn-ghost btn-sm"
            style={{ padding: '6px 8px' }}
          >
            <ArrowLeft size={16} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
            <CalendarDays size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              max={todayStr()}
              style={{
                border: 'none', background: 'transparent', fontFamily: 'var(--font)',
                fontSize: 14, fontWeight: 600, color: 'var(--text-1)', cursor: 'pointer',
                outline: 'none', width: isMobile ? 140 : 'auto',
              }}
            />
          </div>

          <button
            onClick={() => { if (selectedDate < todayStr()) setSelectedDate(d => shiftDate(d, 1)); }}
            className="btn btn-ghost btn-sm"
            style={{ padding: '6px 8px', opacity: selectedDate >= todayStr() ? 0.3 : 1 }}
            disabled={selectedDate >= todayStr()}
          >
            <ArrowRight size={16} />
          </button>

          {!isToday && (
            <button
              onClick={() => setSelectedDate(todayStr())}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}
            >
              Today
            </button>
          )}
        </div>

        {/* Status badge + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 99,
            background: isSubmitted ? 'var(--green-light)' : 'var(--amber-light)',
            color: isSubmitted ? '#15803d' : '#b45309',
          }}>
            {isSubmitted ? <CheckCircle2 size={13} /> : <Clock size={13} />}
            {isSubmitted ? 'Submitted' : 'Draft'}
          </div>

          {prevDayData && !isSubmitted && (
            <button
              onClick={handleCarryForward}
              className="btn btn-outline btn-sm"
              style={{ fontSize: 12, gap: 4 }}
            >
              <ArrowRight size={13} /> Carry Forward
            </button>
          )}
        </div>
      </div>

      {/* ──── Date display ──── */}
      <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, color: 'var(--text-2)', marginBottom: 16 }}>
        <ClipboardList size={16} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--primary)' }} />
        {formatDateDisplay(selectedDate)}
      </div>

      {/* ──── Summary Cards ──── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(7, 1fr)',
        gap: 10, marginBottom: 20,
      }}>
        <SummaryCard
          label="Raw Materials" value={summaryStats.rawTotal.toFixed(1)} icon={Package}
          color="#3b82f6" sub="Items logged" loading={loading}
        />
        <SummaryCard
          label="To Stall" value={summaryStats.stallTotal.toFixed(1)} icon={Truck}
          color="#8b5cf6" sub="Items taken" loading={loading}
        />
        <SummaryCard
          label="Left Fried" value={summaryStats.friedTotal.toFixed(1)} icon={Flame}
          color="#ef4444" sub="Unsold" loading={loading}
        />
        <SummaryCard
          label="Left Unfried" value={summaryStats.unfriedTotal.toFixed(1)} icon={PackageOpen}
          color="#f59e0b" sub="Carry over" loading={loading}
        />
        <SummaryCard
          label="Chicken Sold" value={chickenSoldToday.toFixed(1)} icon={CheckCircle2}
          color="#16a34a" sub="Pcs today" loading={loading}
        />
        <SummaryCard
          label="Carcass Sold" value={carcassSoldToday.toFixed(1)} icon={CheckCircle2}
          color="#16a34a" sub="Pcs today" loading={loading}
        />
        <SummaryCard
          label="Other Left" value={summaryStats.otherTotal.toFixed(1)} icon={MoreHorizontal}
          color="#10b981" sub="Sides & sauces" loading={loading}
        />
      </div>

      {/* ──── Main content grid ──── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 260px',
        gap: 16,
      }}>
        {/* Left: Category forms */}
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)' }}>
              <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} />
              <div style={{ marginTop: 8, fontSize: 13 }}>Loading inventory data…</div>
            </div>
          ) : (
            <>
              {CATEGORIES.map(cat => (
                <CategorySection
                  key={cat.key}
                  category={cat}
                  products={CATEGORY_PRODUCTS[cat.key]}
                  values={formData[cat.key] || {}}
                  onChange={(prodKey, val) => handleChange(cat.key, prodKey, val)}
                  isOpen={!!openCategories[cat.key]}
                  onToggle={() => toggleCategory(cat.key)}
                  isSubmitted={isSubmitted}
                />
              ))}

              {/* Notes */}
              <div style={{
                background: '#fff', borderRadius: 'var(--radius)',
                border: '1px solid var(--border)', padding: '16px 18px',
                boxShadow: 'var(--shadow-sm)', marginBottom: 16,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>
                  Daily Notes (Optional)
                </div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  disabled={isSubmitted}
                  placeholder="Any special notes for today (e.g. weather impact, supplier issues, equipment problems…)"
                  rows={3}
                  className="inp"
                  style={{
                    resize: 'vertical', fontSize: 13, lineHeight: 1.5,
                    background: isSubmitted ? '#fafafa' : '#fff',
                  }}
                />
              </div>

              {/* Action buttons */}
              <div style={{
                display: 'flex', gap: 10,
                justifyContent: 'flex-end', flexWrap: 'wrap',
                position: 'sticky', bottom: 0,
                background: 'linear-gradient(to top, var(--main-bg) 60%, transparent)',
                padding: '16px 0 8px',
              }}>
                {/* Save message */}
                {saveMsg && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 12, fontWeight: 600, padding: '8px 14px',
                    borderRadius: 8,
                    background: saveMsg.type === 'success' ? 'var(--green-light)' : 'var(--red-soft)',
                    color: saveMsg.type === 'success' ? '#15803d' : '#dc2626',
                    animation: 'fadeIn 0.2s ease',
                  }}>
                    {saveMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {saveMsg.text}
                  </div>
                )}

                {!isSubmitted && (
                  <>
                    <button
                      className="btn btn-outline"
                      onClick={() => handleSave(false)}
                      disabled={saving}
                      style={{ gap: 6 }}
                    >
                      {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                      Save Draft
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        if (window.confirm('Submit this day\'s inventory? You won\'t be able to edit after submission.')) {
                          handleSave(true);
                        }
                      }}
                      disabled={saving}
                      style={{ gap: 6 }}
                    >
                      {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                      Submit
                    </button>
                  </>
                )}

                {isSubmitted && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 12, fontWeight: 600, color: '#15803d',
                    padding: '8px 14px', borderRadius: 8,
                    background: 'var(--green-light)',
                  }}>
                    <CheckCircle2 size={14} />
                    This entry has been submitted and locked.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: Recent entries */}
        {!isMobile && (
          <div>
            <RecentEntries
              entries={recentEntries}
              currentDate={selectedDate}
              onSelect={setSelectedDate}
              loading={recentLoading}
            />
          </div>
        )}
      </div>
    </div>
  );
}