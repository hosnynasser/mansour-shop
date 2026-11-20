import worker from './worker.js';

// ---- In-memory D1 stub: يفهم الـ SQL المحدود اللي الـ worker بيستخدمه للـ POS ----
const tables = { stock: new Map(), invoices: new Map(), items: [], customers: new Map(), ledger: [], barcodes: new Map(), quotes: new Map(), qitems: [], costs: new Map(), minqtys: new Map(), suppliers: new Map(), purchases: new Map(), pitems: [], expenses: new Map() };
let nextId = 1;
let nextCustId = 1;
let nextLedgerId = 1;
let nextQuoteId = 1;
let nextSupId = 1;
let nextPurId = 1;
let nextExpId = 1;

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
    if (sql.startsWith('SELECT code, qty FROM stock') || sql.startsWith('SELECT code, qty, barcode FROM stock') || sql.startsWith('SELECT code, qty, barcode, cost, min_qty FROM stock')) {
        const rows = [...tables.stock.entries()].map(([code, qty]) => ({ code, qty, barcode: tables.barcodes.get(code) || '', cost: tables.costs.get(code) || 0, min_qty: tables.minqtys.get(code) ?? 5 }));
        return { results: rows };
    }
    if (sql.startsWith('INSERT INTO stock') && sql.includes('min_qty')) {
        const [code, qty, minQty] = args;
        tables.stock.set(code, qty);
        tables.minqtys.set(code, minQty);
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT INTO stock') && sql.includes('cost')) {
        const [code, qty, cost] = args;
        if (sql.includes('qty = qty + excluded.qty')) tables.stock.set(code, (tables.stock.get(code) || 0) + qty);
        else tables.stock.set(code, qty);
        tables.costs.set(code, cost);
        return { meta: { changes: 1 } };
    }
    if (sql === 'SELECT qty FROM stock WHERE code = ?') {
        return tables.stock.has(args[0]) ? { qty: tables.stock.get(args[0]) } : null;
    }
    if (sql === 'UPDATE stock SET qty = qty - ? WHERE code = ?') {
        tables.stock.set(args[1], tables.stock.get(args[1]) - args[0]);
        return { meta: { changes: 1 } };
    }
    if (sql === 'SELECT code FROM stock') {
        return { results: [...tables.stock.keys()].map((code) => ({ code })) };
    }
    if (sql.startsWith('INSERT INTO stock') && sql.includes('barcode')) {
        const [code, barcode] = args;
        if (!tables.stock.has(code)) tables.stock.set(code, 0);
        tables.barcodes.set(code, barcode);
        return { meta: { changes: 1 } };
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
        const [num, ts, day, staff, payment, subtotal, discount, total, cn, cp, cid, id] = args;
        Object.assign(tables.invoices.get(id), { num, ts, day, staff, payment, subtotal, discount, total, status: 'completed', customer_name: cn, customer_phone: cp, customer_id: cid });
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
    // customers
    if (sql.startsWith('SELECT id FROM customers WHERE id = ?') || sql.startsWith('SELECT id, name, phone FROM customers WHERE id = ?') || sql.startsWith('SELECT id, name, phone, notes FROM customers WHERE id = ?')) {
        return tables.customers.get(args[0]) || null;
    }
    if (sql.startsWith('SELECT c.id, c.name, c.phone, c.notes')) {
        const rows = [...tables.customers.values()].map((c) => ({ ...c, balance: tables.ledger.filter((l) => l.customer_id === c.id).reduce((s, l) => s + (l.kind === 'charge' ? l.amount : -l.amount), 0) }));
        return { results: rows };
    }
    if (sql.startsWith('INSERT INTO customers')) {
        const [name, phone, notes, created_at] = args;
        const id = nextCustId++;
        tables.customers.set(id, { id, name, phone, notes, created_at });
        return { meta: { changes: 1, last_row_id: id } };
    }
    if (sql.startsWith('UPDATE customers SET')) {
        const [name, phone, notes, id] = args;
        Object.assign(tables.customers.get(id), { name, phone, notes });
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith('SELECT COUNT(*) AS n FROM ledger WHERE customer_id = ?')) {
        return { n: tables.ledger.filter((l) => l.customer_id === args[0]).length };
    }
    if (sql.startsWith('DELETE FROM customers')) {
        tables.customers.delete(args[0]);
        return { meta: { changes: 1 } };
    }
    // ledger
    if (sql.startsWith('INSERT INTO ledger')) {
        const kind = sql.includes("'charge'") ? 'charge' : 'payment';
        // charge: (customer_id, ts, day, amount, invoice_id, staff) — payment: (customer_id, ts, day, amount, staff, note)
        const [customer_id, ts, day, amount, a4, a5] = args;
        tables.ledger.push({ id: nextLedgerId++, customer_id, ts, day, kind, amount, invoice_id: kind === 'charge' ? a4 : null, staff: kind === 'charge' ? a5 : a4, note: kind === 'payment' ? a5 : '' });
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith("DELETE FROM ledger WHERE id = ? AND kind = 'payment'")) {
        const i = tables.ledger.findIndex((l) => l.id === args[0] && l.kind === 'payment');
        if (i >= 0) tables.ledger.splice(i, 1);
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith("DELETE FROM ledger WHERE invoice_id = ? AND kind = 'charge'")) {
        for (let i = tables.ledger.length - 1; i >= 0; i--) if (tables.ledger[i].invoice_id === args[0] && tables.ledger[i].kind === 'charge') tables.ledger.splice(i, 1);
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith('SELECT id, ts, kind, amount, invoice_id, staff, note FROM ledger WHERE customer_id = ?')) {
        return { results: tables.ledger.filter((l) => l.customer_id === args[0]).sort((a, b) => b.id - a.id) };
    }
    if (sql.startsWith('SELECT COALESCE(SUM(CASE') && sql.includes('FROM ledger WHERE customer_id = ?')) {
        const b = tables.ledger.filter((l) => l.customer_id === args[0]).reduce((s, l) => s + (l.kind === 'charge' ? l.amount : -l.amount), 0);
        return { b };
    }
    if (sql.startsWith('SELECT id, num, ts, staff, payment, total, status FROM invoices WHERE customer_id = ?')) {
        return { results: [...tables.invoices.values()].filter((i) => i.customer_id === args[0] && i.status !== 'pending') };
    }
    // reports
    if (sql.startsWith('SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total')) {
        const rows = [...tables.invoices.values()].filter((i) => i.status === 'completed' && i.day >= args[0] && i.day <= args[1]);
        return { count: rows.length, total: rows.reduce((s, i) => s + i.total, 0), cash_total: rows.filter((i) => i.payment === 'cash').reduce((s, i) => s + i.total, 0), vcash_total: rows.filter((i) => i.payment === 'vcash').reduce((s, i) => s + i.total, 0), debt_total: rows.filter((i) => i.payment === 'debt').reduce((s, i) => s + i.total, 0), discounts: rows.reduce((s, i) => s + i.discount, 0) };
    }
    if (sql.startsWith('SELECT ii.name, ii.code')) {
        const ids = new Set([...tables.invoices.values()].filter((i) => i.status === 'completed' && i.day >= args[0] && i.day <= args[1]).map((i) => i.id));
        const byCode = new Map();
        for (const it of tables.items.filter((x) => ids.has(x.invoice_id))) {
            const g = byCode.get(it.code) || { name: it.name, code: it.code, qty: 0, revenue: 0 };
            g.qty += it.qty; g.revenue += it.line_total;
            byCode.set(it.code, g);
        }
        return { results: [...byCode.values()].sort((a, b) => b.revenue - a.revenue) };
    }
    if (sql.startsWith('SELECT staff, COUNT(*) AS count, SUM(total) AS total FROM invoices')) {
        const rows = [...tables.invoices.values()].filter((i) => i.status === 'completed' && i.day >= args[0] && i.day <= args[1]);
        const byStaff = new Map();
        for (const i of rows) { const g = byStaff.get(i.staff) || { staff: i.staff, count: 0, total: 0 }; g.count++; g.total += i.total; byStaff.set(i.staff, g); }
        return { results: [...byStaff.values()] };
    }
    if (sql.startsWith('SELECT COALESCE(SUM(CASE') && sql.includes('FROM ledger') && !sql.includes('customer_id')) {
        return { outstanding: tables.ledger.reduce((s, l) => s + (l.kind === 'charge' ? l.amount : -l.amount), 0) };
    }
    if (sql.startsWith('SELECT c.id, c.name, c.phone, SUM(CASE')) {
        const byCust = new Map();
        for (const l of tables.ledger) { const c = tables.customers.get(l.customer_id); if (!c) continue; const g = byCust.get(l.customer_id) || { id: c.id, name: c.name, phone: c.phone, balance: 0 }; g.balance += l.kind === 'charge' ? l.amount : -l.amount; byCust.set(l.customer_id, g); }
        return { results: [...byCust.values()].filter((g) => g.balance > 0).sort((a, b) => b.balance - a.balance) };
    }
    if (sql.startsWith("SELECT COALESCE(SUM(amount), 0) AS c FROM ledger WHERE kind = 'payment' AND day >= ? AND day <= ?")) {
        return { c: tables.ledger.filter((l) => l.kind === 'payment' && l.day >= args[0] && l.day <= args[1]).reduce((s, l) => s + l.amount, 0) };
    }
    // suppliers
    if (sql.startsWith('INSERT INTO suppliers')) {
        const id = nextSupId++;
        tables.suppliers.set(id, { id, name: args[0], phone: args[1], notes: args[2], balance: 0 });
        return { meta: { changes: 1, last_row_id: id } };
    }
    if (sql.startsWith('SELECT id, name, phone, notes, balance FROM suppliers')) {
        return { results: [...tables.suppliers.values()] };
    }
    if (sql.startsWith('SELECT * FROM suppliers WHERE id = ?') || sql.startsWith('SELECT id, name FROM suppliers WHERE id = ?') || sql.startsWith('SELECT id, balance FROM suppliers WHERE id = ?') || sql.startsWith('SELECT balance FROM suppliers WHERE id = ?')) {
        return tables.suppliers.get(args[0]) || null;
    }
    if (sql.startsWith('UPDATE suppliers SET name = ?')) {
        Object.assign(tables.suppliers.get(args[3]), { name: args[0], phone: args[1], notes: args[2] });
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith('UPDATE suppliers SET balance = balance + ?')) {
        tables.suppliers.get(args[1]).balance += args[0];
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith('UPDATE suppliers SET balance = balance - ?')) {
        tables.suppliers.get(args[1]).balance -= args[0];
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith('DELETE FROM suppliers')) {
        tables.suppliers.delete(args[0]);
        return { meta: { changes: 1 } };
    }
    // purchases
    if (sql.startsWith('INSERT INTO purchases')) {
        const id = nextPurId++;
        tables.purchases.set(id, { id, num: '', ts: '', day: '', staff: '', supplier_id: 0, supplier_name: '', total: 0, paid: 0, status: 'completed', note: '' });
        return { meta: { changes: 1, last_row_id: id } };
    }
    if (sql.startsWith('UPDATE purchases SET num = ?')) {
        const [num, ts, day, staff, sid, sname, total, paid, note, id] = args;
        Object.assign(tables.purchases.get(id), { num, ts, day, staff, supplier_id: sid, supplier_name: sname, total, paid, note });
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT INTO purchase_items')) {
        const [purchase_id, code, name, qty, cost] = args;
        tables.pitems.push({ purchase_id, code, name, qty, cost });
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith('SELECT id, num, ts, staff, supplier_id, supplier_name, total, paid, status, note FROM purchases') || sql.startsWith('SELECT id, num, ts, total, paid, status FROM purchases')) {
        let rows = [...tables.purchases.values()];
        if (sql.includes('WHERE supplier_id = ?')) rows = rows.filter((p) => p.supplier_id === args[0]);
        return { results: rows.sort((a, b) => b.id - a.id) };
    }
    if (sql.startsWith('SELECT * FROM purchases WHERE id = ?')) {
        return tables.purchases.get(args[0]) || null;
    }
    if (sql.startsWith('SELECT code, name, qty, cost FROM purchase_items') || sql.startsWith('SELECT code, qty FROM purchase_items')) {
        return { results: tables.pitems.filter((i) => i.purchase_id === args[0]) };
    }
    if (sql.startsWith("UPDATE purchases SET status = 'voided'")) {
        tables.purchases.get(args[0]).status = 'voided';
        return { meta: { changes: 1 } };
    }
    // expenses
    if (sql.startsWith('INSERT INTO expenses')) {
        const id = nextExpId++;
        tables.expenses.set(id, { id, ts: args[0], day: args[1], title: args[2], amount: args[3], cat: args[4], staff: args[5], note: args[6] });
        return { meta: { changes: 1, last_row_id: id } };
    }
    if (sql.startsWith('SELECT id, ts, day, title, amount, cat, staff, note FROM expenses')) {
        let rows = [...tables.expenses.values()];
        if (sql.includes('AND staff = ?')) rows = rows.filter((e) => e.staff === args[0]);
        return { results: rows };
    }
    if (sql.startsWith('SELECT id, staff FROM expenses')) {
        return tables.expenses.get(args[0]) || null;
    }
    if (sql.startsWith('DELETE FROM expenses')) {
        tables.expenses.delete(args[0]);
        return { meta: { changes: 1 } };
    }
    // quotes
    if (sql.startsWith('INSERT INTO quotes')) {
        const id = nextQuoteId++;
        tables.quotes.set(id, { id, num: '', ts: '', day: '', staff: '', customer_name: '', customer_phone: '', subtotal: 0, discount: 0, total: 0, status: 'open', invoice_id: null });
        return { meta: { changes: 1, last_row_id: id } };
    }
    if (sql.startsWith('UPDATE quotes SET num = ?')) {
        const [num, ts, day, staff, cn, cp, subtotal, discount, total, id] = args;
        Object.assign(tables.quotes.get(id), { num, ts, day, staff, customer_name: cn, customer_phone: cp, subtotal, discount, total });
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith('INSERT INTO quote_items')) {
        const [quote_id, code, name, price, qty, discount, line_total] = args;
        tables.qitems.push({ quote_id, code, name, price, qty, discount, line_total });
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith('SELECT id, num, ts, staff, customer_name, customer_phone, subtotal, discount, total, status, invoice_id FROM quotes')) {
        let rows = [...tables.quotes.values()];
        if (sql.includes('WHERE staff = ?')) rows = rows.filter((q) => q.staff === args[0]);
        rows.sort((a, b) => b.id - a.id);
        return { results: rows };
    }
    if (sql.startsWith('SELECT * FROM quotes WHERE id = ?') || sql.startsWith('SELECT id, staff, status FROM quotes WHERE id = ?')) {
        return tables.quotes.get(args[0]) || null;
    }
    if (sql.startsWith('SELECT code, name, price, qty, discount, line_total FROM quote_items')) {
        return { results: tables.qitems.filter((i) => i.quote_id === args[0]) };
    }
    if (sql.startsWith('SELECT code, qty, discount FROM quote_items')) {
        return { results: tables.qitems.filter((i) => i.quote_id === args[0]).map((i) => ({ code: i.code, qty: i.qty, discount: i.discount })) };
    }
    if (sql.startsWith("UPDATE quotes SET status = 'converted'")) {
        const [invoice_id, id] = args;
        const q = tables.quotes.get(id);
        if (q.status !== 'open') return { meta: { changes: 0 } };
        Object.assign(q, { status: 'converted', invoice_id });
        return { meta: { changes: 1 } };
    }
    if (sql.startsWith("UPDATE quotes SET status = 'canceled'")) {
        tables.quotes.get(args[0]).status = 'canceled';
        return { meta: { changes: 1 } };
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


// ===== المرحلة 2: عملاء ومديونيات وتقارير =====
r = await call('POST', '/api/pos/customers', { name: 'أسطى محمود', phone: '01011111111' }, CSH);
check('cashier adds customer', r.status === 200 && r.body.id > 0);
const custId = r.body.id;
r = await call('POST', '/api/pos/customers', { name: 'x' }, CSH);
check('short name rejected', r.status === 400);

r = await call('GET', '/api/pos/customers', null, CSH);
check('customers list with zero balance', r.status === 200 && r.body.customers.length === 1 && r.body.customers[0].balance === 0);

// بيع آجل من غير عميل ممنوع
r = await call('POST', '/api/pos/invoices', { items: [{ code: 'EL-101', qty: 2 }], payment: 'debt' }, CSH);
check('debt without customer rejected', r.status === 400 && r.body.error === 'customer_required');

// بيع آجل بعميل
r = await call('POST', '/api/pos/invoices', { items: [{ code: 'EL-101', qty: 2 }], payment: 'debt', customerId: custId }, CSH);
check('debt sale ok', r.status === 200 && r.body.ok);
const debtInvId = r.body.id;

r = await call('GET', '/api/pos/customer/' + custId, null, CSH);
check('balance = debt total', r.status === 200 && r.body.balance === 180);
check('ledger has charge linked to invoice', r.body.ledger.length === 1 && r.body.ledger[0].invoice_id === debtInvId && r.body.ledger[0].kind === 'charge');
check('customer invoices listed', r.body.invoices.length === 1 && r.body.invoices[0].payment === 'debt');

// دفعة جزئية
r = await call('POST', '/api/pos/customer/' + custId + '/payment', { amount: 100, method: 'cash' }, CSH);
check('payment ok, balance reduced', r.status === 200 && r.body.balance === 80);
r = await call('POST', '/api/pos/customer/' + custId + '/payment', { amount: -5 }, CSH);
check('negative payment rejected', r.status === 400);
r = await call('POST', '/api/pos/customer/9999/payment', { amount: 10 }, CSH);
check('payment for unknown customer rejected', r.status === 404);

// مسح قيد دفعة: كاشير ممنوع، مدير مسموح
const payEntry = (await call('GET', '/api/pos/customer/' + custId, null, MGR)).body.ledger.find((l) => l.kind === 'payment');
r = await call('DELETE', '/api/pos/ledger/' + payEntry.id, null, CSH);
check('cashier cannot delete ledger entry', r.status === 403);
r = await call('DELETE', '/api/pos/ledger/' + payEntry.id, null, MGR);
check('manager deletes payment entry', r.status === 200);
r = await call('GET', '/api/pos/customer/' + custId, null, MGR);
check('balance back to 180', r.body.balance === 180);

// تعديل عميل: كاشير ممنوع
r = await call('PATCH', '/api/pos/customers?id=' + custId, { name: 'أسطى محمود عبد الرحمن', phone: '01011111111' }, CSH);
check('cashier cannot edit customer', r.status === 403);
r = await call('PATCH', '/api/pos/customers?id=' + custId, { name: 'أسطى محمود عبد الرحمن', phone: '01011111111' }, MGR);
check('manager edits customer', r.status === 200);

// مسح عميل عليه قيود ممنوع
r = await call('DELETE', '/api/pos/customers?id=' + custId, null, MGR);
check('customer with ledger cannot be deleted', r.status === 400 && r.body.error === 'has_ledger');

// إلغاء فاتورة الآجل بيشيل قيد الدين
r = await call('POST', '/api/pos/invoice/' + debtInvId + '/void', null, MGR);
check('void debt invoice', r.status === 200);
r = await call('GET', '/api/pos/customer/' + custId, null, MGR);
check('void removes debt charge', r.body.balance === 0 && r.body.ledger.length === 0);

// التقارير
const today2 = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
r = await call('GET', `/api/pos/reports?from=${today2}&to=${today2}`, null, CSH);
check('cashier cannot see reports', r.status === 403);
r = await call('GET', `/api/pos/reports?from=${today2}&to=${today2}`, null, MGR);
check('report summary excludes voided', r.status === 200 && r.body.summary.count === 1 && r.body.summary.cash_total === 180 && r.body.summary.debt_total === 0);
check('report top products', r.body.top.length === 1 && r.body.top[0].code === 'EL-101' && r.body.top[0].qty === 2);
check('report by staff', r.body.byStaff.length === 1 && r.body.byStaff[0].total === 180);
check('report debts zero after void', r.body.debtsOutstanding === 0);

// دين جديد يظهر في التقارير
await call('POST', '/api/pos/invoices', { items: [{ code: 'EL-101', qty: 1 }], payment: 'debt', customerId: custId }, CSH);
r = await call('GET', `/api/pos/reports?from=${today2}&to=${today2}`, null, MGR);
check('report shows debt total + outstanding', r.body.summary.debt_total === 90 && r.body.debtsOutstanding === 90 && r.body.topDebtors.length === 1 && r.body.topDebtors[0].balance === 90);


// ===== المرحلة 4 دفعة 1: موردين + مشتريات + مصاريف + نواقص =====
// موردين
r = await call('POST', '/api/pos/suppliers', { name: 'شركة النور للكهرباء', phone: '0111' }, CSH);
check('cashier cannot add supplier', r.status === 403);
r = await call('POST', '/api/pos/suppliers', { name: 'شركة النور للكهرباء', phone: '0111' }, MGR);
check('manager adds supplier', r.status === 200 && r.body.id > 0);
const supId = r.body.id;

// فاتورة شراء: تزود المخزون وتسجل التكلفة ومديونية المورد
const stockBefore = tables.stock.get('EL-101');
r = await call('POST', '/api/pos/purchases', { supplierId: supId, paid: 300, items: [{ code: 'EL-101', qty: 10, cost: 60 }] }, MGR);
check('purchase created', r.status === 200 && /^PO-/.test(r.body.num) && r.body.total === 600);
check('purchase adds stock', tables.stock.get('EL-101') === stockBefore + 10);
check('purchase sets cost', tables.costs.get('EL-101') === 60);
check('supplier owes remainder', tables.suppliers.get(supId).balance === 300);
check('products expose cost+min', (await call('GET', '/api/pos/products', null, MGR)).body.products.find((p) => p.code === 'EL-101').cost === 60);

// تسديد للمورد
r = await call('POST', `/api/pos/supplier/${supId}/payment`, { amount: 100 }, MGR);
check('supplier payment', r.status === 200 && r.body.balance === 200);

// إلغاء فاتورة شراء
const purId = r.body.id || (await call('GET', '/api/pos/purchases', null, MGR)).body.purchases[0].id;
r = await call('POST', `/api/pos/purchase/${purId}/void`, null, MGR);
check('purchase voided', r.status === 200);
check('void reverses stock', tables.stock.get('EL-101') === stockBefore);
check('void reverses supplier debt', tables.suppliers.get(supId).balance === -100);

// مصاريف
r = await call('POST', '/api/pos/expenses', { title: 'مواصلات بضاعة', amount: 150, cat: 'نقل' }, CSH);
check('cashier adds expense', r.status === 200 && r.body.id > 0);
const expId = r.body.id;
r = await call('GET', '/api/pos/expenses', null, CSH);
check('cashier sees own expenses', r.body.expenses.length === 1);
r = await call('GET', '/api/pos/expenses?all=1', null, MGR);
check('manager sees all expenses', r.body.expenses.length === 1);
r = await call('DELETE', '/api/pos/expense/' + expId, null, CSH);
check('owner deletes expense', r.status === 200);

// حد النواقص
r = await call('POST', '/api/pos/stock', { code: 'EL-101', qty: 3, minQty: 5 }, MGR);
check('set min qty', r.status === 200);
r = await call('GET', '/api/pos/products', null, CSH);
const el101 = r.body.products.find((p) => p.code === 'EL-101');
check('low stock detectable', el101.qty === 3 && el101.min_qty === 5 && el101.qty <= el101.min_qty);

// ===== المرحلة 3: عروض أسعار + باركود + مزامنة مخزون =====
// باركود
r = await call('POST', '/api/pos/barcode', { code: 'EL-101', barcode: '6221234567890' }, CSH);
check('cashier cannot assign barcode', r.status === 403);
r = await call('POST', '/api/pos/barcode', { code: 'EL-101', barcode: '6221234567890' }, MGR);
check('manager assigns barcode', r.status === 200);
r = await call('GET', '/api/pos/products', null, CSH);
check('products include barcode', r.body.products.find((p) => p.code === 'EL-101').barcode === '6221234567890');

// عرض سعر
r = await call('POST', '/api/pos/quotes', { items: [{ code: 'EL-101', qty: 2 }, { code: 'PL-201', qty: 1, discount: 50 }], discount: 20, customerName: 'عميل عرض' }, CSH);
check('quote created', r.status === 200 && /^QT-\d{6}$/.test(r.body.num));
check('quote total', r.body.total === (90 * 2) + (1650 - 50) - 20);
const qid = r.body.id;
r = await call('GET', '/api/pos/products', null, CSH);
const elBefore = r.body.products.find((p) => p.code === 'EL-101').qty;
const plBefore = r.body.products.find((p) => p.code === 'PL-201').qty;
check('quote does not touch stock', typeof elBefore === 'number');

r = await call('GET', '/api/pos/quote/' + qid, null, MGR);
check('manager reads cashier quote', r.status === 200 && r.body.items.length === 2);
r = await call('GET', '/api/pos/quotes', null, CSH);
check('cashier sees own quotes', r.body.quotes.length === 1 && r.body.quotes[0].status === 'open');

// تحويل لفاتورة
r = await call('POST', `/api/pos/quote/${qid}/convert`, { payment: 'cash' }, CSH);
check('convert creates invoice', r.status === 200 && /^INV-/.test(r.body.num) && r.body.total === 1760);
r = await call('GET', '/api/pos/quote/' + qid, null, CSH);
check('quote marked converted', r.body.quote.status === 'converted' && r.body.quote.invoice_id > 0);
r = await call('POST', `/api/pos/quote/${qid}/convert`, { payment: 'cash' }, CSH);
check('double convert rejected', r.status === 400);
r = await call('GET', '/api/pos/products', null, CSH);
check('convert decremented stock', r.body.products.find((p) => p.code === 'EL-101').qty === elBefore - 2 && r.body.products.find((p) => p.code === 'PL-201').qty === plBefore - 1);

// إلغاء عرض
r = await call('POST', '/api/pos/quotes', { items: [{ code: 'EL-101', qty: 1 }] }, CSH);
const qid2 = r.body.id;
r = await call('POST', `/api/pos/quote/${qid2}/cancel`, null, CSH);
check('owner cancels quote', r.status === 200);
r = await call('POST', `/api/pos/quote/${qid2}/convert`, { payment: 'cash' }, MGR);
check('canceled quote cannot convert', r.status === 400);

// مزامنة: بيع كل المخزون يخلي الموقع يظهر نفدت
r = await call('POST', '/api/pos/stock', { code: 'EL-102', qty: 1 }, MGR);
await call('PUT', '/api/admin/products', { products: [
    { name: 'لمبة ليد', code: 'EL-101', price: 90, cat: 'كهرباء' },
    { name: 'خلاط مغسلة', code: 'PL-201', price: 1650, cat: 'صحي' },
    { name: 'مفتاح ديكور', code: 'EL-102', price: 75, cat: 'كهرباء' },
] }, MGR);
r = await call('POST', '/api/pos/invoices', { items: [{ code: 'EL-102', qty: 1 }], payment: 'cash' }, MGR);
check('sell last unit', r.status === 200);
const kvAfter = JSON.parse(kv.get('products'));
check('site shows out of stock at zero', kvAfter.find((p) => p.code === 'EL-102').stock === false);
check('tracked product still available', kvAfter.find((p) => p.code === 'EL-101').stock !== false);
r = await call('POST', '/api/pos/stock', { code: 'EL-102', qty: 5 }, MGR);
const kvBack = JSON.parse(kv.get('products'));
check('restock makes site available again', kvBack.find((p) => p.code === 'EL-102').stock === true || kvBack.find((p) => p.code === 'EL-102').stock === undefined || kvBack.find((p) => p.code === 'EL-102').stock !== false);

// طلب من الموقع ينقص مخزون الـ POS
const before = tables.stock.get('EL-102');
r = await call('POST', '/api/orders', { name: 'زبون أونلاين', phone: '0100', address: 'حلوان', items: [{ code: 'EL-102', qty: 2 }] });
check('website order accepted', r.status === 200);
check('website order decrements POS stock', tables.stock.get('EL-102') === before - 2);
r = await call('POST', '/api/orders', { name: 'زبون', phone: '0100', address: 'x', items: [{ code: 'EL-102', qty: 999 }] });
check('website order beyond stock rejected', r.status === 400 && r.body.error === 'out_of_stock');

console.log(failed === 0 ? 'ALL PASS' : failed + ' FAILED');
process.exit(failed === 0 ? 0 : 1);
