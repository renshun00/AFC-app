import { computeAutoRemainders, getMalaysiaDate, getPreviousTradingDate } from './dailyFlowCalculator.js';
import { buildEmptyDayData } from '../data/dailyInventoryTemplate.js';

export const STALL_ITEMS = [
  { key: 'chicken_pcs', label: 'Chicken', unit: 'pcs', rawKey: 'chicken_pcs', aliases: ['chicken (pieces)', 'chicken pieces'] },
  { key: 'carcass_pcs', label: 'Carcass', unit: 'pcs', rawKey: 'carcass_pcs', aliases: ['carcass', 'rangka'] },
  { key: 'chicken_neck_set', label: 'Chicken Neck', unit: 'set', rawKey: 'neck', aliases: ['chicken neck'] },
  { key: 'mushroom', label: 'Mushroom', unit: 'set', aliases: ['mushroom', 'mushroom (enoki)', 'enoki'] },
  { key: 'butter_rice', label: 'Butter Rice', unit: 'set', aliases: ['butter rice', 'nasi butter'] },
  { key: 'cheese_sauce', label: 'Cheese Sauce', unit: 'pcs', aliases: ['cheese sauce', 'cheese sauce (sos cheese)', 'sos cheese'] },
  { key: 'korean_sauce', label: 'Korean Sauce', unit: 'pcs', aliases: ['korean sauce', 'korean sauce (sos korean)', 'sos korean'] },
  { key: 'green_sauce', label: 'Green Sauce', unit: 'pcs', aliases: ['green sauce', 'green sauce (sos hijau)', 'sos hijau'] },
  { key: 'bbq_sauce', label: 'BBQ Sauce', unit: 'pcs', aliases: ['bbq sauce', 'bbq sauce (sos bbq)', 'sos bbq'] },
];
const qty = value => Math.max(0, Number(value) || 0);
const rounded = value => Math.round(value * 1000000) / 1000000;
const norm = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const pieceUnits = ['pcs', 'pc', 'piece', 'pieces', 'ketul'];

export function stockAfterReceiptUpdate(current, previousReceipt, nextReceipt) {
  const next = rounded((Number(current) || 0) - qty(previousReceipt) + qty(nextReceipt));
  if (next < 0) throw new Error('Received stock cannot be reduced below the quantity already used.');
  return next;
}

function transactionDate(tx, orderDates) {
  // Backdated daily reports belong to their business date, not their upload date.
  const dailyDate = String(tx.referenceId || '').match(/^daily_(?:received_)?(\d{4}-\d{2}-\d{2})$/)?.[1];
  if (dailyDate) return dailyDate;
  if (orderDates[tx.referenceId]) return orderDates[tx.referenceId];
  if (tx.date) return tx.date;
  const stamp = tx.createdAt?.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
  return Number.isNaN(stamp.getTime()) ? null : getMalaysiaDate(stamp);
}

/** Recover stock available before this report's receipts and trading consumption.
 * Same-day purchases/adjustments already in inventory are available carryover too.
 * Whole-bird bookkeeping stock and bulk rice/sauces must not become duplicate portions.
 */
export function getInventoryCarryover(date, products, transactions, orderDates = {}) {
  const balances = {};
  const warnings = [];
  for (const item of STALL_ITEMS) {
    const matches = products.filter(p => p.isInventoryItem && p.isActive !== false && !p.isArchived && item.aliases.includes(norm(p.name)));
    let total = 0;
    for (const product of matches) {
      const unit = norm(product.uomCode || product.unit || product.uom || item.unit);
      let divisor = 1;
      if (item.key === 'chicken_neck_set' && pieceUnits.includes(unit)) divisor = 4;
      else if (!(unit === item.unit || (item.unit === 'pcs' && pieceUnits.includes(unit)))) {
        warnings.push(`${product.name}: ${unit} cannot be converted to ${item.unit} without a portion size.`);
        continue;
      }
      let stock = Number(product.stock) || 0;
      for (const tx of transactions) {
        if (tx.productId !== product.id) continue;
        const businessDate = transactionDate(tx, orderDates);
        if (!businessDate) continue;
        const sameDayReceiptOrUsage = tx.type === 'DAILY_RECEIVED' || Number(tx.qty) < 0 && tx.type !== 'ADJUSTMENT';
        if (businessDate > date || (businessDate === date && sameDayReceiptOrUsage)) stock -= Number(tx.qty) || 0;
      }
      total += qty(stock) / divisor;
    }
    balances[item.key] = rounded(total);
  }
  return { balances, warnings };
}

export function mergeDayData(stored = {}) {
  const merged = { ...stored };
  for (const [key, defaults] of Object.entries(buildEmptyDayData())) merged[key] = { ...defaults, ...stored[key] };
  return merged;
}

export function getReceivedStock(data) {
  const raw = data.raw_materials || {};
  // Older records used brought_to_stall as the receiving input for these items.
  const entered = data.stock_received || data.brought_to_stall || {};
  const received = Object.fromEntries(STALL_ITEMS.map(item => [item.key, qty(entered[item.key])]));
  received.chicken_pcs = qty(raw.chicken_pcs) || qty(raw.chicken_whole) * 9;
  received.carcass_pcs = qty(raw.carcass_pcs);
  received.chicken_neck_set = qty(raw.neck) / 4;
  return received;
}

/** Derive every opening row from sources; never add the same stock twice. */
export function reconcileStallOpening(data, previousData, inventory, date, sold = {}) {
  const received = getReceivedStock(data);
  const fromReport = {};
  const carryover = {};
  const brought = {};
  const closed = new Date(date + 'T00:00:00Z').getUTCDay() === 6;
  for (const item of STALL_ITEMS) {
    const remainderKey = item.key === 'chicken_neck_set' ? 'neck' : item.key;
    fromReport[item.key] = qty(previousData?.remaining_unfried?.[remainderKey] ?? previousData?.other_remaining?.[remainderKey]);
    carryover[item.key] = Math.max(fromReport[item.key], qty(inventory?.balances?.[item.key]));
    const total = carryover[item.key] + received[item.key];
    brought[item.key] = closed ? 0 : item.key === 'chicken_neck_set' ? Math.floor(rounded(total)) : rounded(total);
  }
  return {
    ...data,
    stock_received: received,
    opening_stock: { previousDate: getPreviousTradingDate(date), fromReport, fromInventory: inventory?.balances || {}, carryover, received },
    brought_to_stall: brought,
    ...computeAutoRemainders(brought, data.remaining_fried, sold),
  };
}

/** Load all dependencies together so request completion order cannot overwrite formulas. */
export async function loadStallDay(date, { getDay, getSales, getInventory }) {
  const previousDate = getPreviousTradingDate(date);
  const [record, previous, sales, inventory] = await Promise.all([
    getDay(date), getDay(previousDate), getSales(date), getInventory(date),
  ]);
  const data = mergeDayData(record?.data);
  return {
    record, previous, sales, inventory,
    data: record?.status === 'submitted' ? data : reconcileStallOpening(data, previous?.data, inventory, date, sales?.soldBreakdown),
  };
}
