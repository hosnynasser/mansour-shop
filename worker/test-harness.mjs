import worker from './worker.js';

const store = new Map();
const env = {
  ADMIN_CODE: 'test-code-123',
  SHOP_KV: {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
  },
};
const call = (method, path, body, admin) => worker.fetch(new Request('https://api.test' + path, {
  method,
  headers: { 'Content-Type': 'application/json', ...(admin ? { 'X-Admin-Code': admin } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}), env).then(async (r) => ({ status: r.status, body: await r.json() }));

const seed = [
  { name: 'لمبة ليد', code: 'EL-101', price: 90, cat: 'كهرباء', desc: 'x' },
  { name: 'خلاط مغسلة', code: 'PL-201', price: 1650, cat: 'أدوات صحية', desc: 'y', stock: false },
];

let r, failed = 0;
const check = (label, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + label); if (!cond) failed++; };

r = await call('GET', '/api/products');
check('products 404 before seed', r.status === 404);

r = await call('PUT', '/api/admin/products', { products: seed }, 'wrong');
check('PUT products rejected with wrong code', r.status === 401);

r = await call('PUT', '/api/admin/products', { products: seed }, 'test-code-123');
check('PUT products ok', r.status === 200 && r.body.ok);

r = await call('GET', '/api/products');
check('GET products returns seed', r.status === 200 && r.body.products.length === 2 && r.body.products[1].stock === false);

r = await call('POST', '/api/orders', { name: 'أحمد', phone: '0100', address: 'حلوان', items: [{ code: 'EL-101', qty: 3 }] });
check('order accepted, server total', r.status === 200 && r.body.ok && r.body.total === 270 && /^MN-/.test(r.body.id));
const oid = r.body.id;

r = await call('POST', '/api/orders', { name: '', phone: '0100', address: 'x', items: [{ code: 'EL-101', qty: 1 }] });
check('order missing name rejected', r.status === 400);

r = await call('POST', '/api/orders', { name: 'a', phone: '0', address: 'x', items: [{ code: 'NOPE', qty: 1 }] });
check('unknown product rejected', r.status === 400 && r.body.error === 'unknown_product');

r = await call('POST', '/api/orders', { name: 'a', phone: '0', address: 'x', items: [{ code: 'PL-201', qty: 1 }] });
check('out of stock rejected', r.status === 400 && r.body.error === 'out_of_stock');

r = await call('GET', '/api/admin/orders', null, 'test-code-123');
check('admin orders list has the order', r.status === 200 && r.body.orders.length === 1 && r.body.orders[0].id === oid && r.body.orders[0].status === 'new' && r.body.orders[0].lines[0].qty === 3);

r = await call('POST', '/api/admin/orders/status', { id: oid, status: 'done' }, 'test-code-123');
check('status update ok', r.status === 200 && r.body.ok);

r = await call('GET', '/api/admin/orders', null, 'test-code-123');
check('status persisted', r.body.orders[0].status === 'done');

r = await call('PUT', '/api/admin/products', { products: [{ name: 'x', code: 'A', price: -5, cat: 'كهرباء' }] }, 'test-code-123');
check('negative price rejected', r.status === 400);

r = await call('PUT', '/api/admin/products', { products: [...seed, { ...seed[0] }] }, 'test-code-123');
check('duplicate code rejected', r.status === 400 && r.body.error === 'duplicate_code');

console.log(failed ? `\n${failed} FAILURES` : '\nALL PASS');
process.exit(failed ? 1 : 0);
