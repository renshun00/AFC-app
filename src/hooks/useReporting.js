import { useEffect, useMemo, useState } from 'react';
import { subscribeReporting } from '../services/reportingService';
import { buildReport } from '../utils/reportingCalculator.js';
import { getMalaysiaDate } from '../utils/dailyFlowCalculator.js';

export function useMalaysiaToday() {
  const [today, setToday] = useState(getMalaysiaDate);
  useEffect(() => { const timer = setInterval(() => setToday(getMalaysiaDate()), 30000); return () => clearInterval(timer); }, []);
  return today;
}

export function useReporting(from, to) {
  const today = useMalaysiaToday();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key: '', sources: null, error: null });
  const key = `${from}/${to}/${attempt}`;
  useEffect(() => {
    let current = true;
    setState({ key, sources: null, error: null });
    let unsubscribe;
    try { unsubscribe = subscribeReporting(from, to,
      sources => { if (current) setState({ key, sources, error: null }); },
      error => { if (current) setState({ key, sources: null, error: error.message }); });
    } catch (error) { setState({ key, sources: null, error: error.message }); }
    return () => { current = false; unsubscribe?.(); };
  }, [key, from, to]);
  const sources = state.key === key ? state.sources : null;
  const error = state.key === key ? state.error : null;
  const report = useMemo(() => sources ? buildReport({ from, to, today, ...sources }) : null, [sources, from, to, today]);
  return { report, sources, error, loading: !report && !error, refresh: () => setAttempt(a => a + 1) };
}
