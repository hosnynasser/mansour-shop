import { useEffect, useState } from 'react';
import { api, cairoToday, fmt, fmtTime, paymentLabel, Customer, Invoice, LedgerEntry, Product, Quote, Report, Role, Staff } from './lib';
import ScannerModal from './ScannerModal';

// ---------- فواتير ----------
export function InvoicesScreen({ staff, openInvoice, openQuote, notify }: { staff: Staff; openInvoice: (id: number) => void; openQuote: (id: number) => void; notify: (m: string, b?: boolean) => void }) {
    const [list, setList] = useState<Invoice[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [view, setView] = useState<'mine' | 'all' | 'quotes'>('mine');
    const [loading, setLoading] = useState(true);
    const manager = staff.role === 'manager';

    const load = async () => {
        setLoading(true);
        try {
            if (view === 'quotes') {
                const r = await api('/api/pos/quotes' + (manager ? '?all=1' : ''));
                setQuotes(r.quotes || []);
            } else {
                const r = await api('/api/pos/invoices' + (manager && view === 'all' ? '?all=1' : ''));
                setList(r.invoices || []);
            }
        } catch { notify('مشكلة في التحميل', true); }
        setLoading(false);
    };
    useEffect(() => { load(); }, [view]);

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
        </>
    );
}

// ---------- المخزون ----------
export function StockScreen({ staff, products, refresh, notify }: { staff: Staff; products: Product[]; refresh: () => void; notify: (m: string, b?: boolean) => void }) {
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
    const filtered = s ? products.filter((p) => p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s)) : products;

    const save = async (code: string) => {
        const v = edit[code];
        if (v === undefined) return;
        setBusy(code);
        try {
            await api('/api/pos/stock', 'POST', { code, qty: parseInt(v, 10) || 0 });
            setEdit((e) => { const n = { ...e }; delete n[code]; return n; });
            refresh();
            notify('تم حفظ الرصيد ✓');
        } catch (e: any) {
            notify(e?.data?.error === 'forbidden' ? 'الصلاحية دي للمدير بس' : 'مشكلة في الحفظ', true);
        }
        setBusy('');
    };

    return (
        <>
            <div className="search-wrap">
                <div className="search-box">
                    <span>🔍</span>
                    <input placeholder="ابحث بالاسم أو الكود…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
            </div>
            {!manager ? <div className="err-box" style={{ background: '#fff8ea', color: 'var(--amber-d)' }}>عرض فقط — تعديل الأرصدة للمدير</div> : null}
            {filtered.map((p) => (
                <div className="stock-row" key={p.code}>
                    <div className="sn">{p.name}<span>{p.code}{(p as any).barcode ? ' · 🏷️ ' + (p as any).barcode : ''}</span></div>
                    {manager ? (
                        <>
                            <button className="btn btn-ghost btn-sm" onClick={() => setScanFor(p.code)} title="ربط باركود">📷</button>
                            <input
                                inputMode="numeric"
                                value={edit[p.code] !== undefined ? edit[p.code] : String(p.qty)}
                                onChange={(e) => setEdit((x) => ({ ...x, [p.code]: e.target.value }))}
                            />
                            {edit[p.code] !== undefined && edit[p.code] !== String(p.qty) ? (
                                <button className="btn btn-blue btn-sm" disabled={busy === p.code} onClick={() => save(p.code)}>{busy === p.code ? '…' : 'حفظ'}</button>
                            ) : null}
                        </>
                    ) : (
                        <b style={{ minWidth: 40, textAlign: 'center' }}>{p.qty}</b>
                    )}
                </div>
            ))}
            {scanFor ? <ScannerModal title={'باركود: ' + scanFor} onScan={(code) => saveBarcode(scanFor, code)} onClose={() => setScanFor(null)} /> : null}
        </>
    );
}

// ---------- التقفيلة ----------
export function CloseScreen({ staff, notify }: { staff: Staff; notify: (m: string, b?: boolean) => void }) {
    const [date, setDate] = useState(cairoToday());
    const [rows, setRows] = useState<{ staff: string; count: number; total: number; cash_total: number; vcash_total: number }[]>([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const r = await api('/api/pos/close?date=' + date);
            setRows(r.rows || []);
        } catch { notify('مشكلة في تحميل التقفيلة', true); }
        setLoading(false);
    };
    useEffect(() => { load(); }, [date]);

    const grand = rows.reduce((a, r) => ({ count: a.count + r.count, total: a.total + r.total, cash: a.cash + r.cash_total, vcash: a.vcash + r.vcash_total }), { count: 0, total: 0, cash: 0, vcash: 0 });

    return (
        <>
            <div className="field">
                <label>اليوم</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" style={{ textAlign: 'end' }} />
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
    const [detail, setDetail] = useState<{ customer: Customer; ledger: LedgerEntry[]; balance: number; invoices: any[] } | null>(null);
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
                    <span>🔍</span>
                    <input placeholder="ابحث بالاسم أو التليفون…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
            </div>
            {totalDebt > 0 ? (
                <div className="close-card grand" style={{ marginBottom: 12 }}>
                    <div className="close-line"><span>إجمالي المديونيات القائمة</span><b>{fmt(totalDebt)} ج</b></div>
                </div>
            ) : null}
            <button className="btn btn-navy btn-block" style={{ marginBottom: 12 }} onClick={() => setAddOpen(true)}>➕ إضافة عميل</button>
            {loading ? <div className="empty">جاري التحميل…</div> : filtered.length === 0 ? <div className="empty">{list.length === 0 ? 'مفيش عملاء لسه — ضيف أول عميل' : 'مفيش نتايج للبحث'}</div> : filtered.map((c) => (
                <button key={c.id} className="inv-row" style={{ width: '100%', textAlign: 'start' }} onClick={() => openDetail(c.id)}>
                    <div>
                        <div className="n">{c.name}</div>
                        <div className="m">{c.phone || 'بدون تليفون'}</div>
                    </div>
                    {(c.balance || 0) > 0 ? <span className="badge vcash" style={{ fontSize: 13 }}>عليه {fmt(c.balance!)} ج</span> : <span className="badge cash">صفر</span>}
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
            {loading || !rep ? <div className="empty">جاري التحميل…</div> : (
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
                                    <span>{i + 1}. {p.name} <span style={{ color: 'var(--muted)', fontSize: 12 }}>× {p.qty}</span></span>
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
        </>
    );
}
