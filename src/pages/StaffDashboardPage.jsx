import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Package, Truck, Flame, PackageOpen, MoreHorizontal,
  CalendarDays, Save, Send, ChevronDown, ChevronRight,
  Loader, CheckCircle2, AlertCircle, Clock, ArrowRight,
  ArrowLeft, ClipboardList, FileDown, History,
  LogIn, LogOut, KeyRound, Eye, EyeOff, Lock, Check,
} from 'lucide-react';
import { dailyInventoryService, staffShiftService, staffService } from '../services/firestoreService';
import {
  CATEGORIES,
  CATEGORY_PRODUCTS,
  buildEmptyDayData,
} from '../data/dailyInventoryTemplate';
import { useAuth } from '../context/AuthContext';
import { getFriedAndSoldQuantities } from '../utils/dailyFlowCalculator';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';

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
  const isAdminUser = profile?.role === 'Admin';
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

  // ─── Attendance / Shift State ──────────────────────────────────────────
  const [activeShift, setActiveShift] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [attendanceModal, setAttendanceModal] = useState(null); // 'checkIn' | 'checkOut' | null
  const [verifyPassword, setVerifyPassword] = useState('');
  const [showVerifyPassword, setShowVerifyPassword] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [attendanceMsg, setAttendanceMsg] = useState(null);

  // Load staff member's shift for today
  const loadStaffShift = useCallback(async () => {
    if (!profile?.id) return;
    try {
      setShiftLoading(true);
      // First check if there is an active open shift
      const active = await staffShiftService.getActiveShift(profile.id);
      if (active) {
        setActiveShift(active);
      } else {
        // Check if there is already a completed or past shift today
        const todayShift = await staffShiftService.getTodayShift(profile.id);
        setActiveShift(todayShift);
      }
    } catch (err) {
      console.warn('[StaffDashboardPage] error loading shift:', err);
    } finally {
      setShiftLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadStaffShift();
  }, [loadStaffShift]);

  // Execute Check In / Check Out after password verification
  const handleConfirmAttendance = async (e) => {
    if (e) e.preventDefault();
    if (!verifyPassword) {
      setVerifyError('Please enter your password.');
      return;
    }
    setVerifying(true);
    setVerifyError('');

    try {
      const email = auth.currentUser?.email || profile?.email;
      let authenticated = false;

      // 1. Try Firebase Auth reauthentication / signIn
      if (auth.currentUser && email) {
        try {
          const cred = EmailAuthProvider.credential(email, verifyPassword);
          await reauthenticateWithCredential(auth.currentUser, cred);
          authenticated = true;
        } catch (authErr) {
          try {
            await signInWithEmailAndPassword(auth, email, verifyPassword);
            authenticated = true;
          } catch (innerErr) {
            console.warn('[Auth recheck] standard auth failed, checking Firestore record...');
          }
        }
      }

      // 2. Fallback check against staff record in Firestore (e.g. if created via admin manager)
      if (!authenticated && profile?.id) {
        const staffDoc = await staffService.getById(profile.id);
        if (staffDoc && staffDoc.password && staffDoc.password === verifyPassword) {
          authenticated = true;
        }
      }

      if (!authenticated) {
        setVerifyError('Incorrect password. Please re-enter your account password.');
        setVerifying(false);
        return;
      }

      // Format current time HH:MM
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

      if (attendanceModal === 'checkIn') {
        const shiftId = await staffShiftService.clockIn(profile.id, profile.outletId || 'outlet-1');
        
        // Also update staff profile's checkIn
        await staffService.update(profile.id, { checkIn: timeStr });

        setAttendanceMsg({ type: 'success', text: `Checked in successfully at ${timeStr}!` });
      } else if (attendanceModal === 'checkOut') {
        if (activeShift?.id) {
          await staffShiftService.clockOut(activeShift.id);
        } else {
          // If no open shift doc was tracked, clock in & immediately close
          const newId = await staffShiftService.clockIn(profile.id, profile.outletId || 'outlet-1');
          await staffShiftService.clockOut(newId);
        }

        // Also update staff profile's checkOut
        await staffService.update(profile.id, { checkOut: timeStr });

        setAttendanceMsg({ type: 'success', text: `Checked out successfully at ${timeStr}!` });
      }

      // Refresh shift data
      await loadStaffShift();

      // Reset modal state
      setAttendanceModal(null);
      setVerifyPassword('');
      setShowVerifyPassword(false);
      setTimeout(() => setAttendanceMsg(null), 5000);
    } catch (err) {
      console.error('[Attendance] error:', err);
      setVerifyError('Failed to process: ' + (err.message || 'Unknown error'));
    } finally {
      setVerifying(false);
    }
  };

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
  // Format check in / out times for display
  const clockInDisplay = activeShift?.clockIn?.toDate
    ? activeShift.clockIn.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : (profile?.checkIn || null);
  const clockOutDisplay = activeShift?.clockOut?.toDate
    ? activeShift.clockOut.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;
  const isShiftOpen = activeShift && !activeShift.clockOut;

  return (
    <div>
      {/* ──── Top Staff Attendance (Check In / Check Out) Banner ──── */}
      <div style={{
        background: '#fff',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        padding: '16px 20px',
        marginBottom: 20,
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: isShiftOpen ? 'var(--green-light)' : 'var(--primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isShiftOpen ? '#15803d' : 'var(--primary)',
            flexShrink: 0
          }}>
            <Clock size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
                {profile?.name || 'Staff Member'}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: isShiftOpen ? '#dcfce7' : '#f4f4f5',
                color: isShiftOpen ? '#15803d' : '#71717a'
              }}>
                {isShiftOpen ? '● On Duty' : '○ Not Clocked In'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span>Shift: <strong>{clockInDisplay || 'Not checked in'}</strong> {clockOutDisplay ? `→ ${clockOutDisplay}` : (isShiftOpen ? '→ Active' : '')}</span>
              {isShiftOpen && activeShift?.clockIn?.toDate && (
                <span style={{ color: '#16a34a', fontWeight: 600 }}>
                  (Started {activeShift.clockIn.toDate().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn"
            disabled={isShiftOpen || shiftLoading}
            onClick={() => {
              setAttendanceModal('checkIn');
              setVerifyPassword('');
              setVerifyError('');
              setShowVerifyPassword(false);
            }}
            style={{
              background: isShiftOpen ? '#f4f4f5' : '#16a34a',
              color: isShiftOpen ? '#a1a1aa' : '#fff',
              border: 'none',
              padding: '10px 18px',
              fontWeight: 700,
              fontSize: 13,
              borderRadius: 'var(--radius-sm)',
              cursor: isShiftOpen ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: isShiftOpen ? 'none' : '0 2px 6px rgba(22, 163, 74, 0.25)',
              transition: 'all 0.15s ease',
            }}
          >
            <LogIn size={16} /> Check In
          </button>

          <button
            type="button"
            className="btn"
            disabled={!isShiftOpen || shiftLoading}
            onClick={() => {
              setAttendanceModal('checkOut');
              setVerifyPassword('');
              setVerifyError('');
              setShowVerifyPassword(false);
            }}
            style={{
              background: !isShiftOpen ? '#f4f4f5' : '#dc2626',
              color: !isShiftOpen ? '#a1a1aa' : '#fff',
              border: 'none',
              padding: '10px 18px',
              fontWeight: 700,
              fontSize: 13,
              borderRadius: 'var(--radius-sm)',
              cursor: !isShiftOpen ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: !isShiftOpen ? 'none' : '0 2px 6px rgba(220, 38, 38, 0.25)',
              transition: 'all 0.15s ease',
            }}
          >
            <LogOut size={16} /> Check Out
          </button>
        </div>
      </div>

      {/* Attendance Notification banner if available */}
      {attendanceMsg && (
        <div style={{
          background: attendanceMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${attendanceMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          color: attendanceMsg.type === 'success' ? '#15803d' : '#dc2626',
          padding: '10px 16px',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 16,
          fontSize: 13,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          {attendanceMsg.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {attendanceMsg.text}
        </div>
      )}

      {/* ──── Password Verification Modal for Check In / Out ──── */}
      {attendanceModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 14,
            width: '100%',
            maxWidth: 420,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: attendanceModal === 'checkIn' ? '#f0fdf4' : '#fef2f2',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: attendanceModal === 'checkIn' ? '#dcfce7' : '#fee2e2',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: attendanceModal === 'checkIn' ? '#16a34a' : '#dc2626',
                }}>
                  {attendanceModal === 'checkIn' ? <LogIn size={17} /> : <LogOut size={17} />}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
                    Confirm {attendanceModal === 'checkIn' ? 'Check In' : 'Check Out'}
                  </h3>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-3)' }}>
                    Please verify your account password to continue
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setAttendanceModal(null); setVerifyPassword(''); setVerifyError(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleConfirmAttendance} style={{ padding: '20px' }}>
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 16,
                fontSize: 12,
                color: 'var(--text-2)'
              }}>
                <div>Staff: <strong>{profile?.name}</strong> {profile?.username ? `(@${profile.username})` : ''}</div>
                <div>Time: <strong>{new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</strong> ({todayStr()})</div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                  Re-enter Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showVerifyPassword ? 'text' : 'password'}
                    className="inp"
                    autoFocus
                    placeholder="Enter your login password"
                    value={verifyPassword}
                    onChange={e => setVerifyPassword(e.target.value)}
                    style={{
                      width: '100%',
                      paddingRight: 40,
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowVerifyPassword(!showVerifyPassword)}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0
                    }}
                  >
                    {showVerifyPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {verifyError && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#dc2626',
                  marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6
                }}>
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  {verifyError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => { setAttendanceModal(null); setVerifyPassword(''); setVerifyError(''); }}
                  disabled={verifying}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={verifying}
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    background: attendanceModal === 'checkIn' ? '#16a34a' : '#dc2626',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                  }}
                >
                  {verifying ? (
                    <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Verifying...</>
                  ) : (
                    <>Confirm {attendanceModal === 'checkIn' ? 'Check In' : 'Check Out'}</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  products={CATEGORY_PRODUCTS[cat.key].filter(p => isAdminUser || !p.adminOnly)}
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