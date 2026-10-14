import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { login } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [locked,   setLocked]   = useState(false);
  const [honeypot, setHoneypot] = useState('');   // bots fill this; humans never see it
  const [cooldown, setCooldown] = useState(0);    // client-side throttle (seconds)

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || cooldown > 0) return;
    if (honeypot) return;                          // silently drop bot submissions
    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setLoading(true);
    setError('');

    const result = await login(email, password);

    if (!result.ok) {
      setError(result.error);
      setLocked(!!result.locked);
      setPassword('');                             // don't keep a wrong password in the DOM
      if (!result.locked) setCooldown(2);
    }
    // On success, AuthContext updates firebaseUser + profile →
    // App.jsx automatically renders the main app.
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
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 20, textAlign: 'center', lineHeight: 1.2 }}>
              Alang Fried Chicken
            </div>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, marginTop: 4 }}>
              Management Console Login
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: '28px 32px 32px' }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5 }}>
                Email
              </label>
              <input
                className="inp"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={e => { setLocked(false); setEmail(e.target.value.replace(/[<>"'`&;]/g, '')); }}
                maxLength={254}
                autoFocus
                autoComplete="email"
                spellCheck={false}
                autoCapitalize="none"
              />
            </div>

            {/* Honeypot – hidden from users and assistive tech */}
            <input
              type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
              value={honeypot} onChange={e => setHoneypot(e.target.value)}
              style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
            />

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5 }}>
                Password
              </label>
              <input
                className="inp"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value.replace(/[<>]/g, ''))}
                maxLength={128}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 'var(--radius-sm)', padding: '9px 12px',
                fontSize: 13, color: '#dc2626', marginBottom: 14,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || locked || cooldown > 0}
              style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: 14, opacity: (loading || locked || cooldown > 0) ? .7 : 1 }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{
                    width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: '#fff', borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite', display: 'inline-block',
                  }} />
                  Signing in…
                </span>
              ) : locked ? '🔒 Account Locked' : cooldown > 0 ? `Try again in ${cooldown}s` : 'Sign In'}
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
