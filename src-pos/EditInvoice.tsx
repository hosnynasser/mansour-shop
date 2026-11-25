import React, { useEffect, useRef, useState } from 'react';
import PN from './Bidi';
import { api, fmt, Customer, Invoice, InvoiceItem, Product } from './lib';

type Line = { code: string; name: string; price: string; qty: string; discount: number };

export default function EditInvoice({ inv, items, products, onClose, onSaved, notify }: {
    inv: Invoice; items: InvoiceItem[]; products: Product[]; onClose: () => void; onSaved: () => void; notify: (m: string, b?: boolean) => void;
}) {
    const [lines, setLines] = useState<Line[]>(() => items.map((i) => ({ code: i.code, name: i.name, price: String(i.price), qty: String(i.qty), discount: i.discount || 0 })));
    const [payment, setPayment] = useState(inv.payment === 'debt' || inv.payment === 'vcash' ? inv.payment : 'cash');
    const [custId, setCustId] = useState<number>((inv as any).customer_id || 0);
    const [customers, setCustomers] = useState<Customer[] | null>(null);
    const [disc, setDisc] = useState(String(inv.discount || 0));
    const [custOpen, setCustOpen] = useState(false);
    const [custQ, setCustQ] = useState('');
    const [prodQ, setProdQ] = useState('');
    const [busy, setBusy] = useState(false);
    const custRef = useRef<HTMLInputElement>(null);

    useEffect(() => { api('/api/pos/customers').then((r) => setCustomers(r.customers || [])).catch(() => { notify('مشكلة في تحميل العملاء', true); setCustomers([]); }); }, []);
    useEffect(() => { if (custOpen) custRef.current?.focus(); else setCustQ(''); }, [custOpen]);

    const sel = (customers || []).find((c) => c.id === custId);
    const custLabel = sel ? sel.name : custId ? inv.customer_name : '';
    const num = (s: string) => Math.max(0, Number(s) || 0);
    const sub = lines.reduce((s, l) => s + Math.max(0, num(l.price) * Math.max(1, parseInt(l.qty, 10) || 1) - l.discount), 0);
    const d = Math.min(sub, num(disc));
    const total = Math.round((sub - d) * 100) / 100;
    const setLine = (i: number, k: 'price' | 'qty', v: string) => setLines((ls) => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));
    const found = prodQ.trim() ? products.filter((p) => p.name.toLowerCase().includes(prodQ.trim().toLowerCase()) || p.code.toLowerCase().includes(prodQ.trim().toLowerCase())).slice(0, 8) : [];
    const addProd = (p: Product) => {
        setLines((ls) => ls.some((l) => l.code === p.code) ? ls.map((l) => l.code === p.code ? { ...l, qty: String((parseInt(l.qty, 10) || 0) + 1) } : l) : [...ls, { code: p.code, name: p.name, price: String(p.price), qty: '1', discount: 0 }]);
        setProdQ('');
    };
    const save = async () => {
        if (!lines.length) { notify('الفاتورة لازم يبقى فيها صنف', true); return; }
        if (payment === 'debt' && !custId) { notify('الآجل لازم يتحدد له عميل', true); return; }
        setBusy(true);
        try {
            await api('/api/pos/invoice/' + inv.id + '/edit', 'POST', {
                items: lines.map((l) => ({ code: l.code, qty: Math.max(1, parseInt(l.qty, 10) || 1), price: num(l.price), discount: l.discount })),
                payment, customerId: custId || 0, discount: d,
            });
            notify('اتعدّلت الفاتورة ✓');
            onSaved();
        } catch (e: any) {
            const er = e?.data?.error;
            notify(er === 'insufficient_stock' ? 'المخزون مش كفاية لصنف' + (e?.data?.code ? ' ' + e.data.code : '') : er === 'customer_required' ? 'الآجل لازم عميل' : er === 'has_redeem_points' ? 'الفاتورة دي فيها استبدال نقاط، مينفعش تغيّر العميل' : 'مشكلة في حفظ التعديل', true);
        } finally { setBusy(false); }
    };

    return (
        <>
            <div className="sheet-back" style={{ zIndex: 60 }} onClick={onClose} />
            <div className="sheet" style={{ zIndex: 61, maxHeight: '94%' }}>
                <div className="sheet-h">
                    <h3>تعديل {inv.num}</h3>
                    <button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={onClose}>قفل</button>
                </div>
                <div className="sheet-b">
                    <div className="field">
                        <label>العميل</label>
                        <div className="cust-dd-wrap" style={{ position: 'relative', marginBottom: 12 }}>
                            <input ref={custRef} value={custOpen ? custQ : custLabel} readOnly={!custOpen} placeholder={custOpen ? 'ابحث عن عميل…' : 'من غير عميل'} onChange={(e) => setCustQ(e.target.value)} onClick={() => { if (!custOpen) setCustOpen(true); }} style={{ width: '100%', paddingLeft: custId ? 112 : 58 }} />
                            <button className="btn btn-navy btn-sm" aria-label="اختيار عميل" style={{ position: 'absolute', left: 5, top: 5, bottom: 5, width: 46, minHeight: 0, padding: 0, justifyContent: 'center' }} onClick={() => setCustOpen((v) => !v)}>
                                <span style={{ fontSize: 16, lineHeight: 1, display: 'inline-block', transform: custOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
                            </button>
                            {custId ? <button className="btn btn-ghost btn-sm" style={{ position: 'absolute', left: 56, top: 5, bottom: 5, minHeight: 0, padding: '0 10px' }} onClick={() => { setCustId(0); setCustOpen(false); if (payment === 'debt') setPayment('cash'); }}>شيل</button> : null}
                            {custOpen ? (
                                <>
                                    <div className="cat-dd-back" onClick={() => setCustOpen(false)} />
                                    <div className="cat-dd-list cust-dd" role="listbox" aria-label="العملاء">
                                        {customers === null ? <div className="cust-dd-empty">جاري تحميل العملاء…</div> : null}
                                        {(customers || []).filter((c) => !custQ.trim() || c.name.toLowerCase().includes(custQ.trim().toLowerCase()) || c.phone.includes(custQ.trim())).slice(0, 40).map((c) => (
                                            <button key={c.id} role="option" aria-selected={custId === c.id} className={custId === c.id ? 'on' : ''} onClick={() => { setCustId(c.id); setCustOpen(false); custRef.current?.blur(); }}>
                                                <span className="cd-n"><b><PN t={c.name} /></b>{c.phone ? <small dir="ltr">{c.phone}</small> : null}</span>
                                                {(c.balance || 0) > 0 ? <span className="cd-b">عليه {fmt(c.balance || 0)}</span> : null}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </div>
                    <div className="field">
                        <label>طريقة الدفع</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
                            {([['cash', 'كاش'], ['vcash', 'فودافون كاش'], ['debt', 'آجل']] as const).map(([k, t]) => (
                                <button key={k} className={'btn btn-sm ' + (payment === k ? 'btn-navy' : 'btn-ghost')} onClick={() => { setPayment(k); if (k === 'debt' && !custId) setCustOpen(true); }}>{t}</button>
                            ))}
                        </div>
                    </div>
                    <div className="field"><label>الأصناف</label></div>
                    {lines.map((l, i) => (
                        <div key={l.code} style={{ borderBottom: '1px dashed #dde3ec', padding: '8px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <b style={{ flex: 1, fontSize: 14 }}><PN t={l.name} /></b>
                                <button className="btn btn-ghost btn-sm" style={{ minHeight: 0, padding: '2px 10px' }} aria-label="حذف الصنف" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>حذف</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginTop: 6, alignItems: 'end' }}>
                                <div><small>الكمية</small><input inputMode="numeric" dir="ltr" value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value.replace(/\D/g, ''))} style={{ width: '100%', textAlign: 'center' }} /></div>
                                <div><small>السعر</small><input inputMode="decimal" dir="ltr" value={l.price} onChange={(e) => setLine(i, 'price', e.target.value.replace(/[^\d.]/g, ''))} style={{ width: '100%', textAlign: 'center' }} /></div>
                                <b style={{ paddingBottom: 12, fontSize: 14 }}>{fmt(Math.max(0, num(l.price) * Math.max(1, parseInt(l.qty, 10) || 1) - l.discount))} ج</b>
                            </div>
                        </div>
                    ))}
                    <div className="field" style={{ marginTop: 10, position: 'relative' }}>
                        <label>إضافة صنف</label>
                        <input value={prodQ} onChange={(e) => setProdQ(e.target.value)} placeholder="ابحث بالاسم أو الكود…" style={{ width: '100%' }} />
                        {found.length ? (
                            <div style={{ border: '1px solid #dde3ec', borderRadius: 12, marginTop: 4, overflow: 'hidden' }}>
                                {found.map((p) => (
                                    <button key={p.code} className="btn btn-ghost btn-block" style={{ justifyContent: 'space-between', borderRadius: 0, minHeight: 0, padding: '8px 12px' }} onClick={() => addProd(p)}>
                                        <span><PN t={p.name} /></span><span>{fmt(p.price)} ج</span>
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <div className="field" style={{ marginTop: 10 }}>
                        <label>خصم على الفاتورة كلها (جنيه)</label>
                        <input inputMode="decimal" dir="ltr" value={disc} onChange={(e) => setDisc(e.target.value.replace(/[^\d.]/g, ''))} style={{ width: '100%', textAlign: 'end' }} />
                    </div>
                    <div className="close-line" style={{ fontSize: 17, margin: '8px 0' }}><span>الإجمالي الجديد</span><b>{fmt(total)} ج</b></div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>المخزون والمديونية بيتحدّثوا تلقائي مع التعديل.</div>
                </div>
                <div style={{ padding: '10px 18px 14px', borderTop: '1px solid #eef1f6' }}>
                    <button className="btn btn-amber btn-block" disabled={busy} onClick={save}>{busy ? 'جاري الحفظ…' : 'حفظ التعديل'}</button>
                </div>
            </div>
        </>
    );
}
