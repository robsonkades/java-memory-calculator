'use client'
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { auditJvmFlags, fixJvmFlags, type AuditJavaVersion, type AuditSeverity, type FixChange } from '@/lib/flags-audit';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/en';

const SEVERITY_BADGE: Record<AuditSeverity, { labelKey: TranslationKey; symbol: string; className: string }> = {
    problem: { labelKey: 'flags.severityProblem', symbol: '✕', className: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950' },
    advice: { labelKey: 'flags.severityAdvice', symbol: '!', className: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950' },
    info: { labelKey: 'flags.severityInfo', symbol: 'i', className: 'text-secondary bg-surface border' },
};

const CHANGE_BADGE: Record<FixChange['kind'], { labelKey: TranslationKey; symbol: string; className: string }> = {
    removed: { labelKey: 'flags.changeRemoved', symbol: '−', className: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950' },
    replaced: { labelKey: 'flags.changeReplaced', symbol: '±', className: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950' },
    added: { labelKey: 'flags.changeAdded', symbol: '+', className: 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950' },
    kept: { labelKey: 'flags.changeKept', symbol: '=', className: 'text-secondary bg-surface border' },
};

export default function FlagsAuditor() {
    const searchParams = useSearchParams();
    const [text, setText] = useState(() => searchParams.get('line') ?? '');
    const [javaVersion, setJavaVersion] = useState<AuditJavaVersion>(25);
    const [copied, setCopied] = useState(false);
    const t = useT();

    const audit = auditJvmFlags(text, javaVersion);
    const fix = fixJvmFlags(text, javaVersion);

    const calculatorQuery: Record<string, string> = {};
    if (audit) {
        const { heapMiB, stackSizeMiB, codeCacheMiB, directMemoryMiB, gcType } = audit.extracted;
        if (heapMiB !== undefined) calculatorQuery.heap = String(heapMiB);
        if (stackSizeMiB !== undefined) calculatorQuery.xss = String(stackSizeMiB);
        if (codeCacheMiB !== undefined) calculatorQuery.cc = String(codeCacheMiB);
        if (directMemoryMiB !== undefined) calculatorQuery.dm = String(directMemoryMiB);
        if (gcType !== undefined) calculatorQuery.gc = gcType;
    }

    const copyFixed = () => {
        if (!fix) return;
        navigator.clipboard.writeText(fix.fixed)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 3000);
            })
            .catch(err => {
                console.error('Failed to copy fixed flags: ', err);
            });
    };

    return (
        <div className="px-4 py-8 max-w-6xl mx-auto">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">{t('flags.title')}</h1>

                <div className="mt-1 mb-6 max-w-3xl">
                    <p className="text-sm text-secondary">
                        {t('flags.intro1')} <code className="font-mono text-sm">JAVA_TOOL_OPTIONS</code>{t('flags.intro2')}
                        (<code className="font-mono text-sm">-D...</code>) {t('flags.intro3')}
                    </p>
                </div>

                <div className="mb-4 max-w-xs">
                    <label className="block text-sm font-medium mb-1.5">{t('flags.versionLabel')}</label>
                    <select
                        value={javaVersion}
                        onChange={(e) => setJavaVersion(Number(e.target.value) as AuditJavaVersion)}
                        className="w-full h-9 px-3 text-sm rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                    >
                        <option value={25}>Java 25 (LTS)</option>
                        <option value={21}>Java 21 (LTS)</option>
                        <option value={17}>Java 17 (LTS)</option>
                    </select>
                </div>

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={'-Xmx512m -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:NativeMemoryTracking=summary ...'}
                    rows={4}
                    className="w-full p-3 text-sm font-mono rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />

                {text.trim() !== '' && audit === null && (
                    <div className="mt-4 p-4 rounded-lg border border-red-600/40 bg-red-500/5">
                        <p className="font-medium text-red-600 dark:text-red-400">{t('flags.noFlagsTitle')}</p>
                        <p className="text-sm text-secondary mt-1">
                            {t('flags.expected')} <code className="font-mono">-Xmx512m</code>, <code className="font-mono">-XX:+UseG1GC</code> {t('flags.or')} <code className="font-mono">-XX:MaxRAMPercentage=70.0</code>.
                        </p>
                    </div>
                )}

                {audit && (
                    <>
                        <ul className="mt-6 space-y-2">
                            {audit.findings.map((finding, index) => (
                                <li key={index} className="flex items-start gap-3 p-3 rounded-lg border">
                                    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_BADGE[finding.severity].className}`}>
                                        {SEVERITY_BADGE[finding.severity].symbol} {t(SEVERITY_BADGE[finding.severity].labelKey)}
                                    </span>
                                    <span className="text-sm">
                                        <span className="font-mono font-medium">{finding.flag}</span>
                                        {' — '}{finding.message}
                                    </span>
                                </li>
                            ))}
                            {audit.findings.length === 0 && (
                                <li className="p-3 rounded-lg border text-sm">
                                    {t('flags.nothingToFlag')}
                                </li>
                            )}
                        </ul>

                        {audit.unknownFlags.length > 0 && (
                            <p className="mt-4 text-sm text-secondary">
                                {t('flags.notAnalyzed')}{' '}
                                {audit.unknownFlags.map((flag) => (
                                    <code key={flag} className="font-mono mr-2">{flag}</code>
                                ))}
                            </p>
                        )}

                        {fix && (
                            <div className="mt-6 p-4 rounded-lg border bg-surface">
                                <h2 className="text-base font-medium">{t('flags.fixedTitle', { version: javaVersion })}</h2>
                                <pre className="bg-background border rounded-lg p-4 mt-2 overflow-x-auto text-sm font-mono">{fix.fixed}</pre>
                                <button
                                    onClick={copyFixed}
                                    className="mt-2 h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                                >
                                    {t('flags.copyFixed')}
                                </button>
                                {copied && (
                                    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">
                                        {t('flags.copiedFixed')}
                                    </div>
                                )}
                                <ul className="mt-4 space-y-2">
                                    {fix.changes.map((change, index) => (
                                        <li key={index} className="flex items-start gap-3 text-sm">
                                            <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${CHANGE_BADGE[change.kind].className}`}>
                                                {CHANGE_BADGE[change.kind].symbol} {t(CHANGE_BADGE[change.kind].labelKey)}
                                            </span>
                                            <span>
                                                <span className="font-mono font-medium">{change.token}</span>
                                                {' — '}{change.reason}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {Object.keys(calculatorQuery).length > 0 && (
                            <div className="mt-6 p-4 rounded-lg border bg-surface">
                                <p className="text-sm text-secondary mb-2">
                                    {t('flags.recognized')} {Object.entries(calculatorQuery).map(([key, value]) => (
                                        <code key={key} className="font-mono mr-2">{key}={value}</code>
                                    ))}
                                </p>
                                <Link
                                    href={{ pathname: '/', query: calculatorQuery }}
                                    className="inline-flex items-center h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                                >
                                    {t('flags.openCalc')}
                                </Link>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
