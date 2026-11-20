import { useEffect, useState } from 'react';
import { api, cairoToday, fmt, Cheque, Customer, Supplier } from './lib';

const stLabel = (c: Cheque, today: string) => c.status === 'cleared' ? '✅ اتصرف' : c.status === 'bounced' ? '❌ مرتجع' : c.due_day < today ? '🔴 متأخر' : '🕐 معلق';

function daysTo(day: string, today: string) {
    return Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
}

// ---------- الشيكات الآجلة (مدير فقط) ----------
export default function ChequesPanel({ notify, onChanged }: { notify: (m: string, b?: boolean) => void; onChanged: () => void }) {
    const [list, setList] = useState<Cheque[] | null>(null);
    const [totals, setTotals] = useState({ pendingIn: 0, pendingOut: 0 });
    const [today, setToday] = useState(cairoToday());
    const [flt, setFlt] = useState<'pending' | 'done'>('pending');
    const [newOpen, setNewOpen] = useState(false);
    const [detail, setDetail] = useState<Cheque | null>(null);

    const load = async () => {
        try {
            const r = await api('/api/pos/cheques');
            setList(r.cheques || []); setTotals(r.totals || { pendingIn: 0, pendingOut: 0 }); setToday(r.today || cairoToday());
            onChanged();
        } catch { notify('مشكلة في تحميل الشيكات', true); }
    };
    useEffect(() => { load(); }, []);

    const shown = (list || []).filter((c) => (flt === 'pending' ? c.status === 'pending' : c.status !== 'pending'));

    return (
        <>
            <div className="close-card grand" style={{ marginBottom: 12 }}>
                <h4 style={{ color: '#fff' }}>💳 الشيكات المعلقة</h4>
                <div className="close-line"><span>وارد من عملاء</span><b>{fmt(totals.pendingIn)} ج</b></div>
                <div className="close-line"><span>صادر لموردين</span><b>{fmt(totals.pendingOut)} ج</b></div>
            </div>
            <button className="btn btn-amber btn-block" style={{ marginBottom: 12 }} onClick={() => setNewOpen(true)}>＋ تسجيل شيك جديد</button>
            <div className="pay-toggle" style={{ marginBottom: 12 }}>
                <button className={flt === 'pending' ? 'on' : ''} onClick={() => setFlt('pending')}>🕐 المعلقة</button>
                <button className={flt === 'done' ? 'on' : ''} onClick={() => setFlt('done')}>📁 المنتهية</button>
            </div>
            {list === null ? <div className="empty">جاري التحميل…</div> : shown.length === 0 ? <div className="empty">{flt === 'pending' ? 'مفيش شيكات معلقة' : 'مفيش شيكات منتهية'}</div> : shown.map((c) => {
                const d = daysTo(c.due_day, today);
                const when = c.status !== 'pending' ? '' : d < 0 ? `متأخر ${-d} يوم` : d === 0 ? 'يستحق النهارده' : `باقي ${d} يوم`;
                return (
                    <button key={c.id} className="inv-row" style={{ width: '100%', border: c.status === 'pending' && d <= 3 ? '2px solid ' + (d < 0 ? 'var(--danger)' : 'var(--amber)') : '1.5px solid var(--line)', textAlign: 'start' }} onClick={() => setDetail(c)}>
                        <div>
                            <div className="n">{c.kind === 'in' ? '⬇️ وارد من' : '⬆️ صادر لـ'} {c.party}</div>
                            <div className="m">استحقاق {c.due_day}{when ? ' · ' + when : ''}{c.number ? ' · #' + c.number : ''}</div>
                            <div className="m">{stLabel(c, today)}</div>
                        </div>
                        <div className="amt">{fmt(c.amount)} ج</div>
                    </button>
                );
            })}
            {newOpen ? <NewCheque onClose={() => setNewOpen(false)} onDone={() => { setNewOpen(false); notify('اتسجل الشيك ✓'); load(); }} notify={notify} /> : null}
            {detail ? <ChequeDetail c={detail} today={today} onClose={() => setDetail(null)} onDone={(m) => { setDetail(null); notify(m); load(); }} notify={notify} /> : null}
        </>
    );
}

function ChequeDetail({ c, today, onClose, onDone, notify }: { c: Cheque; today: string; onClose: () => void; onDone: (m: string) => void; notify: (m: string, b?: boolean) => void }) {
    const [busy, setBusy] = useState(false);
    const act = async (a: 'clear' | 'bounce') => {
        const msg = a === 'clear'
            ? (c.kind === 'in' && c.customer_id ? 'تأكيد تحصيل الشيك؟ هيتخصم من مديونية العميل.' : c.kind === 'out' && c.supplier_id ? 'تأكيد صرف الشيك؟ هيتخصم من حساب المورد.' : 'تأكيد إن الشيك اتصرف؟')
            : 'تسجيل الشيك كمرتجع؟';
        if (busy || !confirm(msg)) return;
        setBusy(true);
        try { await api(`/api/pos/cheque/${c.id}/${a}`, 'POST'); onDone(a === 'clear' ? 'اتسجل إن الشيك اتصرف ✓' : 'اتسجل الشيك كمرتجع'); }
        catch { notify('مشكلة في التسجيل', true); setBusy(false); }
    };
    const del = async () => {
        if (busy || !confirm('حذف الشيك ده؟')) return;
        setBusy(true);
        try { await api('/api/pos/cheque/' + c.id, 'DELETE'); onDone('اتحذف الشيك ✓'); }
        catch { notify('مشكلة في الحذف', true); setBusy(false); }
    };
    return (
        <>
            <div className="sheet-back" onClick={onClose} />
            <div className="sheet">
                <div className="sheet-h"><h3>💳 شيك {c.kind === 'in' ? 'وارد' : 'صادر'}</h3><button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={onClose}>قفل</button></div>
                <div className="sheet-b">
                    <div className="close-line"><span>{c.kind === 'in' ? 'من' : 'إلى'}</span><b>{c.party}</b></div>
                    <div className="close-line"><span>المبلغ</span><b>{fmt(c.amount)} ج</b></div>
                    <div className="close-line"><span>تاريخ الاستحقاق</span><b>{c.due_day}</b></div>
                    {c.number ? <div className="close-line"><span>رقم الشيك</span><b dir="ltr">{c.number}</b></div> : null}
                    {c.bank ? <div className="close-line"><span>البنك</span><b>{c.bank}</b></div> : null}
                    <div className="close-line"><span>الحالة</span><b>{stLabel(c, today)}{c.done_day ? ' · ' + c.done_day : ''}</b></div>
                    {c.note ? <div className="close-line"><span>ملاحظة</span><b>{c.note}</b></div> : null}
                    <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                        {c.status === 'pending' ? (
                            <>
                                <button className="btn btn-amber btn-block" disabled={busy} onClick={() => act('clear')}>{c.kind === 'in' ? '✅ اتحصّل' : '✅ اتصرف'}</button>
                                <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => act('bounce')}>❌ مرتجع</button>
                            </>
                        ) : null}
                        {c.status !== 'cleared' ? <button className="btn btn-danger btn-block" disabled={busy} onClick={del}>حذف</button> : null}
                    </div>
                </div>
            </div>
        </>
    );
}

function NewCheque({ onClose, onDone, notify }: { onClose: () => void; onDone: () => void; notify: (m: string, b?: boolean) => void }) {
    const [kind, setKind] = useState<'in' | 'out'>('in');
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [partyId, setPartyId] = useState(0);
    const [party, setParty] = useState('');
    const [amount, setAmount] = useState('');
    const [due, setDue] = useState('');
    const [number, setNumber] = useState('');
    const [bank, setBank] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        (async () => {
            try {
                const [c, s] = await Promise.all([api('/api/pos/customers'), api('/api/pos/suppliers')]);
                setCustomers(c.customers || []); setSuppliers(s.suppliers || []);
            } catch {}
        })();
    }, []);
    const list = kind === 'in' ? customers : suppliers;
    const save = async () => {
        if (busy) return;
        const a = Number(amount) || 0;
        if (a <= 0 || !due || (!partyId && party.trim().length < 2)) { notify('اكتب الطرف والمبلغ وتاريخ الاستحقاق', true); return; }
        setBusy(true);
        try {
            await api('/api/pos/cheques', 'POST', { kind, customerId: kind === 'in' && partyId ? partyId : undefined, supplierId: kind === 'out' && partyId ? partyId : undefined, party: party.trim(), amount: a, dueDay: due, number: number.trim(), bank: bank.trim() });
            onDone();
        } catch { notify('مشكلة في تسجيل الشيك', true); setBusy(false); }
    };
    return (
        <>
            <div className="sheet-back" onClick={onClose} />
            <div className="sheet">
                <div className="sheet-h"><h3>💳 شيك جديد</h3><button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={onClose}>قفل</button></div>
                <div className="sheet-b">
                    <div className="pay-toggle" style={{ marginBottom: 12 }}>
                        <button className={kind === 'in' ? 'on' : ''} onClick={() => { setKind('in'); setPartyId(0); }}>⬇️ وارد من عميل</button>
                        <button className={kind === 'out' ? 'on' : ''} onClick={() => { setKind('out'); setPartyId(0); }}>⬆️ صادر لمورد</button>
                    </div>
                    <div className="field">
                        <label>{kind === 'in' ? 'العميل (لو مسجل — الشيك هيخصم من مديونيته لما يتحصل)' : 'المورد (لو مسجل — الشيك هيخصم من حسابه لما يتصرف)'}</label>
                        <select value={partyId} onChange={(e) => setPartyId(parseInt(e.target.value, 10) || 0)}>
                            <option value={0}>— مش مسجل / اكتب الاسم —</option>
                            {list.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    {!partyId ? <div className="field"><label>الاسم</label><input value={party} onChange={(e) => setParty(e.target.value)} /></div> : null}
                    <div className="field"><label>المبلغ</label><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                    <div className="field"><label>تاريخ الاستحقاق</label><input type="date" value={due} onChange={(e) => setDue(e.target.value)} dir="ltr" style={{ textAlign: 'end' }} /></div>
                    <div className="field"><label>رقم الشيك (اختياري)</label><input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" /></div>
                    <div className="field"><label>البنك (اختياري)</label><input value={bank} onChange={(e) => setBank(e.target.value)} /></div>
                    <button className="btn btn-amber btn-block" disabled={busy} onClick={save}>{busy ? 'جاري الحفظ…' : '✅ حفظ الشيك'}</button>
                </div>
            </div>
        </>
    );
}
