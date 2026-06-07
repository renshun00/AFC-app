import React, { useState } from 'react';
import { DEMO_USER } from '../data/placeholder';

export default function AuthPage({ onLogin, staffRegistry = [] }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    await new Promise(r => setTimeout(r, 600));

    // 1. Check admin
    if (username === DEMO_USER.username && password === DEMO_USER.password) {
      onLogin({ ...DEMO_USER, name: 'Admin' });
      setLoading(false);
      return;
    }

    // 2. Check staff credentials
    const staffMatch = staffRegistry.find(
      s => s.username && s.username === username.trim() && s.password === password
    );
    if (staffMatch) {
      onLogin({ username: staffMatch.username, name: staffMatch.name, role: staffMatch.role });
      setLoading(false);
      return;
    }

    setError('Invalid username or password.');
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #fde8e4 0%, #f4f4f5 60%, #e0e7ff 100%)',
      padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ background: 'var(--primary)', padding: '28px 32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <img src="/afc_logo.jpg" alt="Alang Fried Chicken"
              style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.4)', marginBottom: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }} />
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 20, textAlign: 'center', lineHeight: 1.2 }}>Alang Fried Chicken</div>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, marginTop: 4 }}>Management Console Login</div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: '28px 32px 32px' }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5 }}>Username</label>
              <input className="inp" type="text" placeholder="Enter username" value={username}
                onChange={e => setUsername(e.target.value)} autoFocus />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5 }}>Password</label>
              <input className="inp" type="password" placeholder="Enter password" value={password}
                onChange={e => setPassword(e.target.value)} />
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', padding: '9px 12px', fontSize: 13, color: '#dc2626', marginBottom: 14 }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: 14, opacity: loading ? .7 : 1 }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>

          </form>
        </div>
        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--text-3)' }}>
          © 2026 AFC Management System · v1.0
        </div>
      </div>
    </div>
  );
}
