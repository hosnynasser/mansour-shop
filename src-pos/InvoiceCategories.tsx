import { useEffect, useState } from 'react';
import { api } from './lib';
type Cat = { id: number; name: string };
export function InvoiceCategoriesManager({ notify, onChanged }: { notify: (s: string, b?: boolean) => void; onChanged: () => void }) {
    const [cats, setCats] = useState<Cat[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [name, setName] = useState('');
    const [edit, setEdit] = useState<number | null>(null);
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);
    const load = async () => { setLoading(true); try { const r = await api('/api/pos/invoice-categories'); setCats(r.categories || []); setFailed(false); } catch { setFailed(true); } finally { setLoading(false); } };
    useEffect(() => { load(); }, []);
    const run = async (action: string, body: object) => {
        if (busy) return;
        setBusy(true);
        try { await api('/api/pos/invoice-categories' + action, 'POST', body); setName(''); setEdit(null); await load(); onChanged(); }
        catch (e: any) { notify(e?.data?.error === 'exists' ? 'فيه تصنيف بنفس الاسم' : 'التعديل ماتحفظش، جرب تاني', true); }
        finally { setBusy(false); }
    };
    return <div style={{ marginBottom: 16 }}>
        <h4>تصنيفات الفواتير</h4>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}><input aria-label="اسم تصنيف الفواتير" maxLength={40} placeholder="اسم تصنيف جديد" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 0, border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 12px', fontSize: 16 }} /><button className="btn btn-navy btn-sm" disabled={busy || !name.trim()} onClick={() => run('', { name: name.trim() })}>إضافة</button></div>
        {loading ? <div>جاري التحميل…</div> : failed ? <button className="btn btn-ghost" onClick={load}>فشل تحميل التصنيفات، جرّب تاني</button> : !cats.length ? <div>مفيش تصنيفات لسه</div> : cats.map((c) => <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
            {edit === c.id ? <><input aria-label="اسم التصنيف الجديد" value={value} maxLength={40} onChange={(e) => setValue(e.target.value)} style={{ flex: 1, minWidth: 0, border: '1.5px solid var(--line)', borderRadius: 10, padding: '9px 12px', fontSize: 16 }} /><button className="btn btn-navy btn-sm" disabled={busy || !value.trim()} onClick={() => run('/rename', { id: c.id, name: value.trim() })}>حفظ</button><button className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}>رجوع</button></> : <><b style={{ flex: 1, overflowWrap: 'anywhere' }}>{c.name}</b><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setEdit(c.id); setValue(c.name); }}>تعديل</button><button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} disabled={busy} onClick={() => { if (confirm('تمسح التصنيف؟ الفواتير هتفضل موجودة من غير تصنيف، ومبالغها وحساباتها مش هتتغير.')) run('/delete', { id: c.id }); }}>مسح</button></>}
        </div>)}
    </div>;
}
export function InvoiceCategoryPicker({ invoiceId, categoryId, onChanged, notify }: { invoiceId: number; categoryId?: number | null; onChanged: (id: number | null) => void; notify: (s: string, b?: boolean) => void }) {
    const [cats, setCats] = useState<Cat[]>([]);
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    useEffect(() => { let active = true; api('/api/pos/invoice-categories').then((r) => { if (active) { setCats(r.categories || []); setReady(true); } }).catch(() => {}); return () => { active = false; }; }, [invoiceId]);
    const save = async (v: string) => {
        setBusy(true);
        try { const id = Number(v) || null; await api('/api/pos/invoice/' + invoiceId + '/category', 'POST', { category_id: id }); onChanged(id); window.dispatchEvent(new Event('invoice-category-changed')); notify('اتحفظ التصنيف'); }
        catch { notify('التصنيف ماتحفظش، افتح الفاتورة تاني وجرب', true); }
        finally { setBusy(false); }
    };
    return <div className="field" style={{ marginTop: 12 }}><label>تصنيف الفاتورة (اختياري)</label><select aria-label="تصنيف الفاتورة" disabled={!ready || busy} value={categoryId || ''} onChange={(e) => save(e.target.value)}><option value="">بدون تصنيف</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{!ready ? <small>التصنيفات لسه مش متاحة، اقفل الفاتورة وافتحها تاني لو التحميل طول.</small> : null}</div>;
}
