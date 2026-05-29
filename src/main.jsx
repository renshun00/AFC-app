import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Register the Vite PWA service worker
import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  onNeedRefresh() {
    // Broadcast a custom event the PWAInstallBanner listens for
    window.dispatchEvent(new Event('pwa-update-available'))
  },
  onOfflineReady() {
    console.log('AFC Management is ready for offline use ✅')
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
