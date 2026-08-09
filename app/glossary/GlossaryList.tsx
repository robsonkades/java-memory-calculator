'use client'
import Link from 'next/link';
import { useT } from '@/lib/i18n';

export default function GlossaryList() {
    const t = useT();

    // Term headings stay in English on purpose: they ARE the vocabulary being
    // defined — the exact words the reader will meet in NMT output, flags and
    // dashboards. Only the definitions are localized.
    const terms: Array<{ term: string; definition: React.ReactNode }> = [
        {
            term: 'Reserved',
            definition: <>{t('glossary.reserved.d1')}</>,
        },
        {
            term: 'Committed',
            definition: <>{t('glossary.committed.d1')} <Link href="/nmt">{t('glossary.committed.l1')}</Link>.</>,
        },
        {
            term: 'RSS (Resident Set Size)',
            definition: <>{t('glossary.rss.d1')} <code>kubectl top pod</code> {t('glossary.rss.d2')}</>,
        },
        {
            term: 'Working set',
            definition: <>{t('glossary.workingset.d1')}</>,
        },
        {
            term: 'Heap',
            definition: <>{t('glossary.heap.d1')} <code>-Xmx</code> {t('glossary.heap.d2')} <code>MaxRAMPercentage</code>{t('glossary.heap.d3')} <Link href="/guides/jvm-memory-beyond-the-heap">{t('glossary.heap.l1')}</Link>).</>,
        },
        {
            term: 'Young / old generation',
            definition: <>{t('glossary.generations.d1')}</>,
        },
        {
            term: 'Metaspace',
            definition: <>{t('glossary.metaspace.d1')} <Link href="/guides/metaspace-deep-dive">{t('glossary.metaspace.l1')}</Link>).</>,
        },
        {
            term: 'Compressed class space',
            definition: <>{t('glossary.ccs.d1')} <em>{t('glossary.ccs.d2')}</em> {t('glossary.ccs.d3')}</>,
        },
        {
            term: 'Code cache',
            definition: <>{t('glossary.codecache.d1')} <code>ReservedCodeCacheSize</code> {t('glossary.codecache.d2')}</>,
        },
        {
            term: 'Direct memory',
            definition: <>{t('glossary.direct.d1')} <code>MaxDirectMemorySize</code> {t('glossary.direct.d2')}</>,
        },
        {
            term: 'Thread stack',
            definition: <>{t('glossary.stack.d1')} <code>-Xss</code> {t('glossary.stack.d2')} <Link href="/guides/virtual-threads-memory">{t('glossary.stack.l1')}</Link>).</>,
        },
        {
            term: 'GC structures',
            definition: <>{t('glossary.gcstructures.d1')}</>,
        },
        {
            term: 'NMT (Native Memory Tracking)',
            definition: <>{t('glossary.nmt.d1')} <code>-XX:NativeMemoryTracking=summary</code>{t('glossary.nmt.d2')} <code>jcmd</code>{t('glossary.nmt.d3')} <Link href="/nmt">{t('glossary.nmt.l1')}</Link>.</>,
        },
        {
            term: 'cgroup memory limit',
            definition: <>{t('glossary.cgroup.d1')}<code>resources.limits.memory</code> {t('glossary.cgroup.d2')} <code>mem_limit</code> {t('glossary.cgroup.d3')} <code>MaxRAMPercentage</code>.</>,
        },
        {
            term: 'OOMKilled vs OutOfMemoryError',
            definition: <>{t('glossary.oom.d1')} <code>OOMKilled</code> {t('glossary.oom.d2')} <em>{t('glossary.oom.d3')}</em> {t('glossary.oom.d4')} <code>java.lang.OutOfMemoryError</code> {t('glossary.oom.d5')} <em>{t('glossary.oom.d6')}</em> {t('glossary.oom.d7')} <Link href="/guides/oomkilled-troubleshooting">{t('glossary.oom.l1')}</Link>).</>,
        },
        {
            term: 'Headroom',
            definition: <>{t('glossary.headroom.d1')} <Link href="/">{t('glossary.headroom.l1')}</Link> {t('glossary.headroom.d2')}</>,
        },
        {
            term: 'MaxRAMPercentage',
            definition: <>{t('glossary.mrp.d1')} <Link href="/guides/maxrampercentage-done-right">{t('glossary.mrp.l1')}</Link>).</>,
        },
    ];

    return (
        <>
            <h1 className="text-2xl font-semibold tracking-tight mb-2">{t('glossary.title')}</h1>
            <p className="text-sm text-secondary mb-6">
                {t('glossary.intro')}
            </p>
            <dl className="space-y-4">
                {terms.map(({ term, definition }) => (
                    <div key={term} className="rounded-lg border p-4">
                        <dt className="font-medium">{term}</dt>
                        <dd className="text-sm text-secondary mt-1">{definition}</dd>
                    </div>
                ))}
            </dl>
        </>
    );
}
