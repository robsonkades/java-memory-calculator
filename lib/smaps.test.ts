import { describe, expect, it } from 'vitest';
import { parseSmaps, SMAPS_CATEGORIES } from './smaps';

const ROLLUP_SAMPLE = `
5591a0a1a000-7ffca0b0f000 ---p 00000000 00:00 0                          [rollup]
Rss:              612344 kB
Pss:              598200 kB
Shared_Clean:      14000 kB
Private_Dirty:    590000 kB
Swap:                  0 kB
`;

// One 500 MiB anon (heap), one 64 MiB anon (arena), a jar, a [stack], one small anon.
const SMAPS_SAMPLE = `
7f0000000000-7f001f400000 rw-p 00000000 00:00 0
Size:             512000 kB
Rss:              480000 kB
7f0040000000-7f0044000000 rw-p 00000000 00:00 0
Size:              65536 kB
Rss:               60000 kB
7f0050000000-7f0050400000 r--s 00000000 08:01 123456                     /app/app.jar
Size:               4096 kB
Rss:                2048 kB
7ffd10000000-7ffd10021000 rw-p 00000000 00:00 0                          [stack]
Size:                132 kB
Rss:                  88 kB
7f0060000000-7f0060100000 rw-p 00000000 00:00 0
Size:               1024 kB
Rss:                 512 kB
`;

const PMAP_SAMPLE = `
Address           Kbytes     RSS   Dirty Mode  Mapping
00007f0000000000  512000  480000  480000 rw---   [ anon ]
00007f0040000000   65536   60000   60000 rw---   [ anon ]
00007f0050000000    4096    2048       0 r--s-  app.jar
00007f0058000000    2048    1500       0 r-x--  libjvm.so
total kB          583680  543548  540000
`;

const byName = (result: ReturnType<typeof parseSmaps>, name: string) => {
    if (result?.kind !== 'mappings') throw new Error('expected mappings');
    return result.categories.find((c) => c.name === name)!;
};

describe('parseSmaps rollup', () => {
    it('reads the totals from smaps_rollup', () => {
        const result = parseSmaps(ROLLUP_SAMPLE);
        expect(result).toEqual({
            kind: 'rollup',
            rssKiB: 612344,
            pssKiB: 598200,
            privateDirtyKiB: 590000,
            swapKiB: 0,
        });
    });

    it('accepts bare field lines without the [rollup] header', () => {
        const result = parseSmaps('Rss: 1024 kB\nPss: 900 kB');
        expect(result).toMatchObject({ kind: 'rollup', rssKiB: 1024, pssKiB: 900 });
    });
});

describe('parseSmaps full smaps', () => {
    it('buckets mappings into the heuristic categories', () => {
        const result = parseSmaps(SMAPS_SAMPLE);
        expect(result?.kind).toBe('mappings');
        if (result?.kind !== 'mappings') return;

        expect(byName(result, 'Heap (largest anon)').rssKiB).toBe(480000);
        expect(byName(result, 'glibc malloc arenas (signature)').rssKiB).toBe(60000);
        expect(byName(result, 'Mapped files (JARs, libs)').rssKiB).toBe(2048);
        expect(byName(result, 'Stacks').rssKiB).toBe(88);
        expect(byName(result, 'Other anonymous').rssKiB).toBe(512);
        expect(result.arenaCount).toBe(1);
        expect(result.totalRssKiB).toBe(480000 + 60000 + 2048 + 88 + 512);
    });

    it('keeps the category order stable for chart slots', () => {
        const result = parseSmaps(SMAPS_SAMPLE);
        if (result?.kind !== 'mappings') throw new Error('expected mappings');
        expect(result.categories.map((c) => c.name)).toEqual([...SMAPS_CATEGORIES]);
    });
});

describe('parseSmaps pmap -x', () => {
    it('parses the table format and applies the same heuristics', () => {
        const result = parseSmaps(PMAP_SAMPLE);
        expect(result?.kind).toBe('mappings');
        if (result?.kind !== 'mappings') return;

        expect(byName(result, 'Heap (largest anon)').rssKiB).toBe(480000);
        expect(byName(result, 'glibc malloc arenas (signature)').rssKiB).toBe(60000);
        expect(byName(result, 'Mapped files (JARs, libs)').rssKiB).toBe(2048 + 1500);
        expect(result.arenaCount).toBe(1);
    });
});

describe('parseSmaps rejection', () => {
    it('returns null for text in none of the three formats', () => {
        expect(parseSmaps('')).toBeNull();
        expect(parseSmaps('random log line\nanother line')).toBeNull();
    });
});
