import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

let records, listeners, role, failCommit;
const clone = value => structuredClone(value);
const snap = (id, value) => ({ id, exists: () => value !== undefined, data: () => clone(value) });
const api = {
  collection: (_, name) => ({ name }), doc: (_, name, id) => `${name}/${id}`,
  query: (ref, ...filters) => ({ ...ref, filters }), where: (key, op, value) => ({ key, op, value }),
  Timestamp: { fromDate: date => date.toISOString() }, serverTimestamp: () => 'server-time',
  getDocFromServer: async ref => snap(ref, ref === 'staff/admin' ? { role } : records.get(ref)),
  getDocsFromServer: async () => ({ docs: [], size: 0 }),
  onSnapshot: (ref, options, onData, onError) => { assert.equal(options.includeMetadataChanges, true); const listener = { ref, onData, onError, active: true }; listeners.push(listener); return () => { listener.active = false; }; },
  runTransaction: async (_, callback) => {
    const pending = new Map();
    await callback({ get: async ref => snap(ref, records.get(ref)), set: (ref, value) => pending.set(ref, clone(value)) });
    if (failCommit) throw new Error('Commit failed');
    for (const [ref, value] of pending) records.set(ref, value);
  },
};
globalThis.__reportApi = api;
const url = new URL('../src/services/reportingService.js', import.meta.url).href;
const dataModule = code => `data:text/javascript,${encodeURIComponent(code)}`;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL === url && specifier === '../firebase') return { shortCircuit: true, url: dataModule('export const db = {}; export const auth = { currentUser: { uid: "admin", email: "admin@example.test" } };') };
  if (context.parentURL === url && specifier === 'firebase/firestore') return { shortCircuit: true, url: dataModule(`export const { ${Object.keys(api).join(', ')} } = globalThis.__reportApi;`) };
  return next(specifier, context);
} });
const service = await import(url);
beforeEach(() => { records = new Map(); listeners = []; role = 'Admin'; failCommit = false; });
const emit = (listener, documents = []) => listener.onData({ docs: documents.map(d => snap(d.id, d)) });

test('report queries use Malaysia bounds and only one inequality field per query', () => {
  const queries = service.reportingQueries('2026-10-01', '2026-10-28');
  assert.equal(queries.ordersByTime.filters[0].value, '2026-09-30T16:00:00.000Z');
  assert.equal(queries.ordersByTime.filters[1].value, '2026-10-28T15:59:59.999Z');
  for (const query of Object.values(queries)) assert.ok(new Set((query.filters || []).map(f => f.key)).size <= 1);
  assert.throws(() => service.reportingQueries('invalid', '2026-10-28'), /valid/);
});
test('all sources must arrive before publishing, orders deduplicate, later snapshots refresh totals', () => {
  const received = [];
  const stop = service.subscribeReporting('2026-10-01', '2026-10-28', data => received.push(data), assert.fail);
  listeners.slice(0, -1).forEach(l => emit(l, l.ref.name === 'sales_orders' ? [{ id: 'same', total: 5 }] : []));
  assert.equal(received.length, 0);
  emit(listeners.at(-1)); assert.equal(received.length, 1); assert.equal(received[0].orders.length, 1);
  emit(listeners[0], [{ id: 'same', total: 10 }]); assert.equal(received.at(-1).orders[0].total, 10);
  stop(); assert.ok(listeners.every(l => !l.active));
});
test('failed sources clear subscriptions instead of publishing misleading partial data', () => {
  const received = [], errors = [];
  service.subscribeReporting('2026-10-01', '2026-10-28', d => received.push(d), e => errors.push(e));
  listeners[2].onError(new Error('Permission denied'));
  listeners.forEach(l => emit(l));
  assert.equal(received.length, 0); assert.match(errors[0].message, /reports.*Permission denied/); assert.ok(listeners.every(l => !l.active));
});
test('unsubscribe discards late responses during date switches', () => {
  let count = 0;
  const stop = service.subscribeReporting('2026-10-01', '2026-10-28', () => count++, assert.fail);
  stop(); listeners.forEach(l => emit(l)); assert.equal(count, 0);
});
test('cached sources stay labelled until every source is server-confirmed', () => {
  const received = [];
  service.subscribeReporting('2026-10-01', '2026-10-28', value => received.push(value), assert.fail);
  listeners.forEach(listener => listener.onData({ docs: [], metadata: { fromCache: true } }));
  assert.equal(received.at(-1).fromCache, true);
  listeners.forEach(listener => listener.onData({ docs: [], metadata: { fromCache: false } }));
  assert.equal(received.at(-1).fromCache, false);
});
test('cost save is admin-only, accepts zero, versions by effective date, and detects concurrent edits', async () => {
  const rates = { rent: 20, utilities: 0, wifi: 1 };
  role = 'Staff'; await assert.rejects(service.saveReportingOverhead('2026-11-01', rates), /administrators/); assert.equal(records.size, 0);
  role = 'Admin'; await service.saveReportingOverhead('2026-11-01', rates);
  assert.equal(records.get('reporting_cost_rates/2026-11-01').rates.utilities, 0);
  assert.equal(records.get('reporting_cost_rates/2026-11-01').revision, 1);
  await assert.rejects(service.saveReportingOverhead('2026-11-01', rates), /another session/);
  await service.saveReportingOverhead('2026-12-01', { ...rates, rent: 25 });
  assert.equal(records.size, 2); assert.equal(records.get('reporting_cost_rates/2026-11-01').rates.rent, 20);
});
test('failed commits and invalid rates leave existing costs unchanged', async () => {
  failCommit = true;
  await assert.rejects(service.saveReportingOverhead('2026-10-28', { rent: 20, utilities: 10, wifi: 1 }), /Commit failed/);
  assert.equal(records.size, 0);
  await assert.rejects(service.saveReportingOverhead('2026-10-28', { rent: -1, utilities: 10, wifi: 1 }), /Rent/);
});
