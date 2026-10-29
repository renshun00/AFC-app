# Ayam Flava Crisp (AFC) Management System

A unified Progressive Web Application (PWA) designed for Ayam Flava Crisp (AFC) to handle **Point of Sale (POS)**, **Daily Inventory & Reconciliation**, **Central Stock Audits**, **Menu Engineering**, and **Tiered Staff Payroll**.

---

## 📖 Comprehensive Documentation & Handover Guide

> **Important for Developers & Maintainers:**  
> A detailed, end-to-end architecture, mathematical formula reference, Firestore schema guide, and troubleshooting handbook is available in:  
> 👉 [**DEVELOPER_HANDOVER_GUIDE.md**](./DEVELOPER_HANDOVER_GUIDE.md)

---

## 🚀 Quick Start (Local Development)

### 1. Clone the repository
```bash
git clone -b development https://github.com/renshun00/AFC-app.git
cd AFC-app
```

### 2. Install dependencies
```bash
npm install
```

### 3. Run development server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Build for Production
```bash
npm run build
```

---

## 🏗️ Core Architecture Overview

- **Frontend:** React 18 with Vite 5, Lucide React icons, and Recharts.
- **Backend & Database:** Firebase v10 Auth and Firestore with offline multi-tab IndexedDB cache persistence.
- **PWA:** VitePWA with service worker caching.
- **Roles:**
  - **Admin:** Dashboard analytics, POS, Inventory management, Menu engineering, Tiered payroll, Supplier management, Reports, Daily reconciliation.
  - **Staff:** Attendance shift check-in/out, Daily inventory log, Morning stock-in, POS register, Closing unsold counts.

For complete implementation details, business formulas (chickens sold, carryover math, fried leftover penalties, tiered wages), refer to [**DEVELOPER_HANDOVER_GUIDE.md**](./DEVELOPER_HANDOVER_GUIDE.md).
