import React, { useState, useEffect } from 'react';
import { Plus, Edit2, ChevronDown, ChevronUp, DollarSign, Users, Eye, EyeOff, KeyRound, Loader2, Trash2 } from 'lucide-react';
import { staffList as fallbackStaff, TASK_RATES, calcWage } from '../data/placeholder';
import { Modal, FormRow } from '../components/Layout';
import { staffService } from '../services/firestoreService';

export default function StaffPayrollPage({ isMobile, onStaffUpdate }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [showPwdFor, setShowPwdFor] = useState(null);

  const emptyNew = { name: '', role: 'Cashier', status: 'active', tasks: [], username: '', password: '', confirmPassword: '' };
  const [newStaff, setNewStaff] = useState(emptyNew);
  const [newTask, setNewTask] = useState({ task: Object.keys(TASK_RATES)[0], qty: 1, bonus: 0 });
  const [showPwd, setShowPwd] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

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

  const totalWages = staff.reduce((s, m) => s + calcWage(m).total, 0);
  const totalBonus = staff.reduce((s, m) => s + calcWage(m).bonus, 0);

  // ── Task helpers ─────────────────────────────────────────────────
  const addTaskToNew = () => {
    setNewStaff(f => ({ ...f, tasks: [...f.tasks, { ...newTask, qty: Number(newTask.qty), bonus: Number(newTask.bonus) }] }));
    setNewTask({ task: Object.keys(TASK_RATES)[0], qty: 1, bonus: 0 });
  };
  const removeTaskFromNew = (idx) => setNewStaff(f => ({ ...f, tasks: f.tasks.filter((_, i) => i !== idx) }));

  // ── 2. Save new staff directly to Auth & Firestore ───────────────
  const saveNewStaff = async () => {
    setFormError('');
    if (!newStaff.name.trim()) return setFormError('Full name is required.');
    if (!newStaff.username.trim()) return setFormError('Username is required.');
    if (newStaff.username.length < 3) return setFormError('Username must be at least 3 characters.');
    if (staff.find(s => s.username === newStaff.username.trim()))
      return setFormError('Username already taken.');
    if (!newStaff.password) return setFormError('Password is required.');
    if (newStaff.password.length < 6) return setFormError('Password must be at least 6 characters.');
    if (newStaff.password !== newStaff.confirmPassword) return setFormError('Passwords do not match.');

    const formattedEmail = `${newStaff.username.trim().toLowerCase()}@afc.com`;

    try {
      setSaving(true);
      await staffService.registerNewStaff({
        email: formattedEmail,
        password: newStaff.password,
        name: newStaff.name.trim(),
        username: newStaff.username.trim(),
        role: newStaff.role,
        status: newStaff.status || 'active',
        tasks: newStaff.tasks || [],
      });

      await loadStaffData();
      setNewStaff(emptyNew);
      setShowPwd(false);
      setShowAdd(false);
    } catch (err) {
      console.error('Error creating staff account:', err);
      if (err.code === 'auth/email-already-in-use') {
        setFormError('An account with this username already exists in Firebase Auth.');
      } else {
        setFormError('Failed to create account: ' + err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── 3. Edit staff tasks & save to Firestore ─────────────────────
  const [editData, setEditData] = useState(null);
  const openEditStaff = (s) => { setEditData({ ...s, tasks: s.tasks.map(t => ({ ...t })) }); setShowEdit(s.id); };

  const saveEditStaff = async () => {
    if (!editData) return;
    try {
      setSaving(true);
      if (typeof editData.id === 'string') {
        await staffService.update(editData.id, { tasks: editData.tasks });
      }
      setStaff(prev => prev.map(s => s.id === editData.id ? editData : s));
      setShowEdit(null);
      setEditData(null);
    } catch (err) {
      console.error('Error updating staff tasks:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── 4. Delete staff from BOTH Firebase Auth & Firestore ──────────
  const handleDeleteStaff = async (member) => {
    const confirmMessage = `Are you sure you want to permanently delete ${member.name}?\n\nThis will remove their login from Firebase Auth and delete their record.`;
    if (!window.confirm(confirmMessage)) return;

    try {
      setLoading(true);
      await staffService.deleteStaffCompletely(member);
      setStaff(prev => prev.filter(s => s.id !== member.id));
    } catch (err) {
      console.error('Error deleting staff member:', err);
      alert('Failed to delete staff: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Role badge colour
  const roleBadge = (role) => {
    const map = { Admin: 'badge-red', Supervisor: 'badge-amber', Cashier: 'badge-blue', Kitchen: 'badge-green', Driver: 'badge-gray', Cleaner: 'badge-gray' };
    return map[role] || 'badge-gray';
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)' }}>
        <Loader2 size={28} className="spin" style={{ margin: '0 auto 10px', display: 'block' }} />
        <div>Processing staff records...</div>
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
        <strong>📐 Wage Formula:</strong> Total = Σ(task_rate × qty) + bonus_amount
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
          const wage = calcWage(member);
          const isExpanded = expanded === member.id;
          return (
            <div key={member.id} className="card" style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer' }}
                onClick={() => setExpanded(isExpanded ? null : member.id)}>
                {/* Avatar */}
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: 'var(--primary)', flexShrink: 0 }}>
                  {member.name ? member.name.split(' ').map(n => n[0]).join('').slice(0, 2) : 'ST'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{member.name}</div>
                    <span className={`badge ${roleBadge(member.role)}`} style={{ fontSize: 10 }}>{member.role}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {member.username && <span style={{ fontFamily: 'monospace', background: '#f4f4f5', borderRadius: 4, padding: '1px 6px' }}>@{member.username}</span>}
                    <span>{member.tasks?.length || 0} task{(member.tasks?.length || 0) !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>RM{wage.total.toFixed(2)}</div>
                  {wage.bonus > 0 && <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>+RM{wage.bonus.toFixed(2)} bonus</div>}
                </div>
                {/* Credentials button */}
                {member.username && (
                  <button onClick={e => { e.stopPropagation(); setShowPwdFor(member); }}
                    title="View credentials"
                    style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-3)', padding: '4px 6px', display: 'flex', alignItems: 'center' }}>
                    <KeyRound size={13} />
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); openEditStaff(member); }}
                  title="Edit tasks"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
                  <Edit2 size={14} />
                </button>
                <button onClick={e => { e.stopPropagation(); handleDeleteStaff(member); }}
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
                        const r = TASK_RATES[t.task];
                        const sub = r ? r.rate * t.qty : 0;
                        return (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{t.task}</td>
                            <td style={{ color: 'var(--text-2)' }}>RM{r?.rate}/{r?.unit}</td>
                            <td>{t.qty}</td>
                            <td style={{ fontWeight: 600 }}>RM{sub.toFixed(2)}</td>
                            <td style={{ color: 'var(--green)', fontWeight: 600 }}>{t.bonus > 0 ? `+RM${t.bonus.toFixed(2)}` : '—'}</td>
                            <td style={{ fontWeight: 700 }}>RM{(sub + t.bonus).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 13 }}>
                    <span>Base: <strong>RM{wage.base.toFixed(2)}</strong></span>
                    <span>Bonus: <strong style={{ color: 'var(--green)' }}>RM{wage.bonus.toFixed(2)}</strong></span>
                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Total: RM{wage.total.toFixed(2)}</span>
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
              <input className="inp" placeholder="e.g. Ali Hassan" value={newStaff.name} onChange={e => setNewStaff(f => ({ ...f, name: e.target.value }))} />
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
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
              Staff will log in with these credentials. Non-admin staff will strictly only have access to <strong>Point of Sale (POS)</strong> and <strong>Inventory</strong>.
            </div>
            <FormRow label="Username">
              <input className="inp" placeholder="e.g. ali.hassan" value={newStaff.username}
                onChange={e => setNewStaff(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} />
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
                  {Object.keys(TASK_RATES).map(k => <option key={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Qty</label>
                <input className="inp" type="number" min="1" value={newTask.qty} onChange={e => setNewTask(t => ({ ...t, qty: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Bonus (RM)</label>
                <input className="inp" type="number" min="0" value={newTask.bonus} onChange={e => setNewTask(t => ({ ...t, bonus: e.target.value }))} />
              </div>
              <button className="btn btn-primary btn-sm" onClick={addTaskToNew}><Plus size={13} /></button>
            </div>
            {newStaff.tasks.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {newStaff.tasks.map((t, i) => {
                  const r = TASK_RATES[t.task];
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-soft)', fontSize: 12 }}>
                      <span style={{ fontWeight: 600 }}>{t.task}</span>
                      <span style={{ color: 'var(--text-2)' }}>{t.qty} × RM{r?.rate} + RM{t.bonus} = <strong>RM{(r?.rate * t.qty + t.bonus).toFixed(2)}</strong></span>
                      <button onClick={() => removeTaskFromNew(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '0 4px' }}>✕</button>
                    </div>
                  );
                })}
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
          <div style={{ fontSize: 12, color: 'var(--text-3)', background: '#fff7ed', borderRadius: 'var(--radius-sm)', padding: '10px 12px', border: '1px solid #fed7aa' }}>
            ⚠️ This staff member has <strong>restricted access</strong>. They can only view the POS and Inventory pages.
          </div>
          <button className="btn btn-outline" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={() => setShowPwdFor(null)}>Close</button>
        </Modal>
      )}

      {/* ── Edit Staff Modal ── */}
      {showEdit && editData && (
        <Modal title={`Edit Tasks — ${editData.name}`} onClose={() => { setShowEdit(null); setEditData(null); }} maxWidth={520}>
          <div style={{ marginBottom: 14 }}>
            {editData.tasks.map((t, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <select className="inp" value={t.task} onChange={e => setEditData(d => ({ ...d, tasks: d.tasks.map((tt, ii) => ii === i ? { ...tt, task: e.target.value } : tt) }))}>
                  {Object.keys(TASK_RATES).map(k => <option key={k}>{k}</option>)}
                </select>
                <input className="inp" type="number" min="1" value={t.qty} onChange={e => setEditData(d => ({ ...d, tasks: d.tasks.map((tt, ii) => ii === i ? { ...tt, qty: Number(e.target.value) } : tt) }))} />
                <input className="inp" type="number" min="0" value={t.bonus} placeholder="Bonus" onChange={e => setEditData(d => ({ ...d, tasks: d.tasks.map((tt, ii) => ii === i ? { ...tt, bonus: Number(e.target.value) } : tt) }))} />
                <button onClick={() => setEditData(d => ({ ...d, tasks: d.tasks.filter((_, ii) => ii !== i) }))} style={{ background: 'var(--red-soft)', border: 'none', borderRadius: 6, padding: '8px', cursor: 'pointer', color: '#dc2626' }}>✕</button>
              </div>
            ))}
            <button className="btn btn-outline btn-sm" style={{ marginTop: 4 }} onClick={() => setEditData(d => ({ ...d, tasks: [...d.tasks, { task: Object.keys(TASK_RATES)[0], qty: 1, bonus: 0 }] }))}>
              <Plus size={12} /> Add Task
            </button>
          </div>
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