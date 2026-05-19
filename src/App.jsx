import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import { useWindowSize } from './hooks/useWindowSize';

export default function App() {
  const { isMobile } = useWindowSize();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isMobile={isMobile}
      />
      <Dashboard onMenuClick={() => setSidebarOpen(true)} />
    </div>
  );
}
