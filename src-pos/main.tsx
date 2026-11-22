import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './pos.css';
import './sheetDrag';

// تسجيل الـ service worker للـ PWA (محصور على /pos/)
if ('serviceWorker' in navigator) {
    try {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    } catch {}
}

createRoot(document.getElementById('root')!).render(<App />);
