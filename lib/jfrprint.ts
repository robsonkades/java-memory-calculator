export interface NativeMemoryType {
    type: string;
    committedMiB: number;
    reservedMiB: number;
}

export interface JfrPrintReport {
    /** jdk.GCHeapSummary events found (Before + After). */
    gcSummaryCount: number;
    /** After-GC samples backing the live-set estimate. */
    afterGcSamples: number;
    /** Minimum heapUsed across After-GC summaries, rounded to whole MiB. */
    liveSetMiB?: number;
    /** Rule of thumb: live set × 3, matching the GC Log analyzer. */
    recommendedHeapMiB?: number;
    /** Latest jdk.NativeMemoryUsage snapshot per type, in first-seen order. */
    nativeMemory: NativeMemoryType[];
}

const EVENT_START = /^(jdk\.[A-Za-z0-9]+)\s*\{$/;
const FIELD_LINE = /^([A-Za-z0-9]+)\s*=\s*(.+)$/;
// jfr print writes binary-based sizes with SI-looking suffixes: MB here is MiB.
// Numbers follow the JVM default locale — pt-BR/es/de write "41,1 MB", so the
// decimal separator can be a comma. Grouping never appears: jfr scales the
// value to keep it under 1024.
const SIZE_RE = /^(\d+(?:[.,]\d+)?)\s*(bytes|kB|KB|MB|GB|TB)$/;

function sizeToMiB(value: string): number | undefined {
    const match = SIZE_RE.exec(value);
    if (!match) return undefined;
    const n = Number(match[1].replace(',', '.'));
    switch (match[2]) {
        case 'bytes': return n / (1024 * 1024);
        case 'kB':
        case 'KB': return n / 1024;
        case 'MB': return n;
        case 'GB': return n * 1024;
        case 'TB': return n * 1024 * 1024;
        default: return undefined;
    }
}

function unquote(value: string): string {
    return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

interface EventBlock {
    name: string;
    fields: Map<string, string>;
}

function scanEvents(text: string): EventBlock[] {
    const events: EventBlock[] = [];
    let current: { name: string; fields: Map<string, string>; depth: number } | null = null;

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (current === null) {
            const start = EVENT_START.exec(line);
            if (start) current = { name: start[1], fields: new Map(), depth: 1 };
            continue;
        }

        const opens = (line.match(/\{/g) ?? []).length;
        const closes = (line.match(/\}/g) ?? []).length;

        if (current.depth === 1) {
            const field = FIELD_LINE.exec(line);
            if (field && !field[2].endsWith('{')) current.fields.set(field[1], field[2]);
        }

        current.depth += opens - closes;
        if (current.depth <= 0) {
            events.push({ name: current.name, fields: current.fields });
            current = null;
        }
    }
    return events;
}

/**
 * Parses the output of
 * `jfr print --events jdk.GCHeapSummary,jdk.NativeMemoryUsage recording.jfr`.
 * Returns null when the text contains no recognized event blocks.
 */
export function parseJfrPrint(text: string): JfrPrintReport | null {
    const events = scanEvents(text);

    const summaries = events.filter((e) => e.name === 'jdk.GCHeapSummary');
    const afterGcUsed: number[] = [];
    for (const event of summaries) {
        if (unquote(event.fields.get('when') ?? '') !== 'After GC') continue;
        const used = sizeToMiB(event.fields.get('heapUsed') ?? '');
        if (used !== undefined) afterGcUsed.push(used);
    }

    const latestByType = new Map<string, NativeMemoryType>();
    for (const event of events) {
        if (event.name !== 'jdk.NativeMemoryUsage') continue;
        const type = unquote(event.fields.get('type') ?? '');
        const committedMiB = sizeToMiB(event.fields.get('committed') ?? '');
        const reservedMiB = sizeToMiB(event.fields.get('reserved') ?? '');
        if (type === '' || committedMiB === undefined || reservedMiB === undefined) continue;
        latestByType.set(type, { type, committedMiB, reservedMiB });
    }

    if (summaries.length === 0 && latestByType.size === 0) return null;

    const liveSetMiB = afterGcUsed.length > 0
        ? Math.round(Math.min(...afterGcUsed))
        : undefined;

    return {
        gcSummaryCount: summaries.length,
        afterGcSamples: afterGcUsed.length,
        ...(liveSetMiB !== undefined && {
            liveSetMiB,
            recommendedHeapMiB: Math.ceil(liveSetMiB * 3),
        }),
        nativeMemory: [...latestByType.values()],
    };
}
