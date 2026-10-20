export const CATEGORIES = [
  {
    key: 'raw_materials',
    label: 'Raw Materials',
    labelMy: 'Barang Mentah',
    color: '#3b82f6',     // blue
    icon: 'Package',
    description: 'Raw stock received at start of day (Whole Chicken, Carcass, Ice, Oil)',
  },
  {
    key: 'brought_to_stall',
    label: 'Brought to Stall',
    labelMy: 'Bawa ke Gerai',
    color: '#8b5cf6',     // purple
    icon: 'Truck',
    description: 'Stall opening stock (Yesterday Uncooked Carryover + Received)',
  },
  {
    key: 'remaining_fried',
    label: 'Remaining Fried (Unsold)',
    labelMy: 'Baki Dah Goreng (Unsold)',
    color: '#ef4444',     // red
    icon: 'Flame',
    description: 'Count unsold fried items in warmer at closing (Waste / Payroll penalty if >= 5 pcs)',
  },
];

// ── Product rows per category ───────────────────────────────────────────────
// `key` must be unique within a category.
// `uom` is the unit of measure code shown in the input.

// `adminOnly: true` rows are hidden from non-Admin users (e.g. KG weights from
// the supplier bill, used for COS reporting).
export const CATEGORY_PRODUCTS = {
  raw_materials: [
    { key: 'chicken_kg', label: 'Chicken', uom: 'KG', uomLabel: 'kg', adminOnly: true },
    { key: 'chicken_whole', label: 'Chicken', uom: 'WHOLE', uomLabel: 'whole' },
    { key: 'chicken_pcs', label: 'Chicken', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'carcass_kg', label: 'Carcass', uom: 'KG', uomLabel: 'kg', adminOnly: true },
    { key: 'carcass_pcs', label: 'Carcass', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'neck', label: 'Neck', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'tube_ice', label: 'Tube Ice', uom: 'BAG', uomLabel: 'bag' },
    { key: 'oil_topup_packet', label: 'Oil Top-Up (Packet)', uom: 'KG', uomLabel: 'kg' },
  ],

  brought_to_stall: [
    { key: 'chicken_pcs', label: 'Chicken', uom: 'PCS', uomLabel: 'pcs', isCalculated: true, formulaDesc: "Yesterday's Unfried + Received" },
    { key: 'carcass_pcs', label: 'Carcass', uom: 'PCS', uomLabel: 'pcs', isCalculated: true, formulaDesc: "Yesterday's Unfried + Received" },
    { key: 'chicken_neck_set', label: 'Chicken Neck (4 pcs)', uom: 'SET', uomLabel: 'set', isCalculated: true, formulaDesc: "Raw Neck (pcs) ÷ 4" },
    { key: 'mushroom', label: 'Mushroom', uom: 'SET', uomLabel: 'set' },
    { key: 'butter_rice', label: 'Butter Rice', uom: 'SET', uomLabel: 'set' },
    { key: 'cheese_sauce', label: 'Cheese Sauce', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'korean_sauce', label: 'Korean Sauce', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'green_sauce', label: 'Green Sauce', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'bbq_sauce', label: 'BBQ Sauce', uom: 'PCS', uomLabel: 'pcs' },
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
    { key: 'cheese_sauce', label: 'Cheese Sauce', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'korean_sauce', label: 'Korean Sauce', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'green_sauce', label: 'Green Sauce', uom: 'PCS', uomLabel: 'pcs' },
    { key: 'bbq_sauce', label: 'BBQ Sauce', uom: 'PCS', uomLabel: 'pcs' },
  ]
};

/**
 * Build an empty data object for a fresh day.
 * Shape: { [categoryKey]: { [productKey]: 0 } }
 */
export function buildEmptyDayData() {
  const data = {};
  for (const catKey of Object.keys(CATEGORY_PRODUCTS)) {
    data[catKey] = {};
    for (const prod of CATEGORY_PRODUCTS[catKey]) {
      data[catKey][prod.key] = 0;
    }
  }
  return data;
}
