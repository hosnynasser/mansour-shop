import { useEffect, useRef, useState } from 'react';
import PN from './Bidi';
import { api, cget, cset, cairoToday, fmt, fmtTime, paymentLabel, Customer, Expense, Invoice, LedgerEntry, Product, Quote, Report, Role, Staff } from './lib';
import Icon from './Icon';
import CatChips from './CatChips';
import ScannerModal from './ScannerModal';
import { ExportCard, ProfitView } from './ReportsExtra';
import { Loyalty } from './LoyaltyUI';

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
    const s = q.trim().toLowerCase();
    const [catSel, setCatSel] = useState('');
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
    const filtered = products.filter((p) => (!catSel || p.cat === catSel) && (!s || p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s)));
    const setCat = async (code: string, cat: string) => {
        try { await api('/api/pos/product-cat', 'POST', { code, cat }); refresh(); notify('اتغير التصنيف ✓'); } catch { notify('مشكلة في حفظ التصنيف', true); }
    };

    const [minEdit, setMinEdit] = useState<Record<string, string>>({});
    const save = async (code: string) => {
        const v = edit[code];
        const mv = minEdit[code];
        if (v === undefined && mv === undefined) return;
        const p0 = products.find((p) => p.code === code);
        setBusy(code);
        try {
            await api('/api/pos/stock', 'POST', {
                code,
                qty: v !== undefined ? (parseInt(v, 10) || 0) : (p0?.qty ?? 0),
                minQty: mv !== undefined ? (parseInt(mv, 10) || 0) : undefined,
            });
            setEdit((e) => { const n = { ...e }; delete n[code]; return n; });
            setMinEdit((e) => { const n = { ...e }; delete n[code]; return n; });
            refresh();
            notify('تم الحفظ ✓');
        } catch (e: any) {
            notify(e?.data?.error === 'forbidden' ? 'الصلاحية دي للمدير بس' : 'مشكلة في الحفظ', true);
        }
        setBusy('');
    };
    const low = products.filter((p) => p.qty <= ((p as any).min_qty ?? 5));

    return (
        <>
            <div className="search-wrap">
                <div className="search-box">
                    <span className="si"><Icon n="search" size={20} /></span>
                    <input placeholder="ابحث بالاسم أو الكود…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
            </div>
            <CatChips categories={categories} sel={catSel} setSel={setCatSel} />
            {manager ? <button className="btn btn-amber btn-block" style={{ marginBottom: 10 }} onClick={() => setForm({ mode: 'add', name: '', code: '', price: '', cost: '', qty: '', cat: '' })}><Icon n="plus" size={18} /> إضافة صنف جديد</button> : null}
            {!manager ? <div className="err-box" style={{ background: '#fff8ea', color: 'var(--amber-d)' }}>عرض فقط — تعديل الأرصدة للمدير</div> : null}
            {low.length > 0 ? (
                <div className="err-box" style={{ background: '#fdecec', color: 'var(--danger)', marginBottom: 10 }}>
                    ⚠️ نواقص المخزون ({low.length}): {low.map((p) => p.name + ' (' + p.qty + ')').join('، ')}
                </div>
            ) : null}
            {filtered.map((p) => (
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
                            <input
                                inputMode="numeric"
                                title="حد النواقص — نبهني لو الرصيد وصل له"
                                style={{ width: 44, borderColor: p.qty <= ((p as any).min_qty ?? 5) ? 'var(--danger)' : undefined }}
                                value={minEdit[p.code] !== undefined ? minEdit[p.code] : String((p as any).min_qty ?? 5)}
                                onChange={(e) => setMinEdit((x) => ({ ...x, [p.code]: e.target.value }))}
                            />
                            {((edit[p.code] !== undefined && edit[p.code] !== String(p.qty)) || (minEdit[p.code] !== undefined && minEdit[p.code] !== String((p as any).min_qty ?? 5))) ? (
                                <button className="btn btn-blue btn-sm" disabled={busy === p.code} onClick={() => save(p.code)}>{busy === p.code ? '…' : 'حفظ'}</button>
                            ) : null}
                        </>
                    ) : (
                        <b style={{ minWidth: 40, textAlign: 'center' }}>{p.qty}</b>
                    )}
                </div>
            ))}
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
export function CustomersScreen({ staff, openInvoice, notify }: { staff: Staff; openInvoice: (id: number) => void; notify: (m: string, b?: boolean) => void }) {
    const manager = staff.role === 'manager';
    const [list, setList] = useState<Customer[]>([]);
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [busy, setBusy] = useState(false);
    const [detail, setDetail] = useState<{ customer: Customer; ledger: LedgerEntry[]; balance: number; invoices: any[]; points?: number; pointsLog?: any[]; loyalty?: Loyalty } | null>(null);
    const [payAmt, setPayAmt] = useState('');
    const [payMethod, setPayMethod] = useState<'cash' | 'vcash'>('cash');
    const [editMode, setEditMode] = useState(false);

    const load = async () => {
        setLoading(true);
        try { const r = await api('/api/pos/customers'); setList(r.customers || []); } catch { notify('مشكلة في تحميل العملاء', true); }
        setLoading(false);
    };
    useEffect(() => { load(); }, []);

    const openDetail = async (id: number) => {
        try { const r = await api('/api/pos/customer/' + id); setDetail(r); setPayAmt(''); setEditMode(false); }
        catch { notify('مشكلة في فتح العميل', true); }
    };
    const refreshDetail = async (id: number) => {
        try { const r = await api('/api/pos/customer/' + id); setDetail(r); } catch {}
        load();
    };

    const add = async () => {
        if (name.trim().length < 2) { notify('اكتب اسم العميل', true); return; }
        setBusy(true);
        try {
            const r = await api('/api/pos/customers', 'POST', { name: name.trim(), phone: phone.trim() });
            setName(''); setPhone(''); setAddOpen(false);
            notify('اتضاف العميل ✓'); load();
            openDetail(r.id);
        } catch { notify('مشكلة في الإضافة', true); }
        setBusy(false);
    };
    const savePayment = async () => {
        const amt = Number(payAmt) || 0;
        if (!detail || amt <= 0) { notify('اكتب مبلغ صحيح', true); return; }
        setBusy(true);
        try {
            await api(`/api/pos/customer/${detail.customer.id}/payment`, 'POST', { amount: amt, method: payMethod });
            notify('اتسجلت الدفعة ✓'); setPayAmt('');
            refreshDetail(detail.customer.id);
        } catch { notify('مشكلة في تسجيل الدفعة', true); }
        setBusy(false);
    };
    const saveEdit = async () => {
        if (!detail) return;
        setBusy(true);
        try {
            await api('/api/pos/customers?id=' + detail.customer.id, 'PATCH', { name: detail.customer.name, phone: detail.customer.phone, notes: detail.customer.notes });
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
    const delPayment = async (id: number) => {
        if (!detail || !confirm('تمسح قيد الدفعة دي؟')) return;
        try { await api('/api/pos/ledger/' + id, 'DELETE'); refreshDetail(detail.customer.id); notify('اتمسح القيد ✓'); }
        catch { notify('مشكلة في المسح', true); }
    };

    const s = q.trim().toLowerCase();
    const filtered = s ? list.filter((c) => c.name.toLowerCase().includes(s) || c.phone.includes(s)) : list;
    const totalDebt = list.reduce((a, c) => a + (c.balance || 0), 0);

    return (
        <>
            <div className="search-wrap">
                <div className="search-box">
                    <span className="si"><Icon n="search" size={20} /></span>
                    <input placeholder="ابحث بالاسم أو التليفون…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
            </div>
            {totalDebt > 0 ? (
                <div className="close-card grand" style={{ marginBottom: 12 }}>
                    <div className="close-line"><span>إجمالي المديونيات القائمة</span><b>{fmt(totalDebt)} ج</b></div>
                </div>
            ) : null}
            <button className="btn btn-navy btn-block" style={{ marginBottom: 12 }} onClick={() => setAddOpen(true)}><Icon n="plus" size={18} /> إضافة عميل</button>
            {loading ? <div className="empty">جاري التحميل…</div> : filtered.length === 0 ? <div className="empty">{list.length === 0 ? 'مفيش عملاء لسه — ضيف أول عميل' : 'مفيش نتايج للبحث'}</div> : filtered.map((c) => (
                <button key={c.id} className="inv-row" style={{ width: '100%', textAlign: 'start' }} onClick={() => openDetail(c.id)}>
                    <div>
                        <div className="n">{c.name}</div>
                        <div className="m">{c.phone || 'بدون تليفون'}</div>
                    </div>
                    <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                        {(c.balance || 0) > 0 ? <span className="badge vcash" style={{ fontSize: 13 }}>عليه {fmt(c.balance!)} ج</span> : <span className="badge cash">صفر</span>}
                    </span>
                </button>
            ))}

            {addOpen ? (
                <>
                    <div className="sheet-back" onClick={() => setAddOpen(false)} />
                    <div className="sheet">
                        <div className="sheet-h"><h3>➕ عميل جديد</h3><button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setAddOpen(false)}>قفل</button></div>
                        <div className="sheet-b">
                            <div className="field"><label>اسم العميل</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
                            <div className="field"><label>تليفون (اختياري)</label><input inputMode="tel" dir="ltr" style={{ textAlign: 'end' }} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" /></div>
                            <button className="btn btn-amber btn-block" disabled={busy} onClick={add}>{busy ? '…' : 'حفظ'}</button>
                        </div>
                    </div>
                </>
            ) : null}

            {detail ? (
                <>
                    <div className="sheet-back" onClick={() => setDetail(null)} />
                    <div className="sheet">
                        <div className="sheet-h">
                            <h3>{detail.customer.name}</h3>
                            <button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setDetail(null)}>قفل</button>
                        </div>
                        <div className="sheet-b">
                            {editMode ? (
                                <>
                                    <div className="field"><label>الاسم</label><input value={detail.customer.name} onChange={(e) => setDetail({ ...detail, customer: { ...detail.customer, name: e.target.value } })} /></div>
                                    <div className="field"><label>تليفون</label><input dir="ltr" style={{ textAlign: 'end' }} value={detail.customer.phone} onChange={(e) => setDetail({ ...detail, customer: { ...detail.customer, phone: e.target.value } })} /></div>
                                    <div className="field"><label>ملاحظات</label><input value={detail.customer.notes} onChange={(e) => setDetail({ ...detail, customer: { ...detail.customer, notes: e.target.value } })} /></div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-blue btn-sm" disabled={busy} onClick={saveEdit}>حفظ</button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(false)}>إلغاء</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ textAlign: 'center', padding: '8px 0 14px' }}>
                                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{detail.customer.phone || 'بدون تليفون'}{detail.customer.notes ? ' · ' + detail.customer.notes : ''}</div>
                                        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>الرصيد المستحق</div>
                                        <div style={{ fontSize: 30, fontWeight: 800, color: detail.balance > 0 ? 'var(--danger)' : 'var(--ink)' }}>{fmt(detail.balance)} ج</div>
                                    </div>
                                    {manager ? (
                                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(true)}>✏️ تعديل</button>
                                            <button className="btn btn-danger btn-sm" onClick={del}>مسح العميل</button>
                                        </div>
                                    ) : null}
                                </>
                            )}

                            {detail.balance > 0 && !editMode ? (
                                <div className="close-card">
                                    <h4>💵 تسجيل دفعة</h4>
                                    <div className="field"><input inputMode="decimal" placeholder="المبلغ" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} /></div>
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

                            <h4 style={{ color: 'var(--navy)', margin: '14px 0 8px' }}>كشف الحساب</h4>
                            {detail.ledger.length === 0 ? <div className="empty" style={{ padding: 16 }}>مفيش حركات</div> : detail.ledger.map((l) => (
                                <div className="close-line" key={l.id}>
                                    <span>{l.kind === 'charge' ? '🧾 فاتورة' : '💵 دفعة'} · {fmtTime(l.ts)} · {l.staff}{l.note ? ' · ' + l.note : ''}</span>
                                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                        <b style={{ color: l.kind === 'charge' ? 'var(--danger)' : '#0f7a44' }}>{l.kind === 'charge' ? '+' : '-'}{fmt(l.amount)}</b>
                                        {manager && l.kind === 'payment' ? <button className="btn btn-danger btn-sm" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => delPayment(l.id)}>×</button> : null}
                                    </span>
                                </div>
                            ))}

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
