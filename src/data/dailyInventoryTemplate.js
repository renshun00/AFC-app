// ── Category definitions ────────────────────────────────────────────────────
export const CATEGORIES = [
  {
    key: 'raw_materials',
    label: 'Raw Materials',
    labelMy: 'Barang Mentah',
    color: '#3b82f6',     // blue
    icon: 'Package',
    description: 'Raw stock received / available at start of day',
  },
  {
    key: 'brought_to_stall',
    label: 'Brought to Stall',
    labelMy: 'Bawa ke Gerai',
    color: '#8b5cf6',     // purple
    icon: 'Truck',
    description: 'Items moved from storage to the stall for the day',
  },
  {
    key: 'remaining_fried',
    label: 'Remaining Fried',
    labelMy: 'Baki Dah Goreng',
    color: '#ef4444',     // red
    icon: 'Flame',
    description: 'Unsold fried items at end of day (affects payroll)',
  },
  {
    key: 'remaining_unfried',
    label: 'Remaining Unfried',
    labelMy: 'Baki Belum Goreng',
    color: '#f59e0b',     // amber
    icon: 'PackageOpen',
    description: 'Uncooked items left — carries forward to next day',
  },
  {
    key: 'other_remaining',
    label: 'Other Remaining',
    labelMy: 'Baki Lain-lain',
    color: '#10b981',     // green
    icon: 'MoreHorizontal',
    description: 'Leftover sauces, sides and miscellaneous items',
  },
];

// ── Product rows per category ───────────────────────────────────────────────
// `key` must be unique within a category.
// `uom` is the unit of measure code shown in the input.

export const CATEGORY_PRODUCTS = {
  raw_materials: [
    { key: 'chicken_kg', label: 'Chicken', uom: 'KG', uomLabel: 'kg' },
    { key: 'chicken_whole', label: 'Chicken', uom: 'WHOLE', uomLabel: 'whole' },
    { key: 'chicken_pcs', label: 'Chicken', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'carcass_kg', label: 'Carcass', uom: 'KG', uomLabel: 'kg' },
    { key: 'carcass_pcs', label: 'Carcass', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'neck', label: 'Neck', uom: 'PC', uomLabel: 'pc' },
    { key: 'tube_ice', label: 'Tube Ice', uom: 'BAG', uomLabel: 'bag' },
    { key: 'crushed_ice', label: 'Crushed Ice', uom: 'BAG', uomLabel: 'bag' },
    { key: 'oil_topup_packet', label: 'Oil Top-Up (Packet)', uom: 'KG', uomLabel: 'kg' },
    { key: 'oil_topup_bottle', label: 'Oil Top-Up (Bottle)', uom: 'KG', uomLabel: 'kg' },
  ],

  brought_to_stall: [
    { key: 'chicken_pcs', label: 'Chicken', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'carcass_pcs', label: 'Carcass', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'chicken_neck_set', label: 'Chicken Neck (4 pcs)', uom: 'SET', uomLabel: 'set' },
    { key: 'mushroom', label: 'Mushroom', uom: 'SET', uomLabel: 'set' },
    { key: 'butter_rice', label: 'Butter Rice', uom: 'SET', uomLabel: 'set' },
    { key: 'skin', label: 'Skin', uom: 'PC', uomLabel: 'pc' },
    { key: 'cheese_sauce', label: 'Cheese Sauce', uom: 'PC', uomLabel: 'pc' },
    { key: 'korean_sauce', label: 'Korean Sauce', uom: 'PC', uomLabel: 'pc' },
    { key: 'green_sauce', label: 'Green Sauce', uom: 'PC', uomLabel: 'pc' },
    { key: 'bbq_sauce', label: 'BBQ Sauce', uom: 'PC', uomLabel: 'pc' },
    { key: 'korean_bbq_sauce', label: 'Korean BBQ Sauce', uom: 'PC', uomLabel: 'pc' },
  ],

  remaining_fried: [
    { key: 'chicken_pcs', label: 'Chicken', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'carcass_pcs', label: 'Carcass', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'neck', label: 'Neck', uom: 'SET', uomLabel: 'set' },
    { key: 'mushroom', label: 'Mushroom', uom: 'SET', uomLabel: 'set' },
  ],

  remaining_unfried: [
    { key: 'chicken_pcs', label: 'Chicken', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'carcass_pcs', label: 'Carcass', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'neck', label: 'Neck', uom: 'SET', uomLabel: 'set' },
    { key: 'mushroom', label: 'Mushroom', uom: 'SET', uomLabel: 'set' },
  ],

  other_remaining: [
    { key: 'butter_rice', label: 'Butter Rice', uom: 'SET', uomLabel: 'set' },
    { key: 'skin', label: 'Skin', uom: 'PC', uomLabel: 'pc' },
    { key: 'cheese_sauce', label: 'Cheese Sauce', uom: 'PC', uomLabel: 'pc' },
    { key: 'korean_sauce', label: 'Korean Sauce', uom: 'PC', uomLabel: 'pc' },
    { key: 'green_sauce', label: 'Green Sauce', uom: 'PC', uomLabel: 'pc' },
    { key: 'bbq_sauce', label: 'BBQ Sauce', uom: 'PC', uomLabel: 'pc' },
    { key: 'korean_bbq_sauce', label: 'Korean BBQ Sauce', uom: 'PC', uomLabel: 'pc' },
  ],
};

/**
 * Build an empty data object for a fresh day.
 * Shape: { [categoryKey]: { [productKey]: 0 } }
 */
export function buildEmptyDayData() {
  const data = {};
  for (const cat of CATEGORIES) {
    data[cat.key] = {};
    for (const prod of CATEGORY_PRODUCTS[cat.key]) {
      data[cat.key][prod.key] = 0;
    }
  }
  return data;
}
