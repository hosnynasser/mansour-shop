import { useEffect, useState } from 'react';

export default function CatChips({ categories, sel, setSel, extraNone }: { categories: string[]; sel: string; setSel: (c: string) => void; extraNone?: boolean }) {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!open) return;
        document.documentElement.classList.add('dd-lock');
        return () => document.documentElement.classList.remove('dd-lock');
    }, [open]);
    if (!categories.length) return null;
    const pick = (c: string) => { setSel(c); setOpen(false); };
    const label = sel === '' ? 'الكل' : sel === '__none' ? 'غير مصنف' : sel;
    const opts: { v: string; t: string }[] = [{ v: '', t: 'الكل' }, ...categories.map((c) => ({ v: c, t: c })), ...(extraNone ? [{ v: '__none', t: 'غير مصنف' }] : [])];
    return (
        <div className="cat-dd">
            <button className={'cat-dd-btn' + (sel === '' ? '' : ' on')} onClick={() => setOpen(!open)}>{label} {open ? '▴' : '▾'}</button>
            {open ? (
                <>
                    <div className="cat-dd-back" onClick={() => setOpen(false)} />
                    <div className="cat-dd-list">
                        {opts.map((o) => <button key={o.v} className={sel === o.v ? 'on' : ''} onClick={() => pick(o.v)}>{o.t}{sel === o.v ? ' ✓' : ''}</button>)}
                    </div>
                </>
            ) : null}
        </div>
    );
}
