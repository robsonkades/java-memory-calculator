export type JavaVersion = 21 | 25;
export type GcType = 'G1' | 'ZGC' | 'Serial' | 'Parallel';

export interface MemoryInputs {
    javaVersion: JavaVersion;
    gcType: GcType;
    /** Desired heap (-Xmx), in MiB. */
    heapMiB: number;
    /** Expected number of live platform threads. */
    threads: number;
    /** Stack size per thread (-Xss), in MiB. */
    stackSizeMiB: number;
    /** Expected number of loaded classes. */
    classes: number;
    /** Reserved code cache (-XX:ReservedCodeCacheSize), in MiB. */
    codeCacheMiB: number;
    /** Direct memory limit (-XX:MaxDirectMemorySize), in MiB. */
    directMemoryMiB: number;
    /** Extra headroom applied on top of the JVM subtotal, in percent. */
    headroomPercent: number;
}

export interface MemoryBreakdown {
    heap: number;
    /** Metaspace estimate, already including the compressed class space. */
    metaspace: number;
    /** Portion of the metaspace reserved for compressed class pointers (display only). */
    compressedClassSpace: number;
    codeCache: number;
    /** Reserved upper bound: threads x -Xss. Committed memory is usually far lower. */
    threadStacks: number;
    directMemory: number;
    /** GC-internal native structures (card tables, remembered sets, forwarding tables). */
    gcStructures: number;
    /** Symbols, JIT compiler working memory and other VM-internal allocations. */
    jvmInternals: number;
    /** Sum of every JVM component above (metaspace counted once). */
    subtotal: number;
    headroom: number;
    /** Recommended container memory limit, in MiB (1 Mi = 1 MiB). */
    containerTotal: number;
}

/**
 * Native overhead of GC-internal structures as a percentage of the heap.
 * Calibrated per collector: Serial keeps little more than a card table;
 * Parallel adds per-thread work buffers; G1 adds remembered sets and region
 * metadata; ZGC adds relocation forwarding data.
 */
export const GC_STRUCTURES_PERCENT: Record<GcType, number> = {
    Serial: 1,
    Parallel: 3,
    G1: 5,
    ZGC: 6,
};

/** Metaspace rule of thumb: ~5 KiB per loaded class, compressed class space included. */
export const METASPACE_KIB_PER_CLASS = 5;
/** Portion of the metaspace estimate attributable to compressed class pointers. */
export const COMPRESSED_CLASS_KIB_PER_CLASS = 1.5;
/** Fixed base for VM internals (JIT arenas, symbol/string tables, VM structures). */
export const JVM_INTERNALS_BASE_MIB = 40;
/** Per-class contribution to symbol tables and class metadata outside the metaspace. */
export const JVM_INTERNALS_KIB_PER_CLASS = 1;

export function calculateMemory(inputs: MemoryInputs): MemoryBreakdown {
    const heap = inputs.heapMiB;
    const metaspace = Math.ceil((inputs.classes * METASPACE_KIB_PER_CLASS) / 1024);
    const compressedClassSpace = Math.ceil((inputs.classes * COMPRESSED_CLASS_KIB_PER_CLASS) / 1024);
    const threadStacks = inputs.threads * inputs.stackSizeMiB;
    const gcStructures = Math.ceil((heap * GC_STRUCTURES_PERCENT[inputs.gcType]) / 100);
    const jvmInternals = JVM_INTERNALS_BASE_MIB + Math.ceil((inputs.classes * JVM_INTERNALS_KIB_PER_CLASS) / 1024);

    const subtotal = heap + metaspace + inputs.codeCacheMiB + threadStacks
        + inputs.directMemoryMiB + gcStructures + jvmInternals;
    const headroom = Math.ceil((subtotal * inputs.headroomPercent) / 100);

    return {
        heap,
        metaspace,
        compressedClassSpace,
        codeCache: inputs.codeCacheMiB,
        threadStacks,
        directMemory: inputs.directMemoryMiB,
        gcStructures,
        jvmInternals,
        subtotal,
        headroom,
        containerTotal: subtotal + headroom,
    };
}

const GC_FLAG: Record<GcType, string> = {
    G1: '-XX:+UseG1GC',
    ZGC: '-XX:+UseZGC',
    Serial: '-XX:+UseSerialGC',
    Parallel: '-XX:+UseParallelGC',
};

export interface FlagOptions {
    /**
     * When set, the heap is expressed as -XX:InitialRAMPercentage /
     * -XX:MaxRAMPercentage of the container's cgroup limit instead of a fixed
     * -Xms/-Xmx — one source of truth: the heap follows the deployment's
     * limit. Initial equals Max to keep the footprint as predictable as
     * -Xms = -Xmx. The percentage must come from this model for the actual
     * limit (see ramPercentageFor): fixed overheads do not scale with the
     * limit, so a hand-picked universal percentage is unsafe.
     */
    ramPercentage?: number;
    /** Extra flags appended verbatim to the end of the line (opt-in features like Compact Object Headers). */
    extraFlags?: string[];
}

/** Heap as a whole percentage of the container limit, floored so it never oversizes. */
export function ramPercentageFor(heapMiB: number, containerLimitMiB: number): number {
    return Math.floor((heapMiB / containerLimitMiB) * 100);
}

/**
 * Lean production flag line: sizing flags plus -XX:+ExitOnOutOfMemoryError only.
 * Diagnostic flags (NMT etc.) and non-default optimizations are offered as
 * notes, never copied into a deployment by default.
 */
export function buildJvmFlags(inputs: MemoryInputs, options?: FlagOptions): string {
    const heapFlags = options?.ramPercentage !== undefined
        ? [`-XX:InitialRAMPercentage=${options.ramPercentage}.0`, `-XX:MaxRAMPercentage=${options.ramPercentage}.0`]
        : [`-Xms${inputs.heapMiB}m`, `-Xmx${inputs.heapMiB}m`];
    return [
        GC_FLAG[inputs.gcType],
        ...heapFlags,
        `-Xss${inputs.stackSizeMiB}m`,
        `-XX:ReservedCodeCacheSize=${inputs.codeCacheMiB}m`,
        `-XX:MaxDirectMemorySize=${inputs.directMemoryMiB}m`,
        '-XX:+ExitOnOutOfMemoryError',
        ...(options?.extraFlags ?? []),
    ].join(' ');
}

/**
 * Approximation of the ParallelGCThreads ergonomics: all cores up to 8,
 * then 8 + 5/8 of the remainder, floored. Serial GC always uses one worker.
 * ZGC additionally runs concurrent workers not counted here.
 */
export function gcThreadsFor(gcType: GcType, cores: number): number {
    if (gcType === 'Serial') return 1;
    return cores <= 8 ? cores : Math.floor(8 + ((cores - 8) * 5) / 8);
}

/** Approximation of the CICompilerCount ergonomics with tiered compilation. */
export function jitThreadsFor(cores: number): number {
    return cores >= 4 ? 3 : 2;
}

export interface GenerationInfo {
    kind: 'fixed' | 'adaptive' | 'none';
    youngMiB?: number;
    oldMiB?: number;
    description: string;
}

export function generationInfo(inputs: MemoryInputs): GenerationInfo {
    switch (inputs.gcType) {
        case 'Serial':
        case 'Parallel': {
            const young = Math.floor(inputs.heapMiB / 3);
            const old = inputs.heapMiB - young;
            return {
                kind: 'fixed',
                youngMiB: young,
                oldMiB: old,
                description: 'With the default -XX:NewRatio=2, the young generation gets about 1/3 of the heap and the old generation the remaining 2/3.',
            };
        }
        case 'G1':
            return {
                kind: 'adaptive',
                description: 'G1 resizes the young generation at runtime between 5% and 60% of the heap (G1NewSizePercent / G1MaxNewSizePercent) to meet its pause-time goal. There is no fixed split.',
            };
        case 'ZGC':
            return inputs.javaVersion === 21
                ? {
                    kind: 'none',
                    description: 'On Java 21, ZGC is single-generation by default — there is no young/old split. Generational ZGC is available opt-in via -XX:+ZGenerational.',
                }
                : {
                    kind: 'adaptive',
                    description: 'On Java 25, ZGC is generational (the single-generation mode was removed in JDK 24) and sizes its generations dynamically. There is no user-visible fixed split.',
                };
    }
}

/**
 * Kubernetes deployment snippet with requests equal to limits: a JVM's
 * footprint is flat by design here (-Xms = -Xmx), so asking for less than
 * the limit only invites overcommit surprises on the node.
 */
export function buildKubernetesSnippet(inputs: MemoryInputs, containerLimitMiB: number, options?: FlagOptions): string {
    return [
        'resources:',
        '  requests:',
        `    memory: "${containerLimitMiB}Mi"`,
        '  limits:',
        `    memory: "${containerLimitMiB}Mi"`,
        'env:',
        '  - name: JAVA_TOOL_OPTIONS',
        `    value: "${buildJvmFlags(inputs, options)}"`,
    ].join('\n');
}

/** Docker Compose variant: mem_limit is the cgroup limit MaxRAMPercentage reads. */
export function buildDockerComposeSnippet(inputs: MemoryInputs, containerLimitMiB: number, options?: FlagOptions): string {
    return [
        'services:',
        '  app:',
        `    mem_limit: ${containerLimitMiB}m`,
        '    environment:',
        `      JAVA_TOOL_OPTIONS: "${buildJvmFlags(inputs, options)}"`,
    ].join('\n');
}

/** Plain env-file variant for anything that is not Kubernetes or Compose. */
export function buildEnvFileSnippet(inputs: MemoryInputs, options?: FlagOptions): string {
    return `JAVA_TOOL_OPTIONS="${buildJvmFlags(inputs, options)}"`;
}

export interface ContainerSizingResult {
    /** Largest heap whose full JVM footprint (headroom included) fits the limit. */
    heapMiB: number;
    breakdown: MemoryBreakdown;
    /** -XX:MaxRAMPercentage equivalent to the recommended heap (floored, so it never oversizes). */
    maxRamPercentage: number;
}

/**
 * Inverse mode: given a container memory limit, find the largest heap whose
 * complete footprint (fixed overheads, GC structures and headroom included)
 * still fits. Returns null when the fixed overheads alone exceed the limit.
 */
export function solveHeapForContainer(
    containerLimitMiB: number,
    inputs: Omit<MemoryInputs, 'heapMiB'>,
): ContainerSizingResult | null {
    const totalFor = (heapMiB: number) =>
        calculateMemory({ ...inputs, heapMiB }).containerTotal;

    const gcPercent = GC_STRUCTURES_PERCENT[inputs.gcType];
    const fixed = calculateMemory({ ...inputs, heapMiB: 0 }).subtotal;
    // Closed-form guess ignoring rounding, then adjust for the ceil() effects.
    let heap = Math.floor(
        (containerLimitMiB / (1 + inputs.headroomPercent / 100) - fixed) / (1 + gcPercent / 100),
    );
    if (heap <= 0) return null;

    while (heap > 0 && totalFor(heap) > containerLimitMiB) heap--;
    while (totalFor(heap + 1) <= containerLimitMiB) heap++;
    if (heap <= 0) return null;

    return {
        heapMiB: heap,
        breakdown: calculateMemory({ ...inputs, heapMiB: heap }),
        maxRamPercentage: Math.floor((heap / containerLimitMiB) * 100),
    };
}

export interface FlagNote {
    flag: string;
    note: string;
}

/**
 * Optional, non-default flags worth knowing about for the selected
 * version/GC. Shown as notes only — never part of the copied flag line.
 */
export function optionalFlagNotes(inputs: MemoryInputs): FlagNote[] {
    const notes: FlagNote[] = [];
    if (inputs.javaVersion === 25) {
        notes.push({
            flag: '-XX:+UseCompactObjectHeaders',
            note: 'JEP 519 (product flag in Java 25, off by default): shrinks object headers from 12 to 8 bytes, typically cutting heap footprint by 10-20% in workloads dominated by small objects.',
        });
    }
    if (inputs.javaVersion === 21 && inputs.gcType === 'ZGC') {
        notes.push({
            flag: '-XX:+ZGenerational',
            note: 'Enables generational ZGC on Java 21 (opt-in; it became the default in JDK 23 and the only mode from JDK 24). Usually reduces CPU and memory overhead for most workloads.',
        });
    }
    notes.push({
        flag: '-XX:NativeMemoryTracking=summary',
        note: 'Diagnostic only — measures real native memory usage per JVM subsystem (check with jcmd VM.native_memory). Costs extra native memory and CPU, so enable it to investigate, not as a production default.',
    });
    return notes;
}
