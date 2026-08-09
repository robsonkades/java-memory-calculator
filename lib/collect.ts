export interface CollectOptions {
    nmt: boolean;
    histogram: boolean;
    threadDump: boolean;
    smaps: boolean;
    gcLogHint: boolean;
}

export interface CollectFile {
    file: string;
    /** jvm.expert page the file pastes into. */
    path: string;
}

/** Files the script produces for the enabled options, in emit order. */
export function collectFiles(options: CollectOptions): CollectFile[] {
    const files: CollectFile[] = [];
    if (options.nmt) files.push({ file: 'nmt.txt', path: '/nmt' });
    if (options.histogram) files.push({ file: 'histogram.txt', path: '/histogram' });
    if (options.threadDump) files.push({ file: 'threads.txt', path: '/threads' });
    if (options.smaps) files.push({ file: 'smaps.txt', path: '/smaps' });
    return files;
}

/**
 * POSIX shell script that captures JVM diagnostics inside the container.
 * Deliberately no `set -e`: one failing capture (e.g. NMT off) must not
 * abort the others, so every command carries an `|| echo` guard.
 */
export function buildCollectScript(options: CollectOptions): string {
    const parts: string[] = [
        '#!/bin/sh',
        '# jvm.expert diagnostics collector — run inside the container (kubectl exec -it <pod> -- sh).',
        '# Needs a JDK image (jcmd on the PATH). If pgrep picks the wrong process, run with PID=<pid>.',
        'PID=${PID:-$(pgrep -f java | head -1)}',
        'if [ -z "$PID" ]; then echo "No java process found — re-run with PID=<pid>."; exit 1; fi',
        'echo "Collecting JVM diagnostics for PID $PID..."',
    ];

    if (options.nmt) {
        parts.push(
            '',
            '# NMT: the JVM must have been STARTED with -XX:NativeMemoryTracking=summary',
            '# (it cannot be enabled on a running process — restart required if this fails).',
            'jcmd "$PID" VM.native_memory summary > nmt.txt 2>&1 || echo "NMT capture failed — was -XX:NativeMemoryTracking=summary set at startup?"',
        );
    }
    if (options.histogram) {
        parts.push(
            '',
            '# Class histogram: triggers a full GC-like walk; expect a brief pause.',
            'jcmd "$PID" GC.class_histogram > histogram.txt 2>&1 || echo "Histogram capture failed."',
        );
    }
    if (options.threadDump) {
        parts.push(
            '',
            'jcmd "$PID" Thread.print > threads.txt 2>&1 || echo "Thread dump failed."',
        );
    }
    if (options.smaps) {
        parts.push(
            '',
            '# Kernel-side memory map summary (what RSS is actually made of).',
            'cat /proc/"$PID"/smaps_rollup > smaps.txt 2>&1 || echo "smaps_rollup not available (needs Linux 4.14+)."',
        );
    }
    if (options.gcLogHint) {
        parts.push(
            '',
            '# GC log: cannot be captured retroactively — unified logging must be on from startup.',
            '# Add -Xlog:gc*:file=gc.log to the JVM flags, restart, let it run under load,',
            '# then paste gc.log at https://jvm.expert/gclog',
        );
    }

    const files = collectFiles(options);
    if (files.length > 0) {
        parts.push(
            '',
            `tar czf jvm-diagnostics.tgz ${files.map((f) => f.file).join(' ')} 2>/dev/null || echo "tar failed — grab the .txt files individually."`,
            'echo "Done: jvm-diagnostics.tgz — paste each file at:"',
            ...files.map((f) => `echo "  ${f.file.padEnd(14)} -> https://jvm.expert${f.path}"`),
        );
    }

    return parts.join('\n') + '\n';
}
