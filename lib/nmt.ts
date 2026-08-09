export interface NmtCategory {
    name: string;
    reservedKiB: number;
    committedKiB: number;
    /** Present only in `summary.diff` output: change since the baseline. */
    reservedDiffKiB?: number;
    committedDiffKiB?: number;
    /**
     * Highest `peak=NKB` among the category's component detail lines
     * (mmap/stack/malloc/arena). A peak far above the current committed
     * value means the snapshot was taken off-peak.
     */
    componentPeakKiB?: number;
}

export interface NmtReport {
    totalReservedKiB: number;
    totalCommittedKiB: number;
    /** Present only when the pasted text is a `summary.diff`. */
    totalCommittedDiffKiB?: number;
    /** True when the text is a `summary.diff` against a baseline. */
    hasDiff: boolean;
    /** Categories in the order they appear in the summary. */
    categories: NmtCategory[];
    /** From the Thread detail line "(thread #N)", when present. */
    threadCount?: number;
    /** From the Class detail line "(classes #N)", when present. */
    classCount?: number;
}

// The trailing [^)]* tolerates extra fields after committed — JDK 25 emits
// e.g. "Shared class space (reserved=..., committed=..., readonly=0KB)".
const CATEGORY_LINE = /^-\s+(.+?)\s+\(reserved=(\d+)KB(?:\s+([+-]\d+)KB)?,\s*committed=(\d+)KB(?:\s+([+-]\d+)KB)?[^)\n]*\)/gm;
const TOTAL_LINE = /^Total:\s*reserved=(\d+)KB(?:\s+([+-]\d+)KB)?,\s*committed=(\d+)KB(?:\s+([+-]\d+)KB)?/m;

/**
 * Parses the output of `jcmd <pid> VM.native_memory summary` or
 * `summary.diff` (JDK 17+ format). Returns null when the text contains
 * no NMT summary.
 */
export function parseNmtSummary(text: string): NmtReport | null {
    const categories: NmtCategory[] = [];
    const matches = [...text.matchAll(CATEGORY_LINE)];
    matches.forEach((match, i) => {
        // The category's detail lines run until the next category (or the end).
        const blockEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
        const block = text.slice(match.index + match[0].length, blockEnd);
        let componentPeakKiB: number | undefined;
        for (const peak of block.matchAll(/peak=(\d+)KB/g)) {
            const value = Number(peak[1]);
            if (componentPeakKiB === undefined || value > componentPeakKiB) componentPeakKiB = value;
        }
        categories.push({
            name: match[1],
            reservedKiB: Number(match[2]),
            committedKiB: Number(match[4]),
            ...(match[3] !== undefined && { reservedDiffKiB: Number(match[3]) }),
            ...(match[5] !== undefined && { committedDiffKiB: Number(match[5]) }),
            ...(componentPeakKiB !== undefined && { componentPeakKiB }),
        });
    });
    if (categories.length === 0) return null;

    const total = TOTAL_LINE.exec(text);
    const totalReservedKiB = total
        ? Number(total[1])
        : categories.reduce((sum, c) => sum + c.reservedKiB, 0);
    const totalCommittedKiB = total
        ? Number(total[3])
        : categories.reduce((sum, c) => sum + c.committedKiB, 0);
    const totalCommittedDiffKiB = total?.[4] !== undefined ? Number(total[4]) : undefined;

    const hasDiff = totalCommittedDiffKiB !== undefined
        || categories.some((c) => c.reservedDiffKiB !== undefined || c.committedDiffKiB !== undefined);

    const threadCount = /\(threads? #(\d+)/.exec(text)?.[1];
    const classCount = /\(classes #(\d+)/.exec(text)?.[1];

    return {
        totalReservedKiB,
        totalCommittedKiB,
        ...(totalCommittedDiffKiB !== undefined && { totalCommittedDiffKiB }),
        hasDiff,
        categories,
        ...(threadCount !== undefined && { threadCount: Number(threadCount) }),
        ...(classCount !== undefined && { classCount: Number(classCount) }),
    };
}

/**
 * Splits text containing MULTIPLE pasted NMT summaries (in capture order)
 * and parses each. Prefers "Native Memory Tracking:" headers as boundaries,
 * falling back to "Total:" lines when the headers were not pasted.
 */
export function parseNmtSeries(text: string): NmtReport[] {
    const byHeader = text.split(/^(?=Native Memory Tracking:)/m).filter((chunk) => chunk.trim() !== '');
    const chunks = byHeader.length >= 2
        ? byHeader
        : text.split(/^(?=Total:\s*reserved=)/m).filter((chunk) => chunk.trim() !== '');
    return chunks
        .map(parseNmtSummary)
        .filter((report): report is NmtReport => report !== null);
}

/** Committed size of the Java Heap category in whole MiB, when present. */
export function javaHeapCommittedMiB(report: NmtReport): number | undefined {
    const heap = report.categories.find((c) => c.name === 'Java Heap');
    return heap === undefined ? undefined : Math.round(heap.committedKiB / 1024);
}

export interface RssComparison {
    /** Measured RSS minus the NMT committed total, in MiB (positive = RSS larger). */
    deltaMiB: number;
    /** Headroom applied on top of whichever is larger: RSS or the committed total. */
    recommendedLimitMiB: number;
}

/**
 * Reality check against the container's measured RSS (e.g. `kubectl top pod`).
 * RSS above the NMT total is memory the JVM does not account for: glibc
 * malloc arenas, native libraries allocating through JNI, mapped files.
 * RSS below it usually means committed-but-untouched pages (an -Xms-sized
 * heap the workload has not written to yet).
 */
export function rssComparison(report: NmtReport, rssMiB: number, headroomPercent: number): RssComparison {
    const committedMiB = report.totalCommittedKiB / 1024;
    const base = Math.max(rssMiB, committedMiB);
    return {
        deltaMiB: Math.round(rssMiB - committedMiB),
        recommendedLimitMiB: Math.ceil(base * (1 + headroomPercent / 100)),
    };
}

/**
 * Container limit suggestion from measured data: committed total plus
 * headroom, rounded up to a whole MiB. Committed reflects the moment of the
 * snapshot — capture it under peak load for a trustworthy number.
 */
export function recommendedLimitMiB(report: NmtReport, headroomPercent: number): number {
    const committedMiB = report.totalCommittedKiB / 1024;
    return Math.ceil(committedMiB * (1 + headroomPercent / 100));
}

export const NMT_CATEGORY_NOTES: Record<string, string> = {
    'Java Heap': 'The heap itself. With -Xms equal to -Xmx it is fully committed at startup, so this value does not depend on load.',
    'Class': 'Class metadata. In recent JDKs the metaspace details live in the Metaspace category; reserved is huge by design (compressed class space reservation) — committed is what you pay.',
    'Metaspace': 'Committed metaspace for class metadata, including the compressed class space.',
    'Thread': 'Thread stacks and thread bookkeeping. Reserved counts every stack at full -Xss; committed shows what threads actually touched.',
    'Code': 'The JIT code cache: compiled methods, adapters and buffers. Grows with JIT activity toward ReservedCodeCacheSize.',
    'GC': 'Collector-internal structures: card tables, remembered sets, region metadata, forwarding data. Scales with heap size and collector choice.',
    'Compiler': 'JIT compiler working memory (C1/C2 arenas). Spikes during warmup, then settles.',
    'Symbol': 'Symbol and string tables for class, method and field names. Scales with the number of loaded classes.',
    'Internal': 'Miscellaneous VM-internal allocations (direct byte buffers accounting lives in Other on recent JDKs).',
    'Other': 'Direct (NIO) buffers and other unclassified native allocations.',
    'Native Memory Tracking': 'The cost of NMT itself — this category disappears when you disable tracking.',
    'Shared class space': 'The mapped CDS archive (classes.jsa). Shared between JVMs on the same host.',
    'Arena Chunk': 'Recycled arena chunks awaiting reuse; usually transient.',
    'Module': 'Module system metadata.',
    'Safepoint': 'Safepoint polling pages.',
    'Synchronization': 'Mutexes, monitors and related VM synchronization structures.',
    'Object Monitors': 'Inflated Java object monitors.',
    'String Deduplication': 'G1/ZGC string deduplication tables (when enabled).',
    'GCCardSet': 'G1 card-set memory tracking cross-region references (JDK 20+ reports it separately from GC).',
    'Serviceability': 'JVMTI, heap dump and other serviceability support.',
    'Arguments': 'Copies of JVM argument strings.',
    'Logging': 'Unified logging (-Xlog) buffers.',
    'Tracing': 'JFR and tracing buffers.',
};
