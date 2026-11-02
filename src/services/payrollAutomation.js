import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { getMalaysiaDate } from '../utils/dailyFlowCalculator.js';
import { syncPayrollDay } from './payrollService.js';

// Mounted above the routes: POS, either daily page and remote clients all feed
// the same queue. Initial server snapshots also recover missed/offline days.
export function startPayrollAutomation(onStatus) {
  let active = true, running = false, timer;
  const pending = new Set(), ready = new Set(), failures = new Map();
  const watches = ['daily_inventory', 'sales_orders', 'staff_shifts', 'payroll_adjustments', 'staff', 'settings'];
  const businessDate = (name, record, id) => {
    if (!record) return null;
    const timestamp = name === 'staff_shifts' ? record.clockIn : record.createdAt;
    return name === 'staff_shifts' ? (timestamp && getMalaysiaDate(timestamp.toDate ? timestamp.toDate() : new Date(timestamp)))
      : record.date || (name === 'sales_orders' ? timestamp && getMalaysiaDate(timestamp.toDate ? timestamp.toDate() : new Date(timestamp)) : id);
  };
  const enqueue = date => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date <= getMalaysiaDate()) pending.add(date);
  };
  const status = () => onStatus({ syncing: running || pending.size > 0, errors: [...failures.values()] });
  async function drain() {
    if (!active || running || ready.size !== watches.length) return;
    running = true; status();
    const batch = [...pending].sort();
    for (const date of batch) {
      if (!active) break;
      pending.delete(date);
      try { await syncPayrollDay(date, () => active); failures.delete(date); }
      catch (error) { failures.set(date, `${date}: ${error.message}`); }
    }
    running = false;
    if (active) {
      status();
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const date of failures.keys()) enqueue(date);
        void drain();
      }, pending.size ? 300 : 30000);
    }
  }
  const unsubs = watches.map(name => {
    const previous = new Map();
    return onSnapshot(name === 'settings' ? doc(db, 'settings', 'payroll') : collection(db, name),
      { includeMetadataChanges: true }, snap => {
        if (!active || snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
        failures.delete(name); ready.add(name);
        if (name === 'staff' || name === 'settings') {
          // Historical rates/assignments are snapshots; profile changes affect today.
          enqueue(getMalaysiaDate());
        } else {
          for (const change of snap.docChanges()) {
            enqueue(previous.get(change.doc.id));
            const date = businessDate(name, change.doc.data(), change.doc.id);
            enqueue(date);
            if (change.type === 'removed') previous.delete(change.doc.id);
            else previous.set(change.doc.id, date);
          }
          // A cache snapshot may have delivered the initial docChanges already.
          for (const item of snap.docs) {
            if (!previous.has(item.id)) {
              const date = businessDate(name, item.data(), item.id);
              previous.set(item.id, date); enqueue(date);
            }
          }
        }
        clearTimeout(timer); timer = setTimeout(drain, 300);
      }, error => {
        if (!active) return;
        ready.delete(name); failures.set(name, `Payroll source ${name}: ${error.message}`); status();
      });
  });
  return () => { active = false; clearTimeout(timer); unsubs.forEach(unsub => unsub()); };
}
