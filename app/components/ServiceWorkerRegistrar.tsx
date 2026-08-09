'use client'
import { useEffect } from 'react';

export default function ServiceWorkerRegistrar() {
    // Production only: in dev the worker would cache Turbopack's ephemeral
    // assets and serve stale modules across restarts.
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') return;
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.register('/sw.js').catch((err) => {
            console.error('Service worker registration failed', err);
        });
    }, []);
    return null;
}
