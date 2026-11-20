import { useEffect, useState } from 'react';
import { api, buildCsv, downloadCsv, fmt, shareCsv, ProfitReport } from './lib';

export function ProfitView({ from, to, mode, notify }: { from: string; to: string; mode: 'profit' | 'cash'; notify: (m: string, b?: boolean) => void }) {
    const [r, setR] = useState<ProfitReport | null>(null);
    useEffect(() => {
        setR(null);
        api(`/api/pos/profit?from=${from}&to=${to}`).then(setR).catch(() => notify('مشكلة في تحميل التقرير', true));
    }, [from, to]);
    if (!r) return <div className="empty">جاري التحميل…</div>;
    const p = r.profit, c = r.cash;
    const col = (n: number) => (n < 0 ? 'var(--danger)' : 'var(--ok, #0f7a44)');
    if (mode === 'profit') {
        return (
            <>
                <div className="close-card grand">
                    <h4 style={{ color: '#fff' }}>📈 صافي الربح</h4>
                    <div className="close-line" style={{ fontSize: 22 }}><span>الصافي</span><b>{fmt(p.net)} ج</b></div>
                </div>
                <div className="close-card">
                    <h4>تفاصيل الأرباح</h4>
                    <div className="close-line"><span>إجمالي المبيعات</span><b>{fmt(p.revenue)} ج</b></div>
                    <div className="close-line"><span>تكلفة البضاعة المباعة</span><b>-{fmt(p.cogs)} ج</b></div>
                    <div className="close-line"><span>مجمل الربح</span><b style={{ color: col(p.gross) }}>{fmt(p.gross)} ج</b></div>
                    <div className="close-line"><span>المصاريف</span><b>-{fmt(p.expenses)} ج</b></div>
                    <div className="close-line" style={{ fontSize: 16 }}><span>صافي الربح</span><b style={{ color: col(p.net) }}>{fmt(p.net)} ج</b></div>
                </div>
                {p.noCostLines > 0 ? (
                    <div className="err-box" style={{ background: '#fff8ea', color: 'var(--amber-d)' }}>
                        ⚠️ في {p.noCostLines} سطر مبيعات صنفه تكلفته مش مسجلة، فالربح مبالغ فيه شوية. التكلفة بتتسجل أوتوماتيك من فواتير الشراء.
                    </div>
                ) : null}
                {r.expByCat.length > 0 ? (
                    <div className="close-card">
                        <h4>المصاريف حسب النوع</h4>
                        {r.expByCat.map((e) => <div className="close-line" key={e.cat}><span>{e.cat}</span><b>{fmt(e.total)} ج</b></div>)}
                    </div>
                ) : null}
                {r.byDay.length > 1 ? (
                    <div className="close-card">
                        <h4>المبيعات يوم بيوم</h4>
                        {r.byDay.map((d) => <div className="close-line" key={d.day}><span>{d.day} <span style={{ color: 'var(--muted)', fontSize: 12 }}>({d.count} فاتورة)</span></span><b>{fmt(d.revenue)} ج</b></div>)}
                    </div>
                ) : null}
            </>
        );
    }
    return (
        <>
            <div className="close-card grand">
                <h4 style={{ color: '#fff' }}>💵 صافي حركة الفلوس</h4>
                <div className="close-line" style={{ fontSize: 22 }}><span>الداخل - الخارج</span><b>{fmt(c.net)} ج</b></div>
            </div>
            <div className="close-card">
                <h4>⬇️ الداخل</h4>
                <div className="close-line"><span>مبيعات كاش</span><b>{fmt(c.in.cash)} ج</b></div>
                <div className="close-line"><span>مبيعات فودافون كاش</span><b>{fmt(c.in.vcash)} ج</b></div>
                <div className="close-line"><span>تحصيل ديون عملاء</span><b>{fmt(c.in.debtCollected)} ج</b></div>
                {c.in.cheques > 0 ? <div className="close-line"><span>شيكات اتصرفت</span><b>{fmt(c.in.cheques)} ج</b></div> : null}
                <div className="close-line" style={{ fontSize: 16 }}><span>إجمالي الداخل</span><b>{fmt(c.in.total)} ج</b></div>
            </div>
            <div className="close-card">
                <h4>⬆️ الخارج</h4>
                <div className="close-line"><span>مشتريات مدفوعة</span><b>{fmt(c.out.purchases)} ج</b></div>
                <div className="close-line"><span>سداد موردين</span><b>{fmt(c.out.supplierPayments)} ج</b></div>
                <div className="close-line"><span>مصاريف</span><b>{fmt(c.out.expenses)} ج</b></div>
                {c.out.cheques > 0 ? <div className="close-line"><span>شيكات اتصرفت</span><b>{fmt(c.out.cheques)} ج</b></div> : null}
                <div className="close-line" style={{ fontSize: 16 }}><span>إجمالي الخارج</span><b>{fmt(c.out.total)} ج</b></div>
            </div>
            <div className="close-card">
                <h4>📌 الموقف الحالي (مش مرتبط بالفترة)</h4>
                <div className="close-line"><span>ديون العملاء عندنا</span><b>{fmt(r.position.customerDebts)} ج</b></div>
                <div className="close-line"><span>ديون الموردين علينا</span><b>{fmt(r.position.supplierDebts)} ج</b></div>
                <div className="close-line"><span>شيكات واردة معلقة</span><b>{fmt(r.position.chequesIn)} ج</b></div>
                <div className="close-line"><span>شيكات صادرة معلقة</span><b>{fmt(r.position.chequesOut)} ج</b></div>
            </div>
        </>
    );
}

const EXPORTS: { kind: string; label: string; ranged: boolean }[] = [
    { kind: 'sales', label: '🧾 المبيعات (بالأصناف)', ranged: true },
    { kind: 'purchases', label: '🚚 المشتريات', ranged: true },
    { kind: 'expenses', label: '💸 المصاريف', ranged: true },
    { kind: 'debts', label: '🤝 مديونيات العملاء', ranged: false },
    { kind: 'stock', label: '📦 المخزون', ranged: false },
    { kind: 'cheques', label: '💳 الشيكات', ranged: false },
];

export function ExportCard({ from, to, notify }: { from: string; to: string; notify: (m: string, b?: boolean) => void }) {
    const [busy, setBusy] = useState('');
    const go = async (kind: string, ranged: boolean, how: 'dl' | 'share') => {
        if (busy) return;
        setBusy(kind + how);
        try {
            const r = await api(`/api/pos/export/${kind}` + (ranged ? `?from=${from}&to=${to}` : ''));
            const name = `mansour-${kind}${ranged ? `-${from}_${to}` : ''}.csv`;
            const csv = buildCsv(r.headers, r.rows);
            if (how === 'share') {
                if (!(await shareCsv(name, csv))) { downloadCsv(name, csv); notify('اتنزل الملف ✓'); }
            } else { downloadCsv(name, csv); notify(`اتنزل الملف ✓ (${r.rows.length} صف)`); }
        } catch { notify('مشكلة في التصدير', true); }
        setBusy('');
    };
    return (
        <div className="close-card">
            <h4>📤 تصدير لـ Excel</h4>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>الملف بيتفتح في Excel مباشرة. المبيعات والمشتريات والمصاريف بتتصدر حسب الفترة المختارة فوق.</div>
            {EXPORTS.map((e) => (
                <div key={e.kind} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{e.label}</span>
                    <button className="btn btn-navy btn-sm" disabled={!!busy} onClick={() => go(e.kind, e.ranged, 'dl')}>{busy === e.kind + 'dl' ? '…' : '⬇️ تنزيل'}</button>
                    <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => go(e.kind, e.ranged, 'share')}>📤</button>
                </div>
            ))}
        </div>
    );
}
