import React, { useEffect, useRef, useState } from 'react';
import { Plus, Edit2, DollarSign, Loader2, RefreshCw, Settings, Trash2, KeyRound } from 'lucide-react';
import { Modal } from '../components/Layout';
import MonthlyPayrollSummary from '../components/MonthlyPayrollSummary';
import { useAuth } from '../context/AuthContext';
import { staffService } from '../services/firestoreService';
import { loadPayrollDay, savePayrollDay, savePayrollRates } from '../services/payrollService';
import { getMalaysiaDate } from '../utils/dailyFlowCalculator';
import { DUTIES, DEFAULT_PAYROLL_RATES, calculateDailyPayroll, calculateStaffCosts, dutiesFromProfile, payrollIssues, validateRates } from '../utils/payrollCalculator';

const rm = value => `RM${Number(value || 0).toFixed(2)}`;
const panel = { padding: 16, marginBottom: 14 };
const row = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 };
const small = { fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 };
const number = value => value === '' ? '' : Number(value);

function NumericField({ label, value, onChange, disabled, step = 'any' }) {
  return <label style={{ display: 'block', fontSize: 12, flex: '1 1 130px' }}>{label}
    <input aria-label={label} className="inp" type="number" min="0" step={step} value={value ?? ''}
      disabled={disabled} onChange={e => onChange(number(e.target.value))} />
  </label>;
}

const RATE_FIELDS = {
  washChicken: 'Chicken washing (RM / whole bird)', washCarcass: 'Carcass washing (RM / kg)',
  mushroom: 'Mushrooms (RM / set)', overtime: 'Overtime (RM / hour)', management: 'Admin management cost (RM / day, reporting only)',
  standardMinutes: 'Standard workday (minutes)', meal: 'Pinjam Makan advance (RM / time taken)',
  friedPenalty: 'Fried penalty (RM / piece)', friedThreshold: 'Fried penalty threshold (pieces)', friedDivisor: 'Fried penalty staff divisor',
};

function RatesEditor({ initial, busy, onSave, onClose }) {
  const [rates, setRates] = useState(() => structuredClone(initial));
  const [error, setError] = useState('');
  return <Modal title="Payroll rates" onClose={busy ? () => {} : onClose} maxWidth={760}>
    <p style={small}>These defaults apply to new calculations. Saved payroll keeps its own rates until you explicitly recalculate that date.</p>
    <div style={{ ...row, alignItems: 'end', margin: '14px 0' }}>
      {Object.entries(RATE_FIELDS).map(([key, label]) => <NumericField key={key} label={label} value={rates[key]} disabled={busy}
        onChange={value => setRates(r => ({ ...r, [key]: value }))} />)}
    </div>
    <div style={{ overflowX: 'auto' }}><table className="data-table">
      <thead><tr><th>Up to whole birds</th><th>Carcass kg reference</th><th>Operation pay (RM)</th></tr></thead>
      <tbody>{rates.tiers.map((tier, index) => <tr key={index}>{['maxBirds', 'carcassKg', 'pay'].map(key => <td key={key}>
        <input className="inp" type="number" min="0" step={key === 'maxBirds' ? '1' : 'any'} aria-label={`Tier ${index + 1} ${key}`}
          value={tier[key]} disabled={busy} onChange={e => { const value = number(e.target.value); setRates(r => ({ ...r, tiers: r.tiers.map((t, i) => i === index ? { ...t, [key]: value } : t) })); }} />
      </td>)}</tr>)}</tbody>
    </table></div>
    <p style={small}>Whole birds = rounded chicken pieces sold ÷ 9. Following G1, carcass kg is reference information, not a second tier condition. The first tier covers fewer than 5 birds; sales above the final band keep the final rate.</p>
    {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
    <button className="btn btn-primary" disabled={busy} onClick={async () => {
      try { setError(''); await onSave(validateRates(rates)); } catch (e) { setError(e.message); }
    }}>{busy ? 'Saving…' : 'Save rates'}</button>
  </Modal>;
}

export default function StaffPayrollPage({ isMobile }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'Admin';
  const [date, setDate] = useState(getMalaysiaDate);
  const [month, setMonth] = useState(() => getMalaysiaDate().slice(0, 7));
  const [showDaily, setShowDaily] = useState(false);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [staffEditor, setStaffEditor] = useState(null);
  const [staffError, setStaffError] = useState('');
  const [credentials, setCredentials] = useState(null);
  const request = useRef(0);

  const load = async (target, refresh = false, retain = false) => {
    const token = ++request.current;
    setLoading(true); setError(''); setNotice('');
    try {
      const next = await loadPayrollDay(target, refresh);
      if (token !== request.current) return;
      setState(previous => {
        if (retain && previous?.day.date === target && !previous.saved) {
          next.day.managementFeeApplied = previous.day.managementFeeApplied;
          next.day.entries = next.day.entries.map(entry => {
            const old = previous.day.entries.find(e => e.staffId === entry.staffId);
            return old ? { ...entry, duties: old.duties, bonus: old.bonus, cashAdvance: old.cashAdvance, mealClaims: old.mealClaims, note: old.note } : entry;
          });
        }
        return next;
      });
      setDirty(retain);
    } catch (e) { if (token === request.current) { setState(null); setError(e.message); } }
    finally { if (token === request.current) setLoading(false); }
  };

  useEffect(() => {
    if (isAdmin) load(date);
    return () => { request.current++; };
  }, [date, isAdmin]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!isAdmin) return <div className="card" style={panel}>Payroll is available to administrators.</div>;

  const day = state?.day;
  const locked = state?.saved || busy || loading;
  const calculated = day ? (state.saved ? day.entries : calculateDailyPayroll(day.entries, day.sources, day.rates)) : [];
  const issues = day && !state.saved ? payrollIssues(day.entries, day.sources) : [];
  const total = calculated.reduce((sum, e) => sum + e.balancePay, 0);
  const staffCosts = day ? calculateStaffCosts(day.date, calculated, day.rates, day.managementFeeApplied) : null;
  const changeEntry = (id, update) => {
    setState(s => ({ ...s, day: { ...s.day, entries: s.day.entries.map(e => e.staffId === id ? { ...e, ...update } : e) } }));
    setDirty(true); setNotice('');
  };
  const openStaff = (member = {}) => {
    setStaffError('');
    setStaffEditor({ name: '', username: '', password: '', confirmPassword: '', ...member,
      role: member.role === 'Admin' ? 'Admin' : 'Staff', status: member.status || (member.isActive === false ? 'inactive' : 'active'), payrollDuties: dutiesFromProfile(member) });
  };
  const saveStaff = async () => {
    setStaffError('');
    const s = staffEditor;
    if (!s.name.trim()) return setStaffError('Enter a full name.');
    if (!s.id && (!s.username.trim() || s.password.length < 6 || s.password !== s.confirmPassword)) return setStaffError('Enter a username/email and matching passwords of at least 6 characters.');
    try {
      setBusy(true);
      if (s.id) {
        await staffService.update(s.id, { name: s.name.trim(), role: s.role, status: s.status, isActive: s.status === 'active', payrollDuties: s.payrollDuties });
      } else {
        const login = s.username.trim().toLowerCase();
        await staffService.registerNewStaff({ name: s.name.trim(), role: s.role, status: 'active', username: login.split('@')[0], email: login.includes('@') ? login : `${login}@afc.com`, password: s.password, tasks: [] });
      }
      setStaffEditor(null);
      await load(date, !state?.saved, true);
    } catch (e) { setStaffError(e.message); }
    finally { setBusy(false); }
  };

  return <div>
    <MonthlyPayrollSummary month={month} isMobile={isMobile} disabled={busy} onMonthChange={value => {
      if (dirty && !window.confirm('Discard unsaved daily changes and change payroll month?')) return;
      setDirty(false); setMonth(value); setDate(getMalaysiaDate().startsWith(value) ? getMalaysiaDate() : `${value}-01`);
    }} />
    <div className="card" style={{ ...panel, ...row, justifyContent: 'space-between' }}>
      <strong>Daily breakdown</strong>
      <button className="btn btn-outline" aria-expanded={showDaily} onClick={() => setShowDaily(v => !v)}>{showDaily ? 'Hide daily breakdown' : 'View / prepare a day'}</button>
    </div>
    {showDaily && <div className="card" style={{ ...panel, ...row, justifyContent: 'space-between' }}>
      <label style={small}>Payroll date (Malaysia)
        <input className="inp" type="date" aria-label="Payroll date" value={date} disabled={busy || loading} onChange={e => {
          if (!e.target.value || (dirty && !window.confirm('Discard unsaved payroll changes and change date?'))) return;
          setDirty(false); setDate(e.target.value); setMonth(e.target.value.slice(0, 7));
        }} />
      </label>
      <div style={row}>
        <button className="btn btn-outline" disabled={busy || loading} onClick={() => load(date, true, true)}><RefreshCw size={14} />{state?.saved ? 'Recalculate saved day' : 'Refresh sources'}</button>
        <button className="btn btn-outline" disabled={busy || loading || !state} onClick={() => setRatesOpen(true)}><Settings size={14} /> Wage rates</button>
        <button className="btn btn-primary" disabled={locked || !day || !day.entries.length || issues.length > 0} onClick={async () => {
          try {
            setBusy(true); setError('');
            const saved = await savePayrollDay(day);
            setState(s => ({ ...s, day: saved, saved: true })); setDirty(false); setNotice('Payroll saved. Dashboard payroll totals were updated.');
          } catch (e) { setError(e.message); } finally { setBusy(false); }
        }}><DollarSign size={14} />{busy ? 'Saving…' : 'Save daily payroll'}</button>
      </div>
    </div>}
    {error && <div role="alert" className="card" style={{ ...panel, color: '#b91c1c' }}>{error} {!state && <button className="btn btn-outline" onClick={() => load(date)}>Retry</button>}</div>}
    {notice && <div role="status" style={{ ...panel, color: '#15803d' }}>{notice}</div>}
    {showDaily && (loading ? <div style={panel}><Loader2 className="spin" size={20} /> Loading payroll and source records…</div> : day && <>
      <div className="card" style={panel}>
        <div style={{ ...row, justifyContent: 'space-between' }}>
          <div><strong>{state.saved ? 'Saved payroll' : 'Payroll draft'} · {date}</strong><div style={small}>{state.saved ? 'Saved payroll for this date. Recalculate to review changes.' : 'Select the staff who performed each duty, review the amounts, then save the whole day.'}</div></div>
          <strong style={{ fontSize: 24, color: 'var(--primary)' }}>Day balance: {rm(total)}</strong>
        </div>
        <div style={{ ...row, marginTop: 12 }}>
          <span>Received: <b>{day.sources.chickenWhole}</b> whole chickens · <b>{day.sources.carcassKg}</b> kg carcass</span>
          <span>Sold: <b>{day.sources.chickenPieces}</b> chicken pcs = <b>{Math.round(day.sources.chickenPieces / 9)}</b> rounded birds · <b>{day.sources.mushroomSets}</b> mushroom sets</span>
        </div>
        <p style={small}>Sources: {day.sources.orderCount} completed POS orders · Daily sheet: {day.sources.reportStatus} · Loaded {new Date(day.sources.loadedAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}. Refresh after new sales, receiving changes, or clock-outs.</p>
        {new Date(`${date}T00:00:00Z`).getUTCDay() === 6 && <p style={small}>Saturday is normally closed. Duties start unselected; assign only work actually performed.</p>}
        {!!issues.length && <div role="alert" style={{ ...small, color: '#b91c1c' }}><strong>Resolve before saving:</strong><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
        {day.sources.reportStatus !== 'submitted' && <p style={small}>This daily sheet is not finalized. Payroll reflects the source quantities shown above; review again after closing.</p>}
      </div>

      <section className="card" style={panel} aria-label="Daily StaffCosts report">
        <strong>StaffCosts report · {date}</strong>
        <p style={small}>Employee wages earned: {rm(staffCosts.employeeWages)} · Admin management fee: {rm(staffCosts.managementFee)} · Total StaffCosts: <strong>{rm(staffCosts.totalStaffCosts)}</strong></p>
        <label style={small}><input type="checkbox" checked={day.managementFeeApplied ?? new Date(`${date}T00:00:00Z`).getUTCDay() !== 6} disabled={locked} onChange={e => {
          const managementFeeApplied = e.target.checked;
          setState(s => ({ ...s, day: { ...s.day, managementFeeApplied } })); setDirty(true);
        }} /> Include this day's admin management fee ({rm(day.rates.management)})</label>
        <p style={small}>This fee is recorded once for management reporting. It is excluded from every employee's wages and payout. StaffCosts uses earned wages before salary advances are deducted.</p>
      </section>

      {calculated.map(entry => <div className="card" key={entry.staffId} style={panel}>
        <div style={{ ...row, justifyContent: 'space-between' }}><strong>{entry.staffName}</strong><strong style={{ color: 'var(--primary)' }}>{rm(entry.balancePay)}</strong></div>
        <div style={small}>
          {entry.attendance.present ? `${entry.workedMinutes} worked minutes · ${entry.otMinutes} OT minutes${entry.attendance.pending ? ' · Clock-out pending' : ''}` : 'No recorded shift. OT is zero; assign other verified duties manually.'}
          {entry.attendance.shifts.map(shift => <span key={shift.id} style={{ display: 'block' }}>
            {new Date(shift.clockIn).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' })} → {shift.clockOut ? new Date(shift.clockOut).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' }) : 'On duty'}
          </span>)}
        </div>
        {!state.saved && entry.legacyTotal !== undefined && <p style={{ ...small, color: '#92400e' }}>Previous legacy payroll: {rm(entry.legacyTotal)}. Review duties, bonuses and advances before replacing it with this calculation.</p>}
        {state.saved && entry.mealCorrectionApplied && <p style={{ ...small, color: '#92400e' }}>Pinjam Makan is shown as an advance deduction. Recalculate and save this day to update its older stored calculation.</p>}
        {state.saved && entry.managementReclassified > 0 && <p style={{ ...small, color: '#92400e' }}>The previous management amount of {rm(entry.managementReclassified)} is excluded from employee wages. Recalculate and save to update the stored record.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 1 : 2}, minmax(0, 1fr))`, gap: 8, margin: '12px 0' }}>
          {Object.entries(DUTIES).map(([key, label]) => <label key={key} style={{ ...row, justifyContent: 'space-between', fontSize: 13, padding: 8, background: 'var(--bg)', borderRadius: 6 }}>
            <span><input type="checkbox" checked={Boolean(entry.duties[key])} disabled={locked} onChange={e => changeEntry(entry.staffId, { duties: { ...entry.duties, [key]: e.target.checked } })} /> {label}</span>
            <strong>{key === 'friedPenalty' ? `−${rm(entry.friedDeduction)}` : rm(entry.breakdown[key])}</strong>
          </label>)}
        </div>
        <div style={row}>
          <NumericField label={`${entry.staffName}: bonus (RM)`} value={entry.bonus} disabled={locked} onChange={bonus => changeEntry(entry.staffId, { bonus })} />
          <NumericField label={`${entry.staffName}: cash advance deduction (RM)`} value={entry.cashAdvance} disabled={locked} onChange={cashAdvance => changeEntry(entry.staffId, { cashAdvance })} />
          <NumericField label={`${entry.staffName}: Pinjam Makan (times taken × ${rm(day.rates.meal)})`} value={entry.mealClaims} disabled={locked} onChange={mealClaims => changeEntry(entry.staffId, { mealClaims })} />
        </div>
        <input className="inp" aria-label={`${entry.staffName}: payroll note`} placeholder="Payroll note (optional)" value={entry.note} disabled={locked} style={{ marginTop: 8 }} onChange={e => changeEntry(entry.staffId, { note: e.target.value })} />
        <div style={{ ...small, marginTop: 8 }}>Earned {rm(entry.grossPay)} − Pinjam Makan {rm(entry.mealAdvance)} − other advances {rm(entry.cashAdvance)} − penalties {rm(entry.friedDeduction)} = <strong>{rm(entry.balancePay)}</strong> toward the month-end balance.</div>
      </div>)}
      {!calculated.length && <div className="card" style={panel}>Add staff to start preparing payroll.</div>}

      <details className="card" style={panel}><summary style={{ cursor: 'pointer', fontWeight: 600 }}>How payroll works</summary>
        <ul style={small}>
          <li>Chicken washing: fresh whole birds × {rm(day.rates.washChicken)}. Carcass washing: fresh kg × {rm(day.rates.washCarcass)}. Each pool is shared equally among the staff selected for that washing duty. A sole washer receives the full pool.</li>
          <li>Operation: round completed POS chicken pieces ÷ 9, then use the tier below. Each selected operator receives that wage. Mushrooms pay {rm(day.rates.mushroom)} per set to each selected staff member.</li>
          <li>OT: max(0, worked minutes − {day.rates.standardMinutes}) × {rm(day.rates.overtime)} ÷ 60. Money is rounded only after calculating minutes. Short shifts never reduce the other wages. Overnight shifts belong to their clock-in date; breaks between shifts are excluded.</li>
          <li>Admin management fee: {rm(day.rates.management)} once per included day in the StaffCosts report. It is excluded from employee payroll, following the PaySummStaff1 scope.</li>
          <li>Bonuses are earned wages. Pinjam Makan is salary forwarded at {rm(day.rates.meal)} per time taken, not a meal allowance. Record it when taken; the monthly payout deducts the accumulated amount once, together with other cash advances and selected fried penalties. Negative daily balances remain included in the month-end calculation.</li>
          <li>Fried penalties apply to chicken + carcass leftovers at {day.rates.friedThreshold} pieces or more: all pieces × {rm(day.rates.friedPenalty)} ÷ {day.rates.friedDivisor}.</li>
        </ul>
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Rounded whole birds</th><th>Carcass reference (kg)</th><th>Operation wage</th></tr></thead><tbody>
          {day.rates.tiers.map((tier, i) => <tr key={i}><td>{i ? Number(day.rates.tiers[i - 1].maxBirds) + 1 : 0}–{tier.maxBirds}{i === 9 ? '+' : ''}</td><td>{tier.carcassKg}</td><td>{rm(tier.pay)}</td></tr>)}
        </tbody></table></div>
        <p style={small}>G1 uses chicken sales alone for the operation tier. Carcass weights above are reference values. Saved payroll is a reviewed snapshot; it is not automatically changed by later POS activity.</p>
      </details>
    </>)}
      {!loading && state && <div className="card" style={panel}>
        <div style={{ ...row, justifyContent: 'space-between', marginBottom: 10 }}><strong>Staff directory</strong><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => openStaff()}><Plus size={14} /> Add staff</button></div>
        {state.staff.map(member => <div key={member.id} style={{ ...row, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
          <span style={{ flex: 1 }}>{member.name} <span style={small}>· {member.role} · {member.status || 'active'}</span></span>
          {member.username && <button className="btn btn-outline btn-sm" title="View credentials" disabled={busy} onClick={() => setCredentials(member)}><KeyRound size={13} /></button>}
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => openStaff(member)}><Edit2 size={13} /> Profile & defaults</button>
          <button className="btn btn-outline btn-sm" title="Delete staff profile" disabled={busy} onClick={async () => {
            if (!window.confirm(`Remove ${member.name}'s staff profile? Saved payroll will be retained.`)) return;
            try { setBusy(true); await staffService.delete(member.id); await load(date, !state.saved, true); }
            catch (e) { setError(e.message); } finally { setBusy(false); }
          }}><Trash2 size={13} /></button>
        </div>)}
      </div>}

    {ratesOpen && <RatesEditor initial={state?.rates || DEFAULT_PAYROLL_RATES} busy={busy} onClose={() => setRatesOpen(false)} onSave={async rates => {
      try {
        setBusy(true); const saved = await savePayrollRates(rates);
        setState(s => ({ ...s, rates: saved, day: s.saved ? s.day : { ...s.day, rates: saved } }));
        if (!state.saved) setDirty(true);
        setRatesOpen(false); setNotice('Wage rates saved. Existing saved payroll is unchanged.');
      } finally { setBusy(false); }
    }} />}
    {staffEditor && <Modal title={staffEditor.id ? 'Staff profile & default duties' : 'Add staff member'} onClose={busy ? () => {} : () => setStaffEditor(null)} maxWidth={620}>
      <label style={small}>Full name<input className="inp" value={staffEditor.name} onChange={e => setStaffEditor(s => ({ ...s, name: e.target.value }))} /></label>
      <label style={small}>Role<select className="inp" value={staffEditor.role} onChange={e => setStaffEditor(s => ({ ...s, role: e.target.value }))}><option>Staff</option><option>Admin</option></select></label>
      {staffEditor.id ? <>
        <label style={small}>Status<select className="inp" value={staffEditor.status} onChange={e => setStaffEditor(s => ({ ...s, status: e.target.value }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <p style={small}>Default duties are selected on new days with attendance. Saturdays start with no duties. Admin management fees are separate reporting costs, not staff duties. Current daily selections are edited above.</p>
        {Object.entries(DUTIES).map(([key, label]) => <label key={key} style={{ display: 'block', margin: '8px 0', fontSize: 13 }}><input type="checkbox" checked={Boolean(staffEditor.payrollDuties[key])} onChange={e => setStaffEditor(s => ({ ...s, payrollDuties: { ...s.payrollDuties, [key]: e.target.checked } }))} /> {label}</label>)}
      </> : <>
        <label style={small}>Username or email<input className="inp" autoComplete="off" value={staffEditor.username} onChange={e => setStaffEditor(s => ({ ...s, username: e.target.value.replace(/\s/g, '') }))} /></label>
        <label style={small}>Password<input className="inp" type="password" autoComplete="new-password" value={staffEditor.password} onChange={e => setStaffEditor(s => ({ ...s, password: e.target.value }))} /></label>
        <label style={small}>Confirm password<input className="inp" type="password" autoComplete="new-password" value={staffEditor.confirmPassword} onChange={e => setStaffEditor(s => ({ ...s, confirmPassword: e.target.value }))} /></label>
      </>}
      {staffError && <p role="alert" style={{ color: '#b91c1c' }}>{staffError}</p>}
      <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={busy} onClick={saveStaff}>{busy ? 'Saving…' : 'Save staff'}</button>
    </Modal>}
    {credentials && <Modal title={`Credentials — ${credentials.name}`} onClose={() => setCredentials(null)}>
      <p>Username: {credentials.username}</p><details><summary>Show stored password</summary><p>{credentials.password || 'No stored password'}</p></details>
    </Modal>}
  </div>;
}
