'use client'
import {
    calculateMemory,
    solveHeapForContainer,
    type GcType,
    type MemoryInputs,
} from '@/lib/jvm-memory';
import { useT } from '@/lib/i18n';

const GC_LIST: GcType[] = ['G1', 'ZGC', 'Serial', 'Parallel'];

export default function GcComparison({ sharedInputs, mode, heapMiB, containerLimitMiB, onSelect }: Readonly<{
    sharedInputs: Omit<MemoryInputs, 'heapMiB'>;
    mode: 'heap' | 'container';
    heapMiB: number;
    containerLimitMiB: number;
    onSelect: (gc: GcType) => void;
}>) {
    const t = useT();
    const rows = GC_LIST.map((gc) => {
        const inputs = { ...sharedInputs, gcType: gc };
        if (mode === 'heap') {
            const breakdown = calculateMemory({ ...inputs, heapMiB });
            return {
                gc,
                gcStructures: `${breakdown.gcStructures} MiB`,
                result: `${breakdown.containerTotal} Mi`,
            };
        }
        const solved = solveHeapForContainer(containerLimitMiB, inputs);
        return {
            gc,
            gcStructures: solved ? `${solved.breakdown.gcStructures} MiB` : '—',
            result: solved ? `${solved.heapMiB} MiB` : '—',
        };
    });

    return (
        <div className="rounded-lg border p-4">
            <h2 className="text-base font-medium mb-1">{t('comp.title')}</h2>
            <p className="text-sm text-secondary mb-3">
                {t('comp.desc')}
            </p>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-secondary border-b">
                            <th className="py-2 pr-4 font-medium">{t('comp.collector')}</th>
                            <th className="py-2 pr-4 text-right font-medium">{t('comp.gcStructures')}</th>
                            <th className="py-2 text-right font-medium">
                                {mode === 'heap' ? t('comp.containerLimit') : t('comp.maxHeap')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ gc, gcStructures, result }) => (
                            <tr
                                key={gc}
                                onClick={() => onSelect(gc)}
                                className={`cursor-pointer border-b last:border-b-0 hover:bg-surface transition-colors ${
                                    gc === sharedInputs.gcType ? 'font-medium' : ''}`}
                            >
                                <td className="py-2 pr-4">
                                    {gc}{gc === sharedInputs.gcType ? ` ${t('comp.selected')}` : ''}
                                </td>
                                <td className="py-2 pr-4 text-right font-mono">{gcStructures}</td>
                                <td className="py-2 text-right font-mono">{result}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
