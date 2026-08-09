'use client'
import { useSyncExternalStore } from 'react';
import { en, type TranslationKey, type Dictionary } from './en';
import { ptBR } from './pt-BR';
import { es } from './es';

export type Locale = 'en' | 'pt-BR' | 'es';

const LOCALE_EVENT = 'jvme-locale';
const DICTIONARIES: Record<Locale, Dictionary> = { en, 'pt-BR': ptBR, es };

export const LOCALE_ORDER: Locale[] = ['en', 'pt-BR', 'es'];
export const LOCALE_LABEL: Record<Locale, string> = { en: 'EN', 'pt-BR': 'PT', es: 'ES' };

function subscribe(callback: () => void) {
    window.addEventListener(LOCALE_EVENT, callback);
    return () => window.removeEventListener(LOCALE_EVENT, callback);
}

export function readLocale(): Locale {
    try {
        const stored = localStorage.getItem('locale');
        return stored === 'pt-BR' || stored === 'es' ? stored : 'en';
    } catch {
        return 'en';
    }
}

export function setLocale(next: Locale) {
    try {
        if (next === 'en') localStorage.removeItem('locale');
        else localStorage.setItem('locale', next);
    } catch (err) {
        console.error('Failed to persist locale choice', err);
    }
    window.dispatchEvent(new Event(LOCALE_EVENT));
}

/** Current locale as an external store: SSR/hydration snapshot is 'en'. */
export function useLocale(): Locale {
    return useSyncExternalStore(subscribe, readLocale, () => 'en' as Locale);
}

/** Interpolates {name} placeholders; missing vars are left visible. */
export function interpolate(raw: string, vars?: Record<string, string | number>): string {
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in vars ? String(vars[name]) : whole);
}

export function useT() {
    const locale = useLocale();
    return (key: TranslationKey, vars?: Record<string, string | number>): string =>
        interpolate(DICTIONARIES[locale][key] ?? en[key] ?? key, vars);
}
