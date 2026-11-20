import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
const FileCard = ({ children }: { children: React.ReactNode }) => <>{children}</>;

import logo from './photos/logo-mansour.png';
import ledBulb from './photos/p-led-bulb.jpg';
import wallSwitch from './photos/p-switch.jpg';
import socket from './photos/p-socket.jpg';
import breaker from './photos/p-breaker.jpg';
import wire from './photos/p-wire.jpg';
import drill from './photos/p-drill.jpg';
import powerStrip from './photos/p-power-strip.jpg';
import emergencyLight from './photos/p-emergency-light.jpg';
import motionSensor from './photos/p-motion-sensor.jpg';
import basinMixerTap from './photos/p-basin-mixer.jpg';
import showerMixer from './photos/p-shower-mixer.jpg';
import rainShower from './photos/p-rain-shower.jpg';
import hose from './photos/p-hose.jpg';
import pvcPipe from './photos/p-pvc-pipe.jpg';
import pvcFittings from './photos/p-pvc-fittings.jpg';
import angleValve from './photos/p-angle-valve.jpg';
import siphon from './photos/p-siphon.jpg';
import teflon from './photos/p-teflon.jpg';

// ===== بيانات المحل (تتعدل من هنا) =====
const shop = {
    name: 'MANSOUR',
    nameAr: 'منصور',
    tagline: 'Electrical & Plumbing Supplies',
    legalName: 'مؤسسة محمد منصور للتأسيس والتشطيب والتوريد',
    address: 'حلوان، أطلس، مدخل مايو، أمام مسجد الروضة',
    phone: '01021924181',
    phoneIntl: '201021924181',
    phoneHref: 'tel:+201021924181',
    whatsappHref: 'https://wa.me/201021924181?text=' + encodeURIComponent('السلام عليكم، عايز استفسر عن منتج'),
    mapsHref: 'https://www.google.com/maps/search/?api=1&query=%D9%85%D8%B3%D8%AC%D8%AF+%D8%A7%D9%84%D8%B1%D9%88%D8%B6%D8%A9+%D9%85%D8%AF%D8%AE%D9%84+%D9%85%D8%A7%D9%8A%D9%88+%D8%A3%D8%B7%D9%84%D8%B3+%D8%AD%D9%84%D9%88%D8%A7%D9%86',
    mapsEmbed: 'https://www.google.com/maps?q=%D9%85%D8%B3%D8%AC%D8%AF+%D8%A7%D9%84%D8%B1%D9%88%D8%B6%D8%A9+%D9%85%D8%AF%D8%AE%D9%84+%D9%85%D8%A7%D9%8A%D9%88+%D8%A3%D8%B7%D9%84%D8%B3+%D8%AD%D9%84%D9%88%D8%A7%D9%86&output=embed',
    hours: 'يوميًا من 10 صباحًا حتى 11 مساءً',
};

// ===== المنتجات (أسماء وأسعار وصور وأكواد مؤقتة لحين تجهيز الأصلية) =====
type Cat = 'كهرباء' | 'أدوات صحية';
type Product = { name: string; desc: string; price: number; code: string; cat: Cat; img: any; alt: string; stock?: boolean; imgUrl?: string };

const products: Product[] = [
    { name: 'لمبة ليد 12 وات', desc: 'إضاءة بيضاء، قاعدة E27', price: 90, code: 'EL-101', cat: 'كهرباء', img: ledBulb, alt: 'لمبة ليد بيضاء' },
    { name: 'مفتاح ديكور فردي', desc: 'أبيض مطفي', price: 75, code: 'EL-102', cat: 'كهرباء', img: wallSwitch, alt: 'مفتاح كهرباء ديكور' },
    { name: 'بريزة ديكور ثلاثية', desc: 'أبيض مطفي', price: 85, code: 'EL-103', cat: 'كهرباء', img: socket, alt: 'بريزة كهرباء ثلاثية' },
    { name: 'قاطع أوتوماتيك 32 أمبير', desc: 'قطع أحادي', price: 240, code: 'EL-104', cat: 'كهرباء', img: breaker, alt: 'قاطع كهرباء أوتوماتيك' },
    { name: 'سلك نحاس 2.5 مم', desc: 'اللفة 100 متر', price: 4800, code: 'EL-105', cat: 'كهرباء', img: wire, alt: 'لفة سلك نحاس أحمر' },
    { name: 'مثقاب كهربائي 750 وات', desc: 'سرعات، ظبط وقفل', price: 2400, code: 'EL-106', cat: 'كهرباء', img: drill, alt: 'مثقاب كهربائي' },
    { name: 'مشترك كهرباء 5 مخارج', desc: 'بمفتاح وسلك 3 متر', price: 180, code: 'EL-107', cat: 'كهرباء', img: powerStrip, alt: 'مشترك كهرباء أبيض' },
    { name: 'كشاف طوارئ ليد', desc: 'برأسين، شحن', price: 350, code: 'EL-108', cat: 'كهرباء', img: emergencyLight, alt: 'كشاف طوارئ أبيض' },
    { name: 'حساس حركة سقف', desc: 'للإضاءة التلقائية', price: 220, code: 'EL-109', cat: 'كهرباء', img: motionSensor, alt: 'حساس حركة أبيض' },
    { name: 'خلاط مغسلة كروم', desc: 'ذراع واحدة', price: 1650, code: 'PL-201', cat: 'أدوات صحية', img: basinMixerTap, alt: 'خلاط مغسلة كروم' },
    { name: 'خلاط دش كامل', desc: 'كروم، بسماعة يد', price: 2400, code: 'PL-202', cat: 'أدوات صحية', img: showerMixer, alt: 'خلاط دش كروم' },
    { name: 'رأس دش مطري', desc: 'كروم، مقاس كبير', price: 950, code: 'PL-203', cat: 'أدوات صحية', img: rainShower, alt: 'رأس دش مطري' },
    { name: 'خرطوم مرن للخلاط', desc: 'ستانلس، 60 سم', price: 110, code: 'PL-204', cat: 'أدوات صحية', img: hose, alt: 'خرطوم مرن مضفر' },
    { name: 'ماسورة PVC 2 بوصة', desc: 'الطول 4 متر', price: 140, code: 'PL-205', cat: 'أدوات صحية', img: pvcPipe, alt: 'ماسورة PVC بيضاء' },
    { name: 'طقم وصلات PVC', desc: 'كوع + تيه + جلبة', price: 45, code: 'PL-206', cat: 'أدوات صحية', img: pvcFittings, alt: 'وصلات PVC بيضاء' },
    { name: 'محبس زاوية كروم', desc: 'نص بوصة', price: 95, code: 'PL-207', cat: 'أدوات صحية', img: angleValve, alt: 'محبس زاوية كروم' },
    { name: 'سيفون حوض بلاستيك', desc: 'كامل بالوصلة', price: 180, code: 'PL-208', cat: 'أدوات صحية', img: siphon, alt: 'سيفون حوض أبيض' },
    { name: 'شريط تفلون', desc: 'لعزل السنون', price: 15, code: 'PL-209', cat: 'أدوات صحية', img: teflon, alt: 'لفة شريط تفلون' },
];

const PAGE_SIZE = 8;

// ===== الباك إند (Cloudflare Worker) — يتحط رابطه بعد النشر =====
const API_BASE = '';

async function apiFetch(path: string, opts: RequestInit = {}, adminCode?: string): Promise<any> {
    const r = await fetch(API_BASE + path, {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...(adminCode ? { 'X-Admin-Code': adminCode } : {}), ...(opts.headers || {}) },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'request_failed'), { status: r.status });
    return j;
}

function fromApi(p: any): Product {
    const embedded = products.find((e) => e.code === p.code);
    return {
        name: p.name, desc: p.desc ?? '', price: p.price, code: p.code, cat: p.cat,
        img: p.imgUrl || embedded?.img || logo, alt: p.name,
        stock: p.stock !== false, imgUrl: p.imgUrl || undefined,
    };
}

const ShopCtx = createContext<{ catalog: Product[]; apiLive: boolean }>({ catalog: products, apiLive: false });
const useShop = () => useContext(ShopCtx);

// ===== آراء عملاء (نماذج مؤقتة) =====
const reviews = [
    { name: 'أحمد م.', text: 'أسعار كويسة والبضاعة أصلية، وبيرشحلك الأنسب لميزانيتك.' },
    { name: 'محمود س.', text: 'تعامل محترم وكل حاجة متوفرة، وفّر عليا لفة المحلات.' },
    { name: 'كريم ع.', text: 'طلبت توريد لشقة كاملة كهرباء وسباكة، وصل في المعاد بالظبط.' },
];

// بحث ذكي: يتجاهل الهمزات والتاء المربوطة والتشكيل
function normalize(s: string): string {
    return s.toLowerCase()
        .replace(/[ً-ْٰ]/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .trim();
}

function matches(p: Product, q: string): boolean {
    const catLabel = p.cat === 'كهرباء' ? 'كهربائيه كهربا كهرباء' : 'صحيه صحي سباكه سباكة';
    const hay = normalize(`${p.name} ${p.desc} ${p.code} ${catLabel}`);
    return normalize(q).split(/\s+/).every((word) => hay.includes(word));
}

const num = (n: number) => n.toLocaleString('ar-EG');

type PriceRange = 'all' | 'under100' | '100-500' | '500-1000' | 'over1000';
type SortMode = 'default' | 'low' | 'high' | 'name';

function inRange(p: Product, r: PriceRange): boolean {
    if (r === 'under100') return p.price < 100;
    if (r === '100-500') return p.price >= 100 && p.price <= 500;
    if (r === '500-1000') return p.price > 500 && p.price <= 1000;
    if (r === 'over1000') return p.price > 1000;
    return true;
}



// ===== السلة =====
type Cart = Record<string, number>;
const CartCtx = createContext<{ cart: Cart; add: (code: string, qty?: number) => void; setQty: (code: string, qty: number) => void; open: () => void }>({ cart: {}, add: () => {}, setQty: () => {}, open: () => {} });
const useCart = () => useContext(CartCtx);

// ===== الأيقونات =====
function IconSprite() {
    return <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
        <defs>
            <symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></symbol>
            <symbol id="i-drop" viewBox="0 0 24 24"><path d="M12 3c3.5 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.5-6.5 6-11z" /></symbol>
            <symbol id="i-phone" viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" /></symbol>
            <symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></symbol>
            <symbol id="i-chat" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" /></symbol>
            <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></symbol>
            <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></symbol>
            <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></symbol>
            <symbol id="i-home" viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /></symbol>
            <symbol id="i-grid" viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></symbol>
            <symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></symbol>
            <symbol id="i-cart" viewBox="0 0 24 24"><circle cx="9" cy="20" r="1.6" /><circle cx="18" cy="20" r="1.6" /><path d="M3 4h2.5l2.2 11h10.6l2.2-8H7" /></symbol>
            <symbol id="i-wa" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M12.04 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.25-1.38A9.9 9.9 0 1 0 12.04 2zm0 1.8a8.1 8.1 0 1 1-4.13 15.07l-.3-.18-3.1.82.83-3.02-.2-.31A8.1 8.1 0 0 1 12.04 3.8zm-3.1 3.9c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.43 1.03 2.6c.12.17 1.76 2.8 4.34 3.8 2.15.85 2.58.68 3.05.64.47-.05 1.5-.61 1.71-1.2.21-.6.21-1.1.15-1.2-.06-.11-.23-.17-.48-.3-.25-.12-1.5-.74-1.73-.82-.23-.09-.4-.12-.57.12-.17.25-.65.82-.8.99-.14.17-.29.19-.54.06-.25-.12-1.06-.39-2.01-1.24-.74-.66-1.24-1.48-1.39-1.73-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.57-1.38-.78-1.89-.2-.49-.41-.42-.57-.43h-.48z" /></symbol>
        </defs>
    </svg>;
}

function Ic({ id, className, style }: { id: string; className?: string; style?: React.CSSProperties }) {
    return <svg className={className ?? 'ic'} style={style} aria-hidden="true"><use href={`#${id}`} /></svg>;
}

// ===== الخلفية المتحركة (نفس فكرة ملف صاحب المحل) =====
const E_PATHS: Array<[string, number, number, number, number]> = [["M0 110H150L196 156H380", 4.6, .6, 380, 156], ["M0 290H90L140 340H300V420H430", 5.4, 1.8, 430, 420], ["M0 480H170L214 436H330", 4.2, 3, 330, 436], ["M0 40H70L110 80H210", 3.8, 2.4, 210, 80]];
const W_PATHS: Array<[string, number, number, number, number]> = [["M560 130H430V210H300", 5.6, .2, 300, 210], ["M560 300H480V372H340V452H250", 6.4, 1.4, 250, 452], ["M560 505H410V445H350", 5, 2.8, 350, 445], ["M560 50H500V100H400", 4.4, 3.6, 400, 100]];

function FxBg() {
    const bubbles = useMemo(() => [...Array(12)].map((_, i) => ({
        x: 46 + ((i * 37) % 50), s: 8 + ((i * 7) % 14),
        d: ((i * 0.9) % 8).toFixed(1), t: (7 + ((i * 5) % 6)).toFixed(1),
        dx: (i % 2 ? 1 : -1) * (10 + (i * 13) % 40),
    })), []);
    return <div className="fx" aria-hidden="true">
        <div className="fx-glow"></div><div className="fx-glow b"></div>
        <svg className="fx-elec" viewBox="0 0 560 600" preserveAspectRatio="xMinYMid slice" focusable="false">
            {E_PATHS.map((e, i) => <path key={'t' + i} className="trace" d={e[0]} />)}
            {E_PATHS.map((e, i) => <path key={'p' + i} className="pulse" pathLength={100} style={{ ['--t' as any]: e[1] + 's', ['--d' as any]: e[2] + 's', animation: 'flow ' + e[1] + 's linear ' + e[2] + 's infinite' }} d={e[0]} />)}
            {E_PATHS.map((e, i) => <circle key={'n' + i} className="node" style={{ animationDelay: i * .7 + 's' }} cx={e[3]} cy={e[4]} r="4" />)}
        </svg>
        <svg className="fx-water" viewBox="0 0 560 600" preserveAspectRatio="xMaxYMid slice" focusable="false">
            {W_PATHS.map((w, i) => <path key={'t' + i} className="pipe" d={w[0]} />)}
            {W_PATHS.map((w, i) => <path key={'f' + i} className="flow" pathLength={100} style={{ animation: 'flow ' + w[1] + 's linear ' + w[2] + 's infinite' }} d={w[0]} />)}
            {W_PATHS.map((w, i) => <circle key={'c' + i} className="cap" style={{ animationDelay: i * .8 + 's' }} cx={w[3]} cy={w[4]} r="7" />)}
        </svg>
        <span className="drift d1"><svg viewBox="0 0 24 24"><use href="#i-bolt" /></svg></span>
        <span className="drift d2"><svg viewBox="0 0 24 24"><use href="#i-drop" /></svg></span>
        <div className="bubbles">{bubbles.map((b, i) => <i key={i} style={{ ['--x' as any]: b.x + '%', ['--s' as any]: b.s + 'px', ['--d' as any]: b.d + 's', ['--t' as any]: b.t + 's', ['--dx' as any]: b.dx + 'px' }} />)}</div>
    </div>;
}

// ===== الصفحة الرئيسية =====
function Home() {
    return <>
        <section className="hero" id="home">
            <FxBg />
            <div className="hero-inner">
                <h1>كل احتياجاتك <em className="e">الكهربائية</em> و<em className="w">الصحية</em><br />في مكان واحد</h1>
                <p className="hero-copy">في منصور هتلاقي مستلزمات الكهرباء والأدوات الصحية بجودة تختارها بثقة، وخدمة تساعدك تلاقي المناسب لشغلك وبيتك.</p>
                <div className="hero-actions">
                    <Link className="btn btn-amber" to="/products">اكتشف المنتجات</Link>
                    <button type="button" className="btn btn-glass" onClick={() => scrollToContact()}>تواصل معانا</button>
                </div>
                <div className="hero-facts">
                    <div><Ic id="i-chat" />اسأل عن أي منتج على واتساب</div>
                    <div><Ic id="i-check" />نساعدك تختار المقاس والبديل المناسب</div>
                    <div><Ic id="i-pin" />حلوان، أطلس<br />أمام مسجد الروضة</div>
                </div>
            </div>
            <svg className="hero-wave" viewBox="0 0 1440 72" preserveAspectRatio="none" aria-hidden="true"><path d="M0 72V34C240 2 480 0 720 26s480 34 720 6V72z" fill="#fff" /></svg>
        </section>

        <section className="section about">
            <div>
                <h2>{shop.legalName}</h2>
                <p className="lead">نوفر مستلزمات الأدوات الكهربائية والأدوات الصحية، ونخدم أعمال التأسيس والتشطيب والتوريد باهتمام بالجودة واختيار المنتجات المناسبة لاحتياجاتك.</p>
            </div>
            <ul className="about-list">
                <li><span className="ico"><Ic id="i-grid" /></span><div><h3>اختيارات متنوعة</h3><p>تشكيلة من المنتجات الأساسية اللي بتحتاجها في أعمال الكهرباء والسباكة.</p></div></li>
                <li><span className="ico"><Ic id="i-shield" /></span><div><h3>اهتمام بالجودة</h3><p>نساعدك تختار المنتج المناسب حسب احتياجك وطبيعة الاستخدام.</p></div></li>
                <li><span className="ico"><Ic id="i-chat" /></span><div><h3>خدمة ومساعدة</h3><p>اسألنا عن المنتج أو المقاس أو البديل المناسب قبل ما تشتري.</p></div></li>
            </ul>
        </section>

        <section className="section cat-band">
            <div className="head-row"><h2>تسوق حسب احتياجك</h2><Link to="/products" className="text-link">كل المنتجات</Link></div>
            <div className="category-grid">
                <Link to="/products?cat=كهرباء" className="category-card el">
                    <span className="big"><Ic id="i-bolt" /></span>
                    <div><h3>الأدوات الكهربائية</h3><p>لمبات، مفاتيح، بريزات، أسلاك وكشافات</p></div>
                </Link>
                <Link to="/products?cat=أدوات صحية" className="category-card pl">
                    <span className="big"><Ic id="i-drop" /></span>
                    <div><h3>الأدوات الصحية</h3><p>خلاطات، محابس، شطافات وخراطيم</p></div>
                </Link>
            </div>
        </section>

        <section className="section reviews-sec">
            <div className="head-row"><h2>آراء عملائنا</h2></div>
            <div className="reviews-grid">
                {reviews.map((r) => <div className="review-card" key={r.name}>
                    <span className="review-stars" aria-label="خمس نجوم">★★★★★</span>
                    <p>“{r.text}”</p>
                    <b>{r.name}</b>
                    <small className="rev-role">عميل</small>
                </div>)}
            </div>
            <p className="rev-note">نماذج آراء مؤقتة لحين إضافة آراء العملاء الحقيقية.</p>
        </section>

        <section className="section steps-sec">
            <h2>ازاي تطلب؟</h2>
            <div className="steps">
                <div className="step"><div className="num">١</div><h3>دوّر في الكتالوج</h3><p>ابحث بالاسم أو الكود أو القسم.</p></div>
                <div className="step"><div className="num">٢</div><h3>اجمع في السلة</h3><p>ضيف المنتجات للسلة وابعت طلبك كله رسالة واتساب واحدة.</p></div>
                <div className="step"><div className="num">٣</div><h3>زورنا في المحل</h3><p>حلوان، أطلس، مدخل مايو، أمام مسجد الروضة.</p></div>
            </div>
        </section>

        <section className="contact" id="mn-contact">
            <div className="contact-card">
                <h2>زورنا أو تواصل معانا</h2>
                <p>{shop.address}</p>
                <p>{shop.hours}</p>
                <div className="contact-phone">{shop.phone}</div>
                <div className="contact-actions">
                    <a className="btn btn-light" href={shop.phoneHref}><Ic id="i-phone" />اتصل بالمحل</a>
                    <a className="btn btn-wa" href={shop.whatsappHref} target="_blank" rel="noreferrer"><Ic id="i-wa" />واتساب</a>
                    <a className="btn btn-line" href={shop.mapsHref} target="_blank" rel="noreferrer"><Ic id="i-pin" />افتح الخريطة</a>
                </div>
            </div>
            <div className="map-frame">
                <iframe title="موقع محل منصور على الخريطة" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={shop.mapsEmbed}></iframe>
            </div>
        </section>
    </>;
}

function scrollToContact() {
    const el = document.getElementById('mn-contact');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function scrollTopSoon() {
    setTimeout(() => document.querySelector('.app-main')?.scrollTo({ top: 0 }), 60);
}

// ===== كارت المنتج =====
function ProductCard({ p, onOpen }: { p: Product; onOpen: (p: Product) => void }) {
    const { add } = useCart();
    const [qty, setQtyLocal] = useState(1);
    return <article className="product-card">
        <button type="button" className="product-main" onClick={() => onOpen(p)} aria-label={'تفاصيل ' + p.name}>
            <div className={'product-art ' + (p.cat === 'كهرباء' ? 'cat-el' : 'cat-pl')}>
                <img src={p.img} alt={p.alt} loading="lazy" />
                <small className="product-category">{p.cat}</small>
                <small className="product-temp">صورة مؤقتة</small>
            </div>
            <div className="product-info"><h3>{p.name}</h3><p>{p.desc} · كود {p.code}</p></div>
        </button>
        <div className="product-bottom">
            <div className="pb-row">
                <span className="price">{num(p.price)} <small>جنيه</small></span>
                <span className="qty-step" aria-label="الكمية">
                    <button type="button" onClick={() => setQtyLocal((q) => Math.max(1, q - 1))} aria-label="قلل الكمية">−</button>
                    <b>{num(qty)}</b>
                    <button type="button" onClick={() => setQtyLocal((q) => q + 1)} aria-label="زود الكمية">+</button>
                </span>
            </div>
            <div className="pb-row">
                <button type="button" className="ask-btn" onClick={() => { add(p.code, qty); setQtyLocal(1); }} aria-label={'أضف ' + p.name + ' للسلة'}><Ic id="i-cart" />أضف للسلة</button>
            </div>
        </div>
    </article>;
}

// ===== صفحة تفاصيل المنتج =====
function ProductPage({ p, onClose }: { p: Product | null; onClose: () => void }) {
    const { add } = useCart();
    if (!p) return null;
    return <div className="sheet-page" role="dialog" aria-label={p.name}>
        <div className="sheet-topbar">
            <button type="button" className="sheet-back" onClick={onClose} aria-label="رجوع">→</button>
            <b>تفاصيل المنتج</b>
        </div>
        <div className={'pd-hero ' + (p.cat === 'كهرباء' ? 'cat-el' : 'cat-pl')}>
            <img src={p.img} alt={p.alt} />
        </div>
        <div className="pd-body">
            <span className="dlg-cat">{p.cat}</span>
            <h2>{p.name}</h2>
            <p>{p.desc}</p>
            <div className="pd-price-row">
                <span>كود المنتج: <b className="code">{p.code}</b></span>
                <span className="pd-price">{num(p.price)} <small>جنيه</small></span>
            </div>
            <div className="pd-actions">
                <button type="button" className="btn btn-primary" onClick={() => { add(p.code); onClose(); }}><Ic id="i-cart" />أضف للسلة</button>
            </div>
            <span className="pd-temp">الصورة والسعر استرشاديان لحين إضافة بيانات المحل الفعلية</span>
        </div>
    </div>;
}

// ===== صفحة المنتجات =====
function Products({ onOpen }: { onOpen: (p: Product) => void }) {
    const { catalog } = useShop();
    const catParam = (() => {
        const m = window.location.hash.match(/[?&]cat=([^&]*)/);
        const v = m ? decodeURIComponent(m[1]) : 'all';
        return v === 'كهرباء' || v === 'أدوات صحية' ? v : 'all';
    })();
    const [query, setQuery] = useState('');
    const [quick, setQuick] = useState<'all' | Cat>(catParam);
    const [range, setRange] = useState<PriceRange>('all');
    const [sort, setSort] = useState<SortMode>('default');
    const [page, setPage] = useState(1);

    const filtered = useMemo(() => {
        let list = catalog.filter((p) =>
            (query === '' || matches(p, query)) &&
            (quick === 'all' || p.cat === quick) &&
            inRange(p, range)
        );
        if (sort === 'low') list = [...list].sort((a, b) => a.price - b.price);
        if (sort === 'high') list = [...list].sort((a, b) => b.price - a.price);
        if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
        return list;
    }, [query, quick, range, sort]);

    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, pages);
    const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    const bump = (fn: () => void) => { fn(); setPage(1); };
    const reset = () => { setQuery(''); setQuick('all'); setRange('all'); setSort('default'); setPage(1); };

    return <>
        <div className="products-hero">
            <FxBg />
            <div className="ph-inner">
                <h1>دور على اللي <em>محتاجه</em></h1>
                <p>ابحث بالاسم أو النوع أو الكود، أو استخدم الفلاتر للوصول للمنتج بسهولة.</p>
                <label className="search-box">
                    <Ic id="i-search" />
                    <span className="sr-only">بحث في المنتجات</span>
                    <input type="search" value={query} placeholder="اكتب اسم المنتج أو القسم أو الكود..." autoComplete="off" enterKeyHint="search"
                        onChange={(e) => bump(() => setQuery(e.target.value))} />
                    {query !== '' && <button type="button" className="clear-btn" aria-label="مسح البحث" onClick={() => bump(() => setQuery(''))}><Ic id="i-close" style={{ fontSize: 14 }} /></button>}
                </label>
                <div className="quick-filters" role="group" aria-label="تصفية حسب القسم">
                    {(['all', 'كهرباء', 'أدوات صحية'] as const).map((c) =>
                        <button key={c} type="button" className={quick === c ? 'chip selected' : 'chip'} aria-pressed={quick === c} onClick={() => bump(() => setQuick(c))}>{c === 'all' ? 'الكل' : c}</button>)}
                </div>
            </div>
        </div>

        <section className="catalog">
            <div className="toolbar">
                <span id="resultsCount" aria-live="polite">{num(filtered.length)} منتج</span>
                <select value={range} aria-label="تصفية حسب السعر" onChange={(e) => bump(() => setRange(e.target.value as PriceRange))}>
                    <option value="all">كل الأسعار</option>
                    <option value="under100">أقل من 100 جنيه</option>
                    <option value="100-500">100 - 500 جنيه</option>
                    <option value="500-1000">500 - 1000 جنيه</option>
                    <option value="over1000">أكثر من 1000 جنيه</option>
                </select>
                <select value={sort} aria-label="ترتيب النتائج" onChange={(e) => bump(() => setSort(e.target.value as SortMode))}>
                    <option value="default">الترتيب: الأكثر صلة</option>
                    <option value="low">السعر: من الأقل للأعلى</option>
                    <option value="high">السعر: من الأعلى للأقل</option>
                    <option value="name">الاسم: أ - ي</option>
                </select>
            </div>
            {filtered.length === 0
                ? <div className="empty-state">
                    <Ic id="i-search" />
                    <h3>ملقيناش منتجات مطابقة</h3>
                    <p>جرّب تغيّر كلمة البحث أو تعدّل الفلاتر.</p>
                    <button type="button" className="btn btn-primary" onClick={reset}>إعادة ضبط البحث</button>
                </div>
                : <div className="product-grid">{visible.map((p) => <ProductCard key={p.code} p={p} onOpen={onOpen} />)}</div>}
            {pages > 1 && <nav className="pagination" aria-label="صفحات المنتجات">
                <button type="button" className="page-btn" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>السابق</button>
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) =>
                    <button key={n} type="button" className={n === safePage ? 'page-btn selected' : 'page-btn'} onClick={() => setPage(n)}>{n}</button>)}
                <button type="button" className="page-btn" disabled={safePage === pages} onClick={() => setPage(safePage + 1)}>التالي</button>
            </nav>}
        </section>
    </>;
}

// ===== صفحة السلة =====
type Cust = { name: string; phone: string; addr: string };

function CartPage({ onClose, cust, setCust }: { onClose: () => void; cust: Cust; setCust: (c: Cust) => void }) {
    const { cart, setQty } = useCart();
    const { catalog, apiLive } = useShop();
    const items = catalog.filter((p) => cart[p.code]).map((p) => ({ p, qty: cart[p.code] }));
    const total = items.reduce((s, it) => s + it.p.price * it.qty, 0);
    const ready = cust.name.trim() !== '' && cust.phone.trim() !== '' && cust.addr.trim() !== '' && items.length > 0;
    const [placing, setPlacing] = useState(false);
    const [done, setDone] = useState<{ id: string; total: number } | null>(null);
    const [orderErr, setOrderErr] = useState('');

    const placeOrder = async () => {
        setPlacing(true); setOrderErr('');
        try {
            const r = await apiFetch('/api/orders', { method: 'POST', body: JSON.stringify({
                name: cust.name.trim(), phone: cust.phone.trim(), address: cust.addr.trim(),
                items: items.map((it) => ({ code: it.p.code, qty: it.qty })),
            }) });
            setDone({ id: r.id, total: r.total });
            items.forEach((it) => setQty(it.p.code, 0));
        } catch (e: any) {
            setOrderErr(e?.message === 'out_of_stock'
                ? 'منتج في السلة غير متاح حاليا. عدّل السلة وجرب تاني.'
                : 'حصلت مشكلة في إرسال الطلب. جرب تاني كمان شوية، أو اتصل بالمحل مباشرة.');
        }
        setPlacing(false);
    };

    return <div className="sheet-page" role="dialog" aria-label="سلة الطلبات">
        <div className="sheet-topbar">
            <button type="button" className="sheet-back" onClick={onClose} aria-label="رجوع">→</button>
            <b>{done ? 'تم استلام طلبك' : 'سلة الطلبات'}</b>
        </div>
        <div className="cart-page-body">
            {done
                ? <div className="order-done">
                    <div className="order-done-check">✓</div>
                    <h3>طلبك وصل المحل</h3>
                    <p className="order-done-id">رقم الطلب: <b dir="ltr">{done.id}</b></p>
                    <p className="order-done-total">الإجمالي: <b>{num(done.total)} جنيه</b></p>
                    <p className="cart-note">المحل هيتواصل معاك على <b dir="ltr">{cust.phone.trim()}</b> لتأكيد الطلب والتوصيل.<br />لو عايز تعدل أو تلغي، اتصل على <a href={shop.phoneHref}>{shop.phone}</a> وقول رقم الطلب.</p>
                    <button type="button" className="btn btn-amber" onClick={onClose}>متابعة التسوق</button>
                </div>
            : items.length === 0
                ? <p className="cart-empty">السلة فاضية.<br />ضيف منتجات من صفحة المنتجات وارجع كمّل طلبك من هنا.</p>
                : <>
                    {items.map(({ p, qty }) => <div className="cart-line" key={p.code}>
                        <span className="cl-name">{p.name}<small>كود {p.code} · {num(p.price)} جنيه</small></span>
                        <span className="cart-qty">
                            <button type="button" onClick={() => setQty(p.code, qty - 1)} aria-label="قلل الكمية">−</button>
                            <b>{num(qty)}</b>
                            <button type="button" onClick={() => setQty(p.code, qty + 1)} aria-label="زود الكمية">+</button>
                        </span>
                        <span className="cl-price">{num(p.price * qty)} ج</span>
                    </div>)}
                    <div className="cart-total"><span>الإجمالي</span><span>{num(total)} جنيه</span></div>
                    <div className="cust-form">
                        <h4>بياناتك لإتمام الطلب</h4>
                        <label className="field">الاسم
                            <input type="text" value={cust.name} placeholder="اكتب اسمك" onChange={(e) => setCust({ ...cust, name: e.target.value })} />
                        </label>
                        <label className="field">رقم الموبايل
                            <input type="tel" inputMode="tel" dir="ltr" style={{ textAlign: 'right' }} value={cust.phone} placeholder="01xxxxxxxxx" onChange={(e) => setCust({ ...cust, phone: e.target.value })} />
                        </label>
                        <label className="field">العنوان بالتفصيل
                            <textarea value={cust.addr} placeholder="العنوان بالتفصيل عشان التوصيل، وتقدر تضيف أي ملاحظة للطلب" onChange={(e) => setCust({ ...cust, addr: e.target.value })} />
                        </label>
                    </div>
                    <button type="button" className="btn btn-wa btn-checkout" disabled={!ready || placing} onClick={placeOrder}>
                        <Ic id="i-check" />{placing ? 'جاري إرسال الطلب…' : 'إتمام عملية الشراء'}
                    </button>
                    {orderErr && <p className="cart-err">{orderErr}</p>}
                    <p className="cart-note">{ready ? 'الطلب بيسجل عند المحل مباشرة، وهيتواصلوا معاك على رقمك للتأكيد.' : 'اكتب الاسم ورقم الموبايل والعنوان علشان تقدر تتمم الطلب.'} الأسعار استرشادية وهيتأكد السعر النهائي والتوفر من المحل.</p>
                </>}
        </div>
    </div>;
}

// ===== لوحة تحكم المدير (صفحة مخفية على #/admin) =====
type ApiProduct = { name: string; desc?: string; price: number; code: string; cat: Cat; imgUrl?: string; stock?: boolean };
type ApiOrder = { id: string; ts: string; status: 'new' | 'done'; customer: { name: string; phone: string; address: string }; lines: { code: string; name: string; price: number; qty: number }[]; total: number };

const safeGetCode = () => { try { return sessionStorage.getItem('adminCode') || ''; } catch { return ''; } };
const safeSetCode = (v: string) => { try { sessionStorage.setItem('adminCode', v); } catch { /* sandboxed preview */ } };
const safeClearCode = () => { try { sessionStorage.removeItem('adminCode'); } catch { /* sandboxed preview */ } };

function AdminPage({ onClose }: { onClose: () => void }) {
    const [code, setCode] = useState(safeGetCode);
    const [authed, setAuthed] = useState(() => !!safeGetCode());
    const [tab, setTab] = useState<'orders' | 'products'>('orders');
    const [gateErr, setGateErr] = useState('');
    const [gateBusy, setGateBusy] = useState(false);
    const [orders, setOrders] = useState<ApiOrder[] | null>(null);
    const [prods, setProds] = useState<ApiProduct[] | null>(null);
    const [customProds, setCustomProds] = useState(false);
    const [msg, setMsg] = useState('');

    const loadOrders = async (c: string) => {
        const r = await apiFetch('/api/admin/orders', {}, c);
        setOrders(r.orders);
    };
    const loadProducts = async (c: string) => {
        const r = await apiFetch('/api/admin/products', {}, c);
        setCustomProds(r.custom);
        setProds(r.custom ? r.products : products.map((p) => ({ name: p.name, desc: p.desc, price: p.price, code: p.code, cat: p.cat, imgUrl: '', stock: true })));
    };

    useEffect(() => {
        if (!authed || !API_BASE) return;
        Promise.all([loadOrders(code), loadProducts(code)]).catch(() => {
            safeClearCode(); setAuthed(false); setGateErr('الكود غلط أو في مشكلة في الاتصال. جرب تاني.');
        });
    }, [authed]);

    const login = async () => {
        if (!code.trim() || gateBusy) return;
        setGateBusy(true); setGateErr('');
        try {
            await apiFetch('/api/admin/orders', {}, code.trim());
            safeSetCode(code.trim());
            setCode(code.trim()); setAuthed(true);
        } catch (e: any) {
            setGateErr(e?.status === 401 ? 'الكود غلط.' : 'في مشكلة في الاتصال. جرب تاني.');
        }
        setGateBusy(false);
    };

    const setStatus = async (id: string, status: 'new' | 'done') => {
        await apiFetch('/api/admin/orders/status', { method: 'POST', body: JSON.stringify({ id, status }) }, code);
        setOrders((os) => (os || []).map((o) => (o.id === id ? { ...o, status } : o)));
    };

    const saveProducts = async () => {
        if (!prods) return;
        setMsg('');
        try {
            await apiFetch('/api/admin/products', { method: 'PUT', body: JSON.stringify({ products: prods }) }, code);
            setCustomProds(true); setMsg('اتحفظت التعديلات وهتظهر على الموقع فورا.');
        } catch (e: any) {
            setMsg(e?.message === 'duplicate_code' ? 'في كود متكرر — كل منتج لازم يكون ليه كود مختلف.' : 'مشكلة في الحفظ: تأكد إن كل منتج ليه اسم وكود وسعر وقسم.');
        }
    };

    return <div className="sheet-page" role="dialog" aria-label="لوحة تحكم المحل">
        <div className="sheet-topbar">
            <button type="button" className="sheet-back" onClick={onClose} aria-label="رجوع">→</button>
            <b>لوحة تحكم المحل</b>
        </div>
        <div className="admin-body">
        {!API_BASE ? <div className="admin-wrap" dir="rtl">
        <p className="admin-note">اللوحة دي هتشتغل بعد نشر الباك إند (Cloudflare Worker) وربطه بالموقع. جاري تجهيزها.</p>
    </div>

    : !authed ? <div className="admin-wrap" dir="rtl">
        <label className="field">كود الدخول
            <input type="password" value={code} placeholder="اكتب الكود" onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} />
        </label>
        <button type="button" className="btn btn-amber" onClick={login} disabled={gateBusy}>{gateBusy ? 'جاري الدخول…' : 'دخول'}</button>
        {gateErr && <p className="cart-err">{gateErr}</p>}
    </div>

    : <div className="admin-wrap" dir="rtl">
        <div className="admin-tabs">
            <button type="button" className={tab === 'orders' ? 'atab sel' : 'atab'} onClick={() => setTab('orders')}>الطلبات</button>
            <button type="button" className={tab === 'products' ? 'atab sel' : 'atab'} onClick={() => setTab('products')}>المنتجات</button>
        </div>

        {tab === 'orders' && <>
            <div className="admin-row">
                <button type="button" className="btn btn-ghost" onClick={() => loadOrders(code)}>تحديث</button>
                <button type="button" className="btn btn-ghost" onClick={() => { safeClearCode(); setAuthed(false); }}>خروج</button>
            </div>
            {orders === null && <p className="admin-note">جاري تحميل الطلبات…</p>}
            {orders !== null && orders.length === 0 && <p className="admin-note">لا توجد طلبات حتى الآن.</p>}
            {(orders || []).map((o) => <div className="order-card" key={o.id}>
                <div className="oc-head">
                    <b dir="ltr">{o.id}</b>
                    <small>{new Date(o.ts).toLocaleString('ar-EG')}</small>
                    <span className={o.status === 'done' ? 'st-badge done' : 'st-badge'}>{o.status === 'done' ? 'اتجهّز' : 'جديد'}</span>
                </div>
                <div className="oc-cust">{o.customer.name} · <a href={`tel:${o.customer.phone}`} dir="ltr">{o.customer.phone}</a><br /><small>{o.customer.address}</small></div>
                <ul className="oc-lines">{o.lines.map((l, i) => <li key={i}>{l.name} (كود {l.code}) × {num(l.qty)} = {num(l.price * l.qty)} ج</li>)}</ul>
                <div className="oc-foot">
                    <b>الإجمالي: {num(o.total)} جنيه</b>
                    <button type="button" className="btn btn-ghost" onClick={() => setStatus(o.id, o.status === 'done' ? 'new' : 'done')}>
                        {o.status === 'done' ? 'إرجاع كجديد' : 'تم التجهيز ✓'}
                    </button>
                </div>
            </div>)}
        </>}

        {tab === 'products' && <>
            {!customProds && <p className="admin-note">الموقع شغال دلوقتي بالقايمة المبدئية. أول حفظ هنا هينقلها للباك إند ويبقى التعديل من هنا مباشر.</p>}
            {prods === null && <p className="admin-note">جاري تحميل المنتجات…</p>}
            {(prods || []).map((p, i) => <div className="prod-edit" key={i}>
                <div className="pe-grid">
                    <label className="field">الاسم<input value={p.name} onChange={(e) => setProds(prods!.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></label>
                    <label className="field">الكود<input dir="ltr" value={p.code} onChange={(e) => setProds(prods!.map((x, j) => j === i ? { ...x, code: e.target.value.toUpperCase() } : x))} /></label>
                    <label className="field">السعر (جنيه)<input type="number" min="0" step="0.5" dir="ltr" value={p.price} onChange={(e) => setProds(prods!.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))} /></label>
                    <label className="field">القسم<select value={p.cat} onChange={(e) => setProds(prods!.map((x, j) => j === i ? { ...x, cat: e.target.value as Cat } : x))}><option>كهرباء</option><option>أدوات صحية</option></select></label>
                    <label className="field pe-wide">الوصف<input value={p.desc || ''} onChange={(e) => setProds(prods!.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))} /></label>
                    <label className="field pe-wide">رابط صورة (اختياري)<input dir="ltr" placeholder="https://…" value={p.imgUrl || ''} onChange={(e) => setProds(prods!.map((x, j) => j === i ? { ...x, imgUrl: e.target.value } : x))} /></label>
                    <label className="pe-stock"><input type="checkbox" checked={p.stock !== false} onChange={(e) => setProds(prods!.map((x, j) => j === i ? { ...x, stock: e.target.checked } : x))} /> متوفر</label>
                </div>
                <button type="button" className="pe-del" onClick={() => setProds(prods!.filter((_, j) => j !== i))}>حذف المنتج</button>
            </div>)}
            <div className="admin-row">
                <button type="button" className="btn btn-ghost" onClick={() => setProds([...(prods || []), { name: '', code: '', price: 0, cat: 'كهرباء', desc: '', imgUrl: '', stock: true }])}>+ إضافة منتج</button>
                <button type="button" className="btn btn-amber" onClick={saveProducts}>حفظ التعديلات</button>
            </div>
            {msg && <p className="admin-msg">{msg}</p>}
        </>}
    </div>}
        </div>
    </div>;
}

// ===== الهيكل العام =====
export function App() {
    const [cart, setCart] = useState<Cart>({});
    const [cartOpen, setCartOpen] = useState(false);
    const [dlgProduct, setDlgProduct] = useState<Product | null>(null);
    const [cust, setCust] = useState<Cust>({ name: '', phone: '', addr: '' });
    const [toast, setToast] = useState('');
    const [adminOpen, setAdminOpen] = useState(false);
    const [catalog, setCatalog] = useState<Product[]>(products);
    const [apiLive, setApiLive] = useState(false);

    useEffect(() => {
        if (!API_BASE) return;
        apiFetch('/api/products')
            .then((r) => { if (Array.isArray(r.products) && r.products.length) { setCatalog(r.products.map(fromApi)); setApiLive(true); } })
            .catch(() => {});
    }, []);

    const showToast = (msg: string) => {
        setToast(msg);
        window.clearTimeout((showToast as any).t);
        (showToast as any).t = window.setTimeout(() => setToast(''), 2400);
    };
    const add = (code: string, qty: number = 1) => {
        setCart((c) => ({ ...c, [code]: (c[code] ?? 0) + qty }));
        showToast('اتضاف للسلة');
    };
    const setQty = (code: string, qty: number) => {
        setCart((c) => {
            const next = { ...c };
            if (qty <= 0) delete next[code]; else next[code] = qty;
            return next;
        });
    };
    const cartCount = Object.values(cart).reduce((s, n) => s + n, 0);

    return <FileCard>
        <ShopCtx.Provider value={{ catalog, apiLive }}>
        <CartCtx.Provider value={{ cart, add, setQty, open: () => setCartOpen(true) }}>
            <div dir="rtl" className="app-shell">
                <IconSprite />
                <header className="site-header">
                    <NavLink className="brand" to="/" end aria-label="MANSOUR - الصفحة الرئيسية">
                        <img src={logo} alt="لوجو منصور" />
                        <span><b>MANSOUR</b><small>{shop.tagline}</small></span>
                    </NavLink>
                    <nav id="mainNav" aria-label="التنقل الرئيسي">
                        <NavLink to="/" end className="nav-link" onClick={scrollTopSoon}>الرئيسية</NavLink>
                        <NavLink to="/products" className="nav-link" onClick={scrollTopSoon}>المنتجات</NavLink>
                        <NavLink to="/" className="nav-link" onClick={() => setTimeout(scrollToContact, 60)}>تواصل معنا</NavLink>
                        <button type="button" className="header-cart" onClick={() => setCartOpen(true)}>
                            <Ic id="i-cart" />السلة
                            {cartCount > 0 && <span className="cart-count">{num(cartCount)}</span>}
                        </button>
                        <a href={shop.phoneHref} className="header-cta"><Ic id="i-phone" />اتصل بالمحل</a>
                    </nav>
                    <a href={shop.phoneHref} className="header-call" aria-label="اتصل بالمحل"><Ic id="i-phone" /></a>
                </header>
                <main className="app-main">
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/products" element={<Products onOpen={setDlgProduct} />} />
                    </Routes>
                    <footer className="footer">
                        <div className="footer-brand"><img src={logo} alt="" /><span>MANSOUR</span></div>
                        <p>{shop.legalName}</p>
                        <a className="footer-phone" href={shop.phoneHref}>{shop.phone}</a>
                        <small>© 2026 MANSOUR. جميع الحقوق محفوظة.</small>
                        <small>نسخة للمراجعة: الصور والأسعار والأكواد استرشادية.</small>
                        <button type="button" className="footer-admin" onClick={() => setAdminOpen(true)}>لوحة التحكم</button>
                    </footer>
                </main>

                <a className="wa-float" href={shop.whatsappHref} target="_blank" rel="noreferrer" aria-label="تواصل معنا على واتساب"><Ic id="i-wa" style={{ fontSize: 30 }} /></a>

                <nav className="bottom-nav" aria-label="التنقل السريع">
                    <NavLink to="/" end className="bn" onClick={scrollTopSoon}><Ic id="i-home" />الرئيسية</NavLink>
                    <NavLink to="/products" className="bn" onClick={scrollTopSoon}><Ic id="i-grid" />المنتجات</NavLink>
                    <button type="button" className="bn bn-cart" onClick={() => setCartOpen(true)}>
                        <Ic id="i-cart" />السلة
                        {cartCount > 0 && <span className="cart-count">{num(cartCount)}</span>}
                    </button>
                </nav>

                {dlgProduct && <ProductPage p={dlgProduct} onClose={() => setDlgProduct(null)} />}
                {cartOpen && <CartPage onClose={() => setCartOpen(false)} cust={cust} setCust={setCust} />}
                {adminOpen && <AdminPage onClose={() => setAdminOpen(false)} />}
                <div className={toast ? 'toast show' : 'toast'} role="status" aria-live="polite">{toast}</div>
            </div>
        </CartCtx.Provider>
        </ShopCtx.Provider>
    </FileCard>;
}
