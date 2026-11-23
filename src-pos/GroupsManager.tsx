import { useEffect, useState } from 'react';
import { api } from './lib';

type G = { name: string; count: number };

// إدارة مجموعات العملاء أو الموردين: إضافة، تعديل الاسم، حذف المجموعة.
// حذف المجموعة بيشيلها من أعضائها بس (بيبقوا "بدون مجموعة")، العملاء/الموردين وأرصدتهم وقيودهم ما بتتلمسش.
export default function GroupsManager({ section, manager, onChanged, notify }: { section: 'customers' | 'suppliers'; manager: boolean; onChanged: () => void; notify: (m: string, b?: boolean) => void }) {
    const [list, setList] = useState<G[] | null>(null);
    const [err, setErr] = useState(false);
    const [nw, setNw] = useState('');
    const [edit, setEdit] = useState<string | null>(null);
    const [val, setVal] = useState('');
    const [busy, setBusy] = useState(false);
    const word = section === 'suppliers' ? 'مورد' : 'عميل';

    const load = async () => {
        try { const r = await api('/api/pos/groups?section=' + section); setList(r.groups || []); setErr(false); } catch { setErr(true); }
    };
    useEffect(() => { setList(null); setEdit(null); setNw(''); load(); }, [section]);

    const errMsg = (e: any) => {
        const c = e?.data?.error;
        if (c === 'exists') return 'فيه مجموعة بنفس الاسم دلوقتي. اختار اسم تاني.';
        if (c === 'changed') return 'عدد الأعضاء اتغيّر. القايمة اتحدّثت، جرّب تاني.';
        if (c === 'forbidden') return 'الصلاحية دي للمدير بس';
        if (c === 'not_found') return 'المجموعة دي مش موجودة';
        return 'مشكلة في الحفظ';
    };
    const run = async (fn: () => Promise<string>) => {
        if (busy) return; setBusy(true);
        try { const m = await fn(); await load(); onChanged(); notify(m); }
        catch (e: any) { notify(errMsg(e), true); await load(); onChanged(); }
        finally { setBusy(false); }
    };
    const add = () => {
        const name = nw.trim(); if (!name) return;
        run(async () => { await api('/api/pos/groups', 'POST', { section, name }); setNw(''); return 'اتضافت المجموعة ✓'; });
    };
    const rename = (g: G) => {
        const to = val.trim(); if (!to || to === g.name) { setEdit(null); return; }
        run(async () => { await api('/api/pos/groups/rename', 'POST', { section, from: g.name, to }); setEdit(null); return 'اتغير اسم المجموعة ✓'; });
    };
    const del = (g: G) => {
        const msg = g.count > 0
            ? `تمسح مجموعة "${g.name}"؟ ${g.count} ${word} هيبقوا من غير مجموعة. ${section === 'suppliers' ? 'الموردين' : 'العملاء'} وأرصدتهم وحساباتهم ما بتتغيّرش.`
            : `تمسح مجموعة "${g.name}" الفاضية؟`;
        if (!confirm(msg)) return;
        run(async () => { await api('/api/pos/groups/delete', 'POST', { section, name: g.name, expectedCount: g.count }); return 'اتمسحت المجموعة ✓'; });
    };

    return (
        <div>
            <h4 style={{ margin: '0 0 8px', color: 'var(--navy)' }}>المجموعات</h4>
            {manager ? (
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    <input value={nw} maxLength={40} placeholder="اسم مجموعة جديدة" onChange={(e) => setNw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} style={{ flex: 1, minWidth: 0, border: '1.5px solid var(--line)', borderRadius: 12, padding: '10px 12px', background: '#fff' }} />
                    <button className="btn btn-navy btn-sm" disabled={busy || !nw.trim()} onClick={add}>إضافة</button>
                </div>
            ) : <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>إدارة المجموعات للمدير بس.</div>}
            {err && !list ? <div className="empty" style={{ padding: 16 }}>مقدرتش أحمّل المجموعات. <button className="btn btn-ghost btn-sm" onClick={load}>جرّب تاني</button></div> : null}
            {!err && !list ? <div className="empty" style={{ padding: 16 }}>جاري التحميل…</div> : null}
            {list && list.length === 0 ? <div className="empty" style={{ padding: 16 }}>مفيش مجموعات لسه.</div> : null}
            {(list || []).map((g) => (
                <div key={g.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                    {edit === g.name ? (
                        <>
                            <input autoFocus value={val} maxLength={40} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') rename(g); }} style={{ flex: 1, minWidth: 0, border: '1.5px solid var(--line)', borderRadius: 12, padding: '8px 10px', background: '#fff' }} />
                            <button className="btn btn-navy btn-sm" disabled={busy} onClick={() => rename(g)}>حفظ</button>
                            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEdit(null)}>إلغاء</button>
                        </>
                    ) : (
                        <>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{g.count > 0 ? g.count + ' ' + word : 'فاضية'}</div>
                            </div>
                            {manager ? (
                                <>
                                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setEdit(g.name); setVal(g.name); }}>تعديل</button>
                                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} disabled={busy} onClick={() => del(g)}>مسح</button>
                                </>
                            ) : null}
                        </>
                    )}
                </div>
            ))}
        </div>
    );
}
