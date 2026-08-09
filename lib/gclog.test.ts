import { describe, expect, it } from 'vitest';
import { parseGcLog } from './gclog';

const G1_SAMPLE = `
[0.100s][info][gc] Using G1
[1.000s][info][gc] GC(0) Pause Young (Normal) (G1 Evacuation Pause) 100M->20M(256M) 10.0ms
[2.000s][info][gc] GC(1) Pause Young (Normal) (G1 Evacuation Pause) 120M->24M(256M) 20.0ms
[3.000s][info][gc] GC(2) Pause Remark 130M->130M(256M) 5.0ms
[4.000s][info][gc] GC(3) Pause Full (G1 Compaction Pause) 200M->60M(256M) 100.0ms
[5.000s][info][gc] GC(4) Pause Young (Normal) (G1 Evacuation Pause) 90M->30M(256M) 15.0ms
`;

describe('parseGcLog', () => {
    it('parses pause lines and computes pause statistics', () => {
        const report = parseGcLog(G1_SAMPLE)!;

        expect(report.pauseCount).toBe(5);
        expect(report.totalPauseMs).toBeCloseTo(150);
        expect(report.avgPauseMs).toBeCloseTo(30);
        expect(report.p95PauseMs).toBeCloseTo(100);
        expect(report.maxPauseMs).toBeCloseTo(100);
        expect(report.pauses[0]).toMatchObject({ id: 0, kind: 'young', beforeMiB: 100, afterMiB: 20, capacityMiB: 256 });
        expect(report.pauses[3].kind).toBe('full');
    });

    it('computes span, throughput and allocation rate from uptimes', () => {
        const report = parseGcLog(G1_SAMPLE)!;

        expect(report.spanSeconds).toBeCloseTo(4);
        expect(report.throughputPercent).toBeCloseTo(96.25);
        // growth: (120-20) + (130-24) + (200-130) + (90-60) = 306 MiB over 4 s
        expect(report.allocationRateMiBps).toBeCloseTo(76.5);
    });

    it('exposes per-pause uptime, duration and kind for the timeline', () => {
        const report = parseGcLog(G1_SAMPLE)!;

        for (const pause of report.pauses) {
            expect(pause.uptimeSeconds).toBeTypeOf('number');
            expect(pause.pauseMs).toBeGreaterThan(0);
            expect(['young', 'full', 'other']).toContain(pause.kind);
        }
        expect(report.pauses[0].uptimeSeconds).toBeCloseTo(1);
    });

    it('estimates the live set from heap-after-Full and recommends 3x', () => {
        const report = parseGcLog(G1_SAMPLE)!;

        expect(report.liveSetMiB).toBe(60);
        expect(report.liveSetSource).toBe('full');
        expect(report.recommendedHeapMiB).toBe(180);
    });

    it('prefers the Remark heap-after when there is no Full collection', () => {
        const noFull = G1_SAMPLE.split('\n').filter((l) => !l.includes('Pause Full')).join('\n');
        const report = parseGcLog(noFull)!;

        expect(report.liveSetSource).toBe('remark'); // end of concurrent marking
        expect(report.liveSetMiB).toBe(130);
    });

    it('falls back to min-after-any-pause without Full or Remark collections', () => {
        const youngOnly = G1_SAMPLE.split('\n')
            .filter((l) => !l.includes('Pause Full') && !l.includes('Pause Remark'))
            .join('\n');
        const report = parseGcLog(youngOnly)!;

        expect(report.liveSetSource).toBe('any');
        expect(report.liveSetMiB).toBe(20);
    });

    it('size-parses ZGC collections and counts only truly incomplete ones', () => {
        const zgc = `
[1.000s][info][gc] GC(0) Minor Collection (Allocation Rate)
[1.500s][info][gc] GC(0) Minor Collection (Allocation Rate) 1024M(50%)->512M(25%)
[9.000s][info][gc] GC(1) Major Collection (Proactive)
`;
        const report = parseGcLog(zgc)!;
        expect(report.zgc!.collections).toHaveLength(1);
        expect(report.zgc!.minorCount).toBe(1);
        expect(report.zgc!.capacityMiB).toBe(2048); // 1024M at 50%
        expect(report.liveSetSource).toBe('zgc');
        expect(report.liveSetMiB).toBe(512);
        expect(report.unparsedCollections).toBe(1); // GC(1) never completed
        expect(report.pauseCount).toBe(0);
    });

    it('returns null for text without GC content', () => {
        expect(parseGcLog('')).toBeNull();
        expect(parseGcLog('INFO Starting application in 2.3s')).toBeNull();
    });
});

const LEAKING_FULLS = `
[100.000s][info][gc] GC(0) Pause Full (G1 Compaction Pause) 400M->100M(1024M) 100.0ms
[400.000s][info][gc] GC(1) Pause Full (G1 Compaction Pause) 450M->130M(1024M) 100.0ms
[700.000s][info][gc] GC(2) Pause Full (G1 Compaction Pause) 500M->160M(1024M) 100.0ms
[1000.000s][info][gc] GC(3) Pause Full (G1 Compaction Pause) 550M->190M(1024M) 100.0ms
[1300.000s][info][gc] GC(4) Pause Full (G1 Compaction Pause) 600M->220M(1024M) 100.0ms
`;

describe('liveSetTrend', () => {
    it('flags a steadily rising heap-after-Full as a leak signal', () => {
        const trend = parseGcLog(LEAKING_FULLS)!.liveSetTrend!;

        expect(trend.samples).toBe(5);
        expect(trend.spanSeconds).toBeCloseTo(1200);
        expect(trend.slopeMiBPerHour).toBeCloseTo(360); // 30 MiB per 300 s
        expect(trend.rSquared).toBeCloseTo(1);
        expect(trend.rising).toBe(true);
        expect(trend.hoursToCapacity).toBeCloseTo((1024 - 220) / 360);
    });

    it('reports a flat floor as not rising', () => {
        const stable = LEAKING_FULLS
            .replace('>130M', '>101M').replace('>160M', '>99M')
            .replace('>190M', '>100M').replace('>220M', '>101M');
        const trend = parseGcLog(stable)!.liveSetTrend!;

        expect(trend.rising).toBe(false);
        expect(trend.hoursToCapacity).toBeUndefined();
    });

    it('is absent with fewer than 4 samples or under 5 minutes of data', () => {
        const short = LEAKING_FULLS.split('\n').slice(0, 4).join('\n');
        expect(parseGcLog(short)!.liveSetTrend).toBeUndefined();

        const compressed = LEAKING_FULLS.replaceAll('00.000s]', '0.000s]');
        expect(parseGcLog(compressed)!.liveSetTrend).toBeUndefined();
    });

    it('trends ZGC on Major collections only, ignoring Minor noise', () => {
        const zgc = `
[100.000s][info][gc] GC(0) Major Collection (Proactive) 1024M(50%)->500M(24%) 0.5s
[300.000s][info][gc] GC(1) Minor Collection (Allocation Rate) 512M(25%)->900M(44%) 0.1s
[700.000s][info][gc] GC(2) Major Collection (Proactive) 1024M(50%)->550M(27%) 0.5s
[900.000s][info][gc] GC(3) Minor Collection (Allocation Rate) 512M(25%)->600M(29%) 0.1s
[1300.000s][info][gc] GC(4) Major Collection (Proactive) 1024M(50%)->600M(29%) 0.5s
[1900.000s][info][gc] GC(5) Major Collection (Proactive) 1024M(50%)->650M(32%) 0.5s
`;
        const trend = parseGcLog(zgc)!.liveSetTrend!;

        expect(trend.samples).toBe(4);
        expect(trend.slopeMiBPerHour).toBeCloseTo(300); // 50 MiB per 600 s
        expect(trend.rising).toBe(true);
    });
});
