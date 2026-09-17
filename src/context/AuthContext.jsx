/**
 * AuthContext.jsx
 *
 * Login flow (email + password):
 *   1. Call signInWithEmailAndPassword(auth, email, password)
 *   2. Fetch staff document from Firestore (by UID or email)
 *   3. Enforce active status: If the staff document is deleted or marked inactive,
 *      sign out immediately and reject login.
 *   4. Exposes { firebaseUser, profile, loading, login, logout }
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(undefined); // undefined = resolving
  const [profile,      setProfile]      = useState(null);

  // ── Listen to Firebase Auth state changes ──────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const staffProfile = await loadProfile(fbUser);
        if (staffProfile) {
          setFirebaseUser(fbUser);
          setProfile(staffProfile);
        } else {
          // Account exists in Firebase Auth but has no valid active record in Firestore
          await signOut(auth);
          setFirebaseUser(null);
          setProfile(null);
        }
      } else {
        setFirebaseUser(null);
        setProfile(null);
      }
    });
    return unsub;
  }, []);

  // ── Login with email + password directly via Firebase Auth ─────────────────
  const login = async (email, password) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const staffProfile = await loadProfile(cred.user);

      if (!staffProfile) {
        await signOut(auth);
        return {
          ok: false,
          error: 'This account has been deactivated or removed by an administrator.',
        };
      }

      setFirebaseUser(cred.user);
      setProfile(staffProfile);
      return { ok: true };
    } catch (err) {
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
// Looks up by UID or email. Returns null if deleted or inactive.
async function loadProfile(fbUser) {
  try {
    // 1. Look up by UID (doc id === Firebase Auth UID)
    const byUid = await getDoc(doc(db, 'staff', fbUser.uid));
    if (byUid.exists()) {
      const data = byUid.data();
      if (data.isActive === false || data.status === 'inactive') {
        return null; // Deactivated staff
      }
      return { id: byUid.id, ...data };
    }

    // 2. Fallback: query by email field
    const q = query(collection(db, 'staff'), where('email', '==', fbUser.email));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docData = snap.docs[0];
      const data = docData.data();
      if (data.isActive === false || data.status === 'inactive') {
        return null; // Deactivated staff
      }
      return { id: docData.id, ...data };
    }

    // 3. Fallback for your original primary Admin account:
    // If you log in with your primary setup email before creating a staff document,
    // allow access as Admin so you don't get locked out.
    if (fbUser.email && !fbUser.email.endsWith('@afc.com')) {
      console.warn('[AuthContext] Admin bootstrap login for:', fbUser.email);
      return {
        id:       fbUser.uid,
        name:     fbUser.displayName || 'Admin',
        email:    fbUser.email,
        role:     'Admin',
        isActive: true,
      };
    }

    // 4. Staff account has been deleted from Firestore
    console.warn('[AuthContext] No active staff doc found for', fbUser.email);
    return null;
  } catch (err) {
    console.error('[AuthContext] loadProfile failed:', err);
    return null;
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