import { useEffect, useState } from 'react';

export default function CatChips({ categories, sel, setSel, extraNone, products }: { categories: string[]; sel: string; setSel: (c: string) => void; extraNone?: boolean; products?: { cat?: string }[] }) {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!open) return;
        document.documentElement.classList.add('dd-lock');
        return () => document.documentElement.classList.remove('dd-lock');
    }, [open]);
    if (!categories.length) return null;
    const pick = (c: string) => { setSel(c); setOpen(false); };
    const counts = new Map<string, number>();
    let uncat = 0;
    (products || []).forEach((p) => { if (p.cat && categories.includes(p.cat)) counts.set(p.cat, (counts.get(p.cat) || 0) + 1); else uncat++; });
    const cnt = (v: string): number | undefined => !products ? undefined : v === '' ? products.length : v === '__none' ? uncat : (counts.get(v) || 0);
    const withN = (t: string, v: string) => { const n = cnt(v); return n === undefined ? t : `${t} (${n})`; };
    const label = withN(sel === '' ? 'الكل' : sel === '__none' ? 'غير مصنف' : sel, sel);
    const opts: { v: string; t: string }[] = [{ v: '', t: 'الكل' }, ...categories.map((c) => ({ v: c, t: c })), ...(extraNone ? [{ v: '__none', t: 'غير مصنف' }] : [])];
    return (
        <div className="cat-dd">
            <button className={'cat-dd-btn' + (sel === '' ? '' : ' on')} onClick={() => setOpen(!open)}>{label} {open ? '▴' : '▾'}</button>
            {open ? (
                <>
                    <div className="cat-dd-back" onClick={() => setOpen(false)} />
                    <div className="cat-dd-list">
                        {opts.map((o) => <button key={o.v} className={sel === o.v ? 'on' : ''} onClick={() => pick(o.v)}>{withN(o.t, o.v)}{sel === o.v ? ' ✓' : ''}</button>)}
                    </div>
                </>
            ) : null}
        </div>
    );
}
