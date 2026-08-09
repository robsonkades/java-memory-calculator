import { describe, expect, it } from 'vitest';
import { buildCollectScript, collectFiles, type CollectOptions } from './collect';

const ALL: CollectOptions = { nmt: true, histogram: true, threadDump: true, smaps: true, gcLogHint: true };

describe('buildCollectScript', () => {
    it('emits every capture command when all options are on', () => {
        const script = buildCollectScript(ALL);

        expect(script).toContain('PID=${PID:-$(pgrep -f java | head -1)}');
        expect(script).toContain('jcmd "$PID" VM.native_memory summary > nmt.txt');
        expect(script).toContain('jcmd "$PID" GC.class_histogram > histogram.txt');
        expect(script).toContain('jcmd "$PID" Thread.print > threads.txt');
        expect(script).toContain('cat /proc/"$PID"/smaps_rollup > smaps.txt');
        expect(script).toContain('-Xlog:gc*:file=gc.log');
        expect(script).toContain('tar czf jvm-diagnostics.tgz nmt.txt histogram.txt threads.txt smaps.txt');
    });

    it('drops exactly the toggled-off blocks', () => {
        const noNmt = buildCollectScript({ ...ALL, nmt: false });
        expect(noNmt).not.toContain('VM.native_memory');
        expect(noNmt).toContain('GC.class_histogram');

        const noSmaps = buildCollectScript({ ...ALL, smaps: false });
        expect(noSmaps).not.toContain('smaps_rollup');
        expect(noSmaps).toContain('tar czf jvm-diagnostics.tgz nmt.txt histogram.txt threads.txt');

        const noHint = buildCollectScript({ ...ALL, gcLogHint: false });
        expect(noHint).not.toContain('-Xlog:gc');
    });

    it('never aborts on a single failed capture', () => {
        const script = buildCollectScript(ALL);
        expect(script).not.toContain('set -e');
        for (const line of script.split('\n')) {
            if (/^(jcmd|cat) /.test(line)) {
                expect(line).toContain('|| echo');
            }
        }
    });

    it('reminds that NMT must be enabled at startup', () => {
        expect(buildCollectScript(ALL)).toContain('-XX:NativeMemoryTracking=summary');
    });

    it('maps each produced file to its jvm.expert page', () => {
        expect(collectFiles(ALL)).toEqual([
            { file: 'nmt.txt', path: '/nmt' },
            { file: 'histogram.txt', path: '/histogram' },
            { file: 'threads.txt', path: '/threads' },
            { file: 'smaps.txt', path: '/smaps' },
        ]);
        expect(collectFiles({ ...ALL, threadDump: false })).toHaveLength(3);
    });
});
