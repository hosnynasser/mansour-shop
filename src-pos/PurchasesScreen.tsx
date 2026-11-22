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
    const [supDetail, setSupDetail] = useState<{ s: Supplier; purchases: Purchase[] } | null>(null);

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
            setSupDetail({ s: r.supplier, purchases: r.purchases || [] });
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

            {supDetail ? <SupplierSheet data={supDetail} onClose={() => setSupDetail(null)} onChanged={() => { setSupDetail(null); load(); }} notify={notify} /> : null}
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

export function SupplierSheet({ data, onClose, onChanged, notify, groups }: { groups?: string[]; data: { s: Supplier; purchases: Purchase[] }; onClose: () => void; onChanged: () => void; notify: (m: string, b?: boolean) => void }) {
    const { s, purchases } = data;
    const [amount, setAmount] = useState('');
    const [busy, setBusy] = useState(false);
    const [g, setG] = useState(s.grp || '');
    const [gBusy, setGBusy] = useState(false);
    const saveGrp = async () => {
        setGBusy(true);
        try { await api('/api/pos/supplier/' + s.id, 'PATCH', { name: s.name, phone: s.phone || '', notes: s.notes || '', grp: g.trim() }); notify('اتحفظت المجموعة ✓'); onChanged(); }
        catch { notify('مشكلة في حفظ المجموعة', true); setGBusy(false); }
    };
    const pay = async () => {
        const a = Number(amount) || 0;
        if (a <= 0 || busy) return;
        setBusy(true);
        try {
            const r = await api(`/api/pos/supplier/${s.id}/payment`, 'POST', { amount: a });
            notify('اتسجلت الدفعة ✓ — المتبقي ' + fmt(r.balance) + ' ج');
            onChanged();
        } catch { notify('مشكلة في التسجيل', true); setBusy(false); }
    };
    return (
        <>
            <div className="sheet-back" onClick={onClose} />
            <div className="sheet">
                <div className="sheet-h"><h3>🚚 {s.name}</h3><button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={onClose}>قفل</button></div>
                <div className="sheet-b">
                    {s.phone ? <div className="close-line"><span>التليفون</span><b dir="ltr">{s.phone}</b></div> : null}
                    <div className="close-line" style={{ fontSize: 17 }}><span>المتبقي ليه</span><b style={{ color: s.balance > 0 ? 'var(--danger)' : 'var(--ok)' }}>{fmt(s.balance)} ج</b></div>
                    {s.balance > 0 ? (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <input inputMode="decimal" placeholder="المبلغ المسدد" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 12px' }} />
                            <button className="btn btn-navy btn-sm" disabled={busy} onClick={pay}>{busy ? '…' : 'تسديد'}</button>
                        </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        <input list="sgrp-list2" maxLength={40} placeholder="المجموعة (اختياري)" value={g} onChange={(e) => setG(e.target.value)} style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 12px', fontSize: 16 }} />
                        <datalist id="sgrp-list2">{(groups || []).map((x) => <option key={x} value={x} />)}</datalist>
                        {g.trim() !== (s.grp || '') ? <button className="btn btn-navy btn-sm" disabled={gBusy} onClick={saveGrp}>{gBusy ? '…' : 'حفظ'}</button> : null}
                    </div>
                    <h4 style={{ margin: '14px 0 6px' }}>فواتير الشراء منه</h4>
                    {purchases.length === 0 ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>مفيش فواتير منه لسه</div> : purchases.filter((p) => p.status !== 'voided').map((p) => (
                        <div className="close-line" key={p.id}><span>{p.num} · {fmtTime(p.ts)}</span><b>{fmt(p.total)} ج</b></div>
                    ))}
                </div>
            </div>
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
