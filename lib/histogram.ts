export interface HistogramRow {
    rank: number;
    instances: number;
    bytes: number;
    className: string;
}

export interface HistogramReport {
    /** Rows sorted by bytes descending. */
    rows: HistogramRow[];
    totalInstances: number;
    totalBytes: number;
    /**
     * Compact Object Headers (JEP 519) estimate: the header shrinks from 12 to
     * 8 bytes on every object (arrays included), so ~4 bytes × instances.
     * Alignment gains are not counted — real savings are often higher.
     */
    compactHeadersSavingsBytes: number;
}

export interface HistogramDiffRow {
    className: string;
    deltaInstances: number;
    deltaBytes: number;
    afterInstances: number;
    afterBytes: number;
    /** Class absent from the first snapshot. */
    isNew: boolean;
}

export type LeakSuspectKind = 'threadLocal' | 'mapEntries' | 'finalizer' | 'classes' | 'directBuffer';

export interface LeakSuspect {
    kind: LeakSuspectKind;
    className: string;
    deltaInstances: number;
}

export interface HistogramDiffReport {
    /** All classes from either snapshot, sorted by byte growth descending. */
    rows: HistogramDiffRow[];
    deltaTotalInstances: number;
    deltaTotalBytes: number;
    /** Known leak signatures whose instance growth crossed the heuristic floor. */
    suspects: LeakSuspect[];
}

const ROW_RE = /^\s*(\d+):\s+(\d+)\s+(\d+)\s+(\S+)/;
const TOTAL_RE = /^\s*Total\s+(\d+)\s+(\d+)/m;

/**
 * Instance-growth floors chosen to stay quiet on healthy churn: a suspect is
 * a lead to investigate, not a verdict. Entry-type classes are tiny, so byte
 * ranking would miss them (10k DirectByteBuffers ≈ 640 KiB of heap pinning
 * potentially GiB of native memory).
 */
const SUSPECT_SIGNATURES: { kind: LeakSuspectKind; className: string; minInstanceGrowth: number }[] = [
    { kind: 'threadLocal', className: 'java.lang.ThreadLocal$ThreadLocalMap$Entry', minInstanceGrowth: 1000 },
    { kind: 'mapEntries', className: 'java.util.HashMap$Node', minInstanceGrowth: 50000 },
    { kind: 'mapEntries', className: 'java.util.concurrent.ConcurrentHashMap$Node', minInstanceGrowth: 50000 },
    { kind: 'mapEntries', className: 'java.util.LinkedHashMap$Entry', minInstanceGrowth: 50000 },
    { kind: 'finalizer', className: 'java.lang.ref.Finalizer', minInstanceGrowth: 1000 },
    { kind: 'classes', className: 'java.lang.Class', minInstanceGrowth: 500 },
    { kind: 'directBuffer', className: 'java.nio.DirectByteBuffer', minInstanceGrowth: 500 },
];

/**
 * Parses `jcmd <pid> GC.class_histogram` / `jmap -histo` output.
 * Returns null when no histogram rows are found.
 */
export function parseHistogram(text: string): HistogramReport | null {
    const rows: HistogramRow[] = [];
    for (const line of text.split(/\r?\n/)) {
        if (/^\s*Total\s/.test(line)) break;
        const match = ROW_RE.exec(line);
        if (!match) continue;
        rows.push({
            rank: Number(match[1]),
            instances: Number(match[2]),
            bytes: Number(match[3]),
            className: match[4],
        });
    }
    if (rows.length === 0) return null;

    const total = TOTAL_RE.exec(text);
    const totalInstances = total ? Number(total[1]) : rows.reduce((sum, r) => sum + r.instances, 0);
    const totalBytes = total ? Number(total[2]) : rows.reduce((sum, r) => sum + r.bytes, 0);

    rows.sort((a, b) => b.bytes - a.bytes);

    return {
        rows,
        totalInstances,
        totalBytes,
        compactHeadersSavingsBytes: 4 * totalInstances,
    };
}

/**
 * Splits text containing MULTIPLE pasted histograms (in capture order) and
 * parses each. Prefers the " num  #instances" header as the boundary, falling
 * back to rank-1 rows when the headers were not pasted.
 */
export function parseHistogramSeries(text: string): HistogramReport[] {
    const byHeader = text.split(/^(?=\s*num\s+#instances)/m).filter((chunk) => chunk.trim() !== '');
    const chunks = byHeader.length >= 2
        ? byHeader
        : text.split(/^(?=\s*1:\s+\d)/m).filter((chunk) => chunk.trim() !== '');
    return chunks
        .map(parseHistogram)
        .filter((report): report is HistogramReport => report !== null);
}

/**
 * Diffs two histograms of the same process taken some time apart — the
 * lowest-friction way to locate a heap leak: classes that keep growing
 * between snapshots are the suspects. Classes only in `after` count from
 * zero; classes that disappeared appear with negative deltas.
 */
export function diffHistograms(before: HistogramReport, after: HistogramReport): HistogramDiffReport {
    const beforeByClass = new Map(before.rows.map((row) => [row.className, row]));
    const rows: HistogramDiffRow[] = after.rows.map((row) => {
        const prev = beforeByClass.get(row.className);
        return {
            className: row.className,
            deltaInstances: row.instances - (prev?.instances ?? 0),
            deltaBytes: row.bytes - (prev?.bytes ?? 0),
            afterInstances: row.instances,
            afterBytes: row.bytes,
            isNew: prev === undefined,
        };
    });
    const afterNames = new Set(after.rows.map((row) => row.className));
    for (const row of before.rows) {
        if (!afterNames.has(row.className)) {
            rows.push({
                className: row.className,
                deltaInstances: -row.instances,
                deltaBytes: -row.bytes,
                afterInstances: 0,
                afterBytes: 0,
                isNew: false,
            });
        }
    }
    rows.sort((a, b) => b.deltaBytes - a.deltaBytes);

    const suspects: LeakSuspect[] = [];
    for (const signature of SUSPECT_SIGNATURES) {
        const row = rows.find((r) => r.className === signature.className);
        if (row !== undefined && row.deltaInstances >= signature.minInstanceGrowth) {
            suspects.push({
                kind: signature.kind,
                className: signature.className,
                deltaInstances: row.deltaInstances,
            });
        }
    }

    return {
        rows,
        deltaTotalInstances: after.totalInstances - before.totalInstances,
        deltaTotalBytes: after.totalBytes - before.totalBytes,
        suspects,
    };
}
