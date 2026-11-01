const hasRecipe = item => Array.isArray(item.recipe) && item.recipe.length > 0;

export function createPosAvailability(convertToBaseUnit, calculateAvailableQty) {
  function remainingInventory(cart, inventoryDocs) {
    const remaining = inventoryDocs.map(item => ({ ...item, stock: Number(item.stock) || 0 }));
    const byId = new Map(remaining.map(item => [item.id, item]));
    let valid = true;

    for (const line of cart) {
      if (!hasRecipe(line)) {
        if (line.qty > (Number(line.stock) || 0)) valid = false;
        continue;
      }
      for (const ingredient of line.recipe) {
        const stock = byId.get(ingredient.inventoryItemId);
        if (!stock) { valid = false; continue; }
        const baseUnit = stock.uomCode ?? stock.unit ?? ingredient.baseUnit;
        const perUnit = convertToBaseUnit(ingredient.qtyPerUnit, ingredient.unit, baseUnit);
        stock.stock -= perUnit * line.qty;
        if (stock.stock < -0.000001) valid = false;
      }
    }

    return { remaining, valid };
  }

  function availableToAdd(item, cart, inventoryDocs) {
    const { remaining } = remainingInventory(cart, inventoryDocs);
    if (hasRecipe(item)) return calculateAvailableQty(item.recipe, remaining);
    const inCart = cart.find(line => line.id === item.id)?.qty || 0;
    return Math.max(0, Math.floor((Number(item.stock) || 0) - inCart));
  }

  return { remainingInventory, availableToAdd };
}
