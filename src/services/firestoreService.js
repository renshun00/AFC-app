/**
 * firestoreService.js
 *
 * Firestore helpers aligned to the confirmed data schema.
 *
 * ── COLLECTION AUTO-CREATION ──────────────────────────────────────────────────
 * Firestore creates collections automatically on first write.
 * No manual setup needed — just call create/add and the collection appears.
 *
 * ── DOCUMENT ID STRATEGY ──────────────────────────────────────────────────────
 * TRANSACTIONAL (sales_orders, inventory_transactions, staff_shifts,
 *   staff_tasks, expenses, cash_register_sessions, payment_transactions)
 *   → Firestore auto-generated ID via addDoc()
 *
 * SUMMARY / AGGREGATED (daily_sales_summary, daily_profit_summary,
 *   inventory_summary, payroll_summary, menu_performance_summary)
 *   → Deterministic key so upserts are idempotent:
 *       daily_sales_summary:    "${date}_${outletId}"
 *       daily_profit_summary:   "${date}"
 *       inventory_summary:      "${productId}"          (latest snapshot)
 *       payroll_summary:        "${staffId}_${date}"
 *       menu_performance_summary: "${date}_${menuItemId}"
 *
 * MASTER DATA (staff, outlets — managed separately)
 *   → addDoc() for new records; doc id = Firebase Auth UID for staff
 *
 * ── SCHEMA REFERENCE ──────────────────────────────────────────────────────────
 * sales_orders          { outletId, staffId, subtotal, discount, total,
 *                         status, items[], createdAt }
 * inventory_transactions{ productId, type, qty, referenceId, createdAt }
 * staff_shifts          { staffId, outletId, clockIn, clockOut }
 * staff_tasks           { staffId, taskType, qty, rate, total }
 * expenses              { categoryId, amount, note, createdAt }
 * cash_register_sessions{ staffId, outletId, openingCash, closingCash, status }
 * payment_transactions  { salesOrderId, method, amount, createdAt }
 * daily_sales_summary   { date, outletId, totalSales, totalOrders }
 * daily_profit_summary  { date, revenue, cost, expense, profit }
 * inventory_summary     { productId, stock, value }
 * payroll_summary       { staffId, date, hours, wage }
 * menu_performance_summary { date, menuItemId, qtySold, revenue,
 *                            cost, profit, margin }
 */

import {
  collection, doc,
  addDoc, setDoc, updateDoc, deleteDoc,
  getDoc, getDocs,
  query, where, orderBy, limit,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// ─── Private helpers ──────────────────────────────────────────────────────────

const col = (name) => collection(db, name);
const ref = (name, id) => doc(db, name, id);

async function getAll(name) {
  const snap = await getDocs(col(name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getById(name, id) {
  const snap = await getDoc(ref(name, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Auto-id insert. Returns new doc id. */
async function insert(name, data) {
  const r = await addDoc(col(name), { ...data, createdAt: serverTimestamp() });
  return r.id;
}

/** Update existing doc, always stamps updatedAt. */
async function patch(name, id, data) {
  await updateDoc(ref(name, id), { ...data, updatedAt: serverTimestamp() });
}

/** Upsert with merge — used for summary collections. */
async function upsert(name, id, data) {
  await setDoc(ref(name, id), data, { merge: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTIONAL COLLECTIONS
// ─────────────────────────────────────────────────────────────────────────────

// ── sales_orders ──────────────────────────────────────────────────────────────
// { outletId, staffId, subtotal, discount, total, status, items[], createdAt }
// items[]: { menuItemId, qty, price }
// status: "completed" | "pending" | "cancelled"
export const salesOrderService = {
  /**
   * Create a new sales order.
   * @param {object} data - { outletId, staffId, subtotal, discount, total, status, items[] }
   * @returns {string} new document id
   */
  create: (data) =>
    insert('sales_orders', {
      outletId:  data.outletId,
      staffId:   data.staffId,
      subtotal:  data.subtotal,
      discount:  data.discount ?? 0,
      total:     data.total,
      status:    data.status ?? 'completed',
      items:     data.items ?? [],
    }),

  getById: (id) => getById('sales_orders', id),

  /** Orders for an outlet, most recent first */
  getByOutlet: async (outletId, limitCount = 50) => {
    const q = query(
      col('sales_orders'),
      where('outletId', '==', outletId),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /** Orders for a date range (JS Date objects) */
  getByDateRange: async (outletId, from, to) => {
    const q = query(
      col('sales_orders'),
      where('outletId', '==', outletId),
      where('createdAt', '>=', Timestamp.fromDate(from)),
      where('createdAt', '<=', Timestamp.fromDate(to)),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /** Orders by staff member */
  getByStaff: async (staffId, limitCount = 50) => {
    const q = query(
      col('sales_orders'),
      where('staffId', '==', staffId),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  updateStatus: (id, status) => patch('sales_orders', id, { status }),
};

// ── inventory_transactions ────────────────────────────────────────────────────
// { productId, type, qty, referenceId, createdAt }
// type: "PRODUCTION" | "PURCHASE" | "WASTAGE" | "ADJUSTMENT"
// qty: negative = stock consumed, positive = stock added
export const inventoryTransactionService = {
  /**
   * Log any inventory movement.
   * @param {object} data - { productId, type, qty, referenceId? }
   */
  log: (data) =>
    insert('inventory_transactions', {
      productId:   data.productId,
      type:        data.type,
      qty:         data.qty,
      referenceId: data.referenceId ?? null,
    }),

  /** Log production consumption (triggered when a sale is completed) */
  logProduction: (productId, qty, salesOrderId) =>
    insert('inventory_transactions', {
      productId,
      type:        'PRODUCTION',
      qty:         -Math.abs(qty), // always negative — stock consumed
      referenceId: salesOrderId,
    }),

  /** Log a stock purchase / delivery */
  logPurchase: (productId, qty, referenceId = null) =>
    insert('inventory_transactions', {
      productId,
      type:        'PURCHASE',
      qty:         Math.abs(qty), // always positive — stock added
      referenceId,
    }),

  /** Log wastage */
  logWastage: (productId, qty, referenceId = null) =>
    insert('inventory_transactions', {
      productId,
      type:        'WASTAGE',
      qty:         -Math.abs(qty), // always negative
      referenceId,
    }),

  /** All transactions for a product */
  getByProduct: async (productId, limitCount = 100) => {
    const q = query(
      col('inventory_transactions'),
      where('productId', '==', productId),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /** Transactions by type (e.g. all WASTAGE records) */
  getByType: async (type, limitCount = 100) => {
    const q = query(
      col('inventory_transactions'),
      where('type', '==', type),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /** All transactions linked to a sales order */
  getByReference: async (referenceId) => {
    const q = query(
      col('inventory_transactions'),
      where('referenceId', '==', referenceId),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
};

// ── staff_shifts ──────────────────────────────────────────────────────────────
// { staffId, outletId, clockIn, clockOut }
// clockIn / clockOut are Firestore Timestamps
export const staffShiftService = {
  /** Clock in — returns new shift doc id */
  clockIn: (staffId, outletId) =>
    insert('staff_shifts', {
      staffId,
      outletId,
      clockIn:  serverTimestamp(),
      clockOut: null,
    }),

  /** Clock out — updates existing shift doc */
  clockOut: (shiftId) =>
    updateDoc(ref('staff_shifts', shiftId), { clockOut: serverTimestamp() }),

  getById: (id) => getById('staff_shifts', id),

  /** Active (open) shift for a staff member */
  getActiveShift: async (staffId) => {
    const q = query(
      col('staff_shifts'),
      where('staffId', '==', staffId),
      where('clockOut', '==', null),
      limit(1),
    );
    const snap = await getDocs(q);
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  },

  /** All shifts for a staff member */
  getByStaff: async (staffId, limitCount = 30) => {
    const q = query(
      col('staff_shifts'),
      where('staffId', '==', staffId),
      orderBy('clockIn', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /** All shifts for an outlet in a date range */
  getByOutletAndDate: async (outletId, from, to) => {
    const q = query(
      col('staff_shifts'),
      where('outletId', '==', outletId),
      where('clockIn', '>=', Timestamp.fromDate(from)),
      where('clockIn', '<=', Timestamp.fromDate(to)),
      orderBy('clockIn', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
};

// ── staff_tasks ───────────────────────────────────────────────────────────────
// { staffId, taskType, qty, rate, total }
// taskType: "cashier" | "kitchen" | "cleaning" | "packaging" | etc.
export const staffTaskService = {
  /**
   * Record a completed task.
   * @param {object} data - { staffId, taskType, qty, rate, total }
   */
  create: (data) =>
    insert('staff_tasks', {
      staffId:  data.staffId,
      taskType: data.taskType,
      qty:      data.qty,
      rate:     data.rate,
      total:    data.total ?? data.qty * data.rate,
    }),

  getByStaff: async (staffId, limitCount = 100) => {
    const q = query(
      col('staff_tasks'),
      where('staffId', '==', staffId),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  getByTaskType: async (taskType, limitCount = 100) => {
    const q = query(
      col('staff_tasks'),
      where('taskType', '==', taskType),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  update: (id, data) => patch('staff_tasks', id, data),

  delete: (id) => deleteDoc(ref('staff_tasks', id)),
};

// ── expenses ──────────────────────────────────────────────────────────────────
// { categoryId, amount, note, createdAt }
// categoryId examples: "utilities" | "packaging" | "maintenance" | "rental"
export const expenseService = {
  /**
   * @param {object} data - { categoryId, amount, note }
   */
  create: (data) =>
    insert('expenses', {
      categoryId: data.categoryId,
      amount:     data.amount,
      note:       data.note ?? '',
    }),

  getAll: () => getAll('expenses'),

  getByCategory: async (categoryId, limitCount = 100) => {
    const q = query(
      col('expenses'),
      where('categoryId', '==', categoryId),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  getByDateRange: async (from, to) => {
    const q = query(
      col('expenses'),
      where('createdAt', '>=', Timestamp.fromDate(from)),
      where('createdAt', '<=', Timestamp.fromDate(to)),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  update: (id, data) => patch('expenses', id, data),

  delete: (id) => deleteDoc(ref('expenses', id)),
};

// ── cash_register_sessions ────────────────────────────────────────────────────
// { staffId, outletId, openingCash, closingCash, status }
// status: "open" | "closed"
export const cashRegisterService = {
  /** Open a new session. Returns doc id. */
  open: (staffId, outletId, openingCash) =>
    insert('cash_register_sessions', {
      staffId,
      outletId,
      openingCash,
      closingCash: null,
      status:      'open',
    }),

  /** Close a session with the final cash count. */
  close: (sessionId, closingCash) =>
    updateDoc(ref('cash_register_sessions', sessionId), {
      closingCash,
      status:    'closed',
      updatedAt: serverTimestamp(),
    }),

  getById: (id) => getById('cash_register_sessions', id),

  /** Find the currently open session for a staff member */
  getOpenSession: async (staffId, outletId) => {
    const q = query(
      col('cash_register_sessions'),
      where('staffId',  '==', staffId),
      where('outletId', '==', outletId),
      where('status',   '==', 'open'),
      limit(1),
    );
    const snap = await getDocs(q);
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  },

  /** All sessions for an outlet */
  getByOutlet: async (outletId, limitCount = 20) => {
    const q = query(
      col('cash_register_sessions'),
      where('outletId', '==', outletId),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
};

// ── payment_transactions ──────────────────────────────────────────────────────
// { salesOrderId, method, amount, createdAt }
// method: "cash" | "card" | "ewallet" | "bank_transfer"
export const paymentTransactionService = {
  /**
   * @param {object} data - { salesOrderId, method, amount }
   */
  record: (data) =>
    insert('payment_transactions', {
      salesOrderId: data.salesOrderId,
      method:       data.method,
      amount:       data.amount,
    }),

  getBySalesOrder: async (salesOrderId) => {
    const q = query(
      col('payment_transactions'),
      where('salesOrderId', '==', salesOrderId),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  getByMethod: async (method, limitCount = 100) => {
    const q = query(
      col('payment_transactions'),
      where('method', '==', method),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  getByDateRange: async (from, to) => {
    const q = query(
      col('payment_transactions'),
      where('createdAt', '>=', Timestamp.fromDate(from)),
      where('createdAt', '<=', Timestamp.fromDate(to)),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY / AGGREGATED COLLECTIONS  (upsert — safe to call multiple times)
// ─────────────────────────────────────────────────────────────────────────────

// ── daily_sales_summary ───────────────────────────────────────────────────────
// doc id: "${date}_${outletId}"  e.g. "2026-07-01_outlet_001"
// { date, outletId, totalSales, totalOrders }
export const dailySalesSummaryService = {
  upsert: (date, outletId, data) =>
    upsert('daily_sales_summary', `${date}_${outletId}`, {
      date, outletId,
      totalSales:  data.totalSales,
      totalOrders: data.totalOrders,
    }),

  getByDate: (date, outletId) =>
    getById('daily_sales_summary', `${date}_${outletId}`),

  getRecent: async (outletId, limitCount = 30) => {
    const q = query(
      col('daily_sales_summary'),
      where('outletId', '==', outletId),
      orderBy('date', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
};

// ── daily_profit_summary ──────────────────────────────────────────────────────
// doc id: "${date}"  e.g. "2026-07-01"
// { date, revenue, cost, expense, profit }
export const dailyProfitSummaryService = {
  upsert: (date, data) =>
    upsert('daily_profit_summary', date, {
      date,
      revenue: data.revenue,
      cost:    data.cost,
      expense: data.expense,
      profit:  data.profit,
    }),

  getByDate: (date) =>
    getById('daily_profit_summary', date),

  getRecent: async (limitCount = 30) => {
    const q = query(
      col('daily_profit_summary'),
      orderBy('date', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
};

// ── inventory_summary ─────────────────────────────────────────────────────────
// doc id: "${productId}"  — one live snapshot per product
// { productId, stock, value }
export const inventorySummaryService = {
  upsert: (productId, stock, value) =>
    upsert('inventory_summary', productId, { productId, stock, value }),

  getByProduct: (productId) =>
    getById('inventory_summary', productId),

  getAll: () => getAll('inventory_summary'),

  getLowStock: async (threshold = 10) => {
    const q = query(
      col('inventory_summary'),
      where('stock', '<=', threshold),
      orderBy('stock', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
};

// ── payroll_summary ───────────────────────────────────────────────────────────
// doc id: "${staffId}_${date}"  e.g. "staff_001_2026-07-01"
// { staffId, date, hours, wage }
export const payrollSummaryService = {
  upsert: (staffId, date, hours, wage) =>
    upsert('payroll_summary', `${staffId}_${date}`, { staffId, date, hours, wage }),

  getByStaffAndDate: (staffId, date) =>
    getById('payroll_summary', `${staffId}_${date}`),

  getByStaff: async (staffId, limitCount = 30) => {
    const q = query(
      col('payroll_summary'),
      where('staffId', '==', staffId),
      orderBy('date', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  getByDate: async (date) => {
    const q = query(
      col('payroll_summary'),
      where('date', '==', date),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
};

// ── menu_performance_summary ──────────────────────────────────────────────────
// doc id: "${date}_${menuItemId}"  e.g. "2026-07-01_menu_001"
// { date, menuItemId, qtySold, revenue, cost, profit, margin }
export const menuPerformanceService = {
  upsert: (date, menuItemId, data) =>
    upsert('menu_performance_summary', `${date}_${menuItemId}`, {
      date, menuItemId,
      qtySold:  data.qtySold,
      revenue:  data.revenue,
      cost:     data.cost,
      profit:   data.profit,
      margin:   data.margin,
    }),

  getByDateAndItem: (date, menuItemId) =>
    getById('menu_performance_summary', `${date}_${menuItemId}`),

  getByDate: async (date) => {
    const q = query(
      col('menu_performance_summary'),
      where('date', '==', date),
      orderBy('revenue', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  getByMenuItem: async (menuItemId, limitCount = 30) => {
    const q = query(
      col('menu_performance_summary'),
      where('menuItemId', '==', menuItemId),
      orderBy('date', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  getTopPerformers: async (date, limitCount = 10) => {
    const q = query(
      col('menu_performance_summary'),
      where('date', '==', date),
      orderBy('revenue', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT  (menu items + raw materials / inventory)
// doc id = Firestore auto-id
// { name, categoryId, uomCode, sellingPrice, standardCost, stock, minStock,
//   showOnPos, isInventoryItem, isActive, ... }
// ─────────────────────────────────────────────────────────────────────────────
export const productService = {
  getAll: () => getAll('products'),

  getById: (id) => getById('products', id),

  getMenuItems: async () => {
    const q = query(
      col('products'),
      where('showOnPos', '==', true),
      where('isActive', '==', true),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  getInventoryItems: async () => {
    const q = query(
      col('products'),
      where('isInventoryItem', '==', true),
      where('isActive', '==', true),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  create: (data) =>
    insert('products', { ...data, isActive: data.isActive ?? true, recipe: data.recipe ?? [] }),

  update: (id, data) => patch('products', id, data),

  deactivate: (id) =>
    updateDoc(ref('products', id), { isActive: false, updatedAt: serverTimestamp() }),

  delete: (id) => deleteDoc(ref('products', id)),
};

// ─────────────────────────────────────────────────────────────────────────────
// UNIT CONVERSION HELPERS (g↔kg, mL↔L)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Defines which recipe sub-units map to which inventory base units,
 * and the conversion factor.
 *
 * recipeUnit → { baseUnit, factor }
 * "60 g" → 60 / 1000 = 0.06 kg
 * "200 mL" → 200 / 1000 = 0.2 L
 */
const UNIT_CONVERSIONS = {
  g:  { baseUnit: 'kg', factor: 1000 },   // 1 kg = 1000 g
  mL: { baseUnit: 'L',  factor: 1000 },   // 1 L  = 1000 mL
};

/** All recipe-entry units available for a given inventory base unit. */
export const RECIPE_UNITS_FOR_BASE = {
  kg:   ['g', 'kg'],
  L:    ['mL', 'L'],
  pcs:  ['pcs'],
  box:  ['box'],
  pack: ['pack'],
};

/**
 * Convert a recipe quantity to the inventory's base unit.
 * e.g. convertToBaseUnit(60, 'g')  → 0.06  (kg)
 *      convertToBaseUnit(2, 'kg')  → 2     (kg, no conversion needed)
 *      convertToBaseUnit(5, 'pcs') → 5     (pcs, no conversion needed)
 */
export function convertToBaseUnit(qty, recipeUnit) {
  const conv = UNIT_CONVERSIONS[recipeUnit];
  if (conv) return qty / conv.factor;
  return qty; // already in base unit
}

/**
 * Convert an inventory base-unit quantity to a recipe sub-unit.
 * e.g. convertFromBaseUnit(0.06, 'g') → 60  (from kg)
 */
export function convertFromBaseUnit(baseQty, recipeUnit) {
  const conv = UNIT_CONVERSIONS[recipeUnit];
  if (conv) return baseQty * conv.factor;
  return baseQty;
}

// ─────────────────────────────────────────────────────────────────────────────
// RECIPE SERVICE — Menu Item ↔ Inventory linkage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recipe entry shape (stored on the product doc):
 * {
 *   inventoryItemId:   string,   // products doc id of the raw material
 *   inventoryItemName: string,   // denormalised display name
 *   qtyPerUnit:        number,   // qty consumed per 1 menu item sold
 *   unit:              string,   // recipe unit ('g', 'mL', 'pcs', etc.)
 *   baseUnit:          string,   // inventory's base unit ('kg', 'L', etc.)
 * }
 */
export const recipeService = {
  /**
   * Calculate the maximum number of a menu item that can be made,
   * given its recipe and the current inventory stock levels.
   *
   * @param {Array} recipe - the menu item's recipe array
   * @param {Array} inventoryItems - all inventory product docs (with .id and .stock)
   * @returns {number} available quantity (floored to integer), or Infinity if no recipe
   */
  calculateAvailableQty(recipe, inventoryItems) {
    if (!recipe || recipe.length === 0) return Infinity;

    let minQty = Infinity;
    for (const ingredient of recipe) {
      const invItem = inventoryItems.find(i => i.id === ingredient.inventoryItemId);
      if (!invItem) return 0; // ingredient not found in inventory → can't make any

      const stockInBaseUnit = invItem.stock ?? 0;
      const qtyNeededInBaseUnit = convertToBaseUnit(ingredient.qtyPerUnit, ingredient.unit);
      if (qtyNeededInBaseUnit <= 0) continue;

      const canMake = stockInBaseUnit / qtyNeededInBaseUnit;
      minQty = Math.min(minQty, canMake);
    }

    return minQty === Infinity ? Infinity : Math.floor(minQty);
  },

  /**
   * Deduct raw material stock for a completed order.
   * For each recipe ingredient, subtracts (qtyPerUnit × multiplier) converted
   * to base unit, and logs an inventory_transaction.
   *
   * @param {Array}  recipe       - the menu item's recipe array
   * @param {number} multiplier   - how many of the menu item were sold (cart qty)
   * @param {string} salesOrderId - the sales order doc id (for referenceId)
   * @param {Array}  productDocs  - live product docs (to read current stock)
   */
  async deductIngredients(recipe, multiplier, salesOrderId, productDocs) {
    if (!recipe || recipe.length === 0) return;

    for (const ingredient of recipe) {
      const prodDoc = productDocs.find(p => p.id === ingredient.inventoryItemId);
      if (!prodDoc) continue;

      const deductInBase = convertToBaseUnit(ingredient.qtyPerUnit, ingredient.unit) * multiplier;
      const currentStock = prodDoc.stock ?? 0;
      const newStock = Math.max(0, currentStock - deductInBase);

      // Round to avoid floating-point dust (6 decimal places)
      const rounded = Math.round(newStock * 1000000) / 1000000;

      await patch('products', ingredient.inventoryItemId, { stock: rounded });
      await insert('inventory_transactions', {
        productId:   ingredient.inventoryItemId,
        type:        'PRODUCTION',
        qty:         -Math.abs(deductInBase),
        referenceId: salesOrderId,
      });
    }
  },

  /**
   * Auto-calculate the standard cost of a menu item from its recipe.
   * Σ(ingredient.qtyPerUnit in base unit × ingredient unit cost)
   *
   * @param {Array} recipe - the menu item's recipe array
   * @param {Array} inventoryItems - all inventory product docs (with .standardCost)
   * @returns {number} total cost
   */
  calculateCostFromRecipe(recipe, inventoryItems) {
    if (!recipe || recipe.length === 0) return 0;

    let total = 0;
    for (const ingredient of recipe) {
      const invItem = inventoryItems.find(i => i.id === ingredient.inventoryItemId);
      if (!invItem) continue;

      const qtyInBase = convertToBaseUnit(ingredient.qtyPerUnit, ingredient.unit);
      total += qtyInBase * (invItem.standardCost ?? 0);
    }

    return Math.round(total * 100) / 100; // round to 2 dp
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MASTER DATA  (staff and outlets — rarely changes)
// ─────────────────────────────────────────────────────────────────────────────

// ── staff ─────────────────────────────────────────────────────────────────────
// doc id = Firebase Auth UID (set when creating the user in Firebase Console)
// { name, email, role, isActive, ... }
export const staffService = {
  getAll: () => getAll('staff'),
  getById: (id) => getById('staff', id),

  getActive: async () => {
    const q = query(col('staff'), where('isActive', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /** Use Firebase Auth UID as the doc id */
  create: (uid, data) =>
    setDoc(ref('staff', uid), {
      ...data,
      isActive:  true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),

  update: (id, data) => patch('staff', id, data),

  deactivate: (id) =>
    updateDoc(ref('staff', id), { isActive: false, updatedAt: serverTimestamp() }),

  updateLastLogin: (id) =>
    updateDoc(ref('staff', id), { lastLoginAt: serverTimestamp() }),
};

// ── outlets ───────────────────────────────────────────────────────────────────
export const outletService = {
  getAll: () => getAll('outlets'),

  getActive: async () => {
    const q = query(col('outlets'), where('isActive', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  create: (data) =>
    insert('outlets', { ...data, isActive: true }),

  update: (id, data) => patch('outlets', id, data),

  deactivate: (id) =>
    updateDoc(ref('outlets', id), { isActive: false, updatedAt: serverTimestamp() }),
};
