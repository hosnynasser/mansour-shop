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
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Code',
    'Access-Control-Max-Age': '86400',
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
async function getOwner(env) {
    try { return (await env.POS_DB.prepare('SELECT user, hash FROM owner_cred WHERE id = 1').first()) || null; } catch { return null; }
}

async function staffAuth(request, env) {
    const h = request.headers.get('X-Admin-Code') || '';
    if (!h) return null;
    const owner = await getOwner(env);
    const i = h.indexOf(':');
    if (owner) {
        // لما المدير يغيّر بياناته من الإعدادات، الكود الرئيسي القديم بيتعطل
        if (i > 0 && clean(h.slice(0, i), 40) === owner.user && (await sha256(h.slice(i + 1).slice(0, 100))) === owner.hash) return { user: owner.user, role: 'manager', root: true };
    } else {
        if (env.ADMIN_CODE && h === env.ADMIN_CODE) return { user: 'master', role: 'manager', root: true };
        if (i > 0 && env.ADMIN_CODE && h.slice(i + 1).slice(0, 100) === env.ADMIN_CODE && clean(h.slice(0, i), 40)) return { user: clean(h.slice(0, i), 40), role: 'manager', root: true };
    }
    if (i > 0) {
        const user = clean(h.slice(0, i), 40);
        const pass = h.slice(i + 1).slice(0, 100);
        if (!user || !pass) return null;
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
        ...(p.hidden === true ? { hidden: true } : {}),
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

    // ---- تغيير بيانات دخول المستخدم الحالي (موقع + كاشير بيستخدموا نفس الدخول) ----
    if (path === '/api/account/change' && request.method === 'POST') {
        const me = await staffAuth(request, env);
        if (!me) return json({ error: 'unauthorized' }, 401);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const h = request.headers.get('X-Admin-Code') || '';
        const curPass = (env.ADMIN_CODE && h === env.ADMIN_CODE) ? h : (h.indexOf(':') > 0 ? h.slice(h.indexOf(':') + 1).slice(0, 100) : h);
        if (String(body.current ?? '') !== curPass) return json({ error: 'wrong_current' }, 403);
        const newUser = clean(body.newUser, 40) || (me.user === 'master' ? '' : me.user);
        const newPass = String(body.newPass ?? '');
        if (newUser.length < 3 || newUser.includes(':')) return json({ error: 'bad_user' }, 400);
        if (newPass && (newPass.length < 6 || newPass.length > 100)) return json({ error: 'bad_pass' }, 400);
        const admins = await getAdmins(env);
        if (me.root) {
            if (admins.some((x) => x.user === newUser)) return json({ error: 'user_exists' }, 400);
            const owner = await getOwner(env);
            if (!owner && !newPass) return json({ error: 'need_pass' }, 400);
            const hash = newPass ? await sha256(newPass) : owner.hash;
            await env.POS_DB.prepare('CREATE TABLE IF NOT EXISTS owner_cred (id INTEGER PRIMARY KEY, user TEXT NOT NULL, hash TEXT NOT NULL)').run();
            await env.POS_DB.prepare('INSERT INTO owner_cred (id, user, hash) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET user = excluded.user, hash = excluded.hash').bind(newUser, hash).run();
            return json({ ok: true, user: newUser, cred: newUser + ':' + (newPass || curPass) });
        }
        const a = admins.find((x) => x.user === me.user);
        if (!a) return json({ error: 'not_found' }, 404);
        if (newUser !== a.user && (admins.some((x) => x.user === newUser) || (await getOwner(env))?.user === newUser)) return json({ error: 'user_exists' }, 400);
        a.user = newUser;
        if (newPass) a.hash = await sha256(newPass);
        try { await env.SHOP_KV.put('admins', JSON.stringify(admins)); } catch { return json({ error: 'try_later' }, 503); }
        return json({ ok: true, user: newUser, cred: newUser + ':' + (newPass || curPass) });
    }

    // ---- public: products ----
    if (path === '/api/products' && request.method === 'GET') {
        const products = await getProducts(env);
        if (!products) return json({ error: 'no_products' }, 404);
        return json({ products: products.filter((p) => !p.hidden) });
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

        const catalog = ((await getProducts(env)) || EMBEDDED_PRODUCTS).filter((p) => !p.hidden);
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
            if (!list || !list.length || list.length > 2000) return json({ error: 'bad_products' }, 400);
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
    const { results: cr } = await env.POS_DB.prepare('SELECT code, cat FROM prod_cat').all();
    const cmap = new Map((cr || []).map((r) => [r.code, r.cat]));
    let phid = new Set();
    try { const { results: hr } = await env.POS_DB.prepare('SELECT code FROM pos_hidden').all(); phid = new Set((hr || []).map((r) => r.code)); } catch { /* الجدول لسه مش موجود */ }
    return catalog.filter((p) => !phid.has(p.code)).map((p) => ({ name: p.name, code: p.code, price: p.price, cat: cmap.has(p.code) ? cmap.get(p.code) : p.cat, stock: p.stock !== false, qty: info.get(p.code)?.qty ?? 0, barcode: info.get(p.code)?.barcode || '', cost: info.get(p.code)?.cost ?? 0, min_qty: info.get(p.code)?.min_qty ?? 5 }));
}

async function getCategories(env, products) {
    const r = await env.POS_DB.prepare("SELECT v FROM settings WHERE k = 'categories'").first();
    let list = null;
    try { list = r ? JSON.parse(r.v) : null; } catch { list = null; }
    if (!Array.isArray(list)) list = [...new Set(products.map((p) => p.cat).filter(Boolean))];
    return list;
}

async function handlePos(request, env, path) {
    const staff = await staffAuth(request, env);
    if (!staff) return json({ error: 'unauthorized' }, 401);
    const manager = staff.role === 'manager';

    if (path === '/api/pos/me' && request.method === 'GET') {
        return json({ user: staff.user, role: staff.role });
    }

    if (path === '/api/pos/products' && request.method === 'GET') {
        const products = await posProducts(env);
        return json({ products, categories: await getCategories(env, products) });
    }

    // إدارة الأصناف (مدير فقط): إضافة / تعديل / حذف — الكتالوج مشترك مع موقع المحل
    if (path === '/api/pos/product' && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const name = clean(body.name, 120);
        const price = Number(body.price);
        if (!name || !isFinite(price) || price < 0) return json({ error: 'bad_fields' }, 400);
        const catalog = [...(await getCatalog(env))];
        let code = clean(body.code, 40);
        if (!code) {
            let mx = 300;
            for (const q of catalog) { const m = /^P-(\d+)$/.exec(q.code); if (m) mx = Math.max(mx, parseInt(m[1], 10)); }
            code = 'P-' + (mx + 1);
        }
        if (catalog.some((q) => q.code === code)) return json({ error: 'duplicate_code' }, 409);
        if (catalog.length >= 2000) return json({ error: 'too_many' }, 400);
        const cat = clean(body.cat, 30);
        const siteCat = (cat === 'كهرباء' || cat === 'أدوات صحية') ? cat : 'كهرباء';
        const qty = Math.max(0, Math.min(1000000, parseInt(body.qty, 10) || 0));
        const cost = Math.max(0, Number(body.cost) || 0);
        catalog.push({ name, desc: '', price: Math.round(price * 100) / 100, code, cat: siteCat, stock: qty > 0, ...(body.hidden === true ? { hidden: true } : {}) });
        await env.SHOP_KV.put('products', JSON.stringify(catalog.map((q) => ({ ...sanitizeProduct(q) }))));
        await env.POS_DB.prepare('INSERT INTO stock (code, qty, cost) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET qty = excluded.qty, cost = excluded.cost').bind(code, qty, cost).run();
        if (cat) await env.POS_DB.prepare('INSERT INTO prod_cat (code, cat) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET cat = excluded.cat').bind(code, cat).run();
        await syncStockFlags(env);
        return json({ ok: true, code });
    }
    let pm = path.match(/^\/api\/pos\/product\/([^/]+)(\/delete)?$/);
    if (pm && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const code = decodeURIComponent(pm[1]);
        let body = {};
        try { body = await request.json(); } catch { body = {}; }
        const catalog = [...(await getCatalog(env))];
        const i = catalog.findIndex((q) => q.code === code);
        if (i < 0) return json({ error: 'not_found' }, 404);
        if (pm[2]) {
            if (catalog.length <= 1) return json({ error: 'last_product' }, 400);
            const u1 = await env.POS_DB.prepare('SELECT COUNT(*) c FROM invoice_items WHERE code = ?').bind(code).first();
            const u2 = await env.POS_DB.prepare('SELECT COUNT(*) c FROM purchase_items WHERE code = ?').bind(code).first();
            const used = (u1?.c || 0) + (u2?.c || 0) > 0;
            catalog.splice(i, 1);
            await env.SHOP_KV.put('products', JSON.stringify(catalog.map((q) => sanitizeProduct(q))));
            if (!used) {
                await env.POS_DB.prepare('DELETE FROM stock WHERE code = ?').bind(code).run();
                await env.POS_DB.prepare('DELETE FROM prod_cat WHERE code = ?').bind(code).run();
            }
            return json({ ok: true, hidden: used });
        }
        const name = clean(body.name, 120);
        const price = Number(body.price);
        if (!name || !isFinite(price) || price < 0) return json({ error: 'bad_fields' }, 400);
        catalog[i] = { ...catalog[i], name, price: Math.round(price * 100) / 100 };
        await env.SHOP_KV.put('products', JSON.stringify(catalog.map((q) => sanitizeProduct(q))));
        if (body.cost !== undefined) await env.POS_DB.prepare('INSERT INTO stock (code, qty, cost) VALUES (?, 0, ?) ON CONFLICT(code) DO UPDATE SET cost = excluded.cost').bind(code, Math.max(0, Number(body.cost) || 0)).run();
        return json({ ok: true });
    }

    // تصنيفات الأصناف (مدير فقط للتعديل)
    if (path === '/api/pos/categories' && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const list = [...new Set((Array.isArray(body.list) ? body.list : []).map((x) => clean(x, 30)).filter(Boolean))].slice(0, 30);
        await env.POS_DB.prepare("INSERT INTO settings (k, v) VALUES ('categories', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(list)).run();
        return json({ ok: true, categories: list });
    }
    if (path === '/api/pos/product-cat' && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const code = clean(body.code, 40);
        const cat = clean(body.cat, 30);
        if (!code) return json({ error: 'bad_fields' }, 400);
        await env.POS_DB.prepare('INSERT INTO prod_cat (code, cat) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET cat = excluded.cat').bind(code, cat).run();
        return json({ ok: true, code, cat });
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
        if (body.qty === undefined && minQty !== null) {
            // تعديل حد النواقص بس من غير ما نلمس الكمية
            await env.POS_DB.prepare('INSERT INTO stock (code, qty, min_qty) VALUES (?, 0, ?) ON CONFLICT(code) DO UPDATE SET min_qty = excluded.min_qty').bind(code, minQty).run();
            await syncStockFlags(env);
            return json({ ok: true, code, min_qty: minQty });
        }
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
        const lim = parseInt(url.searchParams.get('limit') || '', 10);
        const pageSize = lim > 0 ? Math.min(lim, 100) : 200;
        const before = parseInt(url.searchParams.get('before') || '', 10);
        if (before > 0) { sql += ' AND id < ?'; args.push(before); }
        sql += ' ORDER BY id DESC LIMIT ' + (pageSize + 1);
        const { results } = await env.POS_DB.prepare(sql).bind(...args).all();
        const rows = results || [];
        const more = rows.length > pageSize;
        return json({ invoices: more ? rows.slice(0, pageSize) : rows, more });
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
        stmts.push(env.POS_DB.prepare('DELETE FROM points_log WHERE invoice_id = ?').bind(id));
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
        const { results } = await env.POS_DB.prepare("SELECT c.id, c.name, c.phone, c.notes, c.grp, COALESCE((SELECT SUM(CASE WHEN l.kind = 'charge' THEN l.amount ELSE -l.amount END) FROM ledger l WHERE l.customer_id = c.id), 0) AS balance, COALESCE((SELECT SUM(delta) FROM points_log pl WHERE pl.customer_id = c.id), 0) AS points FROM customers c ORDER BY c.name").all();
        return json({ customers: results || [] });
    }

    if (path === '/api/pos/customers' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const name = clean(body.name, 120);
        if (name.length < 2) return json({ error: 'bad_fields' }, 400);
        const r = await env.POS_DB.prepare('INSERT INTO customers (name, phone, notes, grp, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(name, clean(body.phone, 30), clean(body.notes, 500), clean(body.grp, 40) || null, new Date().toISOString()).run();
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
        if (body.grp === undefined) {
            await env.POS_DB.prepare('UPDATE customers SET name = ?, phone = ?, notes = ? WHERE id = ?')
                .bind(name, clean(body.phone, 30), clean(body.notes, 500), id).run();
        } else {
            await env.POS_DB.prepare('UPDATE customers SET name = ?, phone = ?, notes = ?, grp = ? WHERE id = ?')
                .bind(name, clean(body.phone, 30), clean(body.notes, 500), clean(body.grp, 40) || null, id).run();
        }
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
        // كل القراءات في دفعة واحدة (رحلة واحدة لقاعدة البيانات بدل 7 ورا بعض)، والنتيجة نفس الأرقام بالظبط
        const rs = await env.POS_DB.batch([
            env.POS_DB.prepare('SELECT id, name, phone, notes, grp FROM customers WHERE id = ?').bind(id),
            env.POS_DB.prepare('SELECT id, ts, kind, amount, invoice_id, staff, note FROM ledger WHERE customer_id = ? ORDER BY id DESC LIMIT 100').bind(id),
            env.POS_DB.prepare("SELECT COALESCE(SUM(CASE WHEN kind = 'charge' THEN amount ELSE -amount END), 0) AS b FROM ledger WHERE customer_id = ?").bind(id),
            env.POS_DB.prepare("SELECT id, num, ts, staff, payment, total, status FROM invoices WHERE customer_id = ? AND status != 'pending' ORDER BY id DESC LIMIT 50").bind(id),
            env.POS_DB.prepare('SELECT ts, delta, kind, invoice_id, note FROM points_log WHERE customer_id = ? ORDER BY id DESC LIMIT 30').bind(id),
            env.POS_DB.prepare("SELECT k, v FROM settings WHERE k LIKE 'loyalty_%'"),
            env.POS_DB.prepare('SELECT COALESCE(SUM(delta), 0) AS p FROM points_log WHERE customer_id = ?').bind(id),
        ]);
        const customer = (rs[0].results || [])[0];
        if (!customer) return json({ error: 'not_found' }, 404);
        const m = new Map((rs[5].results || []).map((r) => [r.k, r.v]));
        const settings = {
            earnEvery: Number(m.get('loyalty_earn_every')) || 10,
            pointValue: Number(m.get('loyalty_point_value')) || 0.5,
            enabled: m.get('loyalty_enabled') !== '0',
        };
        return json({ customer, ledger: rs[1].results || [], balance: (rs[2].results || [])[0]?.b ?? 0, invoices: rs[3].results || [], points: (rs[6].results || [])[0]?.p ?? 0, pointsLog: rs[4].results || [], loyalty: settings });
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
        const idem = clean(body.key, 64) || null;
        try {
            await env.POS_DB.prepare("INSERT INTO ledger (customer_id, ts, day, kind, amount, invoice_id, staff, note, idem) VALUES (?, ?, ?, 'payment', ?, NULL, ?, ?, ?)")
                .bind(id, ts, day, amount, staff.user, clean(body.note, 200), idem).run();
        } catch (e) { if (!(idem && /UNIQUE/i.test(String(e?.message || e)))) throw e; /* نفس الطلب اتبعت قبل كده: متتسجلش مرتين */ }
        const bal = await env.POS_DB.prepare("SELECT COALESCE(SUM(CASE WHEN kind = 'charge' THEN amount ELSE -amount END), 0) AS b FROM ledger WHERE customer_id = ?").bind(id).first();
        return json({ ok: true, balance: bal?.b ?? 0 });
    }

    // إضافة مديونية سابقة على عميل (مدير فقط): قيد "رصيد سابق" من غير فاتورة، بيظهر في كشف الحساب وفي إجمالي المديونيات
    if (path.startsWith('/api/pos/customer/') && path.endsWith('/debt') && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const id = parseInt(path.slice('/api/pos/customer/'.length, -'/debt'.length), 10) || 0;
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const amount = Math.round((Number(body.amount) || 0) * 100) / 100;
        if (amount <= 0 || amount > 1e7) return json({ error: 'bad_amount' }, 400);
        const customer = await env.POS_DB.prepare('SELECT id FROM customers WHERE id = ?').bind(id).first();
        if (!customer) return json({ error: 'not_found' }, 404);
        const ts = new Date().toISOString();
        let day = ts.slice(0, 10);
        try { day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch {}
        const extra = clean(body.note, 150);
        const idem = clean(body.key, 64) || null;
        try {
            await env.POS_DB.prepare("INSERT INTO ledger (customer_id, ts, day, kind, amount, invoice_id, staff, note, idem) VALUES (?, ?, ?, 'charge', ?, NULL, ?, ?, ?)")
                .bind(id, ts, day, amount, staff.user, 'رصيد سابق' + (extra ? ' · ' + extra : ''), idem).run();
        } catch (e) { if (!(idem && /UNIQUE/i.test(String(e?.message || e)))) throw e; }
        const bal = await env.POS_DB.prepare("SELECT COALESCE(SUM(CASE WHEN kind = 'charge' THEN amount ELSE -amount END), 0) AS b FROM ledger WHERE customer_id = ?").bind(id).first();
        return json({ ok: true, balance: bal?.b ?? 0 });
    }

    // حذف قيد دفعة غلط (مدير فقط)
    if (path.startsWith('/api/pos/ledger/') && request.method === 'DELETE') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const id = parseInt(path.slice('/api/pos/ledger/'.length), 10) || 0;
        await env.POS_DB.prepare("DELETE FROM ledger WHERE id = ? AND (kind = 'payment' OR (kind = 'charge' AND invoice_id IS NULL))").bind(id).run();
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
        const debts = await env.POS_DB.prepare("SELECT COALESCE(SUM(b), 0) AS outstanding FROM (SELECT SUM(CASE WHEN kind = 'charge' THEN amount ELSE -amount END) AS b FROM ledger GROUP BY customer_id HAVING b > 0)").first();
        const { results: topDebtors } = await env.POS_DB.prepare("SELECT c.id, c.name, c.phone, SUM(CASE WHEN l.kind = 'charge' THEN l.amount ELSE -l.amount END) AS balance FROM customers c JOIN ledger l ON l.customer_id = c.id GROUP BY c.id HAVING balance > 0 ORDER BY balance DESC LIMIT 10").all();
        const collected = await env.POS_DB.prepare("SELECT COALESCE(SUM(amount), 0) AS c FROM ledger WHERE kind = 'payment' AND day >= ? AND day <= ?").bind(from, to).first();
        return json({ from, to, summary: sum, top: top || [], byStaff: byStaff || [], debtsOutstanding: debts?.outstanding ?? 0, topDebtors: topDebtors || [], collectedInRange: collected?.c ?? 0 });
    }



    // ---- الموردين (مدير فقط) ----
    if (path === '/api/pos/suppliers' && request.method === 'GET') {
        const { results } = await env.POS_DB.prepare('SELECT id, name, phone, notes, grp, balance FROM suppliers ORDER BY name LIMIT 500').all();
        return json({ suppliers: results || [] });
    }
    if (path === '/api/pos/suppliers' && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const name = clean(body.name, 120);
        if (name.length < 2) return json({ error: 'bad_name' }, 400);
        const r = await env.POS_DB.prepare('INSERT INTO suppliers (name, phone, notes, grp, balance) VALUES (?, ?, ?, ?, 0)').bind(name, clean(body.phone, 30), clean(body.notes, 400), clean(body.grp, 40) || null).run();
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
        if (body.grp === undefined) {
            await env.POS_DB.prepare('UPDATE suppliers SET name = ?, phone = ?, notes = ? WHERE id = ?').bind(name, clean(body.phone, 30), clean(body.notes, 400), id).run();
        } else {
            await env.POS_DB.prepare('UPDATE suppliers SET name = ?, phone = ?, notes = ?, grp = ? WHERE id = ?').bind(name, clean(body.phone, 30), clean(body.notes, 400), clean(body.grp, 40) || null, id).run();
        }
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

    // ---- نقاط الولاء ----
    if (path === '/api/pos/loyalty' && request.method === 'GET') {
        return json({ settings: await loyaltySettings(env) });
    }
    if (path === '/api/pos/loyalty' && request.method === 'PUT') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const earnEvery = Math.max(1, Math.min(100000, Number(body.earnEvery) || 0));
        const pointValue = Math.max(0.01, Math.min(1000, Number(body.pointValue) || 0));
        const enabled = body.enabled === false ? 0 : 1;
        if (!Number(body.earnEvery) || !Number(body.pointValue)) return json({ error: 'bad_fields' }, 400);
        await env.POS_DB.batch([
            env.POS_DB.prepare("INSERT INTO settings (k, v) VALUES ('loyalty_earn_every', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(String(earnEvery)),
            env.POS_DB.prepare("INSERT INTO settings (k, v) VALUES ('loyalty_point_value', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(String(pointValue)),
            env.POS_DB.prepare("INSERT INTO settings (k, v) VALUES ('loyalty_enabled', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(String(enabled)),
        ]);
        return json({ ok: true, settings: await loyaltySettings(env) });
    }
    // تعديل يدوي لنقاط عميل (مدير فقط)
    if (path.startsWith('/api/pos/customer/') && path.endsWith('/points') && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const id = parseInt(path.slice('/api/pos/customer/'.length, -'/points'.length), 10) || 0;
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const delta = Math.max(-1000000, Math.min(1000000, parseInt(body.delta, 10) || 0));
        if (!delta) return json({ error: 'bad_fields' }, 400);
        const c = await env.POS_DB.prepare('SELECT id FROM customers WHERE id = ?').bind(id).first();
        if (!c) return json({ error: 'not_found' }, 404);
        await env.POS_DB.prepare("INSERT INTO points_log (customer_id, ts, day, delta, kind, invoice_id, note) VALUES (?, ?, ?, ?, 'adjust', NULL, ?)").bind(id, new Date().toISOString(), cairoDay(), delta, clean(body.note, 120) || 'تعديل يدوي').run();
        return json({ ok: true, points: await customerPoints(env, id) });
    }

    // ---- الحضور والانصراف ----
    if (path === '/api/pos/attendance/me' && request.method === 'GET') {
        const day = cairoDay();
        const row = await env.POS_DB.prepare('SELECT id, check_in, check_out FROM attendance WHERE user = ? AND day = ? ORDER BY id DESC LIMIT 1').bind(staff.user, day).first();
        return json({ user: staff.user, day, row: row || null });
    }
    if (path === '/api/pos/attendance/in' && request.method === 'POST') {
        const day = cairoDay();
        const open = await env.POS_DB.prepare("SELECT id FROM attendance WHERE user = ? AND day = ? AND (check_out IS NULL OR check_out = '')").bind(staff.user, day).first();
        if (open) return json({ error: 'already_in' }, 400);
        const r = await env.POS_DB.prepare('INSERT INTO attendance (user, day, check_in, check_out, manual) VALUES (?, ?, ?, ?, 0)').bind(staff.user, day, new Date().toISOString(), '').run();
        return json({ ok: true, id: r.meta.last_row_id });
    }
    if (path === '/api/pos/attendance/out' && request.method === 'POST') {
        const day = cairoDay();
        const open = await env.POS_DB.prepare("SELECT id FROM attendance WHERE user = ? AND day = ? AND (check_out IS NULL OR check_out = '') ORDER BY id DESC LIMIT 1").bind(staff.user, day).first();
        if (!open) return json({ error: 'not_in' }, 400);
        await env.POS_DB.prepare('UPDATE attendance SET check_out = ? WHERE id = ?').bind(new Date().toISOString(), open.id).run();
        return json({ ok: true });
    }
    if (path === '/api/pos/attendance' && request.method === 'GET') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const month = clean(new URL(request.url).searchParams.get('month'), 7) || cairoDay().slice(0, 7);
        const { results } = await env.POS_DB.prepare('SELECT id, user, day, check_in, check_out, manual FROM attendance WHERE day >= ? AND day <= ? ORDER BY day DESC, id DESC LIMIT 500').bind(month + '-01', month + '-31').all();
        return json({ month, rows: results || [] });
    }
    // تسجيل يدوي (لو الموظف نسي) — مدير فقط. times بتوقيت القاهرة HH:MM
    if (path === '/api/pos/attendance' && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const user = clean(body.user, 40), day = clean(body.day, 10);
        if (!user || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{1,2}:\d{2}$/.test(String(body.in || ''))) return json({ error: 'bad_fields' }, 400);
        const iso = (hhmm) => cairoToIso(day, hhmm);
        const cin = iso(body.in);
        const cout = /^\d{1,2}:\d{2}$/.test(String(body.out || '')) ? iso(body.out) : '';
        if (!cin) return json({ error: 'bad_fields' }, 400);
        const r = await env.POS_DB.prepare('INSERT INTO attendance (user, day, check_in, check_out, manual) VALUES (?, ?, ?, ?, 1)').bind(user, day, cin, cout).run();
        return json({ ok: true, id: r.meta.last_row_id });
    }
    if (path.startsWith('/api/pos/attendance/') && request.method === 'DELETE') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const id = parseInt(path.slice('/api/pos/attendance/'.length), 10) || 0;
        await env.POS_DB.prepare('DELETE FROM attendance WHERE id = ?').bind(id).run();
        return json({ ok: true });
    }

    // ---- المرتبات (مدير فقط) ----
    if (path === '/api/pos/pay/rate' && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const user = clean(body.user, 40);
        const kind = body.kind === 'day' ? 'day' : 'month';
        const rate = Math.round(Math.max(0, Math.min(1e7, Number(body.rate) || 0)) * 100) / 100;
        if (!user) return json({ error: 'bad_fields' }, 400);
        await env.POS_DB.prepare('INSERT INTO pay_rates (user, kind, rate) VALUES (?, ?, ?) ON CONFLICT(user) DO UPDATE SET kind = excluded.kind, rate = excluded.rate').bind(user, kind, rate).run();
        return json({ ok: true });
    }
    if (path === '/api/pos/pay/advance' && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const user = clean(body.user, 40);
        const amount = Math.round(Math.max(0, Math.min(1e7, Number(body.amount) || 0)) * 100) / 100;
        if (!user || amount <= 0) return json({ error: 'bad_fields' }, 400);
        const day = /^\d{4}-\d{2}-\d{2}$/.test(String(body.day || '')) ? body.day : cairoDay();
        const r = await env.POS_DB.prepare('INSERT INTO pay_advances (ts, day, user, amount, note, staff) VALUES (?, ?, ?, ?, ?, ?)').bind(new Date().toISOString(), day, user, amount, clean(body.note, 200), staff.user).run();
        return json({ ok: true, id: r.meta.last_row_id });
    }
    if (path.startsWith('/api/pos/pay/advance/') && request.method === 'DELETE') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const id = parseInt(path.slice('/api/pos/pay/advance/'.length), 10) || 0;
        await env.POS_DB.prepare('DELETE FROM pay_advances WHERE id = ?').bind(id).run();
        return json({ ok: true });
    }
    if (path === '/api/pos/payroll' && request.method === 'GET') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        const month = clean(new URL(request.url).searchParams.get('month'), 7) || cairoDay().slice(0, 7);
        return json(await payrollFor(env, month));
    }
    if (path === '/api/pos/payroll/pay' && request.method === 'POST') {
        if (!manager) return json({ error: 'forbidden' }, 403);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
        const user = clean(body.user, 40), month = clean(body.month, 7);
        if (!user || !/^\d{4}-\d{2}$/.test(month)) return json({ error: 'bad_fields' }, 400);
        const pr = await payrollFor(env, month);
        const row = pr.rows.find((x) => x.user === user);
        if (!row) return json({ error: 'unknown_user' }, 400);
        const amount = Math.round(Math.max(0, Math.min(row.due, Number(body.amount) || row.due)) * 100) / 100;
        if (amount <= 0) return json({ error: 'nothing_due' }, 400);
        const day = cairoDay(), ts = new Date().toISOString();
        await env.POS_DB.batch([
            env.POS_DB.prepare('INSERT INTO pay_runs (ts, day, user, month, amount, staff) VALUES (?, ?, ?, ?, ?, ?)').bind(ts, day, user, month, amount, staff.user),
            env.POS_DB.prepare('INSERT INTO expenses (ts, day, title, amount, cat, staff, note) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(ts, day, 'مرتب ' + user + ' - ' + month, amount, 'مرتبات', staff.user, 'payroll'),
        ]);
        return json({ ok: true, paid: amount });
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
    // نفس المفتاح = نفس البيع: لو الطلب اتعاد بعد ما نجح (نت ضعيف أو رد ضايع) بنرجّع نفس الفاتورة بدل ما نسجّل تاني
    const idemKey = clean(body.key, 64);
    const replay = async () => {
        if (!idemKey) return null;
        const row = await env.POS_DB.prepare("SELECT v FROM settings WHERE k = ?").bind('idem:' + idemKey).first();
        if (!row) return null;
        const inv = await env.POS_DB.prepare("SELECT id, num, ts, total, discount, customer_id FROM invoices WHERE id = ?").bind(parseInt(row.v, 10) || 0).first();
        if (!inv) return null;
        const pl = await env.POS_DB.prepare("SELECT kind, delta FROM points_log WHERE invoice_id = ?").bind(inv.id).all();
        const earnedR = (pl.results || []).filter((x) => x.kind === 'earn').reduce((a, x) => a + x.delta, 0);
        const redeemedR = -(pl.results || []).filter((x) => x.kind === 'redeem').reduce((a, x) => a + x.delta, 0);
        return { ok: true, replay: true, id: inv.id, num: inv.num, ts: inv.ts, total: inv.total, discount: inv.discount, pointsEarned: earnedR, pointsRedeemed: redeemedR, pointsBalance: inv.customer_id ? await customerPoints(env, inv.customer_id) : 0 };
    };
    { const done = await replay(); if (done) return done; }
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
    let invDisc = Math.max(0, Math.min(subtotal, Number(body.discount) || 0));
    // نقاط الولاء: استبدال نقاط بخصم
    const loy = await loyaltySettings(env);
    let redeem = Math.max(0, parseInt(body.redeemPoints, 10) || 0);
    if (redeem > 0) {
        if (!loy.enabled) return { error: 'loyalty_off', status: 400 };
        if (!customerId) return { error: 'customer_required', status: 400 };
        const bal = await customerPoints(env, customerId);
        if (redeem > bal) return { error: 'not_enough_points', status: 400, balance: bal };
        const maxPts = Math.floor((subtotal - invDisc) / loy.pointValue + 1e-9);
        if (redeem > maxPts) return { error: 'too_many_points', status: 400, max: maxPts };
        invDisc = Math.round((invDisc + redeem * loy.pointValue) * 100) / 100;
    }
    const total = Math.round((subtotal - invDisc) * 100) / 100;
    const earned = loy.enabled && customerId ? Math.floor(total / loy.earnEvery + 1e-9) : 0;

    // فحص مبدئي للمخزون (علشان نرجّع كود الصنف الناقص)، والحماية الفعلية جوه الدفعة الذرّية تحت
    const need = new Map();
    for (const l of lines) need.set(l.code, (need.get(l.code) || 0) + l.qty);
    const { results: stRows } = await env.POS_DB.prepare('SELECT code, qty FROM stock').all();
    const have = new Map((stRows || []).map((r) => [r.code, r.qty]));
    for (const [code, n] of need) {
        if (!have.has(code) || have.get(code) < n) return { error: 'insufficient_stock', code, status: 400 };
    }

    // دفعة واحدة ذرّية (كل حاجة أو ولا حاجة): إنقاص المخزون + الفاتورة + الأصناف + القيد المالي + النقاط.
    // لو أي صنف كميته مش كفاية، الإنقاص بيحاول يكتب NULL في عمود qty (NOT NULL) فالدفعة كلها بتتلغي ومفيش مخزون بينقص ولا فاتورة بتتسجل.
    // مفيش صف فاتورة معلّق بيتسجل خالص.
    const ts = new Date().toISOString();
    const day = cairoDay();
    const tok = 'T-' + crypto.randomUUID();
    const invId = '(SELECT id FROM invoices WHERE num = ?)';
    const stmts = [];
    if (idemKey) stmts.push(env.POS_DB.prepare("INSERT INTO settings (k, v) VALUES (?, '')").bind('idem:' + idemKey));
    for (const l of lines) {
        stmts.push(env.POS_DB.prepare("UPDATE stock SET qty = CASE WHEN qty >= ? THEN qty - ? ELSE NULL END WHERE code = ?").bind(l.qty, l.qty, l.code));
    }
    stmts.push(env.POS_DB.prepare("INSERT INTO invoices (num, ts, day, staff, payment, subtotal, discount, total, status, customer_name, customer_phone, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)")
        .bind(tok, ts, day, staffUser, payment, subtotal, Math.round(invDisc * 100) / 100, total, clean(body.customerName, 120), clean(body.customerPhone, 30), customerId || null));
    for (const l of lines) {
        stmts.push(env.POS_DB.prepare('INSERT INTO invoice_items (invoice_id, code, name, price, qty, discount, line_total, cost) VALUES (' + invId + ', ?, ?, ?, ?, ?, ?, ?)')
            .bind(tok, l.code, l.name, l.price, l.qty, l.discount, l.lineTotal, l.cost));
    }
    if (payment === 'debt') {
        stmts.push(env.POS_DB.prepare("INSERT INTO ledger (customer_id, ts, day, kind, amount, invoice_id, staff, note) VALUES (?, ?, ?, 'charge', ?, " + invId + ", ?, '')")
            .bind(customerId, ts, day, total, tok, staffUser));
    }
    if (customerId && redeem > 0) stmts.push(env.POS_DB.prepare("INSERT INTO points_log (customer_id, ts, day, delta, kind, invoice_id, note) VALUES (?, ?, ?, ?, 'redeem', " + invId + ", 'استبدال نقاط في INV-' || printf('%06d', " + invId + "))").bind(customerId, ts, day, -redeem, tok, tok));
    if (customerId && earned > 0) stmts.push(env.POS_DB.prepare("INSERT INTO points_log (customer_id, ts, day, delta, kind, invoice_id, note) VALUES (?, ?, ?, ?, 'earn', " + invId + ", 'مكتسبة من INV-' || printf('%06d', " + invId + "))").bind(customerId, ts, day, earned, tok, tok));
    const readIdx = stmts.length;
    stmts.push(env.POS_DB.prepare('SELECT id FROM invoices WHERE num = ?').bind(tok));
    if (idemKey) stmts.push(env.POS_DB.prepare("UPDATE settings SET v = CAST(" + invId + " AS TEXT) WHERE k = ?").bind(tok, 'idem:' + idemKey));
    stmts.push(env.POS_DB.prepare("UPDATE invoices SET num = 'INV-' || printf('%06d', id) WHERE num = ?").bind(tok));
    let results;
    try {
        results = await env.POS_DB.batch(stmts);
    } catch (e) {
        const msg = String(e?.message || e);
        const done = await replay();
        if (done) return done; // نفس المفتاح اتسجل في نفس اللحظة
        if (/NOT NULL/i.test(msg) && /qty/i.test(msg)) {
            // حد تاني خد الكمية في نفس اللحظة: مفيش حاجة اتسجلت، بنرجّع الصنف الناقص
            const { results: r2 } = await env.POS_DB.prepare('SELECT code, qty FROM stock').all();
            const h2 = new Map((r2 || []).map((r) => [r.code, r.qty]));
            for (const [code, n] of need) if ((h2.get(code) ?? 0) < n) return { error: 'insufficient_stock', code, status: 400 };
        }
        throw e;
    }
    const invoiceId = results[readIdx].results[0].id;
    const num = 'INV-' + String(invoiceId).padStart(6, '0');
    await syncStockFlags(env);
    return { ok: true, id: invoiceId, num, ts, total, discount: Math.round(invDisc * 100) / 100, pointsEarned: earned, pointsRedeemed: redeem, pointsBalance: customerId ? await customerPoints(env, customerId) : 0 };
}

// ---------- نقاط الولاء + الحضور + المرتبات: دوال مساعدة ----------
async function loyaltySettings(env) {
    const { results } = await env.POS_DB.prepare("SELECT k, v FROM settings WHERE k LIKE 'loyalty_%'").all();
    const m = new Map((results || []).map((r) => [r.k, r.v]));
    return {
        earnEvery: Number(m.get('loyalty_earn_every')) || 10,   // كل كام جنيه = نقطة
        pointValue: Number(m.get('loyalty_point_value')) || 0.5, // قيمة النقطة بالجنيه
        enabled: m.get('loyalty_enabled') !== '0',
    };
}
async function customerPoints(env, id) {
    const r = await env.POS_DB.prepare('SELECT COALESCE(SUM(delta), 0) AS p FROM points_log WHERE customer_id = ?').bind(id).first();
    return r?.p ?? 0;
}
// HH:MM بتوقيت القاهرة -> ISO UTC (القاهرة +2 شتاءً و+3 صيفاً: بنحسب الفرق الفعلي من النظام)
function cairoToIso(day, hhmm) {
    const [h, m] = String(hhmm).split(':').map((x) => parseInt(x, 10));
    if (!(h >= 0 && h < 24 && m >= 0 && m < 60)) return '';
    for (const off of [2, 3]) {
        const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), h - off, m));
        const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
        if (f === String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')) return d.toISOString();
    }
    return '';
}
async function payrollFor(env, month) {
    const from = month + '-01', to = month + '-31';
    const q = async (sql, ...a) => (await env.POS_DB.prepare(sql).bind(...a).all()).results || [];
    const rates = await q('SELECT user, kind, rate FROM pay_rates');
    const att = await q('SELECT user, day, check_in, check_out FROM attendance WHERE day >= ? AND day <= ?', from, to);
    const adv = await q('SELECT id, user, day, amount, note FROM pay_advances WHERE day >= ? AND day <= ? ORDER BY id DESC', from, to);
    const runs = await q('SELECT user, SUM(amount) AS paid FROM pay_runs WHERE month = ? GROUP BY user', month);
    const users = new Set([...rates.map((r) => r.user), ...att.map((a) => a.user), ...adv.map((a) => a.user)]);
    const rows = [...users].sort().map((user) => {
        const rt = rates.find((r) => r.user === user);
        const mine = att.filter((a) => a.user === user);
        const days = new Set(mine.map((a) => a.day)).size;
        let ms = 0;
        for (const a of mine) if (a.check_in && a.check_out) ms += Math.max(0, Date.parse(a.check_out) - Date.parse(a.check_in));
        const hours = Math.round((ms / 3600000) * 10) / 10;
        const kind = rt?.kind || 'month', rate = rt?.rate || 0;
        const earned = Math.round((kind === 'day' ? rate * days : rate) * 100) / 100;
        const advances = Math.round(adv.filter((a) => a.user === user).reduce((s, a) => s + a.amount, 0) * 100) / 100;
        const paid = Math.round((runs.find((r) => r.user === user)?.paid || 0) * 100) / 100;
        const due = Math.max(0, Math.round((earned - advances - paid) * 100) / 100);
        return { user, kind, rate, hasRate: !!rt, days, hours, earned, advances, paid, due };
    });
    return { month, rows, advances: adv };
}
