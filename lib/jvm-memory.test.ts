import { describe, expect, it } from 'vitest';
import {
    buildDockerComposeSnippet,
    buildEnvFileSnippet,
    buildJvmFlags,
    buildKubernetesSnippet,
    calculateMemory,
    gcThreadsFor,
    generationInfo,
    jitThreadsFor,
    optionalFlagNotes,
    solveHeapForContainer,
    type MemoryInputs,
} from './jvm-memory';

const baseInputs: MemoryInputs = {
    javaVersion: 25,
    gcType: 'G1',
    heapMiB: 384,
    threads: 85,
    stackSizeMiB: 1,
    classes: 30000,
    codeCacheMiB: 64,
    directMemoryMiB: 10,
    headroomPercent: 15,
};

describe('calculateMemory', () => {
    it('computes every component for the reference case', () => {
        const result = calculateMemory(baseInputs);

        expect(result.heap).toBe(384);
        expect(result.metaspace).toBe(147); // ceil(30000 * 5 KiB / 1024)
        expect(result.compressedClassSpace).toBe(44); // ceil(30000 * 1.5 KiB / 1024)
        expect(result.codeCache).toBe(64);
        expect(result.threadStacks).toBe(85); // 85 threads x 1 MiB reserved
        expect(result.directMemory).toBe(10);
        expect(result.gcStructures).toBe(20); // ceil(384 * 5%)
        expect(result.jvmInternals).toBe(70); // 40 base + ceil(30000 KiB / 1024)
        expect(result.subtotal).toBe(780);
        expect(result.headroom).toBe(117); // ceil(780 * 15%)
        expect(result.containerTotal).toBe(897);
    });

    it('counts the compressed class space inside the metaspace, not on top of it', () => {
        const result = calculateMemory(baseInputs);
        const componentsSum = result.heap + result.metaspace + result.codeCache
            + result.threadStacks + result.directMemory + result.gcStructures + result.jvmInternals;

        expect(result.compressedClassSpace).toBeLessThan(result.metaspace);
        expect(result.subtotal).toBe(componentsSum);
    });

    it('scales thread stacks as threads x stack size (reserved upper bound)', () => {
        const result = calculateMemory({ ...baseInputs, threads: 200, stackSizeMiB: 2 });
        expect(result.threadStacks).toBe(400);
    });

    it('calibrates GC structures per collector', () => {
        const forGc = (gcType: MemoryInputs['gcType']) =>
            calculateMemory({ ...baseInputs, gcType }).gcStructures;

        expect(forGc('Serial')).toBe(4); // 1% of 384
        expect(forGc('Parallel')).toBe(12); // 3% of 384
        expect(forGc('G1')).toBe(20); // 5% of 384
        expect(forGc('ZGC')).toBe(24); // 6% of 384
    });

    it('applies the headroom percentage on top of the subtotal', () => {
        const noHeadroom = calculateMemory({ ...baseInputs, headroomPercent: 0 });
        expect(noHeadroom.headroom).toBe(0);
        expect(noHeadroom.containerTotal).toBe(noHeadroom.subtotal);

        const withHeadroom = calculateMemory({ ...baseInputs, headroomPercent: 25 });
        expect(withHeadroom.headroom).toBe(195); // ceil(780 * 25%)
        expect(withHeadroom.containerTotal).toBe(975);
    });
});

describe('buildJvmFlags', () => {
    it('builds the lean production line with Xms equal to Xmx', () => {
        expect(buildJvmFlags(baseInputs)).toBe(
            '-XX:+UseG1GC -Xms384m -Xmx384m -Xss1m -XX:ReservedCodeCacheSize=64m '
            + '-XX:MaxDirectMemorySize=10m -XX:+ExitOnOutOfMemoryError',
        );
    });

    it('selects the flag of the chosen collector', () => {
        expect(buildJvmFlags({ ...baseInputs, gcType: 'ZGC' })).toContain('-XX:+UseZGC');
        expect(buildJvmFlags({ ...baseInputs, gcType: 'Serial' })).toContain('-XX:+UseSerialGC');
        expect(buildJvmFlags({ ...baseInputs, gcType: 'Parallel' })).toContain('-XX:+UseParallelGC');
    });

    it('expresses the heap as RAM percentages when requested, with Initial equal to Max', () => {
        const flags = buildJvmFlags(baseInputs, { ramPercentage: 42 });
        expect(flags).toContain('-XX:InitialRAMPercentage=42.0');
        expect(flags).toContain('-XX:MaxRAMPercentage=42.0');
        expect(flags).not.toContain('-Xms');
        expect(flags).not.toContain('-Xmx');
    });

    it('appends extra flags verbatim at the end of the line', () => {
        const flags = buildJvmFlags(baseInputs, { extraFlags: ['-XX:+UseCompactObjectHeaders'] });
        expect(flags.endsWith('-XX:+ExitOnOutOfMemoryError -XX:+UseCompactObjectHeaders')).toBe(true);

        const both = buildJvmFlags(baseInputs, { ramPercentage: 42, extraFlags: ['-XX:+UseCompactObjectHeaders'] });
        expect(both).toContain('-XX:MaxRAMPercentage=42.0');
        expect(both).toContain('-XX:+UseCompactObjectHeaders');
    });

    it('keeps diagnostic and default-value flags out of the copied line', () => {
        const flags = buildJvmFlags(baseInputs);
        expect(flags).not.toContain('NativeMemoryTracking');
        expect(flags).not.toContain('PrintNMTStatistics');
        expect(flags).not.toContain('UnlockDiagnosticVMOptions');
        expect(flags).not.toContain('MaxGCPauseMillis');
    });
});

describe('generationInfo', () => {
    it('reports the real 1/3 : 2/3 split for Serial and Parallel (NewRatio=2)', () => {
        for (const gcType of ['Serial', 'Parallel'] as const) {
            const info = generationInfo({ ...baseInputs, gcType });
            expect(info.kind).toBe('fixed');
            expect(info.youngMiB).toBe(128);
            expect(info.oldMiB).toBe(256);
        }
    });

    it('reports G1 as adaptive with no fixed numbers', () => {
        const info = generationInfo(baseInputs);
        expect(info.kind).toBe('adaptive');
        expect(info.youngMiB).toBeUndefined();
        expect(info.description).toContain('5%');
        expect(info.description).toContain('60%');
    });

    it('distinguishes ZGC on Java 21 (single-generation) from Java 25 (generational)', () => {
        const on21 = generationInfo({ ...baseInputs, javaVersion: 21, gcType: 'ZGC' });
        expect(on21.kind).toBe('none');
        expect(on21.description).toContain('ZGenerational');

        const on25 = generationInfo({ ...baseInputs, javaVersion: 25, gcType: 'ZGC' });
        expect(on25.kind).toBe('adaptive');
        expect(on25.description).toContain('generational');
    });
});

describe('buildKubernetesSnippet', () => {
    it('renders requests equal to limits with the flag line inlined', () => {
        const snippet = buildKubernetesSnippet(baseInputs, 897);

        expect(snippet.match(/memory: "897Mi"/g)).toHaveLength(2);
        expect(snippet).toContain('requests:');
        expect(snippet).toContain('limits:');
        expect(snippet).toContain('name: JAVA_TOOL_OPTIONS');
        expect(snippet).toContain(`value: "${buildJvmFlags(baseInputs)}"`);
    });

    it('passes the RAM-percentage style through to the flag line', () => {
        const snippet = buildKubernetesSnippet(baseInputs, 897, { ramPercentage: 42 });
        expect(snippet).toContain('-XX:MaxRAMPercentage=42.0');
        expect(snippet).not.toContain('-Xmx');
    });
});

describe('CPU sizing helpers', () => {
    it('approximates ParallelGCThreads ergonomics per collector', () => {
        expect(gcThreadsFor('Serial', 16)).toBe(1);
        expect(gcThreadsFor('G1', 4)).toBe(4);
        expect(gcThreadsFor('G1', 8)).toBe(8);
        expect(gcThreadsFor('G1', 16)).toBe(13); // 8 + floor(8 * 5/8)
        expect(gcThreadsFor('Parallel', 2)).toBe(2);
        expect(gcThreadsFor('ZGC', 16)).toBe(13);
    });

    it('approximates CICompilerCount ergonomics', () => {
        expect(jitThreadsFor(1)).toBe(2);
        expect(jitThreadsFor(2)).toBe(2);
        expect(jitThreadsFor(4)).toBe(3);
        expect(jitThreadsFor(32)).toBe(3);
    });
});

describe('alternative deployment snippets', () => {
    it('renders the Docker Compose variant with mem_limit as the cgroup limit', () => {
        const snippet = buildDockerComposeSnippet(baseInputs, 897);
        expect(snippet).toContain('mem_limit: 897m');
        expect(snippet).toContain(`JAVA_TOOL_OPTIONS: "${buildJvmFlags(baseInputs)}"`);
    });

    it('renders the env-file variant as a single assignment', () => {
        expect(buildEnvFileSnippet(baseInputs)).toBe(`JAVA_TOOL_OPTIONS="${buildJvmFlags(baseInputs)}"`);
    });
});

describe('solveHeapForContainer', () => {
    const containerInputs: Omit<MemoryInputs, 'heapMiB'> = { ...baseInputs };

    it('inverts the reference case exactly', () => {
        // calculateMemory(heap 384) gives containerTotal 897, so 897 must round-trip.
        const result = solveHeapForContainer(897, containerInputs);
        expect(result).not.toBeNull();
        expect(result!.heapMiB).toBe(384);
        expect(result!.breakdown.containerTotal).toBe(897);
        expect(result!.maxRamPercentage).toBe(42); // floor(384 / 897 * 100)
    });

    it('finds the largest heap that still fits the limit', () => {
        const result = solveHeapForContainer(1024, containerInputs)!;
        expect(result.breakdown.containerTotal).toBeLessThanOrEqual(1024);

        const oneMore = calculateMemory({ ...baseInputs, heapMiB: result.heapMiB + 1 });
        expect(oneMore.containerTotal).toBeGreaterThan(1024);
    });

    it('returns null when the fixed overheads alone exceed the limit', () => {
        // Fixed (non-heap) components for the base inputs total 376 MiB;
        // with 15% headroom the smallest feasible limit is 435 MiB (heap of 1).
        expect(solveHeapForContainer(434, containerInputs)).toBeNull();
        expect(solveHeapForContainer(435, containerInputs)!.heapMiB).toBe(1);
    });
});

describe('optionalFlagNotes', () => {
    const flagsOf = (inputs: MemoryInputs) => optionalFlagNotes(inputs).map((n) => n.flag);

    it('offers Compact Object Headers only on Java 25', () => {
        expect(flagsOf(baseInputs)).toContain('-XX:+UseCompactObjectHeaders');
        expect(flagsOf({ ...baseInputs, javaVersion: 21 })).not.toContain('-XX:+UseCompactObjectHeaders');
    });

    it('offers ZGenerational only for ZGC on Java 21', () => {
        expect(flagsOf({ ...baseInputs, javaVersion: 21, gcType: 'ZGC' })).toContain('-XX:+ZGenerational');
        expect(flagsOf({ ...baseInputs, javaVersion: 25, gcType: 'ZGC' })).not.toContain('-XX:+ZGenerational');
        expect(flagsOf({ ...baseInputs, javaVersion: 21, gcType: 'G1' })).not.toContain('-XX:+ZGenerational');
    });

    it('always offers NMT as a diagnostic note', () => {
        expect(flagsOf(baseInputs)).toContain('-XX:NativeMemoryTracking=summary');
    });
});
