import React from 'react';
import StaffDashboardPage from './StaffDashboardPage';

/**
 * DashboardPage — daily inventory input form for every role.
 *
 * Admin and Staff both see the same page. Admin-only controls (e.g. the
 * "Re-apply to Inventory" button and the Admin Bill KG fields) are gated
 * inside StaffDashboardPage via the logged-in profile's role.
 * (AdminDashboardPage.jsx, the analytics view, is kept but no longer routed here.)
 */
export default function DashboardPage({ isMobile }) {
  return <StaffDashboardPage isMobile={isMobile} />;
}
