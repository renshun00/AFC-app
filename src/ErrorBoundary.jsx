import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error: error.message || String(error) };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#f4f4f5', padding: 24,
          fontFamily: 'sans-serif',
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 32,
            maxWidth: 480, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,.1)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontWeight: 700, marginBottom: 8, color: '#dc2626' }}>
              Something went wrong
            </h2>
            <pre style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, padding: 12, fontSize: 12,
              color: '#dc2626', textAlign: 'left', overflowX: 'auto',
              marginBottom: 20, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {this.state.error}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#e8624a', color: '#fff', border: 'none',
                borderRadius: 8, padding: '10px 24px', fontSize: 14,
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
