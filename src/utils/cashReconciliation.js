import { getMalaysiaDate } from './dailyFlowCalculator.js';

export function cashSalesForDate(orders, date) {
  let cents = 0, orderCount = 0;
  for (const order of new Map(orders.map(order => [order.id, order])).values()) {
    const created = order.createdAt?.toDate ? order.createdAt.toDate() : order.createdAt;
    const orderDate = order.date || (created ? getMalaysiaDate(new Date(created)) : null);
    if (orderDate !== date || order.status !== 'completed') continue;
    const method = String(order.paymentMethod || '').trim().toLowerCase();
    if (!method) throw new Error('A completed POS order has no payment method. Review it before reconciling cash.');
    if (method !== 'cash') continue;
    const total = Number(order.total);
    if (!Number.isFinite(total) || total < 0 || order.total == null) throw new Error('A cash order has an invalid total. Review POS sales.');
    cents += Math.round(total * 100);
    orderCount += 1;
  }
  return { expectedCash: cents / 100, orderCount };
}

export function reconcileCash(value, expectedCash) {
  if (value == null || String(value).trim() === '') throw new Error('Enter CASH ON HAND, including 0 if there is no cash.');
  const cashOnHand = Number(value);
  if (!Number.isFinite(cashOnHand) || cashOnHand < 0 || Math.abs(cashOnHand * 100 - Math.round(cashOnHand * 100)) > 0.000001) {
    throw new Error('Enter a valid cash amount with at most two decimal places.');
  }
  const variance = (Math.round(cashOnHand * 100) - Math.round(expectedCash * 100)) / 100;
  return { cashOnHand, expectedCash, variance, matched: variance === 0 };
}

