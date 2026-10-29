import { getMalaysiaDate } from './dailyFlowCalculator.js';

// G1 StaffCosts E4/F4: ROUND(POS chicken pieces / 9, 0), then the tier.
export const DEFAULT_PAYROLL_RATES = {
  washChicken: 1, washCarcass: 1, mushroom: 0.5, overtime: 3,
  management: 100, standardMinutes: 480, meal: 10,
  friedPenalty: 5, friedThreshold: 5, friedDivisor: 2,
  tiers: [
    { maxBirds: 6, carcassKg: 7, pay: 30 },
    { maxBirds: 8, carcassKg: 7, pay: 35 },
    { maxBirds: 10, carcassKg: 11, pay: 40 },
    { maxBirds: 12, carcassKg: 15, pay: 45 },
    { maxBirds: 15, carcassKg: 19, pay: 50 },
    { maxBirds: 21, carcassKg: 20, pay: 55 },
    { maxBirds: 27, carcassKg: 25, pay: 60 },
    { maxBirds: 33, carcassKg: 30, pay: 65 },
    { maxBirds: 39, carcassKg: 36, pay: 70 },
    { maxBirds: 45, carcassKg: 42, pay: 80 },
  ],
};

export const DUTIES = {
  washChicken: 'Wash Chicken / Basuh Ayam',
  washCarcass: 'Wash Carcass / Basuh Rangka',
  operation: 'Stall Duty / Jaga Gerai',
  mushroom: 'Mushroom / Cendawan',
  overtime: 'Overtime / OT',
  friedPenalty: 'Fried Leftover Penalty',
};
export const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export const nonnegative = value => Math.max(0, Number(value) || 0);

export function validateRates(rates) {
  for (const key of Object.keys(DEFAULT_PAYROLL_RATES).filter(k => k !== 'tiers')) {
    if (rates[key] === '' || !Number.isFinite(Number(rates[key])) || Number(rates[key]) < 0) throw new Error(`Invalid rate: ${key}`);
  }
  if (Number(rates.friedDivisor) < 1) throw new Error('Penalty divisor must be at least 1.');
  if (!Array.isArray(rates.tiers) || rates.tiers.length !== 10) throw new Error('All ten operation tiers are required.');
  let previous = -1;
  for (const tier of rates.tiers) {
    for (const key of ['maxBirds', 'carcassKg', 'pay']) {
      if (tier[key] === '' || !Number.isFinite(Number(tier[key])) || Number(tier[key]) < 0) throw new Error('Tier values must be nonnegative numbers.');
    }
    if (!Number.isInteger(Number(tier.maxBirds)) || Number(tier.maxBirds) <= previous) throw new Error('Tier bird limits must be increasing whole numbers.');
    previous = Number(tier.maxBirds);
  }
  return {
    ...Object.fromEntries(Object.keys(DEFAULT_PAYROLL_RATES).filter(k => k !== 'tiers').map(k => [k, Number(rates[k])])),
    tiers: rates.tiers.map(t => ({ maxBirds: Number(t.maxBirds), carcassKg: Number(t.carcassKg), pay: Number(t.pay) })),
  };
}

export function calculateJagaGeraiPay(pieces, rates = DEFAULT_PAYROLL_RATES) {
  const birds = Math.round(nonnegative(pieces) / 9);
  return Number((rates.tiers.find(t => birds <= t.maxBirds) || rates.tiers.at(-1)).pay);
}

export function workedMinutesFromTimes(checkIn, checkOut) {
  if (!/^\d{2}:\d{2}$/.test(checkIn || '') || !/^\d{2}:\d{2}$/.test(checkOut || '')) return 0;
  const [ih, im] = checkIn.split(':').map(Number);
  const [oh, om] = checkOut.split(':').map(Number);
  if (ih > 23 || oh > 23 || im > 59 || om > 59) return 0;
  let minutes = oh * 60 + om - ih * 60 - im;
  if (minutes < 0) minutes += 1440;
  return minutes;
}

export function calculateOTPay(ih, im, oh, om, rates = DEFAULT_PAYROLL_RATES) {
  const time = (h, m) => `${String(h ?? 0).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
  return money(Math.max(0, workedMinutesFromTimes(time(ih, im), time(oh, om)) - rates.standardMinutes) * rates.overtime / 60);
}

function stamp(value) {
  return value?.toDate ? value.toDate() : new Date(value);
}

// Attribute an overnight shift to the Malaysia date of clock-in. Merge overlaps
// so duplicate/overlapping shift records cannot inflate paid minutes.
export function attendanceForDay(shifts, date) {
  const relevant = shifts.filter(s => s.clockIn && getMalaysiaDate(stamp(s.clockIn)) === date);
  const intervals = relevant.filter(s => s.clockOut).map(s => [stamp(s.clockIn).getTime(), stamp(s.clockOut).getTime()])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end >= start).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  return {
    workedMinutes: Math.floor(merged.reduce((sum, [start, end]) => sum + end - start, 0) / 60000),
    pending: relevant.some(s => !s.clockOut),
    invalid: relevant.some(s => s.clockOut && stamp(s.clockOut) < stamp(s.clockIn)),
    present: relevant.length > 0,
    shifts: relevant.map(s => ({ id: s.id, clockIn: stamp(s.clockIn).toISOString(), clockOut: s.clockOut ? stamp(s.clockOut).toISOString() : null })),
  };
}

export function dutiesFromProfile(member) {
  if (member.payrollDuties) return Object.fromEntries(Object.keys(DUTIES).map(key => [key, Boolean(member.payrollDuties[key])]));
  const names = (member.tasks || []).map(t => String(t.task || '').trim().toLowerCase());
  const has = (...aliases) => aliases.some(a => names.includes(a));
  return {
    washChicken: has('wash chicken', 'basuh ayam'), washCarcass: has('wash carcass', 'basuh rangka'),
    operation: has('stall duty', 'jaga gerai', 'upah jaga gerai'),
    mushroom: has('mushroom sales', 'cendawan', 'jual cendawan'),
    overtime: has('overtime (ot)', 'ot', 'stall duty', 'jaga gerai', 'upah jaga gerai'),
    friedPenalty: has('fried leftover penalty', 'baki dah goreng'),
  };
}

// Only classify actual chicken meat: necks/carcasses/seasonings are not birds.
function category(name) {
  const n = String(name || '').toLowerCase();
  if (/carcass|rangka|neck|leher|season|powder|flour|sauce|stock|perencah|tepung/.test(n)) return null;
  if (/mushroom|cendawan|enoki/.test(n)) return 'mushroomSets';
  if (/chicken|ayam/.test(n)) return 'chickenPieces';
  return null;
}

export function aggregatePayrollSales(orders, date) {
  const result = { chickenPieces: 0, mushroomSets: 0, orderCount: 0, issues: [] };
  for (const order of orders) {
    const orderDate = order.date || (order.createdAt ? getMalaysiaDate(stamp(order.createdAt)) : null);
    if (order.status !== 'completed' || orderDate !== date) continue;
    result.orderCount++;
    for (const item of order.items || []) {
      const qty = nonnegative(item.qty ?? item.quantity);
      if (!qty) continue;
      if (item.recipe?.length) {
        for (const ingredient of item.recipe) {
          const kind = category(ingredient.inventoryItemName);
          if (!kind) continue;
          const amount = Number(ingredient.qtyPerUnit);
          if (!Number.isFinite(amount) || amount < 0) {
            result.issues.push(`Invalid recipe quantity: ${item.name}`);
            continue;
          }
          if (!amount) continue;
          const unit = String(ingredient.unit || ingredient.baseUnit || '').trim().toLowerCase();
          let multiplier = 1;
          if (kind === 'chickenPieces' && ['whole', 'bird', 'birds', 'ekor'].includes(unit)) multiplier = 9;
          else if (!(kind === 'chickenPieces' ? ['pcs', 'pc', 'piece', 'pieces', 'ketul'] : ['set', 'sets', 'pcs', 'pc', 'piece', 'pieces']).includes(unit)) {
            result.issues.push(`Check ${item.name}: cannot convert ${unit || 'missing unit'} to ${kind === 'chickenPieces' ? 'chicken pieces' : 'mushroom sets'}.`);
            continue;
          }
          result[kind] += amount * qty * multiplier;
        }
      } else if (category(item.name)) {
        // A combo name cannot establish how many meat pieces or mushroom sets it contains.
        result.issues.push(`Add a recipe to ${item.name} before calculating payroll sales.`);
      }
    }
  }
  result.issues = [...new Set(result.issues)];
  return result;
}

export function receivingForPayroll(report) {
  const raw = report?.data?.raw_materials || {};
  return {
    // Never use opening stock: it includes yesterday's already-washed carryover.
    chickenWhole: nonnegative(raw.chicken_whole), carcassKg: nonnegative(raw.carcass_kg),
    needsChickenCount: nonnegative(raw.chicken_pcs) > 0 && !(Number(raw.chicken_whole) > 0),
    needsCarcassWeight: nonnegative(raw.carcass_pcs) > 0 && !(Number(raw.carcass_kg) > 0),
    friedPieces: nonnegative(report?.data?.remaining_fried?.chicken_pcs) + nonnegative(report?.data?.remaining_fried?.carcass_pcs),
    reportExists: Boolean(report), reportStatus: report?.status || 'missing',
  };
}

export function newPayrollEntry(member, attendance, date) {
  const active = member.isActive !== false && member.status !== 'inactive';
  const closed = new Date(`${date}T00:00:00Z`).getUTCDay() === 6;
  const duties = dutiesFromProfile(member);
  return {
    staffId: member.id, staffName: member.name || 'Staff',
    duties: Object.fromEntries(Object.keys(DUTIES).map(k => [k, Boolean(active && !closed && duties[k] && attendance.present)])),
    bonus: 0, cashAdvance: 0, mealClaims: 0, note: '', attendance,
  };
}

export function restoreLegacyPayroll(entry, prior) {
  const tasks = prior.tasks || [];
  const named = (...names) => tasks.filter(t => names.includes(String(t.task || '').trim().toLowerCase()));
  const quantity = list => list.reduce((sum, task) => sum + nonnegative(task.qty), 0);
  return {
    ...entry,
    duties: tasks.length ? dutiesFromProfile({ tasks }) : entry.duties,
    bonus: tasks.length ? tasks.reduce((sum, t) => sum + nonnegative(t.bonus), 0) : nonnegative(prior.bonusPay),
    cashAdvance: quantity(named('cash advance', 'pinjam duit', 'pinjam')),
    mealClaims: quantity(named('meal advance', 'pinjam makan', 'elaun makan')),
    legacyTotal: nonnegative(prior.totalPay),
  };
}

// Split washing at the pool level, assigning leftover cents in stable ID order.
// This keeps the total paid equal to the RM1 x quantity pool, even for 3 washers.
function washingShares(entries, duty, pool) {
  const assigned = entries.filter(e => e.duties[duty]).map(e => e.staffId).sort();
  const cents = Math.round(pool * 100);
  return Object.fromEntries(assigned.map((id, i) => [id, (Math.floor(cents / assigned.length) + (i < cents % assigned.length ? 1 : 0)) / 100]));
}

export function calculateDailyPayroll(entries, sources, rates = DEFAULT_PAYROLL_RATES) {
  const chicken = washingShares(entries, 'washChicken', nonnegative(sources.chickenWhole) * rates.washChicken);
  const carcass = washingShares(entries, 'washCarcass', nonnegative(sources.carcassKg) * rates.washCarcass);
  return entries.map(entry => {
    const d = entry.duties;
    const workedMinutes = nonnegative(entry.attendance?.workedMinutes);
    const otMinutes = d.overtime ? Math.max(0, workedMinutes - rates.standardMinutes) : 0;
    const breakdown = {
      washChicken: chicken[entry.staffId] || 0,
      washCarcass: carcass[entry.staffId] || 0,
      operation: d.operation ? calculateJagaGeraiPay(sources.chickenPieces, rates) : 0,
      mushroom: d.mushroom ? money(nonnegative(sources.mushroomSets) * rates.mushroom) : 0,
      overtime: money(otMinutes * rates.overtime / 60),
    };
    const friedDeduction = d.friedPenalty && nonnegative(sources.friedPieces) >= rates.friedThreshold
      ? money(nonnegative(sources.friedPieces) * rates.friedPenalty / rates.friedDivisor) : 0;
    const basePay = money(Object.values(breakdown).reduce((a, b) => a + b, 0));
    const bonusPay = money(nonnegative(entry.bonus));
    const mealAdvance = money(nonnegative(entry.mealClaims) * rates.meal);
    const grossPay = money(basePay + bonusPay);
    const deductions = money(nonnegative(entry.cashAdvance) + friedDeduction + mealAdvance);
    const balancePay = money(grossPay - deductions);
    return { ...entry, duties: dutiesFromProfile({ payrollDuties: d }), managementTreatment: 'reporting_only', mealTreatment: 'salary_advance', breakdown, workedMinutes, otMinutes, basePay, bonusPay, grossPay, mealAdvance, friedDeduction, deductions, balancePay, totalPay: money(Math.max(0, balancePay)) };
  });
}

export function payrollIssues(entries, sources) {
  const issues = [...(sources.issues || [])];
  const assigned = duty => entries.some(e => e.duties[duty]);
  if ((assigned('washChicken') || assigned('washCarcass') || assigned('friedPenalty')) && !sources.reportExists) issues.push('Save the daily receiving/closing sheet before paying washing or fried penalties.');
  if (assigned('washChicken') && sources.needsChickenCount) issues.push('Enter the fresh whole-chicken count in the daily sheet; pieces are not an additional whole-bird count.');
  if (assigned('washCarcass') && sources.needsCarcassWeight) issues.push('Enter the received carcass kg in the daily sheet. Carcass pieces cannot be paid as kilograms.');
  if (assigned('friedPenalty') && sources.reportStatus !== 'submitted') issues.push('Submit the closing sheet before applying fried-leftover penalties.');
  for (const entry of entries) {
    for (const key of ['bonus', 'cashAdvance', 'mealClaims']) {
      if (entry[key] !== '' && (!Number.isFinite(Number(entry[key])) || Number(entry[key]) < 0)) issues.push(`${entry.staffName}: ${key} must be a nonnegative number.`);
    }
    if (entry.duties.overtime && (entry.attendance.pending || entry.attendance.invalid)) issues.push(`${entry.staffName}: complete or correct attendance before saving OT.`);
  }
  return [...new Set(issues)];
}

// Compatibility for callers of the original service's standalone calculator.
export function calculateStaffDailyPay(params, rates = DEFAULT_PAYROLL_RATES) {
  const p = params || {};
  const management = p.role === 'pengurusan';
  const operating = !p.role || p.role === 'jaga_gerai';
  const divisor = p.isWashingShared ? 2 : 1;
  const result = {
    jagaGeraiPay: operating ? calculateJagaGeraiPay(p.ayamKetulTerjual, rates) : 0,
    cendawanPay: operating ? money(nonnegative(p.cendawanSets) * rates.mushroom) : 0,
    basuhAyamPay: management ? 0 : money(nonnegative(p.ayamBasuhEkor) * rates.washChicken / divisor),
    basuhRangkaPay: management ? 0 : money(nonnegative(p.rangkaBasuhKg) * rates.washCarcass / divisor),
    otPay: operating ? calculateOTPay(p.clockInHour, p.clockInMin, p.clockOutHour, p.clockOutMin, rates) : 0,
    pinjamMakan: nonnegative(p.pinjamMakan),
    pinjamDuit: nonnegative(p.pinjamDuit),
    bakiDahGorengDeduction: management ? 0 : nonnegative(p.bakiDahGorengDeduction),
    managementPay: 0,
    managementCost: management ? money(rates.management) : 0,
  };
  result.totalPay = money(Math.max(0, result.jagaGeraiPay + result.cendawanPay + result.basuhAyamPay + result.basuhRangkaPay + result.otPay + result.managementPay - result.pinjamMakan - result.pinjamDuit - result.bakiDahGorengDeduction));
  return result;
}

// Read old saved records under the clarified advance policy without rewriting
// their earned duty amounts or applying today's rates to historical advances.
export function normalizeSavedPayroll(entry, rates = DEFAULT_PAYROLL_RATES) {
  const legacy = entry.mealTreatment !== 'salary_advance';
  const tasks = entry.tasks || [];
  const taskQty = names => tasks.filter(t => names.includes(String(t.task || '').trim().toLowerCase()))
    .reduce((sum, t) => sum + nonnegative(t.qty), 0);
  const mealClaims = entry.mealClaims ?? taskQty(['meal advance', 'pinjam makan', 'elaun makan']);
  const mealAdvance = money(entry.mealAdvance ?? entry.breakdown?.meal ?? nonnegative(mealClaims) * (entry.rates?.meal ?? rates.meal));
  const cashAdvance = nonnegative(entry.cashAdvance ?? taskQty(['cash advance', 'pinjam duit', 'pinjam']));
  const bonusPay = nonnegative(entry.bonusPay ?? entry.bonus);
  const oldDeductions = nonnegative(entry.deductions);
  const managementReclassified = entry.managementTreatment === 'reporting_only' ? 0
    : nonnegative(entry.breakdown?.management ?? (taskQty(['management fee', 'pengurusan']) * (entry.rates?.management ?? rates.management)));
  const basePay = money(entry.basePay !== undefined
    ? nonnegative(entry.basePay) - (legacy ? mealAdvance : 0) - managementReclassified
    : nonnegative(entry.totalPay) + oldDeductions - bonusPay - (legacy ? mealAdvance : 0) - managementReclassified);
  const friedDeduction = nonnegative(entry.friedDeduction ?? Math.max(0, oldDeductions - cashAdvance - (legacy ? 0 : mealAdvance)));
  const grossPay = money(basePay + bonusPay);
  const deductions = money(cashAdvance + friedDeduction + mealAdvance);
  const balancePay = money(grossPay - deductions);
  const { meal: _oldMeal, management: _oldManagement, ...breakdown } = entry.breakdown || {};
  return { ...entry, duties: dutiesFromProfile({ payrollDuties: entry.duties || {} }), managementTreatment: 'reporting_only', managementReclassified, breakdown, mealClaims, cashAdvance, mealAdvance, basePay, bonusPay, grossPay, friedDeduction, deductions, balancePay,
    totalPay: money(Math.max(0, balancePay)), mealTreatment: 'salary_advance', mealCorrectionApplied: legacy && mealAdvance > 0 };
}

export function calculateStaffCosts(date, entries, rates = DEFAULT_PAYROLL_RATES, managementFeeApplied = new Date(`${date}T00:00:00Z`).getUTCDay() !== 6) {
  const employeeWages = money(entries.reduce((sum, entry) => sum + normalizeSavedPayroll(entry, rates).grossPay, 0));
  const managementFee = managementFeeApplied ? money(rates.management) : 0;
  return { employeeWages, managementFee, totalStaffCosts: money(employeeWages + managementFee) };
}

export function summarizeMonthlyPayroll(records, month) {
  const staff = new Map();
  const dates = new Set();
  let correctedRecords = 0;
  let managementCorrections = 0;
  const managementByDate = new Map();
  // One staff/date pair is counted once even when duplicate input records exist.
  const unique = new Map(records.filter(r => r.date?.slice(0, 7) === month).map(r => [`${r.date}_${r.staffId}`, r]));
  for (const record of unique.values()) {
    const entry = normalizeSavedPayroll(record);
    if (entry.mealCorrectionApplied) correctedRecords++;
    if (entry.managementReclassified > 0) managementCorrections++;
    dates.add(record.date);
    if (!managementByDate.has(record.date)) managementByDate.set(record.date, record.managementFeeForDay ?? calculateStaffCosts(record.date, [], record.rates || DEFAULT_PAYROLL_RATES).managementFee);
    const total = staff.get(record.staffId) || { staffId: record.staffId, staffName: record.staffName || 'Staff', days: 0, grossPay: 0, mealAdvance: 0, cashAdvance: 0, friedDeduction: 0 };
    total.days++;
    for (const key of ['grossPay', 'mealAdvance', 'cashAdvance', 'friedDeduction']) total[key] = money(total[key] + entry[key]);
    staff.set(record.staffId, total);
  }
  const entries = [...staff.values()].map(e => {
    const deductions = money(e.mealAdvance + e.cashAdvance + e.friedDeduction);
    const balance = money(e.grossPay - deductions);
    return { ...e, deductions, totalPay: Math.max(0, balance), excessAdvance: Math.max(0, -balance) };
  }).sort((a, b) => a.staffName.localeCompare(b.staffName));
  const totals = Object.fromEntries(['grossPay', 'mealAdvance', 'cashAdvance', 'friedDeduction', 'deductions', 'totalPay', 'excessAdvance'].map(key => [key, money(entries.reduce((sum, e) => sum + e[key], 0))]));
  const managementFee = money([...managementByDate.values()].reduce((sum, fee) => sum + nonnegative(fee), 0));
  return { month, entries, dates: [...dates].sort(), correctedRecords, managementCorrections, managementFee, totalStaffCosts: money(totals.grossPay + managementFee), ...totals };
}
