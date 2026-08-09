import { describe, expect, it } from 'vitest';
import { parseThreadDump } from './threaddump';

const SAMPLE = `
2026-08-09 16:00:00
Full thread dump OpenJDK 64-Bit Server VM (25+36 mixed mode):

"main" #1 prio=5 os_prio=0 cpu=1234ms elapsed=56.78s tid=0x0000012345 nid=0x1a00 waiting on condition
   java.lang.Thread.State: WAITING (parking)

"pool-1-thread-1" #23 daemon prio=5 os_prio=0 cpu=1ms elapsed=50.0s tid=0x0000012346 nid=0x1a01 waiting on condition
   java.lang.Thread.State: TIMED_WAITING (parking)

"pool-1-thread-2" #24 daemon prio=5 os_prio=0 cpu=2ms elapsed=50.0s tid=0x0000012347 nid=0x1a02 waiting on condition
   java.lang.Thread.State: TIMED_WAITING (parking)

"http-nio-8080-exec-1" #31 daemon prio=5 os_prio=0 cpu=9ms elapsed=49.0s tid=0x0000012348 nid=0x1a03 runnable
   java.lang.Thread.State: RUNNABLE

"http-nio-8080-exec-2" #32 daemon prio=5 os_prio=0 cpu=8ms elapsed=49.0s tid=0x0000012349 nid=0x1a04 waiting on condition
   java.lang.Thread.State: TIMED_WAITING (parking)

"mystery" #40 prio=5 os_prio=0 tid=0x000001234a nid=0x1a05 runnable

"GC Thread#0" os_prio=2 tid=0x000001234b nid=0x1a06 runnable
`;

describe('parseThreadDump', () => {
    it('counts Java threads, daemons and states', () => {
        const report = parseThreadDump(SAMPLE)!;

        expect(report.totalThreads).toBe(6); // VM thread "GC Thread#0" has no "#id" and is excluded
        expect(report.daemonThreads).toBe(4);
        expect(report.byState).toEqual({
            WAITING: 1,
            TIMED_WAITING: 3,
            RUNNABLE: 1,
            unknown: 1,
        });
    });

    it('groups threads into pools by collapsing digit runs', () => {
        const pools = parseThreadDump(SAMPLE)!.pools;

        expect(pools[0]).toEqual({ pattern: 'pool-#-thread-#', count: 2 });
        expect(pools[1]).toEqual({ pattern: 'http-nio-#-exec-#', count: 2 });
    });

    it('reports the reserved stack upper bound at 1 MiB per thread', () => {
        expect(parseThreadDump(SAMPLE)!.stackReservedMiB).toBe(6);
    });

    it('returns null for text without thread headers', () => {
        expect(parseThreadDump('')).toBeNull();
        expect(parseThreadDump('random log output')).toBeNull();
    });
});
