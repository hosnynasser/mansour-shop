import { API_BASE, cred } from './lib';

// عملية بيع واحدة شغّالة في أي وقت. بتعيش برّه الشاشة، فقفل/فتح الفاتورة أو تغيير التبويب مايضيّعش المفتاح،
// والرد المتأخر يوصل لنفس العملية. نفس المفتاح = نفس البيع (الخادم بيرجّع نفس الفاتورة لو اتسجلت).
export type SaleOpState = 'sending' | 'unconfirmed';
export interface SaleOp {
    key: string; payload: any; total: number; count: number; startedAt: number;
    state: SaleOpState; attempts: number; inflight: number; retryBusy: boolean;
    onOk: (r: any, totalMs: number) => void; onFail: (data: any) => void;
}
const TIMEOUT_MS = 30000;
let op: SaleOp | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const getOp = () => op;
export const subscribeOp = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const dropOp = () => { op = null; emit(); }; // تسجيل الخروج بس

const newKey = () => ((crypto as any).randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));

async function attempt(o: SaleOp) {
    o.attempts++; o.inflight++;
    const timer = setTimeout(() => { if (op === o) { if (o.state === 'sending') o.state = 'unconfirmed'; o.retryBusy = false; emit(); } }, TIMEOUT_MS);
    const ambiguous = () => { if (op === o && o.inflight <= 1) { o.state = 'unconfirmed'; o.retryBusy = false; emit(); } };
    try {
        const r = await fetch(API_BASE + '/api/pos/invoices', {
            method: 'POST',
            headers: { 'X-Admin-Code': cred(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...o.payload, key: o.key }),
        });
        const data = await r.json().catch(() => ({}));
        clearTimeout(timer);
        if (op !== o) return; // اتحسمت من محاولة تانية
        if (r.ok && data && data.ok) { op = null; emit(); o.onOk(data, Date.now() - o.startedAt); }
        else if (r.status >= 400 && r.status < 500 && data && data.error) { op = null; emit(); o.onFail(data); } // رفض صريح قبل أي تسجيل
        else ambiguous(); // 5xx أو رد مش مفهوم: ممكن يكون اتسجل
    } catch {
        clearTimeout(timer);
        ambiguous(); // انقطاع الشبكة: مش معروف إن كان اتسجل
    } finally { o.inflight--; }
}

export function startSale(payload: any, total: number, count: number, onOk: SaleOp['onOk'], onFail: SaleOp['onFail']): boolean {
    if (op) return false;
    op = { key: newKey(), payload, total, count, startedAt: Date.now(), state: 'sending', attempts: 0, inflight: 0, retryBusy: false, onOk, onFail };
    emit();
    attempt(op);
    return true;
}

// إعادة إرسال نفس الطلب بنفس المفتاح: لو الفاتورة اتسجلت بترجع هي نفسها، ولو ما اتسجلتش بتتسجل دلوقتي مرة واحدة
export function retrySale() {
    if (!op || op.state !== 'unconfirmed' || op.retryBusy) return;
    op.retryBusy = true; emit();
    attempt(op);
}

export function recordTiming(rec: { total: number; srv?: number; attempts: number; replay: boolean; items: number }) {
    try {
        const arr = JSON.parse(localStorage.getItem('pos_sale_timing') || '[]');
        arr.push({ at: new Date().toISOString(), ...rec });
        localStorage.setItem('pos_sale_timing', JSON.stringify(arr.slice(-10)));
    } catch {}
}
