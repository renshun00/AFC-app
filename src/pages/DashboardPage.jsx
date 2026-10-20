import React from 'react';
import StaffDashboardPage from './StaffDashboardPage';
import AdminDashboardPage from './AdminDashboardPage';

/**
 * DashboardPage dispatcher:
 * - Admin: Admin Dashboard view (analytics, KPIs, sales charts, locked accounts, quick actions).
 * - Staff: Staff Daily Inventory view.
 */
export default function DashboardPage({ isMobile, navigate, userRole }) {
  if (userRole === 'Admin') {
    return <AdminDashboardPage isMobile={isMobile} navigate={navigate} />;
  }
  return <StaffDashboardPage isMobile={isMobile} />;
}

