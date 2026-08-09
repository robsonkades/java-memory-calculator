import { describe, expect, it } from 'vitest';
import { auditJvmFlags, fixJvmFlags } from './flags-audit';

const findingFor = (audit: NonNullable<ReturnType<typeof auditJvmFlags>>, flagPart: string) =>
    audit.findings.find((f) => f.flag.includes(flagPart));

describe('auditJvmFlags', () => {
    it('extracts sizing values and the collector from a typical line', () => {
        const audit = auditJvmFlags(
            'java -Xmx512m -Xms256m -Xss1m -XX:+UseG1GC -XX:ReservedCodeCacheSize=128m '
            + '-XX:MaxDirectMemorySize=64m -Dspring.profiles.active=prod -jar app.jar',
        )!;

        expect(audit.extracted).toMatchObject({
            heapMiB: 512,
            xmsMiB: 256,
            stackSizeMiB: 1,
            gcType: 'G1',
            codeCacheMiB: 128,
            directMemoryMiB: 64,
        });
        expect(findingFor(audit, '-Xms/-Xmx')!.severity).toBe('advice'); // 256 != 512
    });

    it('parses size suffixes into MiB', () => {
        expect(auditJvmFlags('-Xmx2g')!.extracted.heapMiB).toBe(2048);
        expect(auditJvmFlags('-Xmx524288k')!.extracted.heapMiB).toBe(512);
    });

    it('flags removed collectors as problems', () => {
        const audit = auditJvmFlags('-XX:+UseConcMarkSweepGC -Xmx1g')!;
        const cms = findingFor(audit, 'UseConcMarkSweepGC')!;
        expect(cms.severity).toBe('problem');
        expect(audit.findings[0].severity).toBe('problem'); // sorted most severe first
    });

    it('flags -Xmx combined with MaxRAMPercentage as a problem', () => {
        const audit = auditJvmFlags('-Xmx1g -XX:MaxRAMPercentage=75.0')!;
        expect(findingFor(audit, 'MaxRAMPercentage')!.severity).toBe('problem');
        expect(audit.extracted.heapMiB).toBe(1024);
        expect(audit.extracted.maxRamPercentage).toBe(75);
    });

    it('advises on missing container hygiene flags', () => {
        const audit = auditJvmFlags('-Xmx512m -Xms512m -XX:+UseG1GC')!;
        expect(findingFor(audit, 'MaxDirectMemorySize')!.severity).toBe('advice');
        expect(findingFor(audit, 'ExitOnOutOfMemoryError')!.severity).toBe('advice');
    });

    it('marks redundant defaults and leftover diagnostics', () => {
        const audit = auditJvmFlags(
            '-Xmx512m -XX:MaxGCPauseMillis=200 -XX:+UseContainerSupport -XX:NativeMemoryTracking=summary',
        )!;
        expect(findingFor(audit, 'MaxGCPauseMillis')!.severity).toBe('info');
        expect(findingFor(audit, 'UseContainerSupport')!.severity).toBe('info');
        expect(findingFor(audit, 'NativeMemoryTracking')!.severity).toBe('advice');
    });

    it('reports duplicated flags with last-one-wins extraction', () => {
        const audit = auditJvmFlags('-Xmx512m -Xmx1g')!;
        expect(findingFor(audit, 'Xmx')!.message).toContain('more than once');
        expect(audit.extracted.heapMiB).toBe(1024);
    });

    it('collects recognized-syntax but unmodeled flags as unknown', () => {
        expect(auditJvmFlags('-Xmx1g -XX:+UnlockExperimentalVMOptions')!.unknownFlags).toContain('UnlockExperimentalVMOptions');
    });

    it('returns null when the text has no JVM flags', () => {
        expect(auditJvmFlags('kubectl get pods -n prod')).toBeNull();
        expect(auditJvmFlags('-Dspring.profiles.active=prod')).toBeNull();
        expect(auditJvmFlags('')).toBeNull();
    });
});

describe('auditJvmFlags version-aware rules', () => {
    it('grades UseBiasedLocking by version', () => {
        expect(findingFor(auditJvmFlags('-XX:+UseBiasedLocking', 25)!, 'UseBiasedLocking')!.severity).toBe('problem');
        expect(findingFor(auditJvmFlags('-XX:+UseBiasedLocking', 21)!, 'UseBiasedLocking')!.severity).toBe('problem');
        expect(findingFor(auditJvmFlags('-XX:+UseBiasedLocking', 17)!, 'UseBiasedLocking')!.severity).toBe('advice');
    });

    it('grades ZGenerational by version', () => {
        expect(findingFor(auditJvmFlags('-XX:+ZGenerational', 25)!, 'ZGenerational')!.severity).toBe('problem');
        expect(findingFor(auditJvmFlags('-XX:+ZGenerational', 21)!, 'ZGenerational')!.severity).toBe('advice');
        expect(findingFor(auditJvmFlags('-XX:+ZGenerational', 17)!, 'ZGenerational')!.severity).toBe('problem');
    });

    it('grades Compact Object Headers by version', () => {
        expect(findingFor(auditJvmFlags('-XX:+UseCompactObjectHeaders', 25)!, 'UseCompactObjectHeaders')!.severity).toBe('info');
        expect(findingFor(auditJvmFlags('-XX:+UseCompactObjectHeaders', 21)!, 'UseCompactObjectHeaders')!.severity).toBe('problem');
        expect(findingFor(auditJvmFlags('-XX:+UseCompactObjectHeaders', 17)!, 'UseCompactObjectHeaders')!.severity).toBe('problem');
    });

    it('flags pre-JDK-9 logging flags with the -Xlog replacement', () => {
        const finding = findingFor(auditJvmFlags('-XX:+PrintGCDetails', 21)!, 'PrintGCDetails')!;
        expect(finding.severity).toBe('problem');
        expect(finding.message).toContain('-Xlog');
    });

    it('flags AggressiveOpts as removed on every version', () => {
        for (const version of [17, 21, 25] as const) {
            expect(findingFor(auditJvmFlags('-XX:+AggressiveOpts', version)!, 'AggressiveOpts')!.severity).toBe('problem');
        }
    });
});

describe('auditJvmFlags expanded rules', () => {
    it('advises on performance foot-guns', () => {
        expect(findingFor(auditJvmFlags('-XX:TieredStopAtLevel=1')!, 'TieredStopAtLevel')!.severity).toBe('advice');
        expect(findingFor(auditJvmFlags('-Xint -Xmx1g')!, '-Xint')!.severity).toBe('advice');
        expect(findingFor(auditJvmFlags('-XX:-UseCompressedOops')!, 'UseCompressedOops')!.severity).toBe('advice');
    });

    it('informs on operational hygiene', () => {
        expect(findingFor(auditJvmFlags('-XX:+HeapDumpOnOutOfMemoryError')!, 'HeapDumpPath')!.severity).toBe('info');
        expect(findingFor(auditJvmFlags('-XX:+UseLargePages')!, 'UseLargePages')!.severity).toBe('info');
        expect(findingFor(auditJvmFlags('-XX:+DisableExplicitGC')!, 'DisableExplicitGC')!.severity).toBe('info');
        expect(findingFor(auditJvmFlags('-XX:+AlwaysPreTouch')!, 'AlwaysPreTouch')!.severity).toBe('info');
        expect(findingFor(auditJvmFlags('-XX:ParallelGCThreads=16')!, 'ParallelGCThreads')!.severity).toBe('info');
    });

    it('questions string deduplication outside G1', () => {
        const audit = auditJvmFlags('-XX:+UseParallelGC -XX:+UseStringDeduplication')!;
        expect(findingFor(audit, 'UseStringDeduplication')!.severity).toBe('info');
        expect(findingFor(auditJvmFlags('-XX:+UseG1GC -XX:+UseStringDeduplication')!, 'UseStringDeduplication')).toBeUndefined();
    });

    it('does not fire the HeapDumpPath note when a path is set', () => {
        const audit = auditJvmFlags('-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/dumps')!;
        expect(findingFor(audit, 'HeapDumpPath')).toBeUndefined();
    });
});

describe('fixJvmFlags', () => {
    it('rewrites a messy line into the expected fixed string', () => {
        const result = fixJvmFlags(
            'java -Xmx1g -XX:MaxRAMPercentage=75.0 -XX:+UseConcMarkSweepGC -XX:MaxGCPauseMillis=200 '
            + '-XX:NativeMemoryTracking=summary -Dspring.profiles.active=prod -jar app.jar',
            25,
        )!;

        expect(result.fixed).toBe(
            'java -XX:MaxRAMPercentage=75.0 -XX:InitialRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError '
            + '-Dspring.profiles.active=prod -jar app.jar',
        );
        const kinds = Object.fromEntries(result.changes.map((c) => [c.token, c.kind]));
        expect(kinds['-Xmx1g']).toBe('removed');
        expect(kinds['-XX:+UseConcMarkSweepGC']).toBe('removed');
        expect(kinds['-XX:MaxGCPauseMillis=200']).toBe('removed');
        expect(kinds['-XX:NativeMemoryTracking=summary']).toBe('removed');
        expect(kinds['-XX:InitialRAMPercentage=75.0']).toBe('added');
        expect(kinds['-XX:+ExitOnOutOfMemoryError']).toBe('added');
    });

    it('keeps the percentage pair and aligns Initial with Max', () => {
        const result = fixJvmFlags('-XX:InitialRAMPercentage=50.0 -XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError')!;
        expect(result.fixed).toBe('-XX:InitialRAMPercentage=75.0 -XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError');
        expect(result.changes.find((c) => c.kind === 'replaced')!.token).toBe('-XX:InitialRAMPercentage=50.0');
    });

    it('forces -Xms equal to -Xmx when the fixed style remains', () => {
        expect(fixJvmFlags('-Xmx2g -XX:+ExitOnOutOfMemoryError')!.fixed).toBe('-Xmx2g -Xms2g -XX:+ExitOnOutOfMemoryError');
        expect(fixJvmFlags('-Xms256m -Xmx512m -XX:+ExitOnOutOfMemoryError')!.fixed).toBe('-Xms512m -Xmx512m -XX:+ExitOnOutOfMemoryError');
    });

    it('preserves -D tokens verbatim and in order', () => {
        const result = fixJvmFlags('-Dfirst=1 -Xmx512m -Xms512m -XX:+ExitOnOutOfMemoryError -Dsecond=2')!;
        expect(result.fixed).toBe('-Dfirst=1 -Xmx512m -Xms512m -XX:+ExitOnOutOfMemoryError -Dsecond=2');
    });

    it('differs by Java version for Compact Object Headers', () => {
        const line = '-Xmx512m -Xms512m -XX:+UseCompactObjectHeaders -XX:+ExitOnOutOfMemoryError';
        const on25 = fixJvmFlags(line, 25)!;
        expect(on25.fixed).toContain('-XX:+UseCompactObjectHeaders');
        expect(on25.changes.find((c) => c.token === '-XX:+UseCompactObjectHeaders')!.kind).toBe('kept');

        const on17 = fixJvmFlags(line, 17)!;
        expect(on17.fixed).not.toContain('UseCompactObjectHeaders');
        expect(on17.changes.find((c) => c.token === '-XX:+UseCompactObjectHeaders')!.kind).toBe('removed');
    });

    it('drops duplicates keeping the last occurrence', () => {
        const result = fixJvmFlags('-Xmx512m -Xmx1g -Xms1g -XX:+ExitOnOutOfMemoryError')!;
        expect(result.fixed).toBe('-Xmx1g -Xms1g -XX:+ExitOnOutOfMemoryError');
        expect(result.changes.find((c) => c.token === '-Xmx512m')!.kind).toBe('removed');
    });

    it('returns null when the text has no JVM flags', () => {
        expect(fixJvmFlags('kubectl get pods')).toBeNull();
    });
});
