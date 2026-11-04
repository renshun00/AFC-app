import { calculateDailyPayroll, payrollIssues, attendanceForDay, newPayrollEntry, dutiesFromProfile, restoreLegacyPayroll } from './payrollCalculator.js';
import { getMalaysiaDate } from './dailyFlowCalculator.js';

// Shared by automatic persistence and live reporting so neither needs an
// administrator to prepare a day before wages can be included.
export function buildPayrollDay({ date, staff, saved, legacy = [], shifts, sources, rates, adjustments, automatic = true, today = getMalaysiaDate() }) {
  const previous = saved?.entries || legacy;
  const members = [...staff];
  for (const record of previous) {
    if (!members.some(s => s.id === record.staffId)) members.push({ id: record.staffId, name: record.staffName, status: 'inactive' });
  }
  const entries = members.map(member => {
    const attendance = attendanceForDay(shifts.filter(s => s.staffId === member.id), date);
    const prior = previous.find(e => e.staffId === member.id);
    const entry = newPayrollEntry(member, attendance, date);
    if (prior?.duties) return { ...entry, duties: automatic && saved?.automatic && member.isActive !== false && member.status !== 'inactive' && (date >= today || !prior.attendance?.present)
      ? entry.duties : dutiesFromProfile({ payrollDuties: prior.duties }), bonus: prior.bonus || 0, cashAdvance: prior.cashAdvance || 0, mealClaims: prior.mealClaims || 0, note: prior.note || '' };
    return prior ? restoreLegacyPayroll(entry, prior) : entry;
  });
  return { date, revision: saved?.revision || 0, rates: automatic ? saved?.rates || rates : rates, sources,
    entries: entries.map(entry => ({ ...entry, ...(adjustments?.entries?.[entry.staffId] || {}) })),
    adjustmentRevision: adjustments?.revision || 0,
    managementFeeApplied: adjustments?.managementFeeApplied ?? saved?.managementFeeApplied ?? new Date(`${date}T00:00:00Z`).getUTCDay() !== 6 };
}

// Save earned amounts throughout the day, but never guess a missing quantity or
// apply a draft closing penalty. Original assignments remain visible for review.
export function calculateAutomaticPayroll(entries, sources, rates) {
  const pendingIssues = payrollIssues(entries, sources);
  const prepared = entries.map(entry => {
    if (entry.attendance.present && !Object.values(entry.duties).some(Boolean)) {
      pendingIssues.push(`${entry.staffName}: no payroll duties configured. Set their profile duties or a date-specific adjustment.`);
    }
    const duties = { ...entry.duties };
    if (!sources.reportExists || sources.needsChickenCount) duties.washChicken = false;
    if (!sources.reportExists || sources.needsCarcassWeight) duties.washCarcass = false;
    if (sources.reportStatus !== 'submitted') duties.friedPenalty = false;
    if (sources.issues?.length) { duties.operation = false; duties.mushroom = false; }
    if (entry.attendance.invalid) duties.overtime = false;
    return { ...entry, duties };
  });
  const calculated = calculateDailyPayroll(prepared, sources, rates)
    .map((entry, index) => ({ ...entry, duties: entries[index].duties }));
  return { entries: calculated, pendingIssues: [...new Set(pendingIssues)],
    calculationStatus: pendingIssues.length ? 'pending' : 'current' };
}

export function payrollFingerprint(day) {
  const { loadedAt, ...sources } = day.sources;
  const stable = value => Array.isArray(value) ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  return JSON.stringify(stable({ date: day.date, rates: day.rates, sources,
    entries: [...day.entries].sort((a, b) => a.staffId.localeCompare(b.staffId)),
    managementFeeApplied: day.managementFeeApplied, pendingIssues: day.pendingIssues || [],
    adjustmentRevision: day.adjustmentRevision || 0 }));
}
