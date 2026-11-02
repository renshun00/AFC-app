# AFC Management System

A unified Progressive Web Application (PWA) designed for Alang Fried Chicken to handle **Point of Sale (POS)**, **Daily Inventory & Reconciliation**, **Central Stock Audits**, **Menu Engineering**, and **Tiered Staff Payroll**.

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

## Automatic payroll

In **Staff & Payroll → Staff directory → Profile & defaults**, configure each worker's regular duties once. Attendance activates those duties on trading days. Receiving quantities, completed POS sales, clock-outs and submitted closing counts automatically update saved wages and the monthly total. Daily breakdown is a review view; **Adjust duties / advances** is for exceptions, bonuses and salary advances, not a daily approval step.

Pinjam Makan is deducted from month-end pay. The management fee belongs only to StaffCosts reporting. Incomplete source data is marked pending; known wages are saved and missing amounts update when the records are completed. Rates are captured when a day is first calculated; changing defaults does not reprice existing days.

Synchronization runs in signed-in app sessions on every page and catches up source dates when the app reopens. It is not a server background job while all sessions are closed. Firebase rules must permit the operational source reads and derived payroll writes for the signed-in role; synchronization failures are shown with a retry action. Administrative adjustments and rate edits retain the Admin check. Deployed rules are managed outside this repository and have not been changed here.

Run `npm test` for local calculation, persistence and synchronization tests (mock Firestore, no cloud writes). Close app sessions before using local data-reset helpers; include `payroll_adjustments` and `staff_cost_summary` when clearing operational payroll data.

---
