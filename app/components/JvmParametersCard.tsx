'use client'
import { useState } from 'react';
import {
    buildDockerComposeSnippet,
    buildEnvFileSnippet,
    buildJvmFlags,
    buildKubernetesSnippet,
    optionalFlagNotes,
    ramPercentageFor,
    type GcType,
    type MemoryInputs,
} from '@/lib/jvm-memory';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/en';
import TooltipLabel from './TooltipLabel';

const GC_FLAG_TOOLTIP_KEY: Record<GcType, TranslationKey> = {
    G1: 'params.gcTooltipG1',
    ZGC: 'params.gcTooltipZgc',
    Serial: 'params.gcTooltipSerial',
    Parallel: 'params.gcTooltipParallel',
};

type HeapStyle = 'percentage' | 'fixed';
type SnippetFormat = 'k8s' | 'compose' | 'env';

const FORMAT_LABEL_KEY: Record<SnippetFormat, TranslationKey> = {
    k8s: 'params.formatK8s',
    compose: 'params.formatCompose',
    env: 'params.formatEnv',
};

const FORMAT_TOOLTIP_KEY: Record<SnippetFormat, TranslationKey> = {
    k8s: 'params.formatTooltipK8s',
    compose: 'params.formatTooltipCompose',
    env: 'params.formatTooltipEnv',
};

export default function JvmParametersCard({ inputs, containerLimitMiB, extraFlags }: Readonly<{
    inputs: MemoryInputs;
    containerLimitMiB: number;
    extraFlags?: string[];
}>) {
    const [copied, setCopied] = useState<'flags' | 'k8s' | null>(null);
    const [heapStyle, setHeapStyle] = useState<HeapStyle>('percentage');
    const [format, setFormat] = useState<SnippetFormat>('k8s');
    const t = useT();

    const ramPercentage = ramPercentageFor(inputs.heapMiB, containerLimitMiB);
    const flagOptions = {
        ...(heapStyle === 'percentage' && { ramPercentage }),
        ...(extraFlags !== undefined && extraFlags.length > 0 && { extraFlags }),
    };
    const flagLine = buildJvmFlags(inputs, flagOptions);
    const deploymentSnippet = format === 'k8s'
        ? buildKubernetesSnippet(inputs, containerLimitMiB, flagOptions)
        : format === 'compose'
            ? buildDockerComposeSnippet(inputs, containerLimitMiB, flagOptions)
            : buildEnvFileSnippet(inputs, flagOptions);
    // Flags promoted into the copied line are no longer "not in the copied line".
    const notes = optionalFlagNotes(inputs).filter((note) => !(extraFlags ?? []).includes(note.flag));

    const heapFlagEntry = heapStyle === 'percentage'
        ? {
            flag: `-XX:InitialRAMPercentage=${ramPercentage}.0 -XX:MaxRAMPercentage=${ramPercentage}.0`,
            tooltip: t('params.percentTooltip', { limit: containerLimitMiB }),
        }
        : {
            flag: `-Xms${inputs.heapMiB}m -Xmx${inputs.heapMiB}m`,
            tooltip: t('params.fixedTooltip'),
        };

    const flags: Array<{ flag: string; tooltip: string }> = [
        {
            flag: flagLine.split(' ')[0],
            tooltip: t(GC_FLAG_TOOLTIP_KEY[inputs.gcType]),
        },
        heapFlagEntry,
        {
            flag: `-Xss${inputs.stackSizeMiB}m`,
            tooltip: t('params.xssTooltip'),
        },
        {
            flag: `-XX:ReservedCodeCacheSize=${inputs.codeCacheMiB}m`,
            tooltip: t('params.codeCacheTooltip'),
        },
        {
            flag: `-XX:MaxDirectMemorySize=${inputs.directMemoryMiB}m`,
            tooltip: t('params.directTooltip'),
        },
        {
            flag: '-XX:+ExitOnOutOfMemoryError',
            tooltip: t('params.exitTooltip'),
        },
    ];

    const copy = (what: 'flags' | 'k8s', text: string) => {
        navigator.clipboard.writeText(text)
            .then(() => {
                setCopied(what);
                setTimeout(() => setCopied(null), 3000);
            })
            .catch(err => {
                console.error('Failed to copy: ', err);
            });
    };

    const styleButton = (target: HeapStyle, label: string) => (
        <button
            onClick={() => setHeapStyle(target)}
            className={`px-3 py-1 text-sm rounded-md border transition-colors ${heapStyle === target
                ? 'bg-background font-medium'
                : 'border-transparent text-secondary hover:text-foreground'}`}
        >
            {label}
        </button>
    );

    return (
        <div className="rounded-lg border p-4 sm:p-6">
            <h2 className="text-base font-medium">{t('params.title', { version: inputs.javaVersion })}</h2>
            <p className="text-sm text-secondary mt-1">
                {t('params.subtitle')}
            </p>

            <div className="mt-3 flex items-center gap-2 text-sm">
                <TooltipLabel
                    text={<span className="font-medium">{t('params.heapSizing')}</span>}
                    tooltip={t('params.heapSizingTooltip')}
                />
                <div className="inline-flex rounded-lg border bg-surface p-0.5">
                    {styleButton('percentage', t('params.stylePercentage'))}
                    {styleButton('fixed', t('params.styleFixed'))}
                </div>
            </div>

            <ul className="mt-4 space-y-2">
                {flags.map(({ flag, tooltip }) => (
                    <li key={flag}>
                        <TooltipLabel
                            text={<span className="font-mono text-sm">{flag}</span>}
                            tooltip={tooltip}
                        />
                    </li>
                ))}
            </ul>
            <button
                onClick={() => copy('flags', flagLine)}
                className="mt-4 h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
                {t('params.copyFlags')}
            </button>

            <div className="mt-6 flex flex-wrap items-center gap-2">
                <h3 className="text-base font-medium">
                    <TooltipLabel
                        text={<span>{t('params.snippet')}</span>}
                        tooltip={t(FORMAT_TOOLTIP_KEY[format])}
                    />
                </h3>
                <div className="inline-flex rounded-lg border bg-surface p-0.5">
                    {(Object.keys(FORMAT_LABEL_KEY) as SnippetFormat[]).map((target) => (
                        <button
                            key={target}
                            onClick={() => setFormat(target)}
                            className={`px-3 py-1 text-sm rounded-md border transition-colors ${format === target
                                ? 'bg-background font-medium'
                                : 'border-transparent text-secondary hover:text-foreground'}`}
                        >
                            {t(FORMAT_LABEL_KEY[target])}
                        </button>
                    ))}
                </div>
            </div>
            <pre className="bg-surface border rounded-lg p-4 mt-2 overflow-x-auto text-sm font-mono">{deploymentSnippet}</pre>
            <button
                onClick={() => copy('k8s', deploymentSnippet)}
                className="mt-2 h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
                {t('params.copySnippet')}
            </button>

            {copied && (
                <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">
                    {copied === 'flags' ? t('params.copiedFlags') : t('params.copiedSnippet')}
                </div>
            )}

            <h3 className="text-base font-medium mt-6">{t('params.worthKnowing')}</h3>
            <ul className="mt-2 space-y-2">
                {notes.map(({ flag, note }) => (
                    <li key={flag}>
                        <TooltipLabel
                            text={<span className="font-mono text-sm">{flag}</span>}
                            tooltip={note}
                        />
                    </li>
                ))}
            </ul>
        </div>
    );
}
