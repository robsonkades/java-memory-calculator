'use client'
import { useSearchParams } from 'next/navigation';
import {
    calculateMemory,
    solveHeapForContainer,
    type GcType,
    type JavaVersion,
    type MemoryInputs,
} from '@/lib/jvm-memory';
import { useT } from '@/lib/i18n';

export default function EmbedCard() {
    const searchParams = useSearchParams();
    const t = useT();
    const intParam = (key: string, fallback: number) => {
        const raw = searchParams.get(key);
        if (raw === null) return fallback;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
    };

    const mode = searchParams.get('mode') === 'container' ? 'container' : 'heap';
    const gcRaw = searchParams.get('gc');
    const shared: Omit<MemoryInputs, 'heapMiB'> = {
        javaVersion: searchParams.get('v') === '21' ? 21 : 25 as JavaVersion,
        gcType: gcRaw === 'ZGC' || gcRaw === 'Serial' || gcRaw === 'Parallel' ? gcRaw as GcType : 'G1',
        threads: intParam('threads', 85),
        classes: intParam('classes', 30000),
        stackSizeMiB: intParam('xss', 1),
        codeCacheMiB: intParam('cc', 64),
        directMemoryMiB: intParam('dm', 10),
        headroomPercent: intParam('hr', 15),
    };
    const containerLimit = intParam('limit', 1024);
    const heapSize = intParam('heap', 384);

    const solved = mode === 'container' ? solveHeapForContainer(containerLimit, shared) : null;
    const memory = mode === 'container'
        ? solved?.breakdown ?? null
        : calculateMemory({ ...shared, heapMiB: heapSize });

    return (
        <div className="p-4 max-w-md mx-auto">
            <div className="rounded-lg border bg-surface p-4">
                {memory === null ? (
                    <div className="font-medium text-sm text-red-600 dark:text-red-400">
                        {t('embed.tooSmall', { limit: containerLimit })}
                    </div>
                ) : mode === 'container' ? (
                    <>
                        <div className="text-sm text-secondary">{t('embed.recommendedHeap')}</div>
                        <div className="text-lg font-semibold tracking-tight font-mono">{memory.heap} MiB</div>
                        <div className="text-sm text-secondary">
                            {t('embed.fits', { total: memory.containerTotal, limit: containerLimit })}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="text-sm text-secondary">{t('embed.containerLimit')}</div>
                        <div className="text-lg font-semibold tracking-tight font-mono">{memory.containerTotal} Mi</div>
                        <div className="text-sm text-secondary">
                            {t('embed.heapLine', { heap: memory.heap, gc: shared.gcType, v: shared.javaVersion })}
                        </div>
                    </>
                )}
                {memory !== null && (
                    <div className="text-sm text-secondary">
                        {t('embed.subtotal', { subtotal: memory.subtotal, headroom: memory.headroom, hr: shared.headroomPercent })}
                    </div>
                )}
                <a
                    href={`/?${searchParams.toString()}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-block mt-2 text-sm text-accent hover:underline"
                >
                    {t('embed.computedWith')}
                </a>
            </div>
        </div>
    );
}
