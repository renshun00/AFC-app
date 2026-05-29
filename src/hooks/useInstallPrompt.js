import { useState, useEffect } from 'react';

/**
 * Captures the browser's beforeinstallprompt event so we can
 * show our own install UI instead of the default browser prompt.
 */
export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled]     = useState(false);
  const [updateReady, setUpdateReady]     = useState(false);

  useEffect(() => {
    // Already running as installed PWA?
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true) {
      setIsInstalled(true);
    }

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

    // Listen for service-worker update (vite-plugin-pwa fires this)
    const onSWUpdate = () => setUpdateReady(true);
    window.addEventListener('pwa-update-available', onSWUpdate);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('pwa-update-available', onSWUpdate);
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

  const reloadForUpdate = () => window.location.reload();

  return { installPrompt, isInstalled, updateReady, triggerInstall, reloadForUpdate };
}
