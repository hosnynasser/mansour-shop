import { useEffect, useState } from 'react';
import { api, cairoToday, fmt, Staff } from './lib';

const timeAr = (iso: string) => { try { return new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch { return iso; } };
interface AttRow { id: number; user: string; day: string; check_in: string; check_out: string; manual: number }
interface PayRow { user: string; kind: 'month' | 'day'; rate: number; hasRate: boolean; days: number; hours: number; earned: number; advances: number; paid: number; due: number }

// ---------- شريط حضور وانصراف (لكل الموظفين) ----------
export function AttendanceStrip({ notify }: { notify: (m: string, b?: boolean) => void }) {
    const [row, setRow] = useState<{ check_in: string; check_out: string } | null | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const load = async () => { try { const r = await api('/api/pos/attendance/me'); setRow(r.row); } catch {} };
    useEffect(() => { load(); }, []);
    if (row === undefined) return null;
    const isIn = !!row && !row.check_out;
    const done = !!row && !!row.check_out;
    const go = async () => {
        if (busy) return;
        if (isIn && !confirm('تسجيل انصراف دلوقتي؟')) return;
        setBusy(true);
        try { await api(isIn ? '/api/pos/attendance/out' : '/api/pos/attendance/in', 'POST'); notify(isIn ? 'اتسجل الانصراف ✓' : 'اتسجل الحضور ✓'); await load(); }
        catch { notify('مشكلة في التسجيل', true); }
        setBusy(false);
    };
    return (
        <div style={{ background: isIn ? '#e8f7ee' : done ? '#eef2f7' : '#fff8ea', borderBottom: '1px solid var(--line)', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ flex: 1, fontWeight: 700, color: 'var(--navy)' }}>
                {isIn ? `🟢 حاضر من ${timeAr(row!.check_in)}` : done ? `⏹️ انصرفت ${timeAr(row!.check_out)} (حضور ${timeAr(row!.check_in)})` : '⏱️ لسه ما سجلتش حضور النهارده'}
            </span>
            {!done || true ? <button className="btn btn-sm" style={{ padding: '5px 12px', fontSize: 13, background: isIn ? 'var(--danger)' : 'var(--navy)', color: '#fff' }} disabled={busy} onClick={go}>{isIn ? 'انصراف' : done ? 'حضور تاني' : 'تسجيل حضور'}</button> : null}
        </div>
    );
}

// ---------- الحضور والمرتبات (مدير) ----------
export default function PayrollHub({ me, staffNames, notify }: { me: Staff; staffNames: string[]; notify: (m: string, b?: boolean) => void }) {
    const [view, setView] = useState<'att' | 'pay'>('pay');
    const [month, setMonth] = useState(cairoToday().slice(0, 7));
    return (
        <>
            <div className="field"><label>الشهر</label><input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} dir="ltr" style={{ textAlign: 'end' }} /></div>
            <div className="pay-toggle" style={{ marginBottom: 12 }}>
                <button className={view === 'pay' ? 'on' : ''} onClick={() => setView('pay')}>💰 المرتبات</button>
                <button className={view === 'att' ? 'on' : ''} onClick={() => setView('att')}>⏱️ سجل الحضور</button>
            </div>
            {view === 'pay' ? <PayPanel month={month} staffNames={staffNames} notify={notify} /> : <AttPanel month={month} staffNames={staffNames} notify={notify} me={me} />}
        </>
    );
}

function AttPanel({ month, staffNames, notify }: { month: string; staffNames: string[]; notify: (m: string, b?: boolean) => void; me: Staff }) {
    const [rows, setRows] = useState<AttRow[] | null>(null);
    const [open, setOpen] = useState(false);
    const [user, setUser] = useState('');
    const [day, setDay] = useState(cairoToday());
    const [tin, setTin] = useState('09:00');
    const [tout, setTout] = useState('');
    const [busy, setBusy] = useState(false);
    const load = async () => { try { setRows((await api('/api/pos/attendance?month=' + month)).rows); } catch { notify('مشكلة في التحميل', true); } };
    useEffect(() => { setRows(null); load(); }, [month]);
    const save = async () => {
        if (!user.trim() || !tin || busy) { notify('اختار الموظف ووقت الحضور', true); return; }
        setBusy(true);
        try { await api('/api/pos/attendance', 'POST', { user: user.trim(), day, in: tin, out: tout || undefined }); setOpen(false); notify('اتسجل ✓'); load(); }
        catch { notify('مشكلة في التسجيل', true); }
        setBusy(false);
    };
    const del = async (id: number) => {
        if (!confirm('مسح التسجيل ده؟')) return;
        try { await api('/api/pos/attendance/' + id, 'DELETE'); load(); } catch { notify('مشكلة في المسح', true); }
    };
    return (
        <>
            <button className="btn btn-navy btn-block" style={{ marginBottom: 12 }} onClick={() => setOpen(!open)}>➕ تسجيل حضور يدوي (لو الموظف نسي)</button>
            {open ? (
                <div className="close-card">
                    <div className="field"><label>الموظف</label>
                        <input list="staff-names" value={user} onChange={(e) => setUser(e.target.value)} dir="ltr" style={{ textAlign: 'end' }} />
                        <datalist id="staff-names">{staffNames.map((n) => <option key={n} value={n} />)}</datalist>
                    </div>
                    <div className="field"><label>اليوم</label><input type="date" value={day} onChange={(e) => setDay(e.target.value)} dir="ltr" style={{ textAlign: 'end' }} /></div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <div className="field" style={{ flex: 1 }}><label>حضور</label><input type="time" value={tin} onChange={(e) => setTin(e.target.value)} dir="ltr" /></div>
                        <div className="field" style={{ flex: 1 }}><label>انصراف (اختياري)</label><input type="time" value={tout} onChange={(e) => setTout(e.target.value)} dir="ltr" /></div>
                    </div>
                    <button className="btn btn-amber btn-block" disabled={busy} onClick={save}>{busy ? '…' : 'حفظ'}</button>
                </div>
            ) : null}
            {rows === null ? <div className="empty">جاري التحميل…</div> : rows.length === 0 ? <div className="empty">مفيش حضور مسجل في الشهر ده</div> : rows.map((r) => (
                <div className="inv-row" key={r.id}>
                    <div>
                        <div className="n">{r.user}{r.manual ? ' ✍️' : ''}</div>
                        <div className="m">{r.day} · {timeAr(r.check_in)} ← {r.check_out ? timeAr(r.check_out) : 'لسه حاضر'}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => del(r.id)}>×</button>
                </div>
            ))}
        </>
    );
}

function PayPanel({ month, staffNames, notify }: { month: string; staffNames: string[]; notify: (m: string, b?: boolean) => void }) {
    const [data, setData] = useState<{ rows: PayRow[]; advances: { id: number; user: string; day: string; amount: number; note: string }[] } | null>(null);
    const [sel, setSel] = useState<PayRow | null>(null);
    const [newUser, setNewUser] = useState('');
    const load = async () => { try { setData(await api('/api/pos/payroll?month=' + month)); } catch { notify('مشكلة في التحميل', true); } };
    useEffect(() => { setData(null); load(); }, [month]);
    const names = new Set((data?.rows || []).map((r) => r.user));
    const missing = staffNames.filter((n) => !names.has(n));
    const totalDue = (data?.rows || []).reduce((s, r) => s + r.due, 0);
    return (
        <>
            {data ? (
                <div className="close-card grand">
                    <h4 style={{ color: '#fff' }}>💰 المستحق للموظفين عن الشهر</h4>
                    <div className="close-line" style={{ fontSize: 20 }}><span>الإجمالي</span><b>{fmt(totalDue)} ج</b></div>
                </div>
            ) : null}
            {data === null ? <div className="empty">جاري التحميل…</div> : data.rows.map((r) => (
                <button key={r.user} className="inv-row" style={{ width: '100%', textAlign: 'start', border: '1.5px solid var(--line)' }} onClick={() => setSel(r)}>
                    <div>
                        <div className="n">{r.user}</div>
                        <div className="m">{r.hasRate ? (r.kind === 'day' ? `يومية ${fmt(r.rate)} ج` : `شهري ${fmt(r.rate)} ج`) : '⚠️ مرتب مش متحدد'} · {r.days} يوم · {r.hours} ساعة</div>
                    </div>
                    <div className="amt" style={{ color: r.due > 0 ? 'var(--navy)' : 'var(--muted)' }}>{r.due > 0 ? `مستحق ${fmt(r.due)}` : 'مسدد ✓'}</div>
                </button>
            ))}
            {data && missing.length + 1 > 0 ? (
                <div className="close-card">
                    <h4>➕ تحديد مرتب موظف</h4>
                    <div className="field"><input list="pay-names" placeholder="اسم الموظف" value={newUser} onChange={(e) => setNewUser(e.target.value)} dir="ltr" style={{ textAlign: 'end' }} />
                        <datalist id="pay-names">{missing.map((n) => <option key={n} value={n} />)}</datalist></div>
                    <button className="btn btn-navy btn-block" onClick={() => { if (newUser.trim()) setSel({ user: newUser.trim(), kind: 'month', rate: 0, hasRate: false, days: 0, hours: 0, earned: 0, advances: 0, paid: 0, due: 0 }); }}>التالي</button>
                </div>
            ) : null}
            {sel ? <PaySheet row={sel} month={month} advances={(data?.advances || []).filter((a) => a.user === sel.user)} onClose={() => setSel(null)} onChanged={() => { load(); }} notify={notify} /> : null}
        </>
    );
}

function PaySheet({ row, month, advances, onClose, onChanged, notify }: { row: PayRow; month: string; advances: { id: number; day: string; amount: number; note: string }[]; onClose: () => void; onChanged: () => void; notify: (m: string, b?: boolean) => void }) {
    const [kind, setKind] = useState(row.kind);
    const [rate, setRate] = useState(row.rate ? String(row.rate) : '');
    const [adv, setAdv] = useState('');
    const [payAmt, setPayAmt] = useState('');
    const [busy, setBusy] = useState(false);
    const [cur, setCur] = useState(row);
    const run = async (fn: () => Promise<any>, msg: string) => {
        if (busy) return;
        setBusy(true);
        try { await fn(); notify(msg); const r = await api('/api/pos/payroll?month=' + month); const me = (r.rows as PayRow[]).find((x) => x.user === row.user); if (me) setCur(me); onChanged(); }
        catch { notify('مشكلة في العملية', true); }
        setBusy(false);
    };
    return (
        <>
            <div className="sheet-back" onClick={onClose} />
            <div className="sheet">
                <div className="sheet-h"><h3>💰 {row.user}</h3><button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={onClose}>قفل</button></div>
                <div className="sheet-b">
                    <div className="close-line"><span>أيام الحضور</span><b>{cur.days} يوم ({cur.hours} ساعة)</b></div>
                    <div className="close-line"><span>المستحق قبل الخصم</span><b>{fmt(cur.earned)} ج</b></div>
                    <div className="close-line"><span>سلف الشهر</span><b>-{fmt(cur.advances)} ج</b></div>
                    <div className="close-line"><span>اتصرف</span><b>-{fmt(cur.paid)} ج</b></div>
                    <div className="close-line" style={{ fontSize: 17 }}><span>الباقي</span><b>{fmt(cur.due)} ج</b></div>

                    <div className="close-card" style={{ marginTop: 12 }}>
                        <h4>نظام المرتب</h4>
                        <div className="pay-toggle" style={{ marginBottom: 8 }}>
                            <button className={kind === 'month' ? 'on' : ''} onClick={() => setKind('month')}>شهري ثابت</button>
                            <button className={kind === 'day' ? 'on' : ''} onClick={() => setKind('day')}>باليومية</button>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <input inputMode="decimal" placeholder={kind === 'day' ? 'اليومية' : 'المرتب الشهري'} value={rate} onChange={(e) => setRate(e.target.value)} style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 12px' }} />
                            <button className="btn btn-navy btn-sm" disabled={busy} onClick={() => run(() => api('/api/pos/pay/rate', 'POST', { user: row.user, kind, rate: Number(rate) || 0 }), 'اتحفظ ✓')}>حفظ</button>
                        </div>
                    </div>

                    <div className="close-card">
                        <h4>سلفة</h4>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <input inputMode="decimal" placeholder="المبلغ" value={adv} onChange={(e) => setAdv(e.target.value)} style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 12px' }} />
                            <button className="btn btn-navy btn-sm" disabled={busy} onClick={() => run(async () => { await api('/api/pos/pay/advance', 'POST', { user: row.user, amount: Number(adv) || 0 }); setAdv(''); }, 'اتسجلت السلفة ✓')}>تسجيل</button>
                        </div>
                        {advances.map((a) => (
                            <div className="close-line" key={a.id}><span>{a.day}{a.note ? ' · ' + a.note : ''}</span>
                                <span><b>{fmt(a.amount)} ج</b> <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }} onClick={() => run(() => api('/api/pos/pay/advance/' + a.id, 'DELETE'), 'اتمسحت ✓')}>×</button></span></div>
                        ))}
                    </div>

                    {cur.due > 0 ? (
                        <div className="close-card">
                            <h4>صرف المرتب</h4>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>بيتسجل تلقائي في المصاريف (نوع: مرتبات) وبيدخل في تقرير الأرباح.</div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input inputMode="decimal" placeholder={`المبلغ (الباقي ${fmt(cur.due)})`} value={payAmt} onChange={(e) => setPayAmt(e.target.value)} style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 12px' }} />
                                <button className="btn btn-amber btn-sm" disabled={busy} onClick={() => { if (confirm(`تأكيد صرف ${fmt(Number(payAmt) || cur.due)} ج لـ ${row.user}؟`)) run(async () => { await api('/api/pos/payroll/pay', 'POST', { user: row.user, month, amount: Number(payAmt) || cur.due }); setPayAmt(''); }, 'اتسجل الصرف ✓'); }}>صرف</button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </>
    );
}
