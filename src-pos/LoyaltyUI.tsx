import { useEffect, useState } from 'react';
import { api, fmt, fmtTime } from './lib';

export interface Loyalty { earnEvery: number; pointValue: number; enabled: boolean }

// ---------- إعدادات نقاط الولاء (مدير) ----------
export function LoyaltySettingsCard({ notify }: { notify: (m: string, b?: boolean) => void }) {
    const [open, setOpen] = useState(false);
    const [s, setS] = useState<Loyalty | null>(null);
    const [every, setEvery] = useState('');
    const [val, setVal] = useState('');
    const [on, setOn] = useState(true);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        api('/api/pos/loyalty').then((r) => { setS(r.settings); setEvery(String(r.settings.earnEvery)); setVal(String(r.settings.pointValue)); setOn(r.settings.enabled); }).catch(() => {});
    }, []);
    if (!s) return null;
    const save = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const r = await api('/api/pos/loyalty', 'PUT', { earnEvery: Number(every), pointValue: Number(val), enabled: on });
            setS(r.settings); notify('اتحفظت إعدادات النقاط ✓'); setOpen(false);
        } catch { notify('اكتب أرقام صحيحة', true); }
        setBusy(false);
    };
    return (
        <div className="close-card" style={{ marginBottom: 12 }}>
            <button className="btn btn-ghost btn-block" onClick={() => setOpen(!open)}>
                ⭐ نقاط الولاء: {s.enabled ? `نقطة كل ${fmt(s.earnEvery)} ج، والنقطة = ${fmt(s.pointValue)} ج` : 'متوقفة'} ✏️
            </button>
            {open ? (
                <div style={{ marginTop: 10 }}>
                    <div className="pay-toggle" style={{ marginBottom: 10 }}>
                        <button className={on ? 'on' : ''} onClick={() => setOn(true)}>شغالة</button>
                        <button className={!on ? 'on' : ''} onClick={() => setOn(false)}>متوقفة</button>
                    </div>
                    <div className="field"><label>العميل بياخد نقطة كل كام جنيه؟</label><input inputMode="decimal" value={every} onChange={(e) => setEvery(e.target.value)} /></div>
                    <div className="field"><label>قيمة النقطة الواحدة وقت الاستبدال (جنيه)</label><input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} /></div>
                    <button className="btn btn-amber btn-block" disabled={busy} onClick={save}>{busy ? '…' : 'حفظ'}</button>
                </div>
            ) : null}
        </div>
    );
}

// ---------- نقاط عميل في كارته ----------
export function PointsSection({ customerId, points, log, loyalty, manager, notify, onChanged }: { customerId: number; points: number; log: { ts: string; delta: number; kind: string; note: string }[]; loyalty: Loyalty; manager: boolean; notify: (m: string, b?: boolean) => void; onChanged: () => void }) {
    const [d, setD] = useState('');
    const [busy, setBusy] = useState(false);
    const adjust = async (sign: 1 | -1) => {
        const n = parseInt(d, 10) || 0;
        if (n <= 0 || busy) return;
        setBusy(true);
        try { await api(`/api/pos/customer/${customerId}/points`, 'POST', { delta: sign * n, note: 'تعديل يدوي' }); setD(''); notify('اتعدلت النقاط ✓'); onChanged(); }
        catch { notify('مشكلة في التعديل', true); }
        setBusy(false);
    };
    return (
        <div className="close-card">
            <h4>⭐ نقاط الولاء</h4>
            <div className="close-line" style={{ fontSize: 16 }}><span>الرصيد</span><b>{points} نقطة = {fmt(points * loyalty.pointValue)} ج</b></div>
            {log.slice(0, 5).map((l, i) => (
                <div className="close-line" key={i}><span style={{ fontSize: 12 }}>{fmtTime(l.ts)} · {l.note}</span><b style={{ color: l.delta > 0 ? '#0f7a44' : 'var(--danger)' }}>{l.delta > 0 ? '+' : ''}{l.delta}</b></div>
            ))}
            {manager ? (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input inputMode="numeric" placeholder="عدد نقاط" value={d} onChange={(e) => setD(e.target.value)} style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 10, padding: '8px 10px' }} />
                    <button className="btn btn-navy btn-sm" disabled={busy} onClick={() => adjust(1)}>＋ زود</button>
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => adjust(-1)}>－ اخصم</button>
                </div>
            ) : null}
        </div>
    );
}
