'use client'
import { useState } from 'react';
import Link from 'next/link';
import { parseK8sInput } from '@/lib/k8s-import';
import { useT } from '@/lib/i18n';

const PLACEHOLDER = `apiVersion: apps/v1
kind: Deployment
...
      containers:
        - name: app
          resources:
            limits:
              memory: "1Gi"
          env:
            - name: JAVA_TOOL_OPTIONS
              value: "-XX:MaxRAMPercentage=70.0 ..."`;

export default function ImportPanel() {
    const [text, setText] = useState('');
    const t = useT();

    const result = parseK8sInput(text);

    return (
        <div className="px-4 py-8 max-w-6xl mx-auto">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">{t('import.title')}</h1>

                <div className="mt-1 mb-6 max-w-3xl">
                    <p className="text-sm text-secondary">
                        {t('import.intro1')} <code className="font-mono text-sm">Deployment</code>/<code className="font-mono text-sm">Pod</code>{' '}
                        {t('import.intro2')} <code className="font-mono text-sm">kubectl describe pod</code>{t('import.intro3')}{' '}
                        <code className="font-mono text-sm">JAVA_TOOL_OPTIONS</code> {t('import.intro4')}{' '}
                        <Link href="/flags" className="text-accent hover:underline">{t('import.flagsAuditLink')}</Link>{' '}
                        {t('import.and')}{' '}
                        <Link href="/" className="text-accent hover:underline">{t('import.calculatorLink')}</Link>.
                    </p>
                </div>

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={PLACEHOLDER}
                    rows={12}
                    className="w-full p-3 text-sm font-mono rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />

                {text.trim() !== '' && result === null && (
                    <div className="mt-4 p-4 rounded-lg border border-red-600/40 bg-red-500/5">
                        <p className="font-medium text-red-600 dark:text-red-400">{t('import.noneTitle')}</p>
                        <p className="text-sm text-secondary mt-1">
                            {t('import.expected1')} <code className="font-mono">memory:</code> {t('import.expected2')}{' '}
                            <code className="font-mono">limits:</code> {t('import.expected3')}{' '}
                            <code className="font-mono">JAVA_TOOL_OPTIONS</code>{t('import.expected4')}{' '}
                            <code className="font-mono">kubectl describe</code>.
                        </p>
                    </div>
                )}

                {result && (
                    <div className="mt-6 p-4 rounded-lg border bg-surface">
                        <h2 className="text-base font-medium">{t('import.recognized')}</h2>
                        <dl className="mt-2 text-sm space-y-1">
                            {result.containers.length > 0 && (
                                <div>
                                    <dt className="inline text-secondary">{t('import.containers')}</dt>
                                    <dd className="inline font-mono">{result.containers.join(', ')}</dd>
                                </div>
                            )}
                            <div>
                                <dt className="inline text-secondary">{t('import.memoryLimit')}</dt>
                                <dd className="inline font-mono">{result.limitMiB !== undefined ? `${result.limitMiB} Mi` : t('import.notFound')}</dd>
                            </div>
                            <div>
                                <dt className="inline text-secondary">{t('import.jvmFlags')}</dt>
                                <dd className="inline font-mono break-all">{result.flagsLine ?? t('import.notFound')}</dd>
                            </div>
                        </dl>
                        {result.containers.length > 1 && result.limitMiB !== undefined && (
                            <p className="mt-2 text-sm text-secondary">
                                {t('import.multiContainer')}
                            </p>
                        )}

                        <div className="mt-4 flex flex-wrap gap-3">
                            {result.flagsLine !== undefined && (
                                <Link
                                    href={{ pathname: '/flags', query: { line: result.flagsLine } }}
                                    className="inline-flex items-center h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                                >
                                    {t('import.auditBtn')}
                                </Link>
                            )}
                            {result.limitMiB !== undefined && (
                                <Link
                                    href={{ pathname: '/', query: { mode: 'container', limit: String(result.limitMiB) } }}
                                    className="inline-flex items-center h-9 px-4 rounded-md border text-sm font-medium hover:bg-surface transition-colors"
                                >
                                    {t('import.openCalcBtn')}
                                </Link>
                            )}
                        </div>
                        {result.flagsLine !== undefined && result.limitMiB !== undefined && (
                            <p className="mt-3 text-sm text-secondary">
                                {t('import.order', { limit: result.limitMiB })}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
