'use client'
import { useState } from 'react';
import Link from 'next/link';
import { estimateYoungGcPerHour, parseGcLog } from '@/lib/gclog';
import { useT } from '@/lib/i18n';
import TooltipLabel from '../components/TooltipLabel';

const ms = (value: number) => value.toFixed(1);

export default function GcLogAnalyzer() {
    const [text, setText] = useState('');
    const [whatIfHeap, setWhatIfHeap] = useState(0);
    const t = useT();

    const report = parseGcLog(text);
    const whatIf = report !== null && whatIfHeap > 0 ? estimateYoungGcPerHour(report, whatIfHeap) : undefined;

    const trend = report?.liveSetTrend;
    const trendSourceKey = report === null ? null
        : report.liveSetSource === 'full' ? 'gclog.srcFull' as const
            : report.liveSetSource === 'remark' ? 'gclog.srcRemark' as const
                : report.liveSetSource === 'zgc' ? 'gclog.srcZgc' as const
                    : 'gclog.srcAny' as const;
    const formatEta = (hours: number) => (hours >= 48 ? `${Math.round(hours / 24)} d` : `${hours.toFixed(1)} h`);

    const timed = report?.pauses.filter((p) => p.uptimeSeconds !== undefined) ?? [];
    const minUptime = timed.length > 0 ? Math.min(...timed.map((p) => p.uptimeSeconds!)) : 0;
    const showTimeline = report !== null
        && report.spanSeconds !== undefined && report.spanSeconds > 0 && timed.length >= 2;
    const youngCount = timed.filter((p) => p.kind === 'young').length;
    const otherCount = timed.length - youngCount;

    return (
        <div className="px-4 py-8 max-w-6xl mx-auto">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">{t('gclog.title')}</h1>

                <div className="mt-1 mb-6 max-w-3xl">
                    <p className="text-sm text-secondary">
                        {t('gclog.intro1')} <code className="font-mono text-sm">-Xlog:gc</code> ({t('gclog.intro2')}{' '}
                        <code className="font-mono text-sm">-Xlog:gc*:file=gc.log</code>) {t('gclog.intro3')}
                    </p>
                </div>

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={'[1.000s][info][gc] GC(0) Pause Young (Normal) (G1 Evacuation Pause) 100M->20M(256M) 10.0ms\n...'}
                    rows={10}
                    className="w-full p-3 text-sm font-mono rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />

                {text.trim() !== '' && report === null && (
                    <div className="mt-4 p-4 rounded-lg border border-red-600/40 bg-red-500/5">
                        <p className="font-medium text-red-600 dark:text-red-400">{t('gclog.noEventsTitle')}</p>
                        <p className="text-sm text-secondary mt-1">
                            {t('gclog.expected')}{' '}
                            <code className="font-mono">GC(0) Pause Young (Normal) (G1 Evacuation Pause) 100M-&gt;20M(256M) 10.0ms</code>.
                        </p>
                    </div>
                )}

                {report && !report.zgc && report.pauseCount === 0 && report.unparsedCollections > 0 && (
                    <div className="mt-4 p-4 rounded-lg border">
                        <p className="font-medium">{t('gclog.zgcTitle', { n: report.unparsedCollections })}</p>
                        <p className="text-sm text-secondary mt-1">
                            {t('gclog.zgcBody')}
                        </p>
                    </div>
                )}

                {report && (report.pauseCount > 0 || report.zgc) && (
                    <>
                        {report.zgc && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                                <div className="rounded-lg border p-4">
                                    <h2 className="text-sm font-medium text-secondary mb-2">{t('gclog.zgcStats')}</h2>
                                    <div className="text-sm space-y-1">
                                        <div>{t('gclog.zgcMajors')} <span className="font-mono">{report.zgc.majorCount}</span></div>
                                        <div>{t('gclog.zgcMinors')} <span className="font-mono">{report.zgc.minorCount}</span></div>
                                        {report.spanSeconds !== undefined && (
                                            <div>{t('gclog.span')} <span className="font-mono">{report.spanSeconds.toFixed(1)} s</span></div>
                                        )}
                                    </div>
                                </div>
                                <div className="rounded-lg border p-4">
                                    <h2 className="text-sm font-medium text-secondary mb-2">
                                        <TooltipLabel
                                            text={<span>{t('gclog.zgcPauses')}</span>}
                                            tooltip={t('gclog.zgcPausesTooltip')}
                                        />
                                    </h2>
                                    <div className="text-sm space-y-1">
                                        <div>{t('gclog.count')} <span className="font-mono">{report.zgc.pauseCount}</span></div>
                                        <div>p95: <span className="font-mono">{report.zgc.p95PauseMs.toFixed(3)} ms</span></div>
                                        <div>{t('gclog.max')} <span className="font-mono">{report.zgc.maxPauseMs.toFixed(3)} ms</span></div>
                                    </div>
                                </div>
                                <div className="rounded-lg border p-4">
                                    <h2 className="text-sm font-medium text-secondary mb-2">
                                        <TooltipLabel
                                            text={<span>{t('gclog.zgcCapacity')}</span>}
                                            tooltip={t('gclog.zgcCapacityTooltip')}
                                        />
                                    </h2>
                                    <div className="text-sm space-y-1">
                                        {report.zgc.capacityMiB !== undefined
                                            ? <div><span className="font-mono">{report.zgc.capacityMiB} MiB</span></div>
                                            : <div className="text-secondary">—</div>}
                                        {report.throughputPercent !== undefined && (
                                            <div><span className="font-mono">{report.throughputPercent.toFixed(3)}%</span> {t('gclog.inApp')}</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {report.pauseCount > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                            <div className="rounded-lg border p-4">
                                <h2 className="text-sm font-medium text-secondary mb-2">{t('gclog.pauses')}</h2>
                                <div className="text-sm space-y-1">
                                    <div>{t('gclog.count')} <span className="font-mono">{report.pauseCount}</span></div>
                                    <div>{t('gclog.total')} <span className="font-mono">{ms(report.totalPauseMs)} ms</span></div>
                                    {report.spanSeconds !== undefined && (
                                        <div>{t('gclog.span')} <span className="font-mono">{report.spanSeconds.toFixed(1)} s</span></div>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-lg border p-4">
                                <h2 className="text-sm font-medium text-secondary mb-2">{t('gclog.pauseTimes')}</h2>
                                <div className="text-sm space-y-1">
                                    <div>{t('gclog.avg')} <span className="font-mono">{ms(report.avgPauseMs)} ms</span></div>
                                    <div>p95: <span className="font-mono">{ms(report.p95PauseMs)} ms</span></div>
                                    <div>{t('gclog.max')} <span className="font-mono">{ms(report.maxPauseMs)} ms</span></div>
                                </div>
                            </div>

                            <div className="rounded-lg border p-4">
                                <h2 className="text-sm font-medium text-secondary mb-2">{t('gclog.throughput')}</h2>
                                {report.throughputPercent !== undefined ? (
                                    <div className="text-sm space-y-1">
                                        <div><span className="font-mono">{report.throughputPercent.toFixed(2)}%</span> {t('gclog.inApp')}</div>
                                        <div className="text-secondary">
                                            {t('gclog.throughputNote')}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-sm text-secondary">
                                        {t('gclog.unknownUptime')}
                                    </div>
                                )}
                            </div>
                        </div>
                        )}

                        {report.g1 && (
                            <div className="mt-6 rounded-lg border p-4">
                                <h2 className="text-sm font-medium text-secondary mb-2">{t('gclog.g1Stats')}</h2>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                    <div className="space-y-1">
                                        <div>
                                            <TooltipLabel
                                                text={<span>{t('gclog.promoted')}</span>}
                                                tooltip={t('gclog.promotedTooltip')}
                                            /> <span className="font-mono">{report.g1.promotedMiB} MiB</span>
                                        </div>
                                        {report.g1.promotionRateMiBps !== undefined && (
                                            <div>{t('gclog.promotionRate')} <span className="font-mono">{report.g1.promotionRateMiBps.toFixed(2)} MiB/s</span></div>
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <div>
                                            <TooltipLabel
                                                text={<span>{t('gclog.humongous')}</span>}
                                                tooltip={t('gclog.humongousTooltip')}
                                            /> <span className="font-mono">{report.g1.maxHumongousRegions} ({report.g1.humongousMiB} MiB)</span>
                                        </div>
                                        {report.g1.maxHumongousRegions > 0 && (
                                            <div className="text-secondary">{t('gclog.humongousWarn', { size: report.g1.regionSizeMiB / 2 })}</div>
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <label htmlFor="whatif-heap" className="block">
                                            <TooltipLabel
                                                text={<span>{t('gclog.whatIf')}</span>}
                                                tooltip={t('gclog.whatIfTooltip')}
                                            />
                                        </label>
                                        <input
                                            id="whatif-heap"
                                            type="number"
                                            value={whatIfHeap || ''}
                                            onChange={(e) => setWhatIfHeap(Number(e.target.value) || 0)}
                                            className="w-28 h-8 rounded-md border bg-background px-2 font-mono focus:outline-none focus:ring-2 focus:ring-accent/40"
                                        />
                                        {whatIf !== undefined && (
                                            <div className="font-medium">{t('gclog.whatIfResult', { n: Math.round(whatIf) })}</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {showTimeline && report.spanSeconds !== undefined && (
                            <div className="mt-6 rounded-lg border p-4">
                                <h2 className="text-sm font-medium text-secondary mb-3">
                                    <TooltipLabel
                                        text={<span>{t('gclog.timeline')}</span>}
                                        tooltip={t('gclog.timelineTooltip')}
                                    />
                                </h2>
                                <div className="overflow-x-auto">
                                    <div className="relative h-24 min-w-80" aria-hidden="true">
                                        {timed.map((p, i) => (
                                            <div
                                                // GC ids repeat in real logs (Remark and Cleanup share one id).
                                                key={i}
                                                className="group absolute bottom-0 w-[3px] -translate-x-1/2"
                                                style={{
                                                    left: `${((p.uptimeSeconds! - minUptime) / report.spanSeconds!) * 100}%`,
                                                    height: `${Math.max((p.pauseMs / report.maxPauseMs) * 100, 3)}%`,
                                                }}
                                            >
                                                <div className={`h-full w-full rounded-t-sm ${p.kind === 'young' ? 'bg-chart-1' : 'bg-chart-8'}`} />
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 whitespace-nowrap rounded-md bg-foreground text-background px-2 py-1 text-xs">
                                                    GC({p.id}) · {p.label} · {p.pauseMs.toFixed(1)}ms @ {p.uptimeSeconds!.toFixed(1)}s
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-1 flex justify-between text-xs text-secondary font-mono min-w-80">
                                        <span>0s</span>
                                        <span>{report.spanSeconds.toFixed(1)}s</span>
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
                                    <span className="flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-chart-1" aria-hidden="true" />
                                        <span className="text-secondary">{t('gclog.young')}</span>
                                        <span className="font-mono tabular-nums">{youngCount}</span>
                                    </span>
                                    <span className="flex items-center gap-2">
                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-chart-8" aria-hidden="true" />
                                        <span className="text-secondary">{t('gclog.fullOther')}</span>
                                        <span className="font-mono tabular-nums">{otherCount}</span>
                                    </span>
                                </div>
                            </div>
                        )}

                        {trend && trend.rising && trendSourceKey && (
                            <div className="mt-6 p-4 rounded-lg border border-amber-600/40 bg-amber-500/5">
                                <p className="font-medium text-amber-700 dark:text-amber-400">{t('gclog.leakTitle')}</p>
                                <p className="text-sm text-secondary mt-1">
                                    {t('gclog.leakBody', {
                                        source: t(trendSourceKey),
                                        rate: trend.slopeMiBPerHour.toFixed(1),
                                        n: trend.samples,
                                        min: Math.round(trend.spanSeconds / 60),
                                        r2: trend.rSquared.toFixed(2),
                                    })}
                                    {trend.hoursToCapacity !== undefined && (
                                        <> {t('gclog.leakEta', { eta: formatEta(trend.hoursToCapacity) })}</>
                                    )}
                                </p>
                                <p className="text-sm text-secondary mt-2">
                                    {t('gclog.leakNext')}{' '}
                                    <Link href="/histogram" className="text-accent hover:underline">{t('gclog.histogramLink')}</Link>.
                                </p>
                            </div>
                        )}

                        <div className="mt-6 p-4 rounded-lg border bg-surface">
                            <div className="text-sm text-secondary">{t('gclog.recommendedHeap')}</div>
                            <div className="mt-1 text-2xl font-semibold tracking-tight font-mono">
                                {report.recommendedHeapMiB} MiB
                            </div>
                            <div className="text-sm text-secondary">
                                <TooltipLabel
                                    text={<span>{t('gclog.liveSet', { live: report.liveSetMiB })}</span>}
                                    tooltip={report.liveSetSource === 'full'
                                        ? t('gclog.liveSetTooltipFull')
                                        : report.liveSetSource === 'remark'
                                            ? t('gclog.liveSetTooltipRemark')
                                            : report.liveSetSource === 'zgc'
                                                ? t('gclog.liveSetTooltipZgc')
                                                : t('gclog.liveSetTooltipFallback')}
                                />
                            </div>
                            {report.allocationRateMiBps !== undefined && (
                                <div className="text-sm text-secondary">
                                    <TooltipLabel
                                        text={<span>{t('gclog.allocRate', { rate: report.allocationRateMiBps.toFixed(1) })}</span>}
                                        tooltip={t('gclog.allocTooltip')}
                                    />
                                </div>
                            )}
                            {trend && !trend.rising && trendSourceKey && (
                                <div className="text-sm text-secondary">
                                    <TooltipLabel
                                        text={<span>{t('gclog.noTrend', {
                                            source: t(trendSourceKey),
                                            n: trend.samples,
                                            min: Math.round(trend.spanSeconds / 60),
                                        })}</span>}
                                        tooltip={t('gclog.trendTooltip')}
                                    />
                                </div>
                            )}
                            <div className="mt-3">
                                <Link
                                    href={{ pathname: '/', query: { heap: String(report.recommendedHeapMiB) } }}
                                    className="inline-flex items-center h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                                >
                                    {t('gclog.openCalc')}
                                </Link>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
