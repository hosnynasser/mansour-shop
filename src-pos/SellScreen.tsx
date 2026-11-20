import { useMemo, useRef, useState } from 'react';
import { api, buildWaText, fmt, CartLine, Invoice, Product } from './lib';

export default function SellScreen({
    products, onDone, onNeedRefresh, notify,
}: {
    products: Product[];
    onDone: (inv: Invoice, items: { code: string; name: string; price: number; qty: number; discount: number; line_total: number }[]) => void;
    onNeedRefresh: () => void;
    notify: (msg: string, bad?: boolean) => void;
}) {
    const [q, setQ] = useState('');
    const [cart, setCart] = useState<CartLine[]>([]);
    const [cartOpen, setCartOpen] = useState(false);
    const [payment, setPayment] = useState<'cash' | 'vcash'>('cash');
    const [invDisc, setInvDisc] = useState('');
    const [custName, setCustName] = useState('');
    const [custPhone, setCustPhone] = useState('');
    const [busy, setBusy] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return products;
        return products.filter((p) => p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s));
    }, [q, products]);

    const addLine = (p: Product) => {
        setCart((c) => {
            const i = c.findIndex((l) => l.code === p.code);
            if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
            return [...c, { code: p.code, name: p.name, price: p.price, qty: 1, discount: 0 }];
        });
    };
    const setQty = (code: string, d: number) =>
        setCart((c) => c.map((l) => (l.code === code ? { ...l, qty: Math.max(1, l.qty + d) } : l)));
    const removeLine = (code: string) => setCart((c) => c.filter((l) => l.code !== code));
    const setLineDisc = (code: string, v: string) =>
        setCart((c) => c.map((l) => (l.code === code ? { ...l, discount: Math.max(0, Number(v) || 0) } : l)));

    const subtotal = cart.reduce((s, l) => s + Math.max(0, l.price * l.qty - l.discount), 0);
    const disc = Math.max(0, Math.min(subtotal, Number(invDisc) || 0));
    const total = subtotal - disc;
    const count = cart.reduce((s, l) => s + l.qty, 0);

    const submit = async () => {
        if (!cart.length || busy) return;
        setBusy(true);
        try {
            const r = await api('/api/pos/invoices', 'POST', {
                items: cart.map((l) => ({ code: l.code, qty: l.qty, discount: l.discount })),
                payment, discount: disc, customerName: custName.trim(), customerPhone: custPhone.trim(),
            });
            const inv: Invoice = {
                id: r.id, num: r.num, ts: r.ts, staff: '', payment,
                subtotal: Math.round(subtotal * 100) / 100, discount: Math.round(disc * 100) / 100, total: r.total,
                status: 'completed', customer_name: custName.trim(), customer_phone: custPhone.trim(),
            };
            const items = cart.map((l) => ({
                code: l.code, name: l.name, price: l.price, qty: l.qty,
                discount: Math.round(l.discount * 100) / 100, line_total: Math.max(0, l.price * l.qty - l.discount),
            }));
            setCart([]); setCartOpen(false); setInvDisc(''); setCustName(''); setCustPhone('');
            onDone(inv, items);
            onNeedRefresh();
        } catch (e: any) {
            if (e?.data?.error === 'insufficient_stock') {
                notify('الكمية المطلوبة أكبر من المخزون المتاح للصنف ' + e.data.code, true);
                onNeedRefresh();
            } else {
                notify('حصلت مشكلة في تسجيل البيع، جرب تاني', true);
            }
        }
        setBusy(false);
    };

    return (
        <>
            <div className="search-wrap">
                <div className="search-box">
                    <span>🔍</span>
                    <input
                        ref={searchRef}
                        placeholder="ابحث بالاسم أو الكود…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        inputMode="search"
                    />
                    {q ? <button className="btn-ghost btn btn-sm" onClick={() => { setQ(''); searchRef.current?.focus(); }}>مسح</button> : null}
                </div>
            </div>

            {filtered.length === 0 ? <div className="empty">مفيش أصناف مطابقة للبحث</div> : (
                <div className="prod-grid">
                    {filtered.map((p) => {
                        const out = p.qty <= 0;
                        return (
                            <button key={p.code} className={'prod-card' + (out ? ' out' : '')} onClick={() => addLine(p)}>
                                <span className={'pq' + (out ? ' zero' : p.qty <= 5 ? ' low' : '')}>{out ? 'خلص' : p.qty}</span>
                                <span className="pn">{p.name}</span>
                                <span className="pc">{p.code}</span>
                                <span className="pp">{fmt(p.price)} ج</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {cart.length > 0 && !cartOpen ? (
                <button className="cart-bar" onClick={() => setCartOpen(true)}>
                    <span className="cnt">{count}</span>
                    <span>عرض الفاتورة</span>
                    <span className="tot">{fmt(total)} ج</span>
                </button>
            ) : null}

            {cartOpen ? (
                <>
                    <div className="sheet-back" onClick={() => setCartOpen(false)} />
                    <div className="sheet">
                        <div className="sheet-h">
                            <h3>🧾 فاتورة جديدة</h3>
                            <button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setCartOpen(false)}>رجوع للأصناف</button>
                        </div>
                        <div className="sheet-b">
                            {cart.map((l) => (
                                <div className="cline" key={l.code}>
                                    <div className="cn">
                                        <b>{l.name}</b>
                                        <span>{fmt(l.price)} ج</span>
                                    </div>
                                    <div className="stepper">
                                        <button onClick={() => setQty(l.code, 1)}>+</button>
                                        <span className="qv">{l.qty}</span>
                                        <button onClick={() => (l.qty === 1 ? removeLine(l.code) : setQty(l.code, -1))}>−</button>
                                    </div>
                                    <input className="mini-disc" placeholder="خصم" inputMode="decimal" value={l.discount || ''} onChange={(e) => setLineDisc(l.code, e.target.value)} title="خصم على الصنف بالجنيه" />
                                    <span className="lt">{fmt(Math.max(0, l.price * l.qty - l.discount))}</span>
                                </div>
                            ))}

                            <div style={{ margin: '14px 0 6px' }}>
                                <div className="field">
                                    <label>خصم على الفاتورة كلها (جنيه)</label>
                                    <input inputMode="decimal" value={invDisc} onChange={(e) => setInvDisc(e.target.value)} placeholder="0" />
                                </div>
                                <div className="field">
                                    <label>طريقة الدفع</label>
                                    <div className="pay-toggle">
                                        <button className={payment === 'cash' ? 'on' : ''} onClick={() => setPayment('cash')}>💵 كاش</button>
                                        <button className={payment === 'vcash' ? 'on' : ''} onClick={() => setPayment('vcash')}>📱 فودافون كاش</button>
                                    </div>
                                </div>
                                <div className="field">
                                    <label>اسم العميل (اختياري)</label>
                                    <input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="اسم العميل" />
                                </div>
                                <div className="field">
                                    <label>رقم واتساب العميل (اختياري — لإرسال الفاتورة)</label>
                                    <input inputMode="tel" dir="ltr" style={{ textAlign: 'end' }} value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="01xxxxxxxxx" />
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: '12px 18px calc(14px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--line)' }}>
                            <button className="btn btn-amber btn-block" disabled={busy || !cart.length} onClick={submit}>
                                {busy ? 'جاري التسجيل…' : `✅ تسجيل البيع — ${fmt(total)} ج`}
                            </button>
                        </div>
                    </div>
                </>
            ) : null}
        </>
    );
}
