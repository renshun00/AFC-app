import React, { useState } from 'react';
import { Download, RefreshCw, X, Share, Plus } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

// Detect iOS (Safari doesn't fire beforeinstallprompt)
const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) &&
  !window.MSStream;

const isInStandaloneMode = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

export default function PWAInstallBanner() {
  const { installPrompt, isInstalled, updateReady, triggerInstall, reloadForUpdate } = useInstallPrompt();
  const [dismissed, setDismissed]       = useState(false);
  const [iosDismissed, setIosDismissed] = useState(false);
  const [installing, setInstalling]     = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    await triggerInstall();
    setInstalling(false);
  };

  // ── Update available toast ────────────────────────────────────────────────
  if (updateReady) {
    return (
      <div style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999, display: 'flex', alignItems: 'center', gap: 12,
        background: '#18181b', color: '#fff', borderRadius: 12,
        padding: '12px 18px', boxShadow: '0 8px 32px rgba(0,0,0,.25)',
        fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
        animation: 'slideUp .3s ease',
      }}>
        <RefreshCw size={15} style={{ flexShrink: 0 }}/>
        A new version is available.
        <button onClick={reloadForUpdate} style={{
          background: '#e8624a', color: '#fff', border: 'none',
          borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>
          Update now
        </button>
      </div>
    );
  }

  // ── Standard install banner (Chrome / Edge / Android) ────────────────────
  if (installPrompt && !dismissed && !isInstalled) {
    return (
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 9999, padding: '0 16px 16px',
        display: 'flex', justifyContent: 'center',
        animation: 'slideUp .35s cubic-bezier(.4,0,.2,1)',
      }}>
        <div style={{
          background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480,
          boxShadow: '0 -2px 0 rgba(0,0,0,.04), 0 8px 32px rgba(0,0,0,.14)',
          padding: '18px 20px',
          display: 'flex', alignItems: 'flex-start', gap: 14,
        }}>
          {/* App icon */}
          <img
            src="/afc_logo.jpg"
            alt="AFC"
            style={{
              width: 52, height: 52, borderRadius: 14,
              objectFit: 'cover', flexShrink: 0,
              border: '2px solid #f0f0f0',
            }}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
              Install AFC Management
            </div>
            <div style={{ fontSize: 12, color: '#71717a', marginBottom: 14, lineHeight: 1.5 }}>
              Add to your home screen for quick access, offline use, and a full-screen experience.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setDismissed(true)}
                style={{
                  flex: 1, padding: '9px', borderRadius: 9,
                  border: '1.5px solid #e4e4e7', background: 'transparent',
                  fontSize: 13, fontWeight: 600, color: '#52525b', cursor: 'pointer',
                }}
              >
                Not now
              </button>
              <button
                onClick={handleInstall}
                disabled={installing}
                style={{
                  flex: 2, padding: '9px', borderRadius: 9,
                  border: 'none', background: '#e8624a',
                  fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: installing ? .7 : 1,
                }}
              >
                <Download size={14}/>
                {installing ? 'Installing…' : 'Install App'}
              </button>
            </div>
          </div>

          <button onClick={() => setDismissed(true)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#a1a1aa', padding: 4, flexShrink: 0,
          }}>
            <X size={16}/>
          </button>
        </div>
      </div>
    );
  }

  // ── iOS Safari instructions ───────────────────────────────────────────────
  if (isIOS() && !isInStandaloneMode() && !iosDismissed) {
    return (
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 9999, padding: '0 16px 20px',
        display: 'flex', justifyContent: 'center',
        animation: 'slideUp .35s cubic-bezier(.4,0,.2,1)',
      }}>
        <div style={{
          background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480,
          boxShadow: '0 -2px 0 rgba(0,0,0,.04), 0 8px 32px rgba(0,0,0,.14)',
          padding: '18px 20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/afc_logo.jpg" alt="AFC" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', border: '1.5px solid #f0f0f0' }}/>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Install AFC Management</div>
                <div style={{ fontSize: 11, color: '#71717a' }}>Add to your iPhone home screen</div>
              </div>
            </div>
            <button onClick={() => setIosDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa' }}>
              <X size={16}/>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: <Share size={16} style={{ color: '#3b82f6' }}/>, text: <>Tap the <strong>Share</strong> button in Safari's toolbar</> },
              { icon: <Plus size={16} style={{ color: '#3b82f6' }}/>, text: <>Scroll and tap <strong>"Add to Home Screen"</strong></> },
              { icon: <span style={{ fontSize: 16 }}>✅</span>, text: <>Tap <strong>Add</strong> — done!</> },
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f4f4f5', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {step.icon}
                </div>
                <span style={{ fontSize: 13, color: '#374151' }}>{step.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
