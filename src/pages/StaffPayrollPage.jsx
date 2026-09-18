import React, { useState, useEffect } from 'react';
import { Plus, Edit2, ChevronDown, ChevronUp, DollarSign, Users, Eye, EyeOff, KeyRound, Loader2, Trash2, Clock } from 'lucide-react';
import { staffList as fallbackStaff } from '../data/placeholder';
import { Modal, FormRow } from '../components/Layout';
import { staffService } from '../services/firestoreService';
import { calculateJagaGeraiPay, saveDailyPayrollToFirestore, getStaffDailySales, calculateOTPay } from '../services/payrollService';

// Actual task rates from AFC Excel (PaySummStaff1)
export const AFC_TASK_RATES = {
  'Upah Jaga Gerai': { rate: 0, unit: 'tier (ketul ayam)', isTiered: true },
  'Basuh Ayam': { rate: 0.50, unit: 'ekor (50% share)' },
  'Basuh Rangka': { rate: 0.50, unit: 'kg (50% share)' },
  'Jual Cendawan': { rate: 0.50, unit: 'set' },
  'Overtime (OT)': { rate: 3.00, unit: 'jam (>8 hrs)' },
  'Pinjam Makan': { rate: 10.00, unit: 'claim (+RM10/hari)' },
  'Pinjam Duit': { rate: -1.00, unit: 'RM advance (tolak)' },
  'Pengurusan': { rate: 100.00, unit: 'hari' }
};

// Helper: Calculate OT hours from "HH:MM" strings
export function getAutoOTHours(checkInStr, checkOutStr) {
  if (!checkInStr || !checkOutStr) return 0;
  const [inH, inM] = checkInStr.split(':').map(Number);
  const [outH, outM] = checkOutStr.split(':').map(Number);
  
  const startMins = inH * 60 + inM;
  let endMins = outH * 60 + outM;
  if (endMins < startMins) endMins += 24 * 60; // handle overnight shifts

  const workedMins = endMins - startMins;
  const otMins = Math.max(0, workedMins - 480); // 480 mins = 8 hrs standard
  return Number((otMins / 60).toFixed(2));
}

// Calculate staff daily wage
export function calcStaffWage(member) {
  const tasks = member?.tasks || [];
  let base = 0;
  let bonus = 0;
  let deductions = 0;

  tasks.forEach(t => {
    const info = AFC_TASK_RATES[t.task];
    const qtyNum = Number(t.qty) || 0;
    const bonusNum = Number(t.bonus) || 0;
    let lineSubtotal = 0;

    if (t.task === 'Upah Jaga Gerai') {
      lineSubtotal = calculateJagaGeraiPay(qtyNum);
    } else if (t.task === 'Pinjam Duit') {
      deductions += Math.abs(qtyNum);
      return;
    } else if (info) {
      lineSubtotal = (info.rate || 0) * qtyNum;
    }

    base += lineSubtotal;
    bonus += bonusNum;
  });

  const total = Math.max(0, base + bonus - deductions);

  return {
    base,
    bonus,
    deductions,
    total
  };
}

export default function StaffPayrollPage({ isMobile }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [showPwdFor, setShowPwdFor] = useState(null);

  const emptyNew = { name: '', role: 'Cashier', status: 'active', tasks: [], username: '', password: '', confirmPassword: '' };
  const [newStaff, setNewStaff] = useState(emptyNew);
  const [newTask, setNewTask] = useState({ task: Object.keys(AFC_TASK_RATES)[0], qty: '', bonus: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [fetchingSales, setFetchingSales] = useState(false);

  // ── 1. Load staff from Firestore ─────────────────────────────────
  const loadStaffData = async () => {
    try {
      setLoading(true);
      const docs = await staffService.getAll();
      if (docs && docs.length > 0) {
        const formatted = docs.map(d => ({
          ...d,
          tasks: d.tasks || [],
          status: d.status || (d.isActive !== false ? 'active' : 'inactive'),
          role: d.role || 'Cashier',
          checkIn: d.checkIn || '13:10',
          checkOut: d.checkOut || '22:10'
        }));
        setStaff(formatted);
      } else {
        setStaff(fallbackStaff);
      }
    } catch (err) {
      console.error('Failed to load staff from Firestore:', err);
      setStaff(fallbackStaff);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaffData();
  }, []);

  const totalWages = staff.reduce((s, m) => s + calcStaffWage(m).total, 0);
  const totalBonus = staff.reduce((s, m) => s + calcStaffWage(m).bonus, 0);

  // ── Task helpers ─────────────────────────────────────────────────
  const addTaskToNew = () => {
    setNewStaff(f => ({
      ...f,
      tasks: [...f.tasks, { ...newTask, qty: Number(newTask.qty) || 0, bonus: Number(newTask.bonus) || 0 }]
    }));
    setNewTask({ task: Object.keys(AFC_TASK_RATES)[0], qty: '', bonus: '' });
  };
  const removeTaskFromNew = (idx) => setNewStaff(f => ({ ...f, tasks: f.tasks.filter((_, i) => i !== idx) }));

  // ── 2. Save new staff directly to Firestore ──────────────────────
  const saveNewStaff = async () => {
    setFormError('');
    if (!newStaff.name.trim()) return setFormError('Full name is required.');
    if (!newStaff.username.trim()) return setFormError('Username or email is required.');
    if (newStaff.username.length < 3) return setFormError('Username must be at least 3 characters.');
    if (!newStaff.password) return setFormError('Password is required.');
    if (newStaff.password.length < 6) return setFormError('Password must be at least 6 characters.');
    if (newStaff.password !== newStaff.confirmPassword) return setFormError('Passwords do not match.');

    const cleanInput = newStaff.username.trim().toLowerCase();
    // Handles plain usernames (example -> example@gmail.com) or custom emails (example@gmail.com)
    const formattedEmail = cleanInput.includes('@') ? cleanInput : `${cleanInput}@afc.com`;
    const cleanUsername = cleanInput.split('@')[0];

    if (staff.find(s => s.username === cleanUsername)) {
      return setFormError('Username already taken.');
    }

    try {
      setSaving(true);
      await staffService.registerNewStaff({
        email: formattedEmail,
        password: newStaff.password,
        name: newStaff.name.trim(),
        username: cleanUsername,
        role: newStaff.role,
        status: newStaff.status || 'active',
        tasks: newStaff.tasks || [],
        checkIn: '13:10',
        checkOut: '22:10'
      });

      await loadStaffData();
      setNewStaff(emptyNew);
      setShowPwd(false);
      setShowAdd(false);
    } catch (err) {
      console.error('Error creating staff account:', err);
      if (err.code === 'auth/email-already-in-use') {
        setFormError('An account with this email/username already exists in Firebase Auth.');
      } else {
        setFormError('Failed to create account: ' + err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── 3. Edit staff tasks & auto-sync shift times ──────────────────
  const [editData, setEditData] = useState(null);

  const handleTimeChange = (newIn, newOut) => {
    const otHours = getAutoOTHours(newIn, newOut);
    setEditData(prev => {
      if (!prev) return prev;
      let updatedTasks = [...prev.tasks];
      const otIdx = updatedTasks.findIndex(t => t.task === 'Overtime (OT)');

      if (otHours > 0) {
        if (otIdx >= 0) {
          updatedTasks[otIdx] = { ...updatedTasks[otIdx], qty: otHours };
        } else {
          updatedTasks.push({ task: 'Overtime (OT)', qty: otHours, bonus: 0 });
        }
      } else if (otIdx >= 0) {
        updatedTasks = updatedTasks.filter((_, i) => i !== otIdx);
      }

      return {
        ...prev,
        checkIn: newIn,
        checkOut: newOut,
        tasks: updatedTasks
      };
    });
  };

  const openEditStaff = async (s) => {
    const defaultIn = s.checkIn || '13:10';
    const defaultOut = s.checkOut || '22:10';
    const initialOT = getAutoOTHours(defaultIn, defaultOut);

    let initialTasks = s.tasks.map(t => ({ ...t }));
    const otIdx = initialTasks.findIndex(t => t.task === 'Overtime (OT)');
    if (initialOT > 0) {
      if (otIdx >= 0) initialTasks[otIdx] = { ...initialTasks[otIdx], qty: initialOT };
      else initialTasks.push({ task: 'Overtime (OT)', qty: initialOT, bonus: 0 });
    }

    setEditData({
      ...s,
      checkIn: defaultIn,
      checkOut: defaultOut,
      tasks: initialTasks
    });
    setShowEdit(s.id);

    try {
      setFetchingSales(true);
      const today = new Date().toISOString().split('T')[0];
      const sales = await getStaffDailySales(today, s.id);

      if (sales.ayamKetul > 0 || sales.cendawanSets > 0) {
        setEditData(prev => {
          if (!prev) return prev;
          let updatedTasks = [...prev.tasks];

          const jagaIdx = updatedTasks.findIndex(t => t.task === 'Upah Jaga Gerai');
          if (jagaIdx >= 0) {
            updatedTasks[jagaIdx] = { ...updatedTasks[jagaIdx], qty: sales.ayamKetul };
          } else if (sales.ayamKetul > 0) {
            updatedTasks.push({ task: 'Upah Jaga Gerai', qty: sales.ayamKetul, bonus: 0 });
          }

          const cendawanIdx = updatedTasks.findIndex(t => t.task === 'Jual Cendawan');
          if (cendawanIdx >= 0) {
            updatedTasks[cendawanIdx] = { ...updatedTasks[cendawanIdx], qty: sales.cendawanSets };
          } else if (sales.cendawanSets > 0) {
            updatedTasks.push({ task: 'Jual Cendawan', qty: sales.cendawanSets, bonus: 0 });
          }

          return { ...prev, tasks: updatedTasks };
        });
      }
    } catch (e) {
      console.warn('Auto-sync sales skipped:', e);
    } finally {
      setFetchingSales(false);
    }
  };

  const saveEditStaff = async () => {
    if (!editData) return;
    try {
      setSaving(true);

      const cleanedTasks = editData.tasks.map(t => ({
        ...t,
        qty: Number(t.qty) || 0,
        bonus: Number(t.bonus) || 0
      }));

      // 1. Update staff profile with checkIn and checkOut
      if (typeof editData.id === 'string') {
        await staffService.update(editData.id, {
          tasks: cleanedTasks,
          checkIn: editData.checkIn,
          checkOut: editData.checkOut
        });
      }

      // 2. Save daily payroll record to Firestore daily_payroll collection
      const today = new Date().toISOString().split('T')[0];
      const wageCalc = calcStaffWage({ ...editData, tasks: cleanedTasks });

      await saveDailyPayrollToFirestore(today, editData.id, editData.name, {
        checkIn: editData.checkIn,
        checkOut: editData.checkOut,
        tasks: cleanedTasks,
        basePay: wageCalc.base,
        bonusPay: wageCalc.bonus,
        deductions: wageCalc.deductions,
        totalPay: wageCalc.total
      });

      setStaff(prev => prev.map(s => s.id === editData.id ? { ...editData, tasks: cleanedTasks } : s));
      setShowEdit(null);
      setEditData(null);
    } catch (err) {
      console.error('Error saving staff payroll:', err);
      alert('Error updating staff: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── 4. Delete staff from Firestore ──────────────────────────────
  const handleDeleteStaff = async (id) => {
    if (!window.confirm('Are you sure you want to remove this staff member?')) return;
    try {
      if (typeof id === 'string') {
        await staffService.delete(id);
      }
      setStaff(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Error deleting staff member:', err);
    }
  };

  const roleBadge = (role) => {
    const map = { Admin: 'badge-red', Supervisor: 'badge-amber', Cashier: 'badge-blue', Kitchen: 'badge-green', Driver: 'badge-gray', Cleaner: 'badge-gray' };
    return map[role] || 'badge-gray';
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)' }}>
        <Loader2 size={28} className="spin" style={{ margin: '0 auto 10px', display: 'block' }} />
        <div>Loading staff records from database...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : 4},1fr)`, gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Total Staff', value: staff.length },
          { label: 'Total Wages Today', value: `RM${totalWages.toFixed(2)}`, highlight: true },
          { label: 'Total Bonus', value: `RM${totalBonus.toFixed(2)}` },
          { label: 'Avg. Wage/Staff', value: `RM${staff.length ? (totalWages / staff.length).toFixed(2) : '0.00'}` },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 16px', background: s.highlight ? 'var(--green)' : 'var(--card)', border: s.highlight ? 'none' : '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: s.highlight ? 'rgba(255,255,255,.65)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.highlight ? '#fff' : 'var(--text-1)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Wage formula info */}
      <div style={{ background: 'var(--indigo-light)', borderRadius: 'var(--radius)', border: '1px solid #dde4ff', padding: '12px 16px', marginBottom: 14, fontSize: 13 }}>
        <strong>📐 AFC Daily Payroll Formula:</strong> Jaga Gerai (Tiered) + Basuh Ayam + Basuh Rangka + Cendawan + Auto-OT (Check In/Out) + Pinjam Makan - Pinjam Duit
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Staff Roster — {new Date().toLocaleDateString('en-MY', { dateStyle: 'medium' })}</div>
        <button className="btn btn-primary btn-sm" onClick={() => { setNewStaff(emptyNew); setFormError(''); setShowAdd(true); }}>
          <Plus size={13} /> Add New Staff
        </button>
      </div>

      {/* Staff cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {staff.map(member => {
          const wage = calcStaffWage(member);
          const isExpanded = expanded === member.id;
          return (
            <div key={member.id} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer' }}
                onClick={() => setExpanded(isExpanded ? null : member.id)}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: 'var(--primary)', flexShrink: 0 }}>
                  {member.name ? member.name.split(' ').map(n => n[0]).join('').slice(0, 2) : 'ST'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{member.name}</div>
                    <span className={`badge ${roleBadge(member.role)}`} style={{ fontSize: 10 }}>{member.role}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {member.username && <span style={{ fontFamily: 'monospace', background: '#f4f4f5', borderRadius: 4, padding: '1px 6px' }}>@{member.username}</span>}
                    <span>{member.tasks?.length || 0} tasks</span>
                    {member.checkIn && member.checkOut && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--text-2)' }}>
                        <Clock size={11} /> {member.checkIn} - {member.checkOut}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>RM{wage.total.toFixed(2)}</div>
                  {wage.bonus > 0 && <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>+RM{wage.bonus.toFixed(2)} bonus</div>}
                  {wage.deductions > 0 && <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>-RM{wage.deductions.toFixed(2)} pinjam</div>}
                </div>
                {member.username && (
                  <button onClick={e => { e.stopPropagation(); setShowPwdFor(member); }}
                    title="View credentials"
                    style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-3)', padding: '4px 6px', display: 'flex', alignItems: 'center' }}>
                    <KeyRound size={13} />
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); openEditStaff(member); }}
                  title="Edit tasks & shift"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
                  <Edit2 size={14} />
                </button>
                <button onClick={e => { e.stopPropagation(); handleDeleteStaff(member.id); }}
                  title="Delete staff"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}>
                  <Trash2 size={14} />
                </button>
                {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} /> : <ChevronDown size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
              </div>

              {/* Expanded task breakdown */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)', background: '#fafafa', padding: '12px 16px' }}>
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead><tr><th>Task</th><th>Rate</th><th>Qty</th><th>Subtotal</th><th>Bonus</th><th>Total</th></tr></thead>
                    <tbody>
                      {(member.tasks || []).map((t, i) => {
                        const r = AFC_TASK_RATES[t.task];
                        const q = Number(t.qty) || 0;
                        const b = Number(t.bonus) || 0;
                        let sub = 0;
                        if (t.task === 'Upah Jaga Gerai') {
                          sub = calculateJagaGeraiPay(q);
                        } else if (t.task === 'Pinjam Duit') {
                          sub = -q;
                        } else if (r) {
                          sub = r.rate * q;
                        }
                        return (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{t.task}</td>
                            <td style={{ color: t.task === 'Pinjam Duit' ? '#dc2626' : 'var(--text-2)' }}>
                              {t.task === 'Upah Jaga Gerai' ? 'Tiered RM30-80' : `RM${r?.rate}/${r?.unit}`}
                            </td>
                            <td>{t.qty}</td>
                            <td style={{ fontWeight: 600, color: sub < 0 ? '#dc2626' : 'inherit' }}>RM{sub.toFixed(2)}</td>
                            <td style={{ color: 'var(--green)', fontWeight: 600 }}>{b > 0 ? `+RM${b.toFixed(2)}` : '—'}</td>
                            <td style={{ fontWeight: 700, color: sub < 0 ? '#dc2626' : 'inherit' }}>RM{(sub + b).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 13 }}>
                    <span>Base: <strong>RM{wage.base.toFixed(2)}</strong></span>
                    {wage.bonus > 0 && <span>Bonus: <strong style={{ color: 'var(--green)' }}>RM{wage.bonus.toFixed(2)}</strong></span>}
                    {wage.deductions > 0 && <span>Pinjam: <strong style={{ color: '#dc2626' }}>-RM{wage.deductions.toFixed(2)}</strong></span>}
                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Gaji Bersih: RM{wage.total.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Add Staff Modal ── */}
      {showAdd && (
        <Modal title="Add New Staff Member" onClose={() => { setShowAdd(false); setFormError(''); }} maxWidth={560}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>① Basic Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <FormRow label="Full Name">
              <input className="inp" placeholder="e.g. Kamarudin" value={newStaff.name} onChange={e => setNewStaff(f => ({ ...f, name: e.target.value }))} />
            </FormRow>
            <FormRow label="Role">
              <select className="inp" value={newStaff.role} onChange={e => setNewStaff(f => ({ ...f, role: e.target.value }))}>
                {['Cashier', 'Kitchen', 'Supervisor', 'Driver', 'Cleaner'].map(r => <option key={r}>{r}</option>)}
              </select>
            </FormRow>
          </div>

          <div style={{ background: '#f0f3ff', borderRadius: 'var(--radius-sm)', border: '1px solid #dde4ff', padding: '14px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <KeyRound size={12} /> ② Login Credentials
            </div>
            <FormRow label="Username or Email">
              <input className="inp" placeholder="e.g. john or john@gmail.com" value={newStaff.username}
                onChange={e => setNewStaff(f => ({ ...f, username: e.target.value.trim().toLowerCase().replace(/\s/g, '') }))} />
            </FormRow>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <FormRow label="Password">
                <div style={{ position: 'relative' }}>
                  <input className="inp" type={showPwd ? 'text' : 'password'} placeholder="Min. 6 characters"
                    value={newStaff.password} onChange={e => setNewStaff(f => ({ ...f, password: e.target.value }))}
                    style={{ paddingRight: 36 }} />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0 }}>
                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </FormRow>
              <FormRow label="Confirm Password">
                <input className="inp" type={showPwd ? 'text' : 'password'} placeholder="Re-enter password"
                  value={newStaff.confirmPassword} onChange={e => setNewStaff(f => ({ ...f, confirmPassword: e.target.value }))} />
              </FormRow>
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>③ Assign Initial Tasks</div>
          <div style={{ background: '#f9f9f9', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '12px', marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Task</label>
                <select className="inp" value={newTask.task} onChange={e => setNewTask(t => ({ ...t, task: e.target.value }))}>
                  {Object.keys(AFC_TASK_RATES).map(k => <option key={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Qty / RM</label>
                <input
                  className="inp"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={newTask.qty}
                  onFocus={e => e.target.select()}
                  onChange={e => setNewTask(t => ({ ...t, qty: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Bonus (RM)</label>
                <input
                  className="inp"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={newTask.bonus}
                  onFocus={e => e.target.select()}
                  onChange={e => setNewTask(t => ({ ...t, bonus: e.target.value }))}
                />
              </div>
              <button className="btn btn-primary btn-sm" onClick={addTaskToNew}><Plus size={13} /></button>
            </div>
            {newStaff.tasks.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {newStaff.tasks.map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-soft)', fontSize: 12 }}>
                    <span style={{ fontWeight: 600 }}>{t.task}</span>
                    <span style={{ color: 'var(--text-2)' }}>Qty: {t.qty || 0} + RM{t.bonus || 0}</span>
                    <button onClick={() => removeTaskFromNew(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '0 4px' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {formError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', padding: '9px 12px', fontSize: 13, color: '#dc2626', marginBottom: 12 }}>
              ⚠️ {formError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setShowAdd(false); setFormError(''); }} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveNewStaff} disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <DollarSign size={14} />}
              {saving ? 'Saving...' : 'Add Staff Member'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── View Credentials Modal ── */}
      {showPwdFor && (
        <Modal title={`Credentials — ${showPwdFor.name}`} onClose={() => setShowPwdFor(null)} maxWidth={360}>
          <div style={{ background: '#f0f3ff', borderRadius: 'var(--radius-sm)', padding: '16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, color: 'var(--primary)' }}>
                {showPwdFor.name ? showPwdFor.name.split(' ').map(n => n[0]).join('').slice(0, 2) : 'ST'}
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>{showPwdFor.name}</div>
                <span className={`badge ${roleBadge(showPwdFor.role)}`} style={{ fontSize: 10 }}>{showPwdFor.role}</span>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>USERNAME</label>
              <div style={{ background: '#fff', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '9px 12px', fontFamily: 'monospace', fontSize: 14, fontWeight: 600 }}>
                {showPwdFor.username}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>PASSWORD</label>
              <div style={{ background: '#fff', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '9px 12px', fontFamily: 'monospace', fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{showPwd ? showPwdFor.password : '••••••••'}</span>
                <button onClick={() => setShowPwd(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0 }}>
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>
          <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowPwdFor(null)}>Close</button>
        </Modal>
      )}

      {/* ── Edit Staff Modal with Auto-OT Shift Times ── */}
      {showEdit && editData && (
        <Modal title={`Edit Tasks & Shift — ${editData.name}`} onClose={() => { setShowEdit(null); setEditData(null); }} maxWidth={640}>
          {fetchingSales && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--primary)', marginBottom: 10 }}>
              <Loader2 size={13} className="spin" /> Syncing today's POS chicken & mushroom sales from database...
            </div>
          )}

          {/* Shift Check-In & Check-Out Auto OT Box */}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Clock size={14} /> Auto-Calculate OT from Shift Times (8 hrs standard / RM3.00 hr)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, alignItems: 'center' }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 2 }}>Check In (Masuk)</label>
                <input
                  className="inp"
                  type="time"
                  value={editData.checkIn || '13:10'}
                  onChange={e => handleTimeChange(e.target.value, editData.checkOut || '22:10')}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 2 }}>Check Out (Pulang)</label>
                <input
                  className="inp"
                  type="time"
                  value={editData.checkOut || '22:10'}
                  onChange={e => handleTimeChange(editData.checkIn || '13:10', e.target.value)}
                />
              </div>
              <div style={{ background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #dcfce7', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Calculated OT</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#166534' }}>
                  {getAutoOTHours(editData.checkIn, editData.checkOut)} hrs
                </div>
              </div>
            </div>
          </div>

          {/* Column Header Titles */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.3fr 1fr 1fr auto', gap: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>
            <div>Task / Duty</div>
            <div>Qty / Units</div>
            <div>Bonus (RM)</div>
            <div style={{ textAlign: 'right' }}>Subtotal</div>
            <div></div>
          </div>

          <div style={{ margin: '10px 0 14px 0' }}>
            {editData.tasks.map((t, i) => {
              const r = AFC_TASK_RATES[t.task];
              const q = t.qty === '' ? 0 : Number(t.qty) || 0;
              const b = t.bonus === '' ? 0 : Number(t.bonus) || 0;

              let lineSub = 0;
              let unitHint = 'Qty';

              if (t.task === 'Upah Jaga Gerai') {
                lineSub = calculateJagaGeraiPay(q);
                const ekor = Math.round(q / 9);
                unitHint = `${ekor} ekor`;
              } else if (t.task === 'Pinjam Duit') {
                lineSub = -q;
                unitHint = 'RM tolak';
              } else if (t.task === 'Basuh Ayam') {
                lineSub = 0.50 * q;
                unitHint = 'ekor';
              } else if (t.task === 'Basuh Rangka') {
                lineSub = 0.50 * q;
                unitHint = 'KG';
              } else if (t.task === 'Jual Cendawan') {
                lineSub = 0.50 * q;
                unitHint = 'set';
              } else if (t.task === 'Overtime (OT)') {
                lineSub = 3.00 * q;
                unitHint = 'jam (auto)';
              } else if (t.task === 'Pinjam Makan') {
                lineSub = 10.00 * q;
                unitHint = 'claim';
              } else if (r) {
                lineSub = r.rate * q;
              }

              const rowTotal = lineSub + b;

              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.3fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  {/* Task Dropdown */}
                  <select className="inp" value={t.task} onChange={e => setEditData(d => ({ ...d, tasks: d.tasks.map((tt, ii) => ii === i ? { ...tt, task: e.target.value } : tt) }))}>
                    {Object.keys(AFC_TASK_RATES).map(k => <option key={k}>{k}</option>)}
                  </select>

                  {/* Qty Input with Helper Unit Label */}
                  <div style={{ position: 'relative' }}>
                    <input
                      className="inp"
                      type="number"
                      min="0"
                      step="any"
                      style={{ paddingRight: 55 }}
                      placeholder="0"
                      value={t.qty === 0 || t.qty === '0' ? '' : t.qty}
                      onFocus={e => e.target.select()}
                      onChange={e => {
                        const val = e.target.value;
                        setEditData(d => ({
                          ...d,
                          tasks: d.tasks.map((tt, ii) => ii === i ? { ...tt, qty: val === '' ? '' : Number(val) } : tt)
                        }));
                      }}
                    />
                    <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-3)', pointerEvents: 'none' }}>
                      {unitHint}
                    </span>
                  </div>

                  {/* Bonus Input */}
                  <input
                    className="inp"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={t.bonus === 0 || t.bonus === '0' ? '' : t.bonus}
                    onFocus={e => e.target.select()}
                    onChange={e => {
                      const val = e.target.value;
                      setEditData(d => ({
                        ...d,
                        tasks: d.tasks.map((tt, ii) => ii === i ? { ...tt, bonus: val === '' ? '' : Number(val) } : tt)
                      }));
                    }}
                  />

                  {/* Live Row Subtotal */}
                  <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 13, color: rowTotal < 0 ? '#dc2626' : 'var(--text-1)' }}>
                    RM{rowTotal.toFixed(2)}
                  </div>

                  {/* Remove Row Button */}
                  <button onClick={() => setEditData(d => ({ ...d, tasks: d.tasks.filter((_, ii) => ii !== i) }))} style={{ background: 'var(--red-soft)', border: 'none', borderRadius: 6, padding: '8px', cursor: 'pointer', color: '#dc2626' }}>✕</button>
                </div>
              );
            })}

            <button className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => setEditData(d => ({ ...d, tasks: [...d.tasks, { task: Object.keys(AFC_TASK_RATES)[0], qty: '', bonus: '' }] }))}>
              <Plus size={12} /> Add Task
            </button>
          </div>

          {/* Live Calculated Pay Summary Bar */}
          {(() => {
            const currentWage = calcStaffWage(editData);
            return (
              <div style={{ background: '#f8fafc', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span>Base: <strong>RM{currentWage.base.toFixed(2)}</strong></span>
                {currentWage.bonus > 0 && <span>Bonus: <strong style={{ color: 'var(--green)' }}>+RM{currentWage.bonus.toFixed(2)}</strong></span>}
                {currentWage.deductions > 0 && <span>Pinjam: <strong style={{ color: '#dc2626' }}>-RM{currentWage.deductions.toFixed(2)}</strong></span>}
                <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 15 }}>Total: RM{currentWage.total.toFixed(2)}</span>
              </div>
            );
          })()}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setShowEdit(null); setEditData(null); }} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveEditStaff} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}