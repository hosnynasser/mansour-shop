import { useEffect, useState } from 'react';
import { api, cget, cset } from './lib';

// إظهار/إخفاء أزرار الفاتورة (واتساب، طباعة 80مم، طباعة PDF). الافتراضي: مخفي. محفوظة في إعدادات السيرفر.
export interface UiPrefs { wa: boolean; r80: boolean; pdf: boolean }
const HIDDEN: UiPrefs = { wa: false, r80: false, pdf: false };
let prefs: UiPrefs = { ...HIDDEN, ...(cget<UiPrefs>('uiprefs') || {}) };
const subs = new Set<() => void>();
const set = (p: UiPrefs) => { prefs = p; cset('uiprefs', p); subs.forEach((f) => f()); };

export async function loadUiPrefs() {
    try { const r = await api('/api/pos/ui-prefs'); set({ wa: !!r.prefs.wa, r80: !!r.prefs.r80, pdf: !!r.prefs.pdf }); } catch {}
}
export function useUiPrefs(): UiPrefs {
    const [, force] = useState(0);
    useEffect(() => { const f = () => force((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
    return prefs;
}

export function UiPrefsCard({ notify }: { notify: (m: string, b?: boolean) => void }) {
    const p = useUiPrefs();
    const [busy, setBusy] = useState(false);
    const toggle = async (k: keyof UiPrefs) => {
        if (busy) return;
        setBusy(true);
        try {
            const r = await api('/api/pos/ui-prefs', 'PUT', { ...p, [k]: !p[k] });
            set({ wa: !!r.prefs.wa, r80: !!r.prefs.r80, pdf: !!r.prefs.pdf });
        } catch { notify('الإعداد ماتحفظش، جرب تاني', true); }
        setBusy(false);
    };
    const row = (k: keyof UiPrefs, label: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 14 }}>{label}</span>
            <div className="pay-toggle" style={{ width: 140 }}>
                <button className={p[k] ? 'on' : ''} disabled={busy} onClick={() => !p[k] && toggle(k)}>ظاهر</button>
                <button className={!p[k] ? 'on' : ''} disabled={busy} onClick={() => p[k] && toggle(k)}>مخفي</button>
            </div>
        </div>
    );
    return (
        <div className="close-card" style={{ marginBottom: 4, display: 'grid', gap: 10 }}>
            <b style={{ color: 'var(--navy)' }}>أزرار الفاتورة (شاشة البيع وتفاصيل الفاتورة)</b>
            {row('wa', 'إرسال واتساب')}
            {row('r80', 'طباعة إيصال 80مم')}
            {row('pdf', 'طباعة / PDF (A4)')}
        </div>
    );
}
