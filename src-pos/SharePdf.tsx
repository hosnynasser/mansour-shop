import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Invoice, InvoiceItem } from './lib';
import PrintDoc from './PrintDoc';

// زرار مشاركة الفاتورة PDF على واتساب: بيرسم فاتورة A4 بره الشاشة → صورة → PDF → مشاركة
export default function SharePdf({ inv, items, logo, notify }: { inv: Invoice; items: InvoiceItem[]; logo: string; notify: (m: string, b?: boolean) => void }) {
    const [busy, setBusy] = useState(false);
    const [rendering, setRendering] = useState(false);
    const hostRef = useRef<HTMLDivElement | null>(null);

    const share = async () => {
        if (busy) return;
        setBusy(true);
        setRendering(true);
        try {
            // نستنى فريمين عشان الرسم يخلص (والصورة تجهز)
            await new Promise((r) => setTimeout(r, 350));
            const host = hostRef.current;
            if (!host) throw new Error('no_host');
            const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
            const canvas = await html2canvas(host.querySelector('.print-a4') as HTMLElement, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false,
            });
            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            const pageW = 210, pageH = 297;
            const imgW = pageW;
            const imgH = (canvas.height * imgW) / canvas.width;
            const img = canvas.toDataURL('image/jpeg', 0.92);
            if (imgH <= pageH) {
                pdf.addImage(img, 'JPEG', 0, 0, imgW, imgH);
            } else {
                // تقسيم على صفحات لو الفاتورة طويلة
                let left = imgH, pos = 0;
                pdf.addImage(img, 'JPEG', 0, pos, imgW, imgH);
                left -= pageH;
                while (left > 0) {
                    pos -= pageH;
                    pdf.addPage();
                    pdf.addImage(img, 'JPEG', 0, pos, imgW, imgH);
                    left -= pageH;
                }
            }
            const blob = pdf.output('blob');
            const file = new File([blob], inv.num + '.pdf', { type: 'application/pdf' });
            const nav = navigator as any;
            if (nav.canShare && nav.canShare({ files: [file] })) {
                await nav.share({ files: [file], title: 'فاتورة ' + inv.num });
            } else {
                // fallback: نزّل الملف
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = inv.num + '.pdf';
                a.click();
                URL.revokeObjectURL(url);
                notify('اتنزل ملف الـ PDF ✓');
            }
        } catch (e: any) {
            if (e?.name !== 'AbortError') notify('مشكلة في تجهيز الـ PDF، جرب الطباعة العادية', true);
        }
        setRendering(false);
        setBusy(false);
    };

    return (
        <>
            <button className="btn btn-wa btn-block" disabled={busy} onClick={share}>
                {busy ? '⏳ جاري تجهيز الـ PDF…' : '📄 إرسال PDF على واتساب'}
            </button>
            {rendering ? createPortal(
                <div ref={hostRef} style={{ position: 'fixed', top: 0, left: -10000, zIndex: -1, pointerEvents: 'none' }} aria-hidden="true">
                    <style>{'.print-area{display:block !important}'}</style>
                    <PrintDoc inv={inv} items={items} mode="a4" logo={logo} />
                </div>,
                document.body
            ) : null}
        </>
    );
}
