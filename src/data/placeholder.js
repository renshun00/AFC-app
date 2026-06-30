// ── AUTH ─────────────────────────────────────────────────────────────────────
export const DEMO_USER = { username: 'admin', password: 'admin123', role: 'Admin', branch: 'AFC – Main Branch' };

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
export const dashboardStats = {
  dailyRevenue: 4250.00,
  revChange: +12,
  costOfSales: 1120.50,
  costChange: -2,
  grossProfit: 3129.50,
  margin: 73.6,
  chickenUsed: 145,
  staffWages: 480.00,
};

export const salesChartData = [
  { day: 'Mon', sales: 2800, expenses: 1100 },
  { day: 'Tue', sales: 3400, expenses: 1300 },
  { day: 'Wed', sales: 3100, expenses: 1200 },
  { day: 'Thu', sales: 3800, expenses: 1450 },
  { day: 'Fri', sales: 3600, expenses: 1380 },
  { day: 'Sat', sales: 4100, expenses: 1500 },
  { day: 'Sun', sales: 4250, expenses: 1120 },
];

export const reconciliationItems = [
  { id: 1, type: 'register', title: 'Register 1 Closed', sub: 'Cashier: Sarah M. • 2 mins ago', amount: 'RM1,240.00', status: 'Matched' },
  { id: 2, type: 'register', title: 'Register 2 Closed', sub: 'Cashier: Mike T. • 45 mins ago', amount: 'RM980.50', status: 'Discrepancy', disc: '-RM5.00' },
  { id: 3, type: 'delivery', title: 'Inventory Delivery Received', sub: 'Supplier: FreshFarm • 2 hours ago', amount: '+200kg Chicken', status: 'Logged' },
];

// ── POS ────────────────────────────────────────────────────────────────────────
// img field now holds a base64 data URL or an https URL.
// imgPlaceholder is the emoji fallback shown when no image is uploaded yet.
export const menuItems = [
  { id: 1,  name: 'Spicy Chicken Combo',   price: 12.90, category: 'Combo',   img: null, imgPlaceholder: '🍗', stock: 48 },
  { id: 2,  name: 'Cheese Wedges',         price: 5.50,  category: 'Sides',   img: null, imgPlaceholder: '🧀', stock: 82 },
  { id: 3,  name: 'Coleslaw (Regular)',    price: 3.00,  category: 'Sides',   img: null, imgPlaceholder: '🥗', stock: 60 },
  { id: 4,  name: 'Original Fried Chicken',price: 9.90,  category: 'Chicken', img: null, imgPlaceholder: '🍗', stock: 35 },
  { id: 5,  name: 'Crispy Chicken Burger', price: 11.50, category: 'Burger',  img: null, imgPlaceholder: '🍔', stock: 27 },
  { id: 6,  name: 'Zinger Tower',          price: 13.90, category: 'Burger',  img: null, imgPlaceholder: '🍔', stock: 19 },
  { id: 7,  name: 'Iced Milo',             price: 4.00,  category: 'Drinks',  img: null, imgPlaceholder: '🥤', stock: 90 },
  { id: 8,  name: 'Mineral Water',         price: 1.50,  category: 'Drinks',  img: null, imgPlaceholder: '💧', stock: 120 },
  { id: 9,  name: 'French Fries (L)',      price: 4.50,  category: 'Sides',   img: null, imgPlaceholder: '🍟', stock: 55 },
  { id: 10, name: 'Whipped Potato',        price: 3.50,  category: 'Sides',   img: null, imgPlaceholder: '🥔', stock: 40 },
];

export const posOrders = [
  { id: 'ORD-001', table: 'T1', items: 3, total: 29.57, status: 'open', time: '10:12' },
  { id: 'ORD-002', table: 'T2', items: 2, total: 18.40, status: 'open', time: '10:25' },
  { id: 'ORD-003', table: 'T3', items: 5, total: 52.80, status: 'ready', time: '10:30' },
];

// ── INVENTORY ──────────────────────────────────────────────────────────────────
export const inventoryItems = [
  { id: 1,  name: 'Chicken (Whole)',        unit: 'kg',  stock: 42,  minStock: 20,  cost: 8.50,  category: 'Protein',   supplier: 'FreshFarm' },
  { id: 2,  name: 'Cooking Oil',            unit: 'L',   stock: 18,  minStock: 10,  cost: 4.20,  category: 'Oil',       supplier: 'OilMart' },
  { id: 3,  name: 'Plain Flour',            unit: 'kg',  stock: 35,  minStock: 15,  cost: 2.10,  category: 'Dry Goods', supplier: 'FlourBest' },
  { id: 4,  name: 'Seasoning Mix',          unit: 'kg',  stock: 8,   minStock: 5,   cost: 12.00, category: 'Seasoning', supplier: 'SpiceCo' },
  { id: 5,  name: 'Burger Buns',            unit: 'pcs', stock: 120, minStock: 50,  cost: 0.60,  category: 'Bakery',    supplier: 'BreadHouse' },
  { id: 6,  name: 'Potato Wedges (Frozen)', unit: 'kg',  stock: 30,  minStock: 20,  cost: 5.80,  category: 'Frozen',    supplier: 'FoodPrime' },
  { id: 7,  name: 'Coleslaw Mix',           unit: 'kg',  stock: 12,  minStock: 8,   cost: 3.20,  category: 'Produce',   supplier: 'FreshFarm' },
  { id: 8,  name: 'Paper Bags',             unit: 'pcs', stock: 500, minStock: 200, cost: 0.08,  category: 'Packaging', supplier: 'PackCo' },
  { id: 9,  name: 'Chilli Sauce',           unit: 'L',   stock: 15,  minStock: 5,   cost: 6.00,  category: 'Condiment', supplier: 'SauceMaster' },
  { id: 10, name: 'Plastic Cups',           unit: 'pcs', stock: 300, minStock: 100, cost: 0.05,  category: 'Packaging', supplier: 'PackCo' },
];

// ── MENU ENGINEERING ──────────────────────────────────────────────────────────
// img field: base64 data URL or null. imgPlaceholder: emoji fallback.
export const engineeredMenu = [
  { id: 1, name: 'Spicy Chicken Combo',    category: 'Combo',   price: 12.90, cost: 4.20, sold: 78,  active: true,  img: null, imgPlaceholder: '🍗' },
  { id: 2, name: 'Original Fried Chicken', category: 'Chicken', price: 9.90,  cost: 3.50, sold: 95,  active: true,  img: null, imgPlaceholder: '🍗' },
  { id: 3, name: 'Crispy Chicken Burger',  category: 'Burger',  price: 11.50, cost: 3.80, sold: 52,  active: true,  img: null, imgPlaceholder: '🍔' },
  { id: 4, name: 'Zinger Tower',           category: 'Burger',  price: 13.90, cost: 5.00, sold: 31,  active: true,  img: null, imgPlaceholder: '🍔' },
  { id: 5, name: 'Cheese Wedges',          category: 'Sides',   price: 5.50,  cost: 1.20, sold: 120, active: true,  img: null, imgPlaceholder: '🧀' },
  { id: 6, name: 'French Fries (L)',       category: 'Sides',   price: 4.50,  cost: 0.90, sold: 88,  active: true,  img: null, imgPlaceholder: '🍟' },
  { id: 7, name: 'Whipped Potato',         category: 'Sides',   price: 3.50,  cost: 0.70, sold: 44,  active: false, img: null, imgPlaceholder: '🥔' },
  { id: 8, name: 'Iced Milo',              category: 'Drinks',  price: 4.00,  cost: 0.80, sold: 102, active: true,  img: null, imgPlaceholder: '🥤' },
];

// ── STAFF & PAYROLL ────────────────────────────────────────────────────────────
export const TASK_RATES = {
  'Opening Shift':   { rate: 15.00, unit: 'shift' },
  'Closing Shift':   { rate: 18.00, unit: 'shift' },
  'Cashier Duty':    { rate: 10.00, unit: 'hour' },
  'Kitchen (Frying)':{ rate: 12.00, unit: 'hour' },
  'Kitchen (Prep)':  { rate: 10.00, unit: 'hour' },
  'Cleaning Duty':   { rate: 8.00,  unit: 'hour' },
  'Delivery Run':    { rate: 5.00,  unit: 'run' },
  'Training Assist': { rate: 20.00, unit: 'session' },
};

export const staffList = [
  {
    id: 1, name: 'Sarah Maimun', role: 'Cashier', status: 'active',
    tasks: [
      { task: 'Opening Shift', qty: 1, bonus: 0 },
      { task: 'Cashier Duty',  qty: 6, bonus: 5 },
    ],
  },
  {
    id: 2, name: 'Mike Tan', role: 'Kitchen', status: 'active',
    tasks: [
      { task: 'Kitchen (Frying)', qty: 5, bonus: 10 },
      { task: 'Kitchen (Prep)',   qty: 3, bonus: 0 },
    ],
  },
  {
    id: 3, name: 'Amirah Zain', role: 'Cashier', status: 'active',
    tasks: [
      { task: 'Cashier Duty',  qty: 4, bonus: 0 },
      { task: 'Closing Shift', qty: 1, bonus: 5 },
    ],
  },
  {
    id: 4, name: 'Johan Lim', role: 'Kitchen', status: 'active',
    tasks: [
      { task: 'Kitchen (Prep)', qty: 6, bonus: 0 },
      { task: 'Cleaning Duty', qty: 2, bonus: 0 },
    ],
  },
  {
    id: 5, name: 'Priya Nair', role: 'Supervisor', status: 'active',
    tasks: [
      { task: 'Opening Shift',  qty: 1, bonus: 20 },
      { task: 'Training Assist',qty: 1, bonus: 0 },
      { task: 'Cashier Duty',   qty: 3, bonus: 0 },
    ],
  },
];

export function calcWage(staff) {
  let base = 0;
  staff.tasks.forEach(t => {
    const r = TASK_RATES[t.task];
    if (r) base += r.rate * t.qty;
  });
  const bonus = staff.tasks.reduce((s, t) => s + (t.bonus || 0), 0);
  return { base, bonus, total: base + bonus };
}

// ── REPORTS ────────────────────────────────────────────────────────────────────
export const reportSummary = {
  totalRevenue: 84350.00,
  totalCost: 70450.00,
  netProfit: 22650.00,
  margin: 58.1,
  revPrev: 70450.00,
};

export const revenueByOutlet = [
  { name: 'Main Branch', value: 48200 },
  { name: 'Branch 2',    value: 22100 },
  { name: 'Branch 3',    value: 14050 },
];

export const weeklyRevenue = [
  { week: 'W1', revenue: 18200, cost: 7400 },
  { week: 'W2', revenue: 21500, cost: 8600 },
  { week: 'W3', revenue: 19800, cost: 8000 },
  { week: 'W4', revenue: 24850, cost: 9800 },
];

export const topSellingItems = [
  { name: 'Spicy Chicken Combo',    qty: 320, revenue: 4128 },
  { name: 'Original Fried Chicken', qty: 410, revenue: 4059 },
  { name: 'Cheese Wedges',          qty: 490, revenue: 2695 },
  { name: 'Iced Milo',              qty: 405, revenue: 1620 },
  { name: 'Crispy Chicken Burger',  qty: 218, revenue: 2507 },
];

export const expenseBreakdown = [
  { name: 'Food Cost',  value: 5200 },
  { name: 'Labour',     value: 2100 },
  { name: 'Utilities',  value: 800  },
  { name: 'Packaging',  value: 450  },
  { name: 'Other',      value: 320  },
];

// ── DAILY REPORT ──────────────────────────────────────────────────────────────
export const dailyReportData = {
  date: 'Today, 09:30 AM',
  cashRegister: [
    { register: 'Register 1', cashier: 'Sarah M.', openingCash: 200, totalSales: 1240,   discrepancy: 0  },
    { register: 'Register 2', cashier: 'Mike T.',  openingCash: 200, totalSales: 980.50, discrepancy: -5 },
  ],
  plSummary: {
    revenue: 4250, foodCost: 1120.50, labour: 480,
    operatingExpenses: 220, netProfit: 2429.50,
  },
  inventoryUsed: [
    { item: 'Chicken (Whole)', used: 45, unit: 'kg',  cost: 382.50 },
    { item: 'Cooking Oil',     used: 8,  unit: 'L',   cost: 33.60  },
    { item: 'Flour',           used: 12, unit: 'kg',  cost: 25.20  },
    { item: 'Burger Buns',     used: 55, unit: 'pcs', cost: 33.00  },
  ],
  operatingExpenses: [
    { category: 'Utilities',   amount: 120 },
    { category: 'Packaging',   amount: 60  },
    { category: 'Maintenance', amount: 40  },
  ],
  staffToday: [
    { name: 'Sarah M.',  role: 'Cashier',    hours: 6, wage: 75  },
    { name: 'Mike T.',   role: 'Kitchen',    hours: 5, wage: 80  },
    { name: 'Amirah Z.', role: 'Cashier',    hours: 5, wage: 58  },
    { name: 'Johan L.',  role: 'Kitchen',    hours: 8, wage: 112 },
    { name: 'Priya N.',  role: 'Supervisor', hours: 8, wage: 155 },
  ],
};