import { useState, useEffect, useRef } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Captures the browser's beforeinstallprompt event so we can
 * show our own install UI instead of the default browser prompt.
 * Uses vite-plugin-pwa's registerSW for proper update detection.
 */
export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const updateSWRef = useRef(null);

  useEffect(() => {
    // Already running as installed PWA?
    if (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true) {
      setIsInstalled(true);
    }

    // Register the SW via vite-plugin-pwa
    // onNeedRefresh fires only when a genuinely new SW is waiting
    const updateSW = registerSW({
      onNeedRefresh() {
        setUpdateReady(true);
      },
      onOfflineReady() {
        console.log('[AFC PWA] App ready to work offline');
      },
    });
    updateSWRef.current = updateSW;

    const onPrompt = (e) => {
      e.preventDefault();       // stop the mini-infobar
      setInstallPrompt(e);      // stash for later
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const triggerInstall = async () => {
    if (!installPrompt) return false;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
      setIsInstalled(true);
    }
    return outcome === 'accepted';
  };

  const reloadForUpdate = () => {
    // Tell the waiting SW to activate, then reload
    if (updateSWRef.current) {
      updateSWRef.current(true);
    } else {
      window.location.reload();
    }
  };

  return { installPrompt, isInstalled, updateReady, triggerInstall, reloadForUpdate };
}

