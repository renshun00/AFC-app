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
import { staffList } from './data/placeholder';

// Pages each role can access
const ROLE_PAGES = {
  Admin:      ['dashboard','pos','inventory','menu','staff','daily','reports'],
  Supervisor: ['dashboard','pos','inventory','menu','daily','reports'],
  Cashier:    ['pos','daily'],
  Kitchen:    ['pos','inventory','daily'],
  Driver:     ['pos','daily'],
  Cleaner:    ['daily'],
};

export default function App() {
  const [user, setUser]           = useState(null);
  const [page, setPage]           = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Keep staff list in App so credentials created in StaffPayroll flow into AuthPage
  const [staffRegistry, setStaffRegistry] = useState(staffList);
  const { isMobile, isTablet }    = useWindowSize();
  const isNarrow = isMobile || isTablet;

  const handleLogin = (loggedInUser) => {
    const allowedPages = ROLE_PAGES[loggedInUser.role] || ['pos'];
    setPage(allowedPages[0]);   // land on first allowed page
    setUser({ ...loggedInUser, allowedPages });
  };

  if (!user) {
    return (
      <>
        <AuthPage onLogin={handleLogin} staffRegistry={staffRegistry} />
        <PWAInstallBanner />
      </>
    );
  }

  const allowed = user.allowedPages || ROLE_PAGES[user.role] || ['pos'];

  const renderPage = () => {
    const props = { isMobile: isNarrow };
    switch (page) {
      case 'dashboard': return <DashboardPage {...props} />;
      case 'pos':       return <POSPage {...props} />;
      case 'inventory': return <InventoryPage {...props} />;
      case 'menu':      return <MenuEngineeringPage {...props} />;
      case 'staff':     return <StaffPayrollPage {...props} onStaffUpdate={setStaffRegistry} />;
      case 'daily':     return <DailyReportPage {...props} />;
      case 'reports':   return <ReportsPage {...props} />;
      default:          return <DashboardPage {...props} />;
    }
  };

  return (
    <>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar
          page={page}
          setPage={(p) => { if (allowed.includes(p)) setPage(p); }}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isMobile={isNarrow}
          allowedPages={allowed}
          userRole={user.role}
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
            onLogout={() => { setUser(null); setPage('dashboard'); }}
            userName={user.name || user.username}
            userRole={user.role}
          />
          {renderPage()}
        </main>
      </div>
      <PWAInstallBanner />
    </>
  );
}
