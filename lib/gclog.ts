export interface GcPause {
    id: number;
    kind: 'young' | 'full' | 'other';
    label: string;
    uptimeSeconds?: number;
    beforeMiB: number;
    afterMiB: number;
    capacityMiB: number;
    pauseMs: number;
}

export interface ZgcCollection {
    id: number;
    kind: 'major' | 'minor';
    cause: string;
    uptimeSeconds?: number;
    beforeMiB: number;
    afterMiB: number;
    beforePercent: number;
    afterPercent: number;
    /** Whole (mostly concurrent) cycle duration — NOT a pause. */
    durationMs?: number;
}

export interface ZgcStats {
    collections: ZgcCollection[];
    majorCount: number;
    minorCount: number;
    /** Sub-millisecond STW pauses from gc,phases (Mark Start/Mark End/Relocate Start). */
    pauseCount: number;
    totalPauseMs: number;
    maxPauseMs: number;
    p95PauseMs: number;
    /** Estimated from "NM(P%)": capacity ≈ N × 100 / P. */
    capacityMiB?: number;
}

export interface G1Stats {
    regionSizeMiB: number;
    /** Σ positive Old-region growth across collections × region size. */
    promotedMiB: number;
    promotionRateMiBps?: number;
    maxHumongousRegions: number;
    humongousMiB: number;
    avgEdenCapacityMiB?: number;
    avgCapacityMiB?: number;
}

export interface LiveSetTrend {
    /** Least-squares slope of heap-after-collection over uptime, in MiB/hour. */
    slopeMiBPerHour: number;
    /** Goodness of fit (0–1): how much of the variation the straight line explains. */
    rSquared: number;
    samples: number;
    /** First→last uptime span of the sampled collections, in seconds. */
    spanSeconds: number;
    /**
     * Heuristic leak signal: fit ≥ 0.6 AND growth ≥ 1% of capacity per hour
     * (8 MiB/h when the capacity is unknown). Warmup and cache fill look the
     * same early on — only a long window makes this trustworthy.
     */
    rising: boolean;
    /** Hours until heap-after reaches capacity at this slope, when rising. */
    hoursToCapacity?: number;
}

export interface GcLogReport {
    pauses: GcPause[];
    pauseCount: number;
    totalPauseMs: number;
    avgPauseMs: number;
    p95PauseMs: number;
    maxPauseMs: number;
    /** Wall span covered by the log (last − first uptime), when uptimes are present. */
    spanSeconds?: number;
    /** 100 × (1 − pause time / span), when the span is known. */
    throughputPercent?: number;
    /**
     * Heap after collection: min over Full pauses; else min over Remark pauses
     * (end of concurrent marking); else min over ZGC collection afters; else
     * min over all pauses.
     */
    liveSetMiB: number;
    liveSetSource: 'full' | 'remark' | 'zgc' | 'any';
    /**
     * Trend of the same heap-after series that produced liveSetMiB. Present
     * when there are ≥ 4 timestamped samples spanning ≥ 5 minutes.
     */
    liveSetTrend?: LiveSetTrend;
    /** Estimate: heap growth between consecutive collections divided by the span. */
    allocationRateMiBps?: number;
    /** Rule of thumb: live set × 3 (sensible range 2.5–4). */
    recommendedHeapMiB: number;
    /** Collections whose completion line (with sizes) never appeared in the log. */
    unparsedCollections: number;
    /** Present when the log contains ZGC collections. */
    zgc?: ZgcStats;
    /** Present when the log contains G1 region details (-Xlog:gc* / gc+heap). */
    g1?: G1Stats;
}

const PAUSE_RE = /GC\((\d+)\)\s+Pause\s+(\w+)((?:\s+\([^)]*\))*)\s+(\d+)([KMG])->(\d+)([KMG])\((\d+)([KMG])\)\s+([\d.]+)ms/;
const UPTIME_RE = /\[(\d+(?:\.\d+)?)s\]/;
// Generational (JDK 21+) "Major/Minor Collection" and single-gen "Garbage Collection";
// the trailing cycle duration exists on generational lines only.
const ZGC_DONE_RE = /GC\((\d+)\)\s+(Major|Minor|Garbage)\s+Collection\s+\(([^)]+)\)\s+(\d+)M\((\d+)%\)->(\d+)M\((\d+)%\)(?:\s+([\d.]+)s)?/;
const ZGC_START_RE = /GC\((\d+)\)\s+(?:Major|Minor|Garbage)\s+Collection\s+\([^)]+\)\s*$/;
const ZGC_PAUSE_RE = /GC\(\d+\)\s+[YO]:\s+Pause\s+[A-Za-z ]+?(?:\s+\([^)]*\))?\s+([\d.]+)ms/;
const G1_REGION_RE = /GC\((\d+)\)\s+(Eden|Survivor|Old|Humongous)\s+regions:\s+(\d+)->(\d+)(?:\((\d+)\))?/;
const G1_REGION_SIZE_RE = /Heap Region Size:\s+(\d+)M/;

function toMiB(value: number, unit: string): number {
    switch (unit) {
        case 'K': return value / 1024;
        case 'G': return value * 1024;
        default: return value;
    }
}

function p95(sortedAsc: number[]): number {
    return sortedAsc.length === 0 ? 0 : sortedAsc[Math.ceil(sortedAsc.length * 0.95) - 1];
}

const MIN_TREND_SAMPLES = 4;
const MIN_TREND_SPAN_SECONDS = 300;

interface TrendSample {
    afterMiB: number;
    uptimeSeconds?: number;
    capacityMiB?: number;
}

function linearTrend(points: { x: number; y: number }[]): { slopePerSecond: number; rSquared: number } {
    const n = points.length;
    const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
    const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const p of points) {
        sxx += (p.x - meanX) ** 2;
        sxy += (p.x - meanX) * (p.y - meanY);
        syy += (p.y - meanY) ** 2;
    }
    if (sxx === 0 || syy === 0) return { slopePerSecond: 0, rSquared: 0 };
    return { slopePerSecond: sxy / sxx, rSquared: (sxy * sxy) / (sxx * syy) };
}

/**
 * Parses JDK 9+ unified GC logging (-Xlog:gc or gc*): Serial, Parallel and G1
 * pause lines, ZGC collections and sub-ms pauses, and G1 region details.
 * Returns null when nothing recognizable is found.
 */
export function parseGcLog(text: string): GcLogReport | null {
    const pauses: GcPause[] = [];
    const zgcCollections: ZgcCollection[] = [];
    const zgcPausesMs: number[] = [];
    const zgcDoneIds = new Set<number>();
    const zgcStartIds = new Set<number>();
    const oldDeltaById = new Map<number, number>();
    const humongousAfter: number[] = [];
    const edenCapacities: number[] = [];
    let regionSizeMiB: number | undefined;

    for (const line of text.split(/\r?\n/)) {
        const regionSize = G1_REGION_SIZE_RE.exec(line);
        if (regionSize) regionSizeMiB = Number(regionSize[1]);

        const zgcDone = ZGC_DONE_RE.exec(line);
        if (zgcDone) {
            const id = Number(zgcDone[1]);
            zgcDoneIds.add(id);
            zgcCollections.push({
                id,
                kind: zgcDone[2] === 'Minor' ? 'minor' : 'major',
                cause: zgcDone[3],
                uptimeSeconds: UPTIME_RE.exec(line) ? Number(UPTIME_RE.exec(line)![1]) : undefined,
                beforeMiB: Number(zgcDone[4]),
                beforePercent: Number(zgcDone[5]),
                afterMiB: Number(zgcDone[6]),
                afterPercent: Number(zgcDone[7]),
                ...(zgcDone[8] !== undefined && { durationMs: Number(zgcDone[8]) * 1000 }),
            });
            continue;
        }
        if (ZGC_START_RE.test(line)) {
            zgcStartIds.add(Number(/GC\((\d+)\)/.exec(line)![1]));
            continue;
        }
        const zgcPause = ZGC_PAUSE_RE.exec(line);
        if (zgcPause) {
            zgcPausesMs.push(Number(zgcPause[1]));
            continue;
        }

        const region = G1_REGION_RE.exec(line);
        if (region) {
            const id = Number(region[1]);
            const before = Number(region[3]);
            const after = Number(region[4]);
            if (region[2] === 'Old') {
                oldDeltaById.set(id, Math.max(0, after - before));
            } else if (region[2] === 'Humongous') {
                humongousAfter.push(after);
            } else if (region[2] === 'Eden' && region[5] !== undefined) {
                edenCapacities.push(Number(region[5]));
            }
            continue;
        }

        const match = PAUSE_RE.exec(line);
        if (!match) continue;
        const kindWord = match[2];
        pauses.push({
            id: Number(match[1]),
            kind: kindWord === 'Young' ? 'young' : kindWord === 'Full' ? 'full' : 'other',
            label: `Pause ${kindWord}${match[3] ?? ''}`.trim(),
            uptimeSeconds: UPTIME_RE.exec(line) ? Number(UPTIME_RE.exec(line)![1]) : undefined,
            beforeMiB: toMiB(Number(match[4]), match[5]),
            afterMiB: toMiB(Number(match[6]), match[7]),
            capacityMiB: toMiB(Number(match[8]), match[9]),
            pauseMs: Number(match[10]),
        });
    }

    if (pauses.length === 0 && zgcCollections.length === 0 && zgcStartIds.size === 0) return null;

    const totalPauseMs = pauses.reduce((sum, p) => sum + p.pauseMs, 0);
    const sortedMs = pauses.map((p) => p.pauseMs).sort((a, b) => a - b);
    const uptimes = [
        ...pauses.map((p) => p.uptimeSeconds),
        ...zgcCollections.map((c) => c.uptimeSeconds),
    ].filter((u): u is number => u !== undefined);
    const spanSeconds = uptimes.length >= 2 ? Math.max(...uptimes) - Math.min(...uptimes) : undefined;

    const fullPauses = pauses.filter((p) => p.kind === 'full');
    const remarkPauses = pauses.filter((p) => p.label.includes('Remark'));
    let liveSetSource: GcLogReport['liveSetSource'];
    let liveSamples: TrendSample[];
    if (fullPauses.length > 0) {
        liveSetSource = 'full';
        liveSamples = fullPauses;
    } else if (remarkPauses.length > 0) {
        liveSetSource = 'remark';
        liveSamples = remarkPauses;
    } else if (zgcCollections.length > 0) {
        liveSetSource = 'zgc';
        liveSamples = zgcCollections;
    } else {
        liveSetSource = 'any';
        liveSamples = pauses;
    }
    const liveSetMiB = liveSamples.length === 0
        ? 0
        : Math.round(Math.min(...liveSamples.map((s) => s.afterMiB)));

    // Heap growth between consecutive collections, over the span.
    const sequence = pauses.length > 0 ? pauses : zgcCollections;
    let allocationRateMiBps: number | undefined;
    if (spanSeconds !== undefined && spanSeconds > 0 && sequence.length >= 2) {
        let grown = 0;
        for (let i = 1; i < sequence.length; i++) {
            grown += Math.max(0, sequence[i].beforeMiB - sequence[i - 1].afterMiB);
        }
        allocationRateMiBps = grown / spanSeconds;
    }

    const zgcSortedPauses = [...zgcPausesMs].sort((a, b) => a - b);
    const zgc: ZgcStats | undefined = zgcCollections.length > 0 || zgcPausesMs.length > 0
        ? {
            collections: zgcCollections,
            majorCount: zgcCollections.filter((c) => c.kind === 'major').length,
            minorCount: zgcCollections.filter((c) => c.kind === 'minor').length,
            pauseCount: zgcPausesMs.length,
            totalPauseMs: zgcPausesMs.reduce((sum, ms) => sum + ms, 0),
            maxPauseMs: zgcSortedPauses.length > 0 ? zgcSortedPauses[zgcSortedPauses.length - 1] : 0,
            p95PauseMs: p95(zgcSortedPauses),
            ...(zgcCollections.some((c) => c.beforePercent > 0) && {
                capacityMiB: Math.round(
                    zgcCollections
                        .filter((c) => c.beforePercent > 0)
                        .map((c) => (c.beforeMiB * 100) / c.beforePercent)
                        .reduce((sum, v, _, arr) => sum + v / arr.length, 0),
                ),
            }),
        }
        : undefined;

    let g1: G1Stats | undefined;
    if (regionSizeMiB !== undefined && (oldDeltaById.size > 0 || humongousAfter.length > 0)) {
        const promotedRegions = [...oldDeltaById.values()].reduce((sum, d) => sum + d, 0);
        const promotedMiB = promotedRegions * regionSizeMiB;
        const maxHumongousRegions = humongousAfter.length > 0 ? Math.max(...humongousAfter) : 0;
        const avgEden = edenCapacities.length > 0
            ? (edenCapacities.reduce((sum, c) => sum + c, 0) / edenCapacities.length) * regionSizeMiB
            : undefined;
        const avgCapacity = pauses.length > 0
            ? pauses.reduce((sum, p) => sum + p.capacityMiB, 0) / pauses.length
            : undefined;
        g1 = {
            regionSizeMiB,
            promotedMiB,
            ...(spanSeconds !== undefined && spanSeconds > 0 && { promotionRateMiBps: promotedMiB / spanSeconds }),
            maxHumongousRegions,
            humongousMiB: maxHumongousRegions * regionSizeMiB,
            ...(avgEden !== undefined && { avgEdenCapacityMiB: avgEden }),
            ...(avgCapacity !== undefined && { avgCapacityMiB: avgCapacity }),
        };
    }

    // Trend over the liveSet series. For ZGC prefer Major collections (the
    // floor) when there are enough — Minor afters ride the young generation
    // and would dilute the fit.
    let trendPool = liveSamples;
    if (liveSetSource === 'zgc') {
        const timedMajors = zgcCollections.filter((c) => c.kind === 'major' && c.uptimeSeconds !== undefined);
        if (timedMajors.length >= MIN_TREND_SAMPLES) trendPool = timedMajors;
    }
    const timedTrend = trendPool.filter(
        (s): s is TrendSample & { uptimeSeconds: number } => s.uptimeSeconds !== undefined,
    );
    let liveSetTrend: LiveSetTrend | undefined;
    if (timedTrend.length >= MIN_TREND_SAMPLES) {
        const trendUptimes = timedTrend.map((s) => s.uptimeSeconds);
        const trendSpanSeconds = Math.max(...trendUptimes) - Math.min(...trendUptimes);
        if (trendSpanSeconds >= MIN_TREND_SPAN_SECONDS) {
            const { slopePerSecond, rSquared } = linearTrend(
                timedTrend.map((s) => ({ x: s.uptimeSeconds, y: s.afterMiB })),
            );
            const slopeMiBPerHour = slopePerSecond * 3600;
            const last = timedTrend[timedTrend.length - 1];
            const capacityMiB = last.capacityMiB ?? zgc?.capacityMiB;
            const risingFloor = capacityMiB !== undefined ? capacityMiB / 100 : 8;
            const rising = rSquared >= 0.6 && slopeMiBPerHour >= risingFloor;
            liveSetTrend = {
                slopeMiBPerHour,
                rSquared,
                samples: timedTrend.length,
                spanSeconds: trendSpanSeconds,
                rising,
                ...(rising && capacityMiB !== undefined && capacityMiB > last.afterMiB && {
                    hoursToCapacity: (capacityMiB - last.afterMiB) / slopeMiBPerHour,
                }),
            };
        }
    }

    const totalStwMs = totalPauseMs + (zgc?.totalPauseMs ?? 0);
    const unparsedCollections = [...zgcStartIds].filter((id) => !zgcDoneIds.has(id)).length;

    return {
        pauses,
        pauseCount: pauses.length,
        totalPauseMs,
        avgPauseMs: pauses.length > 0 ? totalPauseMs / pauses.length : 0,
        p95PauseMs: p95(sortedMs),
        maxPauseMs: sortedMs.length > 0 ? sortedMs[sortedMs.length - 1] : 0,
        ...(spanSeconds !== undefined && spanSeconds > 0 && {
            spanSeconds,
            throughputPercent: (1 - totalStwMs / (spanSeconds * 1000)) * 100,
        }),
        liveSetMiB,
        liveSetSource,
        ...(liveSetTrend !== undefined && { liveSetTrend }),
        ...(allocationRateMiBps !== undefined && { allocationRateMiBps }),
        recommendedHeapMiB: Math.ceil(liveSetMiB * 3),
        unparsedCollections,
        ...(zgc !== undefined && { zgc }),
        ...(g1 !== undefined && { g1 }),
    };
}

/**
 * What-if estimate: young collections per hour at a hypothetical heap size,
 * assuming the eden share observed in the log scales with the heap and the
 * allocation rate stays constant. A rough planning number, not a promise.
 */
export function estimateYoungGcPerHour(report: GcLogReport, heapMiB: number): number | undefined {
    if (report.allocationRateMiBps === undefined || report.g1?.avgEdenCapacityMiB === undefined
        || report.g1.avgCapacityMiB === undefined || heapMiB <= 0) return undefined;
    const edenAtHeap = report.g1.avgEdenCapacityMiB * (heapMiB / report.g1.avgCapacityMiB);
    if (edenAtHeap <= 0) return undefined;
    return (report.allocationRateMiBps * 3600) / edenAtHeap;
}
