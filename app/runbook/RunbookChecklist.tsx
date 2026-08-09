'use client'
import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/en';

const STORAGE_KEY = 'jvm-expert-runbook-oomkilled';
const STORE_EVENT = 'jvme-runbook';

interface Step {
    id: string;
    titleKey: TranslationKey;
    bodyKey: TranslationKey;
    links: Array<{ href: string; labelKey: TranslationKey }>;
}

const STEPS: Step[] = [
    {
        id: 'triage',
        titleKey: 'runbook.s1Title',
        bodyKey: 'runbook.s1Body',
        links: [{ href: '/guides/oomkilled-troubleshooting', labelKey: 'runbook.linkGuide' }],
    },
    {
        id: 'limit-vs-footprint',
        titleKey: 'runbook.s2Title',
        bodyKey: 'runbook.s2Body',
        links: [
            { href: '/import', labelKey: 'runbook.linkImport' },
            { href: '/', labelKey: 'runbook.linkCalc' },
        ],
    },
    {
        id: 'direct-memory',
        titleKey: 'runbook.s3Title',
        bodyKey: 'runbook.s3Body',
        links: [{ href: '/flags', labelKey: 'runbook.linkFlags' }],
    },
    {
        id: 'threads',
        titleKey: 'runbook.s4Title',
        bodyKey: 'runbook.s4Body',
        links: [{ href: '/threads', labelKey: 'runbook.linkThreads' }],
    },
    {
        id: 'measure',
        titleKey: 'runbook.s5Title',
        bodyKey: 'runbook.s5Body',
        links: [
            { href: '/collect', labelKey: 'runbook.linkCollect' },
            { href: '/diagnose', labelKey: 'runbook.linkDiagnose' },
        ],
    },
    {
        id: 'fix',
        titleKey: 'runbook.s6Title',
        bodyKey: 'runbook.s6Body',
        links: [
            { href: '/smaps', labelKey: 'runbook.linkSmaps' },
            { href: '/guides/glibc-malloc-arenas', labelKey: 'runbook.linkArenas' },
        ],
    },
];

function subscribe(callback: () => void) {
    window.addEventListener(STORE_EVENT, callback);
    window.addEventListener('storage', callback);
    return () => {
        window.removeEventListener(STORE_EVENT, callback);
        window.removeEventListener('storage', callback);
    };
}

function readChecked(): string {
    try {
        return localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
        return '';
    }
}

function writeChecked(ids: string[]) {
    try {
        localStorage.setItem(STORAGE_KEY, ids.join(','));
    } catch (err) {
        console.error('Failed to persist runbook state', err);
    }
    window.dispatchEvent(new Event(STORE_EVENT));
}

export default function RunbookChecklist() {
    const t = useT();
    const checkedRaw = useSyncExternalStore(subscribe, readChecked, () => '');
    const checked = new Set(checkedRaw.split(',').filter(Boolean));

    const toggle = (id: string) => {
        const next = new Set(checked);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        writeChecked([...next]);
    };

    return (
        <div className="px-4 py-8 max-w-3xl mx-auto">
            <h1 className="text-2xl font-semibold tracking-tight">{t('runbook.title')}</h1>
            <p className="mt-1 text-sm text-secondary max-w-2xl">{t('runbook.intro')}</p>

            <div className="mt-4 flex items-center gap-3">
                <span className="text-sm font-mono" aria-live="polite">
                    {t('runbook.progress', { done: checked.size, total: STEPS.length })}
                </span>
                <button
                    onClick={() => writeChecked([])}
                    className="text-sm text-secondary hover:text-foreground transition-colors underline decoration-dotted underline-offset-4"
                >
                    {t('runbook.reset')}
                </button>
            </div>

            <ol className="mt-6 space-y-3">
                {STEPS.map((step, index) => (
                    <li key={step.id} className={`rounded-lg border p-4 ${checked.has(step.id) ? 'bg-surface' : ''}`}>
                        <div className="flex items-start gap-3">
                            <input
                                id={`runbook-${step.id}`}
                                type="checkbox"
                                checked={checked.has(step.id)}
                                onChange={() => toggle(step.id)}
                                className="mt-1 h-4 w-4 accent-[var(--accent)]"
                            />
                            <div className="min-w-0">
                                <label htmlFor={`runbook-${step.id}`} className="block font-medium cursor-pointer">
                                    {index + 1}. {t(step.titleKey)}
                                </label>
                                <p className={`mt-1 text-sm ${checked.has(step.id) ? 'text-muted' : 'text-secondary'}`}>
                                    {t(step.bodyKey)}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                                    {step.links.map(({ href, labelKey }) => (
                                        <Link key={href} href={href} className="text-accent hover:underline">
                                            {t(labelKey)} →
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}
