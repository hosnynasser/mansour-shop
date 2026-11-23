import { useEffect, useState } from 'react';
import PN from './Bidi';
import ChequesPanel from './ChequesScreen';
import { api, fmt, fmtTime, Product, Purchase, PurchaseItem, Supplier } from './lib';

type Line = { code: string; qty: string; cost: string };

// ---------- المشتريات والموردين (مدير فقط) ----------
export default function PurchasesScreen({ products, refresh, notify, onChequesChanged }: { products: Product[]; refresh: () => void; notify: (m: string, b?: boolean) => void; onChequesChanged?: () => void }) {
    const [view, setView] = useState<'purchases' | 'suppliers' | 'cheques'>('purchases');
    const [purchases, setPurchases] = useState<Purchase[] | null>(null);
    const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
    const [newOpen, setNewOpen] = useState(false);
    const [supOpen, setSupOpen] = useState(false);
    const [detail, setDetail] = useState<{ p: Purchase; items: PurchaseItem[] } | null>(null);
    const [supDetail, setSupDetail] = useState<{ s: Supplier; purchases: Purchase[]; payments?: any[] } | null>(null);

    const load = async () => {
        try {
            const [p, s] = await Promise.all([api('/api/pos/purchases'), api('/api/pos/suppliers')]);
            setPurchases(p.purchases || []);
            setSuppliers(s.suppliers || []);
        } catch { notify('مشكلة في التحميل', true); }
    };
    useEffect(() => { load(); }, []);

    const openPurchase = async (id: number) => {
        try {
            const r = await api('/api/pos/purchase/' + id);
            setDetail({ p: r.purchase, items: r.items || [] });
        } catch { notify('مشكلة في فتح الفاتورة', true); }
    };
    const voidPurchase = async (id: number) => {
        if (!confirm('إلغاء فاتورة الشراء هيرجع الكميات من المخزون. متأكد؟')) return;
        try {
            await api(`/api/pos/purchase/${id}/void`, 'POST');
            setDetail(null);
            notify('اتلغت فاتورة الشراء ✓');
            load(); refresh();
        } catch (e: any) {
            notify(e?.data?.error === 'stock_too_low' ? 'مش ممكن الإلغاء: جزء من الكمية اتباع بالفعل (' + e.data.code + ')' : 'مشكلة في الإلغاء', true);
        }
    };
    const openSupplier = async (id: number) => {
        try {
            const r = await api('/api/pos/supplier/' + id);
            setSupDetail({ s: r.supplier, purchases: r.purchases || [], payments: r.payments || [] });
        } catch { notify('مشكلة في فتح المورد', true); }
    };

    return (
        <>
            <div className="pay-toggle" style={{ marginBottom: 12 }}>
                <button className={view === 'purchases' ? 'on' : ''} onClick={() => setView('purchases')}>🧾 فواتير الشراء</button>
                <button className={view === 'suppliers' ? 'on' : ''} onClick={() => setView('suppliers')}>🚚 الموردين</button>
                <button className={view === 'cheques' ? 'on' : ''} onClick={() => setView('cheques')}>💳 الشيكات</button>
            </div>

            {view === 'cheques' ? <ChequesPanel notify={notify} onChanged={() => onChequesChanged && onChequesChanged()} /> : null}

            {view === 'purchases' ? (
                <>
                    <button className="btn btn-amber btn-block" style={{ marginBottom: 12 }} onClick={() => setNewOpen(true)}>＋ فاتورة شراء جديدة</button>
                    {purchases === null ? <div className="empty">جاري التحميل…</div> : purchases.length === 0 ? <div className="empty">مفيش فواتير شراء لسه</div> : purchases.filter((p) => p.status !== 'voided').map((p) => (
                        <button key={p.id} className="inv-row" style={{ width: '100%', border: '1.5px solid var(--line)', textAlign: 'start' }} onClick={() => openPurchase(p.id)}>
                            <div>
                                <div className="n">{p.num}</div>
                                <div className="m">{fmtTime(p.ts)}{p.supplier_name ? ' · ' + p.supplier_name : ''}</div>
                                {p.total > p.paid ? <div className="m" style={{ color: 'var(--danger)', fontSize: 11 }}>متبقي علينا {fmt(p.total - p.paid)} ج</div> : null}
                            </div>
                            <span className="amt">{fmt(p.total)} ج</span>
                        </button>
                    ))}
                </>
            ) : view === 'suppliers' ? (
                <>
                    <button className="btn btn-amber btn-block" style={{ marginBottom: 12 }} onClick={() => setSupOpen(true)}>＋ مورد جديد</button>
                    {suppliers === null ? <div className="empty">جاري التحميل…</div> : suppliers.length === 0 ? <div className="empty">مفيش موردين لسه</div> : suppliers.map((s) => (
                        <button key={s.id} className="inv-row" style={{ width: '100%', border: '1.5px solid var(--line)', textAlign: 'start' }} onClick={() => openSupplier(s.id)}>
                            <div>
                                <div className="n">{s.name}</div>
                                <div className="m">{s.phone || 'بدون تليفون'}</div>
                            </div>
                            {s.balance > 0 ? <span className="amt" style={{ color: 'var(--danger)' }}>ليه {fmt(s.balance)} ج</span> : <span className="amt" style={{ color: 'var(--ok)' }}>صفر ✓</span>}
                        </button>
                    ))}
                </>
            ) : null}

            {newOpen ? <NewPurchaseSheet products={products} suppliers={suppliers || []} onClose={() => setNewOpen(false)} onDone={() => { setNewOpen(false); load(); refresh(); notify('اتسجلت فاتورة الشراء والمخزون اتحدث ✓'); }} notify={notify} /> : null}
            {supOpen ? <NewSupplierSheet onClose={() => setSupOpen(false)} onDone={() => { setSupOpen(false); load(); notify('اتضاف المورد ✓'); }} notify={notify} /> : null}

            {detail ? (
                <>
                    <div className="sheet-back" onClick={() => setDetail(null)} />
                    <div className="sheet">
                        <div className="sheet-h">
                            <h3>{detail.p.num}</h3>
                            <button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setDetail(null)}>قفل</button>
                        </div>
                        <div className="sheet-b">
                            <div className="close-line"><span>التاريخ</span><b>{fmtTime(detail.p.ts)}</b></div>
                            <div className="close-line"><span>الموظف</span><b>{detail.p.staff}</b></div>
                            {detail.p.supplier_name ? <div className="close-line"><span>المورد</span><b>{detail.p.supplier_name}</b></div> : null}
                            <div style={{ margin: '10px 0' }}>
                                {detail.items.map((it, i) => (
                                    <div className="close-line" key={i}>
                                        <span><PN t={it.name} /> × {it.qty} (تكلفة {fmt(it.cost)})</span>
                                        <b>{fmt(it.cost * it.qty)} ج</b>
                                    </div>
                                ))}
                            </div>
                            <div className="close-line"><span>الإجمالي</span><b>{fmt(detail.p.total)} ج</b></div>
                            <div className="close-line"><span>المدفوع</span><b>{fmt(detail.p.paid)} ج</b></div>
                            {detail.p.total > detail.p.paid ? <div className="close-line" style={{ color: 'var(--danger)' }}><span>المتبقي للمورد</span><b>{fmt(detail.p.total - detail.p.paid)} ج</b></div> : null}
                            {detail.p.note ? <div className="close-line"><span>ملاحظة</span><b>{detail.p.note}</b></div> : null}
                            <button className="btn btn-danger btn-block" style={{ marginTop: 12 }} onClick={() => voidPurchase(detail.p.id)}>إلغاء فاتورة الشراء</button>
                        </div>
                    </div>
                </>
            ) : null}

            {supDetail ? <SupplierSheet data={supDetail} onClose={() => setSupDetail(null)} onChanged={() => { setSupDetail(null); load(); }} onReload={load} notify={notify} /> : null}
        </>
    );
}

export function NewSupplierSheet({ onClose, onDone, notify, groups }: { groups?: string[]; onClose: () => void; onDone: () => void; notify: (m: string, b?: boolean) => void }) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [grp, setGrp] = useState('');
    const [busy, setBusy] = useState(false);
    const save = async () => {
        if (name.trim().length < 2 || busy) return;
        setBusy(true);
        try { await api('/api/pos/suppliers', 'POST', { name: name.trim(), phone: phone.trim(), grp: grp.trim() }); onDone(); }
        catch { notify('مشكلة في الحفظ', true); setBusy(false); }
    };
    return (
        <>
            <div className="sheet-back" onClick={onClose} />
            <div className="sheet">
                <div className="sheet-h"><h3>🚚 مورد جديد</h3><button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={onClose}>قفل</button></div>
                <div className="sheet-b">
                    <div className="field"><label>اسم المورد</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="شركة النور للكهرباء" /></div>
                    <div className="field"><label>تليفون (اختياري)</label><input inputMode="tel" dir="ltr" style={{ textAlign: 'end' }} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" /></div>
                    <div className="field"><label>المجموعة (اختياري)</label><input list="sgrp-list" maxLength={40} value={grp} onChange={(e) => setGrp(e.target.value)} placeholder="اكتب اسم مجموعة أو اختار" /></div>
                    <datalist id="sgrp-list">{(groups || []).map((g) => <option key={g} value={g} />)}</datalist>
                    <button className="btn btn-amber btn-block" disabled={busy || name.trim().length < 2} onClick={save}>{busy ? '…' : 'حفظ المورد'}</button>
                </div>
            </div>
        </>
    );
}

const cairoDayOf = (ts: string) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)); } catch { return ''; } };
function fmtTxS(ts: string) {
    try {
        const d = new Date(ts);
        const dm = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' }).format(d);
        const tm = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Africa/Cairo' }).format(d);
        return dm + ' ساعة ' + tm;
    } catch { return fmtTime(ts); }
}

export function SupplierSheet({ data, onClose, onChanged, onReload, notify, groups }: { groups?: string[]; data: { s: Supplier; purchases: Purchase[]; payments?: any[] }; onClose: () => void; onChanged: () => void; onReload?: () => void; notify: (m: string, b?: boolean) => void }) {
    const [d, setD] = useState(data);
    const { s, purchases } = d;
    const payments = d.payments || [];
    const [amount, setAmount] = useState('');
    const [busy, setBusy] = useState(false);
    const [g, setG] = useState(s.grp || '');
    const [gBusy, setGBusy] = useState(false);
    const [setOpen, setSetOpen] = useState(false);
    const [payOpen, setPayOpen] = useState(false);
    const [txSel, setTxSel] = useState<any>(null);
    const [txEdit, setTxEdit] = useState(false);
    const [eAmt, setEAmt] = useState('');
    const [eDate, setEDate] = useState('');
    const [eNote, setENote] = useState('');
    const [eBusy, setEBusy] = useState(false);
    const reload = async () => {
        const r = await api('/api/pos/supplier/' + s.id);
        setD({ s: r.supplier, purchases: r.purchases || [], payments: r.payments || [] });
        setG(r.supplier.grp || '');
        if (onReload) onReload();
    };
    const saveGrp = async () => {
        setGBusy(true);
        try { await api('/api/pos/supplier/' + s.id, 'PATCH', { name: s.name, phone: s.phone || '', notes: s.notes || '', grp: g.trim() }); notify('اتحفظت المجموعة ✓'); await reload(); setSetOpen(false); }
        catch { notify('مشكلة في حفظ المجموعة', true); }
        setGBusy(false);
    };
    const pay = async () => {
        const a = Number(amount) || 0;
        if (a <= 0 || busy) return;
        setBusy(true);
        try {
            const r = await api(`/api/pos/supplier/${s.id}/payment`, 'POST', { amount: a });
            notify('اتسجلت الدفعة ✓ — المتبقي ' + fmt(r.balance) + ' ج');
            setAmount(''); setPayOpen(false);
            await reload();
        } catch { notify('مشكلة في التسجيل', true); }
        setBusy(false);
    };
    const errMsg = (e: any) => {
        const c = e?.data?.error;
        if (c === 'changed') return 'القيد اتغير من مكان تاني، افتحه تاني وجرّب';
        if (c === 'exceeds_balance') return 'المبلغ الجديد أكبر من المتبقي للمورد';
        if (c === 'cheque_payment') return 'دفعة صرف الشيك مش بتتعدل من هنا';
        if (c === 'future_date') return 'مينفعش تاريخ في المستقبل';
        return 'مشكلة، القيد والرصيد زي ما هم';
    };
    const closeTx = () => { setTxSel(null); setTxEdit(false); };
    const saveTx = async () => {
        if (!txSel || eBusy) return;
        const amt = Math.round((Number(eAmt) || 0) * 100) / 100;
        if (!(amt > 0)) { notify('اكتب مبلغ صحيح', true); return; }
        if (!eDate) { notify('اختار التاريخ', true); return; }
        if (!confirm('تعدّل الدفعة؟ المبلغ من ' + fmt(txSel.p.amount) + ' ج إلى ' + fmt(amt) + ' ج، ورصيد المورد هيتعدّل بالفرق.')) return;
        setEBusy(true);
        try {
            await api('/api/pos/supplier-payment/' + txSel.id + '/edit', 'POST', { expected: txSel.p.amount, expectedTs: txSel.p.ts, expectedNote: txSel.p.note || '', amount: amt, note: eNote.trim(), ...(eDate !== cairoDayOf(txSel.ts) ? { date: eDate } : {}) });
            notify('اتعدّلت الدفعة ✓');
            closeTx();
            await reload();
        } catch (e: any) { notify(errMsg(e), true); }
        setEBusy(false);
    };
    const delTx = async () => {
        if (!txSel || eBusy) return;
        if (!confirm('تمسح الدفعة دي؟ المبلغ هيرجع على رصيد المورد.')) return;
        setEBusy(true);
        try {
            await api('/api/pos/supplier-payment/' + txSel.id + '/delete', 'POST', { expected: txSel.p.amount, expectedTs: txSel.p.ts, expectedNote: txSel.p.note || '' });
            notify('اتمسحت الدفعة ✓');
            closeTx();
            await reload();
        } catch (e: any) { notify(errMsg(e), true); }
        setEBusy(false);
    };

    // قايمة المعاملات: فواتير الشراء (بتزود المستحق بقيمة المتبقي) + الدفعات (بتنقصه). الرصيد بعد كل حركة بيتحسب من الرصيد الحالي للخلف.
    const rows = (() => {
        const all: any[] = [];
        purchases.filter((p) => p.status !== 'voided').forEach((p) => all.push({ type: 'purchase', id: p.id, ts: p.ts, effect: Math.round((p.total - p.paid) * 100) / 100, p }));
        payments.forEach((p: any) => all.push({ type: 'payment', id: p.id, ts: p.ts, effect: -p.amount, p }));
        let cutoff = '';
        if (purchases.length >= 50) cutoff = purchases.reduce((m, p) => (m === '' || p.ts < m ? p.ts : m), '');
        if (payments.length >= 100) { const pc = payments.reduce((m: string, p: any) => (m === '' || p.ts < m ? p.ts : m), ''); if (pc > cutoff) cutoff = pc; }
        // حركات بنفس وقت حد القص ممكن تكون ناقصة، فبنعرض الأحدث منه بس
        const list = all.filter((x) => !cutoff || x.ts > cutoff);
        list.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : a.type !== b.type ? (a.type === 'payment' ? -1 : 1) : b.id - a.id));
        // الرصيد بعد الحركة = الرصيد الحالي ناقص أثر الحركات الأحدث. مش بنعرضه لو فيه صرف شيك أحدث (أثره الفعلي مش مسجّل) أو حركة بنفس الوقت بالظبط (الترتيب مش مؤكد).
        let run = Math.round((s.balance || 0) * 100) / 100;
        let chequeNewer = false;
        return list.map((x, i) => {
            const tied = (i > 0 && list[i - 1].ts === x.ts) || (i < list.length - 1 && list[i + 1].ts === x.ts);
            const why = chequeNewer ? 'cheque' : tied ? 'tie' : '';
            const out = { ...x, after: why ? null : run, why };
            run = Math.round((run - x.effect) * 100) / 100;
            if (x.type === 'payment' && /^صرف شيك/.test(x.p.note || '')) chequeNewer = true;
            return out;
        });
    })();
    const hasHidden = rows.some((x: any) => x.after === null);
    const whyTxt = (w: string) => (w === 'cheque' ? 'غير متاح: فيه صرف شيك بعد الحركة دي، ومبلغه الفعلي على الرصيد مش مسجّل' : 'غير متاح: فيه حركة تانية بنفس الوقت بالظبط والترتيب مش مؤكد');
    const Arrow = ({ up }: { up: boolean }) => (
        <span className={'tx-ic ' + (up ? 'up' : 'down')} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{up ? <><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></> : <><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></>}</svg>
        </span>
    );
    const owe = s.balance > 0;
    const tx = txSel;
    return (
        <>
            <div className="sheet-back" onClick={onClose} />
            <div className="sheet tall">
                <div className="sheet-h">
                    <button className="btn btn-ghost btn-sm back-chev" aria-label="رجوع" onClick={onClose}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg></button>
                    <h3 className="cd-title">{s.name}<small>{s.phone || 'بدون تليفون'}</small></h3>
                    <button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} aria-expanded={setOpen} onClick={() => setSetOpen((v) => !v)}>⚙️ إعدادات</button>
                </div>
                <div className="sheet-b">
                    {setOpen ? (
                        <div className="close-card" style={{ marginBottom: 10 }}>
                            <h4>المجموعة</h4>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input list="sgrp-list2" maxLength={40} placeholder="المجموعة (اختياري)" value={g} onChange={(e) => setG(e.target.value)} style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 12px', fontSize: 16 }} />
                                <datalist id="sgrp-list2">{(groups || []).map((x) => <option key={x} value={x} />)}</datalist>
                                {g.trim() !== (s.grp || '') ? <button className="btn btn-navy btn-sm" disabled={gBusy} onClick={saveGrp}>{gBusy ? '…' : 'حفظ'}</button> : null}
                            </div>
                        </div>
                    ) : null}
                    <div className="bal-card">
                        <div className="l">{s.balance < 0 ? 'ليك عند المورد' : 'المتبقي للمورد'}</div>
                        <div className="v" style={{ color: owe ? 'var(--danger)' : s.balance < 0 ? '#0f7a44' : 'var(--ink)' }}>{fmt(Math.abs(s.balance))} ج</div>
                        {s.grp || s.notes ? <div className="s">{s.grp || ''}{s.grp && s.notes ? ' · ' : ''}{s.notes || ''}</div> : null}
                    </div>
                    {payOpen && owe ? (
                        <div className="close-card">
                            <h4>تسديد للمورد</h4>
                            <div className="field"><input inputMode="decimal" placeholder="المبلغ المسدد" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                            {Number(amount) > 0 ? <div style={{ fontSize: 13, color: 'var(--muted)', margin: '-4px 0 8px' }}>المتبقي بعد الدفعة: <b>{fmt(Math.max(0, s.balance - Number(amount)))} ج</b></div> : null}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-blue btn-sm" disabled={busy} onClick={pay}>{busy ? '…' : 'تسديد'}</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setAmount(String(s.balance))}>كامل المبلغ</button>
                            </div>
                        </div>
                    ) : null}
                    <h4 className="tx-title">معاملات ({rows.length})</h4>
                    {rows.length === 0 ? <div className="empty" style={{ padding: 16 }}>مفيش معاملات لسه</div> : rows.map((x) => {
                        const isP = x.type === 'purchase';
                        return (
                            <div className="tx-row" key={x.type + x.id} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => { setTxSel(x); setTxEdit(false); }}>
                                <Arrow up={isP} />
                                <div className="tx-mid">
                                    <div className="tx-d">{fmtTxS(x.ts)}</div>
                                    {x.after === null ? <div className="tx-b" style={{ color: 'var(--muted)' }}>الرصيد بعدها: غير متاح</div> : <div className="tx-b" style={{ color: x.after > 0 ? 'var(--danger)' : '#0f7a44' }}>الرصيد بعدها {fmt(Math.abs(x.after))} ج{x.after < 0 ? ' (ليك)' : ''}</div>}
                                    <div className="tx-n">{isP ? x.p.num : (x.p.note || '')}{!isP && x.p.staff ? (x.p.note ? ' · ' : '') + x.p.staff : ''}</div>
                                </div>
                                <div className="tx-amt">
                                    <b style={{ color: isP ? 'var(--danger)' : '#0f7a44' }}>{fmt(isP ? x.p.total : x.p.amount)} ج</b>
                                    <span>{isP ? 'فاتورة شراء' : 'دفعة'}</span>
                                </div>
                            </div>
                        );
                    })}
                    {hasHidden ? <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>الرصيد بعد بعض الحركات مش معروض لأنه مش مضمون (صرف شيك بعدها أو حركتين بنفس الوقت). الرصيد الحالي والمبالغ مظبوطين.</div> : null}
                </div>
                {owe ? (
                    <div className="detail-bar">
                        <button className="btn db-pay" onClick={() => setPayOpen((v) => !v)}>تسديد دفعة</button>
                    </div>
                ) : null}
            </div>
            {tx ? (
                <>
                    <div className="sheet-back" style={{ zIndex: 60 }} onClick={closeTx} />
                    <div className="sheet tall" style={{ zIndex: 61 }}>
                        <div className="sheet-h">
                            <button className="btn btn-ghost btn-sm back-chev" aria-label="رجوع" onClick={closeTx}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg></button>
                            <h3 className="cd-title">{s.name}</h3>
                        </div>
                        <div className="sheet-b">
                            {txEdit ? (
                                <>
                                    <h4 className="tx-title">تعديل دفعة</h4>
                                    <div className="field"><label>المبلغ</label><input inputMode="decimal" value={eAmt} onChange={(e) => setEAmt(e.target.value)} /></div>
                                    <div className="field"><label>التاريخ</label><input type="date" dir="ltr" style={{ textAlign: 'end' }} max={cairoDayOf(new Date().toISOString())} value={eDate} onChange={(e) => setEDate(e.target.value)} /></div>
                                    <div className="field"><label>التفاصيل</label><input maxLength={200} value={eNote} onChange={(e) => setENote(e.target.value)} /></div>
                                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>تغيير المبلغ بيعدّل رصيد المورد بالفرق، وتغيير التاريخ بينقل الدفعة لليوم الجديد في التقارير.</div>
                                </>
                            ) : (
                                <>
                                    <div className="tx-d" style={{ fontSize: 17, marginTop: 6 }}>{fmtTxS(tx.ts)}</div>
                                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 14 }}>{tx.type === 'purchase' ? 'فاتورة شراء ' + tx.p.num : 'دفعة للمورد'}</div>
                                    <div style={{ fontSize: 40, fontWeight: 800, color: tx.type === 'purchase' ? 'var(--danger)' : '#0f7a44', lineHeight: 1.2 }}>{fmt(tx.type === 'purchase' ? tx.p.total : tx.p.amount)} ج</div>
                                    {tx.after === null ? <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>الرصيد بعدها {whyTxt(tx.why)}</div> : <div className="tx-b" style={{ display: 'inline-block', marginTop: 8, padding: '3px 10px', borderRadius: 8, background: tx.after > 0 ? '#fdeaea' : '#e7f6ec', color: tx.after > 0 ? 'var(--danger)' : '#0f7a44' }}>الرصيد بعدها {fmt(Math.abs(tx.after))} ج{tx.after < 0 ? ' (ليك)' : ''}</div>}
                                    {tx.type === 'purchase' ? <div className="close-line" style={{ marginTop: 14 }}><span>المدفوع وقت الفاتورة</span><b>{fmt(tx.p.paid)} ج</b></div> : null}
                                    {tx.p.note ? <><h4 className="tx-title" style={{ marginTop: 22 }}>التفاصيل</h4><div style={{ color: 'var(--muted)' }}>{tx.p.note}</div></> : null}
                                    {tx.type === 'payment' && tx.p.staff ? <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14 }}>سجّلها: {tx.p.staff}</div> : null}
                                    {tx.type === 'purchase' ? <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 18 }}>فاتورة الشراء مرتبطة بالمخزون، تعديلها أو إلغاؤها من شاشة المشتريات.</div> : null}
                                    {tx.type === 'payment' && /^صرف شيك/.test(tx.p.note || '') ? <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 18 }}>دفعة صرف شيك، مش بتتعدل من هنا.</div> : null}
                                </>
                            )}
                        </div>
                        {tx.type === 'payment' && !/^صرف شيك/.test(tx.p.note || '') ? (
                            <div className="detail-bar">
                                {txEdit ? (
                                    <>
                                        <button className="btn db-pay" disabled={eBusy} onClick={saveTx}>حفظ</button>
                                        <button className="btn db-debt" disabled={eBusy} onClick={() => setTxEdit(false)}>إلغاء</button>
                                    </>
                                ) : (
                                    <>
                                        <button className="btn" style={{ background: '#e3f0ff', color: 'var(--blue)' }} onClick={() => { setEAmt(String(tx.p.amount)); setEDate(cairoDayOf(tx.ts)); setENote(tx.p.note || ''); setTxEdit(true); }}>تعديل</button>
                                        <button className="btn db-debt" disabled={eBusy} onClick={delTx}>حذف</button>
                                    </>
                                )}
                            </div>
                        ) : null}
                    </div>
                </>
            ) : null}
        </>
    );
}

function NewPurchaseSheet({ products, suppliers, onClose, onDone, notify }: { products: Product[]; suppliers: Supplier[]; onClose: () => void; onDone: () => void; notify: (m: string, b?: boolean) => void }) {
    const [supplierId, setSupplierId] = useState(0);
    const [lines, setLines] = useState<Line[]>([]);
    const [pick, setPick] = useState('');
    const [paid, setPaid] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    const addLine = (code: string) => {
        if (!code || lines.some((l) => l.code === code)) return;
        const p = products.find((x) => x.code === code);
        setLines((ls) => [...ls, { code, qty: '1', cost: String((p as any)?.cost || '') }]);
        setPick('');
    };
    const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0);

    const save = async () => {
        if (!lines.length || busy) return;
        setBusy(true);
        try {
            await api('/api/pos/purchases', 'POST', {
                supplierId: supplierId || undefined,
                paid: Number(paid) || 0,
                note: note.trim(),
                items: lines.map((l) => ({ code: l.code, qty: parseInt(l.qty, 10) || 0, cost: Number(l.cost) || 0 })),
            });
            onDone();
        } catch { notify('مشكلة في تسجيل فاتورة الشراء', true); setBusy(false); }
    };

    return (
        <>
            <div className="sheet-back" onClick={onClose} />
            <div className="sheet">
                <div className="sheet-h"><h3>🧾 فاتورة شراء جديدة</h3><button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={onClose}>قفل</button></div>
                <div className="sheet-b">
                    <div className="field">
                        <label>المورد (اختياري — لو عايز تسجل عليه آجل)</label>
                        <select value={supplierId} onChange={(e) => setSupplierId(parseInt(e.target.value, 10) || 0)} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 12px', background: '#fff' }}>
                            <option value={0}>بدون مورد (نقدي)</option>
                            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="field">
                        <label>إضافة صنف</label>
                        <select value={pick} onChange={(e) => addLine(e.target.value)} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 12px', background: '#fff' }}>
                            <option value="">اختار صنف…</option>
                            {products.filter((p) => !lines.some((l) => l.code === p.code)).map((p) => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
                        </select>
                    </div>
                    {lines.map((l) => {
                        const p = products.find((x) => x.code === l.code);
                        return (
                            <div key={l.code} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                                <div style={{ flex: 1.6, fontSize: 13, fontWeight: 700 }}><PN t={p?.name} /><div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{l.code}</div></div>
                                <input inputMode="numeric" placeholder="الكمية" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x) => x.code === l.code ? { ...x, qty: e.target.value } : x))} style={{ width: 64, border: '1.5px solid var(--line)', borderRadius: 10, padding: '8px', textAlign: 'center' }} />
                                <input inputMode="decimal" placeholder="تكلفة القطعة" value={l.cost} onChange={(e) => setLines((ls) => ls.map((x) => x.code === l.code ? { ...x, cost: e.target.value } : x))} style={{ width: 90, border: '1.5px solid var(--line)', borderRadius: 10, padding: '8px', textAlign: 'center' }} />
                                <button className="btn btn-ghost btn-sm" onClick={() => setLines((ls) => ls.filter((x) => x.code !== l.code))}>✕</button>
                            </div>
                        );
                    })}
                    <div className="field"><label>المدفوع دلوقتي (الباقي يتسجل آجل على المورد)</label><input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" /></div>
                    <div className="field"><label>ملاحظة (اختياري)</label><input value={note} onChange={(e) => setNote(e.target.value)} /></div>
                    <div className="close-line" style={{ fontSize: 17, margin: '8px 0' }}><span>إجمالي الفاتورة</span><b>{fmt(total)} ج</b></div>
                    <button className="btn btn-amber btn-block" disabled={busy || !lines.length} onClick={save}>{busy ? 'جاري التسجيل…' : '✅ تسجيل الشراء وزيادة المخزون'}</button>
                </div>
            </div>
        </>
    );
}
