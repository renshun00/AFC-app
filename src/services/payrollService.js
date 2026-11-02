import { db, auth } from '../firebase';
import { getMalaysiaDate } from '../utils/dailyFlowCalculator.js';
import { calculateAutomaticPayroll, payrollFingerprint } from '../utils/automaticPayroll.js';
import {
  collection, doc, getDocFromServer, getDocsFromServer, query, where,
  Timestamp, runTransaction, setDoc, onSnapshot,
} from 'firebase/firestore';
import {
  DEFAULT_PAYROLL_RATES, validateRates, aggregatePayrollSales, attendanceForDay,
  receivingForPayroll, newPayrollEntry, restoreLegacyPayroll, normalizeSavedPayroll, summarizeMonthlyPayroll, calculateStaffCosts, dutiesFromProfile,
} from '../utils/payrollCalculator.js';

export { calculateJagaGeraiPay, calculateOTPay, calculateStaffDailyPay } from '../utils/payrollCalculator.js';

const data = snap => snap.exists() ? snap.data() : null;
const documents = snap => snap.docs.map(d => ({ ...d.data(), id: d.id }));

async function requireAdmin() {
  if (!auth.currentUser) throw new Error('Sign in as an administrator.');
  let profile = data(await getDocFromServer(doc(db, 'staff', auth.currentUser.uid)));
  if (!profile && auth.currentUser.email) {
    const matches = await getDocsFromServer(query(collection(db, 'staff'), where('email', '==', auth.currentUser.email)));
    if (matches.size === 1) profile = matches.docs[0].data();
  }
  if (profile?.role !== 'Admin') throw new Error('Only administrators can save payroll or change wage rates.');
  return auth.currentUser.uid;
}

export async function loadPayrollRates() {
  const saved = data(await getDocFromServer(doc(db, 'settings', 'payroll')));
  return validateRates({ ...DEFAULT_PAYROLL_RATES, ...saved?.rates });
}

export function subscribeMonthlyPayroll(month, onData, onError) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Select a valid payroll month.');
  return onSnapshot(query(collection(db, 'daily_payroll'), where('date', '>=', `${month}-01`), where('date', '<=', `${month}-31`)),
    snap => onData(summarizeMonthlyPayroll(documents(snap), month)), onError);
}

export async function savePayrollRates(rates) {
  const updatedBy = await requireAdmin();
  const validated = validateRates(rates);
  await setDoc(doc(db, 'settings', 'payroll'), { rates: validated, updatedBy, updatedAt: new Date().toISOString() });
  return validated;
}

// Date and timestamp queries are deduplicated; explicit business dates take priority.
export async function getStaffDailySales(date) {
  const start = Timestamp.fromDate(new Date(`${date}T00:00:00+08:00`));
  const end = Timestamp.fromDate(new Date(`${date}T23:59:59.999+08:00`));
  const [byDate, byTime] = await Promise.all([
    getDocsFromServer(query(collection(db, 'sales_orders'), where('date', '==', date))),
    getDocsFromServer(query(collection(db, 'sales_orders'), where('createdAt', '>=', start), where('createdAt', '<=', end))),
  ]);
  const orders = [...new Map([...documents(byTime), ...documents(byDate)].map(o => [o.id, o])).values()];
  const sales = aggregatePayrollSales(orders, date);
  return { ...sales, ayamKetul: sales.chickenPieces, cendawanSets: sales.mushroomSets };
}

export async function loadPayrollSources(date) {
  const start = Timestamp.fromDate(new Date(`${date}T00:00:00+08:00`));
  const end = Timestamp.fromDate(new Date(`${date}T23:59:59.999+08:00`));
  const [sales, reportSnap, shiftsSnap] = await Promise.all([
    getStaffDailySales(date), getDocFromServer(doc(db, 'daily_inventory', date)),
    getDocsFromServer(query(collection(db, 'staff_shifts'), where('clockIn', '>=', start), where('clockIn', '<=', end))),
  ]);
  return {
    sources: { ...sales, ...receivingForPayroll(data(reportSnap)), loadedAt: new Date().toISOString() },
    shifts: documents(shiftsSnap),
  };
}

export async function loadPayrollDay(date, refresh = false, automatic = false) {
  const [staffSnap, daySnap, rates, legacySnap, adjustmentsSnap] = await Promise.all([
    getDocsFromServer(collection(db, 'staff')), getDocFromServer(doc(db, 'payroll_days', date)),
    loadPayrollRates(), getDocsFromServer(query(collection(db, 'daily_payroll'), where('date', '==', date))),
    getDocFromServer(doc(db, 'payroll_adjustments', date)),
  ]);
  const staff = documents(staffSnap);
  const saved = data(daySnap);
  const adjustments = data(adjustmentsSnap);
  if (saved && !refresh) {
    const entries = saved.entries.map(entry => normalizeSavedPayroll(entry, saved.rates));
    return { staff, rates, day: { ...saved, entries, managementFeeApplied: saved.managementFeeApplied ?? new Date(`${date}T00:00:00Z`).getUTCDay() !== 6, staffCosts: calculateStaffCosts(date, entries, saved.rates, saved.managementFeeApplied) }, saved: true };
  }
  const { sources, shifts } = await loadPayrollSources(date);
  const previous = saved?.entries || documents(legacySnap);
  const members = [...staff];
  for (const record of previous) {
    if (!members.some(s => s.id === record.staffId)) members.push({ id: record.staffId, name: record.staffName, status: 'inactive' });
  }
  const entries = members.map(member => {
    const attendance = attendanceForDay(shifts.filter(s => s.staffId === member.id), date);
    const prior = previous.find(e => e.staffId === member.id);
    const entry = newPayrollEntry(member, attendance, date);
    if (prior?.duties) return { ...entry, duties: automatic && saved?.automatic && member.isActive !== false && member.status !== 'inactive' && (date >= getMalaysiaDate() || !prior.attendance?.present)
      ? entry.duties : dutiesFromProfile({ payrollDuties: prior.duties }), bonus: prior.bonus || 0, cashAdvance: prior.cashAdvance || 0, mealClaims: prior.mealClaims || 0, note: prior.note || '' };
    // Legacy totals remain visible for comparison; admins review the new draft.
    if (prior) return restoreLegacyPayroll(entry, prior);
    return entry;
  });
  const adjusted = entries.map(entry => ({ ...entry, ...(adjustments?.entries?.[entry.staffId] || {}) }));
  return { staff, rates, saved: false, day: { date, revision: saved?.revision || 0,
    rates: automatic ? saved?.rates || rates : rates, sources, entries: adjusted,
    adjustmentRevision: adjustments?.revision || 0,
    managementFeeApplied: adjustments?.managementFeeApplied ?? saved?.managementFeeApplied ?? new Date(`${date}T00:00:00Z`).getUTCDay() !== 6 } };
}

export function subscribePayrollDay(date, onChange, onError) {
  return onSnapshot(doc(db, 'payroll_days', date), snapshot => {
    const saved = data(snapshot);
    onChange(saved ? { ...saved, entries: saved.entries.map(entry => normalizeSavedPayroll(entry, saved.rates)) } : null);
  }, onError);
}

// Only explicit administrative corrections are edited. Ordinary payroll is
// derived from source records and requires no daily approval/save action.
export async function savePayrollAdjustments(day, baseline) {
  const updatedBy = await requireAdmin();
  const changes = Object.fromEntries(day.entries.map(entry => {
    for (const key of ['bonus', 'cashAdvance', 'mealClaims']) {
      if (!Number.isFinite(Number(entry[key])) || Number(entry[key]) < 0) throw new Error('Adjustments must be nonnegative numbers.');
    }
    const before = baseline.entries.find(previous => previous.staffId === entry.staffId);
    const values = { duties: dutiesFromProfile({ payrollDuties: entry.duties }),
      bonus: Number(entry.bonus), cashAdvance: Number(entry.cashAdvance), mealClaims: Number(entry.mealClaims), note: entry.note || '' };
    return [entry.staffId, Object.fromEntries(Object.entries(values).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before?.[key])))];
  }));
  await runTransaction(db, async transaction => {
    const ref = doc(db, 'payroll_adjustments', day.date);
    const current = data(await transaction.get(ref));
    if ((current?.revision || 0) !== (day.adjustmentRevision || 0)) throw new Error('Adjustments changed in another session. Reload this day.');
    const entries = { ...current?.entries };
    for (const [id, change] of Object.entries(changes)) {
      if (Object.keys(change).length) entries[id] = { ...entries[id], ...change };
    }
    const management = day.managementFeeApplied !== baseline.managementFeeApplied
      ? { managementFeeApplied: day.managementFeeApplied }
      : current?.managementFeeApplied !== undefined ? { managementFeeApplied: current.managementFeeApplied } : {};
    transaction.set(ref, { date: day.date, entries, ...management,
      revision: (current?.revision || 0) + 1, updatedBy, updatedAt: new Date().toISOString() });
  });
}

export async function syncPayrollDay(date, isActive = () => true) {
  if (!auth.currentUser) throw new Error('Sign in to synchronize payroll.');
  const uid = auth.currentUser.uid;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { day } = await loadPayrollDay(date, true, true);
    if (!isActive() || auth.currentUser?.uid !== uid) return;
    if (day.entries.length > 160) throw new Error('Automatic payroll supports up to 160 staff per day.');
    if (!day.revision && !day.sources.reportExists && !day.sources.orderCount && !day.entries.some(e => e.attendance.present)) return;
    const calculation = calculateAutomaticPayroll(day.entries, day.sources, day.rates);
    const record = { ...day, ...calculation, automatic: true, schemaVersion: 5,
      staffCosts: calculateStaffCosts(date, calculation.entries, day.rates, day.managementFeeApplied),
      revision: day.revision + 1, updatedBy: uid, updatedAt: new Date().toISOString() };
    const fingerprint = payrollFingerprint(record);
    try {
      return await runTransaction(db, async transaction => {
        const ref = doc(db, 'payroll_days', date);
        const current = data(await transaction.get(ref));
        const adjustments = data(await transaction.get(doc(db, 'payroll_adjustments', date)));
        if (!isActive() || auth.currentUser?.uid !== uid) return;
        if ((adjustments?.revision || 0) !== day.adjustmentRevision || (current?.revision || 0) !== day.revision) {
          throw Object.assign(new Error('Payroll sources changed; retrying.'), { code: 'payroll-conflict' });
        }
        if (current?.automatic && current.fingerprint === fingerprint) return current;
        transaction.set(ref, { ...record, fingerprint });
        transaction.set(doc(db, 'staff_cost_summary', date), { date, ...record.staffCosts,
          calculationStatus: record.calculationStatus, pendingIssues: record.pendingIssues, updatedAt: record.updatedAt });
        for (const entry of record.entries) {
          transaction.set(doc(db, 'daily_payroll', `${date}_${entry.staffId}`), {
            ...entry, date, rates: record.rates, sources: record.sources, automatic: true,
            calculationStatus: record.calculationStatus, pendingIssues: record.pendingIssues,
            managementFeeForDay: record.staffCosts.managementFee, schemaVersion: 5, updatedBy: uid, updatedAt: record.updatedAt,
          });
          transaction.set(doc(db, 'payroll_summary', `${entry.staffId}_${date}`), {
            staffId: entry.staffId, date, hours: entry.workedMinutes / 60, wage: entry.totalPay, updatedAt: record.updatedAt,
          });
        }
        return record;
      });
    } catch (error) { if (error.code !== 'payroll-conflict' || attempt === 2) throw error; }
  }
}
