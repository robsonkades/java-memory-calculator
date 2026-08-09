import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { estimateYoungGcPerHour, parseGcLog } from './gclog';
import { parseHistogram } from './histogram';
import { javaHeapCommittedMiB, parseNmtSummary } from './nmt';
import { parseThreadDump } from './threaddump';

// Fixtures captured from a live Temurin 25.0.4 Spring Boot process via jcmd
// (PID prefix line, Windows CRLF, real formats). These lock the parsers to
// what jcmd actually emits, not to hand-written samples.
const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

describe('real jcmd VM.native_memory summary (JDK 25)', () => {
    const report = parseNmtSummary(fixture('real-nmt-summary.txt'))!;

    it('parses totals despite the jcmd PID prefix and CRLF', () => {
        expect(report.totalReservedKiB).toBe(9837688);
        expect(report.totalCommittedKiB).toBe(223840);
        expect(report.hasDiff).toBe(false);
    });

    it('extracts thread and class counts from the JDK 25 detail lines', () => {
        expect(report.threadCount).toBe(66); // "(threads #66)" — plural form
        expect(report.classCount).toBe(8996);
    });

    it('reads the committed heap and the JDK 25 separate Metaspace category', () => {
        expect(javaHeapCommittedMiB(report)).toBe(56);
        const metaspace = report.categories.find((c) => c.name === 'Metaspace')!;
        expect(metaspace.committedKiB).toBe(29213);
    });

    it('parses categories with extra trailing fields (readonly= on Shared class space)', () => {
        const shared = report.categories.find((c) => c.name === 'Shared class space')!;
        expect(shared.committedKiB).toBe(14016);
        expect(shared.componentPeakKiB).toBe(14272);
    });

    it('captures component peaks — the off-peak-snapshot signal', () => {
        const heap = report.categories.find((c) => c.name === 'Java Heap')!;
        expect(heap.componentPeakKiB).toBe(524288); // peaked at 512 MiB vs 56 MiB now
        const thread = report.categories.find((c) => c.name === 'Thread')!;
        expect(thread.componentPeakKiB).toBe(3324); // stack peak wins over malloc/arena peaks
    });
});

describe('real jcmd VM.native_memory summary.diff (JDK 25)', () => {
    it('parses the total deltas', () => {
        const report = parseNmtSummary(fixture('real-nmt-diff.txt'))!;
        expect(report.hasDiff).toBe(true);
        expect(report.totalCommittedDiffKiB).toBe(-111);
    });
});

describe('real -Xlog:gc* file (JDK 25, G1)', () => {
    const report = parseGcLog(fixture('real-gc.log'))!;

    it('counts only the final sized pause lines, not gc,start duplicates', () => {
        expect(report.pauseCount).toBe(25);
    });

    it('uses the Full GC heap-after for the live set (heap-inspection Fulls in the log)', () => {
        expect(report.liveSetSource).toBe('full'); // GC.class_histogram/GC.run triggered 3 Fulls
        expect(report.liveSetMiB).toBe(13);
        expect(report.recommendedHeapMiB).toBe(39);
    });

    it('derives the span from real uptimes', () => {
        expect(report.spanSeconds).toBeGreaterThan(300); // idle gap 1s → 332s+ in the log
        expect(report.throughputPercent).toBeGreaterThan(99);
    });

    it('computes G1 promotion and humongous stats from region lines', () => {
        expect(report.g1!.regionSizeMiB).toBe(4);
        expect(report.g1!.promotedMiB).toBe(12); // 3 Old regions grew × 4 MiB
        expect(report.g1!.maxHumongousRegions).toBe(0);
        expect(report.g1!.avgEdenCapacityMiB).toBeGreaterThan(40); // ~12.1 regions × 4 MiB
    });

    it('estimates young collections per hour for a hypothetical heap', () => {
        const rate = estimateYoungGcPerHour(report, 512);
        expect(rate).toBeGreaterThan(0);
        // Twice the heap → proportionally larger eden → about half the collections.
        expect(estimateYoungGcPerHour(report, 1024)!).toBeCloseTo(rate! / 2, 5);
    });
});

describe('real -Xlog:gc* files from Serial, Parallel and generational ZGC (JDK 25)', () => {
    it('parses the Serial log with its Full pauses', () => {
        const report = parseGcLog(fixture('real-gc-serial.log'))!;
        expect(report.pauseCount).toBe(5);
        expect(report.liveSetSource).toBe('full');
    });

    it('parses the Parallel log', () => {
        const report = parseGcLog(fixture('real-gc-parallel.log'))!;
        expect(report.pauseCount).toBe(6);
        expect(report.liveSetSource).toBe('full');
    });

    it('parses generational ZGC collections, sub-ms pauses and capacity', () => {
        const report = parseGcLog(fixture('real-gc-zgc.log'))!;
        expect(report.zgc!.collections).toHaveLength(6);
        expect(report.zgc!.majorCount).toBe(6);
        expect(report.zgc!.pauseCount).toBe(36);
        expect(report.zgc!.maxPauseMs).toBeLessThan(1); // sub-millisecond STW
        expect(report.zgc!.capacityMiB).toBeGreaterThanOrEqual(250);
        expect(report.zgc!.capacityMiB).toBeLessThanOrEqual(270); // -Xmx256m
        expect(report.liveSetSource).toBe('zgc');
        expect(report.liveSetMiB).toBe(8);
        expect(report.recommendedHeapMiB).toBe(24);
    });
});

describe('real jcmd Thread.print (JDK 25)', () => {
    const report = parseThreadDump(fixture('real-threaddump.txt'))!;

    it('counts the SMR-listed Java threads', () => {
        expect(report.totalThreads).toBe(38);
    });

    it('detects daemon despite the JDK 21+ [nid] between #id and daemon', () => {
        expect(report.daemonThreads).toBe(34);
    });

    it('ranks top CPU consumers from cpu=/elapsed= header fields', () => {
        expect(report.topCpu).toHaveLength(5); // 31 threads with cpu>0, capped at 5
        expect(report.topCpu[0].cpuMs).toBeGreaterThanOrEqual(report.topCpu[1].cpuMs);
        expect(report.topCpu[0].cpuPercent).toBeGreaterThan(0);
    });
});

describe('real jcmd GC.class_histogram (JDK 25)', () => {
    const report = parseHistogram(fixture('real-histogram.txt'))!;

    it('uses the Total line and ignores the jcmd PID prefix', () => {
        expect(report.totalInstances).toBe(312424);
        expect(report.totalBytes).toBe(15383512);
    });

    it('keeps array class names and module-suffixed rows', () => {
        expect(report.rows[0].className).toBe('[B');
        expect(report.rows[0].bytes).toBe(5143016);
    });

    it('estimates Compact Object Headers savings from total instances', () => {
        expect(report.compactHeadersSavingsBytes).toBe(4 * 312424);
    });
});
