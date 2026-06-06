import React, { useState } from 'react';
import { useWindowSize } from './hooks/useWindowSize';
import { Sidebar, TopBar } from './components/Layout';
import PWAInstallBanner from './components/PWAInstallBanner';

import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import POSPage from './pages/POSPage';
import InventoryPage from './pages/InventoryPage';
import MenuEngineeringPage from './pages/MenuEngineeringPage';
import StaffPayrollPage from './pages/StaffPayrollPage';
import DailyReportPage from './pages/DailyReportPage';
import ReportsPage from './pages/ReportsPage';

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isMobile, isTablet } = useWindowSize();
  const isNarrow = isMobile || isTablet;

  if (!user) {
    return (
      <>
        <AuthPage onLogin={setUser} />
        <PWAInstallBanner />
      </>
    );
  }

  const renderPage = () => {
    const props = { isMobile: isNarrow };
    switch (page) {
      case 'dashboard':  return <DashboardPage {...props} />;
      case 'pos':        return <POSPage {...props} />;
      case 'inventory':  return <InventoryPage {...props} />;
      case 'menu':       return <MenuEngineeringPage {...props} />;
      case 'staff':      return <StaffPayrollPage {...props} />;
      case 'daily':      return <DailyReportPage {...props} />;
      case 'reports':    return <ReportsPage {...props} />;
      default:           return <DashboardPage {...props} />;
    } 
  };

  return (
    <>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar
          page={page}
          setPage={setPage}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isMobile={isNarrow}
        />
        <main style={{
          flex: 1,
          marginLeft: isNarrow ? 0 : 'var(--sidebar-w)',
          padding: isNarrow ? '16px 14px 32px' : '28px 28px 40px',
          minHeight: '100vh',
          background: 'var(--main-bg)',
          transition: 'margin-left 0.25s cubic-bezier(.4,0,.2,1)',
          overflowX: 'hidden',
        }}>
          <TopBar
            page={page}
            isMobile={isNarrow}
            onMenuClick={() => setSidebarOpen(true)}
            onLogout={() => setUser(null)}
          />
          {renderPage()}
        </main>
      </div>

      {/* PWA install banner — floats above everything */}
      <PWAInstallBanner />
    </>
  );
}
