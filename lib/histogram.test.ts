import { describe, expect, it } from 'vitest';
import { diffHistograms, parseHistogram, parseHistogramSeries } from './histogram';

const SAMPLE = `
 num     #instances         #bytes  class name (module)
-------------------------------------------------------
   1:        500000       24000000  [B (java.base@25)
   2:        400000        9600000  java.lang.String (java.base@25)
   3:         10000       12000000  [Ljava.lang.Object; (java.base@25)
   4:         90000        2880000  java.util.HashMap$Node (java.base@25)
Total       1000000       48480000
`;

describe('parseHistogram', () => {
    it('parses rows and totals, sorting by bytes descending', () => {
        const report = parseHistogram(SAMPLE)!;

        expect(report.rows).toHaveLength(4);
        expect(report.rows[0]).toMatchObject({ className: '[B', instances: 500000, bytes: 24000000 });
        expect(report.rows[1].className).toBe('[Ljava.lang.Object;');
        expect(report.totalInstances).toBe(1000000);
        expect(report.totalBytes).toBe(48480000);
    });

    it('sums rows when the Total line is missing', () => {
        const withoutTotal = SAMPLE.split('\n').filter((l) => !l.startsWith('Total')).join('\n');
        const report = parseHistogram(withoutTotal)!;
        expect(report.totalInstances).toBe(1000000);
        expect(report.totalBytes).toBe(48480000);
    });

    it('estimates Compact Object Headers savings at 4 bytes per instance', () => {
        expect(parseHistogram(SAMPLE)!.compactHeadersSavingsBytes).toBe(4000000);
    });

    it('returns null for text without histogram rows', () => {
        expect(parseHistogram('')).toBeNull();
        expect(parseHistogram('no histogram here')).toBeNull();
    });
});

const SECOND = `
 num     #instances         #bytes  class name (module)
-------------------------------------------------------
   1:        800000       38400000  [B (java.base@25)
   2:        400000        9600000  java.lang.String (java.base@25)
   3:        200000       12800000  java.util.concurrent.ConcurrentHashMap$Node (java.base@25)
   4:          5000        6000000  [Ljava.lang.Object; (java.base@25)
Total       1405000       66800000
`;

describe('parseHistogramSeries', () => {
    it('splits snapshots on the header line, jcmd pid prefix included', () => {
        const reports = parseHistogramSeries(`12345:\n${SAMPLE}\n${SECOND}`);
        expect(reports).toHaveLength(2);
        expect(reports[0].totalBytes).toBe(48480000);
        expect(reports[1].totalBytes).toBe(66800000);
    });

    it('falls back to rank-1 rows when headers were not pasted', () => {
        const stripHeader = (text: string) => text.split('\n')
            .filter((l) => !/^\s*num\s/.test(l) && !/^-+$/.test(l)).join('\n');
        const reports = parseHistogramSeries(`${stripHeader(SAMPLE)}\n${stripHeader(SECOND)}`);
        expect(reports).toHaveLength(2);
        expect(reports[1].totalInstances).toBe(1405000);
    });

    it('returns a single report for a single snapshot', () => {
        expect(parseHistogramSeries(SAMPLE)).toHaveLength(1);
    });
});

describe('diffHistograms', () => {
    const diff = () => diffHistograms(parseHistogram(SAMPLE)!, parseHistogram(SECOND)!);

    it('sorts by byte growth and marks classes new to the second snapshot', () => {
        const report = diff();
        expect(report.rows[0]).toMatchObject({
            className: '[B', deltaInstances: 300000, deltaBytes: 14400000, isNew: false,
        });
        expect(report.rows[1]).toMatchObject({
            className: 'java.util.concurrent.ConcurrentHashMap$Node', deltaBytes: 12800000, isNew: true,
        });
        expect(report.deltaTotalInstances).toBe(405000);
        expect(report.deltaTotalBytes).toBe(18320000);
    });

    it('keeps classes that disappeared, with negative deltas', () => {
        const gone = diff().rows.find((r) => r.className === 'java.util.HashMap$Node')!;
        expect(gone).toMatchObject({ deltaInstances: -90000, deltaBytes: -2880000, afterBytes: 0 });
    });

    it('flags known leak signatures past their instance-growth floor', () => {
        const report = diff();
        expect(report.suspects).toHaveLength(1);
        expect(report.suspects[0]).toMatchObject({
            kind: 'mapEntries',
            className: 'java.util.concurrent.ConcurrentHashMap$Node',
            deltaInstances: 200000,
        });
    });

    it('stays quiet below the floors', () => {
        const small = SECOND.replace('200000       12800000  java.util.concurrent.ConcurrentHashMap$Node',
            '10000        640000  java.util.concurrent.ConcurrentHashMap$Node');
        const report = diffHistograms(parseHistogram(SAMPLE)!, parseHistogram(small)!);
        expect(report.suspects).toHaveLength(0);
    });
});
