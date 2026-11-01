import test from 'node:test';
import assert from 'node:assert/strict';
import { cashSalesForDate, reconcileCash } from '../src/utils/cashReconciliation.js';

const date = '2026-11-01';
const order = (id, total, extra = {}) => ({ id, total, date, status: 'completed', paymentMethod: 'cash', ...extra });

test('cash closing uses completed cash order totals after discounts, once per order', () => {
  const cash = order('cash', 18.5, { subtotal: 20, discount: 1.5 });
  assert.deepEqual(cashSalesForDate([cash, cash, order('tng', 50, { paymentMethod: 'tng' }), order('void', 10, { status: 'cancelled' })], date), { expectedCash: 18.5, orderCount: 1 });
});

test('cash closing honors Malaysia dates and explicit trading dates', () => {
  assert.deepEqual(cashSalesForDate([
    order('legacy', 10, { date: undefined, createdAt: '2026-10-31T16:05:00Z' }),
    order('previous', 20, { date: '2026-10-31', createdAt: '2026-11-01T01:00:00Z' }),
  ], date), { expectedCash: 10, orderCount: 1 });
});

test('blank cash is required while explicit zero is valid; differences remain recordable', () => {
  for (const input of ['', null, ' ', -1, 'abc', 1.001]) assert.throws(() => reconcileCash(input, 0));
  assert.deepEqual(reconcileCash('0', 0), { cashOnHand: 0, expectedCash: 0, variance: 0, matched: true });
  assert.equal(reconcileCash('90', 100).variance, -10);
  assert.equal(reconcileCash('110', 100).variance, 10);
  assert.equal(reconcileCash('90', 100).matched, false);
  assert.equal(reconcileCash('0.30', .1 + .2).matched, true);
});

test('unknown payment methods and invalid cash totals cannot silently become zero expected cash', () => {
  assert.throws(() => cashSalesForDate([order('missing', 10, { paymentMethod: null })], date), /payment method/);
  assert.throws(() => cashSalesForDate([order('bad', null)], date), /invalid total/);
});
