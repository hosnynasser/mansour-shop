// سحب أي نافذة سفلية (.sheet) لتحت من الخط الصغير أو من الهيدر عشان تتقفل.
// السحب بيبدأ بس من أعلى النافذة (الخط + العنوان)، فالتمرير جوه المحتوى مش بيتأثر.
const ZONE = 64;          // px من أعلى النافذة
const DISMISS_DY = 110;   // مسافة تقفل
const DISMISS_V = 0.6;    // سرعة (px/ms) تقفل

// بنحفظ القيمة وقت ما الخانة تظهر في النافذة، والنافذة بتعتبر "فيها تعديل" بس لو قيمة خانة اتغيرت عنها.
// نوافذ ليها حالة تعديل خاصة بتحط عنصر مخفي data-dirty="1" أو "0" وده اللي بيتحكم لوحده.
const base = new WeakMap<Element, string>();
function snap(root: ParentNode) {
    root.querySelectorAll('input, textarea').forEach((e) => { if (!base.has(e)) base.set(e, (e as HTMLInputElement).value); });
}
new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        const el = n as Element;
        if (el.matches('input, textarea')) { if (el.closest('.sheet') && !base.has(el)) base.set(el, (el as HTMLInputElement).value); }
        else if (el.closest('.sheet') || el.matches('.sheet') || el.querySelector('.sheet')) snap(el);
    });
}).observe(document.documentElement, { childList: true, subtree: true });

function dirty(sheet: HTMLElement): boolean {
    const marker = sheet.querySelector('[data-dirty]');
    if (marker) return marker.getAttribute('data-dirty') === '1';
    const els = sheet.querySelectorAll('input, textarea');
    for (const e of Array.from(els) as (HTMLInputElement | HTMLTextAreaElement)[]) {
        if (e.type === 'checkbox' || e.type === 'radio' || e.type === 'button' || e.type === 'file' || e.type === 'search') continue;
        if (e.closest('.search-box')) continue;
        if (e.value !== (base.has(e) ? base.get(e) : '')) return true;
    }
    return false;
}

function firstDirty(sheet: HTMLElement): HTMLElement | null {
    const m = sheet.querySelector('[data-dirty="1"]');
    if (m) return (sheet.querySelector('.btn-blue') as HTMLElement | null);
    for (const e of Array.from(sheet.querySelectorAll('input, textarea')) as HTMLInputElement[]) {
        if (e.type === 'checkbox' || e.type === 'radio' || e.type === 'button' || e.type === 'file' || e.type === 'search' || e.closest('.search-box')) continue;
        if (e.value !== (base.has(e) ? base.get(e) : '')) return e;
    }
    return null;
}

function warn(sheet: HTMLElement) {
    if (sheet.querySelector('.sheet-warn')) return;
    const bar = document.createElement('div');
    bar.className = 'sheet-warn';
    const t = document.createElement('div');
    t.textContent = 'فيه تعديل لسه ما اتحفظش. احفظه بزر «حفظ» الموجود جنبه، أو تجاهله.';
    const row = document.createElement('div');
    row.className = 'sw-row';
    const keep = document.createElement('button');
    keep.type = 'button'; keep.className = 'btn btn-blue btn-sm'; keep.textContent = 'كمّل التعديل';
    keep.onclick = () => { bar.remove(); const f = firstDirty(sheet); if (f) { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (f.tagName === 'INPUT' || f.tagName === 'TEXTAREA') f.focus(); } };
    const drop = document.createElement('button');
    drop.type = 'button'; drop.className = 'btn btn-ghost btn-sm'; drop.textContent = 'تجاهل التعديل';
    drop.onclick = () => { bar.remove(); close(sheet); };
    row.append(keep, drop);
    bar.append(t, row);
    sheet.append(bar);
}

let cur: { sheet: HTMLElement; y0: number; t0: number; dy: number; on: boolean } | null = null;

function reset(sheet: HTMLElement) {
    sheet.style.transition = 'transform .2s ease';
    sheet.style.transform = 'translateY(0)';
    const done = () => { sheet.style.transition = ''; sheet.style.transform = ''; sheet.style.animation = ''; };
    setTimeout(done, 230);
}

function dismiss(sheet: HTMLElement) {
    if (dirty(sheet)) { reset(sheet); warn(sheet); return; }
    close(sheet);
}

let force = false;
// كل طرق القفل (زر قفل، الخلفية، رجوع الموبايل) بتعدّي على نفس الحماية: لو فيه تعديل ما اتحفظش بيظهر الشريط بدل ما القيم تضيع
document.addEventListener('click', (e) => {
    if (force) return;
    const t = e.target as HTMLElement | null;
    if (!t || !t.closest) return;
    let sheet: HTMLElement | null = null;
    const bd = t.closest('.sheet-back') as HTMLElement | null;
    if (bd) { const n = bd.nextElementSibling as HTMLElement | null; if (n && n.classList.contains('sheet')) sheet = n; }
    else {
        const b = t.closest('.sheet-h button') as HTMLElement | null;
        if (b && /^(قفل|إغلاق|اغلاق)$/.test((b.textContent || '').trim())) sheet = b.closest('.sheet') as HTMLElement | null;
    }
    if (sheet && dirty(sheet)) { e.stopImmediatePropagation(); e.preventDefault(); warn(sheet); }
}, true);

function close(sheet: HTMLElement) {
    sheet.style.transition = 'transform .18s ease-in';
    sheet.style.transform = 'translateY(105%)';
    const back = (sheet.previousElementSibling as HTMLElement | null);
    const target = back && back.classList.contains('sheet-back') ? back : (document.querySelector('.sheet-back:last-of-type') as HTMLElement | null);
    setTimeout(() => {
        force = true;
        try {
            if (target) target.click();
            else (sheet.querySelector('.sheet-h button') as HTMLElement | null)?.click();
        } finally { force = false; }
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
