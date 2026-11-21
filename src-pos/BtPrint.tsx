import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Invoice, InvoiceItem } from './lib';
import PrintDoc from './PrintDoc';

const RAWBT_PKG = 'ru.a402d.rawbtprinter';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=' + RAWBT_PKG;

// طباعة بلوتوث: بيرسم إيصال 80مم كصورة (عشان العربي يطلع سليم) وبيبعتها لتطبيق RawBT.
// لو RawBT مش متسطب، كروم بيفتح صفحته على بلاي ستور.
export default function BtPrint({ inv, items, logo, notify }: { inv: Invoice; items: InvoiceItem[]; logo: string; notify: (m: string, b?: boolean) => void }) {
    const [busy, setBusy] = useState(false);
    const [rendering, setRendering] = useState(false);
    const hostRef = useRef<HTMLDivElement | null>(null);

    const go = async () => {
        if (busy) return;
        if (!/android/i.test(navigator.userAgent)) { notify('الطباعة بلوتوث بتشتغل من موبايل أندرويد بس', true); return; }
        setBusy(true);
        setRendering(true);
        try {
            await new Promise((r) => setTimeout(r, 350));
            const host = hostRef.current;
            if (!host) throw new Error('no_host');
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(host.querySelector('.print-r80') as HTMLElement, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
            const b64 = canvas.toDataURL('image/png').split(',')[1];
            if (!b64) throw new Error('no_img');
            notify('بيفتح RawBT… لو مفتحش، نزّله من بلاي ستور وجرب تاني');
            const url = 'intent:data:image/png;base64,' + b64 +
                '#Intent;scheme=rawbt;package=' + RAWBT_PKG + ';S.browser_fallback_url=' + encodeURIComponent(PLAY_URL) + ';end;';
            window.location.href = url;
        } catch {
            notify('مشكلة في تجهيز الإيصال، جرب الطباعة العادية', true);
        }
        setRendering(false);
        setBusy(false);
    };

    return (
        <>
            <button className="btn btn-ghost btn-block" disabled={busy} onClick={go}>
                {busy ? '⏳ جاري التجهيز…' : '🖨️ طباعة بلوتوث (RawBT)'}
            </button>
            {rendering ? createPortal(
                <div ref={hostRef} className="bt-host" style={{ position: 'fixed', top: 0, left: -10000, zIndex: -1, pointerEvents: 'none' }} aria-hidden="true">
                    <style>{'.bt-host .print-area{display:block !important}.bt-host .print-r80{width:288px;margin:0;padding:6px 4px;font-size:13px;background:#fff}.bt-host .print-r80 table{font-size:13px}.bt-host .print-r80 .rt{font-size:17px}.bt-host .print-r80 .rf{font-size:12px}.bt-host .print-r80 .rh img{width:56px;height:56px}'}</style>
                    <PrintDoc inv={inv} items={items} mode="r80" logo={logo} />
                </div>,
                document.body
            ) : null}
        </>
    );
}
