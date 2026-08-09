'use client'
import { useState } from 'react';
import Link from 'next/link';
import { parseThreadDump } from '@/lib/threaddump';
import { useT } from '@/lib/i18n';
import TooltipLabel from '../components/TooltipLabel';

export default function ThreadDumpAnalyzer() {
    const [text, setText] = useState('');
    const t = useT();

    const report = parseThreadDump(text);

    return (
        <div className="px-4 py-8 max-w-6xl mx-auto">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">{t('threads.title')}</h1>

                <div className="mt-1 mb-6 max-w-3xl">
                    <p className="text-sm text-secondary">
                        {t('threads.intro1')} <code className="font-mono text-sm">jstack &lt;pid&gt;</code> {t('threads.intro2')}{' '}
                        <code className="font-mono text-sm">jcmd &lt;pid&gt; Thread.print</code> {t('threads.intro3')}
                    </p>
                </div>

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={'"http-nio-8080-exec-1" #31 daemon prio=5 os_prio=0 ... \n   java.lang.Thread.State: RUNNABLE\n...'}
                    rows={10}
                    className="w-full p-3 text-sm font-mono rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />

                {text.trim() !== '' && report === null && (
                    <div className="mt-4 p-4 rounded-lg border border-red-600/40 bg-red-500/5">
                        <p className="font-medium text-red-600 dark:text-red-400">{t('threads.noneTitle')}</p>
                        <p className="text-sm text-secondary mt-1">
                            {t('threads.expected')} <code className="font-mono">&quot;pool-1-thread-3&quot; #27 daemon prio=5 ...</code>
                        </p>
                    </div>
                )}

                {report && (
                    <>
                        <div className="mt-6 p-4 rounded-lg border bg-surface">
                            <div className="text-sm text-secondary">{t('threads.javaThreads')}</div>
                            <div className="mt-1 text-2xl font-semibold tracking-tight font-mono">
                                {report.totalThreads} <span className="text-base text-secondary">({report.daemonThreads} daemon)</span>
                            </div>
                            <div className="text-sm text-secondary">
                                <TooltipLabel
                                    text={<span>{t('threads.reservedStacks', { mib: report.stackReservedMiB })}</span>}
                                    tooltip={t('threads.reservedTooltip')}
                                />
                            </div>
                            <div className="mt-3">
                                <Link
                                    href={{ pathname: '/', query: { threads: String(report.totalThreads) } }}
                                    className="inline-flex items-center h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                                >
                                    {t('threads.openCalc')}
                                </Link>
                            </div>
                        </div>

                        {report.topCpu.length > 0 && (
                            <div className="mt-6 rounded-lg border p-4">
                                <h2 className="text-sm font-medium text-secondary mb-2">
                                    <TooltipLabel
                                        text={<span>{t('threads.topCpu')}</span>}
                                        tooltip={t('threads.topCpuTooltip')}
                                    />
                                </h2>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs uppercase tracking-wide text-secondary border-b">
                                            <th className="py-2 pr-4 font-medium">{t('threads.topCpuThread')}</th>
                                            <th className="py-2 pr-4 text-right font-medium">{t('threads.topCpuMs')}</th>
                                            <th className="py-2 text-right font-medium">{t('threads.topCpuPercent')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.topCpu.map(({ name, cpuMs, cpuPercent }) => (
                                            <tr key={name} className="border-b last:border-b-0">
                                                <td className="py-1 pr-4 font-mono truncate max-w-72">{name}</td>
                                                <td className="py-1 pr-4 text-right font-mono">{cpuMs.toFixed(0)}</td>
                                                <td className="py-1 text-right font-mono">{cpuPercent !== undefined ? `${cpuPercent.toFixed(2)}%` : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            <div className="rounded-lg border p-4">
                                <h2 className="text-sm font-medium text-secondary mb-2">{t('threads.byState')}</h2>
                                <table className="w-full text-sm">
                                    <tbody>
                                        {Object.entries(report.byState).sort((a, b) => b[1] - a[1]).map(([state, count]) => (
                                            <tr key={state} className="border-b last:border-b-0">
                                                <td className="py-1 pr-4 font-mono">{state}</td>
                                                <td className="py-1 text-right font-mono">{count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="rounded-lg border p-4">
                                <h2 className="text-sm font-medium text-secondary mb-2">{t('threads.topPools')}</h2>
                                <table className="w-full text-sm">
                                    <tbody>
                                        {report.pools.slice(0, 10).map(({ pattern, count }) => (
                                            <tr key={pattern} className="border-b last:border-b-0">
                                                <td className="py-1 pr-4 font-mono truncate max-w-56">{pattern}</td>
                                                <td className="py-1 text-right font-mono">{count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
