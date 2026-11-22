import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import PN from './Bidi';
import { api, apiT, cget, cset, csetIf, cred, cairoToday, fmt, fmtTime, paymentLabel, Customer, Expense, Invoice, LedgerEntry, Product, Quote, Report, Role, Staff } from './lib';
import Icon from './Icon';
import CatChips from './CatChips';
import ScannerModal from './ScannerModal';
import { ExportCard, ProfitView } from './ReportsExtra';
import { Loyalty } from './LoyaltyUI';
import { NewSupplierSheet, SupplierSheet } from './PurchasesScreen';

// تحميل تدريجي: بيعرض أول 40 وبيزود لما المستخدم ينزل
function MoreSentinel({ shown, total, more }: { shown: number; total: number; more: () => void }) {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const el = ref.current; if (!el || shown >= total) return;
        const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) more(); }, { rootMargin: '400px' });
        io.observe(el); return () => io.disconnect();
    });
    return shown < total ? <div ref={ref} className="empty" style={{ padding: 12 }}>…</div> : null;
}
const PAGE_N = 40;
const STOCK_N = 200;
// بحث ذكي: بيتجاهل التشكيل والهمزات والتاء المربوطة والياء، والمسافات، وكل كلمة لازم تتطابق
const norm = (t: string) => (t || '').toLowerCase().replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىئ]/g, 'ي').replace(/ؤ/g, 'و').replace(/\s+/g, ' ').trim();
const smartMatch = (hay: string, q: string) => { const t = norm(q); if (!t) return true; const h = norm(hay); return t.split(' ').every((w) => h.includes(w)); };

// ---------- فواتير ----------
export function InvoicesScreen({ staff, openInvoice, openQuote, notify }: { staff: Staff; openInvoice: (id: number) => void; openQuote: (id: number) => void; notify: (m: string, b?: boolean) => void }) {
    const [list, setList] = useState<Invoice[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [view, setView] = useState<'mine' | 'all' | 'quotes'>('mine');
    const [loading, setLoading] = useState(true);
    const manager = staff.role === 'manager';

    const [more, setMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const sentinel = useRef<HTMLDivElement | null>(null);
    const PAGE = 30;
    const base = () => '/api/pos/invoices?limit=' + PAGE + (manager && view === 'all' ? '&all=1' : '');
    const ckey = 'inv_' + staff.user + '_' + view;

    const load = async () => {
        if (view === 'quotes') {
            const c = cget<Quote[]>('quotes_' + staff.user); if (c) { setQuotes(c); setLoading(false); } else setLoading(true);
        } else {
            const c = cget<Invoice[]>(ckey); if (c) { setList(c); setLoading(false); } else setLoading(true);
        }
        try {
            if (view === 'quotes') {
                const r = await api('/api/pos/quotes' + (manager ? '?all=1' : ''));
                setQuotes(r.quotes || []); cset('quotes_' + staff.user, (r.quotes || []).slice(0, 60));
            } else {
                const r = await api(base());
                setList(r.invoices || []); setMore(!!r.more); cset(ckey, (r.invoices || []).slice(0, PAGE));
            }
        } catch { notify('مشكلة في التحميل', true); }
        setLoading(false);
    };
    useEffect(() => { load(); }, [view]);

    const loadMore = async () => {
        if (loadingMore || !more || !list.length) return;
        setLoadingMore(true);
        try {
            const r = await api(base() + '&before=' + list[list.length - 1].id);
            setList((l) => [...l, ...(r.invoices || [])]); setMore(!!r.more);
        } catch {}
        setLoadingMore(false);
    };
    useEffect(() => {
        const el = sentinel.current; if (!el || !more) return;
        const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) loadMore(); }, { rootMargin: '300px' });
        io.observe(el); return () => io.disconnect();
    });

    const qBadge = (st: string) => (st === 'converted' ? '✅ اتحولت لفاتورة' : st === 'canceled' ? '❌ ملغي' : '🕐 مفتوح');

    return (
        <>
            <div className="pay-toggle" style={{ marginBottom: 12 }}>
                <button className={view === 'mine' ? 'on' : ''} onClick={() => setView('mine')}>فواتيري</button>
                {manager ? <button className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>كل الفواتير</button> : null}
                <button className={view === 'quotes' ? 'on' : ''} onClick={() => setView('quotes')}>💾 عروض الأسعار</button>
            </div>
            {view === 'quotes' ? (
                loading ? <div className="empty">جاري التحميل…</div> : quotes.length === 0 ? <div className="empty">مفيش عروض أسعار لسه — احفظ واحد من السلة بزرار 💾</div> : quotes.map((q) => (
                    <button key={q.id} className="inv-row" style={{ width: '100%', border: '1.5px solid var(--line)', textAlign: 'start' }} onClick={() => openQuote(q.id)}>
                        <div>
                            <div className="n">{q.num}</div>
                            <div className="m">{fmtTime(q.ts)} · {q.staff}{q.customer_name ? ' · ' + q.customer_name : ''}</div>
                            <div className="m" style={{ fontSize: 11 }}>{qBadge(q.status)}{q.status === 'converted' && q.invoice_id ? '' : ''}</div>
                        </div>
                        <span className="amt">{fmt(q.total)} ج</span>
                    </button>
                ))
            ) : (
                loading ? <div className="empty">جاري التحميل…</div> : list.length === 0 ? <div className="empty">مفيش فواتير لسه</div> : list.map((v) => (
                    <button key={v.id} className="inv-row" style={{ width: '100%', border: '1.5px solid var(--line)', textAlign: 'start' }} onClick={() => openInvoice(v.id)}>
                        <div className={v.status === 'voided' ? 'voided' : ''}>
                            <div className="n">{v.num} {v.status === 'voided' ? '(ملغاة)' : ''}</div>
                            <div className="m">{fmtTime(v.ts)} · {v.staff}{v.customer_name ? ' · ' + v.customer_name : ''}</div>
                        </div>
                        <span className={'badge ' + (v.payment === 'vcash' ? 'vcash' : 'cash')}>{paymentLabel(v.payment)}</span>
                        <span className={'amt' + (v.status === 'voided' ? ' voided' : '')}>{fmt(v.total)} ج</span>
                    </button>
                ))
            )}
            {view !== 'quotes' && more ? <div ref={sentinel} className="empty" style={{ padding: 16 }}>{loadingMore ? 'جاري التحميل…' : ''}</div> : null}
        </>
    );
}

// ---------- تبويب الموردين (نفس بيانات المشتريات الحالية، عرض بس) ----------
function SuppliersPane({ notify }: { notify: (m: string, b?: boolean) => void }) {
    const [list, setList] = useState<any[] | null>(() => cget<any[]>('suppliers'));
    const [fst, setFst] = useState<'loading' | 'ok' | 'err'>('loading');
    const [q, setQ] = useState('');
    const [grpSel, setGrpSel] = useState('');
    const [newOpen, setNewOpen] = useState(false);
    const [det, setDet] = useState<any>(null);
    const load = async () => { const c0 = cred(); setFst('loading'); try { const r = await api('/api/pos/suppliers'); setList(r.suppliers || []); csetIf('suppliers', r.suppliers || [], c0); setFst('ok'); } catch { setFst('err'); notify('مشكلة في تحميل الموردين، الأرقام المعروضة قديمة', true); } };
    useEffect(() => { load(); }, []);
    const open = async (id: number) => { try { const r = await api('/api/pos/supplier/' + id); setDet({ s: r.supplier, purchases: r.purchases || [] }); } catch { notify('مشكلة في فتح المورد', true); } };
    const all = list || [];
    const groups = useMemo(() => Array.from(new Set(all.map((x) => (x.grp || '').trim()).filter(Boolean))).sort() as string[], [list]);
    useEffect(() => { if (grpSel && grpSel !== '__none' && !groups.includes(grpSel)) setGrpSel(''); }, [groups, grpSel]);
    const rows = all.filter((x) => (!grpSel || (grpSel === '__none' ? !(x.grp || '').trim() : (x.grp || '').trim() === grpSel)) && smartMatch(x.name + ' ' + (x.phone || '') + ' ' + (x.grp || ''), q));
    // اتجاه الحساب: رصيد المورد الموجب = مستحق له علينا (عليا). الرصيد السالب (لو حصل) = ليا عنده
    const owed = all.reduce((a, x) => a + Math.max(0, x.balance || 0), 0);
    const mine = all.reduce((a, x) => a + Math.max(0, -(x.balance || 0)), 0);
    const net = mine - owed;
    const Cell = ({ l, v, c }: { l: string; v: string; c?: string }) => (
        <div style={{ flex: 1, textAlign: 'center', padding: '6px 4px', minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{l}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: c || 'var(--navy)' }}>{v}</div>
        </div>
    );
    return (
        <>
            <div className="close-card" style={{ display: 'flex', padding: '2px 4px', marginBottom: 8 }}>
                <Cell l="ليا (عند الموردين)" v={fmt(mine) + ' ج'} c="var(--ok)" />
                <Cell l="عليا (للموردين)" v={fmt(owed) + ' ج'} c="var(--danger)" />
                <Cell l={net >= 0 ? 'الصافي (ليا)' : 'الصافي (عليا)'} v={fmt(Math.abs(net)) + ' ج'} />
            </div>
            {fst === 'loading' ? <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', margin: '-2px 0 6px' }}>بيتحدّث… الأرقام دي من آخر مرة</div> : fst === 'err' ? <div style={{ fontSize: 12, color: 'var(--danger)', textAlign: 'center', margin: '-2px 0 6px' }}>فشل التحديث، الأرقام دي من آخر مرة ومش محدّثة</div> : null}
            <div className="search-wrap" style={{ top: 0 }}>
                <div className="search-box" style={{ padding: '7px 12px' }}>
                    <span className="si"><Icon n="search" size={18} /></span>
                    <input placeholder="ابحث بالاسم أو التليفون أو المجموعة…" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontSize: 16 }} />
                </div>
                {groups.length > 0 ? (
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingTop: 6, WebkitOverflowScrolling: 'touch' }}>
                        {[['', 'الكل'], ...groups.map((g) => [g, g]), ['__none', 'بدون مجموعة']].map(([v, l]) => (
                            <button key={v || 'all'} className={'btn btn-sm ' + (grpSel === v ? 'btn-navy' : 'btn-ghost')} style={{ flex: '0 0 auto', padding: '4px 12px', minHeight: 32 }} onClick={() => setGrpSel(v)}>{l}</button>
                        ))}
                    </div>
                ) : null}
            </div>
            {list === null ? <div className="empty">{fst === 'err' ? 'مشكلة في تحميل الموردين، جرب تاني' : 'جاري التحميل…'}</div> : rows.length === 0 ? <div className="empty">{all.length === 0 ? 'مفيش موردين لسه' : 'مفيش نتايج للبحث'}</div> : rows.map((x) => (
                <button key={x.id} className="inv-row" style={{ width: '100%', textAlign: 'start', padding: '8px 12px', marginBottom: 6 }} onClick={() => open(x.id)}>
                    <div><div className="n">{x.name}</div><div className="m">{x.phone || 'بدون تليفون'}{x.grp ? ' · ' + x.grp : ''}</div></div>
                    <span style={{ marginInlineStart: 'auto' }}>{x.balance > 0 ? <span className="badge vcash" style={{ fontSize: 13 }}>له {fmt(x.balance)} ج</span> : <span className="badge cash">صفر</span>}</span>
                </button>
            ))}
            <div style={{ height: 70 }} />
            <button className="fab-add" onClick={() => setNewOpen(true)}><Icon n="plus" size={20} /> إضافة مورد</button>
            {newOpen ? <NewSupplierSheet groups={groups} onClose={() => setNewOpen(false)} onDone={() => { setNewOpen(false); load(); notify('اتضاف المورد ✓'); }} notify={notify} /> : null}
            {det ? <SupplierSheet groups={groups} data={det} onClose={() => setDet(null)} onChanged={() => { setDet(null); load(); }} notify={notify} /> : null}
        </>
    );
}

// ---------- المخزون ----------
export function StockScreen({ staff, products, categories, refresh, notify }: { staff: Staff; products: Product[]; categories: string[]; refresh: () => void; notify: (m: string, b?: boolean) => void }) {
    const manager = staff.role === 'manager';
    const [q, setQ] = useState('');
    const [edit, setEdit] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState('');
    const [scanFor, setScanFor] = useState<string | null>(null);

    const saveBarcode = async (code: string, barcode: string) => {
        setScanFor(null);
        try {
            await api('/api/pos/barcode', 'POST', { code, barcode });
            refresh();
            notify('اتربط الباركود بالصنف ✓');
        } catch { notify('مشكلة في حفظ الباركود', true); }
    };
    const dq = useDeferredValue(q);
    const s = dq.trim().toLowerCase();
    const [catSel, setCatSel] = useState('');
    const [shown, setShown] = useState(STOCK_N);
    const [lowOnly, setLowOnly] = useState(false);
    useEffect(() => { setShown(STOCK_N); }, [s, catSel, lowOnly]);
    const idx = useMemo(() => products.map((p) => (p.name + ' ' + p.code).toLowerCase()), [products]);
    const [form, setForm] = useState<{ mode: 'add' | 'edit'; name: string; code: string; price: string; cost: string; qty: string; cat: string } | null>(null);
    const [fBusy, setFBusy] = useState(false);
    const submitForm = async () => {
        if (!form || fBusy) return;
        const price = Number(form.price);
        if (form.name.trim().length < 2) { notify('اكتب اسم الصنف', true); return; }
        if (!isFinite(price) || form.price.trim() === '' || price < 0) { notify('اكتب سعر صحيح', true); return; }
        setFBusy(true);
        try {
            if (form.mode === 'add') {
                const r = await api('/api/pos/product', 'POST', { name: form.name.trim(), code: form.code.trim(), price, cost: Number(form.cost) || 0, qty: parseInt(form.qty, 10) || 0, cat: form.cat });
                notify('اتضاف الصنف ' + r.code + ' ✓');
            } else {
                await api('/api/pos/product/' + encodeURIComponent(form.code), 'POST', { name: form.name.trim(), price, cost: form.cost.trim() === '' ? undefined : Number(form.cost) || 0 });
                notify('اتعدل الصنف ✓');
            }
            setForm(null); refresh();
        } catch (e: any) { notify(e?.data?.error === 'duplicate_code' ? 'الكود ده مستخدم لصنف تاني' : 'مشكلة في الحفظ', true); }
        setFBusy(false);
    };
    const delProduct = async (p: Product) => {
        if (!confirm(`مسح "${p.name}"؟ لو اتباع قبل كده هيتخفي من البيع والموقع وفواتيره القديمة تفضل زي ما هي.`)) return;
        try {
            const r = await api('/api/pos/product/' + encodeURIComponent(p.code) + '/delete', 'POST', {});
            notify(r.hidden ? 'اتخفى الصنف (له فواتير قديمة) ✓' : 'اتمسح الصنف ✓'); refresh();
        } catch { notify('مشكلة في المسح', true); }
    };
    const filtered = useMemo(() => products.filter((p, i) => (!catSel || p.cat === catSel) && (!lowOnly || p.qty <= ((p as any).min_qty ?? 5)) && (!s || idx[i].includes(s))), [products, idx, catSel, s, lowOnly]);
    const setCat = async (code: string, cat: string) => {
        try { await api('/api/pos/product-cat', 'POST', { code, cat }); refresh(); notify('اتغير التصنيف ✓'); } catch { notify('مشكلة في حفظ التصنيف', true); }
    };

    const [minEdit, setMinEdit] = useState<Record<string, string>>({});
    const [stOpen, setStOpen] = useState(false);
    useEffect(() => { if (!stOpen) setMinEdit({}); }, [stOpen]);
    const [stQ, setStQ] = useState('');
    const [setShownN, setSetShownN] = useState(60);
    const [minBusy, setMinBusy] = useState('');
    const saveMin = async (code: string) => {
        const mv = minEdit[code];
        if (mv === undefined) return;
        setMinBusy(code);
        try {
            await api('/api/pos/stock', 'POST', { code, minQty: parseInt(mv, 10) || 0 });
            setMinEdit((e) => { const n = { ...e }; delete n[code]; return n; });
            refresh();
            notify('اتحفظ حد النواقص ✓');
        } catch (e: any) { notify(e?.data?.error === 'forbidden' ? 'الصلاحية دي للمدير بس' : 'مشكلة في الحفظ', true); }
        setMinBusy('');
    };
    const save = async (code: string) => {
        const v = edit[code];
        if (v === undefined) return;
        const p0 = products.find((p) => p.code === code);
        setBusy(code);
        try {
            await api('/api/pos/stock', 'POST', {
                code,
                qty: v !== undefined ? (parseInt(v, 10) || 0) : (p0?.qty ?? 0),
            });
            setEdit((e) => { const n = { ...e }; delete n[code]; return n; });
            refresh();
            notify('تم الحفظ ✓');
        } catch (e: any) {
            notify(e?.data?.error === 'forbidden' ? 'الصلاحية دي للمدير بس' : 'مشكلة في الحفظ', true);
        }
        setBusy('');
    };
    const low = useMemo(() => products.filter((p) => p.qty <= ((p as any).min_qty ?? 5)), [products]);
    const minDirty = useMemo(() => products.some((p) => minEdit[p.code] !== undefined && minEdit[p.code] !== String((p as any).min_qty ?? 5)), [products, minEdit]);

    return (
        <>
            <div className="search-wrap" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div className="search-box" style={{ flex: 1 }}>
                    <span className="si"><Icon n="search" size={20} /></span>
                    <input placeholder="ابحث بالاسم أو الكود…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                {manager ? <button className="btn btn-ghost btn-sm" style={{ minHeight: 46, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setStOpen(true)} title="إعدادات المخزون"><Icon n="settings" size={20} /> الإعدادات</button> : null}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <CatChips categories={categories} sel={catSel} setSel={(c) => { setCatSel(c); setLowOnly(false); }} products={products} />
                <div className="cat-dd"><button className={'cat-dd-btn' + (lowOnly ? ' on' : '')} style={lowOnly ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : { color: low.length ? 'var(--danger)' : undefined }} onClick={() => { setLowOnly(!lowOnly); setCatSel(''); }}>النواقص {low.length}</button></div>
            </div>
            {manager ? <button className="btn btn-amber btn-block" style={{ marginBottom: 10 }} onClick={() => setForm({ mode: 'add', name: '', code: '', price: '', cost: '', qty: '', cat: '' })}><Icon n="plus" size={18} /> إضافة صنف جديد</button> : null}
            {!manager ? <div className="err-box" style={{ background: '#fff8ea', color: 'var(--amber-d)' }}>عرض فقط — تعديل الأرصدة للمدير</div> : null}
            {filtered.slice(0, shown).map((p) => (
                <div className="stock-row" key={p.code}>
                    <div className="sn"><PN t={p.name} /><span>{p.code}{(p as any).barcode ? ' · 🏷️ ' + (p as any).barcode : ''}</span>
                        {manager && categories.length > 0 ? (
                            <select className="cat-sel" value={categories.includes(p.cat) ? p.cat : ''} onChange={(e) => setCat(p.code, e.target.value)}>
                                <option value="">— بدون تصنيف —</option>
                                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        ) : (p.cat ? <span>{p.cat}</span> : null)}
                        {manager ? (
                            <span style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                <button className="btn btn-ghost btn-sm" style={{ padding: '2px 10px' }} onClick={() => setForm({ mode: 'edit', name: p.name, code: p.code, price: String(p.price), cost: String((p as any).cost ?? ''), qty: '', cat: '' })}><Icon n="edit" size={15} /> تعديل</button>
                                <button className="btn btn-ghost btn-sm" style={{ padding: '2px 10px', color: 'var(--danger)' }} onClick={() => delProduct(p)}><Icon n="trash" size={16} /></button>
                            </span>
                        ) : null}
                    </div>
                    {manager ? (
                        <>
                            <button className="btn btn-ghost btn-sm" onClick={() => setScanFor(p.code)} title="ربط باركود"><Icon n="camera" size={18} /></button>
                            <input
                                inputMode="numeric"
                                title="الرصيد"
                                value={edit[p.code] !== undefined ? edit[p.code] : String(p.qty)}
                                onChange={(e) => setEdit((x) => ({ ...x, [p.code]: e.target.value }))}
                            />
                            {(edit[p.code] !== undefined && edit[p.code] !== String(p.qty)) ? (
                                <button className="btn btn-blue btn-sm" disabled={busy === p.code} onClick={() => save(p.code)}>{busy === p.code ? '…' : 'حفظ'}</button>
                            ) : null}
                        </>
                    ) : (
                        <b style={{ minWidth: 40, textAlign: 'center' }}>{p.qty}</b>
                    )}
                </div>
            ))}
            <MoreSentinel shown={shown} total={filtered.length} more={() => setShown((n) => n + STOCK_N)} />
            {stOpen ? (
                <>
                    <div className="sheet-back" onClick={() => setStOpen(false)} />
                    <div className="sheet">
                        <div className="sheet-h"><h3>إعدادات المخزون</h3><button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setStOpen(false)}>قفل</button></div>
                        <div className="sheet-b">
                            <span hidden data-dirty={minDirty ? '1' : '0'} />
                            <h4 style={{ margin: '0 0 4px' }}>حد النواقص</h4>
                            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>لو رصيد الصنف وصل للرقم ده أو أقل، بيدخل في النواقص. القيم الحالية زي ما هي، وبتتغير هنا بس.</div>
                            <div className="search-box" style={{ padding: '7px 12px', marginBottom: 8 }}>
                                <span className="si"><Icon n="search" size={18} /></span>
                                <input placeholder="ابحث عن صنف…" value={stQ} onChange={(e) => { setStQ(e.target.value); setSetShownN(60); }} style={{ fontSize: 16 }} />
                            </div>
                            {products.filter((p) => smartMatch(p.name + ' ' + p.code, stQ)).slice(0, setShownN).map((p) => {
                                const cur = String((p as any).min_qty ?? 5);
                                const dirty = minEdit[p.code] !== undefined && minEdit[p.code] !== cur;
                                return (
                                    <div className="stock-row" key={p.code}>
                                        <div className="sn"><PN t={p.name} /><span>{p.code} · الرصيد {p.qty}</span></div>
                                        <input inputMode="numeric" title="حد النواقص" style={{ width: 56 }} value={minEdit[p.code] !== undefined ? minEdit[p.code] : cur} onChange={(e) => setMinEdit((x) => ({ ...x, [p.code]: e.target.value }))} />
                                        {dirty ? <button className="btn btn-blue btn-sm" disabled={minBusy === p.code} onClick={() => saveMin(p.code)}>{minBusy === p.code ? '…' : 'حفظ'}</button> : null}
                                    </div>
                                );
                            })}
                            {products.filter((p) => smartMatch(p.name + ' ' + p.code, stQ)).length > setShownN ? <button className="btn btn-ghost btn-block" onClick={() => setSetShownN((n) => n + 60)}>عرض المزيد</button> : null}
                        </div>
                    </div>
                </>
            ) : null}
            {form ? (
                <>
                    <div className="sheet-back" onClick={() => setForm(null)} />
                    <div className="sheet">
                        <div className="sheet-h">
                            <h3>{form.mode === 'add' ? '➕ صنف جديد' : '✏️ تعديل ' + form.code}</h3>
                            <button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setForm(null)}>قفل</button>
                        </div>
                        <div className="sheet-b" style={{ display: 'grid', gap: 10 }}>
                            <input placeholder="اسم الصنف" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ padding: 11, border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 16 }} />
                            {form.mode === 'add' ? <input placeholder="الكود (سيبه فاضي = تلقائي)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} dir="ltr" style={{ padding: 11, border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 16, textAlign: 'end' }} /> : null}
                            <input placeholder="سعر البيع (ج)" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={{ padding: 11, border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 16 }} />
                            <input placeholder="سعر الشراء / التكلفة (اختياري)" inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} style={{ padding: 11, border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 16 }} />
                            {form.mode === 'add' ? (
                                <>
                                    <input placeholder="الكمية الافتتاحية" inputMode="numeric" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} style={{ padding: 11, border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 16 }} />
                                    {categories.length > 0 ? (
                                        <select value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} style={{ padding: 11, border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 16, background: '#fff' }}>
                                            <option value="">— التصنيف —</option>
                                            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    ) : null}
                                </>
                            ) : null}
                            <button className="btn btn-amber btn-block" disabled={fBusy} onClick={submitForm}>{fBusy ? '…' : form.mode === 'add' ? '✅ إضافة الصنف' : '💾 حفظ التعديل'}</button>
                        </div>
                    </div>
                </>
            ) : null}
            {scanFor ? <ScannerModal title={'باركود: ' + scanFor} onScan={(code) => saveBarcode(scanFor, code)} onClose={() => setScanFor(null)} /> : null}
        </>
    );
}

// ---------- التقفيلة ----------
export function CloseScreen({ staff, notify }: { staff: Staff; notify: (m: string, b?: boolean) => void }) {
    const [date, setDate] = useState(cairoToday());
    const [rows, setRows] = useState<{ staff: string; count: number; total: number; cash_total: number; vcash_total: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [exTitle, setExTitle] = useState('');
    const [exAmount, setExAmount] = useState('');
    const [exBusy, setExBusy] = useState(false);
    const manager = staff.role === 'manager';

    const load = async () => {
        setLoading(true);
        try {
            const r = await api('/api/pos/close?date=' + date);
            setRows(r.rows || []);
            const ex = await api('/api/pos/expenses?date=' + date + (manager ? '&all=1' : ''));
            setExpenses(ex.expenses || []);
        } catch { notify('مشكلة في تحميل التقفيلة', true); }
        setLoading(false);
    };
    useEffect(() => { load(); }, [date]);

    const addExpense = async () => {
        const a = Number(exAmount) || 0;
        if (exTitle.trim().length < 2 || a <= 0 || exBusy) { notify('اكتب بيان المصروف ومبلغه', true); return; }
        setExBusy(true);
        try {
            await api('/api/pos/expenses', 'POST', { title: exTitle.trim(), amount: a });
            setExTitle(''); setExAmount('');
            notify('اتسجل المصروف ✓');
            load();
        } catch { notify('مشكلة في تسجيل المصروف', true); }
        setExBusy(false);
    };
    const delExpense = async (id: number) => {
        try { await api('/api/pos/expense/' + id, 'DELETE'); setExpenses((xs) => xs.filter((x) => x.id !== id)); notify('اتمسح ✓'); }
        catch { notify('مشكلة في المسح', true); }
    };
    const exTotal = expenses.reduce((s, e) => s + e.amount, 0);

    const grand = rows.reduce((a, r) => ({ count: a.count + r.count, total: a.total + r.total, cash: a.cash + r.cash_total, vcash: a.vcash + r.vcash_total }), { count: 0, total: 0, cash: 0, vcash: 0 });

    return (
        <>
            <div className="field">
                <label>اليوم</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" style={{ textAlign: 'end' }} />
            </div>
            <div className="close-card" style={{ marginBottom: 12 }}>
                <h4>💸 مصاريف اليوم</h4>
                <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                    <input placeholder="بيان المصروف" value={exTitle} onChange={(e) => setExTitle(e.target.value)} style={{ width: '100%', minWidth: 0, border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 10px' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input inputMode="decimal" placeholder="المبلغ" value={exAmount} onChange={(e) => setExAmount(e.target.value)} style={{ flex: 1, minWidth: 0, width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 10px' }} />
                        <button className="btn btn-navy btn-sm" style={{ flex: 'none' }} disabled={exBusy} onClick={addExpense}>{exBusy ? '…' : 'تسجيل'}</button>
                    </div>
                </div>
                {expenses.length === 0 ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>مفيش مصاريف مسجلة في اليوم ده</div> : (
                    <>
                        {expenses.map((e) => (
                            <div className="close-line" key={e.id}>
                                <span>{e.title}{manager ? ' · ' + e.staff : ''}</span>
                                <b>{fmt(e.amount)} ج <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }} onClick={() => delExpense(e.id)}>✕</button></b>
                            </div>
                        ))}
                        <div className="close-line" style={{ borderTop: '1px dashed var(--line)', paddingTop: 6 }}><span>إجمالي المصاريف</span><b style={{ color: 'var(--danger)' }}>{fmt(exTotal)} ج</b></div>
                    </>
                )}
            </div>
            {loading ? <div className="empty">جاري التحميل…</div> : rows.length === 0 ? <div className="empty">مفيش مبيعات في اليوم ده</div> : (
                <>
                    {rows.map((r) => (
                        <div className="close-card" key={r.staff}>
                            <h4>👤 {r.staff}</h4>
                            <div className="close-line"><span>عدد الفواتير</span><b>{r.count}</b></div>
                            <div className="close-line"><span>💵 كاش</span><b>{fmt(r.cash_total)} ج</b></div>
                            <div className="close-line"><span>📱 فودافون كاش</span><b>{fmt(r.vcash_total)} ج</b></div>
                            <div className="close-line"><span>إجمالي المبيعات</span><b>{fmt(r.total)} ج</b></div>
                        </div>
                    ))}
                    {rows.length > 1 ? (
                        <div className="close-card grand">
                            <h4 style={{ color: '#fff' }}>إجمالي اليوم</h4>
                            <div className="close-line"><span>عدد الفواتير</span><b>{grand.count}</b></div>
                            <div className="close-line"><span>💵 كاش</span><b>{fmt(grand.cash)} ج</b></div>
                            <div className="close-line"><span>📱 فودافون كاش</span><b>{fmt(grand.vcash)} ج</b></div>
                            <div className="close-line"><span>الإجمالي</span><b>{fmt(grand.total)} ج</b></div>
                        </div>
                    ) : null}
                </>
            )}
        </>
    );
}

// ---------- الموظفين (مدير فقط) ----------
export function StaffScreen({ me, notify }: { me: Staff; notify: (m: string, b?: boolean) => void }) {
    const [admins, setAdmins] = useState<Staff[]>([]);
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [role, setRole] = useState<Role>('cashier');
    const [busy, setBusy] = useState(false);
    const [resetFor, setResetFor] = useState('');
    const [resetPass, setResetPass] = useState('');

    const load = async () => {
        try { const r = await api('/api/admin/admins'); setAdmins(r.admins || []); } catch { notify('مشكلة في تحميل الموظفين', true); }
    };
    useEffect(() => { load(); }, []);

    const add = async () => {
        if (user.trim().length < 3 || pass.length < 6) { notify('اسم المستخدم 3 حروف على الأقل والباسورد 6 على الأقل', true); return; }
        setBusy(true);
        try {
            await api('/api/admin/admins', 'POST', { user: user.trim(), pass, role });
            setUser(''); setPass(''); notify('اتضاف الموظف ✓'); load();
        } catch (e: any) {
            notify(e?.data?.error === 'user_exists' ? 'الاسم ده موجود قبل كده' : 'مشكلة في الإضافة', true);
        }
        setBusy(false);
    };
    const del = async (u: string) => {
        if (u === me.user) { notify('مينفعش تمسح نفسك', true); return; }
        try { await api('/api/admin/admins?user=' + encodeURIComponent(u), 'DELETE'); notify('اتمسح ✓'); load(); }
        catch { notify('مشكلة في المسح', true); }
    };
    const changeRole = async (u: string, newRole: Role) => {
        try { await api('/api/admin/admins', 'PATCH', { user: u, newRole }); notify('اتغيرت الصلاحية ✓'); load(); }
        catch { notify('مشكلة في التعديل', true); }
    };
    const reset = async () => {
        if (resetPass.length < 6) { notify('الباسورد الجديد 6 حروف على الأقل', true); return; }
        try { await api('/api/admin/admins', 'PATCH', { user: resetFor, newPass: resetPass }); setResetFor(''); setResetPass(''); notify('اتغير الباسورد ✓'); }
        catch { notify('مشكلة في التعديل', true); }
    };

    return (
        <>
            {admins.map((a) => (
                <div className="staff-row" key={a.user}>
                    <div style={{ flex: 1 }}>
                        <b>{a.user}</b>{a.user === me.user ? ' (أنت)' : ''}
                    </div>
                    <span className={'role ' + a.role}>{a.role === 'manager' ? 'مدير' : 'كاشير'}</span>
                    {a.user !== me.user ? (
                        <>
                            <button className="btn btn-ghost btn-sm" onClick={() => changeRole(a.user, a.role === 'manager' ? 'cashier' : 'manager')}>
                                {a.role === 'manager' ? 'خليه كاشير' : 'خليه مدير'}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setResetFor(a.user); setResetPass(''); }}>باسورد</button>
                            <button className="btn btn-danger btn-sm" onClick={() => del(a.user)}>مسح</button>
                        </>
                    ) : null}
                </div>
            ))}
            {resetFor ? (
                <div className="close-card">
                    <h4>باسورد جديد لـ {resetFor}</h4>
                    <div className="field"><input type="text" value={resetPass} onChange={(e) => setResetPass(e.target.value)} placeholder="الباسورد الجديد" /></div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-blue btn-sm" onClick={reset}>حفظ</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setResetFor('')}>إلغاء</button>
                    </div>
                </div>
            ) : null}
            <div className="close-card">
                <h4>➕ إضافة موظف</h4>
                <div className="field"><label>اسم المستخدم</label><input value={user} onChange={(e) => setUser(e.target.value)} dir="ltr" style={{ textAlign: 'end' }} /></div>
                <div className="field"><label>الباسورد</label><input type="text" value={pass} onChange={(e) => setPass(e.target.value)} dir="ltr" style={{ textAlign: 'end' }} /></div>
                <div className="field">
                    <label>الصلاحية</label>
                    <div className="pay-toggle">
                        <button className={role === 'cashier' ? 'on' : ''} onClick={() => setRole('cashier')}>كاشير</button>
                        <button className={role === 'manager' ? 'on' : ''} onClick={() => setRole('manager')}>مدير</button>
                    </div>
                </div>
                <button className="btn btn-navy btn-block" disabled={busy} onClick={add}>{busy ? '…' : 'إضافة'}</button>
            </div>
        </>
    );
}

// ---------- العملاء والمديونيات ----------
export function CustomersScreen({ staff, openInvoice, notify, startDebtInvoice }: { staff: Staff; openInvoice: (id: number) => void; notify: (m: string, b?: boolean) => void; startDebtInvoice?: (id: number) => void }) {
    const manager = staff.role === 'manager';
    const [list, setList] = useState<Customer[]>([]);
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [busy, setBusy] = useState(false);
    const [detail, setDetail] = useState<{ customer: Customer; ledger: LedgerEntry[]; balance: number; invoices: any[]; points?: number; pointsLog?: any[]; loyalty?: Loyalty; loading?: boolean; err?: boolean } | null>(null);
    const reqRef = useRef(0);
    const inflight = useRef(false);
    const keys = useRef<Record<string, { sig: string; key: string }>>({});
    // نفس المفتاح بيتبعت لو الطلب اتعاد (ضغطة مزدوجة أو نت ضعيف) فالقيد مبيتسجلش مرتين
    const keyFor = (kind: string, sig: string) => {
        const k = keys.current[kind];
        if (k && k.sig === sig) return k.key;
        const key = (crypto as any).randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2);
        keys.current[kind] = { sig, key };
        return key;
    };
    const dcache = useRef<Map<number, any>>(new Map());
    const prefetch = (id: number) => { if (dcache.current.has(id)) return; dcache.current.set(id, apiT('/api/pos/customer/' + id).catch(() => null)); };
    const [debtOpen, setDebtOpen] = useState(false);
    const [payOpen, setPayOpen] = useState(false);
    const [debtAmt, setDebtAmt] = useState('');
    const [debtNote, setDebtNote] = useState('');
    const [payAmt, setPayAmt] = useState('');
    const [payMethod, setPayMethod] = useState<'cash' | 'vcash'>('cash');
    const [editMode, setEditMode] = useState(false);
    const [mode, setMode] = useState<'cust' | 'sup'>('cust');
    const [grpSel, setGrpSel] = useState('');
    const [grp, setGrp] = useState('');

    const [shown, setShown] = useState(1e6);
    const [cst, setCst] = useState<'loading' | 'ok' | 'err'>('loading');
    const load = async () => {
        const c0 = cred(); setCst('loading');
        const c = cget<Customer[]>('customers'); if (c && !list.length) { setList(c); setLoading(false); } else if (!c) setLoading(true);
        try { const r = await api('/api/pos/customers'); setList(r.customers || []); csetIf('customers', r.customers || [], c0); setCst('ok'); } catch { setCst('err'); notify('مشكلة في تحميل العملاء، الأرقام المعروضة قديمة', true); }
        setLoading(false);
    };
    useEffect(() => { load(); }, []);

    // بيفتح الكارت فوراً من بيانات القايمة، وبعدين يكمّل الحركات والفواتير لما توصل (مع بداية التحميل من أول لمسة)
    const openDetail = async (id: number) => {
        const row = list.find((c) => c.id === id);
        const my = ++reqRef.current;
        setPayAmt(''); setEditMode(false); setDebtOpen(false); setDebtAmt(''); setDebtNote('');
        if (row) setDetail({ customer: { ...row, phone: row.phone || '', notes: row.notes || '' } as Customer, ledger: [], balance: row.balance || 0, invoices: [], loading: true });
        const pending = dcache.current.get(id);
        dcache.current.delete(id);
        try {
            const r = (pending ? await pending : null) || await apiT('/api/pos/customer/' + id);
            if (reqRef.current !== my) return;
            setDetail(r);
        } catch {
            if (reqRef.current !== my) return;
            // الكارت يفضل ظاهر بالرصيد من القايمة، وقسم الحركات يعرض خطأ وزر "جرّب تاني" بدل دايرة للأبد
            if (row) setDetail({ customer: { ...row, phone: row.phone || '', notes: row.notes || '' } as Customer, ledger: [], balance: row.balance || 0, invoices: [], loading: false, err: true });
            else { setDetail(null); notify('مشكلة في فتح العميل', true); }
        }
    };
    // لو الكارت اتقفل قبل ما الرد يوصل، الرد المتأخر يتتجاهل (ما يفتحش الكارت تاني)
    useEffect(() => { if (!detail) reqRef.current++; }, [detail]);
    const refreshDetail = async (id: number) => {
        try { const r = await api('/api/pos/customer/' + id); setDetail(r); } catch {}
        load();
    };

    const add = async () => {
        if (name.trim().length < 2) { notify('اكتب اسم العميل', true); return; }
        setBusy(true);
        try {
            const r = await api('/api/pos/customers', 'POST', { name: name.trim(), phone: phone.trim(), grp: grp.trim() });
            setName(''); setPhone(''); setGrp(''); setAddOpen(false);
            notify('اتضاف العميل ✓'); load();
            openDetail(r.id);
        } catch { notify('مشكلة في الإضافة', true); }
        setBusy(false);
    };
    const savePayment = async () => {
        const amt = Number(payAmt) || 0;
        if (!detail || amt <= 0) { notify('اكتب مبلغ صحيح', true); return; }
        if (amt > detail.balance + 0.005 && !confirm(`المبلغ (${fmt(amt)}) أكبر من المستحق (${fmt(detail.balance)}). تسجله برضه؟ هيبقى للعميل رصيد دائن.`)) return;
        if (inflight.current) return;
        inflight.current = true;
        setBusy(true);
        try {
            await api(`/api/pos/customer/${detail.customer.id}/payment`, 'POST', { amount: amt, method: payMethod, key: keyFor('pay', `${detail.customer.id}|${amt}|${payMethod}`) });
            delete keys.current.pay;
            notify('اتسجلت الدفعة ✓'); setPayAmt(''); setPayOpen(false);
            refreshDetail(detail.customer.id);
        } catch { notify('مشكلة في تسجيل الدفعة', true); }
        inflight.current = false;
        setBusy(false);
    };
    const saveEdit = async () => {
        if (!detail) return;
        setBusy(true);
        try {
            await api('/api/pos/customers?id=' + detail.customer.id, 'PATCH', { name: detail.customer.name, phone: detail.customer.phone, notes: detail.customer.notes, grp: (detail.customer.grp || '').trim() });
            notify('اتحفظ ✓'); setEditMode(false); load();
        } catch { notify('مشكلة في الحفظ', true); }
        setBusy(false);
    };
    const del = async () => {
        if (!detail || !confirm('متأكد إنك عايز تمسح العميل ده؟')) return;
        try {
            await api('/api/pos/customers?id=' + detail.customer.id, 'DELETE');
            setDetail(null); notify('اتمسح ✓'); load();
        } catch (e: any) { notify(e?.data?.error === 'has_ledger' ? 'العميل عليه حساب، مينفعش يتمسح' : 'مشكلة في المسح', true); }
    };
    const saveDebt = async () => {
        const amt = Number(debtAmt) || 0;
        if (!detail || amt <= 0) { notify('اكتب مبلغ صحيح', true); return; }
        if (!confirm(`تسجيل مديونية سابقة ${fmt(amt)} ج على ${detail.customer.name}؟`)) return;
        if (inflight.current) return;
        inflight.current = true;
        setBusy(true);
        try {
            await api(`/api/pos/customer/${detail.customer.id}/debt`, 'POST', { amount: amt, note: debtNote.trim(), key: keyFor('debt', `${detail.customer.id}|${amt}|${debtNote.trim()}`) });
            delete keys.current.debt;
            notify('اتسجلت المديونية ✓'); setDebtAmt(''); setDebtNote(''); setDebtOpen(false);
            await refreshDetail(detail.customer.id);
        } catch { notify('مشكلة في تسجيل المديونية', true); }
        inflight.current = false;
        setBusy(false);
    };
    const delPayment = async (id: number) => {
        if (!detail || !confirm('تمسح القيد ده؟ هيتعدّل رصيد العميل.')) return;
        try { await api('/api/pos/ledger/' + id, 'DELETE'); refreshDetail(detail.customer.id); notify('اتمسح القيد ✓'); }
        catch { notify('مشكلة في المسح', true); }
    };

    const dq = useDeferredValue(q);
    const s = dq.trim().toLowerCase();
    const groups = useMemo(() => Array.from(new Set(list.map((c) => (c.grp || '').trim()).filter(Boolean))).sort(), [list]);
    useEffect(() => { if (grpSel && grpSel !== '__none' && !groups.includes(grpSel)) setGrpSel(''); }, [groups, grpSel]);
    const filtered = useMemo(() => list.filter((c) => (!grpSel || (grpSel === '__none' ? !(c.grp || '').trim() : (c.grp || '').trim() === grpSel)) && smartMatch(c.name + ' ' + (c.phone || '') + ' ' + (c.grp || ''), dq)), [list, dq, grpSel]);
    // ليا = اللي العملاء عليهم (أرصدة موجبة بس) | عليا = رصيد العملاء الدايرين (له) | الصافي = ليا - عليا
    const totalDebt = useMemo(() => list.reduce((a, c) => a + Math.max(0, c.balance || 0), 0), [list]);
    const totalCredit = useMemo(() => list.reduce((a, c) => a + Math.max(0, -(c.balance || 0)), 0), [list]);

    const Sum = ({ l, v, c }: { l: string; v: string; c?: string }) => (
        <div style={{ flex: 1, textAlign: 'center', padding: '6px 4px', minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{l}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: c || 'var(--navy)' }}>{v}</div>
        </div>
    );
    const net = totalDebt - totalCredit;

    return (
        <>
            <div className="pay-toggle" style={{ marginBottom: 8 }}>
                <button className={mode === 'cust' ? 'on' : ''} onClick={() => setMode('cust')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 4px' }}><Icon n="users" size={18} /> العملاء</button>
                {manager ? <button className={mode === 'sup' ? 'on' : ''} onClick={() => setMode('sup')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 4px' }}><Icon n="truck" size={18} /> الموردين</button> : null}
            </div>
            {mode === 'sup' && manager ? <SuppliersPane notify={notify} /> : (<>
            <div className="close-card" style={{ display: 'flex', padding: '2px 4px', marginBottom: 8 }}>
                <Sum l="ليا (على العملاء)" v={fmt(totalDebt) + ' ج'} c="var(--danger)" />
                <Sum l="عليا (رصيد للعملاء)" v={fmt(totalCredit) + ' ج'} c="var(--ok)" />
                <Sum l={net >= 0 ? 'الصافي (ليا)' : 'الصافي (عليا)'} v={fmt(Math.abs(net)) + ' ج'} />
            </div>
            {cst === 'loading' && !loading ? <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', margin: '-2px 0 6px' }}>بيتحدّث… الأرقام دي من آخر مرة</div> : cst === 'err' ? <div style={{ fontSize: 12, color: 'var(--danger)', textAlign: 'center', margin: '-2px 0 6px' }}>فشل التحديث، الأرقام دي من آخر مرة ومش محدّثة</div> : null}
            <div className="search-wrap" style={{ top: 0 }}>
                <div className="search-box" style={{ padding: '7px 12px' }}>
                    <span className="si"><Icon n="search" size={18} /></span>
                    <input placeholder="ابحث بالاسم أو التليفون أو المجموعة…" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontSize: 16 }} />
                </div>
                {groups.length > 0 ? (
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingTop: 6, WebkitOverflowScrolling: 'touch' }}>
                        {[['', 'الكل'], ...groups.map((g) => [g, g]), ['__none', 'بدون مجموعة']].map(([v, l]) => (
                            <button key={v || 'all'} className={'btn btn-sm ' + (grpSel === v ? 'btn-navy' : 'btn-ghost')} style={{ flex: '0 0 auto', padding: '4px 12px', minHeight: 32 }} onClick={() => setGrpSel(v)}>{l}</button>
                        ))}
                    </div>
                ) : null}
            </div>
            {loading ? <div className="empty">جاري التحميل…</div> : filtered.length === 0 ? <div className="empty">{list.length === 0 ? 'مفيش عملاء لسه — ضيف أول عميل' : 'مفيش نتايج للبحث'}</div> : filtered.slice(0, shown).map((c) => (
                <button key={c.id} className="inv-row" style={{ width: '100%', textAlign: 'start', padding: '8px 12px', marginBottom: 6 }} onPointerDown={() => prefetch(c.id)} onClick={() => openDetail(c.id)}>
                    <div>
                        <div className="n">{c.name}</div>
                        <div className="m">{c.phone || 'بدون تليفون'}{c.grp ? ' · ' + c.grp : ''}</div>
                    </div>
                    <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                        {(c.balance || 0) > 0 ? <span className="badge vcash" style={{ fontSize: 13 }}>عليه {fmt(c.balance!)} ج</span> : (c.balance || 0) < 0 ? <span className="badge cash" style={{ fontSize: 13 }}>له {fmt(-(c.balance as number))} ج</span> : <span className="badge cash">صفر</span>}
                    </span>
                </button>
            ))}
            <MoreSentinel shown={shown} total={filtered.length} more={() => setShown((n) => n + PAGE_N)} />
            <div style={{ height: 70 }} />
            <button className="fab-add" onClick={() => setAddOpen(true)}><Icon n="plus" size={20} /> إضافة عميل</button>
            </>)}

            {addOpen ? (
                <>
                    <div className="sheet-back" onClick={() => setAddOpen(false)} />
                    <div className="sheet">
                        <div className="sheet-h"><h3>➕ عميل جديد</h3><button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setAddOpen(false)}>قفل</button></div>
                        <div className="sheet-b">
                            <div className="field"><label>اسم العميل</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
                            <div className="field"><label>تليفون (اختياري)</label><input inputMode="tel" dir="ltr" style={{ textAlign: 'end' }} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" /></div>
                            <div className="field"><label>المجموعة (اختياري)</label><input list="grp-list" maxLength={40} value={grp} onChange={(e) => setGrp(e.target.value)} placeholder="اكتب اسم مجموعة أو اختار" /></div>
                            <datalist id="grp-list">{groups.map((g) => <option key={g} value={g} />)}</datalist>
                            <button className="btn btn-amber btn-block" disabled={busy} onClick={add}>{busy ? '…' : 'حفظ'}</button>
                        </div>
                    </div>
                </>
            ) : null}

            {detail ? (
                <>
                    <div className="sheet-back" onClick={() => setDetail(null)} />
                    <div className="sheet tall">
                        <div className="sheet-h">
                            {manager && !editMode && !(detail.loading || detail.err) ? (
                                <>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(true)}>تعديل</button>
                                    <button className="btn btn-danger btn-sm" onClick={del}>مسح</button>
                                </>
                            ) : null}
                            <h3>{detail.customer.name}</h3>
                            <button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setDetail(null)}>قفل</button>
                        </div>
                        <div className="sheet-b">
                            {editMode ? (
                                <>
                                    <div className="field"><label>الاسم</label><input value={detail.customer.name} onChange={(e) => setDetail({ ...detail, customer: { ...detail.customer, name: e.target.value } })} /></div>
                                    <div className="field"><label>تليفون</label><input dir="ltr" style={{ textAlign: 'end' }} value={detail.customer.phone} onChange={(e) => setDetail({ ...detail, customer: { ...detail.customer, phone: e.target.value } })} /></div>
                                    <div className="field"><label>ملاحظات</label><input value={detail.customer.notes} onChange={(e) => setDetail({ ...detail, customer: { ...detail.customer, notes: e.target.value } })} /></div>
                                    <div className="field"><label>المجموعة</label><input list="grp-list" maxLength={40} value={detail.customer.grp || ''} onChange={(e) => setDetail({ ...detail, customer: { ...detail.customer, grp: e.target.value } })} placeholder="من غير مجموعة" /></div>
                                    <datalist id="grp-list">{groups.map((g) => <option key={g} value={g} />)}</datalist>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-blue btn-sm" disabled={busy} onClick={saveEdit}>حفظ</button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(false)}>إلغاء</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="bal-card">
                                        <div className="l">الرصيد المستحق على العميل</div>
                                        <div className="v" style={{ color: detail.balance > 0 ? 'var(--danger)' : detail.balance < 0 ? '#0f7a44' : 'var(--ink)' }}>{fmt(Math.abs(detail.balance))} ج{detail.balance < 0 ? ' (له)' : ''}</div>
                                        <div className="s">{detail.customer.phone || 'بدون تليفون'}{detail.customer.grp ? ' · ' + detail.customer.grp : ''}{detail.customer.notes ? ' · ' + detail.customer.notes : ''}</div>
                                    </div>
                                    {!(detail.loading || detail.err) && startDebtInvoice ? (
                                        <button className="btn btn-blue btn-sm btn-block" style={{ minHeight: 44, marginBottom: 12 }} onClick={() => { const id = detail.customer.id; setDetail(null); startDebtInvoice(id); }}>فاتورة آجل جديدة</button>
                                    ) : null}
                                </>
                            )}

                            {debtOpen && manager && !editMode && !(detail.loading || detail.err) ? (
                                <div className="close-card">
                                    <h4>إضافة دين</h4>
                                    <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>بتتسجل في كشف الحساب كرصيد سابق من غير فاتورة، ومش بتدخل في المبيعات.</div>
                                    <div className="field"><input inputMode="decimal" placeholder="المبلغ" value={debtAmt} onChange={(e) => setDebtAmt(e.target.value)} /></div>
                                    <div className="field"><input placeholder="ملاحظة (اختياري)" maxLength={150} value={debtNote} onChange={(e) => setDebtNote(e.target.value)} /></div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-blue btn-sm" disabled={busy} onClick={saveDebt}>تسجيل المديونية</button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setDebtOpen(false)}>إلغاء</button>
                                    </div>
                                </div>
                            ) : null}

                            {payOpen && detail.balance <= 0 && !editMode && !(detail.loading || detail.err) ? (
                                <div className="close-card"><h4>💵 تسجيل دفعة</h4><div style={{ fontSize: 13, color: 'var(--muted)' }}>مفيش دين على العميل دلوقتي. لو عليه فلوس قديمة، {manager ? 'اضغط «إضافة دين» الأول.' : 'المدير يسجلها الأول.'}</div></div>
                            ) : null}

                            {payOpen && detail.balance > 0 && !editMode && !(detail.loading || detail.err) ? (
                                <div className="close-card">
                                    <h4>💵 تسجيل دفعة (بتتخصم من الدين)</h4>
                                    <div className="field"><input inputMode="decimal" placeholder="المبلغ" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} /></div>
                                    {Number(payAmt) > 0 ? <div style={{ fontSize: 13, color: 'var(--muted)', margin: '-4px 0 8px' }}>الباقي بعد الدفعة: <b>{fmt(Math.max(0, detail.balance - Number(payAmt)))} ج</b></div> : null}
                                    <div className="pay-toggle" style={{ marginBottom: 10 }}>
                                        <button className={payMethod === 'cash' ? 'on' : ''} onClick={() => setPayMethod('cash')}>💵 كاش</button>
                                        <button className={payMethod === 'vcash' ? 'on' : ''} onClick={() => setPayMethod('vcash')}>📱 فودافون كاش</button>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-blue btn-sm" disabled={busy} onClick={savePayment}>تسجيل</button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setPayAmt(String(detail.balance))}>كامل المبلغ</button>
                                    </div>
                                </div>
                            ) : null}

                            <h4 style={{ color: 'var(--navy)', margin: '14px 0 8px' }}>المعاملات{!(detail.loading || detail.err) ? ' (' + detail.ledger.length + ')' : ''}</h4>
                            {detail.err ? <div className="empty" style={{ padding: 16 }}>ماقدرناش نحمّل الحركات. الرصيد الظاهر من القايمة.<div style={{ marginTop: 10 }}><button className="btn btn-blue btn-sm" onClick={() => openDetail(detail.customer.id)}>جرّب تاني</button></div></div> : detail.loading ? <div className="empty" style={{ padding: 16 }}>جاري تحميل الحركات…</div> : detail.ledger.length === 0 ? <div className="empty" style={{ padding: 16 }}>مفيش حركات</div> : (() => {
                                let run = Math.round((detail.balance || 0) * 100) / 100;
                                return detail.ledger.map((l: any) => {
                                    const after = run;
                                    run = Math.round((run - (l.kind === 'charge' ? l.amount : -l.amount)) * 100) / 100;
                                    const isCharge = l.kind === 'charge';
                                    const label = isCharge ? (l.invoice_id ? 'فاتورة آجل' : 'دين') : 'دفعة';
                                    return (
                                        <div className="tx-row" key={l.id}>
                                            <span className={'tx-ic ' + (isCharge ? 'up' : 'down')} aria-hidden="true">
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{isCharge ? <><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></> : <><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></>}</svg>
                                            </span>
                                            <div className="tx-mid">
                                                <div className="tx-d">{fmtTime(l.ts)}</div>
                                                <div className="tx-b">الرصيد بعدها: {fmt(Math.abs(after))} ج{after < 0 ? ' (له)' : ''}</div>
                                                {l.note || l.staff ? <div className="tx-n">{l.note ? l.note + ' · ' : ''}{l.staff}</div> : null}
                                            </div>
                                            <div className="tx-amt">
                                                <b style={{ color: isCharge ? 'var(--danger)' : '#0f7a44' }}>{fmt(l.amount)} ج</b>
                                                <span>{label}</span>
                                                {manager && (l.kind === 'payment' || !l.invoice_id) ? <button className="btn btn-danger btn-sm" style={{ padding: '2px 8px', fontSize: 12, marginTop: 2 }} onClick={() => delPayment(l.id)}>×</button> : null}
                                            </div>
                                        </div>
                                    );
                                });
                            })()}

                            {detail.invoices.length > 0 ? (
                                <>
                                    <h4 style={{ color: 'var(--navy)', margin: '14px 0 8px' }}>الفواتير</h4>
                                    {detail.invoices.map((v: any) => (
                                        <button key={v.id} className="inv-row" style={{ width: '100%', textAlign: 'start' }} onClick={() => { setDetail(null); openInvoice(v.id); }}>
                                            <div className={v.status === 'voided' ? 'voided' : ''}>
                                                <div className="n">{v.num}{v.status === 'voided' ? ' (ملغاة)' : ''}</div>
                                                <div className="m">{fmtTime(v.ts)}</div>
                                            </div>
                                            <span className={'badge ' + (v.payment === 'vcash' ? 'vcash' : v.payment === 'debt' ? 'vcash' : 'cash')}>{paymentLabel(v.payment)}</span>
                                            <span className="amt">{fmt(v.total)} ج</span>
                                        </button>
                                    ))}
                                </>
                            ) : null}
                        </div>
                        {!editMode && !(detail.loading || detail.err) ? (
                            <div className="detail-bar">
                                {manager ? <button className="btn db-debt" onClick={() => { setDebtOpen((v) => !v); setPayOpen(false); document.querySelector('.sheet.tall .sheet-b')?.scrollTo({ top: 0, behavior: 'smooth' }); }}>+ إضافة دين</button> : null}
                                <button className="btn db-pay" onClick={() => { setPayOpen((v) => !v); setDebtOpen(false); document.querySelector('.sheet.tall .sheet-b')?.scrollTo({ top: 0, behavior: 'smooth' }); }}>تسجيل دفعة</button>
                            </div>
                        ) : null}
                    </div>
                </>
            ) : null}
        </>
    );
}

// ---------- التقارير (مدير) ----------
export function ReportsScreen({ notify }: { notify: (m: string, b?: boolean) => void }) {
    const today = cairoToday();
    const [from, setFrom] = useState(today);
    const [to, setTo] = useState(today);
    const [rep, setRep] = useState<Report | null>(null);
    const [loading, setLoading] = useState(true);
    const [rv, setRv] = useState<'sales' | 'profit' | 'cash'>('sales');

    const load = async (f: string, t: string) => {
        setLoading(true);
        try { setRep(await api(`/api/pos/reports?from=${f}&to=${t}`)); } catch { notify('مشكلة في تحميل التقارير', true); }
        setLoading(false);
    };
    useEffect(() => { load(from, to); }, [from, to]);

    const quick = (days: number) => {
        const t = today;
        const d = new Date(Date.now() - (days - 1) * 86400000);
        const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
        setFrom(f); setTo(t);
    };

    return (
        <>
            <div className="pay-toggle" style={{ marginBottom: 10 }}>
                <button className={from === to && to === today ? 'on' : ''} onClick={() => { setFrom(today); setTo(today); }}>اليوم</button>
                <button onClick={() => quick(7)}>٧ أيام</button>
                <button onClick={() => quick(30)}>٣٠ يوم</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}><label>من</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" style={{ textAlign: 'end' }} /></div>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}><label>إلى</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" style={{ textAlign: 'end' }} /></div>
            </div>
            <div className="pay-toggle" style={{ marginBottom: 12 }}>
                <button className={rv === 'sales' ? 'on' : ''} onClick={() => setRv('sales')}>📊 المبيعات</button>
                <button className={rv === 'profit' ? 'on' : ''} onClick={() => setRv('profit')}>📈 الأرباح</button>
                <button className={rv === 'cash' ? 'on' : ''} onClick={() => setRv('cash')}>💵 الفلوس</button>
            </div>
            {rv !== 'sales' ? <ProfitView from={from} to={to} mode={rv} notify={notify} /> : null}
            {rv !== 'sales' ? null : loading || !rep ? <div className="empty">جاري التحميل…</div> : (
                <>
                    <div className="close-card">
                        <h4>📊 ملخص المبيعات</h4>
                        <div className="close-line"><span>عدد الفواتير</span><b>{rep.summary.count}</b></div>
                        <div className="close-line"><span>💵 كاش</span><b>{fmt(rep.summary.cash_total)} ج</b></div>
                        <div className="close-line"><span>📱 فودافون كاش</span><b>{fmt(rep.summary.vcash_total)} ج</b></div>
                        <div className="close-line"><span>🧾 آجل (ديون جديدة)</span><b>{fmt(rep.summary.debt_total)} ج</b></div>
                        {rep.summary.discounts > 0 ? <div className="close-line"><span>إجمالي الخصومات</span><b>{fmt(rep.summary.discounts)} ج</b></div> : null}
                        <div className="close-line" style={{ fontSize: 16 }}><span>إجمالي المبيعات</span><b>{fmt(rep.summary.total)} ج</b></div>
                    </div>
                    <div className="close-card grand">
                        <h4 style={{ color: '#fff' }}>💰 الديون</h4>
                        <div className="close-line"><span>تحصيلات ديون في الفترة</span><b>{fmt(rep.collectedInRange)} ج</b></div>
                        <div className="close-line"><span>إجمالي مديونيات قائمة عند العملاء</span><b>{fmt(rep.debtsOutstanding)} ج</b></div>
                    </div>
                    {rep.topDebtors.length > 0 ? (
                        <div className="close-card">
                            <h4>أكبر مديونيات</h4>
                            {rep.topDebtors.map((d) => (
                                <div className="close-line" key={d.id}><span>{d.name}</span><b style={{ color: 'var(--danger)' }}>{fmt(d.balance)} ج</b></div>
                            ))}
                        </div>
                    ) : null}
                    {rep.top.length > 0 ? (
                        <div className="close-card">
                            <h4>🏆 الأصناف الأكثر مبيعاً</h4>
                            {rep.top.map((p, i) => (
                                <div className="close-line" key={p.code}>
                                    <span>{i + 1}. <PN t={p.name} /> <span style={{ color: 'var(--muted)', fontSize: 12 }}>× {p.qty}</span></span>
                                    <b>{fmt(p.revenue)} ج</b>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    {rep.byStaff.length > 0 ? (
                        <div className="close-card">
                            <h4>👤 مبيعات الموظفين</h4>
                            {rep.byStaff.map((r) => (
                                <div className="close-line" key={r.staff}><span>{r.staff} ({r.count} فاتورة)</span><b>{fmt(r.total)} ج</b></div>
                            ))}
                        </div>
                    ) : null}
                    {rep.summary.count === 0 ? <div className="empty">مفيش مبيعات في الفترة دي</div> : null}
                </>
            )}
            <ExportCard from={from} to={to} notify={notify} />
        </>
    );
}
