import { useEffect, useRef, useState } from 'react';

// قارئ الباركود بالكاميرا — html5-qrcode بتتحمل عند الفتح بس
export default function ScannerModal({ title, onScan, onClose }: { title: string; onScan: (code: string) => void; onClose: () => void }) {
    const [err, setErr] = useState('');
    const boxId = useRef('scan-' + Math.random().toString(36).slice(2));
    const stopRef = useRef<(() => void) | null>(null);
    const fired = useRef(false);

    useEffect(() => {
        let dead = false;
        (async () => {
            try {
                const { Html5Qrcode } = await import('html5-qrcode');
                if (dead) return;
                const scanner = new Html5Qrcode(boxId.current);
                stopRef.current = () => { scanner.stop().catch(() => {}); };
                await scanner.start(
                    { facingMode: 'environment' },
                    { fps: 10, qrbox: { width: 240, height: 140 } },
                    (text: string) => {
                        if (fired.current) return;
                        fired.current = true;
                        stopRef.current?.();
                        onScan(text.trim());
                    },
                    () => {},
                );
            } catch {
                if (!dead) setErr('الكاميرا مش متاحة — تأكد إنك سمحت باستخدامها وجرب تاني');
            }
        })();
        return () => { dead = true; stopRef.current?.(); };
    }, []);

    return (
        <>
            <div className="sheet-back" onClick={() => { stopRef.current?.(); onClose(); }} />
            <div className="sheet" style={{ maxHeight: '78vh' }}>
                <div className="sheet-h">
                    <h3>📷 {title}</h3>
                    <button className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => { stopRef.current?.(); onClose(); }}>قفل</button>
                </div>
                <div className="sheet-b">
                    {err ? <div className="err-box">{err}</div> : <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>وجّه الكاميرا ناحية الباركود</div>}
                    <div id={boxId.current} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', background: '#000', minHeight: 220 }} />
                </div>
            </div>
        </>
    );
}
