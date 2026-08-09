import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diagnose } from './diagnose';
import { buildMarkdownReport } from './report';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

const findingById = (result: ReturnType<typeof diagnose>, id: string) =>
    result.findings.find((f) => f.id === id);

describe('diagnose — cross-analysis over the real captured fixtures', () => {
    const result = diagnose({
        nmt: fixture('real-nmt-summary.txt'),
        threads: fixture('real-threaddump.txt'),
        histogram: fixture('real-histogram.txt'),
        gclog: fixture('real-gc.log'),
    }, 15);

    it('parses every provided source', () => {
        expect(result.sourceCount).toBe(4);
        expect(result.parsed.smaps).toBeNull();
    });

    it('explains the NMT-vs-dump thread delta (VM-internal threads)', () => {
        const finding = findingById(result, 'vm-threads')!;
        expect(finding.values).toEqual({ nmt: 66, dump: 38, delta: 28 });
    });

    it('contrasts reserved stacks with NMT committed', () => {
        const finding = findingById(result, 'stacks')!;
        expect(finding.values.reserved).toBe(38);
        expect(finding.values.committed).toBe(3); // 3554 KiB committed
    });

    it('compares the GC live set with the committed heap', () => {
        const finding = findingById(result, 'heap-vs-live')!;
        expect(finding.values).toMatchObject({ live: 13, heap: 56, recommended: 39 });
    });

    it('warns about the off-peak heap snapshot', () => {
        const finding = findingById(result, 'off-peak')!;
        expect(finding.severity).toBe('warning');
        expect(finding.values).toEqual({ peak: 512, now: 56 });
    });

    it('consolidates the container limit from the NMT committed total', () => {
        expect(result.consolidatedLimitMiB).toBe(252); // ceil(218.59 × 1.15)
    });

    it('prefills the calculator from the strongest sources', () => {
        expect(result.calculatorQuery).toEqual({ heap: '39', threads: '38', classes: '8996' });
    });
});

describe('diagnose — with a measured RSS in the mix', () => {
    it('raises the consolidated limit to the RSS when it is larger', () => {
        const rollup = '00000000-7fffffffffff ---p 00000000 00:00 0   [rollup]\nRss:  512000 kB\nPss:  480000 kB';
        const result = diagnose({ nmt: fixture('real-nmt-summary.txt'), smaps: rollup }, 15);
        const gap = findingById(result, 'rss-gap')!;
        expect(gap.values.rss).toBe(500);
        expect(gap.values.delta).toBe(281); // 500 − 218.59
        expect(gap.severity).toBe('warning'); // gap > 20% of committed
        expect(result.consolidatedLimitMiB).toBe(575); // ceil(500 × 1.15)
    });
});

describe('buildMarkdownReport', () => {
    it('renders a ticket-ready summary with the key numbers', () => {
        const result = diagnose({
            nmt: fixture('real-nmt-summary.txt'),
            threads: fixture('real-threaddump.txt'),
        }, 15);
        const markdown = buildMarkdownReport(result, 15);

        expect(markdown).toContain('# JVM memory diagnosis');
        expect(markdown).toContain('Recommended container limit: 252 Mi');
        expect(markdown).toContain('the other 28 are VM-internal');
        expect(markdown).toContain('## Native Memory Tracking');
        expect(markdown).toContain('38 Java threads (34 daemon)');
        expect(markdown).toContain('Off-peak snapshot');
    });
});
