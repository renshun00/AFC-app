import { getMalaysiaDate, shiftDate } from './dailyFlowCalculator.js';
import { calculateStaffCosts, DEFAULT_PAYROLL_RATES, normalizeSavedPayroll } from './payrollCalculator.js';

export const money = value => Math.round((Number(value) || 0) * 100) / 100;
const n = value => Math.max(0, Number(value) || 0);
const norm = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
export const DEFAULT_OVERHEAD = { rent: 19.35, utilities: 10, wifi: 1.10 };
export const OVERHEAD_FIELDS = { rent: 'Rent', utilities: 'Utilities', wifi: 'Wi-Fi' };
// G1 CoS D2:D28. Rice is RM23.50 per 5 kg bag; butter/milk converted from grams.
// Royalty is excluded by the user's 2026-10-28 instruction. G1 gas/gloves CoS is zero.
export const COST_RATES = { chickenKg: 9.4, carcassKg: 3.5, neckSet: .2, mushroomSet: 2.5,
  flourKg: 14, tubeIce: 3, oilPacketKg: 2.5, oilBottleKg: 5.6, saucePacket: .12,
  cheese_sauce: .52, korean_sauce: .23, green_sauce: .16, bbq_sauce: .6,
  sauceContainer: .1, paperWrap: .06, plasticBag: .03, riceKg: 23.5 / 5,
  butterKg: 20, milkKg: 10, riceContainer: .33, soupContainer: .13 };
export const SOLD_ITEMS = [
  { key: 'chicken_pcs', label: 'Chicken', unit: 'pcs', aliases: ['chicken (pieces)', 'chicken pieces', 'chicken (whole)', 'chicken whole', 'ayam'] },
  { key: 'carcass_pcs', label: 'Carcass', unit: 'pcs', aliases: ['carcass', 'rangka'] },
  { key: 'neck', label: 'Neck', unit: 'sets', aliases: ['chicken neck', 'neck', 'leher'] },
  { key: 'mushroom', label: 'Mushroom', unit: 'sets', aliases: ['mushroom', 'mushroom (enoki)', 'enoki', 'cendawan'] },
  { key: 'butter_rice', label: 'Butter rice', unit: 'sets', aliases: ['butter rice', 'nasi butter'] },
  { key: 'cheese_sauce', label: 'Cheese sauce', unit: 'pcs', aliases: ['cheese sauce', 'cheese sauce (sos cheese)', 'sos cheese'] },
  { key: 'korean_sauce', label: 'Korean sauce', unit: 'pcs', aliases: ['korean sauce', 'korean sauce (sos korean)', 'sos korean'] },
  { key: 'green_sauce', label: 'Green sauce', unit: 'pcs', aliases: ['green sauce', 'green sauce (sos hijau)', 'sos hijau'] },
  { key: 'bbq_sauce', label: 'BBQ sauce', unit: 'pcs', aliases: ['bbq sauce', 'bbq sauce (sos bbq)', 'sos bbq'] },
];
const emptySold = () => Object.fromEntries(SOLD_ITEMS.map(i => [i.key, 0]));
export function businessDate(record) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(record.date || '')) return record.date;
  const stamp = record.createdAt?.toDate ? record.createdAt.toDate() : new Date(record.createdAt);
  return Number.isNaN(stamp.getTime()) ? null : getMalaysiaDate(stamp);
}
export function validatePeriod(from, to) {
  const valid = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
  if (!valid(from) || !valid(to) || from > to) throw new Error('Choose a valid start and end date.');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 >= 366) throw new Error('Choose a period of at most 366 days.');
}
export function monthPeriod(month, today = getMalaysiaDate()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new Error('Choose a valid month.');
  const from = `${month}-01`;
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
  return { from, to: month === today.slice(0, 7) ? today : last };
}
export function validateOverhead(value) {
  return Object.fromEntries(Object.keys(DEFAULT_OVERHEAD).map(key => {
    const number = Number(value[key]);
    if (value[key] === '' || !Number.isFinite(number) || number < 0 || number > 100000) throw new Error(`${OVERHEAD_FIELDS[key]} must be between RM0 and RM100,000 per day.`);
    return [key, money(number)];
  }));
}
export function overheadForDate(date, versions = []) {
  const saved = versions.filter(v => v.effectiveFrom <= date).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  return { ...DEFAULT_OVERHEAD, ...saved?.rates };
}

export function aggregateReportSales(orders) {
  const sold = emptySold(), issues = new Set(), menu = new Map(), payments = new Map();
  let revenue = 0, count = 0;
  for (const order of orders) {
    if (order.status !== 'completed') continue;
    count++;
    const total = money(n(order.total));
    revenue += total;
    const method = norm(order.paymentMethod) || 'unspecified';
    payments.set(method, money((payments.get(method) || 0) + total));
    const items = order.items || [];
    const subtotal = items.reduce((sum, i) => sum + n(i.qty ?? i.quantity) * n(i.price), 0);
    let allocated = 0;
    items.forEach((item, index) => {
      const quantity = n(item.qty ?? item.quantity), name = item.name || 'Unnamed item';
      const id = item.menuItemId || item.id || name;
      const row = menu.get(id) || { id, name, quantity: 0, revenue: 0 };
      const share = index === items.length - 1 ? money(total - allocated) : money(subtotal ? quantity * n(item.price) / subtotal * total : 0);
      allocated = money(allocated + share);
      row.quantity += quantity; row.revenue = money(row.revenue + share); menu.set(id, row);
      if (!quantity) return;
      if (!item.recipe?.length) { issues.add(`Missing recipe: ${name}`); return; }
      let mapped = false;
      for (const ingredient of item.recipe) {
        const kind = SOLD_ITEMS.find(i => i.aliases.includes(norm(ingredient.inventoryItemName)));
        if (!kind) continue;
        const amount = Number(ingredient.qtyPerUnit);
        if (!Number.isFinite(amount) || amount < 0) { issues.add(`Invalid recipe quantity: ${name}`); continue; }
        if (!amount) continue;
        const unit = norm(ingredient.unit || ingredient.baseUnit);
        const pieces = ['pc', 'pcs', 'piece', 'pieces', 'ketul'].includes(unit);
        const sets = ['set', 'sets'].includes(unit);
        let multiplier;
        if (kind.key === 'chicken_pcs' && ['whole', 'bird', 'birds', 'ekor'].includes(unit)) multiplier = 9;
        else if (kind.key === 'neck') multiplier = pieces ? .25 : sets ? 1 : null;
        else if (kind.unit === 'sets') multiplier = sets || pieces ? 1 : null;
        else multiplier = pieces ? 1 : null;
        if (multiplier == null) { issues.add(`Check recipe units for ${name}: ${unit || 'missing unit'}`); continue; }
        sold[kind.key] += amount * quantity * multiplier;
        mapped = true;
      }
      if (!mapped) issues.add(`No report portion mapping: ${name}`);
    });
    if (!items.length) issues.add('An order has no item details.');
  }
  return { revenue: money(revenue), count, sold, issues: [...issues], menu: [...menu.values()].sort((a, b) => b.quantity - a.quantity), payments: [...payments].map(([name, value]) => ({ name, value })) };
}

export function calculateReportCos(sold, waste = {}, raw = {}) {
  const r = COST_RATES;
  const chicken = n(sold.chicken_pcs) + n(waste.chicken_pcs);
  const carcass = n(sold.carcass_pcs) + n(waste.carcass_pcs);
  const neck = n(sold.neck) + n(waste.neck), mushroom = n(sold.mushroom) + n(waste.mushroom);
  const flour = chicken * .03 + carcass * .125 + neck * .075 + mushroom * .1;
  const packets = chicken + carcass * 2 + neck + mushroom;
  const wraps = chicken / 2 + carcass + neck + mushroom;
  const sauceKeys = ['cheese_sauce', 'korean_sauce', 'green_sauce', 'bbq_sauce'];
  const sauces = sauceKeys.reduce((sum, key) => sum + n(sold[key]), 0);
  const rice = n(sold.butter_rice);
  const breakdown = [
    { name: 'Chicken & carcass', value: chicken * .237 * r.chickenKg + carcass * .443 * r.carcassKg },
    { name: 'Neck & mushroom', value: neck * r.neckSet + mushroom * r.mushroomSet },
    { name: 'Flour', value: flour * r.flourKg },
    { name: 'Ice & oil', value: n(raw.tube_ice) * r.tubeIce + n(raw.oil_topup_packet) * r.oilPacketKg + n(raw.oil_topup_bottle) * r.oilBottleKg },
    { name: 'Sauces', value: packets * r.saucePacket + sauceKeys.reduce((sum, key) => sum + n(sold[key]) * r[key], 0) },
    { name: 'Packaging', value: sauces * r.sauceContainer + wraps * (r.paperWrap + r.plasticBag) + rice * (r.riceContainer + r.soupContainer) },
    { name: 'Rice, butter & milk', value: rice * (.055 * r.riceKg + .01 * r.butterKg + .025 * r.milkKg) },
  ].map(row => ({ ...row, value: money(row.value) }));
  return { total: money(breakdown.reduce((sum, row) => sum + row.value, 0)), breakdown, chickenKg: chicken * .237, carcassKg: carcass * .443 };
}

export function buildReport({ from, to, today = getMalaysiaDate(), orders = [], reports = [], payrollDays = [], payroll = [], expenses = [], overhead = [], fromCache = false }) {
  validatePeriod(from, to);
  const uniqueOrders = [...new Map(orders.map(o => [o.id, o])).values()].filter(o => businessDate(o) >= from && businessDate(o) <= to && businessDate(o) <= today && o.status === 'completed');
  const reportMap = new Map(reports.map(r => [r.date || r.id, r]));
  const payrollMap = new Map(payrollDays.map(r => [r.date || r.id, r]));
  const daily = [];
  const coveredCategories = new Set(['rent', 'rental', 'utilities', 'wifi', 'wi-fi', 'royalty', 'payroll', 'wages', 'staff', 'management', 'packaging', 'ingredients', 'oil', 'ice']);
  for (let date = from; date <= to; date = shiftDate(date, 1)) {
    const sales = aggregateReportSales(uniqueOrders.filter(o => businessDate(o) === date));
    const report = reportMap.get(date), payrollDay = payrollMap.get(date);
    const legacy = [...new Map(payroll.filter(p => p.date === date).map(p => [p.staffId, p])).values()];
    const future = date > today;
    const active = !future && Boolean(sales.count || report || payrollDay || legacy.length);
    const issues = [...sales.issues];
    if (active && report?.status !== 'submitted') issues.push(report ? 'Closing report is a draft' : 'Closing report missing');
    if (active && !payrollDay && !legacy.length) issues.push('Payroll not saved');
    if (active && !sales.count && SOLD_ITEMS.some(item => {
      const key = item.key === 'neck' ? 'chicken_neck_set' : item.key;
      const remaining = report?.data?.remaining_unfried?.[item.key] ?? report?.data?.other_remaining?.[item.key];
      return n(report?.data?.brought_to_stall?.[key]) - n(remaining) - n(report?.data?.remaining_fried?.[item.key]) > 0;
    })) issues.push('Closing quantities indicate sales but no completed POS orders exist');
    const waste = report?.data?.remaining_fried || {};
    const cos = calculateReportCos(sales.sold, waste, report?.data?.raw_materials);
    let staffCosts = { employeeWages: 0, managementFee: 0, totalStaffCosts: 0 };
    if (payrollDay) staffCosts = calculateStaffCosts(date, payrollDay.entries || [], { ...DEFAULT_PAYROLL_RATES, ...payrollDay.rates }, payrollDay.managementFeeApplied);
    else if (legacy.length) {
      const employeeWages = money(legacy.reduce((sum, entry) => sum + normalizeSavedPayroll(entry).grossPay, 0));
      const managementFee = legacy[0].managementFeeForDay ?? calculateStaffCosts(date, [], { ...DEFAULT_PAYROLL_RATES, ...legacy[0].rates }).managementFee;
      staffCosts = { employeeWages, managementFee, totalStaffCosts: money(employeeWages + managementFee) };
    }
    const datedExpenses = expenses.filter(e => businessDate(e) === date && !future);
    const extraExpenses = money(datedExpenses.filter(e => !coveredCategories.has(norm(e.categoryId))).reduce((sum, e) => sum + n(e.amount), 0));
    const excludedExpenses = money(datedExpenses.filter(e => coveredCategories.has(norm(e.categoryId))).reduce((sum, e) => sum + n(e.amount), 0));
    const overheadRates = overheadForDate(date, overhead);
    // Rent/utilities/Wi-Fi accrue each calendar day, including Saturday. No royalty.
    const overheadCost = future ? 0 : money(Object.values(overheadRates).reduce((sum, v) => sum + n(v), 0));
    const costOfSales = active && !sales.issues.length && report?.status === 'submitted' ? cos.total : active ? null : 0;
    const savedStaffCost = active && !payrollDay && !legacy.length ? null : staffCosts.totalStaffCosts;
    const complete = issues.length === 0;
    const totalCost = !complete || costOfSales == null || savedStaffCost == null ? null : money(costOfSales + savedStaffCost + overheadCost + extraExpenses);
    const netGain = complete && totalCost != null ? money(sales.revenue - totalCost) : null;
    daily.push({ date, ...sales, active, future, issues, complete, closingStatus: report?.status || 'missing', payrollSaved: Boolean(payrollDay || legacy.length),
      costOfSales, employeeWages: staffCosts.employeeWages, managementFee: staffCosts.managementFee, staffCosts: savedStaffCost,
      overhead: overheadCost, overheadRates, extraExpenses, excludedExpenses, totalCost, netGain,
      margin: netGain != null && sales.revenue ? netGain / sales.revenue * 100 : null,
      waste: { chicken_pcs: n(waste.chicken_pcs), carcass_pcs: n(waste.carcass_pcs), neck: n(waste.neck), mushroom: n(waste.mushroom) },
      costBreakdown: active && costOfSales != null ? cos.breakdown : [],
    });
  }
  const sum = key => money(daily.reduce((s, d) => s + (d[key] || 0), 0));
  const allSales = aggregateReportSales(uniqueOrders);
  const pending = daily.filter(d => !d.complete);
  const totals = Object.fromEntries(['revenue', 'costOfSales', 'employeeWages', 'managementFee', 'staffCosts', 'overhead', 'extraExpenses', 'excludedExpenses', 'netGain'].map(key => [key, sum(key)]));
  if (daily.some(d => d.costOfSales == null)) totals.costOfSales = null;
  if (daily.some(d => d.staffCosts == null)) totals.staffCosts = null;
  if (pending.length) totals.netGain = null;
  totals.margin = totals.netGain != null && totals.revenue ? totals.netGain / totals.revenue * 100 : null;
  const breakdown = new Map();
  daily.forEach(d => d.costBreakdown.forEach(b => breakdown.set(b.name, money((breakdown.get(b.name) || 0) + b.value))));
  for (const [name, key] of [['Employee wages', 'employeeWages'], ['Management', 'managementFee'], ['Rent, utilities & Wi-Fi', 'overhead'], ['Other expenses', 'extraExpenses']]) breakdown.set(name, totals[key]);
  return { from, to, fromCache, daily, totals, pending, orderCount: allSales.count, menu: allSales.menu, payments: allSales.payments,
    costBreakdown: [...breakdown].map(([name, value]) => ({ name, value })).filter(b => b.value > 0),
    sold: allSales.sold, activeDays: daily.filter(d => d.active).length };
}

export function reportCsv(report, section = 'daily') {
  let rows;
  if (section === 'menu') rows = [['Item', 'Quantity', 'Net sales (RM)'], ...report.menu.map(r => [r.name, r.quantity, r.revenue])];
  else if (section === 'waste') rows = [['Date', 'Chicken (pcs)', 'Carcass (pcs)', 'Neck (sets)', 'Mushroom (sets)', 'Closing status'], ...report.daily.map(r => [r.date, r.waste.chicken_pcs, r.waste.carcass_pcs, r.waste.neck, r.waste.mushroom, r.closingStatus])];
  else rows = [['Date', 'POS sales (RM)', 'Orders', 'Estimated CoS (RM)', 'Employee wages (RM)', 'Management (RM)', 'StaffCosts (RM)', 'Rent (RM)', 'Utilities (RM)', 'Wi-Fi (RM)', 'Other expenses (RM)', 'Estimated net gain (RM)', 'Status'],
    ...report.daily.map(r => [r.date, r.revenue, r.count, r.costOfSales, r.payrollSaved ? r.employeeWages : r.active ? null : 0, r.payrollSaved ? r.managementFee : r.active ? null : 0, r.staffCosts,
      r.future ? 0 : r.overheadRates.rent, r.future ? 0 : r.overheadRates.utilities, r.future ? 0 : r.overheadRates.wifi, r.extraExpenses, r.netGain, r.future ? 'Future' : r.issues.join('; ') || (r.active ? 'Complete (estimated CoS)' : 'No trading records; overhead only')])];
  const escape = value => { const text = value == null ? '' : String(value); return '"' + (/^[=+@\-\t\r]/.test(text) && typeof value !== 'number' ? "'" : '') + text.replace(/"/g, '""') + '"'; };
  return '\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n');
}
