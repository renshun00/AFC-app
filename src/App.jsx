import React, { useState } from 'react';
import { useWindowSize } from './hooks/useWindowSize';
import { Sidebar, TopBar } from './components/Layout';
import PWAInstallBanner from './components/PWAInstallBanner';
import { useAuth } from './context/AuthContext';

import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import POSPage from './pages/POSPage';
import InventoryPage from './pages/InventoryPage';
import MenuEngineeringPage from './pages/MenuEngineeringPage';
import StaffPayrollPage from './pages/StaffPayrollPage';
import DailyReportPage from './pages/DailyReportPage';
import ReportsPage from './pages/ReportsPage';

// All authenticated users get access to all pages
const ALL_PAGES = ['dashboard', 'pos', 'inventory', 'menu', 'staff', 'daily', 'reports'];

export default function App() {
  const { firebaseUser, profile, loading, logout } = useAuth();
  const [page, setPage]               = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isMobile, isTablet }        = useWindowSize();
  const isNarrow = isMobile || isTablet;

  // ── Still resolving Firebase Auth state ─────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--main-bg)',
      }}>
        <div style={{ textAlign: 'center', color: 'var(--text-3)' }}>
          <div style={{
            width: 36, height: 36, border: '3px solid var(--border)',
            borderTopColor: 'var(--primary)', borderRadius: '50%',
            animation: 'spin 0.7s linear infinite', margin: '0 auto 12px',
          }} />
          <div style={{ fontSize: 13 }}>Loading…</div>
        </div>
      </div>
    );
  }

  // ── Not logged in ────────────────────────────────────────────────────────────
  if (!firebaseUser || !profile) {
    return (
      <>
        <AuthPage />
        <PWAInstallBanner />
      </>
    );
  }

  const allowed = ALL_PAGES;

  // Navigate only to pages the role can access; redirect to first allowed page
  const navigate = (p) => {
    if (allowed.includes(p)) {
      setPage(p);
    }
  };

  // If current page is no longer allowed (role changed), snap to first allowed
  const activePage = allowed.includes(page) ? page : allowed[0];

  const renderPage = () => {
    const props = { isMobile: isNarrow };
    switch (activePage) {
      case 'dashboard': return <DashboardPage {...props} />;
      case 'pos':       return <POSPage {...props} />;
      case 'inventory': return <InventoryPage {...props} />;
      case 'menu':      return <MenuEngineeringPage {...props} />;
      case 'staff':     return <StaffPayrollPage {...props} />;
      case 'daily':     return <DailyReportPage {...props} />;
      case 'reports':   return <ReportsPage {...props} />;
      default:          return <DashboardPage {...props} />;
    }
  };

  return (
    <>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar
          page={activePage}
          setPage={navigate}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isMobile={isNarrow}
          allowedPages={allowed}
          userRole={profile.role}
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
            page={activePage}
            isMobile={isNarrow}
            onMenuClick={() => setSidebarOpen(true)}
            onLogout={logout}
            userName={profile.name || profile.username}
            userRole={profile.role}
          />
          {renderPage()}
        </main>
      </div>
      <PWAInstallBanner />
    </>
  );
}
