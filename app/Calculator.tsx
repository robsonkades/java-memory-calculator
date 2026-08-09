'use client'
import { useEffect, useState } from "react";
import { useSearchParams } from 'next/navigation';
import {
    calculateMemory,
    gcThreadsFor,
    generationInfo,
    jitThreadsFor,
    solveHeapForContainer,
    GC_STRUCTURES_PERCENT,
    type GcType,
    type JavaVersion,
    type MemoryInputs,
} from '@/lib/jvm-memory';
import {
    containerTotalFromQuery,
    diffScenarios,
    exportScenarios,
    importScenarios,
    parseScenarios,
    removeScenario,
    serializeScenarios,
    upsertScenario,
    type Scenario,
} from '@/lib/scenarios';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/en';
import TooltipLabel from './components/TooltipLabel';
import JvmParametersCard from './components/JvmParametersCard';
import GcComparison from './components/GcComparison';
import CompositionBar from './components/CompositionBar';

const MIB_PER_MB = 1.048576;
const SCENARIOS_STORAGE_KEY = 'jvm-expert-scenarios';

type Mode = 'heap' | 'container';

// Starting points for the two inputs nobody knows by heart. Rough by design —
// the NMT Analyzer is the way to replace them with measured numbers.
interface WorkloadPreset {
    labelKey: TranslationKey;
    threads: number;
    classes: number;
    /** Direct memory suggestion (MiB) for frameworks that lean on NIO buffers. */
    dm?: number;
}
const WORKLOAD_PRESETS: Record<string, WorkloadPreset> = {
    'spring-mvc': { labelKey: 'preset.springMvc', threads: 250, classes: 35000 },
    'spring-webflux': { labelKey: 'preset.webflux', threads: 40, classes: 30000 },
    'worker': { labelKey: 'preset.worker', threads: 30, classes: 20000 },
    'small-cli': { labelKey: 'preset.smallCli', threads: 20, classes: 8000 },
    'netty-api': { labelKey: 'preset.nettyApi', threads: 60, classes: 28000, dm: 256 },
    'kafka-worker': { labelKey: 'preset.kafkaWorker', threads: 40, classes: 25000, dm: 128 },
};
type PresetKey = keyof typeof WORKLOAD_PRESETS;

const inputClass = "w-full h-9 px-3 text-sm rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";
const labelClass = "block text-sm font-medium mb-1.5";

const NumberField = ({ label, value, onChange }: Readonly<{
    label: string;
    value: number;
    onChange: (value: number) => void;
}>) => (
    <div>
        <label className={labelClass}>{label}</label>
        <input
            type="number"
            value={value}
            onChange={(e) => onChange(Number(e.target.value) || 0)}
            className={inputClass}
        />
    </div>
);

export default function Calculator() {
    const searchParams = useSearchParams();
    const t = useT();
    const intParam = (key: string, fallback: number) => {
        const raw = searchParams.get(key);
        if (raw === null) return fallback;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
    };

    const [mode, setMode] = useState<Mode>(() => (searchParams.get('mode') === 'container' ? 'container' : 'heap'));
    const [javaVersion, setJavaVersion] = useState<JavaVersion>(() => (searchParams.get('v') === '21' ? 21 : 25));
    const [gcType, setGCType] = useState<GcType>(() => {
        const gc = searchParams.get('gc');
        return gc === 'ZGC' || gc === 'Serial' || gc === 'Parallel' ? gc : 'G1';
    });
    const [heapSize, setHeapSize] = useState(() => intParam('heap', 384));
    const [containerLimit, setContainerLimit] = useState(() => intParam('limit', 1024));
    const [threads, setThreads] = useState(() => intParam('threads', 85));
    const [classes, setClasses] = useState(() => intParam('classes', 30000));
    const [stackSizePerThread, setStackSizePerThread] = useState(() => intParam('xss', 1));
    const [codeCache, setCodeCache] = useState(() => intParam('cc', 64));
    const [maxDirectMemorySize, setMaxDirectMemorySize] = useState(() => intParam('dm', 10));
    const [headroomPercent, setHeadroomPercent] = useState(() => intParam('hr', 15));
    const [compactHeaders, setCompactHeaders] = useState(() => searchParams.get('coh') === '1');
    const [virtualThreads, setVirtualThreads] = useState(() => searchParams.get('vt') === '1');
    const [cpuCores, setCpuCores] = useState(() => intParam('cpu', 0));
    const [preset, setPreset] = useState<'custom' | PresetKey>('custom');
    const [linkCopied, setLinkCopied] = useState(false);
    const [scenarios, setScenarios] = useState<Scenario[]>(() =>
        typeof window === 'undefined' ? [] : parseScenarios(window.localStorage.getItem(SCENARIOS_STORAGE_KEY)));
    const [scenarioName, setScenarioName] = useState('');
    const [compare, setCompare] = useState<string[]>([]);
    const [ioMessage, setIoMessage] = useState<string | null>(null);

    const params = new URLSearchParams({
        mode,
        v: String(javaVersion),
        gc: gcType,
        heap: String(heapSize),
        limit: String(containerLimit),
        threads: String(threads),
        classes: String(classes),
        xss: String(stackSizePerThread),
        cc: String(codeCache),
        dm: String(maxDirectMemorySize),
        hr: String(headroomPercent),
    });
    if (compactHeaders) params.set('coh', '1');
    if (virtualThreads) params.set('vt', '1');
    if (cpuCores > 0) params.set('cpu', String(cpuCores));
    const query = params.toString();

    useEffect(() => {
        window.history.replaceState(null, '', `?${query}`);
    }, [query]);

    const copyLink = () => {
        navigator.clipboard.writeText(window.location.href)
            .then(() => {
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 3000);
            })
            .catch(err => {
                console.error('Failed to copy link: ', err);
            });
    };

    const persistScenarios = (next: Scenario[]) => {
        setScenarios(next);
        window.localStorage.setItem(SCENARIOS_STORAGE_KEY, serializeScenarios(next));
    };
    const saveScenario = () => {
        const name = scenarioName.trim();
        if (name === '') return;
        persistScenarios(upsertScenario(scenarios, name, query));
        setScenarioName('');
    };
    const deleteScenario = (name: string) => {
        persistScenarios(removeScenario(scenarios, name));
        setCompare((prev) => prev.filter((n) => n !== name));
    };
    const flashIoMessage = (message: string) => {
        setIoMessage(message);
        setTimeout(() => setIoMessage(null), 4000);
    };
    const exportScenariosFile = () => {
        const url = URL.createObjectURL(new Blob([exportScenarios(scenarios)], { type: 'application/json' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'jvm-expert-scenarios.json';
        anchor.click();
        URL.revokeObjectURL(url);
    };
    const importScenariosFile = (file: File) => {
        file.text().then((text) => {
            const imported = importScenarios(text);
            if (imported === null) {
                flashIoMessage(t('scen.notFile'));
                return;
            }
            let next = scenarios;
            for (const s of imported) next = upsertScenario(next, s.name, s.query, s.savedAt);
            persistScenarios(next);
            flashIoMessage(imported.length === 1
                ? t('scen.importedOne')
                : t('scen.importedMany', { count: imported.length }));
        });
    };
    const toggleCompare = (name: string) => {
        setCompare((prev) => prev.includes(name)
            ? prev.filter((n) => n !== name)
            : prev.length < 2 ? [...prev, name] : prev);
    };
    const compareA = scenarios.find((s) => s.name === compare[0]);
    const compareB = scenarios.find((s) => s.name === compare[1]);

    const sharedInputs: Omit<MemoryInputs, 'heapMiB'> = {
        javaVersion,
        gcType,
        threads,
        stackSizeMiB: stackSizePerThread,
        classes,
        codeCacheMiB: codeCache,
        directMemoryMiB: maxDirectMemorySize,
        headroomPercent,
    };
    const solved = mode === 'container' ? solveHeapForContainer(containerLimit, sharedInputs) : null;
    const inputs: MemoryInputs = {
        ...sharedInputs,
        heapMiB: mode === 'heap' ? heapSize : solved?.heapMiB ?? 0,
    };
    const memory = mode === 'heap' ? calculateMemory(inputs) : solved?.breakdown ?? null;
    const generations = generationInfo(inputs);
    const effectiveCompactHeaders = compactHeaders && javaVersion === 25;
    const extraFlags = effectiveCompactHeaders ? ['-XX:+UseCompactObjectHeaders'] : undefined;

    const segments = memory ? [
        { label: t('seg.heap'), value: memory.heap },
        { label: t('seg.metaspace'), value: memory.metaspace },
        { label: t('seg.codeCache'), value: memory.codeCache },
        { label: t('seg.threadStacks'), value: memory.threadStacks },
        { label: t('seg.directMemory'), value: memory.directMemory },
        { label: t('seg.gcStructures'), value: memory.gcStructures },
        { label: t('seg.jvmInternals'), value: memory.jvmInternals },
        { label: t('seg.headroom'), value: memory.headroom },
    ] : null;

    const modeButton = (target: Mode, label: string) => (
        <button
            onClick={() => setMode(target)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${mode === target
                ? 'bg-background font-medium'
                : 'border-transparent text-secondary hover:text-foreground'}`}
        >
            {label}
        </button>
    );

    return (
        <div className="px-4 py-8 max-w-6xl mx-auto">
            <h1 className="text-2xl font-semibold tracking-tight">{t('calc.title')}</h1>
            <p className="mt-1 text-sm text-secondary max-w-2xl">
                {t('calc.intro')}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-lg border bg-surface p-0.5">
                    {modeButton('heap', t('calc.modeHeap'))}
                    {modeButton('container', t('calc.modeContainer'))}
                </div>
                <button
                    onClick={copyLink}
                    className="h-9 px-4 rounded-md border text-sm font-medium hover:bg-surface transition-colors"
                    title={t('calc.copyLinkTitle')}
                >
                    {t('calc.copyLink')}
                </button>
                {linkCopied && (
                    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">
                        {t('calc.linkCopied')}
                    </div>
                )}
            </div>

            <div className="mt-4 space-y-4">
                <div className="rounded-lg border p-4 sm:p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>{t('calc.javaVersion')}</label>
                            <select
                                value={javaVersion}
                                onChange={(e) => setJavaVersion(Number(e.target.value) as JavaVersion)}
                                className={inputClass}
                            >
                                <option value={25}>{t('calc.java25')}</option>
                                <option value={21}>{t('calc.java21')}</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>{t('calc.gcLabel')}</label>
                            <select
                                value={gcType}
                                onChange={(e) => setGCType(e.target.value as GcType)}
                                className={inputClass}
                            >
                                <option value="G1">{t('calc.gcG1')}</option>
                                <option value="ZGC">{t('calc.gcZgc')}</option>
                                <option value="Serial">{t('calc.gcSerial')}</option>
                                <option value="Parallel">{t('calc.gcParallel')}</option>
                            </select>
                        </div>
                        {mode === 'heap'
                            ? <NumberField label={t('calc.desiredHeap')} value={heapSize} onChange={setHeapSize} />
                            : <NumberField label={t('calc.containerLimit')} value={containerLimit} onChange={setContainerLimit} />}
                        <div>
                            <label className={labelClass}>
                                <TooltipLabel
                                    text={<span>{t('calc.preset')}</span>}
                                    tooltip={t('calc.presetTooltip')}
                                />
                            </label>
                            <select
                                value={preset}
                                onChange={(e) => {
                                    const key = e.target.value as 'custom' | PresetKey;
                                    setPreset(key);
                                    if (key !== 'custom') {
                                        const p = WORKLOAD_PRESETS[key];
                                        setThreads(p.threads);
                                        setClasses(p.classes);
                                        if (p.dm !== undefined) setMaxDirectMemorySize(p.dm);
                                    }
                                }}
                                className={inputClass}
                            >
                                <option value="custom">{t('calc.presetCustom')}</option>
                                {Object.entries(WORKLOAD_PRESETS).map(([key, p]) => (
                                    <option key={key} value={key}>
                                        {t('calc.presetOption', {
                                            label: t(p.labelKey),
                                            threads: p.threads,
                                            classes: p.classes,
                                            direct: p.dm !== undefined ? t('calc.presetDirectSuffix', { dm: p.dm }) : '',
                                        })}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <NumberField
                            label={virtualThreads ? t('calc.threadsVt') : t('calc.threads')}
                            value={threads}
                            onChange={(v) => { setThreads(v); setPreset('custom'); }}
                        />
                        <NumberField label={t('calc.classes')} value={classes} onChange={(v) => { setClasses(v); setPreset('custom'); }} />
                        <NumberField label={t('calc.codeCache')} value={codeCache} onChange={setCodeCache} />
                        <NumberField label={t('calc.directMemory')} value={maxDirectMemorySize} onChange={(v) => { setMaxDirectMemorySize(v); setPreset('custom'); }} />
                        <NumberField label={t('calc.stackSize')} value={stackSizePerThread} onChange={setStackSizePerThread} />
                        <NumberField label={t('calc.headroom')} value={headroomPercent} onChange={setHeadroomPercent} />
                        <div className="sm:col-span-2 flex flex-col gap-2 pt-1">
                            {javaVersion === 25 && (
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        className="accent-foreground"
                                        checked={compactHeaders}
                                        onChange={(e) => setCompactHeaders(e.target.checked)}
                                    />
                                    <TooltipLabel
                                        text={<span>{t('calc.cohLabel')}</span>}
                                        tooltip={t('calc.cohTooltip')}
                                    />
                                </label>
                            )}
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    className="accent-foreground"
                                    checked={virtualThreads}
                                    onChange={(e) => setVirtualThreads(e.target.checked)}
                                />
                                <TooltipLabel
                                    text={<span>{t('calc.vtLabel')}</span>}
                                    tooltip={t('calc.vtTooltip')}
                                />
                            </label>
                        </div>
                    </div>
                </div>

                {virtualThreads && (
                    <div className="rounded-lg border p-4 text-sm text-secondary">
                        <span className="font-medium text-foreground">{t('calc.vtBannerTitle')}</span> {t('calc.vtBannerBody')}
                    </div>
                )}

                {memory === null && (
                    <div className="rounded-lg border border-red-600/40 bg-red-500/5 p-4">
                        <p className="font-medium text-red-600 dark:text-red-400">{t('calc.tooSmallTitle')}</p>
                        <p className="text-sm text-secondary mt-1">
                            {t('calc.tooSmallBody', { limit: containerLimit })}
                        </p>
                    </div>
                )}

                {memory && segments && (
                    <>
                        <div className="rounded-lg border bg-surface p-4 sm:p-6">
                            {mode === 'heap' ? (
                                <>
                                    <div className="text-sm text-secondary">{t('calc.recommendedLimit')}</div>
                                    <div className="mt-1 text-2xl font-semibold tracking-tight font-mono">{memory.containerTotal} Mi</div>
                                    <div className="mt-1 text-sm text-secondary">
                                        {t('calc.mbNote', { mb: Math.round(memory.containerTotal * MIB_PER_MB) })}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-sm text-secondary">{t('calc.recommendedHeap')}</div>
                                    <div className="mt-1 text-2xl font-semibold tracking-tight font-mono">{memory.heap} MiB <span className="text-base text-secondary">(-Xmx{memory.heap}m)</span></div>
                                    <div className="mt-1 text-sm text-secondary">
                                        {t('calc.largestHeap', { total: memory.containerTotal, limit: containerLimit })}
                                    </div>
                                </>
                            )}
                            <div className="text-sm text-secondary mt-1">
                                <TooltipLabel
                                    text={<span>{t('calc.subtotal', { subtotal: memory.subtotal, headroom: memory.headroom, percent: headroomPercent })}</span>}
                                    tooltip={t('calc.subtotalTooltip')}
                                />
                            </div>
                            {effectiveCompactHeaders && (
                                <div className="text-sm text-secondary mt-1">
                                    <TooltipLabel
                                        text={<span>{t('calc.cohOn')}</span>}
                                        tooltip={t('calc.cohOnTooltip')}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="rounded-lg border p-4 sm:p-6">
                            <div className="flex items-baseline justify-between gap-4 mb-4">
                                <h2 className="text-base font-medium">{t('calc.distribution')}</h2>
                                <span className="font-mono text-sm text-secondary">{t('calc.totalSuffix', { total: memory.containerTotal })}</span>
                            </div>
                            <CompositionBar segments={segments} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="rounded-lg border p-4">
                                <h2 className="text-sm font-medium text-secondary">{t('calc.heapCard')}</h2>
                                <div className="mt-1 mb-2 text-xl font-semibold tracking-tight font-mono">{memory.heap} MiB</div>
                                {generations.kind === 'fixed' ? (
                                    <div className="text-sm space-y-1">
                                        <div>{t('calc.young')} <span className="font-mono">{generations.youngMiB} MiB</span></div>
                                        <div>{t('calc.old')} <span className="font-mono">{generations.oldMiB} MiB</span></div>
                                        <div className="text-secondary mt-2">{generations.description}</div>
                                    </div>
                                ) : (
                                    <div className="text-sm text-secondary">{generations.description}</div>
                                )}
                            </div>

                            <div className="rounded-lg border p-4">
                                <h2 className="text-sm font-medium text-secondary">{t('calc.nonHeap')}</h2>
                                <div className="mt-1 mb-2 text-xl font-semibold tracking-tight font-mono">{memory.metaspace + memory.codeCache + memory.threadStacks} MiB</div>
                                <div className="text-sm space-y-1">
                                    <div>
                                        <TooltipLabel
                                            text={<span>{t('calc.metaspaceLabel')} <span className="font-mono">{memory.metaspace} MiB</span></span>}
                                            tooltip={t('calc.metaspaceTooltip')}
                                        />
                                    </div>
                                    <div className="text-secondary ml-4">
                                        <TooltipLabel
                                            text={<span>{t('calc.ccsLabel')} <span className="font-mono">{memory.compressedClassSpace} MiB</span></span>}
                                            tooltip={t('calc.ccsTooltip')}
                                        />
                                    </div>
                                    <div>{t('calc.codeCacheLabel')} <span className="font-mono">{memory.codeCache} MiB</span></div>
                                    <div>
                                        <TooltipLabel
                                            text={<span>{t('calc.threadStacksLabel')} <span className="font-mono">{memory.threadStacks} MiB</span> {t('calc.upperBound')}</span>}
                                            tooltip={t('calc.threadStacksTooltip')}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-lg border p-4">
                                <h2 className="text-sm font-medium text-secondary">{t('calc.nativeOther')}</h2>
                                <div className="mt-1 mb-2 text-xl font-semibold tracking-tight font-mono">{memory.directMemory + memory.gcStructures + memory.jvmInternals} MiB</div>
                                <div className="text-sm space-y-1">
                                    <div>{t('calc.directBuffers')} <span className="font-mono">{memory.directMemory} MiB</span></div>
                                    <div>
                                        <TooltipLabel
                                            text={<span>{t('calc.gcStructuresLabel')} <span className="font-mono">{memory.gcStructures} MiB</span></span>}
                                            tooltip={t('calc.gcStructuresTooltip', { pct: GC_STRUCTURES_PERCENT[gcType], gc: gcType })}
                                        />
                                    </div>
                                    <div>
                                        <TooltipLabel
                                            text={<span>{t('calc.jvmInternalsLabel')} <span className="font-mono">{memory.jvmInternals} MiB</span></span>}
                                            tooltip={t('calc.jvmInternalsTooltip')}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg border p-4">
                            <h2 className="text-base font-medium mb-1">{t('cpu.title')}</h2>
                            <div className="flex items-center gap-2 text-sm">
                                <label className="font-medium">{t('cpu.limit')}</label>
                                <input
                                    type="number"
                                    value={cpuCores || ''}
                                    onChange={(e) => setCpuCores(Number(e.target.value) || 0)}
                                    className="w-24 h-8 px-2 text-sm rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                                />
                                <span className="text-secondary">{t('cpu.skip')}</span>
                            </div>
                            {cpuCores > 0 && (
                                <div className="mt-3 text-sm space-y-1">
                                    <div>
                                        <TooltipLabel
                                            text={<span>{t('cpu.gcWorkers', { gc: gcType, n: gcThreadsFor(gcType, cpuCores) })}</span>}
                                            tooltip={gcType === 'Serial'
                                                ? t('cpu.gcTooltipSerial')
                                                : t('cpu.gcTooltipErgo') + (gcType === 'ZGC' ? ' ' + t('cpu.gcTooltipZgcSuffix') : '')}
                                        />
                                    </div>
                                    <div>
                                        <TooltipLabel
                                            text={<span>{t('cpu.jitThreads', { n: jitThreadsFor(cpuCores) })}</span>}
                                            tooltip={t('cpu.jitTooltip')}
                                        />
                                    </div>
                                    <div className="text-secondary">
                                        <TooltipLabel
                                            text={<span>{t('cpu.warmup', { cores: cpuCores })}</span>}
                                            tooltip={t('cpu.warmupTooltip')}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <GcComparison
                            sharedInputs={sharedInputs}
                            mode={mode}
                            heapMiB={heapSize}
                            containerLimitMiB={containerLimit}
                            onSelect={setGCType}
                        />

                        <JvmParametersCard
                            inputs={inputs}
                            containerLimitMiB={mode === 'heap' ? memory.containerTotal : containerLimit}
                            extraFlags={extraFlags}
                        />
                    </>
                )}

                <div className="rounded-lg border p-4">
                    <h2 className="text-base font-medium mb-1">
                        <TooltipLabel
                            text={<span>{t('scen.title')}</span>}
                            tooltip={t('scen.tooltip')}
                        />
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 text-sm mt-2">
                        <input
                            type="text"
                            value={scenarioName}
                            onChange={(e) => setScenarioName(e.target.value)}
                            placeholder={t('scen.placeholder')}
                            className="h-9 px-3 text-sm rounded-md border bg-background focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                        />
                        <button
                            onClick={saveScenario}
                            className="h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                        >
                            {t('scen.save')}
                        </button>
                        {scenarios.length > 0 && (
                            <button
                                onClick={exportScenariosFile}
                                className="h-9 px-4 rounded-md border text-sm font-medium hover:bg-surface transition-colors"
                            >
                                {t('scen.export')}
                            </button>
                        )}
                        <label className="h-9 px-4 rounded-md border text-sm font-medium hover:bg-surface transition-colors inline-flex items-center cursor-pointer">
                            {t('scen.import')}
                            <input
                                type="file"
                                accept="application/json,.json"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) importScenariosFile(file);
                                    e.target.value = '';
                                }}
                            />
                        </label>
                        {ioMessage && <span className="text-secondary">{ioMessage}</span>}
                    </div>
                    {scenarios.length > 0 && (
                        <ul className="mt-3 space-y-1 text-sm">
                            {[...scenarios].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                                <li key={s.name} className="flex flex-wrap items-center gap-3 py-1.5 border-b last:border-b-0">
                                    <label className="flex items-center gap-1.5 text-secondary">
                                        <input
                                            type="checkbox"
                                            className="accent-foreground"
                                            checked={compare.includes(s.name)}
                                            onChange={() => toggleCompare(s.name)}
                                        />
                                        {t('scen.compare')}
                                    </label>
                                    <span className="font-medium">{s.name}</span>
                                    <span className="font-mono text-secondary">
                                        {containerTotalFromQuery(s.query) ?? '—'} Mi
                                    </span>
                                    <a href={`/?${s.query}`} className="text-accent hover:underline">{t('scen.load')}</a>
                                    <button
                                        onClick={() => deleteScenario(s.name)}
                                        className="text-red-600 dark:text-red-400 hover:underline"
                                    >
                                        {t('scen.delete')}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {compareA && compareB && (
                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wide text-secondary border-b">
                                        <th className="py-2 pr-4 font-medium">{t('scen.inputHeader')}</th>
                                        <th className="py-2 pr-4 font-medium">{compareA.name}</th>
                                        <th className="py-2 font-medium">{compareB.name}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {diffScenarios(compareA, compareB).map((row) => (
                                        <tr key={row.key} className="border-b">
                                            <td className="py-2 pr-4">{row.label}</td>
                                            <td className="py-2 pr-4 font-mono">{row.a}</td>
                                            <td className="py-2 font-mono">{row.b}</td>
                                        </tr>
                                    ))}
                                    <tr className="font-medium">
                                        <td className="py-2 pr-4">{t('scen.containerTotal')}</td>
                                        <td className="py-2 pr-4 font-mono">{containerTotalFromQuery(compareA.query) ?? '—'}</td>
                                        <td className="py-2 font-mono">{containerTotalFromQuery(compareB.query) ?? '—'}</td>
                                    </tr>
                                </tbody>
                            </table>
                            {diffScenarios(compareA, compareB).length === 0 && (
                                <p className="text-sm text-secondary mt-2">{t('scen.identical')}</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
