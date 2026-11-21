import { fmt, fmtTime, paymentLabel, Invoice, InvoiceItem, SHOP_NAME, SHOP_PHONE } from './lib';
import PN from './Bidi';

// منطقة الطباعة المخفية: بتظهر بس وقت الطباعة (إيصال 80مم أو فاتورة A4)
export default function PrintDoc({ inv, items, mode, logo }: { inv: Invoice; items: InvoiceItem[]; mode: 'r80' | 'a4'; logo: string }) {
    if (mode === 'r80') {
        return (
            <div className="print-area print-r80" dir="rtl">
                <div className="rh">
                    <img src={logo} alt="" />
                    <div className="sh-name">منصور</div>
                    <div>{SHOP_NAME}</div>
                    <div>📞 {SHOP_PHONE}</div>
                </div>
                <div>فاتورة: {inv.num}</div>
                <div>التاريخ: {fmtTime(inv.ts)}</div>
                {inv.customer_name ? <div>العميل: {inv.customer_name}</div> : null}
                <table>
                    <tbody>
                        {items.map((it, i) => (
                            <tr key={i}>
                                <td><PN t={it.name} /><br />{fmt(it.price)} × {it.qty}{it.discount > 0 ? ` (-${fmt(it.discount)})` : ''}</td>
                                <td className="rl">{fmt(it.line_total)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {inv.discount > 0 ? <div>خصم الفاتورة: -{fmt(inv.discount)}</div> : null}
                <div className="rt">الإجمالي: {fmt(inv.total)} ج</div>
                <div>الدفع: {paymentLabel(inv.payment)}</div>
                <div className="rf">شكراً لتعاملكم معنا</div>
            </div>
        );
    }
    return (
        <div className="print-area print-a4" dir="rtl">
            <div className="ph">
                <img src={logo} alt="" />
                <div>
                    <div className="sh-name">منصور | MANSOUR</div>
                    <div className="sh-sub">{SHOP_NAME}</div>
                    <div className="sh-sub">📞 {SHOP_PHONE}</div>
                </div>
                <div style={{ marginInlineStart: 'auto', textAlign: 'end', fontSize: 13 }}>
                    <div><b>فاتورة رقم:</b> {inv.num}</div>
                    <div><b>التاريخ:</b> {fmtTime(inv.ts)}</div>
                    {inv.customer_name ? <div><b>العميل:</b> {inv.customer_name}</div> : null}
                    {inv.customer_phone ? <div><b>تليفون:</b> {inv.customer_phone}</div> : null}
                </div>
            </div>
            <table>
                <thead>
                    <tr><th>الصنف</th><th>الكود</th><th>السعر</th><th>الكمية</th><th>خصم</th><th>الإجمالي</th></tr>
                </thead>
                <tbody>
                    {items.map((it, i) => (
                        <tr key={i}>
                            <td><PN t={it.name} /></td><td>{it.code}</td><td>{fmt(it.price)}</td><td>{it.qty}</td>
                            <td>{it.discount > 0 ? fmt(it.discount) : '-'}</td><td>{fmt(it.line_total)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <table style={{ width: '55%', marginInlineStart: 'auto' }}>
                <tbody>
                    <tr><td>الإجمالي قبل الخصم</td><td>{fmt(inv.subtotal)} ج</td></tr>
                    {inv.discount > 0 ? <tr><td>خصم الفاتورة</td><td>-{fmt(inv.discount)} ج</td></tr> : null}
                    <tr className="tot-row"><td>الإجمالي النهائي</td><td>{fmt(inv.total)} ج</td></tr>
                    <tr><td>طريقة الدفع</td><td>{paymentLabel(inv.payment)}</td></tr>
                </tbody>
            </table>
            <div className="pfoot">شكراً لتعاملكم معنا — {SHOP_NAME} — {SHOP_PHONE}</div>
        </div>
    );
}
