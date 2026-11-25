import React, { useEffect, useMemo, useRef, useState } from 'react';
import PN from './Bidi';
import { api, fmt, CartLine, Customer, Invoice, Product } from './lib';
import { getOp, recordTiming, retrySale, startSale, subscribeOp } from './saleOp';
import ScannerModal from './ScannerModal';
import Icon from './Icon';
import CatChips from './CatChips';
import { Loyalty } from './LoyaltyUI';

export default function SellScreen({
    products, categories, onDone, onNeedRefresh, notify, presetCust, onPresetUsed, quoteMode, onQuoteExit,
}: {
    quoteMode?: boolean;
    onQuoteExit?: (saved: boolean) => void;
    presetCust?: number;
    onPresetUsed?: () => void;
    products: Product[];
    categories: string[];
    onDone: (inv: Invoice, items: { code: string; name: string; price: number; qty: number; discount: number; line_total: number }[], timing?: string) => void;
    onNeedRefresh: () => void;
    notify: (msg: string, bad?: boolean) => void;
}) {
    const [q, setQ] = useState('');
    const [cart, setCart] = useState<CartLine[]>([]);
    const [cartOpen, setCartOpen] = useState(false);
    const [payment, setPayment] = useState<'cash' | 'vcash' | 'debt'>('cash');
    const [customers, setCustomers] = useState<Customer[] | null>(null);
    const [custId, setCustId] = useState(0);
    const [pickOpen, setPickOpen] = useState(false);
    const [custQ, setCustQ] = useState('');
    const [newCustName, setNewCustName] = useState('');
    const [newCustPhone, setNewCustPhone] = useState('');
    const [invDisc, setInvDisc] = useState('');
    const [custName, setCustName] = useState('');
    const [custPhone, setCustPhone] = useState('');
    const [busy, setBusy] = useState(false);
    const [loy, setLoy] = useState<Loyalty | null>(null);
    const [ptsPick, setPtsPick] = useState(false);
    const [redeem, setRedeem] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);

    const [catSel, setCatSel] = useState('');
    const hasUncat = products.some((p) => !p.cat || !categories.includes(p.cat));
    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        return products.filter((p) => {
            if (catSel === '__none') { if (p.cat && categories.includes(p.cat)) return false; }
            else if (catSel && p.cat !== catSel) return false;
            return !s || p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s);
        });
    }, [q, products, catSel, categories]);

    // تحميل تدريجي: دفعة صغيرة الأول، والباقي بيتحمّل لما المستخدم يسكرول
    const BATCH = 120;
    const [shown, setShown] = useState(BATCH);
    const sentinel = useRef<HTMLDivElement>(null);
    useEffect(() => { setShown(BATCH); }, [q, catSel]);
    const hasMore = shown < filtered.length;
    useEffect(() => {
        const el = sentinel.current;
        if (!el || !hasMore) return;
        const io = new IntersectionObserver((es) => {
            if (es.some((e) => e.isIntersecting)) setShown((n) => n + BATCH);
        }, { rootMargin: '600px 0px' });
        io.observe(el);
        return () => io.disconnect();
    }, [hasMore, shown, filtered]);

    const addLine = (p: Product) => {
        if (getOp()) return;
        setCart((c) => {
            const i = c.findIndex((l) => l.code === p.code);
            if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
            return [...c, { code: p.code, name: p.name, price: p.price, qty: 1, discount: 0 }];
        });
    };
    const setQty = (code: string, d: number) => getOp() ? undefined :
        setCart((c) => c.map((l) => (l.code === code ? { ...l, qty: Math.max(1, l.qty + d) } : l)));
    const removeLine = (code: string) => getOp() ? undefined : setCart((c) => c.filter((l) => l.code !== code));
    const setLineDisc = (code: string, v: string) => getOp() ? undefined :
        setCart((c) => c.map((l) => (l.code === code ? { ...l, discount: Math.max(0, Number(v) || 0) } : l)));

    const subtotal = cart.reduce((s, l) => s + Math.max(0, l.price * l.qty - l.discount), 0);
    const disc0 = Math.max(0, Math.min(subtotal, Number(invDisc) || 0));
    const selCust = (customers || []).find((c) => c.id === custId);
    const custPts = selCust?.points || 0;
    const pv = loy?.pointValue || 0.5;
    const maxPts = loy && loy.enabled && custId ? Math.max(0, Math.min(custPts, Math.floor((subtotal - disc0) / pv + 1e-9))) : 0;
    const redeemPts = Math.max(0, Math.min(maxPts, parseInt(redeem, 10) || 0));
    const disc = disc0 + redeemPts * pv;
    const total = subtotal - disc;
    const earnPreview = loy && loy.enabled && custId ? Math.floor(total / loy.earnEvery + 1e-9) : 0;

    const count = cart.reduce((s, l) => s + l.qty, 0);

    useEffect(() => { if (quoteMode) { setPayment('cash'); setCustId(0); setPickOpen(false); } }, [quoteMode]);
    const nameRef = useRef<HTMLInputElement>(null);
    useEffect(() => { if (pickOpen) nameRef.current?.focus(); else setCustQ(''); }, [pickOpen]);
    const togglePick = async () => {
        setPickOpen((v) => !v);
        if (customers === null) { try { const r = await api('/api/pos/customers'); setCustomers(r.customers || []); } catch { notify('مشكلة في تحميل العملاء', true); setCustomers([]); } }
    };
    const pickDebt = async () => {
        setPayment('debt');
        if (!custId) setPickOpen(true);
        if (customers === null) {
            try { const r = await api('/api/pos/customers'); setCustomers(r.customers || []); } catch { notify('مشكلة في تحميل العملاء', true); setCustomers([]); }
        }
    };
    // جاي من كارت العميل: افتح آجل على العميل ده
    useEffect(() => {
        if (!presetCust) return;
        (async () => {
            setPayment('debt'); if (cart.length) setCartOpen(true);
            let list = customers;
            if (list === null) {
                try { const r = await api('/api/pos/customers'); list = r.customers || []; setCustomers(list); } catch { notify('مشكلة في تحميل العملاء', true); list = []; setCustomers([]); }
            }
            const pc = (list || []).find((c) => c.id === presetCust);
            if (pc) { setCustId(presetCust); if (!cart.length) notify('العميل ' + pc.name + ' متحدد للآجل. ضيف الأصناف وبعدين افتح السلة'); }
            onPresetUsed && onPresetUsed();
        })();
    }, [presetCust]);
    const quickAddCustomer = async () => {
        if (newCustName.trim().length < 2) { notify('اكتب اسم العميل', true); return; }
        try {
            const r = await api('/api/pos/customers', 'POST', { name: newCustName.trim(), phone: newCustPhone.trim() });
            setCustomers((cs) => [...(cs || []), { id: r.id, name: newCustName.trim(), phone: newCustPhone.trim(), notes: '' }]);
            setCustId(r.id); setNewCustName(''); setNewCustPhone('');
            notify('اتضاف العميل واتختار ✓');
        } catch { notify('مشكلة في إضافة العميل', true); }
    };

    const [scanOpen, setScanOpen] = useState(false);
    const onScanned = (code: string) => {
        setScanOpen(false);
        const c = code.toLowerCase();
        const p = products.find((x) => ((x as any).barcode || '').toLowerCase() === c || x.code.toLowerCase() === c);
        if (p) { addLine(p); notify('اتضاف: ' + p.name + ' ✓'); }
        else notify('الباركود ده مش متسجل لأي صنف', true);
    };

    const saveQuote = async () => {
        if (!cart.length || busy) return;
        setBusy(true);
        try {
            const r = await api('/api/pos/quotes', 'POST', {
                items: cart.map((l) => ({ code: l.code, qty: l.qty, discount: l.discount })),
                discount: disc0, customerName: custName.trim() || selCust?.name || '', customerPhone: custPhone.trim() || selCust?.phone || '',
            });
            setCart([]); setCartOpen(false); setInvDisc(''); setCustName(''); setCustPhone(''); setCustId(0); setCustQ('');
            notify('اتحفظ عرض السعر ' + r.num + ' ✓');
            onQuoteExit?.(true);
        } catch { notify('مشكلة في حفظ العرض، جرب تاني', true); }
        setBusy(false);
    };

    const [, force] = useState(0);
    useEffect(() => subscribeOp(() => force((n) => n + 1)), []);
    const pend = getOp();
    useEffect(() => { if (!pend) return; const t = setInterval(() => force((n) => n + 1), 1000); return () => clearInterval(t); }, [!!pend]);
    const slow = pend && pend.state === 'sending' && Date.now() - pend.startedAt > 5000;

    const submit = () => {
        if (!cart.length || busy || getOp()) return;
        if (payment === 'debt' && !custId) { notify('اختار العميل اللي هيسجل عليه الآجل', true); return; }
        const payload = {
            items: cart.map((l) => ({ code: l.code, qty: l.qty, discount: l.discount })),
            payment, discount: disc0, customerName: custName.trim(), customerPhone: custPhone.trim(),
            customerId: custId || undefined, redeemPoints: redeemPts || undefined,
        };
        // لقطة وقت التسجيل: الفاتورة اللي هتظهر مبنية على اللي اتبعت فعلًا حتى لو الرد اتأخر أو الشاشة اتقفلت
        const snap = { payment, subtotal, disc, custName: custName.trim(), custPhone: custPhone.trim(), selName: selCust?.name || '', selPhone: selCust?.phone || '', cart: cart.map((l) => ({ ...l })) };
        startSale(payload, total, cart.length, (r, totalMs) => {
            const inv: Invoice = {
                id: r.id, num: r.num, ts: r.ts, staff: '', payment: snap.payment,
                subtotal: Math.round(snap.subtotal * 100) / 100, discount: r.discount ?? Math.round(snap.disc * 100) / 100, total: r.total,
                status: 'completed', customer_name: snap.custName || snap.selName, customer_phone: snap.custPhone || snap.selPhone,
                pointsEarned: r.pointsEarned, pointsBalance: r.pointsBalance,
            };
            const items = snap.cart.map((l) => ({
                code: l.code, name: l.name, price: l.price, qty: l.qty,
                discount: Math.round(l.discount * 100) / 100, line_total: Math.max(0, l.price * l.qty - l.discount),
            }));
            recordTiming({ total: totalMs, srv: typeof r.srvMs === 'number' ? r.srvMs : undefined, attempts: 0, replay: !!r.replay, items: snap.cart.length });
            const sec = (n: number) => (n / 1000).toFixed(1);
            const timing = '⏱ ' + sec(totalMs) + ' ث' + (typeof r.srvMs === 'number' ? ' (الخادم ' + sec(r.srvMs) + ' ث)' : '') + (r.replay ? ' · نفس الفاتورة اتسجلت قبل كده' : '');
            setCart([]); setCartOpen(false); setInvDisc(''); setCustName(''); setCustPhone(''); setCustId(0); setPickOpen(false); setCustQ(''); setRedeem(''); setPtsPick(false);
            setCustomers(null); setLoy(null);
            onDone(inv, items, timing);
            onNeedRefresh();
        }, (d) => {
            if (d?.error === 'insufficient_stock') {
                notify('الكمية المطلوبة أكبر من المخزون المتاح للصنف ' + d.code, true);
                onNeedRefresh();
            } else if (d?.error === 'not_enough_points' || d?.error === 'too_many_points') {
                notify('النقاط المطلوبة أكتر من المتاح، عدّل العدد', true);
            } else {
                notify('حصلت مشكلة في تسجيل البيع، جرب تاني', true);
            }
        });
    };

    const pendBanner = pend && pend.state === 'unconfirmed' ? (
        <div style={{ margin: '0 0 10px', padding: '10px 12px', borderRadius: 12, background: '#fff3e0', border: '1.5px solid var(--amber)', fontSize: 13, lineHeight: 1.7 }}>
            <b>⚠️ الرد على تسجيل البيع ({fmt(pend.total)} ج، {pend.count} صنف) اتأخر، ومش متأكدين إن الفاتورة اتسجلت.</b>
            <div>متسجلش نفس السلة تاني. زرار «إعادة المحاولة» بيبعت نفس الطلب بنفس المفتاح: لو الفاتورة اتسجلت هترجع هي نفسها، ولو ما اتسجلتش هتتسجل دلوقتي مرة واحدة.</div>
            <button className="btn btn-amber btn-block" style={{ marginTop: 8 }} disabled={pend.retryBusy} onClick={retrySale}>{pend.retryBusy ? 'جاري إعادة المحاولة…' : 'إعادة المحاولة بنفس العملية'}</button>
        </div>
    ) : null;

    return (
        <>
            {!cartOpen ? pendBanner : null}
            {quoteMode ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px', padding: '10px 12px', borderRadius: 12, background: '#fff8ea', border: '1.5px dashed var(--amber)' }}>
                    <b style={{ fontSize: 13, color: 'var(--navy)', flex: 1 }}>💾 عرض سعر جديد — مش هيسجّل بيع ومش هينقص المخزون</b>
                    <button className="btn btn-ghost btn-sm" onClick={() => onQuoteExit?.(false)}>إلغاء</button>
                </div>
            ) : null}
            <div className="search-wrap">
                <div className="search-box">
                    <span className="si"><Icon n="search" size={20} /></span>
                    <input
                        ref={searchRef}
                        placeholder="ابحث بالاسم أو الكود…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        inputMode="search"
                    />
                    {q ? <button className="btn-ghost btn btn-sm" onClick={() => { setQ(''); searchRef.current?.focus(); }}>مسح</button> : null}
                    <button className="btn btn-navy btn-sm" onClick={() => setScanOpen(true)} title="قارئ الباركود"><Icon n="camera" size={18} /></button>
                </div>
            </div>

            <CatChips categories={categories} sel={catSel} setSel={setCatSel} extraNone={hasUncat} products={products} />

            {filtered.length === 0 ? <div className="empty">مفيش أصناف مطابقة للبحث</div> : (
                <div className="prod-grid">
                    {filtered.slice(0, shown).map((p) => {
                        const out = p.qty <= 0;
                        return (
                            <button key={p.code} className={'prod-card' + (out ? ' out' : '')} onClick={() => addLine(p)}>
                                <span className={'pq' + (out ? ' zero' : p.qty <= 5 ? ' low' : '')}>{out ? 'خلص' : p.qty}</span>
                                <span className="pn"><PN t={p.name} /></span>
                                <span className="pc">{p.code}</span>
                                <span className="pp">{fmt(p.price)} ج</span>
                            </button>
                        );
                    })}
                </div>
            )}
            {hasMore ? <div ref={sentinel} className="more-sentinel">جاري تحميل المزيد… ({shown} من {filtered.length})</div> : null}

            {cart.length > 0 && !cartOpen ? (
                <button className="cart-bar" onClick={() => setCartOpen(true)}>
                    <span className="cnt">{count}</span>
                    <span>{quoteMode ? 'عرض السعر' : 'عرض الفاتورة'}</span>
                    <span className="tot">{fmt(total)} ج</span>
                </button>
            ) : null}

            {cartOpen ? (
                <>
                    <div className="sheet-back" onClick={() => setCartOpen(false)} />
                    <div className="sheet">
                        <div className="sheet-h">
                            <h3>{quoteMode ? '💾 عرض سعر جديد' : '🧾 فاتورة جديدة'}</h3>
                            <button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setCartOpen(false)}>رجوع للأصناف</button>
                        </div>
                        <div className="sheet-b">
                            <span data-dirty="0" hidden />
                            <fieldset disabled={!!pend} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                            {cart.map((l) => (
                                <div className="cline" key={l.code}>
                                    <div className="cn">
                                        <b><PN t={l.name} /></b>
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
                                {(
                                <div className="field">
                                    <label>اسم العميل{payment === 'debt' ? '' : ' (اختياري)'}</label>
                                    <div className="cust-dd-wrap" style={{ position: 'relative', marginBottom: 12 }}>
                                        <input ref={nameRef} value={pickOpen ? custQ : selCust ? selCust.name : payment === 'debt' ? '' : custName} readOnly={!pickOpen && (!!custId || payment === 'debt')} onChange={(e) => { if (pickOpen) setCustQ(e.target.value); else setCustName(e.target.value); }} placeholder={pickOpen ? 'ابحث عن عميل…' : payment === 'debt' ? 'اختار عميل من القايمة' : 'اسم العميل'} onClick={() => { if (!pickOpen && (custId || payment === 'debt')) togglePick(); }} style={{ width: '100%', paddingLeft: custId ? 112 : 58 }} />
                                        <button className="btn btn-navy btn-sm" aria-label="اختيار عميل من الموجودين" title="اختيار عميل من الموجودين" style={{ position: 'absolute', left: 5, top: 5, bottom: 5, width: 46, minHeight: 0, padding: 0, justifyContent: 'center' }} onClick={togglePick}>
                                            <span style={{ fontSize: 16, lineHeight: 1, display: 'inline-block', transform: pickOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
                                        </button>
                                        {custId ? <button className="btn btn-ghost btn-sm" style={{ position: 'absolute', left: 56, top: 5, bottom: 5, minHeight: 0, padding: '0 10px' }} onClick={() => { setCustId(0); setPickOpen(false); }}>شيل</button> : null}
                                    {pickOpen ? (
                                        <>
                                            <div className="cat-dd-back" onClick={() => setPickOpen(false)} />
                                            <div className="cat-dd-list cust-dd" role="listbox" aria-label="العملاء">
                                                
                                                {customers === null ? <div className="cust-dd-empty">جاري تحميل العملاء…</div> : null}
                                                {(customers || []).filter((c) => !custQ.trim() || c.name.toLowerCase().includes(custQ.trim().toLowerCase()) || c.phone.includes(custQ.trim())).slice(0, 40).map((c) => (
                                                    <button key={c.id} role="option" aria-selected={custId === c.id} className={custId === c.id ? 'on' : ''} onClick={() => { setCustId(c.id); setCustName(''); setPickOpen(false); nameRef.current?.blur(); }}>
                                                        <span className="cd-n"><b>{c.name}</b>{c.phone ? <small dir="ltr">{c.phone}</small> : null}</span>
                                                        {(c.balance || 0) > 0 ? <span className="cd-b">عليه {fmt(c.balance!)}</span> : null}
                                                    </button>
                                                ))}
                                                {customers !== null && (customers || []).length === 0 ? <div className="cust-dd-empty">مفيش عملاء لسه</div> : null}
                                                <div className="cust-dd-new">
                                                    <input placeholder="اسم عميل جديد" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} />
                                                    <input placeholder="تليفون" inputMode="tel" dir="ltr" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} style={{ textAlign: 'end' }} />
                                                    <button className="btn btn-navy btn-sm" onClick={quickAddCustomer}>إضافة</button>
                                                </div>
                                            </div>
                                        </>
                                    ) : null}
                                    </div>
                                    {!quoteMode ? (<>
                                    <label>طريقة الدفع</label>
                                    <div className="pay-toggle">
                                        <button className={payment === 'cash' ? 'on' : ''} onClick={() => setPayment('cash')}>💵 كاش</button>
                                        <button className={payment === 'vcash' ? 'on' : ''} onClick={() => setPayment('vcash')}>📱 فودافون كاش</button>
                                        <button className={payment === 'debt' ? 'on' : ''} onClick={pickDebt}>🧾 آجل</button>
                                    </div>
                                    </>) : null}
                                </div>
                                )}
                                {quoteMode || payment !== 'debt' ? (
                                    <div className="field">
                                        <label>رقم واتساب العميل (اختياري — لإرسال الفاتورة)</label>
                                        <input inputMode="tel" dir="ltr" style={{ textAlign: 'end' }} value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="01xxxxxxxxx" />
                                    </div>
                                ) : null}
                                <div className="field">
                                    <label>خصم على الفاتورة كلها (جنيه)</label>
                                    <input inputMode="decimal" value={invDisc} onChange={(e) => setInvDisc(e.target.value)} placeholder="0" />
                                </div>
                            </div>
                            </fieldset>
                        </div>
                        <div style={{ padding: '12px 18px calc(14px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--line)', display: 'grid', gap: 8 }}>
                            {pendBanner}
                            {quoteMode ? (
                                <button className="btn btn-amber btn-block" disabled={busy || !cart.length} onClick={saveQuote}>
                                    {busy ? 'جاري الحفظ…' : `💾 حفظ عرض السعر — ${fmt(subtotal - disc0)} ج`}
                                </button>
                            ) : (
                                <>
                                <button className="btn btn-amber btn-block" disabled={busy || !cart.length || !!pend} onClick={submit}>
                                    {pend ? (pend.state === 'sending' ? 'جاري التسجيل…' : 'نتيجة البيع لسه مش مؤكدة') : `✅ تسجيل البيع — ${fmt(total)} ج`}
                                </button>
                                {slow ? <div style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center' }}>التسجيل بياخد وقت… متقفلش التطبيق ومتكررش الضغط.</div> : null}
                                </>
                            )}
                        </div>
                    </div>
                </>
            ) : null}
            {scanOpen ? <ScannerModal title="امسح باركود الصنف" onScan={onScanned} onClose={() => setScanOpen(false)} /> : null}
        </>
    );
}
