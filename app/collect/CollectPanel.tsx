'use client'
import { useState } from 'react';
import { buildCollectScript, collectFiles, type CollectOptions } from '@/lib/collect';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/en';

const OPTION_DEFS: Array<{ key: keyof CollectOptions; labelKey: TranslationKey; noteKey: TranslationKey }> = [
    { key: 'nmt', labelKey: 'collect.opt.nmt', noteKey: 'collect.opt.nmtNote' },
    { key: 'histogram', labelKey: 'collect.opt.histogram', noteKey: 'collect.opt.histogramNote' },
    { key: 'threadDump', labelKey: 'collect.opt.threads', noteKey: 'collect.opt.threadsNote' },
    { key: 'smaps', labelKey: 'collect.opt.smaps', noteKey: 'collect.opt.smapsNote' },
    { key: 'gcLogHint', labelKey: 'collect.opt.gclog', noteKey: 'collect.opt.gclogNote' },
];

export default function CollectPanel() {
    const [options, setOptions] = useState<CollectOptions>({
        nmt: true,
        histogram: true,
        threadDump: true,
        smaps: true,
        gcLogHint: true,
    });
    const [copied, setCopied] = useState(false);
    const t = useT();

    const script = buildCollectScript(options);
    const files = collectFiles(options);

    const copyScript = () => {
        navigator.clipboard.writeText(script)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 3000);
            })
            .catch(err => {
                console.error('Failed to copy script: ', err);
            });
    };

    return (
        <div className="px-4 py-8 max-w-6xl mx-auto">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">{t('collect.title')}</h1>

                <div className="mt-1 mb-6 max-w-3xl">
                    <p className="text-sm text-secondary">
                        {t('collect.intro1')}{' '}
                        (<code className="font-mono text-sm">kubectl exec -it &lt;pod&gt; -- sh</code>{t('collect.intro2')}
                    </p>
                </div>

                <div className="space-y-2 mb-4">
                    {OPTION_DEFS.map(({ key, labelKey, noteKey }) => (
                        <label key={key} className="flex items-start gap-2 text-sm cursor-pointer">
                            <input
                                type="checkbox"
                                className="accent-foreground mt-0.5"
                                checked={options[key]}
                                onChange={(e) => setOptions({ ...options, [key]: e.target.checked })}
                            />
                            <span>
                                <span className="font-medium">{t(labelKey)}</span>
                                <span className="text-secondary"> — {t(noteKey)}</span>
                            </span>
                        </label>
                    ))}
                </div>

                <pre className="bg-surface border rounded-lg p-4 overflow-x-auto text-sm font-mono">{script}</pre>
                <button
                    onClick={copyScript}
                    className="mt-2 h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                >
                    {t('collect.copyBtn')}
                </button>
                {copied && (
                    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">
                        {t('collect.copied')}
                    </div>
                )}

                {files.length > 0 && (
                    <p className="mt-4 text-sm text-secondary">
                        {t('collect.produces1')}{' '}
                        {files.map((f, i) => (
                            <span key={f.file}>
                                {i > 0 && ', '}
                                <code className="font-mono">{f.file}</code>
                            </span>
                        ))}
                        {' '}{t('collect.produces2')} <code className="font-mono">jvm-diagnostics.tgz</code>.
                    </p>
                )}
            </div>
        </div>
    );
}
