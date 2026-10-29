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
 *     other_remaining:   { butter_rice: 1, cheese_sauce: 2, ... },
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
    { key: 'cheese_sauce', label: 'Cheese Sauce', unit: 'pcs' },
    { key: 'korean_sauce', label: 'Korean Sauce', unit: 'pcs' },
    { key: 'green_sauce', label: 'Green Sauce', unit: 'pcs' },
    { key: 'bbq_sauce', label: 'BBQ Sauce', unit: 'pcs' },
    { key: 'korean_bbq_sauce', label: 'Korean BBQ Sauce', unit: 'pcs' },
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
 * Meat weight (kg) and cost, from fried quantities or actual Admin-entered KG from the bill.
 * `pricePerKg` = { chicken, carcass } in RM (defaults to RM 9.40 and RM 3.50 from Excel CoS).
 */
export function getMeatWeightCost(friedAndSold, pricePerKg = {}, dayData = null) {
    const { fried } = friedAndSold || {};
    const rawMaterials = dayData?.raw_materials || {};

    // If Admin entered the actual KG from the supplier bill, use it;
    // otherwise fallback to average weight per piece from Excel (237g chicken, 443g carcass).
    const adminChickenKg = n(rawMaterials.chicken_kg);
    const adminCarcassKg = n(rawMaterials.carcass_kg);

    const chickenKg = adminChickenKg > 0 ? adminChickenKg : n(fried?.chicken_pcs) * MEAT_AVG_WEIGHT_KG.chicken_pcs;
    const carcassKg = adminCarcassKg > 0 ? adminCarcassKg : n(fried?.carcass_pcs) * MEAT_AVG_WEIGHT_KG.carcass_pcs;

    const chickenPrice = n(pricePerKg.chicken) || 9.40;
    const carcassPrice = n(pricePerKg.carcass) || 3.50;

    return {
        chickenKg,
        carcassKg,
        chickenCost: chickenKg * chickenPrice,
        carcassCost: carcassKg * carcassPrice,
        isBilledChickenKg: adminChickenKg > 0,
        isBilledCarcassKg: adminCarcassKg > 0,
    };
}

// ── Step 3 (= CoS sheet, fixed daily costs) ───────────────────────────────
// Applied every day, including closed days (sales = 0) — matches the Excel
// business rule, surfaced explicitly rather than silently baked in.
export const FIXED_DAILY_COSTS = {
    royalty: 0,                                   // Removed by user instruction, 2026-10-28
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
 * getRawMaterialUsage().
 * `meatPricePerKg` = { chicken, carcass } in RM.
 */
export function getDailyCostOfSales(dayData, rawMaterialUnitCosts = {}, meatPricePerKg = {}) {
    const friedAndSold = getFriedAndSoldQuantities(dayData);
    const usage = getRawMaterialUsage(friedAndSold);
    const meat = getMeatWeightCost(friedAndSold, meatPricePerKg, dayData);
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

// ── Step 4 (= Excel BakiDahGorengHarian & RecordFromStaff automated flow) ───

/**
 * Helper to shift a YYYY-MM-DD date string by a given number of days.
 */
export function shiftDate(dateStr, days) {
    // Calendar dates must not move backwards when local midnight is converted to UTC.
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

export function getMalaysiaDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const part = (type) => parts.find(p => p.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Determine previous trading date based on Excel business rules:
 * - Saturday is a closed day.
 * - Sunday carries over from Friday (2 days prior, skipping Saturday).
 * - Monday carries over from Sunday (1 day prior).
 * - Tuesday - Friday carries over from previous day (1 day prior).
 */
export function getPreviousTradingDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0) {
        // Sunday carries over from Friday (2 days ago)
        return shiftDate(dateStr, -2);
    }
    return shiftDate(dateStr, -1);
}

/**
 * Calculate automated "Brought to Stall" (BAWA KE GERAI) quantities:
 * - Ayam (ketul): yesterday's (or Friday's if Sunday) unfried + today's received pieces
 * - Rangka (ketul): yesterday's unfried + today's received pieces
 * - Leher (set): previous raw sets + ROUNDDOWN(neck pcs received / 4)
 * - Saturday is closed: returns 0 pieces
 */
export function calculateBroughtToStall(rawMaterials = {}, prevTradingDayUnfried = {}, isSaturday = false) {
    if (isSaturday) {
        return {
            chicken_pcs: 0,
            carcass_pcs: 0,
            chicken_neck_set: 0,
        };
    }

    const rawChicken = n(rawMaterials.chicken_pcs) || (n(rawMaterials.chicken_whole) * 9);
    const prevUnfriedChicken = n(prevTradingDayUnfried.chicken_pcs);

    const rawCarcass = n(rawMaterials.carcass_pcs);
    const prevUnfriedCarcass = n(prevTradingDayUnfried.carcass_pcs);

    const rawNeck = n(rawMaterials.neck);

    return {
        chicken_pcs: prevUnfriedChicken + rawChicken,
        carcass_pcs: prevUnfriedCarcass + rawCarcass,
        chicken_neck_set: n(prevTradingDayUnfried.neck) + Math.floor(rawNeck / 4),
    };
}

/**
 * Calculate Baki Dah Goreng (Fried Chicken Leftover) staff penalty
 * matching the new `BakiDahGorengHarian` sheet:
 *
 * - Tracks leftover fried chicken (Ayam + Rangka) per day.
 * - If total leftover fried pieces >= 5:
 *     Total penalty = total leftover pieces * RM 5.00
 *     Staff penalty deduction = Total penalty / 2 (Bahagi 2) = RM 2.50 / pc / staff.
 * - If total leftover fried pieces < 5:
 *     No penalty (RM 0.00). Days under 5 are exempt from charge.
 */
export function calculateFriedLeftoverPenalty(dayData) {
    const remFried = dayData?.remaining_fried || {};
    const ayamFriedLeft = n(remFried.chicken_pcs);
    const rangkaFriedLeft = n(remFried.carcass_pcs);
    const totalFriedLeft = ayamFriedLeft + rangkaFriedLeft;

    const qualifiesForPenalty = totalFriedLeft >= 5;
    const ratePerPiece = 5.00;
    const totalCharge = qualifiesForPenalty ? totalFriedLeft * ratePerPiece : 0;
    const perStaffDeduction = totalCharge / 2;

    return {
        ayamFriedLeft,
        rangkaFriedLeft,
        totalFriedLeft,
        qualifiesForPenalty,
        ratePerPiece,
        totalCharge,
        perStaffDeduction,
    };
}

/**
 * Automatically compute remaining unfried (uncooked carryover) and other remaining (non-fried items)
 * from Brought to Stall, POS Sold Breakdown, and Unsold Cooked Count (Remaining Fried):
 *
 * Fried Items:
 *   Expected Total Remaining = max(0, Brought - POS Sold)
 *   Remaining Uncooked (Carryover) = max(0, Expected Total Remaining - Remaining Fried)
 *
 * Non-Fried Items (Rice, Sauces):
 *   Other Remaining = max(0, Brought - POS Sold)
 */
export function computeAutoRemainders(brought = {}, remFried = {}, posSold = {}) {
    const chickenBrought = n(brought.chicken_pcs);
    const chickenSold = n(posSold.chicken_pcs);
    const chickenFried = n(remFried.chicken_pcs);
    const chickenUnfried = Math.max(0, Math.max(0, chickenBrought - chickenSold) - chickenFried);

    const carcassBrought = n(brought.carcass_pcs);
    const carcassSold = n(posSold.carcass_pcs);
    const carcassFried = n(remFried.carcass_pcs);
    const carcassUnfried = Math.max(0, Math.max(0, carcassBrought - carcassSold) - carcassFried);

    const mushroomBrought = n(brought.mushroom);
    const mushroomSold = n(posSold.mushroom);
    const mushroomFried = n(remFried.mushroom);
    const mushroomUnfried = Math.max(0, Math.max(0, mushroomBrought - mushroomSold) - mushroomFried);

    const neckBrought = n(brought.chicken_neck_set);
    const neckSold = n(posSold.chicken_neck_set);
    const neckFried = n(remFried.neck);
    const neckUnfried = Math.max(0, Math.max(0, neckBrought - neckSold) - neckFried);

    const otherRemaining = {
        butter_rice: Math.max(0, n(brought.butter_rice) - n(posSold.butter_rice)),
        cheese_sauce: Math.max(0, n(brought.cheese_sauce) - n(posSold.cheese_sauce)),
        korean_sauce: Math.max(0, n(brought.korean_sauce) - n(posSold.korean_sauce)),
        green_sauce: Math.max(0, n(brought.green_sauce) - n(posSold.green_sauce)),
        bbq_sauce: Math.max(0, n(brought.bbq_sauce) - n(posSold.bbq_sauce)),
        korean_bbq_sauce: Math.max(0, n(brought.korean_bbq_sauce) - n(posSold.korean_bbq_sauce)),
    };

    return {
        remaining_unfried: {
            chicken_pcs: chickenUnfried,
            carcass_pcs: carcassUnfried,
            mushroom: mushroomUnfried,
            neck: neckUnfried,
        },
        other_remaining: otherRemaining,
    };
}
