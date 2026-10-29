import { db, auth } from '../firebase';
import { collection, doc, query, where, Timestamp, onSnapshot, getDocFromServer, getDocsFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import { validatePeriod, validateOverhead } from '../utils/reportingCalculator.js';

const documents = snap => snap.docs.map(d => ({ ...d.data(), id: d.id }));
export function reportingQueries(from, to) {
  validatePeriod(from, to);
  const byDate = name => query(collection(db, name), where('date', '>=', from), where('date', '<=', to));
  const start = Timestamp.fromDate(new Date(`${from}T00:00:00+08:00`));
  const end = Timestamp.fromDate(new Date(`${to}T23:59:59.999+08:00`));
  const byTime = name => query(collection(db, name), where('createdAt', '>=', start), where('createdAt', '<=', end));
  // Single-field range queries avoid extra composite indexes. Explicit dates win
  // in the calculator; timestamp queries also include legacy undated documents.
  return { ordersByDate: byDate('sales_orders'), ordersByTime: byTime('sales_orders'), reports: byDate('daily_inventory'),
    payrollDays: byDate('payroll_days'), payroll: byDate('daily_payroll'), expensesByDate: byDate('expenses'), expensesByTime: byTime('expenses'),
    overhead: collection(db, 'reporting_cost_rates') };
}

export function subscribeReporting(from, to, onData, onError) {
  const sources = reportingQueries(from, to), ready = new Set(), values = {}, cached = {}, unsubs = [];
  let stopped = false;
  const stop = () => { stopped = true; unsubs.forEach(unsubscribe => unsubscribe()); };
  const merge = (a, b) => [...new Map([...a, ...b].map(d => [d.id, d])).values()];
  try {
    for (const [key, ref] of Object.entries(sources)) {
      unsubs.push(onSnapshot(ref, { includeMetadataChanges: true }, snapshot => {
        if (stopped) return;
        values[key] = documents(snapshot); cached[key] = snapshot.metadata?.fromCache === true; ready.add(key);
        if (ready.size === Object.keys(sources).length) onData({ ...values,
          orders: merge(values.ordersByTime, values.ordersByDate), expenses: merge(values.expensesByTime, values.expensesByDate), fromCache: Object.values(cached).some(Boolean) });
      }, error => { if (!stopped) { stop(); onError(new Error(`Unable to load ${key.replace(/ByDate|ByTime/g, '')}: ${error.message}`)); } }));
    }
  } catch (error) { stop(); onError(error); }
  return stop;
}

export async function saveReportingOverhead(effectiveFrom, rates, expectedRevision = 0) {
  validatePeriod(effectiveFrom, effectiveFrom);
  const validated = validateOverhead(rates);
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in as an administrator.');
  let profile = await getDocFromServer(doc(db, 'staff', user.uid));
  let member = profile.exists() ? profile.data() : null;
  if (!member && user.email) {
    const matches = await getDocsFromServer(query(collection(db, 'staff'), where('email', '==', user.email)));
    if (matches.size === 1) member = matches.docs[0].data();
  }
  if (member?.role !== 'Admin') throw new Error('Only administrators can change reporting costs.');
  const ref = doc(db, 'reporting_cost_rates', effectiveFrom);
  await runTransaction(db, async transaction => {
    const previous = await transaction.get(ref);
    const revision = previous.exists() ? previous.data().revision || 0 : 0;
    if (revision !== expectedRevision) throw new Error('Costs changed in another session. Reload the saved rates before saving.');
    transaction.set(ref, { effectiveFrom, rates: validated, revision: revision + 1, updatedBy: user.uid, updatedAt: serverTimestamp() });
  });
}
