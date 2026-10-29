import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DEFAULT_PAYROLL_RATES, newPayrollEntry } from '../src/utils/payrollCalculator.js';

// Exercise the real service with a small transactional Firestore adapter.
// No Firebase network requests or production writes are made by these tests.
let records, calls, failQueries, failCommit, role;
const copy = value => structuredClone(value);
const snapshot = (id, value) => ({ id, exists: () => value !== undefined, data: () => copy(value) });
const backend = {
  collection: (_, name) => name,
  doc: (_, name, id) => `${name}/${id}`,
  where: (key, op, value) => ({ key, op, value }),
  query: (name, ...filters) => ({ name, filters }),
  Timestamp: { fromDate: date => date.toISOString() },
  getDocFromServer: async ref => {
    calls.push(['get', ref]);
    return snapshot(ref.split('/').at(-1), ref === 'staff/admin' ? { role } : records.get(ref));
  },
  getDocsFromServer: async q => {
    if (failQueries) throw new Error('Source unavailable');
    const { name, filters = [] } = typeof q === 'string' ? { name: q } : q;
    calls.push(['query', name]);
    const docs = [...records].filter(([key, value]) => key.startsWith(`${name}/`) && filters.every(f => {
      if (f.op === '==') return value[f.key] === f.value;
      if (f.op === '>=') return value[f.key] >= f.value;
      if (f.op === '<=') return value[f.key] <= f.value;
      throw new Error(`Unsupported filter ${f.op}`);
    })).map(([key, value]) => snapshot(key.split('/').at(-1), value));
    return { docs, size: docs.length };
  },
  setDoc: async (ref, value) => { records.set(ref, copy(value)); },
  onSnapshot: (q, onData, onError) => {
    let active = true;
    backend.getDocsFromServer(q).then(snap => { if (active) onData(snap); }, error => { if (active) onError(error); });
    return () => { active = false; };
  },
  runTransaction: async (_, callback) => {
    const pending = new Map();
    await callback({ get: async ref => snapshot(ref, records.get(ref)), set: (ref, value) => pending.set(ref, copy(value)) });
    if (failCommit) throw new Error('Commit failed');
    for (const [ref, value] of pending) records.set(ref, value);
  },
};
globalThis.__payrollFirestore = backend;
const serviceURL = new URL('../src/services/payrollService.js', import.meta.url).href;
const moduleURL = code => `data:text/javascript,${encodeURIComponent(code)}`;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL === serviceURL && specifier === '../firebase') return { shortCircuit: true, url: moduleURL('export const db = {}; export const auth = { currentUser: { uid: "admin", email: "admin@example.test" } };') };
  if (context.parentURL === serviceURL && specifier === 'firebase/firestore') return { shortCircuit: true, url: moduleURL(`export const { ${Object.keys(backend).join(', ')} } = globalThis.__payrollFirestore;`) };
  return next(specifier, context);
} });
const service = await import(serviceURL);
const date = '2026-10-28';
const source = { chickenWhole: 12, carcassKg: 7, chickenPieces: 90, mushroomSets: 5, friedPieces: 0, reportExists: true, reportStatus: 'submitted', orderCount: 1, issues: [], loadedAt: '2026-10-28T12:00:00Z' };
const member = { id: 'adi', name: 'Adi', payrollDuties: { operation: true, washChicken: true, overtime: true } };
const attendance = { present: true, pending: false, invalid: false, workedMinutes: 530, shifts: [] };
const day = () => ({ date, revision: 0, rates: copy(DEFAULT_PAYROLL_RATES), sources: source, entries: [newPayrollEntry(member, attendance, date)] });

beforeEach(() => { records = new Map(); calls = []; failQueries = false; failCommit = false; role = 'Admin'; });

test('saving commits daily records and dashboard summaries together with reviewed rates', async () => {
  const saved = await service.savePayrollDay(day());
  assert.equal(saved.entries[0].totalPay, 54.5);
  assert.equal(records.get(`daily_payroll/${date}_adi`).totalPay, 54.5);
  assert.equal(records.get(`payroll_summary/adi_${date}`).wage, 54.5);
  assert.equal(records.get(`payroll_days/${date}`).revision, 1);
  assert.equal(records.get(`daily_payroll/${date}_adi`).rates.washChicken, 1);
});

test('failed commit leaves no partial wages or dashboard totals', async () => {
  failCommit = true;
  await assert.rejects(service.savePayrollDay(day()), /Commit failed/);
  assert.equal(records.size, 0);
});

test('stale concurrent saves are rejected; deliberate revisions replace rather than duplicate wages', async () => {
  const saved = await service.savePayrollDay(day());
  await assert.rejects(service.savePayrollDay(day()), /another administrator/);
  const revised = { ...saved, entries: saved.entries.map(e => ({ ...e, bonus: 10 })) };
  await service.savePayrollDay(revised);
  assert.equal(records.size, 4);
  assert.equal(records.get(`payroll_summary/adi_${date}`).wage, 64.5);
});

test('non-admin profile cannot save payroll or rates', async () => {
  role = 'Staff';
  await assert.rejects(service.savePayrollDay(day()), /Only administrators/);
  await assert.rejects(service.savePayrollRates(DEFAULT_PAYROLL_RATES), /Only administrators/);
  assert.equal(records.size, 0);
});

test('invalid inputs cannot be persisted', async () => {
  const invalid = day(); invalid.entries[0].bonus = -10;
  await assert.rejects(service.savePayrollDay(invalid), /nonnegative/);
  assert.equal(records.size, 0);
});

test('saved payroll reopens with original amounts even when default rates change', async () => {
  const saved = await service.savePayrollDay(day());
  await service.savePayrollRates({ ...DEFAULT_PAYROLL_RATES, washChicken: 8 });
  records.set('staff/adi', member);
  const loaded = await service.loadPayrollDay(date);
  assert.equal(loaded.saved, true);
  assert.equal(loaded.rates.washChicken, 8);
  assert.equal(loaded.day.rates.washChicken, 1);
  assert.equal(loaded.day.entries[0].totalPay, saved.entries[0].totalPay);
  assert.ok(!calls.some(([action, name]) => action === 'query' && name === 'sales_orders'));
});

test('date and timestamp order queries deduplicate and ignore cancelled/other-day orders', async () => {
  const order = { date, status: 'completed', createdAt: '2026-10-28T05:00:00.000Z', items: [{ name: 'Two pieces', qty: 2, recipe: [{ inventoryItemName: 'Chicken pieces', qtyPerUnit: 2, unit: 'pcs' }] }] };
  records.set('sales_orders/current', order);
  records.set('sales_orders/cancelled', { ...order, status: 'cancelled' });
  records.set('sales_orders/other-date', { ...order, date: '2026-10-27' });
  const sales = await service.getStaffDailySales(date);
  assert.equal(sales.chickenPieces, 4);
  assert.equal(sales.orderCount, 1);
});

test('source read failure is propagated rather than returned as zero sales', async () => {
  failQueries = true;
  await assert.rejects(service.getStaffDailySales(date), /Source unavailable/);
});

test('refresh of saved payroll uses latest receipts and attendance but retains assignments', async () => {
  await service.savePayrollDay(day());
  records.set('staff/adi', member);
  records.set(`daily_inventory/${date}`, { status: 'submitted', data: { raw_materials: { chicken_whole: 20, carcass_kg: 9 } } });
  records.set('staff_shifts/new', { staffId: 'adi', clockIn: '2026-10-28T05:00:00.000Z', clockOut: '2026-10-28T14:00:00.000Z' });
  const loaded = await service.loadPayrollDay(date, true);
  assert.equal(loaded.saved, false);
  assert.equal(loaded.day.sources.chickenWhole, 20);
  assert.equal(loaded.day.entries[0].attendance.workedMinutes, 540);
  assert.equal(loaded.day.entries[0].duties.washChicken, true);
  assert.equal(loaded.day.revision, 1);
});

test('legacy daily records retain that date\'s duties and adjustments without inventing attendance', async () => {
  records.set('staff/adi', member);
  records.set(`daily_payroll/${date}_adi`, { date, staffId: 'adi', staffName: 'Adi', totalPay: 47,
    checkIn: '13:00', checkOut: '22:00', tasks: [
      { task: 'Basuh Ayam', qty: 10, bonus: 2 }, { task: 'Pinjam Duit', qty: 5 }, { task: 'Meal Advance', qty: 1 },
    ] });
  const loaded = await service.loadPayrollDay(date);
  const restored = loaded.day.entries[0];
  assert.equal(restored.legacyTotal, 47);
  assert.equal(restored.duties.washChicken, true);
  assert.equal(restored.duties.operation, false);
  assert.equal(restored.bonus, 2);
  assert.equal(restored.cashAdvance, 5);
  assert.equal(restored.mealClaims, 1);
  assert.equal(restored.attendance.workedMinutes, 0);
});

test('monthly subscription reads saved records in the selected month and reflects newly saved advances', async () => {
  const current = day(); current.entries[0].mealClaims = 1;
  await service.savePayrollDay(current);
  records.set('daily_payroll/other', { date: '2026-11-01', staffId: 'adi', totalPay: 999 });
  let stop;
  const summary = await new Promise((resolve, reject) => { stop = service.subscribeMonthlyPayroll('2026-10', resolve, reject); });
  stop();
  assert.equal(summary.grossPay, 54.5);
  assert.equal(summary.mealAdvance, 10);
  assert.equal(summary.totalPay, 44.5);
  assert.equal(summary.dates.length, 1);
  assert.equal(records.get(`daily_payroll/${date}_adi`).schemaVersion, 4);
});

test('monthly read failures reach the error handler rather than displaying zero wages', async () => {
  failQueries = true;
  let stop;
  await assert.rejects(new Promise((resolve, reject) => { stop = service.subscribeMonthlyPayroll('2026-10', resolve, reject); }), /Source unavailable/);
  stop();
});

test('opening old saved payroll corrects Pinjam Makan without writing cloud records', async () => {
  const old = day();
  old.entries = [{ ...old.entries[0], basePay: 50, bonusPay: 0, deductions: 0, totalPay: 50, mealClaims: 1, breakdown: { operation: 40, meal: 10 } }];
  records.set(`payroll_days/${date}`, old);
  const loaded = await service.loadPayrollDay(date);
  assert.equal(loaded.day.entries[0].totalPay, 30);
  assert.equal(loaded.day.entries[0].mealCorrectionApplied, true);
  assert.equal(records.get(`payroll_days/${date}`).entries[0].totalPay, 50);
});

test('daily save commits the separate management reporting cost without increasing staff payout', async () => {
  const draft = day(); draft.entries[0].duties.management = true;
  const saved = await service.savePayrollDay(draft);
  assert.equal(saved.entries[0].totalPay, 54.5);
  assert.equal(saved.staffCosts.totalStaffCosts, 154.5);
  assert.equal(records.get(`staff_cost_summary/${date}`).managementFee, 100);
  assert.equal(records.get(`daily_payroll/${date}_adi`).managementFeeForDay, 100);
  assert.equal(records.get(`payroll_summary/adi_${date}`).wage, 54.5);
  await service.savePayrollDay({ ...saved, managementFeeApplied: false });
  assert.equal(records.get(`staff_cost_summary/${date}`).managementFee, 0);
  assert.equal(records.get(`staff_cost_summary/${date}`).totalStaffCosts, 54.5);
  assert.equal(records.get(`daily_payroll/${date}_adi`).managementFeeForDay, 0);
});
