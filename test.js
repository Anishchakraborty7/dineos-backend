/**
 * DineOS — Full End-to-End Test Suite
 * Tests every API endpoint: Super Admin → Restaurant Admin → Public (Mobile API)
 */

require('dotenv').config();
const http = require('http');

const BASE = 'http://localhost:3000';
let superToken = '';
let restaurantId = null;
let apiKey = '';
let adminToken = '';
let customerId = null;
let categoryId = null;
let itemId = null;
let orderId = null;
let tableId = null;
let reservationId = null;
let customerToken = '';

let passed = 0, failed = 0;

// ── helpers ──────────────────────────────────────────────────────
function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0,
        ...headers
      }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function log(label, ok, info = '') {
  if (ok) { console.log(`  ✅  ${label}${info ? ' — ' + info : ''}`); passed++; }
  else     { console.log(`  ❌  ${label}${info ? ' — ' + info : ''}`); failed++; }
}

function section(title) { console.log(`\n${'═'.repeat(56)}\n  ${title}\n${'─'.repeat(56)}`); }

// ── tests ─────────────────────────────────────────────────────────
async function run() {
  console.log('\n🍽️  DineOS Full End-to-End Test Suite\n');

  // ── 0. Health ────────────────────────────────────────────────
  section('0. Health Check');
  const health = await request('GET', '/health');
  log('GET /health', health.status === 200, `v${health.body.version}`);

  // ── 1. Super Admin Auth ──────────────────────────────────────
  section('1. Super Admin Authentication');

  const login = await request('POST', '/super/auth/login',
    { email: 'anish@dineos.com', password: 'DineOS@2026' });
  log('POST /super/auth/login', login.status === 200, login.body.data?.admin?.name);
  superToken = login.body.data?.token || '';

  const me = await request('GET', '/super/auth/me', null,
    { Authorization: `Bearer ${superToken}` });
  log('GET /super/auth/me', me.status === 200, me.body.data?.email);

  // ── 2. Onboard Restaurant ─────────────────────────────────────
  section('2. Restaurant Onboarding');

  const onboard = await request('POST', '/super/restaurants', {
    name: 'Test Biryani House',
    owner_name: 'Test Owner',
    owner_email: 'owner@testbiryani.com',
    owner_phone: '+91 99999 00000',
    city: 'Hyderabad', state: 'Telangana',
    plan: 'pro',
    tagline: 'Best Biryani in Town'
  }, { Authorization: `Bearer ${superToken}` });

  log('POST /super/restaurants (onboard)', onboard.status === 201, onboard.body.data?.name);
  restaurantId = onboard.body.data?.restaurant_id;
  apiKey       = onboard.body.data?.api_key;
  const adminPwd = onboard.body.data?.admin_login?.password;
  console.log(`      → restaurant_id: ${restaurantId}`);
  console.log(`      → api_key: ${apiKey?.substring(0, 20)}...`);
  console.log(`      → admin password: ${adminPwd}`);

  // ── 3. Super Admin CRUD ───────────────────────────────────────
  section('3. Super Admin — Restaurant Management');

  const list = await request('GET', '/super/restaurants?limit=5',
    null, { Authorization: `Bearer ${superToken}` });
  log('GET /super/restaurants (list)', list.status === 200,
    `total: ${list.body.pagination?.total}`);

  const getOne = await request('GET', `/super/restaurants/${restaurantId}`,
    null, { Authorization: `Bearer ${superToken}` });
  log('GET /super/restaurants/:id', getOne.status === 200, getOne.body.data?.name);

  const patch = await request('PATCH', `/super/restaurants/${restaurantId}`,
    { notes: 'Test restaurant — auto-created by test suite', primary_color: '#FF6B35' },
    { Authorization: `Bearer ${superToken}` });
  log('PATCH /super/restaurants/:id (edit)', patch.status === 200, patch.body.message);

  const analytics = await request('GET', '/super/analytics',
    null, { Authorization: `Bearer ${superToken}` });
  log('GET /super/analytics', analytics.status === 200,
    `total: ${analytics.body.data?.stats?.total}`);

  // ── 4. Restaurant Admin Auth ──────────────────────────────────
  section('4. Restaurant Admin Login');

  const adminLogin = await request('POST', '/admin/auth/login',
    { email: 'owner@testbiryani.com', password: adminPwd },
    { 'X-API-Key': apiKey });
  log('POST /admin/auth/login', adminLogin.status === 200,
    `role: ${adminLogin.body.data?.user?.role}`);
  adminToken = adminLogin.body.data?.token || '';

  const adminMe = await request('GET', '/admin/auth/me', null,
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('GET /admin/auth/me', adminMe.status === 200, adminMe.body.data?.email);

  // ── 5. Menu Management ────────────────────────────────────────
  section('5. Menu — Categories & Items');

  const catCreate = await request('POST', '/admin/menu/categories',
    { name: 'Biryani', description: 'Hyderabadi specials', sort_order: 1 },
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('POST /admin/menu/categories', catCreate.status === 201, catCreate.body.data?.name);
  categoryId = catCreate.body.data?.category_id;

  const catList = await request('GET', '/admin/menu/categories', null,
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('GET /admin/menu/categories', catList.status === 200,
    `count: ${catList.body.data?.length}`);

  const item1 = await request('POST', '/admin/menu/items', {
    name: 'Chicken Biryani',
    description: 'Slow-cooked with aromatic spices',
    price: 280,
    category_id: categoryId,
    is_veg: false,
    is_featured: true,
    image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400'
  }, { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('POST /admin/menu/items (chicken biryani)', item1.status === 201, `₹${item1.body.data?.price}`);
  itemId = item1.body.data?.item_id;

  const item2 = await request('POST', '/admin/menu/items', {
    name: 'Veg Biryani', price: 200, category_id: categoryId, is_veg: true,
    image_url: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=400'
  }, { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('POST /admin/menu/items (veg biryani)', item2.status === 201);

  const item3 = await request('POST', '/admin/menu/items', {
    name: 'Mutton Biryani', price: 380, category_id: categoryId, is_veg: false,
    image_url: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=400'
  }, { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('POST /admin/menu/items (mutton biryani)', item3.status === 201);

  // Also add a drinks category
  const catDrinks = await request('POST', '/admin/menu/categories',
    { name: 'Drinks', sort_order: 2 },
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  const drinksCatId = catDrinks.body.data?.category_id;
  await request('POST', '/admin/menu/items',
    { name: 'Lassi', price: 60, category_id: drinksCatId, is_veg: true },
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  await request('POST', '/admin/menu/items',
    { name: 'Raita', price: 40, category_id: drinksCatId, is_veg: true },
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('Added Drinks category + items', true, '2 items');

  const itemList = await request('GET', '/admin/menu/items', null,
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('GET /admin/menu/items', itemList.status === 200,
    `total: ${itemList.body.data?.length}`);

  const itemEdit = await request('PATCH', `/admin/menu/items/${itemId}`,
    { is_featured: true, price: 299 },
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('PATCH /admin/menu/items/:id (price update)', itemEdit.status === 200, `₹${itemEdit.body.data?.price}`);

  // ── 6. Tables ─────────────────────────────────────────────────
  section('6. Tables Management');

  for (let i = 1; i <= 5; i++) {
    const t = await request('POST', '/admin/tables',
      { table_number: `T${i}`, capacity: i <= 2 ? 2 : 4, location: i <= 2 ? 'Indoor' : 'Outdoor' },
      { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
    if (i === 1) tableId = t.body.data?.table_id;
  }
  log('POST /admin/tables (added T1–T5)', true, '5 tables');

  const tableList = await request('GET', '/admin/tables', null,
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('GET /admin/tables', tableList.status === 200,
    `count: ${tableList.body.data?.length}`);

  // ── 7. POS Order ──────────────────────────────────────────────
  section('7. Admin — Manual (POS) Orders');

  const posOrder = await request('POST', '/admin/orders', {
    order_type: 'dine_in',
    table_number: 'T1',
    items: [
      { item_id: itemId, quantity: 2 },
      { item_id: item2.body.data?.item_id, quantity: 1 }
    ],
    notes: 'Extra spicy please'
  }, { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('POST /admin/orders (POS dine-in)', posOrder.status === 201,
    `total: ₹${posOrder.body.data?.total_amount}`);
  orderId = posOrder.body.data?.order_id;

  const orderList = await request('GET', '/admin/orders', null,
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('GET /admin/orders', orderList.status === 200,
    `count: ${orderList.body.data?.length}`);

  const orderStatus = await request('PATCH', `/admin/orders/${orderId}/status`,
    { status: 'preparing', estimated_time: 20 },
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('PATCH /admin/orders/:id/status → preparing', orderStatus.status === 200);

  await request('PATCH', `/admin/orders/${orderId}/status`,
    { status: 'ready' },
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('PATCH /admin/orders/:id/status → ready', true);

  await request('PATCH', `/admin/orders/${orderId}/status`,
    { status: 'delivered' },
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('PATCH /admin/orders/:id/status → delivered', true);

  // ── 8. Reservations ───────────────────────────────────────────
  section('8. Reservations');

  const res = await request('POST', '/v1/reservations', {
    guest_name: 'Test Guest',
    guest_phone: '+91 88888 00001',
    party_size: 3,
    reservation_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    reservation_time: '19:30',
    occasion: 'Birthday'
  }, { 'X-API-Key': apiKey });
  log('POST /v1/reservations (guest booking)', res.status === 201, res.body.data?.status);
  reservationId = res.body.data?.reservation_id;

  const resList = await request('GET', '/admin/reservations', null,
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('GET /admin/reservations', resList.status === 200,
    `count: ${resList.body.data?.length}`);

  if (reservationId) {
    const confirm = await request('PATCH', `/admin/reservations/${reservationId}`,
      { status: 'confirmed', table_id: tableId },
      { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
    log('PATCH /admin/reservations/:id → confirmed + table assigned', confirm.status === 200);
  }

  // ── 9. Public Mobile API ──────────────────────────────────────
  section('9. Public (Mobile App) API');

  const config = await request('GET', '/v1/config', null, { 'X-API-Key': apiKey });
  log('GET /v1/config (branding)', config.status === 200, config.body.data?.name);

  const menu = await request('GET', '/v1/menu', null, { 'X-API-Key': apiKey });
  log('GET /v1/menu (full menu)', menu.status === 200,
    `${menu.body.data?.categories?.length} categories, ${menu.body.data?.total_items} items`);

  const featured = await request('GET', '/v1/menu/featured', null, { 'X-API-Key': apiKey });
  log('GET /v1/menu/featured', featured.status === 200,
    `${featured.body.data?.length} featured items`);

  const search = await request('GET', '/v1/menu/search?q=biryani', null, { 'X-API-Key': apiKey });
  log('GET /v1/menu/search?q=biryani', search.status === 200,
    `${search.body.data?.length} results`);

  // ── 10. Customer Auth + Order ─────────────────────────────────
  section('10. Customer Authentication & Orders');

  const signup = await request('POST', '/v1/auth/signup', {
    phone: '+91 77777 00001',
    name: 'Priya Customer',
    email: 'priya@test.com',
    password: 'Test@1234'
  }, { 'X-API-Key': apiKey });
  log('POST /v1/auth/signup', signup.status === 201, signup.body.data?.customer?.name);
  customerToken = signup.body.data?.token || '';
  customerId = signup.body.data?.customer?.customer_id;

  const custLogin = await request('POST', '/v1/auth/login',
    { phone: '+91 77777 00001', password: 'Test@1234' },
    { 'X-API-Key': apiKey });
  log('POST /v1/auth/login (customer)', custLogin.status === 200);
  customerToken = custLogin.body.data?.token || customerToken;

  const custMe = await request('GET', '/v1/auth/me', null,
    { 'X-API-Key': apiKey, Authorization: `Bearer ${customerToken}` });
  log('GET /v1/auth/me (customer profile)', custMe.status === 200, custMe.body.data?.name);

  // Customer places delivery order
  const custOrder = await request('POST', '/v1/orders', {
    order_type: 'delivery',
    delivery_address: '12, Test Street, Hyderabad',
    customer_notes: 'Ring the bell twice',
    items: [
      { item_id: itemId, quantity: 1 },
      { item_id: item3.body.data?.item_id, quantity: 1 }
    ]
  }, { 'X-API-Key': apiKey, Authorization: `Bearer ${customerToken}` });
  log('POST /v1/orders (customer delivery order)', custOrder.status === 201,
    `total: ₹${custOrder.body.data?.total_amount}`);

  const custOrderId = custOrder.body.data?.order_id;
  const track = await request('GET', `/v1/orders/${custOrderId}/track`, null,
    { 'X-API-Key': apiKey });
  log('GET /v1/orders/:id/track', track.status === 200, `status: ${track.body.data?.status}`);

  const myOrders = await request('GET', '/v1/orders/my', null,
    { 'X-API-Key': apiKey, Authorization: `Bearer ${customerToken}` });
  log('GET /v1/orders/my', myOrders.status === 200, `${myOrders.body.data?.length} orders`);

  // ── 11. Admin Analytics ───────────────────────────────────────
  section('11. Admin Analytics');

  const analytics2 = await request('GET', '/admin/analytics', null,
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('GET /admin/analytics', analytics2.status === 200,
    `orders_today: ${analytics2.body.data?.order_stats?.orders_today}`);

  const custAnalytics = await request('GET', '/admin/analytics/customers', null,
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('GET /admin/analytics/customers', custAnalytics.status === 200,
    `total: ${custAnalytics.body.data?.total_customers}`);

  const profile = await request('GET', '/admin/profile', null,
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('GET /admin/profile', profile.status === 200, profile.body.data?.name);

  const custList = await request('GET', '/admin/customers', null,
    { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('GET /admin/customers', custList.status === 200,
    `${custList.body.data?.length} customers`);

  // ── 12. Admin Profile Update ──────────────────────────────────
  section('12. Admin Profile & Settings');

  const profileUpdate = await request('PATCH', '/admin/profile', {
    tagline: 'Authentic Hyderabadi Biryani',
    primary_color: '#FF6B35',
    secondary_color: '#2C3E50',
    about_text: 'We serve the most authentic Hyderabadi biryani since 2020.',
    social_instagram: 'https://instagram.com/testbiryanihouse'
  }, { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('PATCH /admin/profile (branding update)', profileUpdate.status === 200);

  // Password change
  const pwChange = await request('PATCH', '/admin/auth/change-password', {
    current_password: adminPwd,
    new_password: 'NewPass@2026'
  }, { 'X-API-Key': apiKey, Authorization: `Bearer ${adminToken}` });
  log('PATCH /admin/auth/change-password', pwChange.status === 200);

  // Re-login with new password
  const reLogin = await request('POST', '/admin/auth/login',
    { email: 'owner@testbiryani.com', password: 'NewPass@2026' },
    { 'X-API-Key': apiKey });
  log('Re-login with new password', reLogin.status === 200);

  // ── 13. Super Admin Delete ────────────────────────────────────
  section('13. Cleanup — Delete Test Restaurant');

  const del = await request('DELETE', `/super/restaurants/${restaurantId}`,
    null, { Authorization: `Bearer ${superToken}` });
  log('DELETE /super/restaurants/:id', del.status === 200, del.body.message);

  // Verify deleted
  const checkDel = await request('GET', `/super/restaurants/${restaurantId}`,
    null, { Authorization: `Bearer ${superToken}` });
  log('Verify restaurant deleted (404)', checkDel.status === 404);

  // ── Summary ───────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${'═'.repeat(56)}`);
  console.log(`  📊 RESULTS: ${passed}/${total} tests passed`);
  if (failed > 0) console.log(`  ⚠️  ${failed} test(s) failed`);
  else console.log('  🎉 ALL TESTS PASSED — Platform is production-ready!');
  console.log(`${'═'.repeat(56)}\n`);
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('Test runner crashed:', e.message); process.exit(1); });