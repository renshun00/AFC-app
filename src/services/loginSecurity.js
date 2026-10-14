/**
 * Account lockout, persisted in Firestore (collection "loginLocks").
 * Doc id = SHA-256(email). Shape:
 *   { email, failedAttempts, locked, lockedAt, lastFailedAt, unlockedBy?, unlockedAt? }
 *
 * Only an Admin can unlock (see firestore.rules snippet in README / hand-off).
 */
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs,
  serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from '../firebase';
import { sha256Hex } from '../utils/security';

export const MAX_FAILED_ATTEMPTS = 3;
const COL = 'loginLocks';

async function lockRef(email) {
  return doc(db, COL, await sha256Hex(email));
}

export async function getLockState(email) {
  const snap = await getDoc(await lockRef(email));
  if (!snap.exists()) return { locked: false, failedAttempts: 0 };
  const d = snap.data();
  return { locked: !!d.locked, failedAttempts: d.failedAttempts || 0 };
}

/** Record a failed attempt; locks the account on the 3rd consecutive failure. */
export async function recordFailedAttempt(email) {
  const ref = await lockRef(email);
  const snap = await getDoc(ref);
  const current = snap.exists() ? (snap.data().failedAttempts || 0) : 0;
  const next = current + 1;
  const locked = next >= MAX_FAILED_ATTEMPTS;

  if (!snap.exists()) {
    await setDoc(ref, {
      email, failedAttempts: next, locked,
      lastFailedAt: serverTimestamp(),
      ...(locked ? { lockedAt: serverTimestamp() } : {}),
    });
  } else {
    await updateDoc(ref, {
      failedAttempts: increment(1), locked,
      lastFailedAt: serverTimestamp(),
      ...(locked ? { lockedAt: serverTimestamp() } : {}),
    });
  }
  return { locked, remaining: Math.max(0, MAX_FAILED_ATTEMPTS - next) };
}

/** Reset the counter after a successful login (never clears an active lock). */
export async function clearFailedAttempts(email) {
  const ref = await lockRef(email);
  const snap = await getDoc(ref);
  if (snap.exists() && !snap.data().locked) await deleteDoc(ref);
}

// ── Admin-only ────────────────────────────────────────────────────────────────
export async function listLockedAccounts() {
  const snap = await getDocs(query(collection(db, COL), where('locked', '==', true)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function unlockAccount(docId, adminEmail) {
  await updateDoc(doc(db, COL, docId), {
    locked: false, failedAttempts: 0,
    unlockedBy: adminEmail || 'admin', unlockedAt: serverTimestamp(),
  });
}
