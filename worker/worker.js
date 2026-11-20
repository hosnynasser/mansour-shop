// MANSOUR shop backend — Cloudflare Worker + KV (free tier)
// Bindings: SHOP_KV (KV namespace), secret ADMIN_CODE (master passcode)
// Routes:
//   GET  /api/products              public  -> {products:[...]} (404 if none saved yet)
//   GET  /api/site                  public  -> {site:{...}} (404 if none saved yet)
//   GET  /api/media/<id>            public  -> binary image/video (long cache)
//   POST /api/orders                public  -> {ok:true,id,total} (total recomputed server-side)
//   GET  /api/admin/orders          admin   -> {orders:[...]}
//   POST /api/admin/orders/status   admin   {id,status}
//   GET  /api/admin/products        admin   -> {products:[...],custom:bool}
//   PUT  /api/admin/products        admin   {products:[...]} -> {ok:true}
//   PUT  /api/admin/site            admin   {site:{...}} -> {ok:true}
//   POST /api/admin/media           admin   {data:base64,type:mime} -> {ok,id}
//   GET  /api/admin/admins          admin   -> {admins:[{user}]}
//   POST /api/admin/admins          admin   {user,pass} -> add admin
//   POST /api/admin/admins/update   admin   {user,newUser,newPass} -> rename / change password
//   POST /api/admin/admins/delete   admin   {user} -> delete admin
//
// Auth: header X-Admin-Code is either the master code (env.ADMIN_CODE)
// or "<username>:<password>" of an admin stored in KV (sha256 hashed).

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Code',
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
    });
}

const clean = (s, max = 200) => String(s ?? '').trim().slice(0, max);

async function sha256(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function getAdmins(env) {
    const raw = await env.SHOP_KV.get('admins');
    if (!raw) return [];
    try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

// يرجع {user, role} أو null. role: 'manager' | 'cashier' — الحسابات القديمة من غير role تعتبر مدير
async function staffAuth(request, env) {
    const h = request.headers.get('X-Admin-Code') || '';
    if (!h) return null;
    if (env.ADMIN_CODE && h === env.ADMIN_CODE) return { user: 'master', role: 'manager' };
    const i = h.indexOf(':');
    if (i > 0) {
        const user = clean(h.slice(0, i), 40);
        const pass = h.slice(i + 1).slice(0, 100);
        if (!user || !pass) return null;
        // الكود الرئيسي كباسورد مع أي اسم مستخدم = مدير
        if (env.ADMIN_CODE && pass === env.ADMIN_CODE) return { user, role: 'manager' };
        const hash = await sha256(pass);
        const admins = await getAdmins(env);
        const a = admins.find((x) => x.user === user && x.hash === hash);
        if (a) return { user: a.user, role: a.role === 'cashier' ? 'cashier' : 'manager' };
    }
    return null;
}

async function isAdmin(request, env) {
    return (await staffAuth(request, env)) !== null;
}

// Default catalog: matches the site's embedded list so orders work before the first admin save
const EMBEDDED_PRODUCTS = [
    { name: 'لمبة ليد 12 وات', desc: 'إضاءة بيضاء، قاعدة E27', price: 90, code: 'EL-101', cat: 'كهرباء' },
    { name: 'مفتاح ديكور فردي', desc: 'أبيض مطفي', price: 75, code: 'EL-102', cat: 'كهرباء' },
    { name: 'بريزة ديكور ثلاثية', desc: 'أبيض مطفي', price: 85, code: 'EL-103', cat: 'كهرباء' },
    { name: 'قاطع أوتوماتيك 32 أمبير', desc: 'قطع أحادي', price: 240, code: 'EL-104', cat: 'كهرباء' },
    { name: 'سلك نحاس 2.5 مم', desc: 'اللفة 100 متر', price: 4800, code: 'EL-105', cat: 'كهرباء' },
    { name: 'مثقاب كهربائي 750 وات', desc: 'سرعات، ظبط وقفل', price: 2400, code: 'EL-106', cat: 'كهرباء' },
    { name: 'مشترك كهرباء 5 مخارج', desc: 'بمفتاح وسلك 3 متر', price: 180, code: 'EL-107', cat: 'كهرباء' },
    { name: 'كشاف طوارئ ليد', desc: 'برأسين، شحن', price: 350, code: 'EL-108', cat: 'كهرباء' },
    { name: 'حساس حركة سقف', desc: 'للإضاءة التلقائية', price: 220, code: 'EL-109', cat: 'كهرباء' },
    { name: 'خلاط مغسلة كروم', desc: 'ذراع واحدة', price: 1650, code: 'PL-201', cat: 'أدوات صحية' },
    { name: 'خلاط دش كامل', desc: 'كروم، بسماعة يد', price: 2400, code: 'PL-202', cat: 'أدوات صحية' },
    { name: 'رأس دش مطري', desc: 'كروم، مقاس كبير', price: 950, code: 'PL-203', cat: 'أدوات صحية' },
    { name: 'خرطوم مرن للخلاط', desc: 'ستانلس، 60 سم', price: 110, code: 'PL-204', cat: 'أدوات صحية' },
    { name: 'ماسورة PVC 2 بوصة', desc: 'الطول 4 متر', price: 140, code: 'PL-205', cat: 'أدوات صحية' },
    { name: 'طقم وصلات PVC', desc: 'كوع + تيه + جلبة', price: 45, code: 'PL-206', cat: 'أدوات صحية' },
    { name: 'محبس زاوية كروم', desc: 'نص بوصة', price: 95, code: 'PL-207', cat: 'أدوات صحية' },
    { name: 'سيفون حوض بلاستيك', desc: 'كامل بالوصلة', price: 180, code: 'PL-208', cat: 'أدوات صحية' },
    { name: 'شريط تفلون', desc: 'لعزل السنون', price: 15, code: 'PL-209', cat: 'أدوات صحية' },
];

async function getProducts(env) {
    const raw = await env.SHOP_KV.get('products');
    if (!raw) return null;
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : null; } catch { return null; }
}

function validProduct(p) {
    return p && typeof p.name === 'string' && p.name.trim() &&
        typeof p.code === 'string' && p.code.trim() &&
        typeof p.price === 'number' && isFinite(p.price) && p.price >= 0 &&
        (p.cat === 'كهرباء' || p.cat === 'أدوات صحية');
}

const okMediaRef = (v) => typeof v === 'string' && (/^m-[A-Za-z0-9]{6,40}$/.test(v) || /^https:\/\//.test(v));

function sanitizeProduct(p) {
    const images = Array.isArray(p.images) ? p.images.filter(okMediaRef).slice(0, 6) : [];
    return {
        name: clean(p.name, 120),
        desc: clean(p.desc, 300),
        price: Math.round(p.price * 100) / 100,
        code: clean(p.code, 40),
        cat: p.cat,
        stock: p.stock === false ? false : true,
        imgUrl: typeof p.imgUrl === 'string' && /^https:\/\//.test(p.imgUrl) ? p.imgUrl.slice(0, 500) : '',
        images,
        video: okMediaRef(p.video) ? p.video : '',
    };
}

const SITE_FIELDS = ['phone', 'phone2', 'whatsapp', 'address', 'hours'];

async function getSite(env) {
    const raw = await env.SHOP_KV.get('site');
    if (!raw) return null;
    try { const s = JSON.parse(raw); return s && typeof s === 'object' ? s : null; } catch { return null; }
}

function sanitizeSite(s) {
    const out = {};
    for (const f of SITE_FIELDS) {
        const v = clean(s[f], f === 'address' ? 300 : 120);
        if (v) out[f] = v;
    }
    return out;
}

function b64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

async function handle(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    // ---- public: products ----
    if (path === '/api/products' && request.method === 'GET') {
        const products = await getProducts(env);
        if (!products) return json({ error: 'no_products' }, 404);
        return json({ products });
    }

    // ---- public: site settings ----
    if (path === '/api/site' && request.method === 'GET') {
        const site = await getSite(env);
        if (!site) return json({ error: 'no_site' }, 404);
        return json({ site });
    }

    // ---- public: media ----
    if (path.startsWith('/api/media/') && request.method === 'GET') {
        const id = path.slice('/api/media/'.length);
        if (!/^m-[A-Za-z0-9]{6,40}$/.test(id)) return json({ error: 'bad_id' }, 400);
        const raw = await env.SHOP_KV.get('media:' + id);
        if (!raw) return json({ error: 'not_found' }, 404);
        let rec;
        try { rec = JSON.parse(raw); } catch { return json({ error: 'bad_media' }, 500); }
        return new Response(b64ToBytes(rec.data), {
            status: 200,
            headers: {
                'Content-Type': rec.type,
                'Cache-Control': 'public, max-age=31536000, immutable',
                ...CORS,
            },
        });
    }

    // ---- public: place order ----
    if (path === '/api/orders' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const name = clean(body.name, 120);
        const phone = clean(body.phone, 30);
        const address = clean(body.address, 400);
        const items = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
        if (!name || !phone || !address) return json({ error: 'missing_customer' }, 400);
        if (!items.length) return json({ error: 'empty_order' }, 400);

        const catalog = (await getProducts(env)) || EMBEDDED_PRODUCTS;
        const byCode = new Map(catalog.map((p) => [p.code, p]));
        const lines = [];
        for (const it of items) {
            const p = byCode.get(clean(it.code, 40));
            const qty = Math.max(1, Math.min(999, parseInt(it.qty, 10) || 1));
            if (!p) return json({ error: 'unknown_product', code: clean(it.code, 40) }, 400);
            if (p.stock === false) return json({ error: 'out_of_stock', code: p.code }, 400);
            lines.push({ name: p.name, code: p.code, price: p.price, qty, lineTotal: Math.round(p.price * qty * 100) / 100 });
        }
        const total = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
        const id = 'MN-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
        // خصم مخزون الـ POS للأصناف المتتبعة (لو قاعدة البيانات متاحة)
        if (env.POS_DB) {
            const { results: stockRows } = await env.POS_DB.prepare('SELECT code FROM stock').all();
            const tracked = new Set((stockRows || []).map((r) => r.code));
            const dec = lines.filter((l) => tracked.has(l.code));
            if (dec.length) {
                const stmts = dec.map((l) => env.POS_DB.prepare('UPDATE stock SET qty = qty - ? WHERE code = ? AND qty >= ?').bind(l.qty, l.code, l.qty));
                const results = await env.POS_DB.batch(stmts);
                for (let i = 0; i < dec.length; i++) {
                    if ((results[i].meta?.changes ?? 0) === 0) return json({ error: 'out_of_stock', code: dec[i].code }, 400);
                }
            }
        }
        const order = { id, ts: new Date().toISOString(), status: 'new', customer: { name, phone, address }, lines, total };
        await env.SHOP_KV.put('order:' + id, JSON.stringify(order));
        const idxRaw = await env.SHOP_KV.get('orders:index');
        let idx = [];
        try { idx = idxRaw ? JSON.parse(idxRaw) : []; } catch { idx = []; }
        idx.unshift(id);
        await env.SHOP_KV.put('orders:index', JSON.stringify(idx.slice(0, 500)));
        if (env.POS_DB) await syncStockFlags(env);
        return json({ ok: true, id, total });
    }

    // ---- POS (كاشير) ----
    if (path.startsWith('/api/pos/')) {
        if (!env.POS_DB) return json({ error: 'pos_not_ready' }, 503);
        return handlePos(request, env, path);
    }

    // ---- admin (all routes below require auth) ----
    if (path.startsWith('/api/admin/')) {
        if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);

        if (path === '/api/admin/orders' && request.method === 'GET') {
            const idxRaw = await env.SHOP_KV.get('orders:index');
            let idx = [];
            try { idx = idxRaw ? JSON.parse(idxRaw) : []; } catch { idx = []; }
            const orders = [];
            for (const id of idx.slice(0, 100)) {
                const raw = await env.SHOP_KV.get('order:' + id);
                if (raw) { try { orders.push(JSON.parse(raw)); } catch { /* skip */ } }
            }
            return json({ orders });
        }

        if (path === '/api/admin/orders/status' && request.method === 'POST') {
            let body;
            try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
            const id = clean(body.id, 60);
            const status = ['new', 'preparing', 'done'].includes(body.status) ? body.status : 'new';
            const raw = await env.SHOP_KV.get('order:' + id);
            if (!raw) return json({ error: 'not_found' }, 404);
            const order = JSON.parse(raw);
            order.status = status;
            await env.SHOP_KV.put('order:' + id, JSON.stringify(order));
            return json({ ok: true });
        }

        if (path === '/api/admin/products' && request.method === 'GET') {
            const products = await getProducts(env);
            return json({ products: products || [], custom: !!products });
        }

        if (path === '/api/admin/products' && request.method === 'PUT') {
            let body;
            try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
            const list = Array.isArray(body.products) ? body.products : null;
            if (!list || !list.length || list.length > 500) return json({ error: 'bad_products' }, 400);
            if (!list.every(validProduct)) return json({ error: 'invalid_product' }, 400);
            const codes = new Set(list.map((p) => p.code.trim()));
            if (codes.size !== list.length) return json({ error: 'duplicate_code' }, 400);
            await env.SHOP_KV.put('products', JSON.stringify(list.map(sanitizeProduct)));
            return json({ ok: true, count: list.length });
        }

        if (path === '/api/admin/site' && request.method === 'PUT') {
            let body;
            try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
            const site = sanitizeSite(body.site || {});
            if (!site.phone || !site.address) return json({ error: 'missing_fields' }, 400);
            await env.SHOP_KV.put('site', JSON.stringify(site));
            return json({ ok: true });
        }

        if (path === '/api/admin/media' && request.method === 'POST') {
            let body;
            try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
            const type = clean(body.type, 60);
            const data = typeof body.data === 'string' ? body.data : '';
            const isImage = /^image\/(jpeg|png|webp|gif)$/.test(type);
            const isVideo = /^video\/(mp4|webm|quicktime)$/.test(type);
            if (!isImage && !isVideo) return json({ error: 'bad_type' }, 400);
            const maxB64 = isVideo ? 24000000 : 4000000; // ~18MB / ~3MB raw (KV value cap 25 MiB)
            if (!data || data.length > maxB64) return json({ error: 'too_big' }, 400);
            if (!/^[A-Za-z0-9+/=]+$/.test(data)) return json({ error: 'bad_data' }, 400);
            const id = 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
            await env.SHOP_KV.put('media:' + id, JSON.stringify({ type, data }));
            return json({ ok: true, id });
        }

        if (path === '/api/admin/admins' && request.method === 'GET') {
            const admins = await getAdmins(env);
            return json({ admins: admins.map((a) => ({ user: a.user, role: a.role === 'cashier' ? 'cashier' : 'manager' })) });
        }

        if (path === '/api/admin/admins' && request.method === 'POST') {
            let body;
            try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
            const user = clean(body.user, 40);
            const pass = String(body.pass ?? '');
            const role = body.role === 'cashier' ? 'cashier' : 'manager';
            if (user.length < 3 || pass.length < 6 || pass.length > 100) return json({ error: 'bad_fields' }, 400);
            if (user.includes(':')) return json({ error: 'bad_fields' }, 400);
            const admins = await getAdmins(env);
            if (admins.length >= 10) return json({ error: 'too_many' }, 400);
            if (admins.some((a) => a.user === user)) return json({ error: 'user_exists' }, 400);
            admins.push({ user, hash: await sha256(pass), role });
            await env.SHOP_KV.put('admins', JSON.stringify(admins));
            return json({ ok: true });
        }

        if (path === '/api/admin/admins/update' && request.method === 'POST') {
            let body;
            try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
            const user = clean(body.user, 40);
            const newUser = clean(body.newUser, 40);
            const newPass = String(body.newPass ?? '');
            const admins = await getAdmins(env);
            const a = admins.find((x) => x.user === user);
            if (!a) return json({ error: 'not_found' }, 404);
            if (newUser && newUser !== user) {
                if (newUser.length < 3 || newUser.includes(':')) return json({ error: 'bad_fields' }, 400);
                if (admins.some((x) => x.user === newUser)) return json({ error: 'user_exists' }, 400);
                a.user = newUser;
            }
            if (newPass) {
                if (newPass.length < 6 || newPass.length > 100) return json({ error: 'bad_fields' }, 400);
                a.hash = await sha256(newPass);
            }
            if (body.newRole === 'cashier' || body.newRole === 'manager') a.role = body.newRole;
            await env.SHOP_KV.put('admins', JSON.stringify(admins));
            return json({ ok: true });
        }

        if (path === '/api/admin/admins/delete' && request.method === 'POST') {
            let body;
            try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
            const user = clean(body.user, 40);
            const admins = await getAdmins(env);
            const next = admins.filter((a) => a.user !== user);
            if (next.length === admins.length) return json({ error: 'not_found' }, 404);
            if (next.length === 0) return json({ error: 'last_admin' }, 400);
            await env.SHOP_KV.put('admins', JSON.stringify(next));
            return json({ ok: true });
        }

        return json({ error: 'not_found' }, 404);
    }

    return json({ error: 'not_found' }, 404);
}

export default {
    fetch(request, env) {
        return handle(request, env).catch(() => json({ error: 'server_error' }, 500));
    },
};

// ================= POS / الكاشير (بياناته في D1: POS_DB) =================
const PAYMENTS = ['cash', 'vcash', 'debt'];

async function getCatalog(env) {
    return (await getProducts(env)) || EMBEDDED_PRODUCTS;
}

async function posProducts(env) {
    const catalog = await getCatalog(env);
    const { results } = await env.POS_DB.prepare('SELECT code, qty, barcode, cost, min_qty FROM stock').all();
    const info = new Map((results || []).map((r) => [r.code, r]));
    return catalog.map((p) => ({ name: p.name, code: p.code, price: p.price, cat: p.cat, stock: p.stock !== false, qty: info.get(p.code)?.qty ?? 0, barcode: info.get(p.code)?.barcode || '', cost: info.get(p.code)?.cost ?? 0, min_qty: info.get(p.code)?.min_qty ?? 5 }));
}

async function handlePos(request, env, path) {
    const staff = await staffAuth(request, env);
    if (!staff) return json({ error: 'unauthorized' }, 401);
    const manager = staff.role === 'manager';

    if (path === '/api/pos/me' && request.method === 'GET') {
        return json({ user: staff.user, role: staff.role });
    }

    if (path === '/api/pos/products' && request.method === 'GET') {
        return json({ products: await posProducts(env) });
    }

    // ضبط رصيد صنف (مدير فقط)
    if (path === '/api/pos/stock' && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const code = clean(body.code, 40);
        const qty = Math.max(0, Math.min(1000000, parseInt(body.qty, 10) || 0));
        const minQty = body.minQty !== undefined ? Math.max(0, Math.min(100000, parseInt(body.minQty, 10) || 0)) : null;
        if (!code) return json({ error: 'bad_fields' }, 400);
        if (minQty !== null) {
            await env.POS_DB.prepare('INSERT INTO stock (code, qty, min_qty) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET qty = excluded.qty, min_qty = excluded.min_qty').bind(code, qty, minQty).run();
        } else {
            await env.POS_DB.prepare('INSERT INTO stock (code, qty) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET qty = excluded.qty').bind(code, qty).run();
        }
        await syncStockFlags(env);
        return json({ ok: true, code, qty, min_qty: minQty });
    }

    // إنشاء فاتورة بيع
    if (path === '/api/pos/invoices' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const r = await createInvoiceCore(env, staff.user, body);
        if (r.error) return json(r, r.status);
        return json(r);
    }

    // قائمة الفواتير (الكاشير يشوف فواتيره بس، المدير يشوف الكل)
    if (path === '/api/pos/invoices' && request.method === 'GET') {
        const url = new URL(request.url);
        const date = clean(url.searchParams.get('date'), 10); // YYYY-MM-DD (يوم القاهرة بيتحسب في الواجهة)
        const all = manager && url.searchParams.get('all') === '1';
        let sql = "SELECT id, num, ts, staff, payment, subtotal, discount, total, status, customer_name, customer_phone FROM invoices WHERE status != 'pending'";
        const args = [];
        if (!manager || !all) { sql += ' AND staff = ?'; args.push(staff.user); }
        if (date) { sql += ' AND day = ?'; args.push(date); }
        sql += ' ORDER BY id DESC LIMIT 200';
        const { results } = await env.POS_DB.prepare(sql).bind(...args).all();
        return json({ invoices: results || [] });
    }

    // فاتورة واحدة بالأصناف
    if (path.startsWith('/api/pos/invoice/') && request.method === 'GET') {
        const id = parseInt(path.slice('/api/pos/invoice/'.length), 10) || 0;
        const inv = await env.POS_DB.prepare("SELECT * FROM invoices WHERE id = ? AND status != 'pending'").bind(id).first();
        if (!inv) return json({ error: 'not_found' }, 404);
        if (!manager && inv.staff !== staff.user) return json({ error: 'forbidden' }, 403);
        const { results: items } = await env.POS_DB.prepare('SELECT code, name, price, qty, discount, line_total FROM invoice_items WHERE invoice_id = ?').bind(id).all();
        return json({ invoice: inv, items: items || [] });
    }

    // إلغاء فاتورة (مدير فقط) مع رجعة المخزون
    if (path.startsWith('/api/pos/invoice/') && path.endsWith('/void') && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const id = parseInt(path.slice('/api/pos/invoice/'.length, -'/void'.length), 10) || 0;
        const inv = await env.POS_DB.prepare('SELECT id, status FROM invoices WHERE id = ?').bind(id).first();
        if (!inv) return json({ error: 'not_found' }, 404);
        if (inv.status === 'voided') return json({ error: 'already_voided' }, 400);
        const { results: items } = await env.POS_DB.prepare('SELECT code, qty FROM invoice_items WHERE invoice_id = ?').bind(id).all();
        const stmts = (items || []).map((l) => env.POS_DB.prepare('INSERT INTO stock (code, qty) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET qty = qty + excluded.qty').bind(l.code, l.qty));
        stmts.push(env.POS_DB.prepare("UPDATE invoices SET status = 'voided' WHERE id = ?").bind(id));
        stmts.push(env.POS_DB.prepare("DELETE FROM ledger WHERE invoice_id = ? AND kind = 'charge'").bind(id));
        await env.POS_DB.batch(stmts);
        await syncStockFlags(env);
        return json({ ok: true });
    }

    // تقفيلة اليوم لكل موظف (الكاشير يشوف بتاعته بس)
    if (path === '/api/pos/close' && request.method === 'GET') {
        const url = new URL(request.url);
        const date = clean(url.searchParams.get('date'), 10);
        if (!date) return json({ error: 'missing_date' }, 400);
        let sql = "SELECT staff, COUNT(*) AS count, SUM(total) AS total, SUM(CASE WHEN payment = 'cash' THEN total ELSE 0 END) AS cash_total, SUM(CASE WHEN payment = 'vcash' THEN total ELSE 0 END) AS vcash_total FROM invoices WHERE status = 'completed' AND day = ?";
        const args = [date];
        if (!manager) { sql += ' AND staff = ?'; args.push(staff.user); }
        sql += ' GROUP BY staff ORDER BY total DESC';
        const { results } = await env.POS_DB.prepare(sql).bind(...args).all();
        return json({ date, rows: results || [] });
    }


    // ---- العملاء والمديونيات ----
    if (path === '/api/pos/customers' && request.method === 'GET') {
        const { results } = await env.POS_DB.prepare("SELECT c.id, c.name, c.phone, c.notes, COALESCE((SELECT SUM(CASE WHEN l.kind = 'charge' THEN l.amount ELSE -l.amount END) FROM ledger l WHERE l.customer_id = c.id), 0) AS balance FROM customers c ORDER BY c.name").all();
        return json({ customers: results || [] });
    }

    if (path === '/api/pos/customers' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const name = clean(body.name, 120);
        if (name.length < 2) return json({ error: 'bad_fields' }, 400);
        const r = await env.POS_DB.prepare('INSERT INTO customers (name, phone, notes, created_at) VALUES (?, ?, ?, ?)')
            .bind(name, clean(body.phone, 30), clean(body.notes, 500), new Date().toISOString()).run();
        return json({ ok: true, id: r.meta.last_row_id });
    }

    if (path === '/api/pos/customers' && request.method === 'PATCH') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const url = new URL(request.url);
        const id = parseInt(url.searchParams.get('id'), 10) || 0;
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const name = clean(body.name, 120);
        if (!id || name.length < 2) return json({ error: 'bad_fields' }, 400);
        await env.POS_DB.prepare('UPDATE customers SET name = ?, phone = ?, notes = ? WHERE id = ?')
            .bind(name, clean(body.phone, 30), clean(body.notes, 500), id).run();
        return json({ ok: true });
    }

    if (path === '/api/pos/customers' && request.method === 'DELETE') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const url = new URL(request.url);
        const id = parseInt(url.searchParams.get('id'), 10) || 0;
        const cnt = await env.POS_DB.prepare('SELECT COUNT(*) AS n FROM ledger WHERE customer_id = ?').bind(id).first();
        if ((cnt?.n ?? 0) > 0) return json({ error: 'has_ledger' }, 400);
        await env.POS_DB.prepare('DELETE FROM customers WHERE id = ?').bind(id).run();
        return json({ ok: true });
    }

    // كارت عميل: بياناته + كشف حساب + فواتيره
    if (path.startsWith('/api/pos/customer/') && request.method === 'GET' && !path.endsWith('/payment')) {
        const id = parseInt(path.slice('/api/pos/customer/'.length), 10) || 0;
        const customer = await env.POS_DB.prepare('SELECT id, name, phone, notes FROM customers WHERE id = ?').bind(id).first();
        if (!customer) return json({ error: 'not_found' }, 404);
        const { results: ledger } = await env.POS_DB.prepare('SELECT id, ts, kind, amount, invoice_id, staff, note FROM ledger WHERE customer_id = ? ORDER BY id DESC LIMIT 100').bind(id).all();
        const bal = await env.POS_DB.prepare("SELECT COALESCE(SUM(CASE WHEN kind = 'charge' THEN amount ELSE -amount END), 0) AS b FROM ledger WHERE customer_id = ?").bind(id).first();
        const { results: invoices } = await env.POS_DB.prepare("SELECT id, num, ts, staff, payment, total, status FROM invoices WHERE customer_id = ? AND status != 'pending' ORDER BY id DESC LIMIT 50").bind(id).all();
        return json({ customer, ledger: ledger || [], balance: bal?.b ?? 0, invoices: invoices || [] });
    }

    // تسجيل دفعة من عميل (الكاشير يقدر — تحصيل فلوس شغلانه)
    if (path.startsWith('/api/pos/customer/') && path.endsWith('/payment') && request.method === 'POST') {
        const id = parseInt(path.slice('/api/pos/customer/'.length, -'/payment'.length), 10) || 0;
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const amount = Math.round((Number(body.amount) || 0) * 100) / 100;
        if (amount <= 0 || amount > 1e7) return json({ error: 'bad_amount' }, 400);
        const customer = await env.POS_DB.prepare('SELECT id FROM customers WHERE id = ?').bind(id).first();
        if (!customer) return json({ error: 'not_found' }, 404);
        const method = body.method === 'vcash' ? 'vcash' : 'cash';
        const ts = new Date().toISOString();
        let day = ts.slice(0, 10);
        try { day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch {}
        await env.POS_DB.prepare("INSERT INTO ledger (customer_id, ts, day, kind, amount, invoice_id, staff, note) VALUES (?, ?, ?, 'payment', ?, NULL, ?, ?)")
            .bind(id, ts, day, amount, staff.user, clean(body.note, 200)).run();
        const bal = await env.POS_DB.prepare("SELECT COALESCE(SUM(CASE WHEN kind = 'charge' THEN amount ELSE -amount END), 0) AS b FROM ledger WHERE customer_id = ?").bind(id).first();
        return json({ ok: true, balance: bal?.b ?? 0 });
    }

    // حذف قيد دفعة غلط (مدير فقط)
    if (path.startsWith('/api/pos/ledger/') && request.method === 'DELETE') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const id = parseInt(path.slice('/api/pos/ledger/'.length), 10) || 0;
        await env.POS_DB.prepare("DELETE FROM ledger WHERE id = ? AND kind = 'payment'").bind(id).run();
        return json({ ok: true });
    }

    // ---- التقارير (مدير فقط) ----
    if (path === '/api/pos/reports' && request.method === 'GET') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const url = new URL(request.url);
        const from = clean(url.searchParams.get('from'), 10);
        const to = clean(url.searchParams.get('to'), 10);
        if (!from || !to) return json({ error: 'missing_range' }, 400);
        const sum = await env.POS_DB.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(CASE WHEN payment = 'cash' THEN total ELSE 0 END), 0) AS cash_total, COALESCE(SUM(CASE WHEN payment = 'vcash' THEN total ELSE 0 END), 0) AS vcash_total, COALESCE(SUM(CASE WHEN payment = 'debt' THEN total ELSE 0 END), 0) AS debt_total, COALESCE(SUM(discount), 0) AS discounts FROM invoices WHERE status = 'completed' AND day >= ? AND day <= ?").bind(from, to).first();
        const { results: top } = await env.POS_DB.prepare("SELECT ii.name, ii.code, SUM(ii.qty) AS qty, SUM(ii.line_total) AS revenue FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE i.status = 'completed' AND i.day >= ? AND i.day <= ? GROUP BY ii.code ORDER BY revenue DESC LIMIT 10").bind(from, to).all();
        const { results: byStaff } = await env.POS_DB.prepare("SELECT staff, COUNT(*) AS count, SUM(total) AS total FROM invoices WHERE status = 'completed' AND day >= ? AND day <= ? GROUP BY staff ORDER BY total DESC").bind(from, to).all();
        const debts = await env.POS_DB.prepare("SELECT COALESCE(SUM(CASE WHEN kind = 'charge' THEN amount ELSE -amount END), 0) AS outstanding FROM ledger").first();
        const { results: topDebtors } = await env.POS_DB.prepare("SELECT c.id, c.name, c.phone, SUM(CASE WHEN l.kind = 'charge' THEN l.amount ELSE -l.amount END) AS balance FROM customers c JOIN ledger l ON l.customer_id = c.id GROUP BY c.id HAVING balance > 0 ORDER BY balance DESC LIMIT 10").all();
        const collected = await env.POS_DB.prepare("SELECT COALESCE(SUM(amount), 0) AS c FROM ledger WHERE kind = 'payment' AND day >= ? AND day <= ?").bind(from, to).first();
        return json({ from, to, summary: sum, top: top || [], byStaff: byStaff || [], debtsOutstanding: debts?.outstanding ?? 0, topDebtors: topDebtors || [], collectedInRange: collected?.c ?? 0 });
    }



    // ---- الموردين (مدير فقط) ----
    if (path === '/api/pos/suppliers' && request.method === 'GET') {
        const { results } = await env.POS_DB.prepare('SELECT id, name, phone, notes, balance FROM suppliers ORDER BY name LIMIT 500').all();
        return json({ suppliers: results || [] });
    }
    if (path === '/api/pos/suppliers' && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const name = clean(body.name, 120);
        if (name.length < 2) return json({ error: 'bad_name' }, 400);
        const r = await env.POS_DB.prepare('INSERT INTO suppliers (name, phone, notes, balance) VALUES (?, ?, ?, 0)').bind(name, clean(body.phone, 30), clean(body.notes, 400)).run();
        return json({ ok: true, id: r.meta.last_row_id });
    }
    if (path.startsWith('/api/pos/supplier/') && request.method === 'GET' && !path.endsWith('/payment')) {
        const id = parseInt(path.slice('/api/pos/supplier/'.length), 10) || 0;
        const sup = await env.POS_DB.prepare('SELECT * FROM suppliers WHERE id = ?').bind(id).first();
        if (!sup) return json({ error: 'not_found' }, 404);
        const { results: purchases } = await env.POS_DB.prepare('SELECT id, num, ts, total, paid, status FROM purchases WHERE supplier_id = ? ORDER BY id DESC LIMIT 50').bind(id).all();
        return json({ supplier: sup, purchases: purchases || [] });
    }
    if (path.startsWith('/api/pos/supplier/') && request.method === 'PATCH') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const id = parseInt(path.slice('/api/pos/supplier/'.length), 10) || 0;
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const name = clean(body.name, 120);
        if (name.length < 2) return json({ error: 'bad_name' }, 400);
        await env.POS_DB.prepare('UPDATE suppliers SET name = ?, phone = ?, notes = ? WHERE id = ?').bind(name, clean(body.phone, 30), clean(body.notes, 400), id).run();
        return json({ ok: true });
    }
    if (path.startsWith('/api/pos/supplier/') && request.method === 'DELETE') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const id = parseInt(path.slice('/api/pos/supplier/'.length), 10) || 0;
        const sup = await env.POS_DB.prepare('SELECT balance FROM suppliers WHERE id = ?').bind(id).first();
        if (!sup) return json({ error: 'not_found' }, 404);
        if (sup.balance !== 0) return json({ error: 'has_balance' }, 400);
        await env.POS_DB.prepare('DELETE FROM suppliers WHERE id = ?').bind(id).run();
        return json({ ok: true });
    }
    // تسديد دفعة لمورد
    if (path.startsWith('/api/pos/supplier/') && path.endsWith('/payment') && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const id = parseInt(path.slice('/api/pos/supplier/'.length, -'/payment'.length), 10) || 0;
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const amount = Math.round(Math.max(0, Math.min(1e9, Number(body.amount) || 0)) * 100) / 100;
        if (amount <= 0) return json({ error: 'bad_amount' }, 400);
        const sup = await env.POS_DB.prepare('SELECT id, balance FROM suppliers WHERE id = ?').bind(id).first();
        if (!sup) return json({ error: 'not_found' }, 404);
        const pay = Math.min(amount, sup.balance);
        const newBalance = Math.round((sup.balance - pay) * 100) / 100;
        await env.POS_DB.batch([
            env.POS_DB.prepare('UPDATE suppliers SET balance = balance - ? WHERE id = ?').bind(pay, id),
            env.POS_DB.prepare("INSERT INTO supplier_payments (ts, day, supplier_id, amount, staff, note) VALUES (?, ?, ?, ?, ?, '')").bind(new Date().toISOString(), cairoDay(), id, pay, staff.user),
        ]);
        return json({ ok: true, paid: pay, balance: newBalance });
    }

    // ---- فواتير شراء (بتزود المخزون أوتوماتيك) — مدير فقط ----
    if (path === '/api/pos/purchases' && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
        if (!items.length) return json({ error: 'empty_purchase' }, 400);
        const catalog = await getCatalog(env);
        const byCode = new Map(catalog.map((p) => [p.code, p]));
        const lines = [];
        for (const it of items) {
            const p = byCode.get(clean(it.code, 40));
            if (!p) return json({ error: 'unknown_product', code: clean(it.code, 40) }, 400);
            const qty = Math.max(1, Math.min(100000, parseInt(it.qty, 10) || 0));
            const cost = Math.max(0, Math.min(1e9, Number(it.cost) || 0));
            lines.push({ code: p.code, name: p.name, qty, cost: Math.round(cost * 100) / 100 });
        }
        const total = Math.round(lines.reduce((s, l) => s + l.cost * l.qty, 0) * 100) / 100;
        const paid = Math.max(0, Math.min(total, Number(body.paid) || 0));
        let supplierId = parseInt(body.supplierId, 10) || 0;
        let supplierName = '';
        if (supplierId) {
            const sup = await env.POS_DB.prepare('SELECT id, name FROM suppliers WHERE id = ?').bind(supplierId).first();
            if (!sup) return json({ error: 'unknown_supplier' }, 400);
            supplierName = sup.name;
        }
        const r = await env.POS_DB.prepare("INSERT INTO purchases (num, ts, day, staff, supplier_id, supplier_name, total, paid, status, note) VALUES ('', '', '', '', 0, '', 0, 0, 'completed', '')").run();
        const pid = r.meta.last_row_id;
        const num = 'PO-' + String(pid).padStart(6, '0');
        const ts = new Date().toISOString();
        const day = cairoDay();
        const stmts = lines.map((l) => env.POS_DB.prepare('INSERT INTO purchase_items (purchase_id, code, name, qty, cost) VALUES (?, ?, ?, ?, ?)').bind(pid, l.code, l.name, l.qty, l.cost));
        for (const l of lines) {
            stmts.push(env.POS_DB.prepare('INSERT INTO stock (code, qty, cost) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET qty = qty + excluded.qty, cost = excluded.cost').bind(l.code, l.qty, l.cost));
        }
        stmts.push(env.POS_DB.prepare('UPDATE purchases SET num = ?, ts = ?, day = ?, staff = ?, supplier_id = ?, supplier_name = ?, total = ?, paid = ?, note = ? WHERE id = ?')
            .bind(num, ts, day, staff.user, supplierId, supplierName, total, Math.round(paid * 100) / 100, clean(body.note, 300), pid));
        if (supplierId && total > paid) {
            stmts.push(env.POS_DB.prepare('UPDATE suppliers SET balance = balance + ? WHERE id = ?').bind(Math.round((total - paid) * 100) / 100, supplierId));
        }
        await env.POS_DB.batch(stmts);
        await syncStockFlags(env);
        return json({ ok: true, id: pid, num, ts, total, paid: Math.round(paid * 100) / 100, owed: Math.round((total - paid) * 100) / 100 });
    }
    if (path === '/api/pos/purchases' && request.method === 'GET') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const { results } = await env.POS_DB.prepare('SELECT id, num, ts, staff, supplier_id, supplier_name, total, paid, status, note FROM purchases ORDER BY id DESC LIMIT 200').all();
        return json({ purchases: results || [] });
    }
    if (path.startsWith('/api/pos/purchase/') && request.method === 'GET' && !path.endsWith('/void')) {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const id = parseInt(path.slice('/api/pos/purchase/'.length), 10) || 0;
        const p = await env.POS_DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first();
        if (!p) return json({ error: 'not_found' }, 404);
        const { results: items } = await env.POS_DB.prepare('SELECT code, name, qty, cost FROM purchase_items WHERE purchase_id = ?').bind(id).all();
        return json({ purchase: p, items: items || [] });
    }
    // إلغاء فاتورة شراء: بترجع المخزون والمديونية
    if (path.startsWith('/api/pos/purchase/') && path.endsWith('/void') && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const id = parseInt(path.slice('/api/pos/purchase/'.length, -'/void'.length), 10) || 0;
        const p = await env.POS_DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first();
        if (!p) return json({ error: 'not_found' }, 404);
        if (p.status === 'voided') return json({ error: 'already_voided' }, 400);
        const { results: items } = await env.POS_DB.prepare('SELECT code, qty FROM purchase_items WHERE purchase_id = ?').bind(id).all();
        // نتأكد إن المخزون يسمح بالخصم (الصنف ممكن يكون اتباع)
        for (const l of items || []) {
            const s = await env.POS_DB.prepare('SELECT qty FROM stock WHERE code = ?').bind(l.code).first();
            if (!s || s.qty < l.qty) return json({ error: 'stock_too_low', code: l.code }, 400);
        }
        const stmts = (items || []).map((l) => env.POS_DB.prepare('UPDATE stock SET qty = qty - ? WHERE code = ?').bind(l.qty, l.code));
        stmts.push(env.POS_DB.prepare("UPDATE purchases SET status = 'voided' WHERE id = ?").bind(id));
        if (p.supplier_id && p.total > p.paid) {
            stmts.push(env.POS_DB.prepare('UPDATE suppliers SET balance = balance - ? WHERE id = ?').bind(p.total - p.paid, p.supplier_id));
        }
        await env.POS_DB.batch(stmts);
        await syncStockFlags(env);
        return json({ ok: true });
    }

    // ---- المصاريف اليومية ----
    if (path === '/api/pos/expenses' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const title = clean(body.title, 120);
        const amount = Math.round(Math.max(0, Math.min(1e9, Number(body.amount) || 0)) * 100) / 100;
        if (title.length < 2 || amount <= 0) return json({ error: 'bad_fields' }, 400);
        const day = cairoDay();
        const r = await env.POS_DB.prepare('INSERT INTO expenses (ts, day, title, amount, cat, staff, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(new Date().toISOString(), day, title, amount, clean(body.cat, 40) || 'عام', staff.user, clean(body.note, 300)).run();
        return json({ ok: true, id: r.meta.last_row_id });
    }
    if (path === '/api/pos/expenses' && request.method === 'GET') {
        const url = new URL(request.url);
        const date = clean(url.searchParams.get('date'), 10);
        const all = manager && url.searchParams.get('all') === '1';
        let sql = 'SELECT id, ts, day, title, amount, cat, staff, note FROM expenses WHERE 1=1';
        const args = [];
        if (!manager || !all) { sql += ' AND staff = ?'; args.push(staff.user); }
        if (date) { sql += ' AND day = ?'; args.push(date); }
        sql += ' ORDER BY id DESC LIMIT 200';
        const { results } = await env.POS_DB.prepare(sql).bind(...args).all();
        return json({ expenses: results || [] });
    }
    if (path.startsWith('/api/pos/expense/') && request.method === 'DELETE') {
        const id = parseInt(path.slice('/api/pos/expense/'.length), 10) || 0;
        const ex = await env.POS_DB.prepare('SELECT id, staff FROM expenses WHERE id = ?').bind(id).first();
        if (!ex) return json({ error: 'not_found' }, 404);
        if (!manager && ex.staff !== staff.user) return json({ error: 'forbidden' }, 403);
        await env.POS_DB.prepare('DELETE FROM expenses WHERE id = ?').bind(id).run();
        return json({ ok: true });
    }

    // ---- الشيكات الآجلة (مدير فقط) ----
    if (path === '/api/pos/cheques' && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const kind = body.kind === 'out' ? 'out' : 'in';
        const amount = Math.round(Math.max(0, Math.min(1e9, Number(body.amount) || 0)) * 100) / 100;
        const dueDay = clean(body.dueDay, 10);
        if (amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dueDay)) return json({ error: 'bad_fields' }, 400);
        let party = clean(body.party, 120);
        let customerId = 0, supplierId = 0;
        if (kind === 'in' && body.customerId) {
            const c = await env.POS_DB.prepare('SELECT id, name FROM customers WHERE id = ?').bind(parseInt(body.customerId, 10) || 0).first();
            if (!c) return json({ error: 'unknown_customer' }, 400);
            customerId = c.id; party = party || c.name;
        }
        if (kind === 'out' && body.supplierId) {
            const s = await env.POS_DB.prepare('SELECT id, name FROM suppliers WHERE id = ?').bind(parseInt(body.supplierId, 10) || 0).first();
            if (!s) return json({ error: 'unknown_supplier' }, 400);
            supplierId = s.id; party = party || s.name;
        }
        if (party.length < 2) return json({ error: 'bad_party' }, 400);
        const r = await env.POS_DB.prepare("INSERT INTO cheques (ts, day, kind, party, customer_id, supplier_id, number, bank, amount, due_day, status, note, staff) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)")
            .bind(new Date().toISOString(), cairoDay(), kind, party, customerId, supplierId, clean(body.number, 40), clean(body.bank, 60), amount, dueDay, clean(body.note, 300), staff.user).run();
        return json({ ok: true, id: r.meta.last_row_id });
    }
    if (path === '/api/pos/cheques' && request.method === 'GET') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const { results } = await env.POS_DB.prepare("SELECT * FROM cheques ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, due_day ASC, id DESC LIMIT 300").all();
        const today = cairoDay();
        const soon = new Date(Date.now() + 3 * 86400000);
        let soonDay = today;
        try { soonDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(soon); } catch {}
        const pend = (results || []).filter((c) => c.status === 'pending');
        const sum = (arr) => Math.round(arr.reduce((s, c) => s + c.amount, 0) * 100) / 100;
        const overdue = pend.filter((c) => c.due_day < today);
        const dueSoon = pend.filter((c) => c.due_day >= today && c.due_day <= soonDay);
        return json({
            cheques: results || [], today,
            alerts: { overdue: overdue.length, dueSoon: dueSoon.length, count: overdue.length + dueSoon.length },
            totals: { pendingIn: sum(pend.filter((c) => c.kind === 'in')), pendingOut: sum(pend.filter((c) => c.kind === 'out')) },
        });
    }
    if (path.startsWith('/api/pos/cheque/') && request.method === 'POST' && (path.endsWith('/clear') || path.endsWith('/bounce'))) {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const act = path.endsWith('/clear') ? 'clear' : 'bounce';
        const id = parseInt(path.slice('/api/pos/cheque/'.length, -(act.length + 1)), 10) || 0;
        const ch = await env.POS_DB.prepare('SELECT * FROM cheques WHERE id = ?').bind(id).first();
        if (!ch) return json({ error: 'not_found' }, 404);
        if (ch.status !== 'pending') return json({ error: 'not_pending' }, 400);
        const ts = new Date().toISOString();
        const day = cairoDay();
        const stmts = [];
        if (act === 'bounce') {
            stmts.push(env.POS_DB.prepare("UPDATE cheques SET status = 'bounced', done_day = ? WHERE id = ?").bind(day, id));
        } else {
            stmts.push(env.POS_DB.prepare("UPDATE cheques SET status = 'cleared', done_day = ? WHERE id = ?").bind(day, id));
            if (ch.kind === 'in' && ch.customer_id) {
                stmts.push(env.POS_DB.prepare("INSERT INTO ledger (customer_id, ts, day, kind, amount, invoice_id, staff, note) VALUES (?, ?, ?, 'payment', ?, NULL, ?, ?)")
                    .bind(ch.customer_id, ts, day, ch.amount, staff.user, 'تحصيل شيك ' + (ch.number || '#' + id)));
            }
            if (ch.kind === 'out' && ch.supplier_id) {
                const sup = await env.POS_DB.prepare('SELECT balance FROM suppliers WHERE id = ?').bind(ch.supplier_id).first();
                const pay = Math.min(ch.amount, Math.max(0, sup?.balance ?? 0));
                if (pay > 0) {
                    stmts.push(env.POS_DB.prepare('UPDATE suppliers SET balance = balance - ? WHERE id = ?').bind(pay, ch.supplier_id));
                }
                stmts.push(env.POS_DB.prepare('INSERT INTO supplier_payments (ts, day, supplier_id, amount, staff, note) VALUES (?, ?, ?, ?, ?, ?)').bind(ts, day, ch.supplier_id, ch.amount, staff.user, 'صرف شيك ' + (ch.number || '#' + id)));
            }
        }
        await env.POS_DB.batch(stmts);
        return json({ ok: true, status: act === 'clear' ? 'cleared' : 'bounced' });
    }
    if (path.startsWith('/api/pos/cheque/') && request.method === 'DELETE') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const id = parseInt(path.slice('/api/pos/cheque/'.length), 10) || 0;
        const ch = await env.POS_DB.prepare('SELECT id, status FROM cheques WHERE id = ?').bind(id).first();
        if (!ch) return json({ error: 'not_found' }, 404);
        if (ch.status === 'cleared') return json({ error: 'already_cleared' }, 400);
        await env.POS_DB.prepare('DELETE FROM cheques WHERE id = ?').bind(id).run();
        return json({ ok: true });
    }

    // ---- تقرير الأرباح والتدفق النقدي (مدير فقط) ----
    if (path === '/api/pos/profit' && request.method === 'GET') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const url = new URL(request.url);
        const from = clean(url.searchParams.get('from'), 10);
        const to = clean(url.searchParams.get('to'), 10);
        if (!from || !to) return json({ error: 'missing_range' }, 400);
        const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
        const sales = await env.POS_DB.prepare("SELECT COALESCE(SUM(total), 0) AS revenue, COALESCE(SUM(CASE WHEN payment = 'cash' THEN total ELSE 0 END), 0) AS cash, COALESCE(SUM(CASE WHEN payment = 'vcash' THEN total ELSE 0 END), 0) AS vcash, COALESCE(SUM(CASE WHEN payment = 'debt' THEN total ELSE 0 END), 0) AS debt FROM invoices WHERE status = 'completed' AND day >= ? AND day <= ?").bind(from, to).first();
        const cogs = await env.POS_DB.prepare("SELECT COALESCE(SUM(ii.qty * COALESCE(NULLIF(ii.cost, 0), s.cost, 0)), 0) AS cogs, COALESCE(SUM(CASE WHEN COALESCE(NULLIF(ii.cost, 0), s.cost, 0) = 0 THEN 1 ELSE 0 END), 0) AS nocost FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id LEFT JOIN stock s ON s.code = ii.code WHERE i.status = 'completed' AND i.day >= ? AND i.day <= ?").bind(from, to).first();
        const exp = await env.POS_DB.prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM expenses WHERE day >= ? AND day <= ?').bind(from, to).first();
        const { results: expByCat } = await env.POS_DB.prepare('SELECT cat, SUM(amount) AS total FROM expenses WHERE day >= ? AND day <= ? GROUP BY cat ORDER BY total DESC').bind(from, to).all();
        const collected = await env.POS_DB.prepare("SELECT COALESCE(SUM(amount), 0) AS c FROM ledger WHERE kind = 'payment' AND day >= ? AND day <= ?").bind(from, to).first();
        const chIn = await env.POS_DB.prepare("SELECT COALESCE(SUM(amount), 0) AS c FROM cheques WHERE kind = 'in' AND status = 'cleared' AND customer_id = 0 AND done_day >= ? AND done_day <= ?").bind(from, to).first();
        const chOut = await env.POS_DB.prepare("SELECT COALESCE(SUM(amount), 0) AS c FROM cheques WHERE kind = 'out' AND status = 'cleared' AND supplier_id = 0 AND done_day >= ? AND done_day <= ?").bind(from, to).first();
        const purPaid = await env.POS_DB.prepare("SELECT COALESCE(SUM(paid), 0) AS c FROM purchases WHERE status = 'completed' AND day >= ? AND day <= ?").bind(from, to).first();
        const supPaid = await env.POS_DB.prepare('SELECT COALESCE(SUM(amount), 0) AS c FROM supplier_payments WHERE day >= ? AND day <= ?').bind(from, to).first();
        const purTotal = await env.POS_DB.prepare("SELECT COALESCE(SUM(total), 0) AS c FROM purchases WHERE status = 'completed' AND day >= ? AND day <= ?").bind(from, to).first();
        const { results: byDay } = await env.POS_DB.prepare("SELECT day, COUNT(*) AS count, SUM(total) AS revenue FROM invoices WHERE status = 'completed' AND day >= ? AND day <= ? GROUP BY day ORDER BY day DESC LIMIT 62").bind(from, to).all();
        const pend = await env.POS_DB.prepare("SELECT COALESCE(SUM(CASE WHEN kind = 'in' THEN amount ELSE 0 END), 0) AS cin, COALESCE(SUM(CASE WHEN kind = 'out' THEN amount ELSE 0 END), 0) AS cout FROM cheques WHERE status = 'pending'").first();
        const supDebt = await env.POS_DB.prepare('SELECT COALESCE(SUM(balance), 0) AS b FROM suppliers').first();
        const custDebt = await env.POS_DB.prepare("SELECT COALESCE(SUM(CASE WHEN kind = 'charge' THEN amount ELSE -amount END), 0) AS b FROM ledger").first();
        const revenue = r2(sales?.revenue), cogsV = r2(cogs?.cogs), expenses = r2(exp?.t);
        const cashIn = r2(r2(sales?.cash) + r2(sales?.vcash) + r2(collected?.c) + r2(chIn?.c));
        const cashOut = r2(r2(purPaid?.c) + r2(supPaid?.c) + expenses + r2(chOut?.c));
        return json({
            from, to,
            profit: { revenue, cogs: cogsV, gross: r2(revenue - cogsV), expenses, net: r2(revenue - cogsV - expenses), noCostLines: cogs?.nocost ?? 0 },
            expByCat: expByCat || [],
            cash: {
                in: { cash: r2(sales?.cash), vcash: r2(sales?.vcash), debtCollected: r2(collected?.c), cheques: r2(chIn?.c), total: cashIn },
                out: { purchases: r2(purPaid?.c), supplierPayments: r2(supPaid?.c), expenses, cheques: r2(chOut?.c), total: cashOut },
                net: r2(cashIn - cashOut),
            },
            purchasesTotal: r2(purTotal?.c),
            byDay: byDay || [],
            position: { customerDebts: r2(custDebt?.b), supplierDebts: r2(supDebt?.b), chequesIn: r2(pend?.cin), chequesOut: r2(pend?.cout) },
        });
    }

    // ---- تصدير Excel/CSV (مدير فقط): بيرجع صفوف جاهزة والواجهة بتبني الملف ----
    if (path.startsWith('/api/pos/export/') && request.method === 'GET') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const kind = path.slice('/api/pos/export/'.length);
        const url = new URL(request.url);
        const from = clean(url.searchParams.get('from'), 10) || '0000-00-00';
        const to = clean(url.searchParams.get('to'), 10) || '9999-12-31';
        let headers = [], rows = [];
        const q = async (sql, ...a) => (await env.POS_DB.prepare(sql).bind(...a).all()).results || [];
        const PAYAR = { cash: 'كاش', vcash: 'فودافون كاش', debt: 'آجل' };
        if (kind === 'sales') {
            headers = ['رقم الفاتورة', 'التاريخ', 'الموظف', 'الدفع', 'العميل', 'كود الصنف', 'الصنف', 'الكمية', 'السعر', 'خصم الصنف', 'إجمالي السطر', 'خصم الفاتورة', 'إجمالي الفاتورة', 'الحالة'];
            const rs = await q("SELECT i.num, i.day, i.staff, i.payment, i.customer_name, ii.code, ii.name, ii.qty, ii.price, ii.discount AS idisc, ii.line_total, i.discount, i.total, i.status FROM invoices i LEFT JOIN invoice_items ii ON ii.invoice_id = i.id WHERE i.status != 'pending' AND i.day >= ? AND i.day <= ? ORDER BY i.id, ii.rowid", from, to);
            rows = rs.map((r) => [r.num, r.day, r.staff, PAYAR[r.payment] || r.payment, r.customer_name, r.code, r.name, r.qty, r.price, r.idisc, r.line_total, r.discount, r.total, r.status === 'voided' ? 'ملغاة' : 'تمت']);
        } else if (kind === 'purchases') {
            headers = ['رقم الشراء', 'التاريخ', 'المورد', 'كود الصنف', 'الصنف', 'الكمية', 'تكلفة القطعة', 'إجمالي الفاتورة', 'المدفوع', 'الحالة'];
            const rs = await q("SELECT p.num, p.day, p.supplier_name, pi.code, pi.name, pi.qty, pi.cost, p.total, p.paid, p.status FROM purchases p LEFT JOIN purchase_items pi ON pi.purchase_id = p.id WHERE p.day >= ? AND p.day <= ? ORDER BY p.id, pi.rowid", from, to);
            rows = rs.map((r) => [r.num, r.day, r.supplier_name, r.code, r.name, r.qty, r.cost, r.total, r.paid, r.status === 'voided' ? 'ملغاة' : 'تمت']);
        } else if (kind === 'expenses') {
            headers = ['التاريخ', 'البند', 'التصنيف', 'المبلغ', 'الموظف', 'ملاحظة'];
            rows = (await q('SELECT day, title, cat, amount, staff, note FROM expenses WHERE day >= ? AND day <= ? ORDER BY id', from, to)).map((r) => [r.day, r.title, r.cat, r.amount, r.staff, r.note]);
        } else if (kind === 'debts') {
            headers = ['العميل', 'التليفون', 'المديونية الحالية'];
            rows = (await q("SELECT c.name, c.phone, COALESCE((SELECT SUM(CASE WHEN l.kind = 'charge' THEN l.amount ELSE -l.amount END) FROM ledger l WHERE l.customer_id = c.id), 0) AS balance FROM customers c ORDER BY balance DESC")).map((r) => [r.name, r.phone, r.balance]);
        } else if (kind === 'stock') {
            headers = ['الكود', 'الصنف', 'التصنيف', 'سعر البيع', 'التكلفة', 'الكمية', 'الحد الأدنى', 'قيمة المخزون بالتكلفة'];
            const prods = await posProducts(env);
            rows = prods.map((p) => [p.code, p.name, p.cat, p.price, p.cost, p.qty, p.min_qty, Math.round(p.qty * p.cost * 100) / 100]);
        } else if (kind === 'cheques') {
            headers = ['النوع', 'الطرف', 'رقم الشيك', 'البنك', 'المبلغ', 'تاريخ الاستحقاق', 'الحالة'];
            const ST = { pending: 'معلق', cleared: 'اتصرف', bounced: 'مرتجع' };
            rows = (await q('SELECT kind, party, number, bank, amount, due_day, status FROM cheques ORDER BY due_day')).map((r) => [r.kind === 'in' ? 'وارد من عميل' : 'صادر لمورد', r.party, r.number, r.bank, r.amount, r.due_day, ST[r.status] || r.status]);
        } else {
            return json({ error: 'unknown_export' }, 400);
        }
        return json({ kind, headers, rows });
    }

    // ---- الباركود: المدير بيربط باركود بصنف ----
    if (path === '/api/pos/barcode' && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const code = clean(body.code, 40);
        const barcode = clean(body.barcode, 60);
        if (!code || !barcode) return json({ error: 'bad_fields' }, 400);
        const catalog = await getCatalog(env);
        if (!catalog.some((p) => p.code === code)) return json({ error: 'unknown_product' }, 400);
        await env.POS_DB.prepare('INSERT INTO stock (code, qty, barcode) VALUES (?, 0, ?) ON CONFLICT(code) DO UPDATE SET barcode = excluded.barcode').bind(code, barcode).run();
        return json({ ok: true });
    }

    // ---- عروض الأسعار ----
    if (path === '/api/pos/quotes' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
        if (!items.length) return json({ error: 'empty_quote' }, 400);
        const catalog = await getCatalog(env);
        const byCode = new Map(catalog.map((p) => [p.code, p]));
        const lines = [];
        for (const it of items) {
            const p = byCode.get(clean(it.code, 40));
            if (!p) return json({ error: 'unknown_product', code: clean(it.code, 40) }, 400);
            const qty = Math.max(1, Math.min(9999, parseInt(it.qty, 10) || 1));
            const disc = Math.max(0, Math.min(1e9, Number(it.discount) || 0));
            const lineTotal = Math.max(0, Math.round((p.price * qty - disc) * 100) / 100);
            lines.push({ code: p.code, name: p.name, price: p.price, qty, discount: Math.round(disc * 100) / 100, lineTotal });
        }
        const subtotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
        const qDisc = Math.max(0, Math.min(subtotal, Number(body.discount) || 0));
        const total = Math.round((subtotal - qDisc) * 100) / 100;
        const r = await env.POS_DB.prepare("INSERT INTO quotes (num, ts, day, staff, customer_name, customer_phone, subtotal, discount, total, status) VALUES ('', '', '', '', '', '', 0, 0, 0, 'open')").run();
        const qid = r.meta.last_row_id;
        const num = 'QT-' + String(qid).padStart(6, '0');
        const ts = new Date().toISOString();
        const day = cairoDay();
        const stmts = lines.map((l) => env.POS_DB.prepare('INSERT INTO quote_items (quote_id, code, name, price, qty, discount, line_total) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(qid, l.code, l.name, l.price, l.qty, l.discount, l.lineTotal));
        stmts.push(env.POS_DB.prepare('UPDATE quotes SET num = ?, ts = ?, day = ?, staff = ?, customer_name = ?, customer_phone = ?, subtotal = ?, discount = ?, total = ? WHERE id = ?')
            .bind(num, ts, day, staff.user, clean(body.customerName, 120), clean(body.customerPhone, 30), subtotal, Math.round(qDisc * 100) / 100, total, qid));
        await env.POS_DB.batch(stmts);
        return json({ ok: true, id: qid, num, ts, total });
    }

    if (path === '/api/pos/quotes' && request.method === 'GET') {
        const url = new URL(request.url);
        const all = manager && url.searchParams.get('all') === '1';
        let sql = 'SELECT id, num, ts, staff, customer_name, customer_phone, subtotal, discount, total, status, invoice_id FROM quotes';
        const args = [];
        if (!manager || !all) { sql += ' WHERE staff = ?'; args.push(staff.user); }
        sql += ' ORDER BY id DESC LIMIT 200';
        const { results } = await env.POS_DB.prepare(sql).bind(...args).all();
        return json({ quotes: results || [] });
    }

    if (path.startsWith('/api/pos/quote/') && request.method === 'GET' && !path.endsWith('/convert') && !path.endsWith('/cancel')) {
        const id = parseInt(path.slice('/api/pos/quote/'.length), 10) || 0;
        const quote = await env.POS_DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first();
        if (!quote) return json({ error: 'not_found' }, 404);
        if (!manager && quote.staff !== staff.user) return json({ error: 'forbidden' }, 403);
        const { results: items } = await env.POS_DB.prepare('SELECT code, name, price, qty, discount, line_total FROM quote_items WHERE quote_id = ?').bind(id).all();
        return json({ quote, items: items || [] });
    }

    // تحويل العرض لفاتورة بيع حقيقية (بينقص المخزون ويسجل الدفع)
    if (path.startsWith('/api/pos/quote/') && path.endsWith('/convert') && request.method === 'POST') {
        const id = parseInt(path.slice('/api/pos/quote/'.length, -'/convert'.length), 10) || 0;
        const quote = await env.POS_DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first();
        if (!quote) return json({ error: 'not_found' }, 404);
        if (!manager && quote.staff !== staff.user) return json({ error: 'forbidden' }, 403);
        if (quote.status !== 'open') return json({ error: 'not_open' }, 400);
        let body;
        try { body = await request.json(); } catch { body = {}; }
        const { results: items } = await env.POS_DB.prepare('SELECT code, qty, discount FROM quote_items WHERE quote_id = ?').bind(id).all();
        const r = await createInvoiceCore(env, staff.user, {
            items: (items || []).map((l) => ({ code: l.code, qty: l.qty, discount: l.discount })),
            payment: body.payment || 'cash',
            discount: quote.discount,
            customerId: body.customerId,
            customerName: quote.customer_name,
            customerPhone: quote.customer_phone,
        });
        if (r.error) return json(r, r.status);
        await env.POS_DB.prepare("UPDATE quotes SET status = 'converted', invoice_id = ? WHERE id = ? AND status = 'open'").bind(r.id, id).run();
        return json(r);
    }

    if (path.startsWith('/api/pos/quote/') && path.endsWith('/cancel') && request.method === 'POST') {
        const id = parseInt(path.slice('/api/pos/quote/'.length, -'/cancel'.length), 10) || 0;
        const quote = await env.POS_DB.prepare('SELECT id, staff, status FROM quotes WHERE id = ?').bind(id).first();
        if (!quote) return json({ error: 'not_found' }, 404);
        if (!manager && quote.staff !== staff.user) return json({ error: 'forbidden' }, 403);
        if (quote.status !== 'open') return json({ error: 'not_open' }, 400);
        await env.POS_DB.prepare("UPDATE quotes SET status = 'canceled' WHERE id = ?").bind(id).run();
        return json({ ok: true });
    }

    return json({ error: 'not_found' }, 404);
}

function cairoDay() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); }
}

// مزامنة توفر الأصناف على الموقع مع كميات الـ POS: الموقع يظهر "نفدت" لما الكمية توصل صفر
async function syncStockFlags(env) {
    try {
        const kvProds = await getProducts(env);
        if (!kvProds) return; // الكتالوج لسه مترفعش من لوحة التحكم
        const { results } = await env.POS_DB.prepare('SELECT code, qty FROM stock').all();
        const qty = new Map((results || []).map((r) => [r.code, r.qty]));
        let changed = false;
        const updated = kvProds.map((p) => {
            if (!qty.has(p.code)) return p; // صنف مش متتبع في الـ POS
            const avail = (qty.get(p.code) ?? 0) > 0;
            if ((p.stock !== false) === avail) return p;
            changed = true;
            return { ...p, stock: avail };
        });
        if (changed) await env.SHOP_KV.put('products', JSON.stringify(updated));
    } catch {}
}

// قلب إنشاء الفاتورة — بيستخدمه البيع العادي وتحويل عرض السعر
async function createInvoiceCore(env, staffUser, body) {
    const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
    if (!items.length) return { error: 'empty_invoice', status: 400 };
    const payment = PAYMENTS.includes(body.payment) ? body.payment : 'cash';
    let customerId = 0;
    if (payment === 'debt' || body.customerId) {
        customerId = parseInt(body.customerId, 10) || 0;
        if (payment === 'debt' && !customerId) return { error: 'customer_required', status: 400 };
        if (customerId) {
            const cust = await env.POS_DB.prepare('SELECT id, name, phone FROM customers WHERE id = ?').bind(customerId).first();
            if (!cust) return { error: 'unknown_customer', status: 400 };
            body.customerName = body.customerName || cust.name;
            body.customerPhone = body.customerPhone || cust.phone || '';
        }
    }
    const catalog = await getCatalog(env);
    const byCode = new Map(catalog.map((p) => [p.code, p]));

    const costMap = new Map(((await env.POS_DB.prepare('SELECT code, cost FROM stock').all()).results || []).map((r) => [r.code, r.cost || 0]));
    const lines = [];
    for (const it of items) {
        const p = byCode.get(clean(it.code, 40));
        if (!p) return { error: 'unknown_product', code: clean(it.code, 40), status: 400 };
        const qty = Math.max(1, Math.min(9999, parseInt(it.qty, 10) || 1));
        const disc = Math.max(0, Math.min(1e9, Number(it.discount) || 0));
        const lineTotal = Math.max(0, Math.round((p.price * qty - disc) * 100) / 100);
        lines.push({ code: p.code, name: p.name, price: p.price, qty, discount: Math.round(disc * 100) / 100, lineTotal, cost: costMap.get(p.code) || 0 });
    }
    const subtotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    const invDisc = Math.max(0, Math.min(subtotal, Number(body.discount) || 0));
    const total = Math.round((subtotal - invDisc) * 100) / 100;

    // إنقاص المخزون بشكل ذرّي: أي صنف كميته مش كفاية يوقف العملية كلها
    const stmts = [];
    for (const l of lines) {
        stmts.push(env.POS_DB.prepare("UPDATE stock SET qty = qty - ? WHERE code = ? AND qty >= ?").bind(l.qty, l.code, l.qty));
    }
    stmts.push(env.POS_DB.prepare("INSERT INTO invoices (num, ts, day, staff, payment, subtotal, discount, total, status, customer_name, customer_phone) VALUES ('', '', '', '', '', 0, 0, 0, 'pending', '', '')"));
    const results = await env.POS_DB.batch(stmts);
    for (let i = 0; i < lines.length; i++) {
        if ((results[i].meta?.changes ?? 0) === 0) return { error: 'insufficient_stock', code: lines[i].code, status: 400 };
    }
    const invoiceId = results[results.length - 1].meta.last_row_id;
    const num = 'INV-' + String(invoiceId).padStart(6, '0');
    const ts = new Date().toISOString();
    const day = cairoDay();
    const itemStmts = lines.map((l) => env.POS_DB.prepare('INSERT INTO invoice_items (invoice_id, code, name, price, qty, discount, line_total, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(invoiceId, l.code, l.name, l.price, l.qty, l.discount, l.lineTotal, l.cost));
    itemStmts.push(env.POS_DB.prepare("UPDATE invoices SET num = ?, ts = ?, day = ?, staff = ?, payment = ?, subtotal = ?, discount = ?, total = ?, status = 'completed', customer_name = ?, customer_phone = ?, customer_id = ? WHERE id = ?")
        .bind(num, ts, day, staffUser, payment, subtotal, Math.round(invDisc * 100) / 100, total, clean(body.customerName, 120), clean(body.customerPhone, 30), customerId || null, invoiceId));
    if (payment === 'debt') {
        itemStmts.push(env.POS_DB.prepare("INSERT INTO ledger (customer_id, ts, day, kind, amount, invoice_id, staff, note) VALUES (?, ?, ?, 'charge', ?, ?, ?, '')")
            .bind(customerId, ts, day, total, invoiceId, staffUser));
    }
    await env.POS_DB.batch(itemStmts);
    await syncStockFlags(env);
    return { ok: true, id: invoiceId, num, ts, total };
}
