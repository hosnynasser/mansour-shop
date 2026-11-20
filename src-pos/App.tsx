import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, buildWaText, clearCred, cred, fmt, fmtTime, paymentLabel, saveCred, Invoice, InvoiceItem, Product, Staff } from './lib';
import SellScreen from './SellScreen';
import { CloseScreen, InvoicesScreen, StaffScreen, StockScreen } from './screens';
import PrintDoc from './PrintDoc';
import logo from '../src/photos/logo-mansour.png';

type Tab = 'sell' | 'invoices' | 'stock' | 'close' | 'staff';

export default function App() {
    const [staff, setStaff] = useState<Staff | null>(null);
    const [booting, setBooting] = useState(true);
    const [tab, setTab] = useState<Tab>('sell');
    const [products, setProducts] = useState<Product[]>([]);
    const [toast, setToast] = useState<{ msg: string; bad: boolean } | null>(null);
    const [done, setDone] = useState<{ inv: Invoice; items: InvoiceItem[] } | null>(null);
    const [detail, setDetail] = useState<{ inv: Invoice; items: InvoiceItem[] } | null>(null);
    const [printJob, setPrintJob] = useState<{ inv: Invoice; items: InvoiceItem[]; mode: 'r80' | 'a4' } | null>(null);

    const notify = useCallback((msg: string, bad = false) => {
        setToast({ msg, bad });
        setTimeout(() => setToast(null), 3200);
    }, []);

    const refreshProducts = useCallback(async () => {
        try { const r = await api('/api/pos/products'); setProducts(r.products || []); } catch {}
    }, []);

    useEffect(() => {
        (async () => {
            if (cred()) {
                try {
                    const me = await api('/api/pos/me');
                    setStaff(me);
                    refreshProducts();
                } catch { clearCred(); }
            }
            setBooting(false);
        })();
    }, []);

    // طباعة: بنحط الفاتورة في منطقة الطباعة وبعدين window.print
    useEffect(() => {
        if (printJob) {
            document.body.classList.add('printing');
            const clear = () => { setPrintJob(null); document.body.classList.remove('printing'); };
            const t = setTimeout(() => { window.print(); clear(); }, 80);
            const onAfter = () => clear();
            window.addEventListener('afterprint', onAfter);
            return () => { clearTimeout(t); window.removeEventListener('afterprint', onAfter); document.body.classList.remove('printing'); };
        }
    }, [printJob]);

    const openInvoice = async (id: number) => {
        try {
            const r = await api('/api/pos/invoice/' + id);
            setDetail({ inv: r.invoice, items: r.items || [] });
        } catch { notify('مشكلة في فتح الفاتورة', true); }
    };

    const voidInvoice = async (id: number) => {
        if (!confirm('متأكد إنك عايز تلغي الفاتورة دي؟ المخزون هيرجع تاني.')) return;
        try {
            await api(`/api/pos/invoice/${id}/void`, 'POST');
            setDetail(null); setDone(null);
            notify('اتلغت الفاتورة ✓');
            refreshProducts();
        } catch (e: any) {
            notify(e?.data?.error === 'forbidden' ? 'الإلغاء للمدير بس' : 'مشكلة في الإلغاء', true);
        }
    };

    const waShare = (inv: Invoice, items: InvoiceItem[]) => {
        const text = buildWaText(inv, items);
        let phone = (inv.customer_phone || '').replace(/\D/g, '');
        if (phone.startsWith('0')) phone = '2' + phone;
        const url = phone.length >= 11 ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };
    const sysShare = async (inv: Invoice, items: InvoiceItem[]) => {
        const text = buildWaText(inv, items);
        if ((navigator as any).share) {
            try { await (navigator as any).share({ title: 'فاتورة ' + inv.num, text }); } catch {}
        } else {
            try { await navigator.clipboard.writeText(text); notify('اتنسخ نص الفاتورة ✓'); } catch { notify('المشاركة مش متاحة على الجهاز ده', true); }
        }
    };

    // وضع اختبار الطباعة: /pos/?print-test=r80 أو a4 — يعرض فاتورة تجريبية على الشاشة بنفس CSS الطباعة
    const printTest = typeof location !== 'undefined' && new URLSearchParams(location.search).get('print-test');
    if (printTest === 'r80' || printTest === 'a4') {
        const demoInv: Invoice = { id: 1, num: 'INV-000002', ts: new Date().toISOString(), staff: 'mansour', payment: 'cash', subtotal: 265, discount: 0, total: 265, status: 'completed', customer_name: '', customer_phone: '' };
        const demoItems: InvoiceItem[] = [
            { code: 'EL-101', name: 'لمبة ليد 12 وات', price: 90, qty: 2, discount: 0, line_total: 180 },
            { code: 'EL-103', name: 'بريزة ديكور ثلاثية', price: 85, qty: 1, discount: 0, line_total: 85 },
        ];
        return (
            <div style={{ background: '#888', minHeight: '100vh', padding: 16 }}>
                <style>{`.print-area{display:block !important;background:#fff}`}</style>
                <PrintDoc inv={demoInv} items={demoItems} mode={printTest} logo={logo} />
            </div>
        );
    }

    if (booting) return <div className="pos-shell"><div className="empty" style={{ marginTop: 120 }}>⏳ جاري التحميل…</div></div>;

    if (!staff) return <Login onLogin={(s) => { setStaff(s); refreshProducts(); }} />;

    const manager = staff.role === 'manager';
    const tabs: { id: Tab; label: string; icon: string; managerOnly?: boolean }[] = [
        { id: 'sell', label: 'بيع', icon: '🛒' },
        { id: 'invoices', label: 'فواتير', icon: '🧾' },
        { id: 'stock', label: 'المخزون', icon: '📦' },
        { id: 'close', label: 'التقفيلة', icon: '📊' },
        { id: 'staff', label: 'الموظفين', icon: '👥', managerOnly: true },
    ];
    const activeDetail = done || detail;

    return (
        <div className="pos-shell">
            <div className="pos-top">
                <img src={logo} alt="منصور" />
                <div>
                    <div className="t1">كاشير منصور</div>
                    <div className="t2">MANSOUR POS</div>
                </div>
                <div className="who">
                    <b>{staff.user}</b>
                    {manager ? 'مدير' : 'كاشير'} ·{' '}
                    <a href="#" style={{ textDecoration: 'underline' }} onClick={(e) => { e.preventDefault(); clearCred(); setStaff(null); }}>خروج</a>
                </div>
            </div>

            <div className="pos-main">
                {tab === 'sell' ? <SellScreen products={products} onDone={(inv, items) => { setDone({ inv, items }); }} onNeedRefresh={refreshProducts} notify={notify} /> : null}
                {tab === 'invoices' ? <InvoicesScreen staff={staff} openInvoice={openInvoice} notify={notify} /> : null}
                {tab === 'stock' ? <StockScreen staff={staff} products={products} refresh={refreshProducts} notify={notify} /> : null}
                {tab === 'close' ? <CloseScreen staff={staff} notify={notify} /> : null}
                {tab === 'staff' && manager ? <StaffScreen me={staff} notify={notify} /> : null}
            </div>

            <nav className="pos-nav">
                {tabs.filter((t) => !t.managerOnly || manager).map((t) => (
                    <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                        <span className="ni">{t.icon}</span>{t.label}
                    </button>
                ))}
            </nav>

            {/* نجاح البيع */}
            {done ? (
                <>
                    <div className="sheet-back" />
                    <div className="sheet">
                        <div className="sheet-b">
                            <div className="done-hero">
                                <div className="big">✅</div>
                                <h2>تم تسجيل البيع</h2>
                                <div className="no">{done.inv.num} · {paymentLabel(done.inv.payment)}</div>
                                <div className="tt">{fmt(done.inv.total)} ج</div>
                            </div>
                            <div style={{ display: 'grid', gap: 8 }}>
                                <button className="btn btn-blue btn-block" onClick={() => setPrintJob({ ...done, mode: 'r80' })}>🖨️ طباعة إيصال (80مم)</button>
                                <button className="btn btn-ghost btn-block" onClick={() => setPrintJob({ ...done, mode: 'a4' })}>📄 طباعة / PDF (A4)</button>
                                <button className="btn btn-wa btn-block" onClick={() => waShare(done.inv, done.items)}>إرسال واتساب</button>
                                <button className="btn btn-ghost btn-block" onClick={() => sysShare(done.inv, done.items)}>📤 مشاركة</button>
                                {manager ? <button className="btn btn-danger btn-block" onClick={() => voidInvoice(done.inv.id)}>إلغاء الفاتورة</button> : null}
                                <button className="btn btn-amber btn-block" onClick={() => setDone(null)}>🛒 بيع جديد</button>
                            </div>
                        </div>
                    </div>
                </>
            ) : null}

            {/* تفاصيل فاتورة */}
            {detail ? (
                <>
                    <div className="sheet-back" onClick={() => setDetail(null)} />
                    <div className="sheet">
                        <div className="sheet-h">
                            <h3>{detail.inv.num} {detail.inv.status === 'voided' ? '(ملغاة)' : ''}</h3>
                            <button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setDetail(null)}>قفل</button>
                        </div>
                        <div className="sheet-b">
                            <div className="close-line"><span>التاريخ</span><b>{fmtTime(detail.inv.ts)}</b></div>
                            <div className="close-line"><span>الموظف</span><b>{detail.inv.staff}</b></div>
                            <div className="close-line"><span>الدفع</span><b>{paymentLabel(detail.inv.payment)}</b></div>
                            {detail.inv.customer_name ? <div className="close-line"><span>العميل</span><b>{detail.inv.customer_name}</b></div> : null}
                            <div style={{ margin: '10px 0' }}>
                                {detail.items.map((it, i) => (
                                    <div className="close-line" key={i}>
                                        <span>{it.name} × {it.qty}{it.discount > 0 ? ` (-${fmt(it.discount)})` : ''}</span>
                                        <b>{fmt(it.line_total)} ج</b>
                                    </div>
                                ))}
                            </div>
                            {detail.inv.discount > 0 ? <div className="close-line"><span>خصم الفاتورة</span><b>-{fmt(detail.inv.discount)} ج</b></div> : null}
                            <div className="close-line" style={{ fontSize: 17 }}><span>الإجمالي</span><b>{fmt(detail.inv.total)} ج</b></div>
                            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                                <button className="btn btn-blue btn-block" onClick={() => setPrintJob({ ...detail, mode: 'r80' })}>🖨️ طباعة إيصال (80مم)</button>
                                <button className="btn btn-ghost btn-block" onClick={() => setPrintJob({ ...detail, mode: 'a4' })}>📄 طباعة / PDF (A4)</button>
                                <button className="btn btn-wa btn-block" onClick={() => waShare(detail.inv, detail.items)}>إرسال واتساب</button>
                                <button className="btn btn-ghost btn-block" onClick={() => sysShare(detail.inv, detail.items)}>📤 مشاركة</button>
                                {manager && detail.inv.status !== 'voided' ? <button className="btn btn-danger btn-block" onClick={() => voidInvoice(detail.inv.id)}>إلغاء الفاتورة</button> : null}
                            </div>
                        </div>
                    </div>
                </>
            ) : null}

            {toast ? <div className="toast" style={toast.bad ? { background: 'var(--danger)' } : {}}>{toast.msg}</div> : null}
            {printJob ? createPortal(<PrintDoc inv={printJob.inv} items={printJob.items} mode={printJob.mode} logo={logo} />, document.body) : null}
        </div>
    );
}

function Login({ onLogin }: { onLogin: (s: Staff) => void }) {
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!user.trim() || !pass) return;
        setBusy(true); setErr('');
        saveCred(user.trim() + ':' + pass);
        try {
            const me = await api('/api/pos/me');
            onLogin(me);
        } catch {
            clearCred();
            setErr('بيانات الدخول غلط — جرب تاني');
        }
        setBusy(false);
    };

    return (
        <div className="pos-shell">
            <div className="pos-main login-wrap">
                <div className="login-card">
                    <img src={logo} alt="منصور" />
                    <h1>كاشير منصور</h1>
                    <p>سجل دخولك علشان تبدأ البيع</p>
                    {err ? <div className="err-box">{err}</div> : null}
                    <div className="field"><input placeholder="اسم المستخدم" value={user} onChange={(e) => setUser(e.target.value)} dir="ltr" style={{ textAlign: 'end' }} autoComplete="username" /></div>
                    <div className="field"><input type="password" placeholder="الباسورد" value={pass} onChange={(e) => setPass(e.target.value)} dir="ltr" style={{ textAlign: 'end' }} autoComplete="current-password" onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} /></div>
                    <button className="btn btn-amber btn-block" disabled={busy} onClick={submit}>{busy ? '…' : 'دخول'}</button>
                </div>
            </div>
        </div>
    );
}
