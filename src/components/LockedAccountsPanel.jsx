import React, { useEffect, useState, useCallback } from 'react';
import { Lock, Unlock, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listLockedAccounts, unlockAccount } from '../services/loginSecurity';

/** Admin-only list of accounts locked after 3 failed sign-ins. */
export default function LockedAccountsPanel() {
  const { profile, firebaseUser } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await listLockedAccounts()); setErr(''); }
    catch { setErr('Unable to load locked accounts.'); }
    setLoading(false);
  }, []);

  useEffect(() => { if (profile?.role === 'Admin') load(); }, [profile, load]);

  if (profile?.role !== 'Admin') return null;

  const unlock = async (id) => {
    setBusyId(id);
    try { await unlockAccount(id, firebaseUser?.email); await load(); }
    catch { setErr('Unlock failed.'); }
    setBusyId(null);
  };

  return (
    <div className="card" style={{ padding: '16px 18px', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--primary)' }}>
        <Lock size={13} /> Locked Accounts
        {rows.length > 0 && (
          <span style={{ background: '#dc2626', color: '#fff', fontSize: 10, borderRadius: 99, padding: '1px 7px' }}>{rows.length}</span>
        )}
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 8 }}><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /></div>
      ) : err ? (
        <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>
      ) : rows.length === 0 ? (
        <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: 8 }}>No locked accounts</div>
      ) : rows.map(r => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #eee', borderRadius: 'var(--radius-sm)', padding: '9px 12px', marginBottom: 8 }}>
          {/* React escapes text output, so r.email is rendered safely */}
          <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.email}</span>
          <button className="btn btn-outline btn-sm" disabled={busyId === r.id} onClick={() => unlock(r.id)}>
            <Unlock size={13} /> Unlock
          </button>
        </div>
      ))}
    </div>
  );
}
