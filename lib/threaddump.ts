export interface ThreadCpu {
    name: string;
    cpuMs: number;
    /** cpuMs / elapsed, when the header carries elapsed= (JDK 11+). */
    cpuPercent?: number;
}

export interface ThreadDumpReport {
    /** Java threads only (headers with a "#id"); VM-internal threads are not counted. */
    totalThreads: number;
    daemonThreads: number;
    /** Thread.State value → count; threads without a state line count as "unknown". */
    byState: Record<string, number>;
    /** Thread-name patterns (digit runs collapsed to "#"), sorted by count desc. */
    pools: Array<{ pattern: string; count: number }>;
    /** Reserved upper bound: totalThreads × 1 MiB default -Xss. */
    stackReservedMiB: number;
    /** Top CPU consumers (headers with cpu=), sorted by cpuMs desc; empty when absent. */
    topCpu: ThreadCpu[];
}

// JDK 21+ inserts the OS thread id in brackets between "#n" and "daemon".
const HEADER_RE = /^"(.+?)"\s+#\d+(?:\s+\[\d+\])?(\s+daemon)?/;
const STATE_RE = /^\s+java\.lang\.Thread\.State:\s+(\w+)/;
const CPU_RE = /\bcpu=([\d.]+)ms\b/;
const ELAPSED_RE = /\belapsed=([\d.]+)s\b/;

/**
 * Parses `jstack <pid>` / `jcmd <pid> Thread.print` output.
 * Returns null when no Java thread header is found.
 */
export function parseThreadDump(text: string): ThreadDumpReport | null {
    const threads: Array<{ name: string; daemon: boolean; state?: string; cpuMs?: number; elapsedS?: number }> = [];

    for (const line of text.split(/\r?\n/)) {
        const header = HEADER_RE.exec(line);
        if (header) {
            const cpu = CPU_RE.exec(line);
            const elapsed = ELAPSED_RE.exec(line);
            threads.push({
                name: header[1],
                daemon: header[2] !== undefined,
                ...(cpu && { cpuMs: Number(cpu[1]) }),
                ...(elapsed && { elapsedS: Number(elapsed[1]) }),
            });
            continue;
        }
        const state = STATE_RE.exec(line);
        if (state && threads.length > 0 && threads[threads.length - 1].state === undefined) {
            threads[threads.length - 1].state = state[1];
        }
    }

    if (threads.length === 0) return null;

    const byState: Record<string, number> = {};
    const poolCounts = new Map<string, number>();
    for (const thread of threads) {
        const state = thread.state ?? 'unknown';
        byState[state] = (byState[state] ?? 0) + 1;
        const pattern = thread.name.replace(/\d+/g, '#');
        poolCounts.set(pattern, (poolCounts.get(pattern) ?? 0) + 1);
    }

    const topCpu: ThreadCpu[] = threads
        .filter((t) => t.cpuMs !== undefined && t.cpuMs > 0)
        .sort((a, b) => b.cpuMs! - a.cpuMs!)
        .slice(0, 5)
        .map((t) => ({
            name: t.name,
            cpuMs: t.cpuMs!,
            ...(t.elapsedS !== undefined && t.elapsedS > 0 && {
                cpuPercent: (t.cpuMs! / (t.elapsedS * 1000)) * 100,
            }),
        }));

    return {
        totalThreads: threads.length,
        daemonThreads: threads.filter((t) => t.daemon).length,
        byState,
        pools: [...poolCounts.entries()]
            .map(([pattern, count]) => ({ pattern, count }))
            .sort((a, b) => b.count - a.count),
        stackReservedMiB: threads.length,
        topCpu,
    };
}
