/**
 * AuthContext
 *
 * Login flow (email + password):
 *   1. Call signInWithEmailAndPassword(auth, email, password) directly
 *   2. On success, onAuthStateChanged fires with the Firebase user
 *   3. We try to load the staff profile from Firestore:
 *        a. by document id = fbUser.uid  (preferred — set this up for each user)
 *        b. fallback: query staff where email == fbUser.email
 *        c. last resort: minimal profile so the app never crashes
 *   4. Exposes { firebaseUser, profile, loading, login, logout }
 *
 * Staff Firestore document (collection: "staff", doc id = Firebase Auth UID):
 *   { name, role, email, isActive, staffCode, ... }
 *
 * Roles: Admin | Supervisor | Cashier | Kitchen | Driver | Cleaner
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { validateLoginInput } from '../utils/security';
import {
  getLockState, recordFailedAttempt, clearFailedAttempts,
} from '../services/loginSecurity';

const LOCKED_MSG = 'This account is locked after 3 failed attempts. Please contact an administrator to unlock it.';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(undefined); // undefined = resolving
  const [profile,      setProfile]      = useState(null);

  // ── Listen to Firebase Auth state changes ──────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        setProfile(await loadProfile(fbUser));
      } else {
        setFirebaseUser(null);
        setProfile(null);
      }
    });
    return unsub;
  }, []);

  // ── Login with email + password directly via Firebase Auth ─────────────────
  const login = async (rawEmail, rawPassword) => {
    // 1. Validate / sanitise (blocks XML & markup injection)
    const v = validateLoginInput(rawEmail, rawPassword);
    if (!v.ok) return { ok: false, error: v.error };
    const { email, password } = v;

    // 2. Refuse if the account is locked (even with the correct password)
    try {
      const lock = await getLockState(email);
      if (lock.locked) return { ok: false, locked: true, error: LOCKED_MSG };
    } catch (err) {
      console.error('[AuthContext] lock check failed:', err);
      return { ok: false, error: 'Sign-in is temporarily unavailable. Please try again later.' };
    }

    // 3. Authenticate
    try {
      await signInWithEmailAndPassword(auth, email, password);
      clearFailedAttempts(email).catch(() => {});
      // onAuthStateChanged handles setting firebaseUser + profile
      return { ok: true };
    } catch (err) {
      const isCredentialError = [
        'auth/wrong-password', 'auth/invalid-credential', 'auth/user-not-found',
      ].includes(err.code);

      if (isCredentialError) {
        await sleep(600 + Math.random() * 400); // slow down brute force / timing probes
        try {
          const r = await recordFailedAttempt(email);
          if (r.locked) return { ok: false, locked: true, error: LOCKED_MSG };
          return {
            ok: false,
            error: `Incorrect email or password. ${r.remaining} attempt${r.remaining === 1 ? '' : 's'} remaining before lockout.`,
          };
        } catch (e) {
          console.error('[AuthContext] recordFailedAttempt failed:', e);
        }
      }
      return { ok: false, error: friendlyAuthError(err.code) };
    }
  };

  const logout = () => signOut(auth);

  // true while Firebase is still resolving the persisted session on first load
  const loading = firebaseUser === undefined;

  return (
    <AuthContext.Provider value={{ firebaseUser, profile, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// ── Load the staff profile from Firestore ─────────────────────────────────────
// Priority: doc id = uid  →  email field match  →  minimal fallback
async function loadProfile(fbUser) {
  try {
    // 1. Look up by UID (the recommended setup: doc id === Firebase Auth UID)
    const byUid = await getDoc(doc(db, 'staff', fbUser.uid));
    if (byUid.exists()) {
      return { id: byUid.id, ...byUid.data() };
    }

    // 2. Fallback: query by email field
    const q    = query(collection(db, 'staff'), where('email', '==', fbUser.email));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { id: snap.docs[0].id, ...snap.docs[0].data() };
    }

    // 3. No staff document at all — allow login with a default Admin profile
    //    so the account owner can still access the app and set things up.
    console.warn('[AuthContext] No staff doc found for', fbUser.email, '— using default Admin profile.');
    return {
      id:       fbUser.uid,
      name:     fbUser.displayName || fbUser.email,
      email:    fbUser.email,
      role:     'Admin',
      isActive: true,
    };
  } catch (err) {
    console.error('[AuthContext] loadProfile failed:', err);
    // Return a safe fallback rather than crashing
    return {
      id:       fbUser.uid,
      name:     fbUser.displayName || fbUser.email,
      email:    fbUser.email,
      role:     'Admin',
      isActive: true,
    };
  }
}

// ── Map Firebase error codes to readable messages ─────────────────────────────
function friendlyAuthError(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}
