// MANSOUR shop backend — Cloudflare Worker + KV (free tier)
// Bindings: SHOP_KV (KV namespace), secret ADMIN_CODE (passcode for /admin)
// Routes:
//   GET  /api/products            public  -> {products:[...]} (404 if none saved yet)
//   POST /api/orders              public  -> {ok:true,id,total} (total recomputed server-side)
//   GET  /api/admin/orders        admin   -> {orders:[...]}
//   POST /api/admin/orders/status admin   {id,status}
//   GET  /api/admin/products      admin   -> {products:[...],custom:bool}
//   PUT  /api/admin/products      admin   {products:[...]} -> {ok:true}

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Code',
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
    });
}

const isAdmin = (request, env) =>
    !!env.ADMIN_CODE && request.headers.get('X-Admin-Code') === env.ADMIN_CODE;

const clean = (s, max = 200) => String(s ?? '').trim().slice(0, max);

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

function sanitizeProduct(p) {
    return {
        name: clean(p.name, 120),
        desc: clean(p.desc, 300),
        price: Math.round(p.price * 100) / 100,
        code: clean(p.code, 40),
        cat: p.cat,
        stock: p.stock === false ? false : true,
        imgUrl: typeof p.imgUrl === 'string' && /^https:\/\//.test(p.imgUrl) ? p.imgUrl.slice(0, 500) : '',
    };
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
        const order = { id, ts: new Date().toISOString(), status: 'new', customer: { name, phone, address }, lines, total };
        await env.SHOP_KV.put('order:' + id, JSON.stringify(order));
        const idxRaw = await env.SHOP_KV.get('orders:index');
        let idx = [];
        try { idx = idxRaw ? JSON.parse(idxRaw) : []; } catch { idx = []; }
        idx.unshift(id);
        await env.SHOP_KV.put('orders:index', JSON.stringify(idx.slice(0, 500)));
        return json({ ok: true, id, total });
    }

    // ---- admin ----
    if (path === '/api/admin/orders' && request.method === 'GET') {
        if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
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
        if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const id = clean(body.id, 60);
        const status = body.status === 'done' ? 'done' : 'new';
        const raw = await env.SHOP_KV.get('order:' + id);
        if (!raw) return json({ error: 'not_found' }, 404);
        const order = JSON.parse(raw);
        order.status = status;
        await env.SHOP_KV.put('order:' + id, JSON.stringify(order));
        return json({ ok: true });
    }

    if (path === '/api/admin/products' && request.method === 'GET') {
        if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
        const products = await getProducts(env);
        return json({ products: products || [], custom: !!products });
    }

    if (path === '/api/admin/products' && request.method === 'PUT') {
        if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
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

    return json({ error: 'not_found' }, 404);
}

export default {
    fetch(request, env) {
        return handle(request, env).catch((e) => json({ error: 'server_error' }, 500));
    },
};
