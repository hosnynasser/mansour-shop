import { useEffect, useState } from 'react';
import { api, cairoToday, fmt, fmtTime, paymentLabel, Invoice, Product, Role, Staff } from './lib';

// ---------- فواتير ----------
export function InvoicesScreen({ staff, openInvoice, notify }: { staff: Staff; openInvoice: (id: number) => void; notify: (m: string, b?: boolean) => void }) {
    const [list, setList] = useState<Invoice[]>([]);
    const [all, setAll] = useState(false);
    const [loading, setLoading] = useState(true);
    const manager = staff.role === 'manager';

    const load = async () => {
        setLoading(true);
        try {
            const r = await api('/api/pos/invoices' + (manager && all ? '?all=1' : ''));
            setList(r.invoices || []);
        } catch { notify('مشكلة في تحميل الفواتير', true); }
        setLoading(false);
    };
    useEffect(() => { load(); }, [all]);

    return (
        <>
            {manager ? (
                <div className="pay-toggle" style={{ marginBottom: 12 }}>
                    <button className={!all ? 'on' : ''} onClick={() => setAll(false)}>فواتيري</button>
                    <button className={all ? 'on' : ''} onClick={() => setAll(true)}>كل الفواتير</button>
                </div>
            ) : null}
            {loading ? <div className="empty">جاري التحميل…</div> : list.length === 0 ? <div className="empty">مفيش فواتير لسه</div> : list.map((v) => (
                <button key={v.id} className="inv-row" style={{ width: '100%', border: '1.5px solid var(--line)', textAlign: 'start' }} onClick={() => openInvoice(v.id)}>
                    <div className={v.status === 'voided' ? 'voided' : ''}>
                        <div className="n">{v.num} {v.status === 'voided' ? '(ملغاة)' : ''}</div>
                        <div className="m">{fmtTime(v.ts)} · {v.staff}{v.customer_name ? ' · ' + v.customer_name : ''}</div>
                    </div>
                    <span className={'badge ' + (v.payment === 'vcash' ? 'vcash' : 'cash')}>{paymentLabel(v.payment)}</span>
                    <span className={'amt' + (v.status === 'voided' ? ' voided' : '')}>{fmt(v.total)} ج</span>
                </button>
            ))}
        </>
    );
}

// ---------- المخزون ----------
export function StockScreen({ staff, products, refresh, notify }: { staff: Staff; products: Product[]; refresh: () => void; notify: (m: string, b?: boolean) => void }) {
    const manager = staff.role === 'manager';
    const [q, setQ] = useState('');
    const [edit, setEdit] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState('');
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
                    <div className="sn">{p.name}<span>{p.code}</span></div>
                    {manager ? (
                        <>
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
