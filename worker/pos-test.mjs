import worker from './worker.js';

// ---- In-memory D1 stub: يفهم الـ SQL المحدود اللي الـ worker بيستخدمه للـ POS ----
const tables = { stock: new Map(), invoices: new Map(), items: [] };
let nextId = 1;

function stmt(sql) {
    let args = [];
    const norm = sql.replace(/\s+/g, ' ').trim();
    const s = {
        bind(...a) { args = a; return s; },
        async run() { return exec(norm, args, 'run'); },
        async all() { return exec(norm, args, 'all'); },
        async first() { return exec(norm, args, 'first'); },
    };
    return s;
}
function exec(sql, args, mode) {
    // stock
    if (sql === 'SELECT code, qty FROM stock') {
        const rows = [...tables.stock.entries()].map(([code, qty]) => ({ code, qty }));
        return { results: rows };
    }
    if (sql.startsWith('INSERT INTO stock')) {
        const [code, qty] = args;
        if (sql.includes('qty + excluded.qty')) {
            tables.stock.set(code, (tables.stock.get(code) ?? 0) + qty);
        } else {
            tables.stock.set(code, qty); // upsert set
        }
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith('UPDATE stock SET qty = qty - ?')) {
        const [qty, code, min] = args;
        const cur = tables.stock.get(code) ?? 0;
        if (cur >= min) { tables.stock.set(code, cur - qty); return { meta: { changes: 1 } }; }
        return { meta: { changes: 0 } };
    }
    // invoices
    if (sql.startsWith('INSERT INTO invoices')) {
        const id = nextId++;
        tables.invoices.set(id, { id, num: '', ts: '', day: '', staff: '', payment: '', subtotal: 0, discount: 0, total: 0, status: 'pending', customer_name: '', customer_phone: '' });
        return { meta: { changes: 1, last_row_id: id } };
    }
    if (sql.startsWith('UPDATE invoices SET num = ?')) {
        const [num, ts, day, staff, payment, subtotal, discount, total, cn, cp, id] = args;
        Object.assign(tables.invoices.get(id), { num, ts, day, staff, payment, subtotal, discount, total, status: 'completed', customer_name: cn, customer_phone: cp });
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT INTO invoice_items')) {
        const [invoice_id, code, name, price, qty, discount, line_total] = args;
        tables.items.push({ invoice_id, code, name, price, qty, discount, line_total });
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith("SELECT id, num, ts, staff, payment, subtotal, discount, total, status, customer_name, customer_phone FROM invoices WHERE status != 'pending'")) {
        let rows = [...tables.invoices.values()].filter((i) => i.status !== 'pending');
        let ai = 0;
        if (sql.includes('AND staff = ?')) rows = rows.filter((i) => i.staff === args[ai++]);
        if (sql.includes('AND day = ?')) rows = rows.filter((i) => i.day === args[ai++]);
        rows.sort((a, b) => b.id - a.id);
        return { results: rows };
    }
    if (sql.startsWith("SELECT * FROM invoices WHERE id = ? AND status != 'pending'")) {
        const r = tables.invoices.get(args[0]);
        return !r || r.status === 'pending' ? null : r;
    }
    if (sql.startsWith('SELECT id, status FROM invoices WHERE id = ?')) {
        const r = tables.invoices.get(args[0]);
        return r ? { id: r.id, status: r.status } : null;
    }
    if (sql.startsWith('SELECT code, name, price, qty, discount, line_total FROM invoice_items')) {
        return { results: tables.items.filter((i) => i.invoice_id === args[0]) };
    }
    if (sql.startsWith('SELECT code, qty FROM invoice_items')) {
        return { results: tables.items.filter((i) => i.invoice_id === args[0]).map((i) => ({ code: i.code, qty: i.qty })) };
    }
    if (sql.startsWith("UPDATE invoices SET status = 'voided'")) {
        tables.invoices.get(args[0]).status = 'voided';
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith('SELECT staff, COUNT(*)')) {
        let rows = [...tables.invoices.values()].filter((i) => i.status === 'completed' && i.day === args[0]);
        if (sql.includes('AND staff = ?')) rows = rows.filter((i) => i.staff === args[1]);
        const byStaff = new Map();
        for (const i of rows) {
            const g = byStaff.get(i.staff) || { staff: i.staff, count: 0, total: 0, cash_total: 0, vcash_total: 0 };
            g.count++; g.total += i.total;
            if (i.payment === 'cash') g.cash_total += i.total; else g.vcash_total += i.total;
            byStaff.set(i.staff, g);
        }
        return { results: [...byStaff.values()] };
    }
    throw new Error('stub does not understand SQL: ' + sql);
}

const kv = new Map();
const env = {
    ADMIN_CODE: 'master-pass-1',
    SHOP_KV: {
        async get(k) { return kv.has(k) ? kv.get(k) : null; },
        async put(k, v) { kv.set(k, v); },
    },
    POS_DB: {
        prepare: (sql) => stmt(sql),
        async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
    },
};
const call = (method, path, body, auth) => worker.fetch(new Request('https://api.test' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { 'X-Admin-Code': auth } : {}) },
    body: body ? JSON.stringify(body) : undefined,
}), env).then(async (r) => ({ status: r.status, body: await r.json() }));

let r, failed = 0;
const check = (label, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + label); if (!cond) failed++; };

const MGR = 'master-pass-1';
// كاشير
r = await call('POST', '/api/admin/admins', { user: 'karim', pass: 'karim123', role: 'cashier' }, MGR);
check('create cashier ok', r.status === 200);
const CSH = 'karim:karim123';

r = await call('GET', '/api/pos/me', null, CSH);
check('cashier me role', r.status === 200 && r.body.role === 'cashier' && r.body.user === 'karim');
r = await call('GET', '/api/pos/me', null, MGR);
check('master is manager', r.status === 200 && r.body.role === 'manager');
r = await call('GET', '/api/pos/me');
check('no auth rejected', r.status === 401);

// بذر كتالوج
await call('PUT', '/api/admin/products', { products: [
    { name: 'لمبة ليد', code: 'EL-101', price: 90, cat: 'كهرباء' },
    { name: 'خلاط مغسلة', code: 'PL-201', price: 1650, cat: 'صحي' },
] }, MGR);

// أرصدة
r = await call('POST', '/api/pos/stock', { code: 'EL-101', qty: 10 }, MGR);
check('manager sets stock', r.status === 200 && r.body.qty === 10);
await call('POST', '/api/pos/stock', { code: 'PL-201', qty: 2 }, MGR);
r = await call('POST', '/api/pos/stock', { code: 'EL-101', qty: 5 }, CSH);
check('cashier cannot set stock', r.status === 403);

r = await call('GET', '/api/pos/products', null, CSH);
check('products with qty', r.status === 200 && r.body.products.find((p) => p.code === 'EL-101').qty === 10);

// بيع
r = await call('POST', '/api/pos/invoices', { items: [{ code: 'EL-101', qty: 3 }, { code: 'PL-201', qty: 1, discount: 50 }], payment: 'vcash', discount: 20 }, CSH);
check('invoice created', r.status === 200 && r.body.ok && /^INV-\d{6}$/.test(r.body.num));
check('server total', r.body.total === (90 * 3) + (1650 - 50) - 20);
const invId = r.body.id, invNum = r.body.num;

r = await call('GET', '/api/pos/products', null, CSH);
check('stock decremented', r.body.products.find((p) => p.code === 'EL-101').qty === 7 && r.body.products.find((p) => p.code === 'PL-201').qty === 1);

// مخزون مش كفاية
r = await call('POST', '/api/pos/invoices', { items: [{ code: 'PL-201', qty: 5 }], payment: 'cash' }, CSH);
check('insufficient stock rejected', r.status === 400 && r.body.error === 'insufficient_stock');
r = await call('GET', '/api/pos/products', null, CSH);
check('stock unchanged after reject', r.body.products.find((p) => p.code === 'PL-201').qty === 1);

// فواتير
r = await call('GET', '/api/pos/invoices', null, CSH);
check('cashier sees own invoice', r.status === 200 && r.body.invoices.length === 1 && r.body.invoices[0].num === invNum);
r = await call('GET', '/api/pos/invoices?all=1', null, MGR);
check('manager sees all', r.status === 200 && r.body.invoices.length === 1);
r = await call('GET', '/api/pos/invoice/' + invId, null, CSH);
check('invoice detail items', r.status === 200 && r.body.items.length === 2 && r.body.items[1].line_total === 1600);

// إلغاء
r = await call('POST', '/api/pos/invoice/' + invId + '/void', null, CSH);
check('cashier cannot void', r.status === 403);
r = await call('POST', '/api/pos/invoice/' + invId + '/void', null, MGR);
check('manager voids', r.status === 200 && r.body.ok);
r = await call('GET', '/api/pos/products', null, MGR);
check('void restocks', r.body.products.find((p) => p.code === 'EL-101').qty === 10 && r.body.products.find((p) => p.code === 'PL-201').qty === 2);
r = await call('POST', '/api/pos/invoice/' + invId + '/void', null, MGR);
check('double void rejected', r.status === 400);

// تقفيلة: بيع جديد بعد الإلغاء
r = await call('POST', '/api/pos/invoices', { items: [{ code: 'EL-101', qty: 2 }], payment: 'cash' }, MGR);
check('manager sells', r.status === 200);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
r = await call('GET', '/api/pos/close?date=' + today, null, MGR);
check('close shows manager row, voided excluded', r.status === 200 && r.body.rows.length === 1 && r.body.rows[0].total === 180 && r.body.rows[0].count === 1);
r = await call('GET', '/api/pos/close?date=' + today, null, CSH);
check('cashier close empty', r.status === 200 && r.body.rows.length === 0);

console.log(failed === 0 ? 'ALL PASS' : failed + ' FAILED');
process.exit(failed === 0 ? 0 : 1);
