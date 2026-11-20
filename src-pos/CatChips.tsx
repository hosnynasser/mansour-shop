import { useState } from 'react';

export default function CatChips({ categories, sel, setSel, extraNone }: { categories: string[]; sel: string; setSel: (c: string) => void; extraNone?: boolean }) {
    const [open, setOpen] = useState(false);
    if (!categories.length) return null;
    const pick = (c: string) => { setSel(c); setOpen(false); };
    const label = sel === '' ? 'الكل' : sel === '__none' ? 'غير مصنف' : sel;
    if (!open) {
        return (
            <div className="cat-chips">
                <button className={sel === '' ? '' : 'on'} onClick={() => setOpen(true)}>{label} ▾</button>
            </div>
        );
    }
    return (
        <div className="cat-chips">
            <button className={sel === '' ? 'on' : ''} onClick={() => pick('')}>الكل ▴</button>
            {categories.map((c) => <button key={c} className={sel === c ? 'on' : ''} onClick={() => pick(c)}>{c}</button>)}
            {extraNone ? <button className={sel === '__none' ? 'on' : ''} onClick={() => pick('__none')}>غير مصنف</button> : null}
        </div>
    );
}
