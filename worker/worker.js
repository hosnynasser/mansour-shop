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

async function isAdmin(request, env) {
    const h = request.headers.get('X-Admin-Code') || '';
    if (!h) return false;
    if (env.ADMIN_CODE && h === env.ADMIN_CODE) return true;
    const i = h.indexOf(':');
    if (i > 0) {
        const user = clean(h.slice(0, i), 40);
        const pass = h.slice(i + 1).slice(0, 100);
        if (!user || !pass) return false;
        const hash = await sha256(pass);
        const admins = await getAdmins(env);
        return admins.some((a) => a.user === user && a.hash === hash);
    }
    return false;
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
        const order = { id, ts: new Date().toISOString(), status: 'new', customer: { name, phone, address }, lines, total };
        await env.SHOP_KV.put('order:' + id, JSON.stringify(order));
        const idxRaw = await env.SHOP_KV.get('orders:index');
        let idx = [];
        try { idx = idxRaw ? JSON.parse(idxRaw) : []; } catch { idx = []; }
        idx.unshift(id);
        await env.SHOP_KV.put('orders:index', JSON.stringify(idx.slice(0, 500)));
        return json({ ok: true, id, total });
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
            return json({ admins: admins.map((a) => ({ user: a.user })) });
        }

        if (path === '/api/admin/admins' && request.method === 'POST') {
            let body;
            try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
            const user = clean(body.user, 40);
            const pass = String(body.pass ?? '');
            if (user.length < 3 || pass.length < 6 || pass.length > 100) return json({ error: 'bad_fields' }, 400);
            if (user.includes(':')) return json({ error: 'bad_fields' }, 400);
            const admins = await getAdmins(env);
            if (admins.length >= 10) return json({ error: 'too_many' }, 400);
            if (admins.some((a) => a.user === user)) return json({ error: 'user_exists' }, 400);
            admins.push({ user, hash: await sha256(pass) });
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
