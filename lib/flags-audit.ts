import type { GcType } from './jvm-memory';

export type AuditJavaVersion = 17 | 21 | 25;
export type AuditSeverity = 'problem' | 'advice' | 'info';

export interface AuditFinding {
    severity: AuditSeverity;
    flag: string;
    message: string;
}

/** Values recognized in the line, used to prefill the calculator. */
export interface ExtractedFlags {
    heapMiB?: number;
    xmsMiB?: number;
    stackSizeMiB?: number;
    codeCacheMiB?: number;
    directMemoryMiB?: number;
    gcType?: GcType;
    maxRamPercentage?: number;
}

export interface FlagsAudit {
    findings: AuditFinding[];
    extracted: ExtractedFlags;
    unknownFlags: string[];
}

export interface FixChange {
    kind: 'removed' | 'replaced' | 'added' | 'kept';
    token: string;
    reason: string;
}

export interface FixedFlags {
    fixed: string;
    changes: FixChange[];
}

const SIZE_RE = /^(\d+)([kKmMgGtT]?)$/;

function sizeToMiB(value: string): number | undefined {
    const match = SIZE_RE.exec(value);
    if (!match) return undefined;
    const n = Number(match[1]);
    switch (match[2].toLowerCase()) {
        case 'k': return Math.round(n / 1024);
        case 'm': return n;
        case 'g': return n * 1024;
        case 't': return n * 1024 * 1024;
        default: return Math.round(n / (1024 * 1024)); // bare bytes
    }
}

interface Token {
    raw: string;
    /** JVM flag name; undefined for tokens that are not ours to audit (-D, -jar, paths). */
    name?: string;
    sign?: '+' | '-';
    value?: string;
    /** Raw size literal for -Xmx/-Xms/-Xss/-Xmn, e.g. "512m". */
    sizeStr?: string;
    sizeMiB?: number;
}

function parseToken(raw: string): Token {
    if (raw === '-Xint') return { raw, name: 'Xint' };
    const xSize = /^-(Xmx|Xms|Xss|Xmn)(.+)$/.exec(raw);
    if (xSize) return { raw, name: xSize[1], sizeStr: xSize[2], sizeMiB: sizeToMiB(xSize[2]) };
    const xxBool = /^-XX:([+-])([A-Za-z0-9]+)$/.exec(raw);
    if (xxBool) return { raw, name: xxBool[2], sign: xxBool[1] as '+' | '-' };
    const xxValue = /^-XX:([A-Za-z0-9]+)=(.*)$/.exec(raw);
    if (xxValue) return { raw, name: xxValue[1], value: xxValue[2] };
    return { raw };
}

const MODELED_GC: Record<string, GcType> = {
    UseG1GC: 'G1',
    UseZGC: 'ZGC',
    UseSerialGC: 'Serial',
    UseParallelGC: 'Parallel',
};

interface VersionedRule {
    severity: AuditSeverity;
    message: string;
    /** Set when the fixer must drop the flag on this version. */
    breaksStartup: boolean;
}

function versionedRule(name: string, v: AuditJavaVersion): VersionedRule | null {
    switch (name) {
        case 'UseConcMarkSweepGC':
            return { severity: 'problem', breaksStartup: true, message: 'CMS was removed in JDK 14 — the JVM will not start with this flag.' };
        case 'UseParallelOldGC':
            return { severity: 'problem', breaksStartup: true, message: 'Removed in JDK 15 (merged into Parallel GC) — use -XX:+UseParallelGC alone.' };
        case 'AggressiveOpts':
            return { severity: 'problem', breaksStartup: true, message: 'Removed in JDK 12 — the JVM will not start with this flag.' };
        case 'PrintGCDetails':
        case 'PrintGC':
            return { severity: 'problem', breaksStartup: true, message: 'Removed in JDK 9 with unified logging — use -Xlog:gc* instead; the JVM will not start with this flag.' };
        case 'UseBiasedLocking':
            return v >= 21
                ? { severity: 'problem', breaksStartup: true, message: 'Biased locking was removed in JDK 20 — the JVM will not start with this flag.' }
                : { severity: 'advice', breaksStartup: false, message: 'Deprecated and disabled by default since JDK 15 — remove the flag; biased locking is gone in later JDKs.' };
        case 'ZGenerational':
            if (v === 17) return { severity: 'problem', breaksStartup: true, message: 'Generational ZGC does not exist on Java 17 — unknown flag, the JVM will not start.' };
            if (v === 25) return { severity: 'problem', breaksStartup: true, message: 'Removed in JDK 24 (generational is ZGC\'s only mode) — the JVM will not start with this flag on Java 25.' };
            return { severity: 'advice', breaksStartup: false, message: 'Valid opt-in on JDK 21/22 (generational ZGC became the default in 23). Plan to drop it when moving past Java 23.' };
        case 'UseCompactObjectHeaders':
            return v === 25
                ? { severity: 'info', breaksStartup: false, message: 'Product flag on Java 25 (off by default): shrinks object headers from 12 to 8 bytes, typically 10–20% heap savings in small-object workloads. Good call — measure the gain.' }
                : { severity: 'problem', breaksStartup: true, message: `Compact Object Headers (JEP 519) only exist from JDK 24 — unknown flag, the JVM will not start on Java ${v}.` };
        default:
            return null;
    }
}

const SEVERITY_ORDER: Record<AuditSeverity, number> = { problem: 0, advice: 1, info: 2 };

const KNOWN = new Set([
    ...Object.keys(MODELED_GC),
    'UseShenandoahGC', 'UseConcMarkSweepGC', 'UseParallelOldGC',
    'MaxRAMPercentage', 'InitialRAMPercentage', 'MinRAMPercentage',
    'MaxDirectMemorySize', 'ReservedCodeCacheSize', 'NativeMemoryTracking',
    'PrintNMTStatistics', 'UnlockDiagnosticVMOptions', 'MaxGCPauseMillis',
    'UseContainerSupport', 'ZGenerational', 'NewRatio', 'NewSize', 'MaxNewSize',
    'ExitOnOutOfMemoryError', 'CrashOnOutOfMemoryError', 'HeapDumpOnOutOfMemoryError',
    'HeapDumpPath', 'MaxMetaspaceSize', 'MetaspaceSize', 'UseCompactObjectHeaders',
    'UseStringDeduplication',
    'UseBiasedLocking', 'PrintGCDetails', 'PrintGC', 'AggressiveOpts',
    'TieredStopAtLevel', 'UseCompressedOops', 'UseLargePages', 'DisableExplicitGC',
    'AlwaysPreTouch', 'ParallelGCThreads',
    'Xmx', 'Xms', 'Xss', 'Xmn', 'Xint',
]);

/**
 * Audits a JVM command line / JAVA_TOOL_OPTIONS value for container
 * deployments on the given Java version. Returns null when no -X/-XX flag
 * is found in the text.
 */
export function auditJvmFlags(line: string, javaVersion: AuditJavaVersion = 25): FlagsAudit | null {
    const tokens = line.split(/\s+/).filter(Boolean).map(parseToken);
    if (!tokens.some((t) => t.name !== undefined)) return null;

    const findings: AuditFinding[] = [];
    const extracted: ExtractedFlags = {};
    const unknownFlags: string[] = [];
    const seen = new Map<string, number>();
    const rawByName = new Map<string, string>();
    const boolFlags = new Set<string>();
    const minusFlags = new Set<string>();
    const valueFlags = new Map<string, string>();

    for (const token of tokens) {
        if (token.name === undefined) continue;
        seen.set(token.name, (seen.get(token.name) ?? 0) + 1);
        rawByName.set(token.name, token.raw);
        if (token.sign === '+') boolFlags.add(token.name);
        if (token.sign === '-') minusFlags.add(token.name);
        if (token.value !== undefined) valueFlags.set(token.name, token.value);

        if (token.sizeStr !== undefined) {
            if (token.sizeMiB === undefined) {
                findings.push({ severity: 'problem', flag: token.raw, message: `Unparseable size "${token.sizeStr}" — the JVM will refuse to start.` });
            } else if (token.name === 'Xmx') extracted.heapMiB = token.sizeMiB;
            else if (token.name === 'Xms') extracted.xmsMiB = token.sizeMiB;
            else if (token.name === 'Xss') extracted.stackSizeMiB = token.sizeMiB;
        }
    }

    for (const [name, count] of seen) {
        if (count > 1) {
            findings.push({ severity: 'advice', flag: name, message: 'Appears more than once — only the last occurrence takes effect.' });
        }
    }

    // Version-dependent lifecycle rules
    for (const name of seen.keys()) {
        const rule = versionedRule(name, javaVersion);
        if (rule) findings.push({ severity: rule.severity, flag: rawByName.get(name) ?? name, message: rule.message });
    }

    // Collector
    let modeledGc: GcType | undefined;
    for (const [flagName, gc] of Object.entries(MODELED_GC)) {
        if (boolFlags.has(flagName)) {
            modeledGc = gc;
            extracted.gcType = gc;
        }
    }
    if (boolFlags.has('UseShenandoahGC')) {
        findings.push({ severity: 'info', flag: '-XX:+UseShenandoahGC', message: 'Shenandoah is a valid low-latency collector, but this calculator does not model its native overhead — ZGC is the closest modeled option.' });
    }

    // Heap sizing
    const maxRam = valueFlags.get('MaxRAMPercentage');
    if (maxRam !== undefined) {
        const pct = Number(maxRam);
        if (Number.isFinite(pct)) extracted.maxRamPercentage = pct;
    }
    if (extracted.heapMiB !== undefined && maxRam !== undefined) {
        findings.push({ severity: 'problem', flag: '-Xmx + -XX:MaxRAMPercentage', message: 'Both set: -Xmx takes precedence and MaxRAMPercentage is silently ignored. Keep only one.' });
    } else if (extracted.heapMiB !== undefined) {
        if (extracted.xmsMiB === undefined) {
            findings.push({ severity: 'advice', flag: '-Xms', message: 'Not set: the heap starts small and grows, hiding the real footprint. Set -Xms equal to -Xmx — or switch to a computed -XX:MaxRAMPercentage with Initial equal to Max.' });
        } else if (extracted.xmsMiB !== extracted.heapMiB) {
            findings.push({ severity: 'advice', flag: '-Xms/-Xmx', message: 'Different values: in a container with a fixed limit, a growing heap only makes the footprint unpredictable. Set them equal.' });
        }
        findings.push({ severity: 'advice', flag: '-Xmx', message: 'Fixed heap: consider -XX:MaxRAMPercentage computed for your container limit instead — one source of truth, the heap follows the limit.' });
    } else if (maxRam === undefined) {
        findings.push({ severity: 'advice', flag: 'heap', message: 'No -Xmx and no MaxRAMPercentage: the heap defaults to 25% of the container limit — usually far too small for a dedicated JVM pod.' });
    }
    if (maxRam !== undefined && extracted.heapMiB === undefined
        && !valueFlags.has('InitialRAMPercentage')) {
        findings.push({ severity: 'advice', flag: '-XX:InitialRAMPercentage', message: 'Not set: pair it with MaxRAMPercentage (same value) for a predictable footprint, like -Xms = -Xmx.' });
    }

    // Native memory budget
    const directMemory = valueFlags.get('MaxDirectMemorySize');
    if (directMemory !== undefined) {
        const mib = sizeToMiB(directMemory);
        if (mib !== undefined) extracted.directMemoryMiB = mib;
    } else {
        findings.push({ severity: 'advice', flag: '-XX:MaxDirectMemorySize', message: 'Not set: direct (NIO) memory silently defaults to the heap size. Set it explicitly to make the native budget predictable.' });
    }
    const codeCache = valueFlags.get('ReservedCodeCacheSize');
    if (codeCache !== undefined) {
        const mib = sizeToMiB(codeCache);
        if (mib !== undefined) extracted.codeCacheMiB = mib;
    }

    // Diagnostics left on
    if (valueFlags.has('NativeMemoryTracking')) {
        findings.push({ severity: 'advice', flag: '-XX:NativeMemoryTracking', message: 'Diagnostic tracking costs extra native memory and CPU (typically 5–10%). Enable it to investigate, not as a permanent production default.' });
    }
    for (const diag of ['PrintNMTStatistics', 'UnlockDiagnosticVMOptions'] as const) {
        if (boolFlags.has(diag)) {
            findings.push({ severity: 'info', flag: `-XX:+${diag}`, message: 'Diagnostic flag — noise in a production line unless you are actively investigating.' });
        }
    }

    // Redundant defaults
    if (valueFlags.get('MaxGCPauseMillis') === '200') {
        findings.push({ severity: 'info', flag: '-XX:MaxGCPauseMillis=200', message: '200 ms is already the G1 default — the flag is redundant.' });
    } else if (valueFlags.has('MaxGCPauseMillis') && modeledGc !== undefined && modeledGc !== 'G1') {
        findings.push({ severity: 'info', flag: '-XX:MaxGCPauseMillis', message: `Only meaningful for G1 — ${modeledGc} ignores it.` });
    }
    if (boolFlags.has('UseContainerSupport')) {
        findings.push({ severity: 'info', flag: '-XX:+UseContainerSupport', message: 'Default since JDK 10 — the flag is redundant.' });
    }

    // Young generation pinning under G1
    if (modeledGc === 'G1' && (seen.has('Xmn') || valueFlags.has('NewRatio') || valueFlags.has('NewSize') || valueFlags.has('MaxNewSize'))) {
        findings.push({ severity: 'advice', flag: 'young gen sizing', message: 'Fixing the young generation size disables G1\'s adaptive sizing, its main mechanism for meeting the pause-time goal.' });
    }

    // Container hygiene
    if (!boolFlags.has('ExitOnOutOfMemoryError') && !boolFlags.has('CrashOnOutOfMemoryError')) {
        findings.push({ severity: 'advice', flag: '-XX:+ExitOnOutOfMemoryError', message: 'Not set: on OutOfMemoryError the JVM limps on in a broken state. In a container, failing fast and letting the orchestrator restart is the safe behavior.' });
    }
    if (valueFlags.has('MaxMetaspaceSize')) {
        findings.push({ severity: 'info', flag: '-XX:MaxMetaspaceSize', message: 'Caps class metadata (unlimited by default). Too low a cap trades a clear native-memory footprint for OutOfMemoryError: Metaspace — size it from measured NMT data.' });
    }

    // Performance and hygiene rules
    if (valueFlags.get('TieredStopAtLevel') === '1') {
        findings.push({ severity: 'advice', flag: '-XX:TieredStopAtLevel=1', message: 'Stops JIT compilation at C1: fast startup, permanently capped peak performance. Only right for short-lived tools, never for a long-running service.' });
    }
    if (seen.has('Xint')) {
        findings.push({ severity: 'advice', flag: '-Xint', message: 'Interpreter-only mode — an order of magnitude slower. Surely not intended in production.' });
    }
    if (minusFlags.has('UseCompressedOops')) {
        findings.push({ severity: 'advice', flag: '-XX:-UseCompressedOops', message: 'Disabling compressed oops only makes sense for heaps above ~32 GiB; below that it just doubles reference size and wastes heap.' });
    }
    if (boolFlags.has('HeapDumpOnOutOfMemoryError') && !valueFlags.has('HeapDumpPath')) {
        findings.push({ severity: 'info', flag: '-XX:HeapDumpPath', message: 'Not set: the dump lands in the working directory — in a container that is ephemeral disk, gone with the pod. Point it at a mounted volume.' });
    }
    if (boolFlags.has('UseLargePages')) {
        findings.push({ severity: 'info', flag: '-XX:+UseLargePages', message: 'Requires host/node configuration (hugepages); without it the JVM silently falls back to regular pages.' });
    }
    if (boolFlags.has('UseStringDeduplication') && modeledGc !== undefined && modeledGc !== 'G1') {
        findings.push({ severity: 'info', flag: '-XX:+UseStringDeduplication', message: 'Mostly a G1 feature — check that your collector supports it before counting on the savings.' });
    }
    if (boolFlags.has('DisableExplicitGC')) {
        findings.push({ severity: 'info', flag: '-XX:+DisableExplicitGC', message: 'Usually fine, but it also disables the System.gc() call some frameworks rely on to reclaim direct buffers — watch direct memory afterwards.' });
    }
    if (boolFlags.has('AlwaysPreTouch')) {
        findings.push({ severity: 'info', flag: '-XX:+AlwaysPreTouch', message: 'Touches every committed page at startup: RSS hits the full footprint immediately and boot gets slower, in exchange for no page-fault surprises later. Good for predictability.' });
    }
    if (valueFlags.has('ParallelGCThreads')) {
        findings.push({ severity: 'info', flag: '-XX:ParallelGCThreads', message: 'Verify the count against the container CPU limit, not the host cores — an inherited value from a bigger machine oversubscribes the pod.' });
    }

    // Unknown -XX flags (recognized syntax, unrecognized name)
    for (const name of seen.keys()) {
        if (!KNOWN.has(name)) unknownFlags.push(name);
    }

    findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    return { findings, extracted, unknownFlags };
}

/**
 * Produces a corrected flag line for the given Java version: drops flags
 * that break startup, redundant defaults and leftover diagnostics, resolves
 * the -Xmx/MaxRAMPercentage conflict in favor of the percentage pair,
 * forces -Xms equal to -Xmx when the fixed style remains, and adds
 * -XX:+ExitOnOutOfMemoryError. Unrecognized flags and non-JVM tokens are
 * preserved verbatim, in order. Returns null when no JVM flag is found.
 */
export function fixJvmFlags(line: string, javaVersion: AuditJavaVersion = 25): FixedFlags | null {
    const tokens = line.split(/\s+/).filter(Boolean).map(parseToken);
    if (!tokens.some((t) => t.name !== undefined)) return null;

    const lastIndex = new Map<string, number>();
    tokens.forEach((t, i) => { if (t.name !== undefined) lastIndex.set(t.name, i); });
    const has = (name: string) => lastIndex.has(name);
    const tokenOf = (name: string): Token | undefined => {
        const i = lastIndex.get(name);
        return i === undefined ? undefined : tokens[i];
    };

    const conflict = has('Xmx') && has('MaxRAMPercentage');
    const changes: FixChange[] = [];
    const out: string[] = [];
    let lastFlagOutIndex = -1;
    let xmxOutIndex = -1;
    let firstFlagSeen = false;
    let insertAtIfNoneKept = 0;

    const keepFlag = (raw: string, reason: string) => {
        out.push(raw);
        lastFlagOutIndex = out.length - 1;
        changes.push({ kind: 'kept', token: raw, reason });
    };

    tokens.forEach((token, i) => {
        if (token.name === undefined) {
            out.push(token.raw);
            return;
        }
        if (!firstFlagSeen) {
            firstFlagSeen = true;
            insertAtIfNoneKept = out.length;
        }
        if (lastIndex.get(token.name) !== i) {
            changes.push({ kind: 'removed', token: token.raw, reason: 'Duplicate — only the last occurrence takes effect.' });
            return;
        }
        const rule = versionedRule(token.name, javaVersion);
        if (rule?.breaksStartup) {
            changes.push({ kind: 'removed', token: token.raw, reason: rule.message });
            return;
        }
        if (token.name === 'MaxGCPauseMillis' && token.value === '200') {
            changes.push({ kind: 'removed', token: token.raw, reason: 'Redundant — 200 ms is already the G1 default.' });
            return;
        }
        if (token.name === 'UseContainerSupport' && token.sign === '+') {
            changes.push({ kind: 'removed', token: token.raw, reason: 'Redundant — default since JDK 10.' });
            return;
        }
        if (token.name === 'NativeMemoryTracking'
            || (token.sign === '+' && (token.name === 'PrintNMTStatistics' || token.name === 'UnlockDiagnosticVMOptions'))) {
            changes.push({ kind: 'removed', token: token.raw, reason: 'Diagnostic flag — enable to investigate, not as a production default.' });
            return;
        }
        if (conflict && (token.name === 'Xmx' || token.name === 'Xms')) {
            changes.push({ kind: 'removed', token: token.raw, reason: '-Xmx would silently override MaxRAMPercentage — the percentage pair wins.' });
            return;
        }
        if (!conflict && token.name === 'Xms' && has('Xmx')) {
            const xmxSize = tokenOf('Xmx')!.sizeStr!;
            if (token.sizeStr !== xmxSize) {
                out.push(`-Xms${xmxSize}`);
                lastFlagOutIndex = out.length - 1;
                changes.push({ kind: 'replaced', token: token.raw, reason: 'Set equal to -Xmx for a predictable footprint.' });
                return;
            }
        }
        if (token.name === 'InitialRAMPercentage' && has('MaxRAMPercentage') && !conflict) {
            const max = tokenOf('MaxRAMPercentage')!.value!;
            if (token.value !== max) {
                out.push(`-XX:InitialRAMPercentage=${max}`);
                lastFlagOutIndex = out.length - 1;
                changes.push({ kind: 'replaced', token: token.raw, reason: 'Set equal to MaxRAMPercentage for a predictable footprint.' });
                return;
            }
        }
        keepFlag(token.raw, KNOWN.has(token.name) ? 'No change needed.' : 'Not analyzed — preserved as-is.');
        if (token.name === 'Xmx') xmxOutIndex = lastFlagOutIndex;
    });

    if (!conflict && has('Xmx') && !has('Xms')) {
        // Anchor the added -Xms right next to its -Xmx.
        const addition = `-Xms${tokenOf('Xmx')!.sizeStr!}`;
        const at = xmxOutIndex >= 0 ? xmxOutIndex + 1 : lastFlagOutIndex + 1;
        out.splice(at, 0, addition);
        lastFlagOutIndex = at <= lastFlagOutIndex ? lastFlagOutIndex + 1 : at;
        changes.push({ kind: 'added', token: addition, reason: 'Set equal to -Xmx for a predictable footprint.' });
    }
    const additions: string[] = [];
    if (has('MaxRAMPercentage') && !has('InitialRAMPercentage')) {
        const max = tokenOf('MaxRAMPercentage')!.value!;
        additions.push(`-XX:InitialRAMPercentage=${max}`);
        changes.push({ kind: 'added', token: `-XX:InitialRAMPercentage=${max}`, reason: 'Initial equal to Max keeps the footprint predictable, like -Xms = -Xmx.' });
    }
    if (!has('ExitOnOutOfMemoryError') && !has('CrashOnOutOfMemoryError')) {
        additions.push('-XX:+ExitOnOutOfMemoryError');
        changes.push({ kind: 'added', token: '-XX:+ExitOnOutOfMemoryError', reason: 'Fail fast on OutOfMemoryError and let the orchestrator restart the pod.' });
    }

    const insertAt = lastFlagOutIndex >= 0 ? lastFlagOutIndex + 1 : insertAtIfNoneKept;
    out.splice(insertAt, 0, ...additions);

    return { fixed: out.join(' '), changes };
}
