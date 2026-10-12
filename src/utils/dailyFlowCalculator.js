/**
 * dailyFlowCalculator.js
 *
 * Reproduces the Excel tracker's calculation chain, starting from the SAME
 * input your staff already type into the Staff Dashboard (daily_inventory
 * doc, shaped by dailyInventoryTemplate.js):
 *
 *   raw_materials → brought_to_stall → remaining_unfried → remaining_fried → other_remaining
 *
 * Excel sheet      → this file
 * ────────────────────────────────────────────────────────────────────────
 * RecordFromStaff  → the `dayData` input (already collected on StaffDashboardPage)
 * ProductInventory → getFriedAndSoldQuantities()
 * RawMatInventory  → getRawMaterialUsage()
 * CoS              → getMeatWeightCost() + getFixedDailyCost() + getDailyCostOfSales()
 *
 * `dayData` is exactly the `data` field saved by dailyInventoryService.save(),
 * e.g.:
 *   {
 *     raw_materials:     { chicken_kg: 32.1, ... },
 *     brought_to_stall:  { chicken_pcs: 126, carcass_pcs: 40, chicken_neck_set: 10, mushroom: 8, ... },
 *     remaining_fried:   { chicken_pcs: 4, carcass_pcs: 1, neck: 1, mushroom: 0 },
 *     remaining_unfried: { chicken_pcs: 10, carcass_pcs: 2, neck: 0, mushroom: 1 },
 *     other_remaining:   { butter_rice: 1, skin: 0, cheese_sauce: 2, ... },
 *   }
 */

// ── Fried items: tracked through brought_to_stall → remaining_unfried → remaining_fried ──
// `broughtKey` is the key in CATEGORY_PRODUCTS.brought_to_stall;
// `remainingKey` is the matching key in remaining_unfried / remaining_fried
// (the template uses "neck" there instead of "chicken_neck_set").
export const FRIED_ITEMS = [
    { key: 'chicken_pcs', broughtKey: 'chicken_pcs', remainingKey: 'chicken_pcs', label: 'Chicken', unit: 'pcs' },
    { key: 'carcass_pcs', broughtKey: 'carcass_pcs', remainingKey: 'carcass_pcs', label: 'Carcass', unit: 'pcs' },
    { key: 'neck', broughtKey: 'chicken_neck_set', remainingKey: 'neck', label: 'Neck', unit: 'set' },
    { key: 'mushroom', broughtKey: 'mushroom', remainingKey: 'mushroom', label: 'Mushroom', unit: 'set' },
];

// ── Non-fried items: tracked through brought_to_stall → other_remaining ──
export const NON_FRIED_ITEMS = [
    { key: 'butter_rice', label: 'Butter Rice', unit: 'set' },
    { key: 'skin', label: 'Skin', unit: 'pc' },
    { key: 'cheese_sauce', label: 'Cheese Sauce', unit: 'pc' },
    { key: 'korean_sauce', label: 'Korean Sauce', unit: 'pc' },
    { key: 'green_sauce', label: 'Green Sauce', unit: 'pc' },
    { key: 'bbq_sauce', label: 'BBQ Sauce', unit: 'pc' },
    { key: 'korean_bbq_sauce', label: 'Korean BBQ Sauce', unit: 'pc' },
];

export const SAUCE_KEYS = ['cheese_sauce', 'korean_sauce', 'green_sauce', 'bbq_sauce', 'korean_bbq_sauce'];

const n = (v) => Number(v || 0);

/**
 * Step 1 (= ProductInventory sheet):
 *   fried = broughtToStall - remainingUnfried
 *   sold  = fried - remainingFried              (fried items)
 *   sold  = broughtToStall - otherRemaining      (non-fried items)
 *
 * Returns { fried: {chicken_pcs, carcass_pcs, neck, mushroom}, sold: {...all items} }
 */
export function getFriedAndSoldQuantities(dayData) {
    const brought = dayData?.brought_to_stall ?? {};
    const remFried = dayData?.remaining_fried ?? {};
    const remUnfried = dayData?.remaining_unfried ?? {};
    const otherRem = dayData?.other_remaining ?? {};

    const fried = {};
    const sold = {};

    for (const item of FRIED_ITEMS) {
        const broughtQty = n(brought[item.broughtKey]);
        const friedQty = broughtQty - n(remUnfried[item.remainingKey]);
        const soldQty = friedQty - n(remFried[item.remainingKey]);
        fried[item.key] = friedQty;
        sold[item.key] = soldQty;
    }

    for (const item of NON_FRIED_ITEMS) {
        const broughtQty = n(brought[item.key]);
        sold[item.key] = broughtQty - n(otherRem[item.key]);
    }

    return { fried, sold };
}

// ── Step 2 (= RawMatInventory sheet) ──────────────────────────────────────
// Usage rates per fried unit. Rates are applied to FRIED quantity, not sold
// quantity — matching the Excel exactly (stock is fried ahead of demand, so
// raw material consumption tracks what was cooked).
const RAW_MATERIAL_RATES = {
    chicken_pcs: { flourKg: 0.03, saucePackets: 1, paperWraps: 0.5, plasticBags: 0.5 },
    carcass_pcs: { flourKg: 0.125, saucePackets: 2, paperWraps: 1, plasticBags: 1 },
    neck: { flourKg: 0.075, saucePackets: 1, paperWraps: 1, plasticBags: 1 },
    mushroom: { flourKg: 0.1, saucePackets: 1, paperWraps: 1, plasticBags: 1 },
};

// Meat weight, for CoS kg-based meat cost (avg weight per fried piece).
const MEAT_AVG_WEIGHT_KG = {
    chicken_pcs: 0.237,
    carcass_pcs: 0.443,
};

// Nasi Butter set composition (applied to SOLD qty, since it isn't fried).
const NASI_BUTTER_RATES = {
    riceKg: 0.055,
    butterKg: 0.01,
    milkKg: 0.025,
    riceContainers: 1,
    soupContainers: 1,
};

// Daily consumables that only depend on whether the stall opened (chicken
// fried qty > 1), matching Excel's IF(Ayam>1, ..., "") — previously
// hard-coded to 0 in CoS; now derived explicitly so they're never dropped.
const DAILY_CONSUMABLES_WHEN_OPEN = {
    glovesUnits: 8,
    gasKg: 2.8, // 14kg tank, consumed roughly every 5 trading days
};

/**
 * Raw material usage for the day, derived from fried & sold quantities.
 * `friedAndSold` is the output of getFriedAndSoldQuantities().
 */
export function getRawMaterialUsage(friedAndSold) {
    const { fried, sold } = friedAndSold;

    const usage = {
        flourKg: 0,
        saucePackets: 0,
        paperWraps: 0,
        plasticBags: 0,
        sauceContainers: 0,
        riceKg: 0,
        butterKg: 0,
        milkKg: 0,
        riceContainers: 0,
        soupContainers: 0,
        glovesUnits: 0,
        gasKg: 0,
    };

    for (const [itemKey, rates] of Object.entries(RAW_MATERIAL_RATES)) {
        const qty = n(fried[itemKey]);
        usage.flourKg += qty * rates.flourKg;
        usage.saucePackets += qty * rates.saucePackets;
        usage.paperWraps += qty * rates.paperWraps;
        usage.plasticBags += qty * rates.plasticBags;
    }

    // Bekas sos (sauce container): 1 per sauce SOLD.
    usage.sauceContainers = SAUCE_KEYS.reduce((sum, key) => sum + n(sold[key]), 0);

    // Nasi Butter: based on sold sets.
    const nasiSold = n(sold.butter_rice);
    usage.riceKg = nasiSold * NASI_BUTTER_RATES.riceKg;
    usage.butterKg = nasiSold * NASI_BUTTER_RATES.butterKg;
    usage.milkKg = nasiSold * NASI_BUTTER_RATES.milkKg;
    usage.riceContainers = nasiSold * NASI_BUTTER_RATES.riceContainers;
    usage.soupContainers = nasiSold * NASI_BUTTER_RATES.soupContainers;

    // Gloves & gas: gated on whether the stall opened (chicken fried > 1).
    const stallOpen = n(fried.chicken_pcs) > 1;
    usage.glovesUnits = stallOpen ? DAILY_CONSUMABLES_WHEN_OPEN.glovesUnits : 0;
    usage.gasKg = stallOpen ? DAILY_CONSUMABLES_WHEN_OPEN.gasKg : 0;

    return usage;
}

/**
 * Meat weight (kg) and cost, from fried quantities.
 * `pricePerKg` = { chicken, carcass } in RM.
 */
export function getMeatWeightCost(friedAndSold, pricePerKg = {}) {
    const { fried } = friedAndSold;

    const chickenKg = n(fried.chicken_pcs) * MEAT_AVG_WEIGHT_KG.chicken_pcs;
    const carcassKg = n(fried.carcass_pcs) * MEAT_AVG_WEIGHT_KG.carcass_pcs;

    return {
        chickenKg,
        carcassKg,
        chickenCost: chickenKg * n(pricePerKg.chicken),
        carcassCost: carcassKg * n(pricePerKg.carcass),
    };
}

// ── Step 3 (= CoS sheet, fixed daily costs) ───────────────────────────────
// Applied every day, including closed days (sales = 0) — matches the Excel
// business rule, surfaced explicitly rather than silently baked in.
export const FIXED_DAILY_COSTS = {
    royalty: 16,
    rent: Math.round((600 / 31) * 100) / 100,     // RM19.35
    utilities: 10,
    wifi: Math.round((68 / 2 / 31) * 100) / 100,  // RM1.10
};

export function getFixedDailyCost() {
    return Object.values(FIXED_DAILY_COSTS).reduce((sum, v) => sum + v, 0);
}

/**
 * Full daily Cost of Sales, built entirely from the staff dashboard's
 * dayData — no POS data required, matching how the Excel's CoS sheet
 * depends only on RecordFromStaff.
 *
 * `rawMaterialUnitCosts` = price per unit (RM) for each key returned by
 * getRawMaterialUsage(), e.g. { flourKg: 4.2, saucePackets: 0.15,
 * paperWraps: 0.08, plasticBags: 0.05, sauceContainers: 0.1, riceKg: 3,
 * butterKg: 12, milkKg: 6, riceContainers: 0.2, soupContainers: 0.2,
 * glovesUnits: 0.1, gasKg: 2.5 }
 * `meatPricePerKg` = { chicken, carcass } in RM.
 */
export function getDailyCostOfSales(dayData, rawMaterialUnitCosts = {}, meatPricePerKg = {}) {
    const friedAndSold = getFriedAndSoldQuantities(dayData);
    const usage = getRawMaterialUsage(friedAndSold);
    const meat = getMeatWeightCost(friedAndSold, meatPricePerKg);
    const fixedCost = getFixedDailyCost();

    let rawMaterialTotal = 0;
    const rawMaterialBreakdown = {};
    for (const [material, qty] of Object.entries(usage)) {
        const cost = qty * n(rawMaterialUnitCosts[material]);
        rawMaterialBreakdown[material] = cost;
        rawMaterialTotal += cost;
    }

    const total = rawMaterialTotal + meat.chickenCost + meat.carcassCost + fixedCost;

    return {
        friedAndSold,
        usage,
        meat,
        fixedCost,
        rawMaterialTotal,
        rawMaterialBreakdown,
        total,
    };
}