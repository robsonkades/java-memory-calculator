import { describe, expect, it } from 'vitest';
import { javaHeapCommittedMiB, parseNmtSeries, parseNmtSummary, recommendedLimitMiB, rssComparison } from './nmt';

const SAMPLE = `
Native Memory Tracking:

(Omitting categories weighting less than 1KB)

Total: reserved=1892974KB, committed=595406KB
       malloc: 31514KB #185763
       mmap:   reserved=1861460KB, committed=563892KB

-                 Java Heap (reserved=524288KB, committed=524288KB)
                            (mmap: reserved=524288KB, committed=524288KB)

-                     Class (reserved=1049289KB, committed=12233KB)
                            (classes #21015)
                            (  instance classes #19762, array classes #1253)
                            (malloc=1737KB #58426)
                            (mmap: reserved=1047552KB, committed=10496KB)

-                    Thread (reserved=41172KB, committed=4128KB)
                            (thread #40)
                            (stack: reserved=41040KB, committed=3996KB)

-                      Code (reserved=50208KB, committed=14848KB)
                            (mmap: reserved=48768KB, committed=13408KB)

-                        GC (reserved=134794KB, committed=25610KB)

-                  Compiler (reserved=1234KB, committed=1234KB)

-                    Symbol (reserved=18962KB, committed=18962KB)

- Native Memory Tracking (reserved=3187KB, committed=3187KB)

-        Shared class space (reserved=16384KB, committed=12136KB)
`;

describe('parseNmtSummary', () => {
    it('parses totals and every category from a jcmd summary', () => {
        const report = parseNmtSummary(SAMPLE)!;

        expect(report.totalReservedKiB).toBe(1892974);
        expect(report.totalCommittedKiB).toBe(595406);
        expect(report.categories).toHaveLength(9);
        expect(report.categories[0]).toEqual({
            name: 'Java Heap',
            reservedKiB: 524288,
            committedKiB: 524288,
        });
    });

    it('keeps multi-word category names intact', () => {
        const names = parseNmtSummary(SAMPLE)!.categories.map((c) => c.name);
        expect(names).toContain('Native Memory Tracking');
        expect(names).toContain('Shared class space');
    });

    it('sums categories when the Total line is missing', () => {
        const withoutTotal = SAMPLE.split('\n').filter((l) => !l.startsWith('Total:')).join('\n');
        const report = parseNmtSummary(withoutTotal)!;
        expect(report.totalCommittedKiB).toBe(
            report.categories.reduce((sum, c) => sum + c.committedKiB, 0),
        );
    });

    it('returns null for text that is not an NMT summary', () => {
        expect(parseNmtSummary('')).toBeNull();
        expect(parseNmtSummary('random log line\nanother line')).toBeNull();
    });

    it('marks a plain summary as hasDiff false', () => {
        expect(parseNmtSummary(SAMPLE)!.hasDiff).toBe(false);
    });
});

describe('parseNmtSummary with summary.diff', () => {
    const DIFF_SAMPLE = `
Total: reserved=1892974KB +2048KB, committed=595406KB +4096KB

-                 Java Heap (reserved=524288KB, committed=524288KB)

-                    Thread (reserved=41172KB +2048KB, committed=4128KB -512KB)
`;

    it('parses positive and negative deltas per category', () => {
        const report = parseNmtSummary(DIFF_SAMPLE)!;

        expect(report.hasDiff).toBe(true);
        expect(report.totalCommittedDiffKiB).toBe(4096);

        const thread = report.categories.find((c) => c.name === 'Thread')!;
        expect(thread.reservedDiffKiB).toBe(2048);
        expect(thread.committedDiffKiB).toBe(-512);
    });

    it('leaves deltas undefined for unchanged categories', () => {
        const heap = parseNmtSummary(DIFF_SAMPLE)!.categories.find((c) => c.name === 'Java Heap')!;
        expect(heap.reservedDiffKiB).toBeUndefined();
        expect(heap.committedDiffKiB).toBeUndefined();
    });
});

describe('calculator bridge extraction', () => {
    it('extracts thread and class counts from the detail lines', () => {
        const report = parseNmtSummary(SAMPLE)!;
        expect(report.threadCount).toBe(40);
        expect(report.classCount).toBe(21015);
    });

    it('reads the committed Java Heap in MiB', () => {
        expect(javaHeapCommittedMiB(parseNmtSummary(SAMPLE)!)).toBe(512); // 524288 KiB
    });
});

describe('rssComparison', () => {
    // SAMPLE committed total: 595406 KiB = 581.45 MiB
    it('reports RSS above the NMT total and sizes the limit from the RSS', () => {
        const result = rssComparison(parseNmtSummary(SAMPLE)!, 650, 15);
        expect(result.deltaMiB).toBe(69);
        expect(result.recommendedLimitMiB).toBe(748); // ceil(650 * 1.15)
    });

    it('falls back to the committed total when the RSS is smaller', () => {
        const result = rssComparison(parseNmtSummary(SAMPLE)!, 500, 15);
        expect(result.deltaMiB).toBe(-81);
        expect(result.recommendedLimitMiB).toBe(669); // ceil(581.45 * 1.15)
    });
});

describe('parseNmtSeries', () => {
    const second = SAMPLE
        .replace('Total: reserved=1892974KB, committed=595406KB', 'Total: reserved=1900000KB, committed=650000KB')
        .replace('-                        GC (reserved=134794KB, committed=25610KB)', '-                        GC (reserved=140000KB, committed=80204KB)');

    it('splits multiple pasted summaries on their headers, in order', () => {
        const reports = parseNmtSeries(SAMPLE + '\n' + second);
        expect(reports).toHaveLength(2);
        expect(reports[0].totalCommittedKiB).toBe(595406);
        expect(reports[1].totalCommittedKiB).toBe(650000);
    });

    it('splits on Total lines when the headers were not pasted', () => {
        const noHeaders = (SAMPLE + '\n' + second).replaceAll('Native Memory Tracking:', '');
        const reports = parseNmtSeries(noHeaders);
        expect(reports).toHaveLength(2);
        expect(reports[1].totalCommittedKiB).toBe(650000);
    });

    it('returns a single report for a single summary and none for garbage', () => {
        expect(parseNmtSeries(SAMPLE)).toHaveLength(1);
        expect(parseNmtSeries('nothing here')).toHaveLength(0);
    });
});

describe('recommendedLimitMiB', () => {
    it('applies headroom on top of the committed total, in whole MiB', () => {
        const report = parseNmtSummary(SAMPLE)!;
        // 595406 KiB = 581.45 MiB; * 1.15 = 668.67 → 669
        expect(recommendedLimitMiB(report, 15)).toBe(669);
        expect(recommendedLimitMiB(report, 0)).toBe(582);
    });
});
