import { db, auth } from '../firebase';
import { collection, doc, query, where, Timestamp, getDocFromServer, getDocsFromServer, setDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { cashSalesForDate, reconcileCash } from '../utils/cashReconciliation.js';
import { getMalaysiaDate } from '../utils/dailyFlowCalculator.js';

export async function loadCashSales(date) {
  const start = Timestamp.fromDate(new Date(`${date}T00:00:00+08:00`));
  const end = Timestamp.fromDate(new Date(`${date}T23:59:59.999+08:00`));
  const snapshots = await Promise.all([
    getDocsFromServer(query(collection(db, 'sales_orders'), where('createdAt', '>=', start), where('createdAt', '<=', end))),
    getDocsFromServer(query(collection(db, 'sales_orders'), where('date', '==', date))),
  ]);
  return cashSalesForDate(snapshots.flatMap(snap => snap.docs.map(d => ({ ...d.data(), id: d.id }))), date);
}

export async function loadCashClosing(date) {
  const [sales, report] = await Promise.all([loadCashSales(date), getDocFromServer(doc(db, 'daily_inventory', date))]);
  return { sales, saved: report.exists() ? report.data().cashReconciliation || null : null };
}

async function prepareCash(date, amount, staffName) {
  if (!auth.currentUser) throw new Error('Sign in before saving the cash count.');
  const sales = await loadCashSales(date);
  return { ...reconcileCash(amount, sales.expectedCash), orderCount: sales.orderCount, countedBy: auth.currentUser.uid, countedByName: staffName || '', countedAt: serverTimestamp() };
}

export async function saveCashClosing(date, amount, staffName) {
  const cashReconciliation = await prepareCash(date, amount, staffName);
  await setDoc(doc(db, 'daily_inventory', date), { date, cashReconciliation }, { merge: true });
  return cashReconciliation;
}

export async function clockOutWithCash(shiftId, date, amount, staffName) {
  if (!shiftId) throw new Error('No active shift found. Refresh your attendance.');
  const cashReconciliation = await prepareCash(date, amount, staffName);
  await runTransaction(db, async transaction => {
    const shiftRef = doc(db, 'staff_shifts', shiftId);
    const snapshot = await transaction.get(shiftRef);
    const shift = snapshot.exists() ? snapshot.data() : null;
    if (!shift || shift.clockOut) throw new Error('This shift is no longer open. Refresh your attendance.');
    const clockIn = shift.clockIn?.toDate ? shift.clockIn.toDate() : new Date(shift.clockIn);
    if (getMalaysiaDate(clockIn) !== date) throw new Error('Select the shift’s trading date before clocking out.');
    transaction.set(doc(db, 'daily_inventory', date), { date, cashReconciliation }, { merge: true });
    transaction.update(shiftRef, { clockOut: serverTimestamp(), cashReconciliationDate: date, cashReconciliation });
  });
  return cashReconciliation;
}
