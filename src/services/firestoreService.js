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
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFriedAndSoldQuantities, getRawMaterialUsage } from '../utils/dailyFlowCalculator';

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
      invoiceNumber: data.invoiceNumber ?? null,
      date: data.date || (new Date()).toISOString().slice(0, 10),
      outletId: data.outletId ?? 'main_branch',
      staffId: data.staffId ?? 'pos_user',
      subtotal: data.subtotal ?? 0,
      discount: data.discount ?? 0,
      total: data.total ?? 0,
      status: data.status ?? 'completed',
      paymentMethod: data.paymentMethod ?? null,
      items: data.items ?? [],
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

  /**
   * Aggregates completed POS sales orders for a specific date (YYYY-MM-DD).
   * Extracts chicken pieces sold, carcass, sauces, rice, and COS directly from
   * completed orders and their recipes.
   */
  getDailySummary: async (dateString) => {
    if (!dateString) return null;
    let orders = [];

    // 1. Try querying by date field
    try {
      const qDate = query(
        col('sales_orders'),
        where('date', '==', dateString),
        where('status', '==', 'completed')
      );
      const snap = await getDocs(qDate);
      orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn('[salesOrderService] date field query fallback:', e);
    }

    // 2. Fallback to createdAt range or memory filter if orders empty
    if (orders.length === 0) {
      try {
        const start = new Date(dateString + 'T00:00:00');
        const end = new Date(dateString + 'T23:59:59.999');
        const qRange = query(
          col('sales_orders'),
          where('createdAt', '>=', Timestamp.fromDate(start)),
          where('createdAt', '<=', Timestamp.fromDate(end)),
          where('status', '==', 'completed')
        );
        const snapRange = await getDocs(qRange);
        orders = snapRange.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (rangeErr) {
        try {
          const qRecent = query(
            col('sales_orders'),
            where('status', '==', 'completed'),
            orderBy('createdAt', 'desc'),
            limit(300)
          );
          const snapRecent = await getDocs(qRecent);
          orders = snapRecent.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(o => {
              if (o.date === dateString) return true;
              if (o.createdAt) {
                const dt = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
                return dt.toISOString().slice(0, 10) === dateString;
              }
              return false;
            });
        } catch (memErr) {
          console.error('[salesOrderService] getDailySummary failed:', memErr);
        }
      }
    }

    let totalRevenue = 0;
    let totalCostOfSales = 0;
    let chickenPcsSold = 0;
    let carcassPcsSold = 0;
    let chickenNeckSetSold = 0;
    let mushroomSetsSold = 0;
    let butterRiceSold = 0;
    const saucesSold = {
      cheese_sauce: 0,
      korean_sauce: 0,
      green_sauce: 0,
      bbq_sauce: 0,
    };
    const itemsSummary = {};

    for (const order of orders) {
      totalRevenue += Number(order.total) || 0;
      const items = order.items || [];

      for (const it of items) {
        const qty = Number(it.qty) || 0;
        const price = Number(it.price) || 0;
        const nameLower = String(it.name || '').toLowerCase();
        const recipe = it.recipe || [];

        if (it.menuItemId) {
          if (!itemsSummary[it.menuItemId]) {
            itemsSummary[it.menuItemId] = { id: it.menuItemId, name: it.name, qty: 0, total: 0 };
          }
          itemsSummary[it.menuItemId].qty += qty;
          itemsSummary[it.menuItemId].total += qty * price;
        }

        let itemChickenCounted = false;
        let itemCarcassCounted = false;
        let itemNeckCounted = false;
        let itemMushroomCounted = false;
        let itemRiceCounted = false;

        const hasRecipe = recipe && recipe.length > 0;

        if (hasRecipe) {
          for (const ing of recipe) {
            const ingName = String(ing.inventoryItemName || '').toLowerCase();
            const ingQty = (Number(ing.qtyPerUnit) || 1) * qty;

            if (ingName.includes('chicken (pieces)') || ingName.includes('chicken pieces') || (ingName.includes('ayam') && ingName.includes('ketul'))) {
              chickenPcsSold += ingQty;
              itemChickenCounted = true;
            } else if (ingName.includes('carcass') || ingName.includes('rangka')) {
              carcassPcsSold += ingQty;
              itemCarcassCounted = true;
            } else if (ingName.includes('neck') || ingName.includes('leher')) {
              chickenNeckSetSold += ing.unit === 'set' ? ingQty : Math.floor(ingQty / 4) || ingQty;
              itemNeckCounted = true;
            } else if (ingName.includes('mushroom') || ingName.includes('cendawan') || ingName.includes('enoki')) {
              mushroomSetsSold += ingQty;
              itemMushroomCounted = true;
            } else if (ingName.includes('rice') || ingName.includes('nasi') || ingName.includes('beras')) {
              butterRiceSold += ingQty;
              itemRiceCounted = true;
            } else if (ingName.includes('cheese') || ingName.includes('keju')) {
              saucesSold.cheese_sauce += ingQty;
            } else if (ingName.includes('korean')) {
              saucesSold.korean_sauce += ingQty;
            } else if (ingName.includes('green') || ingName.includes('hijau')) {
              saucesSold.green_sauce += ingQty;
            } else if (ingName.includes('bbq')) {
              saucesSold.bbq_sauce += ingQty;
            }
          }
        } else {
          // Fallback heuristics ONLY if recipe was absent
          const isNonChickenPiece = nameLower.includes('carcass') || nameLower.includes('rangka') ||
                                    nameLower.includes('neck') || nameLower.includes('leher') ||
                                    nameLower.includes('mushroom') || nameLower.includes('cendawan') || nameLower.includes('enoki') ||
                                    nameLower.includes('rice') || nameLower.includes('nasi') ||
                                    nameLower.includes('sauce') || nameLower.includes('sos');

          if (!isNonChickenPiece) {
            if (nameLower.includes('1 pc') || nameLower.includes('1pc') || nameLower.includes('1 ketul') || nameLower.includes('single')) {
              chickenPcsSold += 1 * qty;
            } else if (nameLower.includes('2 pc') || nameLower.includes('2pc') || nameLower.includes('2 ketul') || nameLower.includes('double')) {
              chickenPcsSold += 2 * qty;
            } else if (nameLower.includes('3 pc') || nameLower.includes('3pc') || nameLower.includes('3 ketul') || nameLower.includes('trio')) {
              chickenPcsSold += 3 * qty;
            } else if (nameLower.includes('fried chicken') || nameLower.includes('ayam goreng') || nameLower.includes('original') || nameLower.includes('spicy')) {
              chickenPcsSold += 1 * qty;
            }
          }

          if (nameLower.includes('carcass') || nameLower.includes('rangka')) {
            carcassPcsSold += 1 * qty;
          }
          if (nameLower.includes('neck') || nameLower.includes('leher')) {
            chickenNeckSetSold += 1 * qty;
          }
          if (nameLower.includes('mushroom') || nameLower.includes('cendawan') || nameLower.includes('enoki')) {
            mushroomSetsSold += 1 * qty;
          }
          if (nameLower.includes('rice') || nameLower.includes('nasi')) {
            butterRiceSold += 1 * qty;
          }
          if (nameLower.includes('cheese sauce') || nameLower.includes('sos cheese') || nameLower.includes('sos keju')) {
            saucesSold.cheese_sauce += 1 * qty;
          }
          if (nameLower.includes('korean sauce') || nameLower.includes('sos korean')) {
            saucesSold.korean_sauce += 1 * qty;
          }
          if (nameLower.includes('green sauce') || nameLower.includes('sos hijau')) {
            saucesSold.green_sauce += 1 * qty;
          }
          if (nameLower.includes('bbq sauce') || nameLower.includes('sos bbq')) {
            saucesSold.bbq_sauce += 1 * qty;
          }
        }
      }
    }

    return {
      date: dateString,
      orderCount: orders.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCostOfSales: Math.round(totalCostOfSales * 100) / 100,
      soldBreakdown: {
        chicken_pcs: chickenPcsSold,
        carcass_pcs: carcassPcsSold,
        chicken_neck_set: chickenNeckSetSold,
        mushroom: mushroomSetsSold,
        butter_rice: butterRiceSold,
        cheese_sauce: saucesSold.cheese_sauce,
        korean_sauce: saucesSold.korean_sauce,
        green_sauce: saucesSold.green_sauce,
        bbq_sauce: saucesSold.bbq_sauce,
      },
      itemsSummary: Object.values(itemsSummary),
      orders,
    };
  },
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
      productId: data.productId,
      type: data.type,
      qty: data.qty,
      referenceId: data.referenceId ?? null,
    }),

  /** Log production consumption (triggered when a sale is completed) */
  logProduction: (productId, qty, salesOrderId) =>
    insert('inventory_transactions', {
      productId,
      type: 'PRODUCTION',
      qty: -Math.abs(qty), // always negative — stock consumed
      referenceId: salesOrderId,
    }),

  /** Log a stock purchase / delivery */
  logPurchase: (productId, qty, referenceId = null) =>
    insert('inventory_transactions', {
      productId,
      type: 'PURCHASE',
      qty: Math.abs(qty), // always positive — stock added
      referenceId,
    }),

  /** Log wastage */
  logWastage: (productId, qty, referenceId = null) =>
    insert('inventory_transactions', {
      productId,
      type: 'WASTAGE',
      qty: -Math.abs(qty), // always negative
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
      clockIn: serverTimestamp(),
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

  /** Get most recent shift for a staff today (by date YYYY-MM-DD or start of day) */
  getTodayShift: async (staffId, dateStr) => {
    const targetDate = dateStr || new Date().toISOString().slice(0, 10);
    const startOfDay = new Date(`${targetDate}T00:00:00`);
    const endOfDay = new Date(`${targetDate}T23:59:59.999`);
    const q = query(
      col('staff_shifts'),
      where('staffId', '==', staffId),
      where('clockIn', '>=', Timestamp.fromDate(startOfDay)),
      where('clockIn', '<=', Timestamp.fromDate(endOfDay)),
      orderBy('clockIn', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  },

  /** Get all shifts for all staff on a specific date (YYYY-MM-DD) */
  getAllShiftsForDate: async (dateStr) => {
    const targetDate = dateStr || new Date().toISOString().slice(0, 10);
    const startOfDay = new Date(`${targetDate}T00:00:00`);
    const endOfDay = new Date(`${targetDate}T23:59:59.999`);
    const q = query(
      col('staff_shifts'),
      where('clockIn', '>=', Timestamp.fromDate(startOfDay)),
      where('clockIn', '<=', Timestamp.fromDate(endOfDay)),
      orderBy('clockIn', 'desc')
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
      staffId: data.staffId,
      taskType: data.taskType,
      qty: data.qty,
      rate: data.rate,
      total: data.total ?? data.qty * data.rate,
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
      amount: data.amount,
      note: data.note ?? '',
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
      status: 'open',
    }),

  /** Close a session with the final cash count. */
  close: (sessionId, closingCash) =>
    updateDoc(ref('cash_register_sessions', sessionId), {
      closingCash,
      status: 'closed',
      updatedAt: serverTimestamp(),
    }),

  getById: (id) => getById('cash_register_sessions', id),

  /** Find the currently open session for a staff member */
  getOpenSession: async (staffId, outletId) => {
    const q = query(
      col('cash_register_sessions'),
      where('staffId', '==', staffId),
      where('outletId', '==', outletId),
      where('status', '==', 'open'),
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
      method: data.method,
      amount: data.amount,
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
      totalSales: data.totalSales,
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
      cost: data.cost,
      expense: data.expense,
      profit: data.profit,
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
      qtySold: data.qtySold,
      revenue: data.revenue,
      cost: data.cost,
      profit: data.profit,
      margin: data.margin,
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
    insert('products', {
      ...data,
      isActive: data.isActive ?? true,
      isArchived: data.isArchived ?? false,
      recipe: data.recipe ?? []
    }),

  update: (id, data) => patch('products', id, data),

  archive: (id) =>
    updateDoc(ref('products', id), { isArchived: true, updatedAt: serverTimestamp() }),

  unarchive: (id) =>
    updateDoc(ref('products', id), { isArchived: false, updatedAt: serverTimestamp() }),

  deactivate: (id) =>
    updateDoc(ref('products', id), { isActive: false, updatedAt: serverTimestamp() }),

  delete: (id) => deleteDoc(ref('products', id)),
};

// ─────────────────────────────────────────────────────────────────────────────
// CHICKEN & MEAT METRICS (1 whole = 9 pcs, 1 pc avg 237g, used for COS formulas)
// ─────────────────────────────────────────────────────────────────────────────

export const CHICKEN_CONVERSION = {
  PIECES_PER_WHOLE: 9,
  AVG_PIECE_WEIGHT_KG: 0.237, // 237g per chicken piece
  WHOLE_WEIGHT_KG: 2.133, // 9 * 0.237 kg
  STANDARD_PRICE_PER_KG: 9.40, // RM 9.40 / kg standard
  CARCASS_AVG_WEIGHT_KG: 0.443, // 443g per carcass piece
  CARCASS_STANDARD_PRICE_PER_KG: 3.50, // RM 3.50 / kg standard
  FLOUR_PRICE_PER_KG: 14.00, // RM 14.00 / kg standard
};

/**
 * Calculates chicken piece cost and whole chicken cost from a given price per KG.
 * @param {number} pricePerKg - chicken price per kg (e.g. 9.40)
 * @returns {{ pieceCost: number, wholeCost: number, pricePerKg: number }}
 */
export function calculateChickenCosts(pricePerKg = 9.40) {
  const pieceCost = Math.round(pricePerKg * CHICKEN_CONVERSION.AVG_PIECE_WEIGHT_KG * 100) / 100;
  const wholeCost = Math.round(pieceCost * CHICKEN_CONVERSION.PIECES_PER_WHOLE * 100) / 100;
  return { pieceCost, wholeCost, pricePerKg };
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIT CONVERSION HELPERS (g↔kg, mL↔L, whole↔pcs, pc↔pcs unified)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unify unit codes: 'pc', 'pcs', 'piece', 'pieces' are all unified to 'pcs'.
 */
export function normalizeUnit(unit) {
  if (!unit) return 'pcs';
  const u = String(unit).toLowerCase().trim();
  if (u === 'pc' || u === 'pcs' || u === 'piece' || u === 'pieces' || u === 'ketul') return 'pcs';
  return u;
}

/**
 * Defines which recipe sub-units map to which inventory base units,
 * and the conversion factor.
 *
 * recipeUnit → { baseUnit, factor }
 * "60 g" → 60 / 1000 = 0.06 kg
 * "200 mL" → 200 / 1000 = 0.2 L
 * "1 pc" / "1 pcs" → unified 1 pcs (factor 1)
 */
const UNIT_CONVERSIONS = {
  g: { baseUnit: 'kg', factor: 1000 },   // 1 kg = 1000 g
  gram: { baseUnit: 'kg', factor: 1000 },
  mL: { baseUnit: 'L', factor: 1000 },   // 1 L  = 1000 mL
  pc: { baseUnit: 'pcs', factor: 1 },    // pc and pcs are united
  pcs: { baseUnit: 'pcs', factor: 1 },
};

/** All recipe-entry units available for a given inventory base unit. */
export const RECIPE_UNITS_FOR_BASE = {
  kg: ['g', 'kg', 'gram'],
  L: ['mL', 'L'],
  pcs: ['pcs'],
  whole: ['whole', 'pcs'],
  set: ['set'],
  box: ['box'],
  pack: ['pack'],
  bag: ['bag'],
  pc: ['pcs'], // pc alias united to pcs
  gram: ['gram', 'g', 'kg'],
};

/**
 * Convert a recipe quantity to the inventory's base unit.
 * e.g. convertToBaseUnit(60, 'g', 'kg')     → 0.06  (kg)
 *      convertToBaseUnit(9, 'pcs', 'whole') → 1     (whole)
 *      convertToBaseUnit(2, 'kg', 'kg')     → 2     (kg, no conversion needed)
 *      convertToBaseUnit(5, 'pcs', 'pcs')   → 5     (pcs, no conversion needed)
 *      convertToBaseUnit(1, 'pc', 'pcs')    → 1     (pcs, pc/pcs united)
 */
export function convertToBaseUnit(qty, recipeUnit, baseUnit = null) {
  const normRecipe = normalizeUnit(recipeUnit);
  const normBase = baseUnit ? normalizeUnit(baseUnit) : null;

  if (normBase === 'whole' && normRecipe === 'pcs') {
    return qty / CHICKEN_CONVERSION.PIECES_PER_WHOLE;
  }
  if (normBase === 'pcs' && normRecipe === 'whole') {
    return qty * CHICKEN_CONVERSION.PIECES_PER_WHOLE;
  }
  if (normBase && normBase === normRecipe) {
    return qty;
  }
  const conv = UNIT_CONVERSIONS[recipeUnit] || UNIT_CONVERSIONS[normRecipe];
  if (conv && (!normBase || normBase === normalizeUnit(conv.baseUnit))) return qty / conv.factor;
  return qty; // already in base unit
}

/**
 * Convert an inventory base-unit quantity to a recipe sub-unit.
 * e.g. convertFromBaseUnit(0.06, 'g') → 60  (from kg)
 */
export function convertFromBaseUnit(baseQty, recipeUnit, baseUnit = null) {
  const normRecipe = normalizeUnit(recipeUnit);
  const normBase = baseUnit ? normalizeUnit(baseUnit) : null;

  if (normBase === 'whole' && normRecipe === 'pcs') {
    return baseQty * CHICKEN_CONVERSION.PIECES_PER_WHOLE;
  }
  if (normBase === 'pcs' && normRecipe === 'whole') {
    return baseQty / CHICKEN_CONVERSION.PIECES_PER_WHOLE;
  }
  if (normBase && normBase === normRecipe) {
    return baseQty;
  }
  const conv = UNIT_CONVERSIONS[recipeUnit] || UNIT_CONVERSIONS[normRecipe];
  if (conv && (!normBase || normBase === normalizeUnit(conv.baseUnit))) return baseQty * conv.factor;
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

      const baseUnit = invItem.uomCode ?? invItem.unit ?? ingredient.baseUnit;
      const stockInBaseUnit = invItem.stock ?? 0;
      const qtyNeededInBaseUnit = convertToBaseUnit(ingredient.qtyPerUnit, ingredient.unit, baseUnit);
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

      const baseUnit = prodDoc.uomCode ?? prodDoc.unit ?? ingredient.baseUnit;
      const deductInBase = convertToBaseUnit(ingredient.qtyPerUnit, ingredient.unit, baseUnit) * multiplier;
      const currentStock = prodDoc.stock ?? 0;
      const newStock = Math.max(0, currentStock - deductInBase);

      // Round to avoid floating-point dust (6 decimal places)
      const rounded = Math.round(newStock * 1000000) / 1000000;

      await patch('products', ingredient.inventoryItemId, { stock: rounded });
      await insert('inventory_transactions', {
        productId: ingredient.inventoryItemId,
        type: 'PRODUCTION',
        qty: -Math.abs(deductInBase),
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

      const baseUnit = invItem.uomCode ?? invItem.unit ?? ingredient.baseUnit;
      const qtyInBase = convertToBaseUnit(ingredient.qtyPerUnit, ingredient.unit, baseUnit);
      const unitCost = invItem.standardCost ?? invItem.cost ?? 0;
      total += qtyInBase * unitCost;
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

  /**
   * Creates an account in Firebase Auth without logging out the current admin,
   * then writes the staff record to Firestore using the new Auth UID.
   */
  registerNewStaff: async ({ email, password, name, role, username, tasks, status }) => {
    const secondaryAppName = 'SecondaryAuthApp';
    const secondaryApp = getApps().find(a => a.name === secondaryAppName)
      || initializeApp(db.app.options, secondaryAppName);

    const secondaryAuth = getAuth(secondaryApp);

    // 1. Create the user in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const newUid = userCredential.user.uid;

    // 2. Immediately sign out the secondary instance so admin stays logged in
    await signOut(secondaryAuth);

    // 3. Store the staff record in Firestore under doc ID = newUid
    await setDoc(ref('staff', newUid), {
      name,
      username,
      email,
      role: role === 'Admin' ? 'Admin' : 'Staff',
      status: status || 'active',
      password, // retained for in-app credential view
      tasks: tasks || [],
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { uid: newUid };
  },

  create: (data) => insert('staff', { ...data, isActive: true }),
  update: (id, data) => patch('staff', id, data),
  delete: (id) => deleteDoc(ref('staff', id)),
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

// ── suppliers ─────────────────────────────────────────────────────────────────
// { name, category, contact, phone, email, isActive, createdAt }
export const supplierService = {
  getAll: () => getAll('suppliers'),

  getById: (id) => getById('suppliers', id),

  getActive: async () => {
    const q = query(col('suppliers'), where('isActive', '==', true), orderBy('name'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  create: (data) =>
    insert('suppliers', {
      name: data.name,
      category: data.category ?? '',
      contact: data.contact ?? '',
      phone: data.phone ?? '',
      email: data.email ?? '',
      isActive: true,
    }),

  update: (id, data) => patch('suppliers', id, data),

  deactivate: (id) =>
    updateDoc(ref('suppliers', id), { isActive: false, updatedAt: serverTimestamp() }),

  delete: (id) => deleteDoc(ref('suppliers', id)),
};

// ── supplier_purchases ────────────────────────────────────────────────────────
// Links suppliers ↔ inventory items. One doc per purchase event.
// { supplierId, supplierName, productId, productName, qty, unit, unitCost, totalCost, date, note, createdAt }
export const supplierPurchaseService = {
  create: (data) =>
    insert('supplier_purchases', {
      supplierId: data.supplierId,
      supplierName: data.supplierName ?? '',
      productId: data.productId,
      productName: data.productName ?? '',
      qty: data.qty,
      unit: data.unit ?? '',
      unitCost: data.unitCost ?? 0,
      totalCost: data.totalCost ?? data.qty * (data.unitCost ?? 0),
      date: data.date ?? new Date().toISOString().slice(0, 10),
      note: data.note ?? '',
    }),

  getBySupplier: async (supplierId, limitCount = 100) => {
    const q = query(
      col('supplier_purchases'),
      where('supplierId', '==', supplierId),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  getByProduct: async (productId, limitCount = 50) => {
    const q = query(
      col('supplier_purchases'),
      where('productId', '==', productId),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  getRecent: async (limitCount = 50) => {
    const q = query(
      col('supplier_purchases'),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  delete: (id) => deleteDoc(ref('supplier_purchases', id)),
};

// ── daily_inventory ───────────────────────────────────────────────────────────
// doc id: "${date}"  e.g. "2026-02-01"
// {
//   date,                     // "YYYY-MM-DD"
//   data: {                   // keyed by category → product → qty
//     raw_materials: { chicken_kg: 32.1, chicken_whole: 14, ... },
//     brought_to_stall: { ... },
//     remaining_fried: { ... },
//     remaining_unfried: { ... },
//     other_remaining: { ... },
//   },
//   submittedBy,              // staff id or name
//   status,                   // "draft" | "submitted"
//   notes,                    // optional daily notes
//   createdAt, updatedAt,
// }
export const dailyInventoryService = {
  /** Save or update a day's inventory data (upsert by date). */
  save: (date, data, submittedBy, status = 'draft', notes = '') =>
    upsert('daily_inventory', date, {
      date,
      data,
      submittedBy,
      status,
      notes,
      updatedAt: serverTimestamp(),
    }),

  /** Load a specific day's inventory data. */
  getByDate: (date) => getById('daily_inventory', date),

  /** Get the most recent N entries. */
  getRecent: async (limitCount = 30) => {
    const q = query(
      col('daily_inventory'),
      orderBy('date', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /** Get entries in a date range. */
  getByDateRange: async (fromDate, toDate) => {
    const q = query(
      col('daily_inventory'),
      where('date', '>=', fromDate),
      where('date', '<=', toDate),
      orderBy('date', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  /** Submit (mark as final). */
  submit: (date) =>
    upsert('daily_inventory', date, {
      status: 'submitted',
      updatedAt: serverTimestamp(),
    }),

  /** Delete a day's entry. */
  delete: (date) => deleteDoc(ref('daily_inventory', date)),

  /**
   * Send received raw materials and brought stock to inventory (Morning Stock-In):
   * Credits Chicken (Whole), Chicken (Pieces), Carcass, Neck, Tube Ice, Oil, Sauces, Mushroom.
   * Uses referenceId: `daily_received_${date}`.
   * Reversible/Idempotent if called again with updated figures.
   */
  sendReceivedStockToInventory: async (date, dayData, options = {}) => {
    const refId = `daily_received_${date}`;

    // If previously applied for this date, revert prior transactions so new values apply cleanly
    const prior = await getDocs(query(col('inventory_transactions'), where('referenceId', '==', refId)));
    if (!prior.empty) {
      const priorNet = {};
      for (const txDoc of prior.docs) {
        const tx = txDoc.data();
        if (tx.productId) {
          priorNet[tx.productId] = (priorNet[tx.productId] || 0) + (Number(tx.qty) || 0);
        }
      }
      for (const [productId, netQty] of Object.entries(priorNet)) {
        const pRef = ref('products', productId);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const cur = Number(pSnap.data().stock) || 0;
          const reverted = Math.max(0, Math.round((cur - netQty) * 1000) / 1000);
          await updateDoc(pRef, { stock: reverted, updatedAt: serverTimestamp() });
        }
      }
      for (const txDoc of prior.docs) {
        await deleteDoc(txDoc.ref);
      }
    }

    const raw = dayData?.raw_materials || {};
    const brought = dayData?.brought_to_stall || {};
    const num = (v) => Number(v) || 0;
    const chickenReceivedPcs = num(raw.chicken_pcs) || num(raw.chicken_whole) * 9;

    let movements = [
      { label: 'Chicken (Whole)', aliases: ['chicken (whole)', 'chicken whole'], delta: num(raw.chicken_whole), type: 'DAILY_RECEIVED' },
      { label: 'Chicken (Pieces)', aliases: ['chicken (pieces)', 'chicken pieces'], delta: chickenReceivedPcs, type: 'DAILY_RECEIVED' },
      { label: 'Carcass', aliases: ['carcass'], delta: num(raw.carcass_pcs), type: 'DAILY_RECEIVED' },
      { label: 'Chicken Neck', aliases: ['chicken neck'], delta: num(raw.neck), type: 'DAILY_RECEIVED' },
      { label: 'Tube Ice', aliases: ['tube ice'], delta: num(raw.tube_ice), type: 'DAILY_RECEIVED' },
      { label: 'Cooking Oil (Packet)', aliases: ['cooking oil (packet)', 'cooking oil'], delta: num(raw.oil_topup_packet), type: 'DAILY_RECEIVED' },
      { label: 'Cheese Sauce', aliases: ['cheese sauce', 'cheese sauce (sos cheese)', 'sos cheese'], delta: num(brought.cheese_sauce), type: 'DAILY_RECEIVED' },
      { label: 'Korean Sauce', aliases: ['korean sauce', 'korean sauce (sos korean)', 'sos korean'], delta: num(brought.korean_sauce), type: 'DAILY_RECEIVED' },
      { label: 'Green Sauce', aliases: ['green sauce', 'green sauce (sos hijau)', 'sos hijau'], delta: num(brought.green_sauce), type: 'DAILY_RECEIVED' },
      { label: 'BBQ Sauce', aliases: ['bbq sauce', 'bbq sauce (sos bbq)', 'sos bbq'], delta: num(brought.bbq_sauce), type: 'DAILY_RECEIVED' },
      { label: 'Mushroom', aliases: ['mushroom', 'mushroom (enoki)', 'enoki'], delta: num(brought.mushroom), type: 'DAILY_RECEIVED' },
    ];

    movements = movements.filter(m => m.delta > 0);
    if (movements.length === 0) return { updated: [], unmatched: [], skipped: false };

    const snap = await getDocs(query(col('products'), where('isInventoryItem', '==', true), where('isActive', '==', true)));
    const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const findProduct = (aliases) => {
      const keys = aliases.map(norm);
      return products.find(p => keys.includes(norm(p.name)));
    };

    const running = {};
    const updated = [];
    const unmatched = [];

    for (const m of movements) {
      const match = findProduct(m.aliases);
      if (!match) {
        if (!unmatched.includes(m.label)) unmatched.push(m.label);
        continue;
      }
      const current = running[match.id] ?? (Number(match.stock) || 0);
      const next = Math.max(0, Math.round((current + m.delta) * 1000) / 1000);
      running[match.id] = next;

      await updateDoc(ref('products', match.id), { stock: next, updatedAt: serverTimestamp() });
      await addDoc(col('inventory_transactions'), {
        productId: match.id,
        productName: match.name,
        type: m.type,
        qty: m.delta,
        referenceId: refId,
        createdAt: serverTimestamp(),
      });
      updated.push(`${match.name} +${m.delta}`);
    }

    try {
      await updateDoc(ref('daily_inventory', date), {
        stockReceivedSynced: true,
        stockReceivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) { }

    return { updated, unmatched, success: true };
  },

  /**
   * Synchronize inventory stock in `products` with the Staff Dashboard entry:
   *   + RECEIVED raw materials (Raw Materials section) are added to stock (if not already sent earlier)
   *   − WASTE_FRIED_LEFTOVER: Unsold fried items discarded
   *   − DAILY_VARIANCE: Physical shortages below expected remainder (if any)
   * Guarded so the same date is never applied twice.
   * Returns { updated: [...], unmatched: [...], skipped: boolean }.
   */
  syncInventoryFromDailyData: async (date, dayData, options = {}) => {
    const refId = `daily_${date}`;
    const receivedRefId = `daily_received_${date}`;

    // Check if received stock was already applied earlier via sendReceivedStockToInventory
    const receivedPrior = await getDocs(query(col('inventory_transactions'), where('referenceId', '==', receivedRefId)));
    const alreadyReceived = !receivedPrior.empty;

    // Idempotency: don't apply the same closing submit twice (unless force re-apply)
    const prior = await getDocs(query(col('inventory_transactions'), where('referenceId', '==', refId)));
    if (!prior.empty) {
      if (!options.force) return { updated: [], unmatched: [], skipped: true };

      // Calculate net previously applied qty per product to avoid intermediate clamping artifacts
      const priorNet = {};
      for (const txDoc of prior.docs) {
        const tx = txDoc.data();
        if (tx.productId) {
          priorNet[tx.productId] = (priorNet[tx.productId] || 0) + (Number(tx.qty) || 0);
        }
      }
      for (const [productId, netQty] of Object.entries(priorNet)) {
        const pRef = ref('products', productId);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const cur = Number(pSnap.data().stock) || 0;
          const reverted = Math.max(0, Math.round((cur - netQty) * 1000) / 1000);
          await updateDoc(pRef, { stock: reverted, updatedAt: serverTimestamp() });
        }
      }
      for (const txDoc of prior.docs) {
        await deleteDoc(txDoc.ref);
      }
    }

    const friedAndSold = getFriedAndSoldQuantities(dayData);
    const rawUsage = getRawMaterialUsage(friedAndSold);
    const { fried, sold } = friedAndSold;
    const raw = dayData?.raw_materials || {};
    const brought = dayData?.brought_to_stall || {};
    const remFried = dayData?.remaining_fried || {};
    const remUnfried = dayData?.remaining_unfried || {};
    const otherRem = dayData?.other_remaining || {};
    const num = (v) => Number(v) || 0;

    // Check if POS orders exist for this day
    let posSummary = null;
    try {
      posSummary = await salesOrderService.getDailySummary(date);
    } catch (e) {
      console.warn('[syncInventory] POS summary check:', e);
    }
    const hasPosOrders = (posSummary?.orderCount || 0) > 0;

    // Prioritize actual raw pieces entered by staff; fallback to whole * 9
    const chickenReceivedPcs = num(raw.chicken_pcs) || num(raw.chicken_whole) * 9;

    let movements = [];

    // ── 1. Deliveries received (Stock-In) - Only if NOT already sent in morning:
    if (!alreadyReceived) {
      movements.push(
        { label: 'Chicken (Whole)', aliases: ['chicken (whole)', 'chicken whole'], delta: num(raw.chicken_whole), type: 'DAILY_RECEIVED' },
        { label: 'Chicken (Pieces)', aliases: ['chicken (pieces)', 'chicken pieces'], delta: chickenReceivedPcs, type: 'DAILY_RECEIVED' },
        { label: 'Carcass', aliases: ['carcass'], delta: num(raw.carcass_pcs), type: 'DAILY_RECEIVED' },
        { label: 'Chicken Neck', aliases: ['chicken neck'], delta: num(raw.neck), type: 'DAILY_RECEIVED' },
        { label: 'Tube Ice', aliases: ['tube ice'], delta: num(raw.tube_ice), type: 'DAILY_RECEIVED' },
        { label: 'Cooking Oil (Packet)', aliases: ['cooking oil (packet)', 'cooking oil'], delta: num(raw.oil_topup_packet), type: 'DAILY_RECEIVED' },
        { label: 'Cheese Sauce', aliases: ['cheese sauce', 'cheese sauce (sos cheese)', 'sos cheese'], delta: num(brought.cheese_sauce), type: 'DAILY_RECEIVED' },
        { label: 'Korean Sauce', aliases: ['korean sauce', 'korean sauce (sos korean)', 'sos korean'], delta: num(brought.korean_sauce), type: 'DAILY_RECEIVED' },
        { label: 'Green Sauce', aliases: ['green sauce', 'green sauce (sos hijau)', 'sos hijau'], delta: num(brought.green_sauce), type: 'DAILY_RECEIVED' },
        { label: 'BBQ Sauce', aliases: ['bbq sauce', 'bbq sauce (sos bbq)', 'sos bbq'], delta: num(brought.bbq_sauce), type: 'DAILY_RECEIVED' },
        { label: 'Mushroom', aliases: ['mushroom', 'mushroom (enoki)', 'enoki'], delta: num(brought.mushroom), type: 'DAILY_RECEIVED' },
      );
    }

    // ── 2. Leftover Fried Chicken Discarded (Unsold & cannot carry over) ──
    movements.push(
      { label: 'Chicken (Pieces)', aliases: ['chicken (pieces)', 'chicken pieces'], delta: -num(remFried.chicken_pcs), type: 'WASTE_FRIED_LEFTOVER' },
      { label: 'Carcass', aliases: ['carcass'], delta: -num(remFried.carcass_pcs), type: 'WASTE_FRIED_LEFTOVER' },
      { label: 'Chicken Neck', aliases: ['chicken neck'], delta: -(num(remFried.neck || remFried.chicken_neck_set) * 4), type: 'WASTE_FRIED_LEFTOVER' },
      { label: 'Mushroom', aliases: ['mushroom', 'mushroom (enoki)', 'enoki'], delta: -num(remFried.mushroom), type: 'WASTE_FRIED_LEFTOVER' },
    );

    // ── 3. Unexplained physical shortages / shrinkage ──
    let chickenShortage = 0;
    let carcassShortage = 0;
    if (hasPosOrders) {
      const chickenSoldPos = num(posSummary.soldBreakdown?.chicken_pcs);
      const chickenExpRem = Math.max(0, num(brought.chicken_pcs) - chickenSoldPos - num(remFried.chicken_pcs));
      const chickenActualRem = num(remUnfried.chicken_pcs);
      if (chickenActualRem < chickenExpRem) {
        chickenShortage = chickenActualRem - chickenExpRem;
      }

      const carcassSoldPos = num(posSummary.soldBreakdown?.carcass_pcs);
      const carcassExpRem = Math.max(0, num(brought.carcass_pcs) - carcassSoldPos - num(remFried.carcass_pcs));
      const carcassActualRem = num(remUnfried.carcass_pcs);
      if (carcassActualRem < carcassExpRem) {
        carcassShortage = carcassActualRem - carcassExpRem;
      }
    }

    if (chickenShortage < 0) {
      movements.push({ label: 'Chicken (Pieces)', aliases: ['chicken (pieces)', 'chicken pieces'], delta: chickenShortage, type: 'DAILY_VARIANCE' });
    }
    if (carcassShortage < 0) {
      movements.push({ label: 'Carcass', aliases: ['carcass'], delta: carcassShortage, type: 'DAILY_VARIANCE' });
    }

    // Check variances for sauces if POS was active
    if (hasPosOrders) {
      const sauceDefs = [
        { key: 'cheese_sauce', label: 'Cheese Sauce', aliases: ['cheese sauce', 'cheese sauce (sos cheese)'] },
        { key: 'korean_sauce', label: 'Korean Sauce', aliases: ['korean sauce', 'korean sauce (sos korean)'] },
        { key: 'green_sauce', label: 'Green Sauce', aliases: ['green sauce', 'green sauce (sos hijau)'] },
        { key: 'bbq_sauce', label: 'BBQ Sauce', aliases: ['bbq sauce', 'bbq sauce (sos bbq)'] },
      ];
      for (const s of sauceDefs) {
        const soldPos = num(posSummary.soldBreakdown?.[s.key]);
        const expRem = Math.max(0, num(brought[s.key]) - soldPos);
        const actualRem = num(otherRem[s.key]);
        if (actualRem < expRem) {
          movements.push({ label: s.label, aliases: s.aliases, delta: actualRem - expRem, type: 'DAILY_VARIANCE' });
        }
      }
    }

    movements = movements.filter(m => m.delta !== 0);

    if (movements.length === 0) return { updated: [], unmatched: [], skipped: false };

    const snap = await getDocs(query(col('products'), where('isInventoryItem', '==', true), where('isActive', '==', true)));
    const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const findProduct = (aliases) => {
      const keys = aliases.map(norm);
      return products.find(p => keys.includes(norm(p.name)));
    };

    const running = {}; // productId -> running stock across multiple movements
    const updated = [];
    const unmatched = [];

    for (const m of movements) {
      const match = findProduct(m.aliases);
      if (!match) {
        if (!unmatched.includes(m.label)) unmatched.push(m.label);
        continue;
      }
      const current = running[match.id] ?? (Number(match.stock) || 0);
      const next = Math.max(0, Math.round((current + m.delta) * 1000) / 1000);
      running[match.id] = next;

      await updateDoc(ref('products', match.id), { stock: next, updatedAt: serverTimestamp() });
      await addDoc(col('inventory_transactions'), {
        productId: match.id,
        productName: match.name,
        type: m.type,
        qty: m.delta,
        referenceId: refId,
        createdAt: serverTimestamp(),
      });
      updated.push(`${match.name} ${m.delta > 0 ? '+' : ''}${m.delta}`);
    }

    return { updated, unmatched, skipped: false };
  },
};
