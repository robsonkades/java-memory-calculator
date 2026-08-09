'use client'
import { useState } from 'react';
import Link from 'next/link';
import { parseSmaps } from '@/lib/smaps';
import { useT } from '@/lib/i18n';
import CompositionBar from '../components/CompositionBar';
import TooltipLabel from '../components/TooltipLabel';

const toMiB = (kib: number) => Math.round(kib / 1024);

export default function SmapsAnalyzer() {
    const [text, setText] = useState('');
    const t = useT();

    const result = parseSmaps(text);

    return (
        <div className="px-4 py-8 max-w-6xl mx-auto">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">{t('smaps.title')}</h1>

                <div className="mt-1 mb-6 max-w-3xl">
                    <p className="text-sm text-secondary">
                        {t('smaps.intro1')}{' '}
                        <code className="font-mono text-sm">cat /proc/&lt;pid&gt;/smaps_rollup</code> {t('smaps.intro2')}{' '}
                        <code className="font-mono text-sm">cat /proc/&lt;pid&gt;/smaps</code> /{' '}
                        <code className="font-mono text-sm">pmap -x &lt;pid&gt;</code> {t('smaps.intro3')}{' '}
                        <Link href="/nmt" className="text-accent hover:underline">NMT</Link> {t('smaps.intro4')}
                    </p>
                </div>

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={'7f0000000000-7f001f400000 rw-p 00000000 00:00 0\nSize:             512000 kB\nRss:              480000 kB\n...'}
                    rows={10}
                    className="w-full p-3 text-sm font-mono rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />

                {text.trim() !== '' && result === null && (
                    <div className="mt-4 p-4 rounded-lg border border-red-600/40 bg-red-500/5">
                        <p className="font-medium text-red-600 dark:text-red-400">{t('smaps.noneTitle')}</p>
                        <p className="text-sm text-secondary mt-1">
                            {t('smaps.expected1')} <code className="font-mono">Rss: NNN kB</code> {t('smaps.expected2')}{' '}
                            <code className="font-mono">pmap -x</code> {t('smaps.expected3')}
                        </p>
                    </div>
                )}

                {result?.kind === 'rollup' && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                            <div className="rounded-lg border p-4">
                                <h2 className="text-sm font-medium text-secondary mb-2">RSS</h2>
                                <div className="text-2xl font-semibold tracking-tight font-mono">{toMiB(result.rssKiB)} MiB</div>
                                <p className="text-sm text-secondary mt-1">{t('smaps.rssNote')}</p>
                            </div>
                            <div className="rounded-lg border p-4">
                                <h2 className="text-sm font-medium text-secondary mb-2">PSS</h2>
                                {result.pssKiB !== undefined ? (
                                    <>
                                        <div className="text-2xl font-semibold tracking-tight font-mono">{toMiB(result.pssKiB)} MiB</div>
                                        <p className="text-sm text-secondary mt-1">{t('smaps.pssNote')}</p>
                                    </>
                                ) : <p className="text-sm text-secondary">{t('smaps.notPresent')}</p>}
                            </div>
                            <div className="rounded-lg border p-4">
                                <h2 className="text-sm font-medium text-secondary mb-2">Swap</h2>
                                {result.swapKiB !== undefined ? (
                                    <>
                                        <div className="text-2xl font-semibold tracking-tight font-mono">{toMiB(result.swapKiB)} MiB</div>
                                        <p className="text-sm text-secondary mt-1">{t('smaps.swapNote')}</p>
                                    </>
                                ) : <p className="text-sm text-secondary">{t('smaps.notPresent')}</p>}
                            </div>
                        </div>
                        <p className="mt-4 text-sm text-secondary">
                            {t('smaps.rollupNote1')} <code className="font-mono">smaps</code> {t('smaps.rollupNote2')}{' '}
                            <code className="font-mono">pmap -x</code>. {t('smaps.rollupNote3')}{' '}
                            <Link href="/nmt" className="text-accent hover:underline">{t('smaps.nmtAnalyzer')}</Link>.
                        </p>
                    </>
                )}

                {result?.kind === 'mappings' && (
                    <>
                        <div className="mt-6 rounded-lg border p-4">
                            <div className="flex items-baseline justify-between mb-4">
                                <h2 className="text-sm font-medium text-secondary">
                                    <TooltipLabel
                                        text={<span>{t('smaps.byCategory')}</span>}
                                        tooltip={t('smaps.byCategoryTooltip')}
                                    />
                                </h2>
                                <span className="text-sm font-mono tabular-nums">{t('smaps.totalSuffix', { mib: toMiB(result.totalRssKiB) })}</span>
                            </div>
                            <CompositionBar
                                segments={result.categories.map((c) => ({ label: c.name, value: toMiB(c.rssKiB) }))}
                                unit="MiB"
                            />
                        </div>

                        <div className="mt-6 rounded-lg border p-4 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wide text-secondary border-b">
                                        <th className="py-2 pr-4 font-medium">{t('smaps.category')}</th>
                                        <th className="py-2 pr-4 text-right font-medium">{t('smaps.mappings')}</th>
                                        <th className="py-2 pr-4 text-right font-medium">RSS (MiB)</th>
                                        <th className="py-2 text-right font-medium">{t('smaps.pctRss')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.categories.map((c) => (
                                        <tr key={c.name} className="border-b last:border-b-0">
                                            <td className="py-2 pr-4">{c.name}</td>
                                            <td className="py-2 pr-4 text-right font-mono">{c.mappingCount}</td>
                                            <td className="py-2 pr-4 text-right font-mono">{toMiB(c.rssKiB)}</td>
                                            <td className="py-2 text-right font-mono">
                                                {result.totalRssKiB > 0 ? ((c.rssKiB / result.totalRssKiB) * 100).toFixed(1) : '0.0'}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {result.arenaCount > 0 && (
                            <div className="mt-4 p-4 rounded-lg border bg-surface">
                                <p className="text-sm">
                                    <span className="font-medium">{result.arenaCount === 1 ? t('smaps.arenaOne') : t('smaps.arenaMany', { n: result.arenaCount })}</span>{' '}
                                    {t('smaps.arenas2')}{' '}
                                    <code className="font-mono">MALLOC_ARENA_MAX=2</code>; {t('smaps.arenas3')}{' '}
                                    <Link href="/guides/glibc-malloc-arenas" className="text-accent hover:underline">{t('smaps.arenaGuide')}</Link>{' '}
                                    {t('smaps.arenas4')}
                                </p>
                            </div>
                        )}

                        <p className="mt-4 text-sm text-secondary">
                            {t('smaps.crossCheck1')}{' '}
                            <Link href="/nmt" className="text-accent hover:underline">{t('smaps.nmtAnalyzer')}</Link>{' '}
                            {t('smaps.crossCheck2')}
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
