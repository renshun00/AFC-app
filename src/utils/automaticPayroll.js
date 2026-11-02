import { calculateDailyPayroll, payrollIssues } from './payrollCalculator.js';

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
