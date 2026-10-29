import { db, auth } from '../firebase';
import {
  collection, doc, getDocFromServer, getDocsFromServer, query, where,
  Timestamp, runTransaction, setDoc, onSnapshot,
} from 'firebase/firestore';
import {
  DEFAULT_PAYROLL_RATES, validateRates, aggregatePayrollSales, attendanceForDay,
  receivingForPayroll, newPayrollEntry, restoreLegacyPayroll, calculateDailyPayroll, payrollIssues, normalizeSavedPayroll, summarizeMonthlyPayroll, calculateStaffCosts, dutiesFromProfile,
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

export async function loadPayrollDay(date, refresh = false) {
  const [staffSnap, daySnap, rates, legacySnap] = await Promise.all([
    getDocsFromServer(collection(db, 'staff')), getDocFromServer(doc(db, 'payroll_days', date)),
    loadPayrollRates(), getDocsFromServer(query(collection(db, 'daily_payroll'), where('date', '==', date))),
  ]);
  const staff = documents(staffSnap);
  const saved = data(daySnap);
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
    if (prior?.duties) return { ...entry, duties: dutiesFromProfile({ payrollDuties: prior.duties }), bonus: prior.bonus || 0, cashAdvance: prior.cashAdvance || 0, mealClaims: prior.mealClaims || 0, note: prior.note || '' };
    // Legacy totals remain visible for comparison; admins review the new draft.
    if (prior) return restoreLegacyPayroll(entry, prior);
    return entry;
  });
  return { staff, rates, saved: false, day: { date, revision: saved?.revision || 0, rates, sources, entries, managementFeeApplied: saved?.managementFeeApplied ?? new Date(`${date}T00:00:00Z`).getUTCDay() !== 6 } };
}

export async function savePayrollDay(day) {
  const updatedBy = await requireAdmin();
  const rates = validateRates(day.rates);
  const issues = payrollIssues(day.entries, day.sources);
  if (issues.length) throw new Error(issues.join(' '));
  if (day.entries.length > 200) throw new Error('This payroll supports up to 200 staff per day.');
  if (new Set(day.entries.map(e => e.staffId)).size !== day.entries.length) throw new Error('Duplicate staff in payroll.');
  const entries = calculateDailyPayroll(day.entries, day.sources, rates);
  const staffCosts = calculateStaffCosts(day.date, entries, rates, day.managementFeeApplied);
  const record = { ...day, managementFeeApplied: day.managementFeeApplied ?? new Date(`${day.date}T00:00:00Z`).getUTCDay() !== 6, schemaVersion: 4, rates, entries, staffCosts, revision: (day.revision || 0) + 1, updatedBy, updatedAt: new Date().toISOString() };
  await runTransaction(db, async transaction => {
    const dayRef = doc(db, 'payroll_days', day.date);
    const current = data(await transaction.get(dayRef));
    if ((current?.revision || 0) !== (day.revision || 0)) throw new Error('Payroll was changed by another administrator. Reload the date before saving.');
    transaction.set(dayRef, record);
    transaction.set(doc(db, 'staff_cost_summary', day.date), { date: day.date, ...staffCosts, updatedBy, updatedAt: record.updatedAt });
    for (const entry of entries) {
      transaction.set(doc(db, 'daily_payroll', `${day.date}_${entry.staffId}`), {
        ...entry, date: day.date, rates, sources: day.sources, managementFeeForDay: staffCosts.managementFee, schemaVersion: 4, updatedBy, updatedAt: record.updatedAt,
      });
      transaction.set(doc(db, 'payroll_summary', `${entry.staffId}_${day.date}`), {
        staffId: entry.staffId, date: day.date, hours: entry.workedMinutes / 60,
        wage: entry.totalPay, updatedAt: record.updatedAt,
      });
    }
  });
  return record;
}
