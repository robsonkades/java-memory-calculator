'use client'
import { useState } from 'react';
import Link from 'next/link';
import { diagnose, type CrossFindingId, type DiagnoseTexts } from '@/lib/diagnose';
import { buildMarkdownReport } from '@/lib/report';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/en';

const SOURCES: Array<{ key: keyof DiagnoseTexts; labelKey: TranslationKey; file: string }> = [
    { key: 'nmt', labelKey: 'diagnose.srcNmt', file: 'nmt.txt' },
    { key: 'gclog', labelKey: 'diagnose.srcGclog', file: 'gc.log' },
    { key: 'threads', labelKey: 'diagnose.srcThreads', file: 'threads.txt' },
    { key: 'histogram', labelKey: 'diagnose.srcHistogram', file: 'histogram.txt' },
    { key: 'smaps', labelKey: 'diagnose.srcSmaps', file: 'smaps.txt' },
];

const FINDING_KEY: Record<CrossFindingId, TranslationKey> = {
    'vm-threads': 'finding.vmThreads',
    'stacks': 'finding.stacks',
    'rss-gap': 'finding.rssGap',
    'heap-vs-live': 'finding.heapVsLive',
    'coh-savings': 'finding.cohSavings',
    'off-peak': 'finding.offPeak',
};

const SEVERITY_BADGE = {
    warning: { symbol: '!', className: 'text-amber-700 dark:text-amber-400 bg-amber-500/10' },
    advice: { symbol: '→', className: 'text-accent bg-accent/10' },
    info: { symbol: 'i', className: 'text-secondary bg-surface' },
} as const;

export default function DiagnosePanel() {
    const [texts, setTexts] = useState<DiagnoseTexts>({});
    const [headroomPercent, setHeadroomPercent] = useState(15);
    const t = useT();

    const result = diagnose(texts, headroomPercent);
    const hasInput = Object.values(texts).some((v) => v && v.trim() !== '');

    const download = () => {
        const markdown = buildMarkdownReport(result, headroomPercent);
        const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'jvm-expert-diagnosis.md';
        anchor.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="px-4 py-8 max-w-6xl mx-auto">
            <h1 className="text-2xl font-semibold tracking-tight">{t('diagnose.title')}</h1>
            <div className="mt-1 mb-6 max-w-3xl">
                <p className="text-sm text-secondary">
                    {t('diagnose.intro')}{' '}
                    <Link href="/collect" className="text-accent hover:underline">{t('diagnose.collectLink')}</Link>.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {SOURCES.map(({ key, labelKey, file }) => (
                    <div key={key}>
                        <label htmlFor={`diagnose-${key}`} className="flex items-baseline justify-between mb-1">
                            <span className="text-sm font-medium">{t(labelKey)}</span>
                            <code className="font-mono text-xs text-muted">{file}</code>
                        </label>
                        <textarea
                            id={`diagnose-${key}`}
                            value={texts[key] ?? ''}
                            onChange={(e) => setTexts((prev) => ({ ...prev, [key]: e.target.value }))}
                            rows={5}
                            className={`w-full p-2 text-xs font-mono rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 ${texts[key]?.trim() && result.parsed[key] === null ? 'border-red-500/60' : ''}`}
                        />
                        {texts[key]?.trim() && result.parsed[key] === null && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{t('diagnose.unparsed')}</p>
                        )}
                    </div>
                ))}
            </div>

            {hasInput && result.sourceCount > 0 && (
                <>
                    {result.consolidatedLimitMiB !== undefined && (
                        <div className="mt-6 p-4 rounded-lg border bg-surface">
                            <div className="text-sm text-secondary">{t('diagnose.consolidated')}</div>
                            <div className="mt-1 text-2xl font-semibold tracking-tight font-mono">
                                {result.consolidatedLimitMiB} Mi
                            </div>
                            <div className="text-sm text-secondary">
                                {t('diagnose.consolidatedNote', { hr: headroomPercent })}
                            </div>
                            <div className="mt-2 flex items-center gap-2 text-sm">
                                <label htmlFor="diagnose-headroom" className="font-medium">{t('diagnose.headroom')}</label>
                                <input
                                    id="diagnose-headroom"
                                    type="number"
                                    value={headroomPercent}
                                    onChange={(e) => setHeadroomPercent(Number(e.target.value) || 0)}
                                    className="w-20 h-8 rounded-md border bg-background px-2 font-mono focus:outline-none focus:ring-2 focus:ring-accent/40"
                                />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {Object.keys(result.calculatorQuery).length > 0 && (
                                    <Link
                                        href={{ pathname: '/', query: result.calculatorQuery }}
                                        className="inline-flex items-center h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                                    >
                                        {t('diagnose.openCalc')}
                                    </Link>
                                )}
                                <button
                                    onClick={download}
                                    className="inline-flex items-center h-9 px-4 rounded-md border text-sm font-medium text-secondary hover:text-foreground transition-colors"
                                >
                                    {t('diagnose.download')}
                                </button>
                            </div>
                        </div>
                    )}

                    {result.findings.length > 0 && (
                        <div className="mt-6">
                            <h2 className="text-sm font-medium text-secondary mb-2">
                                {t('diagnose.findings', { n: result.sourceCount })}
                            </h2>
                            <ul className="space-y-2">
                                {result.findings.map((finding) => (
                                    <li key={finding.id} className="flex items-start gap-3 p-3 rounded-lg border">
                                        <span
                                            aria-label={t(`diagnose.sev.${finding.severity}` as TranslationKey)}
                                            className={`shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-xs font-semibold ${SEVERITY_BADGE[finding.severity].className}`}
                                        >
                                            {SEVERITY_BADGE[finding.severity].symbol}
                                        </span>
                                        <span className="text-sm">
                                            {t(finding.id === 'coh-savings' && finding.values.pct === undefined
                                                ? 'finding.cohSavingsNoPct'
                                                : FINDING_KEY[finding.id], finding.values)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
