'use client'
import { useState } from 'react';
import { diffHistograms, parseHistogramSeries } from '@/lib/histogram';
import { useT } from '@/lib/i18n';
import TooltipLabel from '../components/TooltipLabel';

const bytesToMiB = (bytes: number) => (bytes / 1048576).toFixed(1);
const signedMiB = (bytes: number) => `${bytes >= 0 ? '+' : ''}${bytesToMiB(bytes)}`;
const signedCount = (n: number) => `${n >= 0 ? '+' : ''}${n.toLocaleString('en-US')}`;

export default function HistogramAnalyzer() {
    const [text, setText] = useState('');
    const t = useT();

    const snapshots = parseHistogramSeries(text);
    const report = snapshots.length === 1 ? snapshots[0] : null;
    const diff = snapshots.length >= 2
        ? diffHistograms(snapshots[0], snapshots[snapshots.length - 1])
        : null;

    return (
        <div className="px-4 py-8 max-w-6xl mx-auto">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">{t('histo.title')}</h1>

                <div className="mt-1 mb-6 max-w-3xl">
                    <p className="text-sm text-secondary">
                        {t('histo.intro1')} <code className="font-mono text-sm">jcmd &lt;pid&gt; GC.class_histogram</code>{' '}
                        ({t('histo.intro2')} <code className="font-mono text-sm">jmap -histo &lt;pid&gt;</code>) {t('histo.intro3')}
                    </p>
                </div>

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={' num     #instances         #bytes  class name (module)\n   1:        500000       24000000  [B (java.base@25)\n...'}
                    rows={10}
                    className="w-full p-3 text-sm font-mono rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />

                {text.trim() !== '' && snapshots.length === 0 && (
                    <div className="mt-4 p-4 rounded-lg border border-red-600/40 bg-red-500/5">
                        <p className="font-medium text-red-600 dark:text-red-400">{t('histo.noneTitle')}</p>
                        <p className="text-sm text-secondary mt-1">
                            {t('histo.expected')} <code className="font-mono">1: 500000 24000000 [B (java.base@25)</code>.
                        </p>
                    </div>
                )}

                {diff && (
                    <>
                        <div className="mt-6 p-4 rounded-lg border bg-surface">
                            <div className="text-sm text-secondary">{t('histo.diffTitle')}</div>
                            <div className="mt-1 text-2xl font-semibold tracking-tight font-mono">
                                {signedMiB(diff.deltaTotalBytes)} MiB{' '}
                                <span className="text-base text-secondary">{t('histo.inObjects', { n: signedCount(diff.deltaTotalInstances) })}</span>
                            </div>
                            <div className="text-sm text-secondary">
                                {t('histo.diffNote', { n: snapshots.length })}
                            </div>
                        </div>

                        {diff.suspects.length > 0 && (
                            <div className="mt-4 p-4 rounded-lg border border-amber-600/40 bg-amber-500/5">
                                <p className="font-medium text-amber-700 dark:text-amber-400">{t('histo.suspectsTitle')}</p>
                                <ul className="mt-2 space-y-2 text-sm text-secondary">
                                    {diff.suspects.map((suspect) => (
                                        <li key={suspect.className}>
                                            {t(`histo.suspect.${suspect.kind}`, {
                                                cls: suspect.className,
                                                n: suspect.deltaInstances.toLocaleString('en-US'),
                                            })}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="mt-6 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wide text-secondary border-b [&>th]:font-medium">
                                        <th className="py-2 pr-4">#</th>
                                        <th className="py-2 pr-4">{t('histo.class')}</th>
                                        <th className="py-2 pr-4 text-right">{t('histo.deltaInstances')}</th>
                                        <th className="py-2 pr-4 text-right">{t('histo.deltaBytes')}</th>
                                        <th className="py-2 text-right">{t('histo.afterBytes')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {diff.rows
                                        .filter((row) => row.deltaBytes !== 0 || row.deltaInstances !== 0)
                                        .slice(0, 20)
                                        .map((row, index) => (
                                            <tr key={row.className} className="border-b">
                                                <td className="py-2 pr-4 font-mono">{index + 1}</td>
                                                <td className="py-2 pr-4 font-mono break-all">
                                                    {row.className}
                                                    {row.isNew && (
                                                        <span className="ml-2 rounded-sm border px-1 py-0.5 text-xs text-secondary align-middle">
                                                            {t('histo.newBadge')}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2 pr-4 text-right font-mono">{signedCount(row.deltaInstances)}</td>
                                                <td className="py-2 pr-4 text-right font-mono">{signedMiB(row.deltaBytes)}</td>
                                                <td className="py-2 text-right font-mono">{bytesToMiB(row.afterBytes)}</td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {report && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            <div className="rounded-lg border bg-surface p-4">
                                <div className="text-sm text-secondary">{t('histo.liveHeap')}</div>
                                <div className="mt-1 text-2xl font-semibold tracking-tight font-mono">
                                    {bytesToMiB(report.totalBytes)} MiB <span className="text-base text-secondary">{t('histo.inObjects', { n: report.totalInstances.toLocaleString('en-US') })}</span>
                                </div>
                                <div className="text-sm text-secondary">
                                    {t('histo.snapshotNote')}
                                </div>
                            </div>

                            <div className="rounded-lg border p-4">
                                <h2 className="text-sm font-medium text-secondary mb-1">Compact Object Headers</h2>
                                <div>
                                    <TooltipLabel
                                        text={<span>{t('histo.saving', { mib: bytesToMiB(report.compactHeadersSavingsBytes) })}</span>}
                                        tooltip={t('histo.savingTooltip')}
                                    />
                                </div>
                                <div className="text-sm text-secondary mt-1">
                                    {t('histo.savingPct', { pct: ((report.compactHeadersSavingsBytes / report.totalBytes) * 100).toFixed(1) })}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wide text-secondary border-b [&>th]:font-medium">
                                        <th className="py-2 pr-4">#</th>
                                        <th className="py-2 pr-4">{t('histo.class')}</th>
                                        <th className="py-2 pr-4 text-right">{t('histo.instances')}</th>
                                        <th className="py-2 pr-4 text-right">{t('histo.bytes')}</th>
                                        <th className="py-2 text-right">{t('histo.pctHeap')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.rows.slice(0, 20).map((row, index) => (
                                        <tr key={row.className + row.rank} className="border-b">
                                            <td className="py-2 pr-4 font-mono">{index + 1}</td>
                                            <td className="py-2 pr-4 font-mono break-all">{row.className}</td>
                                            <td className="py-2 pr-4 text-right font-mono">{row.instances.toLocaleString('en-US')}</td>
                                            <td className="py-2 pr-4 text-right font-mono">{bytesToMiB(row.bytes)}</td>
                                            <td className="py-2 text-right font-mono">
                                                {report.totalBytes > 0 ? ((row.bytes / report.totalBytes) * 100).toFixed(1) : '0.0'}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
