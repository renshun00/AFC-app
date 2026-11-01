import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

let records, orders, failRead, failCommit;
const copy = value => structuredClone(value);
const snapshot = (id, value) => ({ id, exists: () => value !== undefined, data: () => copy(value) });
const api = {
  collection: (_, name) => ({ name }), doc: (_, name, id) => `${name}/${id}`,
  query: (ref, ...filters) => ({ ...ref, filters }), where: (key, op, value) => ({ key, op, value }),
  Timestamp: { fromDate: value => value.toISOString() }, serverTimestamp: () => 'server-time',
  getDocFromServer: async ref => snapshot(ref, records.get(ref)),
  getDocsFromServer: async () => { if (failRead) throw new Error('Offline'); return { docs: orders.map(o => snapshot(o.id, o)) }; },
  setDoc: async (ref, value, options) => { assert.equal(options.merge, true); records.set(ref, { ...records.get(ref), ...copy(value) }); },
  runTransaction: async (_, callback) => {
    const writes = [];
    await callback({
      get: async ref => snapshot(ref, records.get(ref)),
      set: (ref, value, options) => { assert.equal(options.merge, true); writes.push([ref, value]); },
      update: (ref, value) => writes.push([ref, value]),
    });
    if (failCommit) throw new Error('Commit failed');
    writes.forEach(([ref, value]) => records.set(ref, { ...records.get(ref), ...copy(value) }));
  },
};
globalThis.__cashApi = api;
const url = new URL('../src/services/cashReconciliationService.js', import.meta.url).href;
const moduleUrl = code => `data:text/javascript,${encodeURIComponent(code)}`;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL === url && specifier === '../firebase') return { shortCircuit: true, url: moduleUrl('export const db = {}; export const auth = { currentUser: { uid: "staff" } };') };
  if (context.parentURL === url && specifier === 'firebase/firestore') return { shortCircuit: true, url: moduleUrl(`export const { ${Object.keys(api).join(', ')} } = globalThis.__cashApi;`) };
  return next(specifier, context);
} });
const service = await import(url);
const date = '2026-11-01';
beforeEach(() => {
  records = new Map([
    [`daily_inventory/${date}`, { date, status: 'submitted', data: { remaining_fried: { chicken_pcs: 2 } } }],
    ['staff_shifts/shift', { staffId: 'staff', clockIn: '2026-11-01T02:00:00Z', clockOut: null }],
  ]);
  orders = [{ id: 'order', date, status: 'completed', paymentMethod: 'cash', total: 100 }];
  failRead = false; failCommit = false;
});

test('saving a shortage preserves inventory closing and flags the record for Admin', async () => {
  await service.saveCashClosing(date, '90', 'Ali');
  const saved = records.get(`daily_inventory/${date}`);
  assert.equal(saved.status, 'submitted');
  assert.equal(saved.data.remaining_fried.chicken_pcs, 2);
  assert.equal(saved.cashReconciliation.matched, false);
  assert.equal(saved.cashReconciliation.variance, -10);
  assert.equal(saved.cashReconciliation.countedByName, 'Ali');
});

test('clock-out with a cash difference saves the warning and attendance together', async () => {
  await service.clockOutWithCash('shift', date, '110', 'Ali');
  assert.equal(records.get('staff_shifts/shift').clockOut, 'server-time');
  assert.equal(records.get(`daily_inventory/${date}`).cashReconciliation.variance, 10);
});

test('blank count, failed sales read and wrong trading date never clock out staff', async () => {
  await assert.rejects(service.clockOutWithCash('shift', date, ''), /Enter CASH/);
  failRead = true;
  await assert.rejects(service.clockOutWithCash('shift', date, '0'), /Offline/);
  failRead = false;
  await assert.rejects(service.clockOutWithCash('shift', '2026-11-02', '0'), /trading date/);
  assert.equal(records.get('staff_shifts/shift').clockOut, null);
  assert.equal(records.get(`daily_inventory/${date}`).cashReconciliation, undefined);
});

test('failed transaction leaves both cash and clock-out unchanged', async () => {
  failCommit = true;
  await assert.rejects(service.clockOutWithCash('shift', date, '90'), /Commit failed/);
  assert.equal(records.get('staff_shifts/shift').clockOut, null);
  assert.equal(records.get(`daily_inventory/${date}`).cashReconciliation, undefined);
});
