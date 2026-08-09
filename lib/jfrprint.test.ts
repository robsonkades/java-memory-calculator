import { describe, expect, it } from 'vitest';
import { parseJfrPrint } from './jfrprint';

const SAMPLE = `
jdk.GCHeapSummary {
  startTime = 23:33:20.972 (2026-08-09)
  gcId = 3
  when = "Before GC"
  heapSpace = {
    start = 0x6C0000000
    committedEnd = 0x6C8000000
    committedSize = 128.0 MB
    reservedEnd = 0x7C0000000
    reservedSize = 4.0 GB
  }
  heapUsed = 96.0 MB
}

jdk.GCHeapSummary {
  startTime = 23:33:20.997 (2026-08-09)
  gcId = 3
  when = "After GC"
  heapSpace = {
    start = 0x6C0000000
    committedEnd = 0x6C8000000
    committedSize = 128.0 MB
    reservedEnd = 0x7C0000000
    reservedSize = 4.0 GB
  }
  heapUsed = 40.0 MB
}

jdk.GCHeapSummary {
  startTime = 23:34:02.101 (2026-08-09)
  gcId = 4
  when = "After GC"
  heapSpace = {
    start = 0x6C0000000
    committedEnd = 0x6C8000000
    committedSize = 128.0 MB
    reservedEnd = 0x7C0000000
    reservedSize = 4.0 GB
  }
  heapUsed = 34.4 MB
}

jdk.NativeMemoryUsage {
  startTime = 23:34:10.000 (2026-08-09)
  type = "Java Heap"
  reserved = 4.0 GB
  committed = 128.0 MB
}

jdk.NativeMemoryUsage {
  startTime = 23:34:10.000 (2026-08-09)
  type = "Thread"
  reserved = 41.2 MB
  committed = 4.1 MB
}

jdk.NativeMemoryUsage {
  startTime = 23:35:10.000 (2026-08-09)
  type = "Thread"
  reserved = 43.0 MB
  committed = 5.2 MB
}
`;

describe('parseJfrPrint', () => {
    it('estimates the live set from After-GC summaries only', () => {
        const report = parseJfrPrint(SAMPLE)!;

        expect(report.gcSummaryCount).toBe(3);
        expect(report.afterGcSamples).toBe(2);
        expect(report.liveSetMiB).toBe(34); // min(40.0, 34.4) rounded
        expect(report.recommendedHeapMiB).toBe(102); // ceil(34 * 3)
    });

    it('ignores nested heapSpace fields when reading heapUsed', () => {
        // committedSize = 128.0 MB lives inside heapSpace and must not leak
        // into the event's own fields — the live set would be wrong otherwise.
        expect(parseJfrPrint(SAMPLE)!.liveSetMiB).not.toBe(128);
    });

    it('keeps the latest NativeMemoryUsage snapshot per type, in first-seen order', () => {
        const report = parseJfrPrint(SAMPLE)!;

        expect(report.nativeMemory).toHaveLength(2);
        expect(report.nativeMemory[0]).toEqual({ type: 'Java Heap', committedMiB: 128, reservedMiB: 4096 });
        expect(report.nativeMemory[1]).toEqual({ type: 'Thread', committedMiB: 5.2, reservedMiB: 43 });
    });

    it('normalizes kB and GB suffixes to MiB', () => {
        const text = `
jdk.NativeMemoryUsage {
  type = "Code"
  reserved = 1.0 GB
  committed = 2048 kB
}
`;
        const report = parseJfrPrint(text)!;
        expect(report.nativeMemory[0].reservedMiB).toBe(1024);
        expect(report.nativeMemory[0].committedMiB).toBe(2);
    });

    it('handles NativeMemoryUsage-only recordings without a heap recommendation', () => {
        const text = `
jdk.NativeMemoryUsage {
  type = "GC"
  reserved = 100.0 MB
  committed = 25.0 MB
}
`;
        const report = parseJfrPrint(text)!;
        expect(report.liveSetMiB).toBeUndefined();
        expect(report.recommendedHeapMiB).toBeUndefined();
        expect(report.nativeMemory).toHaveLength(1);
    });

    it('parses comma-decimal sizes from a non-English JVM locale', () => {
        // Captured on pt-BR: jfr print formats numbers with the default locale.
        const text = `
jdk.GCHeapSummary {
  gcId = 0
  when = "After GC"
  heapUsed = 41,1 MB
}

jdk.NativeMemoryUsage {
  type = "Java Heap"
  reserved = 7,9 GB
  committed = 304,0 MB
}
`;
        const report = parseJfrPrint(text)!;
        expect(report.liveSetMiB).toBe(41);
        expect(report.recommendedHeapMiB).toBe(123);
        expect(report.nativeMemory[0]).toEqual({
            type: 'Java Heap',
            committedMiB: 304,
            reservedMiB: 7.9 * 1024,
        });
    });

    it('returns null for text without recognized events', () => {
        expect(parseJfrPrint('')).toBeNull();
        expect(parseJfrPrint('jdk.ExecutionSample {\n  sampledThread = "main"\n}')).toBeNull();
        expect(parseJfrPrint('random log output')).toBeNull();
    });
});
