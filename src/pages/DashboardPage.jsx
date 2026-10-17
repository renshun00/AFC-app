import React from 'react';
import AdminDashboardPage from './AdminDashboardPage';
import StaffDashboardPage from './StaffDashboardPage';

/**
 * DashboardPage — role-based switcher.
 *
 * Admin  → Analytics dashboard (revenue, charts, alerts)
 * Staff  → Daily inventory input form (stock logging)
 */
export default function DashboardPage({ isMobile, navigate, userRole }) {
  const isAdmin = userRole === 'Admin';

  if (isAdmin) {
    return <AdminDashboardPage isMobile={isMobile} navigate={navigate} />;
  }

  return <StaffDashboardPage isMobile={isMobile} />;
}
