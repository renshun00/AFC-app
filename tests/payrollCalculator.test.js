import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PAYROLL_RATES as defaults, validateRates, calculateJagaGeraiPay, calculateOTPay,
  attendanceForDay, aggregatePayrollSales, receivingForPayroll, newPayrollEntry,
  calculateDailyPayroll, calculateStaffCosts, payrollIssues, calculateStaffDailyPay, dutiesFromProfile, normalizeSavedPayroll, summarizeMonthlyPayroll,
} from '../src/utils/payrollCalculator.js';

const date = '2026-10-28';
const attendance = { present: true, pending: false, invalid: false, workedMinutes: 530, shifts: [] };
const sources = { chickenWhole: 5, carcassKg: 7.25, chickenPieces: 90, mushroomSets: 10, friedPieces: 0, reportExists: true, reportStatus: 'submitted', issues: [] };
const entry = (id, duties = {}) => ({ staffId: id, staffName: id, duties, bonus: 0, cashAdvance: 0, mealClaims: 0, note: '', attendance });
const shift = (id, start, end) => ({ id, clockIn: start, clockOut: end });

test('all ten operation bands match G1, including rounding boundaries and extremes', () => {
  for (const [birds, pay] of [[0, 30], [5, 30], [6, 30], [7, 35], [8, 35], [9, 40], [10, 40], [11, 45], [12, 45], [13, 50], [15, 50], [16, 55], [21, 55], [22, 60], [27, 60], [28, 65], [33, 65], [34, 70], [39, 70], [40, 80], [45, 80], [46, 80]]) {
    assert.equal(calculateJagaGeraiPay(birds * 9), pay, `${birds} birds`);
  }
  assert.equal(calculateJagaGeraiPay(58), 30);
  assert.equal(calculateJagaGeraiPay(59), 35);
  assert.equal(calculateJagaGeraiPay(76), 35);
  assert.equal(calculateJagaGeraiPay(77), 40);
});

test('OT uses exact minutes, supports overnight, and never subtracts for short shifts', () => {
  assert.equal(calculateOTPay(13, 20, 22, 10), 2.50);
  assert.equal(calculateOTPay(13, 15, 22, 10), 2.75);
  assert.equal(calculateOTPay(13, 0, 21, 1), 0.05);
  assert.equal(calculateOTPay(13, 0, 20, 55), 0);
  assert.equal(calculateOTPay(13, 0, 21, 0), 0);
  assert.equal(calculateOTPay(20, 0, 4, 30), 1.50);
});

test('G1 first-day example with exact-minute correction and two assigned washers', () => {
  const result = calculateDailyPayroll([
    entry('adi', { washChicken: true, operation: true, mushroom: true, overtime: true }),
    entry('mar', { washChicken: true }), entry('sue', { management: true }),
  ], { ...sources, carcassKg: 0 });
  assert.equal(result[0].totalPay, 50); // G1 I6 is 49.99 because OT hours were rounded early.
  assert.equal(result[1].totalPay, 2.5);
  assert.equal(result[2].totalPay, 0);
  assert.equal(result.reduce((sum, r) => sum + r.totalPay, 0), 52.5);
  assert.deepEqual(calculateStaffCosts(date, result), { employeeWages: 52.5, managementFee: 100, totalStaffCosts: 152.5 });
});

test('washing pays full RM1 pool to a sole washer and splits by duty participants', () => {
  const result = calculateDailyPayroll([
    entry('a', { washChicken: true, washCarcass: true }),
    entry('b', { washCarcass: true }), entry('c'),
  ], sources);
  assert.equal(result[0].breakdown.washChicken, 5);
  assert.equal(result[0].breakdown.washCarcass, 3.63);
  assert.equal(result[1].breakdown.washCarcass, 3.62);
  assert.equal(result[1].breakdown.washChicken, 0);
  assert.equal(result[2].totalPay, 0);
});

test('three-way washing shares preserve the pool exactly, regardless of display order', () => {
  const members = ['c', 'a', 'b'].map(id => entry(id, { washChicken: true }));
  const result = calculateDailyPayroll(members, { ...sources, chickenWhole: 1 });
  assert.deepEqual(Object.fromEntries(result.map(e => [e.staffId, e.totalPay])), { c: 0.33, a: 0.34, b: 0.33 });
  assert.equal(result.reduce((sum, e) => sum + Math.round(e.totalPay * 100), 0), 100);
});

test('attendance merges overlapping shifts, excludes breaks, and counts an overnight shift on clock-in date', () => {
  const shifts = [
    shift('a', `${date}T10:00:00+08:00`, `${date}T14:00:00+08:00`),
    shift('duplicate', `${date}T10:00:00+08:00`, `${date}T14:00:00+08:00`),
    shift('overlap', `${date}T13:00:00+08:00`, `${date}T15:00:00+08:00`),
    shift('b', `${date}T21:00:00+08:00`, '2026-10-29T01:00:00+08:00'),
    shift('next', '2026-10-29T02:00:00+08:00', '2026-10-29T03:00:00+08:00'),
  ];
  const a = attendanceForDay(shifts, date);
  assert.equal(a.workedMinutes, 540);
  assert.equal(a.pending, false);
  const [pay] = calculateDailyPayroll([{ ...entry('a', { overtime: true }), attendance: a }], sources);
  assert.equal(pay.breakdown.overtime, 3);
});

test('Malaysia date boundary works with Firestore timestamp-like values', () => {
  const a = attendanceForDay([shift('early', { toDate: () => new Date('2026-10-27T16:05:00Z') }, { toDate: () => new Date('2026-10-28T00:06:00Z') })], date);
  assert.equal(a.workedMinutes, 481);
  assert.equal(a.present, true);
});

test('open and reversed shifts cannot silently create finalized OT', () => {
  for (const end of [null, `${date}T12:00:00+08:00`]) {
    const a = attendanceForDay([shift('open', `${date}T13:00:00+08:00`, end)], date);
    assert.equal(a.workedMinutes, 0);
    assert.ok(payrollIssues([{ ...entry('a', { overtime: true }), attendance: a }], sources).some(s => s.includes('attendance')));
  }
});

test('short or absent shifts do not deduct operation wages or invent OT', () => {
  for (const minutes of [0, 475, 480]) {
    const [pay] = calculateDailyPayroll([{ ...entry('a', { operation: true, overtime: true }), attendance: { ...attendance, workedMinutes: minutes } }], sources);
    assert.equal(pay.totalPay, 40);
    assert.equal(pay.breakdown.overtime, 0);
  }
});

test('completed recipe sales count bundles and whole birds without counting carcasses/necks twice', () => {
  const items = [{ name: 'Combo', qty: 3, recipe: [
    { inventoryItemName: 'Chicken (Pieces)', qtyPerUnit: 2, unit: 'PCS' },
    { inventoryItemName: 'Mushroom', qtyPerUnit: 1, unit: 'set' },
    { inventoryItemName: 'Chicken Carcass', qtyPerUnit: 1, unit: 'pcs' },
    { inventoryItemName: 'Chicken Neck', qtyPerUnit: 4, unit: 'pcs' },
    { inventoryItemName: 'Chicken seasoning', qtyPerUnit: 10, unit: 'g' },
  ] }, { name: 'Bird', qty: 2, recipe: [{ inventoryItemName: 'Ayam', qtyPerUnit: 1, unit: 'whole' }] }];
  const orders = [{ date, status: 'completed', items }, { date, status: 'cancelled', items }, { date: '2026-10-27', status: 'completed', items }];
  const result = aggregatePayrollSales(orders, date);
  assert.equal(result.chickenPieces, 24);
  assert.equal(result.mushroomSets, 3);
  assert.equal(result.orderCount, 1);
  assert.deepEqual(result.issues, []);
});

test('zero recipe quantities stay zero, while unknown units and missing recipes require review', () => {
  const result = aggregatePayrollSales([{ date, status: 'completed', items: [
    { name: 'Zero', qty: 10, recipe: [{ inventoryItemName: 'Chicken pieces', qtyPerUnit: 0, unit: 'pcs' }] },
    { name: 'Weight', qty: 1, recipe: [{ inventoryItemName: 'Chicken', qtyPerUnit: 1, unit: 'kg' }] },
    { name: 'Chicken combo', qty: 1 },
  ] }], date);
  assert.equal(result.chickenPieces, 0);
  assert.equal(result.issues.length, 2);
});

test('legacy order timestamps use Malaysia date but never override an explicit business date', () => {
  const items = [{ name: 'Chicken', qty: 1, recipe: [{ inventoryItemName: 'Chicken pieces', qtyPerUnit: 1, unit: 'pcs' }] }];
  const result = aggregatePayrollSales([
    { status: 'completed', createdAt: '2026-10-27T16:01:00Z', items },
    { date: '2026-10-27', status: 'completed', createdAt: '2026-10-27T16:01:00Z', items },
  ], date);
  assert.equal(result.chickenPieces, 1);
});

test('washing sources exclude carryover and do not add pieces to whole-bird receipts', () => {
  const received = receivingForPayroll({ status: 'submitted', data: {
    raw_materials: { chicken_whole: 12, chicken_pcs: 96, carcass_kg: 7, carcass_pcs: 20 },
    brought_to_stall: { chicken_pcs: 200, carcass_pcs: 50 },
    remaining_fried: { chicken_pcs: 3, carcass_pcs: 2, neck: 30, mushroom: 10 },
  } });
  assert.equal(received.chickenWhole, 12);
  assert.equal(received.carcassKg, 7);
  assert.equal(received.friedPieces, 5);
  assert.equal(received.needsChickenCount, false);
});

test('missing carcass kg or whole counts blocks assigned washing rather than guessing weight/yield', () => {
  const source = receivingForPayroll({ data: { raw_materials: { carcass_pcs: 10, chicken_pcs: 90 } } });
  const issues = payrollIssues([entry('a', { washChicken: true, washCarcass: true })], source);
  assert.equal(issues.length, 2);
  assert.deepEqual(payrollIssues([entry('a', { operation: true })], source), []);
  assert.ok(payrollIssues([entry('a', { washChicken: true })], receivingForPayroll(null)).length > 0);
});

test('Saturday and inactive/unattended staff have no default operating wages', () => {
  const member = { id: 'a', name: 'A', tasks: [{ task: 'JAGA GERAI' }, { task: 'BASUH AYAM' }] };
  assert.equal(newPayrollEntry(member, attendance, date).duties.operation, true);
  assert.equal(newPayrollEntry(member, attendance, '2026-10-31').duties.operation, false);
  assert.equal(newPayrollEntry(member, { ...attendance, present: false }, date).duties.operation, false);
  assert.equal(newPayrollEntry({ ...member, status: 'inactive' }, attendance, date).duties.operation, false);
  assert.equal(newPayrollEntry(member, attendance, '2026-11-01').duties.operation, true);
});

test('management is a reporting fee and never an employee wage', () => {
  const [pay] = calculateDailyPayroll([entry('a', { management: true })], { ...sources, chickenPieces: 0 });
  assert.equal(pay.totalPay, 0);
  assert.equal(pay.duties.management, undefined);
  assert.equal(calculateStaffDailyPay({ role: 'pengurusan', ayamKetulTerjual: 54 }).totalPay, 0);
  assert.equal(calculateStaffDailyPay({ role: 'pengurusan' }).managementCost, 100);
});

test('fried penalty uses combined five-piece threshold and preserves explicit adjustments', () => {
  const staff = entry('a', { operation: true, friedPenalty: true });
  staff.bonus = 2; staff.cashAdvance = 4; staff.mealClaims = 1;
  const [four] = calculateDailyPayroll([staff], { ...sources, friedPieces: 4 });
  const [five] = calculateDailyPayroll([staff], { ...sources, friedPieces: 5 });
  assert.equal(four.totalPay, 28);
  assert.equal(five.totalPay, 15.5);
  assert.equal(five.friedDeduction, 12.5);
  assert.ok(payrollIssues([staff], { ...sources, reportStatus: 'draft' }).some(s => s.includes('closing')));
});

test('each editable rate changes its calculation, including zero rates', () => {
  const rates = validateRates({ ...structuredClone(defaults), washChicken: 2, washCarcass: 3, mushroom: 1,
    overtime: 6, management: 150, standardMinutes: 500, tiers: defaults.tiers.map(t => ({ ...t, pay: 90 })) });
  const [pay] = calculateDailyPayroll([entry('a', { washChicken: true, washCarcass: true, operation: true, mushroom: true, overtime: true, management: true })], sources, rates);
  assert.deepEqual(pay.breakdown, { washChicken: 10, washCarcass: 21.75, operation: 90, mushroom: 10, overtime: 3 });
  assert.equal(calculateStaffCosts(date, [pay], rates).managementFee, 150);
  assert.equal(calculateDailyPayroll([entry('a', { management: true })], sources, { ...rates, management: 0 })[0].totalPay, 0);
  assert.equal(defaults.management, 100);
});

test('rates and adjustments reject invalid values', () => {
  for (const overtime of [-1, '', NaN, Infinity]) assert.throws(() => validateRates({ ...defaults, overtime }));
  assert.throws(() => validateRates({ ...defaults, friedDivisor: 0 }));
  assert.throws(() => validateRates({ ...defaults, tiers: defaults.tiers.map(t => ({ ...t, maxBirds: 6 })) }));
  assert.ok(payrollIssues([{ ...entry('a'), cashAdvance: -1 }], sources).length > 0);
});

test('Malay aliases select duties but do not repeat yesterday\'s advances or bonuses', () => {
  const member = { id: 'a', tasks: [{ task: 'BASUH AYAM', qty: 999, bonus: 20 }, { task: 'PENGURUSAN' }, { task: 'Pinjam Duit', qty: 100 }] };
  assert.equal(dutiesFromProfile(member).washChicken, true);
  const result = newPayrollEntry(member, attendance, date);
  assert.equal(result.cashAdvance, 0);
  assert.equal(result.bonus, 0);
});

test('Pinjam Makan is salary already advanced, not earned pay or a claim', () => {
  const [pay] = calculateDailyPayroll([{ ...entry('a', { operation: true }), mealClaims: 1 }], sources);
  assert.equal(pay.basePay, 40);
  assert.equal(pay.grossPay, 40);
  assert.equal(pay.mealAdvance, 10);
  assert.equal(pay.deductions, 10);
  assert.equal(pay.totalPay, 30);
  assert.equal(pay.breakdown.meal, undefined);
  assert.equal(calculateStaffDailyPay({ ayamKetulTerjual: 90, pinjamMakan: 10 }).totalPay, 30);
  assert.equal(calculateStaffDailyPay({ role: 'pengurusan', pinjamMakan: 10 }).totalPay, 0);
});

test('monthly wages of RM1500 less RM200 Pinjam Makan leaves RM1300, deducted once', () => {
  const records = Array.from({ length: 20 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    ...calculateDailyPayroll([{ ...entry('a', { operation: true }), mealClaims: 1 }], sources, { ...defaults, tiers: defaults.tiers.map(t => ({ ...t, pay: 75 })) })[0],
  }));
  const month = summarizeMonthlyPayroll(records, '2026-10');
  assert.equal(month.grossPay, 1500);
  assert.equal(month.mealAdvance, 200);
  assert.equal(month.totalPay, 1300);
  assert.equal(month.dates.length, 20);
});

test('advances larger than daily earnings are fully deducted across the month and never offset another employee', () => {
  const make = (staff, date, duties, claims) => ({ date, ...calculateDailyPayroll([{ ...entry(staff, duties), mealClaims: claims }], sources, { ...defaults, tiers: defaults.tiers.map(t => ({ ...t, pay: 100 })) })[0] });
  const records = [make('a', '2026-10-01', {}, 5), make('a', '2026-10-02', { operation: true }, 0), make('b', '2026-10-01', {}, 2)];
  const month = summarizeMonthlyPayroll(records, '2026-10');
  assert.equal(records[0].totalPay, 0);
  assert.equal(records[0].balancePay, -50);
  assert.equal(month.entries.find(e => e.staffId === 'a').totalPay, 50);
  assert.equal(month.totalPay, 50);
  assert.equal(month.excessAdvance, 20);
});

test('month totals exclude adjacent months/years, count dates once and tolerate duplicate staff/date records', () => {
  const pay = calculateDailyPayroll([{ ...entry('a'), bonus: 100 }], sources)[0];
  const records = ['2026-09-30', '2026-10-01', '2026-10-31', '2026-11-01', '2025-10-01', '2026-10-31'].map(date => ({ ...pay, date }));
  assert.equal(summarizeMonthlyPayroll(records, '2026-10').totalPay, 200);
  assert.equal(summarizeMonthlyPayroll(records, '2026-10').dates.length, 2);
  assert.equal(summarizeMonthlyPayroll(records, '2026-12').totalPay, 0);
});

test('old saved allowance is removed from earnings and deducted using its original amount', () => {
  const old = { date, staffId: 'a', staffName: 'A', basePay: 52, bonusPay: 3, cashAdvance: 5, deductions: 5,
    totalPay: 50, mealClaims: 1, breakdown: { operation: 40, meal: 12 }, rates: { ...defaults, meal: 12 } };
  const corrected = normalizeSavedPayroll(old, { ...defaults, meal: 99 });
  assert.equal(corrected.grossPay, 43);
  assert.equal(corrected.mealAdvance, 12);
  assert.equal(corrected.totalPay, 26);
  assert.equal(summarizeMonthlyPayroll([old], '2026-10').totalPay, 26);
  assert.equal(summarizeMonthlyPayroll([old], '2026-10').correctedRecords, 1);
  assert.equal(normalizeSavedPayroll(corrected).totalPay, 26);
  assert.equal(old.basePay, 52);
  assert.equal(old.breakdown.meal, 12);
});

test('zero historical meal rate and unchanged unrelated wages are preserved', () => {
  const old = { date, staffId: 'a', basePay: 40, bonusPay: 0, deductions: 0, totalPay: 40, mealClaims: 1, rates: { ...defaults, meal: 0 } };
  assert.equal(normalizeSavedPayroll(old).mealAdvance, 0);
  assert.equal(summarizeMonthlyPayroll([old], '2026-10').totalPay, 40);
});

test('StaffCosts includes one management fee for multiple employees, before advances', () => {
  const entries = calculateDailyPayroll([
    { ...entry('a', { operation: true, management: true }), mealClaims: 1 },
    entry('b', { operation: true, management: true }),
  ], sources);
  const costs = calculateStaffCosts(date, entries);
  assert.deepEqual(costs, { employeeWages: 80, managementFee: 100, totalStaffCosts: 180 });
  const monthly = summarizeMonthlyPayroll(entries.map(e => ({ ...e, date, managementFeeForDay: costs.managementFee })), '2026-10');
  assert.equal(monthly.totalPay, 70);
  assert.equal(monthly.managementFee, 100);
  assert.equal(monthly.totalStaffCosts, 180);
});

test('reporting management defaults off on Saturday and supports zero/excluded historical fees', () => {
  assert.equal(calculateStaffCosts('2026-10-31', []).managementFee, 0);
  assert.equal(calculateStaffCosts('2026-11-01', []).managementFee, 100);
  assert.equal(calculateStaffCosts(date, [], defaults, false).managementFee, 0);
  assert.equal(calculateStaffCosts(date, [], { ...defaults, management: 0 }).managementFee, 0);
  const pay = calculateDailyPayroll([entry('a', { operation: true })], sources)[0];
  assert.equal(summarizeMonthlyPayroll([{ ...pay, date, managementFeeForDay: 0 }], '2026-10').managementFee, 0);
});

test('older management wages are reclassified without erasing earned duties or double correcting', () => {
  const old = { date, staffId: 'a', staffName: 'A', mealTreatment: 'salary_advance',
    basePay: 140, bonusPay: 0, deductions: 10, mealAdvance: 10, cashAdvance: 0, totalPay: 130,
    breakdown: { operation: 40, management: 100 }, duties: { operation: true, management: true }, rates: defaults };
  const normalized = normalizeSavedPayroll(old);
  assert.equal(normalized.grossPay, 40);
  assert.equal(normalized.totalPay, 30);
  assert.equal(normalized.managementReclassified, 100);
  assert.equal(normalized.duties.management, undefined);
  assert.equal(normalizeSavedPayroll(normalized).totalPay, 30);
  const monthly = summarizeMonthlyPayroll([old], '2026-10');
  assert.equal(monthly.totalPay, 30);
  assert.equal(monthly.managementFee, 100);
  assert.equal(monthly.totalStaffCosts, 140);
  assert.equal(old.basePay, 140);
});

test('legacy Pengurusan task and profile assignments cannot grant employee pay', () => {
  const old = { basePay: 150, bonusPay: 0, deductions: 0, totalPay: 150,
    tasks: [{ task: 'Pengurusan', qty: 1 }], rates: { ...defaults, management: 150 } };
  assert.equal(normalizeSavedPayroll(old).totalPay, 0);
  assert.equal(dutiesFromProfile({ payrollDuties: { management: true } }).management, undefined);
  assert.equal(dutiesFromProfile({ tasks: [{ task: 'Pengurusan' }] }).management, undefined);
});
