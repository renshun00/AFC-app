import { useState, useEffect, useRef } from 'react';
import { loadCashClosing, loadCashSales, saveCashClosing, clockOutWithCash } from '../services/cashReconciliationService';

export function useCashClosing(date, staffName) {
  const [amount, setAmount] = useState('');
  const [sales, setSales] = useState(null);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  const [loadedDate, setLoadedDate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const currentDate = useRef(date);
  currentDate.current = date;

  useEffect(() => {
    let cancelled = false;
    setLoadedDate(null); setSales(null); setSaved(null); setAmount(''); setError('');
    loadCashClosing(date).then(result => {
      if (cancelled) return;
      setSales(result.sales); setSaved(result.saved); setAmount(result.saved?.cashOnHand ?? '');
    }).catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoadedDate(date); });
    return () => { cancelled = true; };
  }, [date, reload]);

  async function refresh() {
    if (!sales) { setReload(value => value + 1); return; }
    setBusy(true); setError('');
    try {
      const latest = await loadCashSales(date);
      if (currentDate.current === date) setSales(latest);
    } catch (err) { if (currentDate.current === date) setError(err.message); }
    finally { setBusy(false); }
  }

  async function save(shiftId) {
    if (loadedDate !== date || busy) throw new Error('Wait for cash reconciliation to finish loading.');
    setBusy(true); setError('');
    try {
      const result = shiftId ? await clockOutWithCash(shiftId, date, amount, staffName) : await saveCashClosing(date, amount, staffName);
      if (currentDate.current === date) {
        setSaved(result); setSales({ expectedCash: result.expectedCash, orderCount: result.orderCount });
      }
      return result;
    } catch (err) {
      if (currentDate.current === date) setError(err.message);
      throw err;
    } finally { setBusy(false); }
  }

  return { date, amount, setAmount, sales, saved, error, loading: loadedDate !== date, busy, refresh, save };
}
