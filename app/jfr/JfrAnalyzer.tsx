'use client'
import { useState } from 'react';
import Link from 'next/link';
import { inspectJfr, type JfrFileInfo } from '@/lib/jfr-binary';
import { parseJfrPrint } from '@/lib/jfrprint';
import { useT } from '@/lib/i18n';
import TooltipLabel from '../components/TooltipLabel';

const mib = (value: number) => (value >= 100 ? String(Math.round(value)) : value.toFixed(1));

export default function JfrAnalyzer() {
    const [fileName, setFileName] = useState<string | null>(null);
    const [fileInfo, setFileInfo] = useState<JfrFileInfo | 'invalid' | null>(null);
    const [text, setText] = useState('');
    const t = useT();

    const report = parseJfrPrint(text);
    const printCommand = `jfr print --events jdk.GCHeapSummary,jdk.NativeMemoryUsage ${fileName ?? 'recording.jfr'}`;

    const onFile = (file: File | undefined) => {
        if (!file) return;
        setFileName(file.name);
        file.arrayBuffer().then((buffer) => {
            setFileInfo(inspectJfr(buffer) ?? 'invalid');
        });
    };

    return (
        <div className="px-4 py-8 max-w-6xl mx-auto">
            <h1 className="text-2xl font-semibold tracking-tight">{t('jfr.title')}</h1>

            <div className="mt-1 mb-6 max-w-3xl">
                <p className="text-sm text-secondary">
                    {t('jfr.intro1')} <code className="font-mono text-sm">.jfr</code> {t('jfr.intro2')}{' '}
                    <code className="font-mono text-sm">jfr print</code> {t('jfr.intro3')}
                </p>
            </div>

            <h2 className="text-base font-medium">{t('jfr.step1')}</h2>
            <div className="mt-2">
                <label className="inline-flex items-center h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer">
                    {t('jfr.chooseFile')}
                    <input
                        type="file"
                        accept=".jfr"
                        className="hidden"
                        onChange={(e) => onFile(e.target.files?.[0])}
                    />
                </label>
                {fileName && <span className="ml-3 text-sm font-mono text-secondary">{fileName}</span>}
            </div>

            {fileInfo === 'invalid' && (
                <div className="mt-4 p-4 rounded-lg border border-red-600/40 bg-red-500/5">
                    <p className="font-medium text-red-600 dark:text-red-400">{t('jfr.invalidTitle')}</p>
                    <p className="text-sm text-secondary mt-1">
                        {t('jfr.invalidBody')}{' '}
                        <code className="font-mono">-XX:StartFlightRecording</code> or{' '}
                        <code className="font-mono">jcmd &lt;pid&gt; JFR.dump</code>.
                    </p>
                </div>
            )}

            {fileInfo !== null && fileInfo !== 'invalid' && (
                <>
                    <div className="mt-4 rounded-lg border p-4">
                        <h3 className="text-sm font-medium text-secondary mb-2">{t('jfr.recording')}</h3>
                        <div className="text-sm space-y-1">
                            <div>{t('jfr.valid')} <span className="font-mono">{fileInfo.chunks[0]?.versionMajor}.{fileInfo.chunks[0]?.versionMinor}</span></div>
                            <div>{t('jfr.chunks')} <span className="font-mono">{fileInfo.chunks.length}</span></div>
                            <div>{t('jfr.duration')} <span className="font-mono">{fileInfo.totalDurationSeconds.toFixed(1)} s</span></div>
                            <div>{t('jfr.size')} <span className="font-mono">{mib(fileInfo.fileSizeBytes / (1024 * 1024))} MiB</span></div>
                            {fileInfo.truncated && (
                                <div className="text-red-600 dark:text-red-400">
                                    {t('jfr.truncated')}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 rounded-lg border p-4 bg-surface">
                        <p className="text-sm text-secondary">
                            <TooltipLabel
                                text={<span>{t('jfr.extraction')}</span>}
                                tooltip={t('jfr.extractionTooltip')}
                            />
                            {' '}{t('jfr.runThis')}
                        </p>
                        <pre className="mt-2 p-3 rounded-md border bg-background overflow-x-auto text-sm font-mono">{printCommand}</pre>
                        <p className="mt-2 text-sm text-secondary">
                            {t('jfr.emptyHint1')}{' '}
                            <code className="font-mono">jfr summary {fileName ?? 'recording.jfr'}</code>.{' '}
                            {t('jfr.emptyHint2')}{' '}
                            <code className="font-mono">-XX:NativeMemoryTracking=summary</code>.
                        </p>
                    </div>
                </>
            )}

            <h2 className="text-base font-medium mt-8">{t('jfr.step2')}</h2>
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'jdk.GCHeapSummary {\n  gcId = 3\n  when = "After GC"\n  heapUsed = 34.4 MB\n}\n...'}
                rows={10}
                className="mt-2 w-full p-3 text-sm font-mono rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />

            {text.trim() !== '' && report === null && (
                <div className="mt-4 p-4 rounded-lg border border-red-600/40 bg-red-500/5">
                    <p className="font-medium text-red-600 dark:text-red-400">{t('jfr.noEventsTitle')}</p>
                    <p className="text-sm text-secondary mt-1">
                        {t('jfr.expected')} <code className="font-mono">jdk.GCHeapSummary</code> {t('jfr.or')}{' '}
                        <code className="font-mono">jdk.NativeMemoryUsage</code> {t('jfr.blocksFrom')}{' '}
                        <code className="font-mono">jfr print</code>.
                    </p>
                </div>
            )}

            {report && report.recommendedHeapMiB !== undefined && (
                <div className="mt-6 p-4 rounded-lg border bg-surface">
                    <div className="text-sm text-secondary">{t('jfr.recommendedHeap')}</div>
                    <div className="mt-1 text-2xl font-semibold tracking-tight font-mono">
                        {report.recommendedHeapMiB} MiB
                    </div>
                    <div className="text-sm text-secondary">
                        <TooltipLabel
                            text={<span>{t('jfr.liveSet', { live: report.liveSetMiB ?? 0, n: report.afterGcSamples })}</span>}
                            tooltip={t('jfr.liveSetTooltip')}
                        />
                    </div>
                    <div className="mt-3">
                        <Link
                            href={{ pathname: '/', query: { heap: String(report.recommendedHeapMiB) } }}
                            className="inline-flex items-center h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                        >
                            {t('jfr.openCalc')}
                        </Link>
                    </div>
                </div>
            )}

            {report && report.nativeMemory.length > 0 && (
                <div className="mt-6 rounded-lg border p-4">
                    <h2 className="text-base font-medium mb-1">{t('jfr.nativeTitle')}</h2>
                    <p className="text-sm text-secondary mb-3">
                        {t('jfr.nativeDesc1')} <code className="font-mono">jdk.NativeMemoryUsage</code> {t('jfr.nativeDesc2')}{' '}
                        <Link href="/nmt" className="text-accent hover:underline">{t('smaps.nmtAnalyzer')}</Link>.
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wide text-secondary border-b">
                                    <th className="py-2 pr-4 font-medium">{t('jfr.type')}</th>
                                    <th className="py-2 pr-4 text-right font-medium">{t('nmt.committed')}</th>
                                    <th className="py-2 text-right font-medium">{t('nmt.reserved')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.nativeMemory.map((entry) => (
                                    <tr key={entry.type} className="border-b last:border-b-0">
                                        <td className="py-2 pr-4">{entry.type}</td>
                                        <td className="py-2 pr-4 text-right font-mono">{mib(entry.committedMiB)}</td>
                                        <td className="py-2 text-right font-mono">{mib(entry.reservedMiB)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
