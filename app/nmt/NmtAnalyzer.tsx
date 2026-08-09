'use client'
import { useState } from 'react';
import Link from 'next/link';
import { javaHeapCommittedMiB, NMT_CATEGORY_NOTES, parseNmtSeries, recommendedLimitMiB, rssComparison, type NmtReport } from '@/lib/nmt';
import { useT } from '@/lib/i18n';
import TooltipLabel from '../components/TooltipLabel';

const toMiB = (kib: number) => (kib / 1024).toFixed(1);
const diffMiB = (kib: number) => `${kib >= 0 ? '+' : ''}${(kib / 1024).toFixed(1)}`;
const diffClass = (kib: number) => (kib > 0
    ? 'text-red-600 dark:text-red-400'
    : 'text-green-700 dark:text-green-400');

function buildTrend(series: NmtReport[]) {
    const first = series[0];
    const last = series[series.length - 1];
    const firstBy = new Map(first.categories.map((c) => [c.name, c.committedKiB]));
    const lastBy = new Map(last.categories.map((c) => [c.name, c.committedKiB]));
    const names = [...new Set([
        ...last.categories.map((c) => c.name),
        ...first.categories.map((c) => c.name),
    ])];
    const rows = names
        .map((name) => {
            const firstKiB = firstBy.get(name) ?? 0;
            const lastKiB = lastBy.get(name) ?? 0;
            return { name, firstKiB, lastKiB, deltaKiB: lastKiB - firstKiB };
        })
        .sort((a, b) => Math.abs(b.deltaKiB) - Math.abs(a.deltaKiB));
    return {
        rows,
        snapshots: series.length,
        firstTotalKiB: first.totalCommittedKiB,
        lastTotalKiB: last.totalCommittedKiB,
        totalDeltaKiB: last.totalCommittedKiB - first.totalCommittedKiB,
    };
}

export default function NmtAnalyzer() {
    const [text, setText] = useState('');
    const [headroomPercent, setHeadroomPercent] = useState(15);
    const [rssMiB, setRssMiB] = useState(0);
    const t = useT();

    // Multiple pasted snapshots become a series; the cards below reflect the latest one.
    const series = parseNmtSeries(text);
    const report = series.length > 0 ? series[series.length - 1] : null;
    const sorted = report
        ? [...report.categories].sort((a, b) => b.committedKiB - a.committedKiB)
        : [];

    const rss = report && rssMiB > 0 ? rssComparison(report, rssMiB, headroomPercent) : null;
    const heapMiB = report ? javaHeapCommittedMiB(report) : undefined;
    const calculatorQuery: Record<string, string> = {};
    if (report) {
        if (heapMiB !== undefined) calculatorQuery.heap = String(heapMiB);
        if (report.threadCount !== undefined) calculatorQuery.threads = String(report.threadCount);
        if (report.classCount !== undefined) calculatorQuery.classes = String(report.classCount);
    }

    return (
        <div className="px-4 py-8 max-w-6xl mx-auto">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">{t('nmt.title')}</h1>

                <div className="mt-1 mb-6 max-w-3xl">
                    <p className="text-sm text-secondary">
                        {t('nmt.intro1')}{' '}
                        <code className="font-mono text-sm">-XX:NativeMemoryTracking=summary</code>{t('nmt.intro2')}{' '}
                        <code className="font-mono text-sm">jcmd &lt;pid&gt; VM.native_memory summary</code>{' '}
                        {t('nmt.intro3')}{' '}
                        <code className="font-mono text-sm">summary.diff</code> {t('nmt.intro4')}{' '}
                        <Link href="/guides/reading-nmt-output" className="text-accent hover:underline">{t('nmt.introGuide')}</Link>.
                    </p>
                </div>

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={'Native Memory Tracking:\n\nTotal: reserved=1892974KB, committed=595406KB\n\n-                 Java Heap (reserved=524288KB, committed=524288KB)\n...'}
                    rows={10}
                    className="w-full p-3 text-sm font-mono rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />

                {text.trim() !== '' && report === null && (
                    <div className="mt-4 p-4 rounded-lg border border-red-600/40 bg-red-500/5">
                        <p className="font-medium text-red-600 dark:text-red-400">{t('nmt.noSummaryTitle')}</p>
                        <p className="text-sm text-secondary mt-1">
                            {t('nmt.noSummary1')} <code className="font-mono">- Java Heap (reserved=...KB, committed=...KB)</code>{' '}
                            {t('nmt.noSummary2')} <code className="font-mono">jcmd &lt;pid&gt; VM.native_memory summary</code>.
                        </p>
                    </div>
                )}

                {report && (
                    <>
                        <div className="mt-6 p-4 rounded-lg border bg-surface">
                            <div className="text-sm text-secondary">{t('nmt.recommended')}</div>
                            <div className="mt-1 text-2xl font-semibold tracking-tight font-mono">
                                {recommendedLimitMiB(report, headroomPercent)} Mi
                            </div>
                            <div className="text-sm text-secondary">
                                {t('nmt.measuredTotal', { total: toMiB(report.totalCommittedKiB), hr: headroomPercent })}
                            </div>
                            {(() => {
                                const heap = report.categories.find((c) => c.name === 'Java Heap');
                                if (heap?.componentPeakKiB === undefined
                                    || heap.componentPeakKiB <= heap.committedKiB * 1.5) return null;
                                return (
                                    <div className="mt-2 p-3 rounded-md border border-amber-600/40 bg-amber-500/5 text-sm">
                                        <span className="font-medium text-amber-700 dark:text-amber-400">! </span>
                                        {t('nmt.offPeakWarning', {
                                            peak: toMiB(heap.componentPeakKiB),
                                            now: toMiB(heap.committedKiB),
                                        })}
                                    </div>
                                );
                            })()}
                            {report.totalCommittedDiffKiB !== undefined && (
                                <div className="text-sm">
                                    <span className={diffClass(report.totalCommittedDiffKiB)}>
                                        {t('nmt.baselineDelta', { delta: diffMiB(report.totalCommittedDiffKiB) })}
                                    </span>
                                </div>
                            )}
                            <div className="mt-2 flex items-center gap-2 text-sm">
                                <label className="font-medium">{t('nmt.headroomLabel')}</label>
                                <input
                                    type="number"
                                    value={headroomPercent}
                                    onChange={(e) => setHeadroomPercent(Number(e.target.value) || 0)}
                                    className="w-20 h-8 px-2 text-sm rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                                />
                            </div>
                            <div className="text-sm text-secondary mt-2">
                                <TooltipLabel
                                    text={<span>{t('nmt.caveats')}</span>}
                                    tooltip={t('nmt.caveatsTooltip')}
                                />
                            </div>
                            {Object.keys(calculatorQuery).length > 0 && (
                                <div className="mt-3">
                                    <Link
                                        href={{ pathname: '/', query: calculatorQuery }}
                                        className="inline-flex items-center h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                                    >
                                        {t('nmt.openCalc')}
                                    </Link>
                                    <span className="ml-3 text-sm text-secondary">
                                        {Object.entries(calculatorQuery).map(([key, value]) => (
                                            <code key={key} className="font-mono mr-2">{key}={value}</code>
                                        ))}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 p-4 rounded-lg border bg-surface">
                            <h2 className="text-base font-medium">
                                <TooltipLabel
                                    text={<span>{t('nmt.realityTitle')}</span>}
                                    tooltip={t('nmt.realityTooltip')}
                                />
                            </h2>
                            <div className="mt-2 flex items-center gap-2 text-sm">
                                <label className="font-medium">{t('nmt.rssLabel')}</label>
                                <input
                                    type="number"
                                    value={rssMiB || ''}
                                    onChange={(e) => setRssMiB(Number(e.target.value) || 0)}
                                    className="w-28 h-8 px-2 text-sm rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                                />
                            </div>
                            {rss && (
                                <div className="mt-3 text-sm space-y-1">
                                    <div>
                                        {t('nmt.rssVs', { rss: rssMiB, committed: toMiB(report.totalCommittedKiB) })}{' '}
                                        <span className={diffClass(rss.deltaMiB)}>
                                            {rss.deltaMiB >= 0 ? '+' : ''}{rss.deltaMiB} MiB {rss.deltaMiB >= 0 ? t('nmt.outside') : t('nmt.untouched')}
                                        </span>
                                    </div>
                                    <div className="text-secondary">
                                        {rss.deltaMiB >= 0 ? t('nmt.gapExplain') : t('nmt.untouchedExplain')}
                                    </div>
                                    <div className="font-medium">
                                        {t('nmt.measurementLimit')} <span className="font-mono">{rss.recommendedLimitMiB} Mi</span>
                                        <span className="font-normal text-secondary"> {t('nmt.maxFormula', { hr: headroomPercent })}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wide text-secondary border-b [&>th]:font-medium">
                                        <th className="py-2 pr-4">{t('nmt.category')}</th>
                                        <th className="py-2 pr-4 text-right">{t('nmt.committed')}</th>
                                        {report.categories.some((c) => c.componentPeakKiB !== undefined)
                                            && <th className="py-2 pr-4 text-right">{t('nmt.peak')}</th>}
                                        {report.hasDiff && <th className="py-2 pr-4 text-right">{t('nmt.deltaCommitted')}</th>}
                                        <th className="py-2 pr-4 text-right">{t('nmt.pct')}</th>
                                        <th className="py-2 text-right">{t('nmt.reserved')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map((category) => (
                                        <tr key={category.name} className="border-b">
                                            <td className="py-2 pr-4">
                                                {NMT_CATEGORY_NOTES[category.name]
                                                    ? <TooltipLabel text={<span>{category.name}</span>} tooltip={NMT_CATEGORY_NOTES[category.name]} />
                                                    : category.name}
                                            </td>
                                            <td className="py-2 pr-4 text-right font-mono">{toMiB(category.committedKiB)}</td>
                                            {report.categories.some((c) => c.componentPeakKiB !== undefined) && (
                                                <td className="py-2 pr-4 text-right font-mono text-secondary">
                                                    {category.componentPeakKiB !== undefined ? toMiB(category.componentPeakKiB) : '—'}
                                                </td>
                                            )}
                                            {report.hasDiff && (
                                                <td className={`py-2 pr-4 text-right font-mono ${category.committedDiffKiB !== undefined ? diffClass(category.committedDiffKiB) : 'text-muted'}`}>
                                                    {category.committedDiffKiB !== undefined ? diffMiB(category.committedDiffKiB) : '—'}
                                                </td>
                                            )}
                                            <td className="py-2 pr-4 text-right font-mono">
                                                {report.totalCommittedKiB > 0
                                                    ? ((category.committedKiB / report.totalCommittedKiB) * 100).toFixed(1)
                                                    : '0.0'}%
                                            </td>
                                            <td className="py-2 text-right font-mono">{toMiB(category.reservedKiB)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="font-medium">
                                        <td className="py-2 pr-4">{t('nmt.total')}</td>
                                        <td className="py-2 pr-4 text-right font-mono">{toMiB(report.totalCommittedKiB)}</td>
                                        {report.categories.some((c) => c.componentPeakKiB !== undefined)
                                            && <td className="py-2 pr-4 text-right font-mono text-muted">—</td>}
                                        {report.hasDiff && (
                                            <td className={`py-2 pr-4 text-right font-mono ${report.totalCommittedDiffKiB !== undefined ? diffClass(report.totalCommittedDiffKiB) : ''}`}>
                                                {report.totalCommittedDiffKiB !== undefined ? diffMiB(report.totalCommittedDiffKiB) : '—'}
                                            </td>
                                        )}
                                        <td className="py-2 pr-4 text-right font-mono">100%</td>
                                        <td className="py-2 text-right font-mono">{toMiB(report.totalReservedKiB)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {series.length >= 2 && (() => {
                            const trend = buildTrend(series);
                            return (
                                <div className="mt-6 p-4 rounded-lg border bg-surface">
                                    <h2 className="text-base font-medium">
                                        {t('nmt.trendTitle', { n: trend.snapshots })}
                                    </h2>
                                    <p className="text-sm text-secondary mt-1">
                                        {t('nmt.trendDesc')}
                                    </p>
                                    <div className="mt-3 overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-xs uppercase tracking-wide text-secondary border-b [&>th]:font-medium">
                                                    <th className="py-2 pr-4">{t('nmt.category')}</th>
                                                    <th className="py-2 pr-4 text-right">{t('nmt.first')}</th>
                                                    <th className="py-2 pr-4 text-right">{t('nmt.last')}</th>
                                                    <th className="py-2 text-right">Δ (MiB)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {trend.rows.map((row) => (
                                                    <tr key={row.name} className="border-b">
                                                        <td className="py-2 pr-4">{row.name}</td>
                                                        <td className="py-2 pr-4 text-right font-mono">{toMiB(row.firstKiB)}</td>
                                                        <td className="py-2 pr-4 text-right font-mono">{toMiB(row.lastKiB)}</td>
                                                        <td className={`py-2 text-right font-mono ${row.deltaKiB !== 0 ? diffClass(row.deltaKiB) : ''}`}>
                                                            {diffMiB(row.deltaKiB)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="font-medium">
                                                    <td className="py-2 pr-4">{t('nmt.total')}</td>
                                                    <td className="py-2 pr-4 text-right font-mono">{toMiB(trend.firstTotalKiB)}</td>
                                                    <td className="py-2 pr-4 text-right font-mono">{toMiB(trend.lastTotalKiB)}</td>
                                                    <td className={`py-2 text-right font-mono ${trend.totalDeltaKiB !== 0 ? diffClass(trend.totalDeltaKiB) : ''}`}>
                                                        {diffMiB(trend.totalDeltaKiB)}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            );
                        })()}
                    </>
                )}
            </div>
        </div>
    );
}
