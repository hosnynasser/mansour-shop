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

r = await call('POST', '/api/admin/orders/status', { id: oid, status: 'preparing' }, 'test-code-123');
check('preparing status ok', r.status === 200 && r.body.ok);
r = await call('GET', '/api/admin/orders', null, 'test-code-123');
check('preparing persisted', r.body.orders[0].status === 'preparing');
r = await call('POST', '/api/admin/orders/status', { id: oid, status: 'bogus' }, 'test-code-123');
check('bogus status falls back to new', r.status === 200 && r.body.ok);
r = await call('GET', '/api/admin/orders', null, 'test-code-123');
check('bogus status stored as new', r.body.orders[0].status === 'new');

r = await call('PUT', '/api/admin/products', { products: [{ name: 'x', code: 'A', price: -5, cat: 'كهرباء' }] }, 'test-code-123');
check('negative price rejected', r.status === 400);

r = await call('PUT', '/api/admin/products', { products: [...seed, { ...seed[0] }] }, 'test-code-123');
check('duplicate code rejected', r.status === 400 && r.body.error === 'duplicate_code');


// ===== v2: site / media / admins / gallery fields =====
r = await call('PUT', '/api/admin/site', { site: { phone: '01021924181', phone2: '0100', whatsapp: '', address: 'حلوان أطلس', hours: '10-11' } }, 'test-code-123');
check('PUT site ok', r.status === 200 && r.body.ok);
r = await call('GET', '/api/site');
check('GET site public', r.status === 200 && r.body.site.phone === '01021924181' && !r.body.site.whatsapp);
r = await call('PUT', '/api/admin/site', { site: { address: 'x' } }, 'test-code-123');
check('PUT site missing phone rejected', r.status === 400);

const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
r = await call('POST', '/api/admin/media', { data: png1x1, type: 'image/png' }, 'test-code-123');
check('media upload ok', r.status === 200 && /^m-/.test(r.body.id));
const mid = r.body.id;
const mr = await worker.fetch(new Request('https://api.test/api/media/' + mid), env);
check('media served with type+cache', mr.status === 200 && mr.headers.get('content-type') === 'image/png' && /max-age=31536000/.test(mr.headers.get('cache-control') || ''));

r = await call('PUT', '/api/admin/products', { products: [{ ...seed[0], images: [mid, 'https://ok.com/a.jpg'], video: mid }] }, 'test-code-123');
check('product with gallery+video saved', r.status === 200);
r = await call('GET', '/api/products');
check('gallery survives round-trip', r.body.products[0].images.length === 2 && r.body.products[0].video === mid);
r = await call('PUT', '/api/admin/products', { products: [{ ...seed[0], images: ['javascript:x'], video: 'not a ref' }] }, 'test-code-123');
check('bad media refs stripped', r.status === 200);
r = await call('GET', '/api/products');
check('bad refs gone after sanitize', r.body.products[0].images.length === 0 && r.body.products[0].video === '');

r = await call('POST', '/api/admin/admins', { user: 'mansour', pass: 'secret1' }, 'test-code-123');
check('add admin ok', r.status === 200 && r.body.ok);
r = await call('GET', '/api/admin/orders', null, 'mansour:secret1');
check('admin user:pass auth works', r.status === 200);
r = await call('GET', '/api/admin/orders', null, 'mansour:wrong');
check('wrong admin pass rejected', r.status === 401);
r = await call('POST', '/api/admin/admins', { user: 'mansour', pass: 'secret1' }, 'test-code-123');
check('duplicate admin rejected', r.status === 400);
r = await call('POST', '/api/admin/admins/update', { user: 'mansour', newPass: 'secret2' }, 'test-code-123');
check('change password ok', r.status === 200);
r = await call('GET', '/api/admin/orders', null, 'mansour:secret2');
check('new password works', r.status === 200);
r = await call('GET', '/api/admin/orders', null, 'mansour:secret1');
check('old password dead', r.status === 401);
r = await call('POST', '/api/admin/admins/update', { user: 'mansour', newUser: 'mansour2' }, 'test-code-123');
check('rename admin ok', r.status === 200);
r = await call('POST', '/api/admin/admins/delete', { user: 'mansour2' }, 'test-code-123');
check('deleting only admin refused', r.status === 400 && r.body.error === 'last_admin');
r = await call('POST', '/api/admin/admins', { user: 'helper', pass: 'secret9' }, 'test-code-123');
check('second admin added', r.status === 200);
r = await call('POST', '/api/admin/admins/delete', { user: 'mansour2' }, 'test-code-123');
check('delete admin ok', r.status === 200);
r = await call('POST', '/api/admin/admins/delete', { user: 'mansour2' }, 'test-code-123');
check('delete missing admin 404', r.status === 404);
r = await call('POST', '/api/admin/admins', { user: 'ab', pass: 'secret1' }, 'test-code-123');
check('short username rejected', r.status === 400);
r = await call('GET', '/api/admin/admins', null, 'test-code-123');
check('list admins hides hashes', r.status === 200 && r.body.admins.length === 1 && r.body.admins[0].user === 'helper' && !('hash' in r.body.admins[0]));

console.log(failed ? 'FAILED: ' + failed : 'ALL PASS');
process.exit(failed ? 1 : 0);
