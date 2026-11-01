import test from 'node:test';
import assert from 'node:assert/strict';
import { createPosAvailability } from '../src/utils/posAvailability.js';

const convert = (qty, unit, base) => unit === 'g' && base === 'kg' ? qty / 1000 : qty;
const calculateAvailableQty = (recipe, inventory) => Math.floor(Math.min(...recipe.map(ingredient => {
  const stock = inventory.find(item => item.id === ingredient.inventoryItemId);
  return stock ? stock.stock / convert(ingredient.qtyPerUnit, ingredient.unit, stock.uomCode) : 0;
})));
const { availableToAdd, remainingInventory } = createPosAvailability(convert, calculateAvailableQty);

const sauce = { id: 'sauce', stock: 6, uomCode: 'set' };
const korean = { id: 'korean', stock: 999, recipe: [{ inventoryItemId: 'sauce', qtyPerUnit: 1, unit: 'set' }] };
const spicy = { id: 'spicy', stock: 999, recipe: [{ inventoryItemId: 'sauce', qtyPerUnit: 2, unit: 'set' }] };

test('POS stops at the displayed recipe availability', () => {
  assert.equal(availableToAdd(korean, [], [sauce]), 6);
  assert.equal(availableToAdd(korean, [{ ...korean, qty: 5 }], [sauce]), 1);
  assert.equal(availableToAdd(korean, [{ ...korean, qty: 6 }], [sauce]), 0);
  assert.equal(remainingInventory([{ ...korean, qty: 7 }], [sauce]).valid, false);
});

test('cart items sharing ingredients reserve the same stock', () => {
  const cart = [{ ...korean, qty: 2 }, { ...spicy, qty: 2 }];
  assert.equal(remainingInventory(cart, [sauce]).valid, true);
  assert.equal(availableToAdd(korean, cart, [sauce]), 0);
  assert.equal(remainingInventory([...cart, { ...korean, qty: 1 }], [sauce]).valid, false);
});

test('simple menu stock and missing recipe ingredients also block overselling', () => {
  const rice = { id: 'rice', stock: 3, recipe: [] };
  assert.equal(availableToAdd(rice, [{ ...rice, qty: 2 }], []), 1);
  assert.equal(remainingInventory([{ ...rice, qty: 4 }], []).valid, false);
  assert.equal(availableToAdd(korean, [], []), 0);
  assert.equal(remainingInventory([{ ...korean, qty: 1 }], []).valid, false);
});
