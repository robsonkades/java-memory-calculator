'use client'
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LOCALE_ORDER, setLocale, useLocale, useT, type Locale } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/en';

interface NavLink { href: string; labelKey: TranslationKey }

// Grouped site map — rendered in the drawer; the top bar keeps only the primary pair.
const GROUPS: Array<{ titleKey: TranslationKey; links: NavLink[] }> = [
    {
        titleKey: 'nav.groupSizing',
        links: [
            { href: '/', labelKey: 'nav.calculator' },
            { href: '/start', labelKey: 'nav.start' },
            { href: '/fleet', labelKey: 'nav.fleet' },
            { href: '/import', labelKey: 'nav.import' },
            { href: '/collect', labelKey: 'nav.collect' },
        ],
    },
    {
        titleKey: 'nav.groupAnalyze',
        links: [
            { href: '/diagnose', labelKey: 'nav.diagnose' },
            { href: '/flags', labelKey: 'nav.flags' },
            { href: '/nmt', labelKey: 'nav.nmt' },
            { href: '/gclog', labelKey: 'nav.gclog' },
            { href: '/threads', labelKey: 'nav.threads' },
            { href: '/histogram', labelKey: 'nav.histogram' },
            { href: '/smaps', labelKey: 'nav.smaps' },
            { href: '/jfr', labelKey: 'nav.jfr' },
        ],
    },
    {
        titleKey: 'nav.groupReference',
        links: [
            { href: '/guides', labelKey: 'nav.guides' },
            { href: '/runbook', labelKey: 'nav.runbook' },
            { href: '/glossary', labelKey: 'nav.glossary' },
            { href: '/api-docs', labelKey: 'nav.api' },
        ],
    },
];

const PRIMARY_LINKS: NavLink[] = [
    { href: '/', labelKey: 'nav.calculator' },
    { href: '/guides', labelKey: 'nav.guides' },
];

const LOCALE_NAME: Record<Locale, string> = { en: 'English', 'pt-BR': 'Português (BR)', es: 'Español' };

type Theme = 'system' | 'light' | 'dark';
const THEME_EVENT = 'jvme-theme';
const THEMES: Theme[] = ['system', 'light', 'dark'];
const THEME_LABEL_KEY: Record<Theme, TranslationKey> = {
    system: 'theme.system',
    light: 'theme.light',
    dark: 'theme.dark',
};

function subscribeTheme(callback: () => void) {
    window.addEventListener(THEME_EVENT, callback);
    return () => window.removeEventListener(THEME_EVENT, callback);
}

function readTheme(): Theme {
    try {
        const stored = localStorage.getItem('theme');
        return stored === 'light' || stored === 'dark' ? stored : 'system';
    } catch {
        return 'system';
    }
}

function applyTheme(next: Theme) {
    try {
        if (next === 'system') localStorage.removeItem('theme');
        else localStorage.setItem('theme', next);
    } catch (err) {
        console.error('Failed to persist theme choice', err);
    }
    if (next === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', next);
    window.dispatchEvent(new Event(THEME_EVENT));
}

const selectClass = 'h-8 rounded-md border bg-background px-2 text-xs text-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 transition-colors';

function ThemeSelect({ id }: Readonly<{ id: string }>) {
    // External store instead of state-in-effect: the stored choice is the
    // source of truth; hydration starts from the server snapshot ('system').
    const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'system' as Theme);
    const t = useT();
    return (
        <select
            id={id}
            aria-label={t('theme.label')}
            value={theme}
            onChange={(e) => applyTheme(e.target.value as Theme)}
            className={selectClass}
        >
            {THEMES.map((value) => (
                <option key={value} value={value}>{t(THEME_LABEL_KEY[value])}</option>
            ))}
        </select>
    );
}

function LocaleSelect({ id }: Readonly<{ id: string }>) {
    const locale = useLocale();
    const t = useT();
    return (
        <select
            id={id}
            aria-label={t('nav.language')}
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className={selectClass}
        >
            {LOCALE_ORDER.map((value) => (
                <option key={value} value={value}>{LOCALE_NAME[value]}</option>
            ))}
        </select>
    );
}

const FOCUSABLE = 'a[href], button:not([disabled]), select, input, [tabindex]:not([tabindex="-1"])';

export default function SiteNav() {
    const pathname = usePathname();
    const t = useT();
    const [open, setOpen] = useState(false);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    const isActive = (href: string) =>
        href === '/' ? pathname === '/' : pathname.startsWith(href);

    const close = () => {
        setOpen(false);
        menuButtonRef.current?.focus();
    };

    useEffect(() => {
        if (!open) return;
        closeButtonRef.current?.focus();
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, [open]);

    const onPanelKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
            return;
        }
        if (e.key !== 'Tab' || !panelRef.current) return;
        const focusables = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    return (
        <>
        {/* The drawer must NOT live inside this header: backdrop-blur makes it
            a containing block for fixed descendants, trapping inset-0 in 56px. */}
        <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
            <a
                href="#main"
                className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-background focus:border focus:rounded-md focus:px-3 focus:py-2 focus:text-sm"
            >
                {t('nav.skip')}
            </a>
            <nav aria-label={t('nav.menu')} className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-5">
                <Link href="/" className="font-semibold tracking-tight shrink-0">JVM Expert</Link>
                <div className="hidden md:flex items-center gap-4 text-sm">
                    {PRIMARY_LINKS.map(({ href, labelKey }) => (
                        <Link
                            key={href}
                            href={href}
                            aria-current={isActive(href) ? 'page' : undefined}
                            className={isActive(href)
                                ? 'text-foreground font-medium'
                                : 'text-secondary hover:text-foreground transition-colors'}
                        >
                            {t(labelKey)}
                        </Link>
                    ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <div className="hidden sm:flex items-center gap-2">
                        <LocaleSelect id="locale-topbar" />
                        <ThemeSelect id="theme-topbar" />
                    </div>
                    <button
                        ref={menuButtonRef}
                        onClick={() => setOpen(true)}
                        aria-expanded={open}
                        aria-controls="site-drawer"
                        aria-haspopup="dialog"
                        className="inline-flex items-center gap-1.5 h-8 border rounded-md px-2.5 text-xs text-secondary hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-accent/40"
                    >
                        <span aria-hidden="true">☰</span>
                        {t('nav.menu')}
                    </button>
                </div>
            </nav>
        </header>

        {open && (
                <div className="fixed inset-0 z-30">
                    <div
                        aria-hidden="true"
                        onClick={close}
                        className="absolute inset-0 bg-foreground/20"
                    />
                    <div
                        id="site-drawer"
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="site-drawer-title"
                        onKeyDown={onPanelKeyDown}
                        className="absolute right-0 top-0 h-full w-80 max-w-[85vw] overflow-y-auto bg-background border-l p-5"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 id="site-drawer-title" className="text-sm font-semibold tracking-tight">
                                {t('nav.menu')}
                            </h2>
                            <button
                                ref={closeButtonRef}
                                onClick={close}
                                aria-label={t('nav.menuClose')}
                                className="inline-flex items-center justify-center h-8 w-8 border rounded-md text-secondary hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-accent/40"
                            >
                                <span aria-hidden="true">✕</span>
                            </button>
                        </div>

                        {GROUPS.map(({ titleKey, links }) => (
                            <div key={titleKey} className="mb-5">
                                <h3 className="text-xs uppercase tracking-wide text-secondary mb-1.5">{t(titleKey)}</h3>
                                <ul>
                                    {links.map(({ href, labelKey }) => (
                                        <li key={href}>
                                            <Link
                                                href={href}
                                                onClick={close}
                                                aria-current={isActive(href) ? 'page' : undefined}
                                                className={`block rounded-md px-2 py-1.5 text-sm ${isActive(href)
                                                    ? 'bg-surface text-foreground font-medium'
                                                    : 'text-secondary hover:text-foreground hover:bg-surface transition-colors'}`}
                                            >
                                                {t(labelKey)}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}

                        <div className="border-t pt-4 grid gap-3">
                            <div className="grid gap-1">
                                <label htmlFor="locale-drawer" className="text-xs uppercase tracking-wide text-secondary">
                                    {t('nav.language')}
                                </label>
                                <LocaleSelect id="locale-drawer" />
                            </div>
                            <div className="grid gap-1">
                                <label htmlFor="theme-drawer" className="text-xs uppercase tracking-wide text-secondary">
                                    {t('theme.label')}
                                </label>
                                <ThemeSelect id="theme-drawer" />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
