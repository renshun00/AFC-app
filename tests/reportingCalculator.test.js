import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateReportSales, buildReport, calculateReportCos, businessDate, monthPeriod, validatePeriod, overheadForDate, validateOverhead, reportCsv, DEFAULT_OVERHEAD } from '../src/utils/reportingCalculator.js';
import { DEFAULT_PAYROLL_RATES } from '../src/utils/payrollCalculator.js';
import { getFixedDailyCost } from '../src/utils/dailyFlowCalculator.js';

const date = '2026-10-28';
const ingredient = (name, amount, unit) => ({ inventoryItemName: name, qtyPerUnit: amount, unit });
const order = (overrides = {}) => ({ id: 'order-1', date, status: 'completed', total: 100, paymentMethod: 'cash', items: [
  { menuItemId: 'chicken', name: 'Chicken', qty: 9, price: 5, recipe: [ingredient('Chicken (Pieces)', 1, 'pcs')] },
], ...overrides });
const entry = { staffId: 'a', basePay: 70, bonusPay: 0, mealTreatment: 'salary_advance', managementTreatment: 'reporting_only', mealAdvance: 10, cashAdvance: 20, friedDeduction: 15 };
const baseline = () => ({ from: date, to: date, today: date, orders: [order()], reports: [{ date, status: 'submitted', data: { remaining_fried: { chicken_pcs: 1 }, raw_materials: { tube_ice: 1, oil_topup_packet: 2 } } }], payrollDays: [{ date, entries: [entry], rates: DEFAULT_PAYROLL_RATES }] });

test('Malaysia trading dates override upload dates; month ranges handle leap years and current cutoff', () => {
  assert.equal(businessDate({ createdAt: '2026-10-27T16:30:00Z' }), date);
  assert.equal(businessDate({ date: '2026-10-27', createdAt: '2026-10-27T16:30:00Z' }), '2026-10-27');
  assert.deepEqual(monthPeriod('2024-02', date), { from: '2024-02-01', to: '2024-02-29' });
  assert.equal(monthPeriod('2026-10', date).to, date);
  assert.throws(() => validatePeriod('2026-02-30', date), /valid/);
  assert.throws(() => validatePeriod(date, '2026-10-01'), /valid/);
  assert.throws(() => validatePeriod('2024-01-01', date), /366/);
});
test('POS is authoritative, duplicates and cancelled orders do not inflate revenue', () => {
  const input = baseline();
  input.orders.push(order(), order({ id: 'void', status: 'cancelled', total: 999 }));
  input.reports[0].data.brought_to_stall = { chicken_pcs: 999 };
  const result = buildReport(input);
  assert.equal(result.totals.revenue, 100);
  assert.equal(result.orderCount, 1);
  assert.equal(result.sold.chicken_pcs, 9);
});
test('recipe quantities keep neck sets, chicken whole birds, and pieces distinct', () => {
  const result = aggregateReportSales([order({ items: [{ name: 'Combo', qty: 2, price: 50, recipe: [ingredient('Chicken (Whole)', 1, 'whole'), ingredient('Chicken Neck', 4, 'pcs'), ingredient('Mushroom', 1, 'set')] }] })]);
  assert.equal(result.sold.chicken_pcs, 18);
  assert.equal(result.sold.neck, 2);
  assert.equal(result.sold.mushroom, 2);
  assert.deepEqual(result.issues, []);
});
test('missing recipes and incompatible mass units block cost/profit instead of understating them', () => {
  for (const recipe of [[], [ingredient('Cheese Sauce', 20, 'g')]]) {
    const input = baseline(); input.orders = [order({ items: [{ name: 'Combo', qty: 1, price: 100, recipe }] })];
    const result = buildReport(input);
    assert.equal(result.totals.costOfSales, null); assert.equal(result.totals.netGain, null); assert.equal(result.totals.revenue, 100);
  }
});
test('discount allocation reconciles line revenue exactly to order total', () => {
  const result = aggregateReportSales([order({ total: 10, items: ['a', 'b', 'c'].map(id => ({ menuItemId: id, name: id, qty: 1, price: 5, recipe: [ingredient('Chicken (Pieces)', 1, 'pcs')] })) })]);
  assert.deepEqual(result.menu.map(i => i.revenue), [3.33, 3.33, 3.34]);
  assert.equal(result.payments[0].value, 10);
});
test('G1 modeled cost includes fried waste, ice and oil exactly once, with royalty removed', () => {
  const result = buildReport(baseline());
  assert.equal(result.totals.costOfSales, 36.13);
  assert.equal(result.totals.overhead, 30.45);
  assert.equal(getFixedDailyCost().toFixed(2), '30.45');
  assert.equal(result.totals.netGain, -136.58);
});
test('rice bag price converts to kg and supplier receipt weight is not consumed weight', () => {
  const cost = calculateReportCos({ butter_rice: 1, chicken_pcs: 1 }, {}, { chicken_kg: 999 });
  assert.equal(cost.chickenKg, .237);
  assert.equal(cost.breakdown.find(b => b.name === 'Rice, butter & milk').value, .71);
});
test('StaffCosts uses gross wages, not salary advances or penalties, and management once per date', () => {
  const input = baseline(); input.payrollDays[0].entries.push({ ...entry, staffId: 'b' });
  const result = buildReport(input);
  assert.equal(result.totals.employeeWages, 140); assert.equal(result.totals.managementFee, 100); assert.equal(result.totals.staffCosts, 240);
  input.payrollDays[0].managementFeeApplied = false;
  assert.equal(buildReport(input).totals.staffCosts, 140);
});
test('legacy payroll fallback deduplicates staff and excludes management and meal allowance from earnings', () => {
  const input = baseline(); input.payrollDays = [];
  input.payroll = [{ date, staffId: 'a', basePay: 180, breakdown: { meal: 10, management: 100 }, rates: DEFAULT_PAYROLL_RATES, managementFeeForDay: 100 }];
  input.payroll.push({ ...input.payroll[0] });
  assert.equal(buildReport(input).totals.staffCosts, 170);
});
test('saved payroll day takes precedence over separate employee documents', () => {
  const input = baseline(); input.payroll = [{ ...entry, date, basePay: 9999 }];
  assert.equal(buildReport(input).totals.staffCosts, 170);
});
test('missing or draft closing and missing payroll cannot report complete net gain', () => {
  for (const change of [input => { input.reports = []; }, input => { input.reports[0].status = 'draft'; }, input => { input.payrollDays = []; }]) {
    const input = baseline(); change(input);
    const result = buildReport(input); assert.equal(result.totals.netGain, null); assert.equal(result.pending.length, 1); assert.equal(result.daily[0].totalCost, null);
  }
});
test('missing POS history is flagged instead of inferring sales from opening stock', () => {
  const input = baseline(); input.orders = []; input.reports[0].data.brought_to_stall = { chicken_pcs: 50 };
  const result = buildReport(input);
  assert.equal(result.totals.revenue, 0); assert.equal(result.totals.netGain, null); assert.match(result.pending[0].issues.join(' '), /no completed POS/);
});
test('cost changes take effect prospectively, preserve zero rates, and keep Saturdays overhead-only', () => {
  const versions = [{ effectiveFrom: '2026-10-28', rates: { rent: 20, utilities: 0, wifi: 2 } }];
  assert.deepEqual(overheadForDate('2026-10-27', versions), DEFAULT_OVERHEAD);
  assert.equal(overheadForDate(date, versions).utilities, 0);
  const result = buildReport({ from: '2026-10-24', to: date, today: date, overhead: versions });
  assert.equal(result.daily[0].netGain, -30.45); assert.equal(result.totals.overhead, 143.8);
  assert.equal(result.daily.at(-1).netGain, -22);
  assert.throws(() => validateOverhead({ rent: '', utilities: 10, wifi: 1 }), /Rent/);
});
test('future dates do not accrue overhead or sales', () => {
  const result = buildReport({ ...baseline(), from: '2026-10-29', to: '2026-10-30' });
  assert.equal(result.totals.revenue, 0); assert.equal(result.totals.overhead, 0); assert.equal(result.totals.netGain, 0);
});
test('additional expenses count once while modeled categories and royalty are excluded', () => {
  const input = baseline(); input.expenses = [{ date, categoryId: 'maintenance', amount: 20 }, { date, categoryId: 'rental', amount: 600 }, { date, categoryId: 'royalty', amount: 10 }];
  const result = buildReport(input); assert.equal(result.totals.extraExpenses, 20); assert.equal(result.totals.excludedExpenses, 610); assert.equal(result.totals.netGain, -156.58);
});
test('CSV preserves missing amounts as blank, escapes formulas and quotes, and keeps units explicit', () => {
  const result = buildReport(baseline());
  result.menu = [{ name: '=HYPERLINK("bad")', quantity: 1, revenue: 100 }];
  assert.match(reportCsv(result, 'menu'), /"'=HYPERLINK\(""bad""\)"/);
  assert.match(reportCsv(result, 'waste'), /Neck \(sets\)/);
  assert.match(reportCsv(buildReport({ ...baseline(), payrollDays: [] })), /Payroll not saved/);
  assert.doesNotMatch(reportCsv(result), /NaN|undefined/);
});
