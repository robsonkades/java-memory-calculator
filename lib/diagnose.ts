import { parseGcLog, type GcLogReport } from './gclog';
import { parseHistogram, type HistogramReport } from './histogram';
import { javaHeapCommittedMiB, parseNmtSummary, type NmtReport } from './nmt';
import { parseSmaps, type SmapsResult } from './smaps';
import { parseThreadDump, type ThreadDumpReport } from './threaddump';

export interface DiagnoseTexts {
    nmt?: string;
    smaps?: string;
    threads?: string;
    histogram?: string;
    gclog?: string;
}

export interface DiagnoseParsed {
    nmt: NmtReport | null;
    smaps: SmapsResult | null;
    threads: ThreadDumpReport | null;
    histogram: HistogramReport | null;
    gclog: GcLogReport | null;
}

export type CrossFindingId = 'vm-threads' | 'stacks' | 'rss-gap' | 'heap-vs-live' | 'coh-savings' | 'off-peak';

export interface CrossFinding {
    id: CrossFindingId;
    severity: 'info' | 'advice' | 'warning';
    /** Numbers for the UI to interpolate into localized messages. */
    values: Record<string, number>;
}

export interface DiagnoseResult {
    parsed: DiagnoseParsed;
    findings: CrossFinding[];
    /** How many of the five sources parsed successfully. */
    sourceCount: number;
    /** ceil(max(NMT committed, measured RSS) × (1 + headroom)). */
    consolidatedLimitMiB?: number;
    calculatorQuery: Record<string, string>;
}

const toMiB = (kib: number) => kib / 1024;

/**
 * The case file: parses whatever jcmd outputs were pasted and cross-checks
 * them — the numbers no single analyzer can produce alone.
 */
export function diagnose(texts: DiagnoseTexts, headroomPercent: number): DiagnoseResult {
    const parsed: DiagnoseParsed = {
        nmt: texts.nmt ? parseNmtSummary(texts.nmt) : null,
        smaps: texts.smaps ? parseSmaps(texts.smaps) : null,
        threads: texts.threads ? parseThreadDump(texts.threads) : null,
        histogram: texts.histogram ? parseHistogram(texts.histogram) : null,
        gclog: texts.gclog ? parseGcLog(texts.gclog) : null,
    };
    const { nmt, smaps, threads, histogram, gclog } = parsed;
    const findings: CrossFinding[] = [];

    if (nmt?.threadCount !== undefined && threads) {
        findings.push({
            id: 'vm-threads',
            severity: 'info',
            values: {
                nmt: nmt.threadCount,
                dump: threads.totalThreads,
                delta: nmt.threadCount - threads.totalThreads,
            },
        });
    }

    const nmtThread = nmt?.categories.find((c) => c.name === 'Thread');
    if (threads && nmtThread) {
        findings.push({
            id: 'stacks',
            severity: 'info',
            values: {
                reserved: threads.stackReservedMiB,
                committed: Math.round(toMiB(nmtThread.committedKiB)),
            },
        });
    }

    const rssMiB = smaps === null ? undefined
        : smaps.kind === 'rollup' ? toMiB(smaps.rssKiB) : toMiB(smaps.totalRssKiB);
    if (nmt && rssMiB !== undefined) {
        const committedMiB = toMiB(nmt.totalCommittedKiB);
        const delta = Math.round(rssMiB - committedMiB);
        findings.push({
            id: 'rss-gap',
            severity: delta > committedMiB * 0.2 ? 'warning' : 'info',
            values: { rss: Math.round(rssMiB), committed: Math.round(committedMiB), delta },
        });
    }

    const heapMiB = nmt ? javaHeapCommittedMiB(nmt) : undefined;
    if (gclog && gclog.liveSetMiB > 0 && heapMiB !== undefined) {
        const recommended = gclog.recommendedHeapMiB;
        findings.push({
            id: 'heap-vs-live',
            severity: heapMiB > gclog.liveSetMiB * 4 || heapMiB < gclog.liveSetMiB * 1.5 ? 'advice' : 'info',
            values: { live: gclog.liveSetMiB, heap: heapMiB, recommended },
        });
    }

    if (histogram) {
        const savingsMiB = histogram.compactHeadersSavingsBytes / (1024 * 1024);
        findings.push({
            id: 'coh-savings',
            severity: 'info',
            values: {
                savings: Math.round(savingsMiB * 10) / 10,
                ...(heapMiB !== undefined && heapMiB > 0 && {
                    pct: Math.round((savingsMiB / heapMiB) * 1000) / 10,
                }),
            },
        });
    }

    const nmtHeap = nmt?.categories.find((c) => c.name === 'Java Heap');
    if (nmtHeap?.componentPeakKiB !== undefined && nmtHeap.componentPeakKiB > nmtHeap.committedKiB * 1.5) {
        findings.push({
            id: 'off-peak',
            severity: 'warning',
            values: {
                peak: Math.round(toMiB(nmtHeap.componentPeakKiB)),
                now: Math.round(toMiB(nmtHeap.committedKiB)),
            },
        });
    }

    let consolidatedLimitMiB: number | undefined;
    if (nmt || rssMiB !== undefined) {
        const base = Math.max(nmt ? toMiB(nmt.totalCommittedKiB) : 0, rssMiB ?? 0);
        consolidatedLimitMiB = Math.ceil(base * (1 + headroomPercent / 100));
    }

    const calculatorQuery: Record<string, string> = {};
    if (gclog && gclog.liveSetMiB > 0) calculatorQuery.heap = String(gclog.recommendedHeapMiB);
    else if (heapMiB !== undefined) calculatorQuery.heap = String(heapMiB);
    if (threads) calculatorQuery.threads = String(threads.totalThreads);
    if (nmt?.classCount !== undefined) calculatorQuery.classes = String(nmt.classCount);

    return {
        parsed,
        findings,
        sourceCount: Object.values(parsed).filter((p) => p !== null).length,
        ...(consolidatedLimitMiB !== undefined && { consolidatedLimitMiB }),
        calculatorQuery,
    };
}
