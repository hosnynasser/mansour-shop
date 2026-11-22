// سحب أي نافذة سفلية (.sheet) لتحت من الخط الصغير أو من الهيدر عشان تتقفل.
// السحب بيبدأ بس من أعلى النافذة (الخط + العنوان)، فالتمرير جوه المحتوى مش بيتأثر.
const ZONE = 64;          // px من أعلى النافذة
const DISMISS_DY = 110;   // مسافة تقفل
const DISMISS_V = 0.6;    // سرعة (px/ms) تقفل

function dirty(sheet: HTMLElement): boolean {
    const els = sheet.querySelectorAll('input, textarea');
    for (const e of Array.from(els) as (HTMLInputElement | HTMLTextAreaElement)[]) {
        if (e.type === 'checkbox' || e.type === 'radio' || e.type === 'button' || e.type === 'file') continue;
        if ((e.value || '').trim() !== '') return true;
    }
    return false;
}

let cur: { sheet: HTMLElement; y0: number; t0: number; dy: number; on: boolean } | null = null;

function reset(sheet: HTMLElement) {
    sheet.style.transition = 'transform .2s ease';
    sheet.style.transform = 'translateY(0)';
    const done = () => { sheet.style.transition = ''; sheet.style.transform = ''; sheet.style.animation = ''; };
    setTimeout(done, 230);
}

function dismiss(sheet: HTMLElement) {
    if (dirty(sheet) && !confirm('فيه بيانات مكتوبة لسه ما اتحفظتش. تقفل برضه؟')) { reset(sheet); return; }
    sheet.style.transition = 'transform .18s ease-in';
    sheet.style.transform = 'translateY(105%)';
    const back = (sheet.previousElementSibling as HTMLElement | null);
    const target = back && back.classList.contains('sheet-back') ? back : (document.querySelector('.sheet-back:last-of-type') as HTMLElement | null);
    setTimeout(() => {
        if (target) target.click();
        else (sheet.querySelector('.sheet-h button') as HTMLElement | null)?.click();
        // لو النافذة فضلت (مفيش قفل)، رجّعها
        setTimeout(() => { if (document.body.contains(sheet)) reset(sheet); }, 60);
    }, 170);
}

document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.target as HTMLElement | null;
    const sheet = t && t.closest ? (t.closest('.sheet') as HTMLElement | null) : null;
    if (!sheet) return;
    if (t!.closest('input, textarea, select, button, a')) return;
    const r = sheet.getBoundingClientRect();
    const y = e.touches[0].clientY;
    if (y - r.top > ZONE) return;
    cur = { sheet, y0: y, t0: performance.now(), dy: 0, on: false };
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (!cur) return;
    const dy = e.touches[0].clientY - cur.y0;
    if (!cur.on) {
        if (dy > 6) { cur.on = true; cur.sheet.style.animation = 'none'; cur.sheet.style.transition = 'none'; }
        else if (dy < -6) { cur = null; return; }
        else return;
    }
    cur.dy = Math.max(0, dy);
    cur.sheet.style.transform = `translateY(${cur.dy}px)`;
    if (e.cancelable) e.preventDefault();
}, { passive: false });

function end() {
    if (!cur) return;
    const c = cur; cur = null;
    if (!c.on) return;
    const v = c.dy / Math.max(1, performance.now() - c.t0);
    if (c.dy > DISMISS_DY || (c.dy > 40 && v > DISMISS_V)) dismiss(c.sheet); else reset(c.sheet);
}
document.addEventListener('touchend', end, { passive: true });
document.addEventListener('touchcancel', end, { passive: true });
