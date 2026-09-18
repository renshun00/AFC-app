import { db } from '../firebase';
import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore';

// 1. Tiered rate for stall duty (Jaga Gerai) based on chickens sold (ketul -> ekor)
export function calculateJagaGeraiPay(ayamKetulTerjual) {
  const ayamEkor = Math.round(Number(ayamKetulTerjual || 0) / 9);

  if (ayamEkor <= 6) return 30;
  if (ayamEkor <= 8) return 35;
  if (ayamEkor <= 10) return 40;
  if (ayamEkor <= 12) return 45;
  if (ayamEkor <= 15) return 50;
  if (ayamEkor <= 21) return 55;
  if (ayamEkor <= 27) return 60;
  if (ayamEkor <= 33) return 65;
  if (ayamEkor <= 39) return 70;
  return 80;
}

// 2. Overtime calculation (Standard shift = 480 mins / 8 hrs, RM 3.00/hour)
export function calculateOTPay(clockInHour, clockInMin, clockOutHour, clockOutMin) {
  const startMins = (Number(clockInHour || 0) * 60) + Number(clockInMin || 0);
  const endMins = (Number(clockOutHour || 0) * 60) + Number(clockOutMin || 0);
  const standardMins = 480;

  const totalWorkedMins = endMins - startMins;
  const otMinutes = Math.max(0, totalWorkedMins - standardMins);
  const otHours = otMinutes / 60;

  return Number((otHours * 3.00).toFixed(2));
}

// 3. Full Daily Payroll Calculator per Staff Member
export function calculateStaffDailyPay(params) {
  const {
    role = 'jaga_gerai',
    ayamKetulTerjual = 0,
    cendawanSets = 0,
    ayamBasuhEkor = 0,
    rangkaBasuhKg = 0,
    isWashingShared = true,
    clockInHour = 0,
    clockInMin = 0,
    clockOutHour = 0,
    clockOutMin = 0,
    pinjamMakan = 0, // Daily meal advance (+RM10 added to payout)
    pinjamDuit = 0   // Cash advance deduction (-RM)
  } = params;

  if (role === 'pengurusan') {
    return {
      jagaGeraiPay: 0,
      cendawanPay: 0,
      basuhAyamPay: 0,
      basuhRangkaPay: 0,
      otPay: 0,
      pinjamMakan: 0,
      pinjamDuit: 0,
      managementPay: 100.00,
      totalPay: 100.00
    };
  }

  const washDivisor = isWashingShared ? 2 : 1;
  const jagaGeraiPay = role === 'jaga_gerai' ? calculateJagaGeraiPay(ayamKetulTerjual) : 0;
  const cendawanPay = role === 'jaga_gerai' ? Number(cendawanSets || 0) * 0.50 : 0;
  const basuhAyamPay = (Number(ayamBasuhEkor || 0) * 1.00) / washDivisor;
  const basuhRangkaPay = (Number(rangkaBasuhKg || 0) * 1.00) / washDivisor;
  const otPay = role === 'jaga_gerai' ? calculateOTPay(clockInHour, clockInMin, clockOutHour, clockOutMin) : 0;
  const deduction = Math.abs(Number(pinjamDuit || 0));

  // Pinjam Makan is added (+) to daily gross total, Pinjam Duit is deducted (-)
  const grossPay = jagaGeraiPay + cendawanPay + basuhAyamPay + basuhRangkaPay + otPay + Number(pinjamMakan || 0);
  const totalPay = Math.max(0, grossPay - deduction);

  return {
    jagaGeraiPay: Number(jagaGeraiPay.toFixed(2)),
    cendawanPay: Number(cendawanPay.toFixed(2)),
    basuhAyamPay: Number(basuhAyamPay.toFixed(2)),
    basuhRangkaPay: Number(basuhRangkaPay.toFixed(2)),
    otPay: Number(otPay.toFixed(2)),
    pinjamMakan: Number(pinjamMakan || 0),
    pinjamDuit: deduction,
    managementPay: 0,
    totalPay: Number(totalPay.toFixed(2))
  };
}

// 4. Auto-fetch sold chickens and mushrooms from Firestore 'orders' collection
export async function getStaffDailySales(dateString, staffId = null) {
  try {
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('date', '==', dateString));
    const snapshot = await getDocs(q);

    let ayamKetulCount = 0;
    let cendawanSetsCount = 0;

    snapshot.forEach(docSnap => {
      const order = docSnap.data();
      const items = order.items || [];

      items.forEach(item => {
        const name = (item.name || item.product || '').toLowerCase();
        const qty = Number(item.qty || item.quantity || 0);

        if (name.includes('ayam') || name.includes('chicken') || name.includes('parts')) {
          ayamKetulCount += qty;
        }
        if (name.includes('cendawan') || name.includes('enoki') || name.includes('mushroom')) {
          cendawanSetsCount += qty;
        }
      });
    });

    return { ayamKetul: ayamKetulCount, cendawanSets: cendawanSetsCount };
  } catch (err) {
    console.warn('Could not auto-fetch POS sales:', err);
    return { ayamKetul: 0, cendawanSets: 0 };
  }
}

// 5. Save daily record directly into 'daily_payroll' collection in Firestore
export async function saveDailyPayrollToFirestore(dateString, staffId, staffName, payrollData) {
  try {
    const docId = `${dateString}_${staffId}`;
    const docRef = doc(db, 'daily_payroll', docId);

    const record = {
      date: dateString,
      staffId,
      staffName,
      ...payrollData,
      updatedAt: new Date().toISOString()
    };

    await setDoc(docRef, record, { merge: true });
    return { success: true, docId };
  } catch (error) {
    console.error('Error saving payroll to Firestore:', error);
    throw error;
  }
}