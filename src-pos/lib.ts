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
    pointsEarned?: number; pointsBalance?: number;
}
export interface InvoiceItem { code: string; name: string; price: number; qty: number; discount: number; line_total: number; }
export interface Customer { id: number; name: string; phone: string; notes: string; balance?: number; points?: number; }
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
export function cget<T>(k: string): T | null {
    try { const v = localStorage.getItem('pc_' + k); return v ? JSON.parse(v) as T : null; } catch { return null; }
}
export function cset(k: string, v: unknown) {
    try { localStorage.setItem('pc_' + k, JSON.stringify(v)); } catch {}
}
export function clearCred() {
    try { localStorage.removeItem('pos_cred'); Object.keys(localStorage).filter((x) => x.startsWith('pc_')).forEach((x) => localStorage.removeItem(x)); } catch {}
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

export const paymentLabel = (p: string) => (p === 'vcash' ? 'فودافون كاش' : p === 'debt' ? 'آجل' : p === 'quote' ? 'عرض سعر' : 'كاش');

export interface Supplier { id: number; name: string; phone: string; notes: string; balance: number; }
export interface Purchase { id: number; num: string; ts: string; staff: string; supplier_id: number; supplier_name: string; total: number; paid: number; status: string; note: string; }
export interface PurchaseItem { code: string; name: string; qty: number; cost: number; }
export interface Expense { id: number; ts: string; day: string; title: string; amount: number; cat: string; staff: string; note: string; }

export interface Quote {
    id: number; num: string; ts: string; staff: string;
    customer_name: string; customer_phone: string;
    subtotal: number; discount: number; total: number;
    status: 'open' | 'converted' | 'canceled'; invoice_id: number | null;
}
export function quoteAsInvoice(q: Quote): Invoice {
    return {
        id: q.id, num: q.num, ts: q.ts, staff: q.staff, payment: 'quote',
        subtotal: q.subtotal, discount: q.discount, total: q.total,
        status: q.status === 'canceled' ? 'voided' : 'completed',
        customer_name: q.customer_name, customer_phone: q.customer_phone,
    };
}

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
    if (inv.payment === 'quote') L.push('ℹ️ ده عرض سعر — الأسعار سارية وقت الإرسال');
    else L.push('طريقة الدفع: ' + paymentLabel(inv.payment));
    if (inv.payment === 'debt') L.push('⚠️ الحساب ده اتسجل آجل على العميل');
    L.push('شكراً لتعاملكم معنا 🌟');
    L.push('📞 ' + SHOP_PHONE);
    return L.join('\n');
}

export interface Cheque { id: number; ts: string; kind: 'in' | 'out'; party: string; customer_id: number; supplier_id: number; number: string; bank: string; amount: number; due_day: string; status: 'pending' | 'cleared' | 'bounced'; done_day: string; note: string; }
export interface ProfitReport {
    from: string; to: string;
    profit: { revenue: number; cogs: number; gross: number; expenses: number; net: number; noCostLines: number };
    expByCat: { cat: string; total: number }[];
    cash: {
        in: { cash: number; vcash: number; debtCollected: number; cheques: number; total: number };
        out: { purchases: number; supplierPayments: number; expenses: number; cheques: number; total: number };
        net: number;
    };
    purchasesTotal: number;
    byDay: { day: string; count: number; revenue: number }[];
    position: { customerDebts: number; supplierDebts: number; chequesIn: number; chequesOut: number };
}

// ---- تصدير CSV (بيتفتح في Excel بالعربي) ----
function csvCell(v: any): string {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function buildCsv(headers: string[], rows: any[][]): string {
    return '\ufeff' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
export function downloadCsv(filename: string, csv: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export async function shareCsv(filename: string, csv: string): Promise<boolean> {
    try {
        const file = new File([csv], filename, { type: 'text/csv' });
        const nav: any = navigator;
        if (nav.canShare && nav.canShare({ files: [file] })) { await nav.share({ files: [file], title: filename }); return true; }
    } catch { /* ignored */ }
    return false;
}
