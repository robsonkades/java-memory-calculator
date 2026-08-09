'use client'
import { useState } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/en';

interface Destination {
    key: string;
    optionKey: TranslationKey;
    href: string;
    toolKey: TranslationKey;
    whyKey: TranslationKey;
}

const DESTINATIONS: Destination[] = [
    { key: 'flags', optionKey: 'start.opt.flags', href: '/flags', toolKey: 'start.tool.flags', whyKey: 'start.why.flags' },
    { key: 'manifest', optionKey: 'start.opt.manifest', href: '/import', toolKey: 'start.tool.manifest', whyKey: 'start.why.manifest' },
    { key: 'nmt', optionKey: 'start.opt.nmt', href: '/nmt', toolKey: 'start.tool.nmt', whyKey: 'start.why.nmt' },
    { key: 'gclog', optionKey: 'start.opt.gclog', href: '/gclog', toolKey: 'start.tool.gclog', whyKey: 'start.why.gclog' },
    { key: 'jfr', optionKey: 'start.opt.jfr', href: '/jfr', toolKey: 'start.tool.jfr', whyKey: 'start.why.jfr' },
    { key: 'threads', optionKey: 'start.opt.threads', href: '/threads', toolKey: 'start.tool.threads', whyKey: 'start.why.threads' },
    { key: 'rss', optionKey: 'start.opt.rss', href: '/nmt', toolKey: 'start.tool.rss', whyKey: 'start.why.rss' },
];

const pill = (active: boolean) =>
    `px-4 py-2 text-sm rounded-md border transition-colors ${active
        ? 'bg-foreground text-background border-foreground'
        : 'bg-background text-secondary hover:text-foreground'}`;

export default function StartWizard() {
    const [running, setRunning] = useState<'yes' | 'no' | null>(null);
    const [source, setSource] = useState<string | null>(null);
    const t = useT();

    const destination = DESTINATIONS.find((d) => d.key === source);

    return (
        <div className="px-4 py-8 max-w-3xl mx-auto">
            <h1 className="text-2xl font-semibold tracking-tight mb-2">{t('start.title')}</h1>
            <p className="text-secondary mb-8">
                {t('start.subtitle')}
            </p>

            <div className="rounded-lg border p-5">
                <p className="font-medium mb-3">{t('start.q1')}</p>
                <div className="flex gap-2">
                    <button className={pill(running === 'yes')} onClick={() => { setRunning('yes'); setSource(null); }}>
                        {t('start.yes')}
                    </button>
                    <button className={pill(running === 'no')} onClick={() => { setRunning('no'); setSource(null); }}>
                        {t('start.no')}
                    </button>
                </div>
            </div>

            {running === 'no' && (
                <div className="rounded-lg border p-5 mt-4">
                    <p className="text-sm text-secondary mb-3">
                        {t('start.estimateFirst')}
                    </p>
                    <Link href="/" className="inline-block bg-foreground text-background text-sm font-medium px-4 py-2 rounded-md">
                        {t('start.openCalculator')}
                    </Link>
                </div>
            )}

            {running === 'yes' && (
                <div className="rounded-lg border p-5 mt-4">
                    <p className="font-medium mb-3">{t('start.q2')}</p>
                    <div className="flex flex-wrap gap-2">
                        {DESTINATIONS.map((d) => (
                            <button key={d.key} className={pill(source === d.key)} onClick={() => setSource(d.key)}>
                                {t(d.optionKey)}
                            </button>
                        ))}
                    </div>
                    {destination && (
                        <div className="mt-4 pt-4 border-t">
                            <p className="text-sm text-secondary mb-3">{t(destination.whyKey)}</p>
                            <Link
                                href={destination.href}
                                className="inline-block bg-foreground text-background text-sm font-medium px-4 py-2 rounded-md"
                            >
                                {t('start.open', { tool: t(destination.toolKey) })}
                            </Link>
                        </div>
                    )}
                </div>
            )}

            <p className="text-sm text-muted mt-6">
                {t('start.notSure1')} <Link href="/glossary" className="text-accent hover:underline">{t('start.glossaryLink')}</Link> {t('start.notSure2')}{' '}
                <Link href="/guides" className="text-accent hover:underline">{t('start.guidesLink')}</Link> {t('start.notSure3')}
            </p>
        </div>
    );
}
