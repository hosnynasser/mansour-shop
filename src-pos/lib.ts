export const API_BASE = 'https://mansour-shop-api.hosnynasser843.workers.dev';
export const SHOP_NAME = 'منصور للأدوات الكهربائية والصحية';
export const SHOP_PHONE = '01021924181';
export const SHOP_PHONE_INTL = '201021924181';

export type Role = 'manager' | 'cashier';
export interface Staff { user: string; role: Role; }
export interface Product { name: string; code: string; price: number; cat: string; stock: boolean; qty: number; }
export interface CartLine { code: string; name: string; price: number; qty: number; discount: number; }
export interface Invoice {
    id: number; num: string; ts: string; staff: string; payment: string;
    subtotal: number; discount: number; total: number; status: string;
    customer_name: string; customer_phone: string;
}
export interface InvoiceItem { code: string; name: string; price: number; qty: number; discount: number; line_total: number; }
export interface Customer { id: number; name: string; phone: string; notes: string; balance?: number; }
export interface LedgerEntry { id: number; ts: string; kind: 'charge' | 'payment'; amount: number; invoice_id: number | null; staff: string; note: string; }
export interface Report {
    from: string; to: string;
    summary: { count: number; total: number; cash_total: number; vcash_total: number; debt_total: number; discounts: number };
    top: { name: string; code: string; qty: number; revenue: number }[];
    byStaff: { staff: string; count: number; total: number }[];
    debtsOutstanding: number;
    topDebtors: { id: number; name: string; phone: string; balance: number }[];
    collectedInRange: number;
}

export function cred(): string {
    try { return localStorage.getItem('pos_cred') || ''; } catch { return ''; }
}
export function saveCred(c: string) {
    try { localStorage.setItem('pos_cred', c); } catch {}
}
export function clearCred() {
    try { localStorage.removeItem('pos_cred'); } catch {}
}

export async function api(path: string, method = 'GET', body?: any): Promise<any> {
    const r = await fetch(API_BASE + path, {
        method,
        headers: { 'X-Admin-Code': cred(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e: any = new Error(data.error || 'http_' + r.status); e.data = data; throw e; }
    return data;
}

export const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-EG', { maximumFractionDigits: 2 });

export function cairoToday(): string {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch { return new Date().toISOString().slice(0, 10); }
}

export function fmtTime(ts: string): string {
    try {
        return new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' }).format(new Date(ts));
    } catch { return ts; }
}

export const paymentLabel = (p: string) => (p === 'vcash' ? 'فودافون كاش' : p === 'debt' ? 'آجل' : 'كاش');

export function buildWaText(inv: Invoice, items: InvoiceItem[]): string {
    const L: string[] = [];
    L.push('🧾 ' + SHOP_NAME);
    L.push('فاتورة رقم: ' + inv.num);
    L.push('التاريخ: ' + fmtTime(inv.ts));
    if (inv.customer_name) L.push('العميل: ' + inv.customer_name);
    L.push('—————————');
    for (const it of items) {
        L.push(`${it.name} × ${it.qty} = ${fmt(it.line_total)} ج`);
    }
    L.push('—————————');
    L.push('الإجمالي قبل الخصم: ' + fmt(inv.subtotal) + ' ج');
    if (inv.discount > 0) L.push('الخصم: ' + fmt(inv.discount) + ' ج');
    L.push('✅ الإجمالي: ' + fmt(inv.total) + ' ج');
    L.push('طريقة الدفع: ' + paymentLabel(inv.payment));
    if (inv.payment === 'debt') L.push('⚠️ الحساب ده اتسجل آجل على العميل');
    L.push('شكراً لتعاملكم معنا 🌟');
    L.push('📞 ' + SHOP_PHONE);
    return L.join('\n');
}
