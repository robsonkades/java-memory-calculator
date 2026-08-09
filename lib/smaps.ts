export interface SmapsRollup {
    kind: 'rollup';
    rssKiB: number;
    pssKiB?: number;
    privateDirtyKiB?: number;
    swapKiB?: number;
}

export interface SmapsCategory {
    name: string;
    rssKiB: number;
    mappingCount: number;
}

export interface SmapsMappings {
    kind: 'mappings';
    totalRssKiB: number;
    /** Fixed order — the index is the category's chart slot. */
    categories: SmapsCategory[];
    /** Anonymous mappings matching the 60–68 MiB glibc arena signature. */
    arenaCount: number;
}

export type SmapsResult = SmapsRollup | SmapsMappings;

/** Fixed category order; index doubles as the composition-bar slot. */
export const SMAPS_CATEGORIES = [
    'Heap (largest anon)',
    'Mapped files (JARs, libs)',
    'Stacks',
    'glibc malloc arenas (signature)',
    'Other anonymous',
] as const;

interface Mapping {
    path: string;
    sizeKiB: number;
    rssKiB: number;
}

const SMAPS_HEADER_RE = /^([0-9a-fA-F]+)-([0-9a-fA-F]+)\s+[rwxps-]{4}\s+\S+\s+\S+\s+\S+\s*(.*)$/;
const FIELD_RE = /^([A-Za-z_]+):\s+(\d+)\s+kB$/;
const PMAP_ROW_RE = /^([0-9a-fA-F]{8,})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/;

// glibc malloc arenas reserve HEAP_MAX_SIZE = 64 MiB on 64-bit; allow slack.
const ARENA_MIN_KIB = 60 * 1024;
const ARENA_MAX_KIB = 68 * 1024;

function isAnonymous(path: string): boolean {
    return path === '' || path === '[heap]' || /^\[\s*anon/i.test(path);
}

function categorize(mappings: Mapping[]): SmapsMappings {
    const sums = SMAPS_CATEGORIES.map(() => ({ rssKiB: 0, mappingCount: 0 }));
    const add = (index: number, m: Mapping) => {
        sums[index].rssKiB += m.rssKiB;
        sums[index].mappingCount += 1;
    };

    const anonRest: Mapping[] = [];
    let arenaCount = 0;
    for (const m of mappings) {
        if (m.path === '[stack]' || /^\[stack/.test(m.path)) {
            add(2, m);
        } else if (!isAnonymous(m.path)) {
            add(1, m);
        } else if (m.sizeKiB >= ARENA_MIN_KIB && m.sizeKiB <= ARENA_MAX_KIB) {
            add(3, m);
            arenaCount += 1;
        } else {
            anonRest.push(m);
        }
    }

    // The Java heap is normally the single largest anonymous reservation left.
    if (anonRest.length > 0) {
        const largest = anonRest.reduce((a, b) =>
            (b.sizeKiB > a.sizeKiB || (b.sizeKiB === a.sizeKiB && b.rssKiB > a.rssKiB)) ? b : a);
        for (const m of anonRest) {
            add(m === largest ? 0 : 4, m);
        }
    }

    return {
        kind: 'mappings',
        totalRssKiB: mappings.reduce((sum, m) => sum + m.rssKiB, 0),
        categories: SMAPS_CATEGORIES.map((name, i) => ({ name, ...sums[i] })),
        arenaCount,
    };
}

function parseFullSmaps(text: string): Mapping[] {
    const mappings: Mapping[] = [];
    let current: (Mapping & { start: number; end: number }) | null = null;

    for (const line of text.split(/\r?\n/)) {
        const header = SMAPS_HEADER_RE.exec(line.trim());
        if (header && !FIELD_RE.test(line.trim())) {
            if (current) mappings.push(current);
            const start = parseInt(header[1], 16);
            const end = parseInt(header[2], 16);
            current = {
                path: header[3].trim(),
                start,
                end,
                sizeKiB: Math.round((end - start) / 1024),
                rssKiB: 0,
            };
            continue;
        }
        const field = FIELD_RE.exec(line.trim());
        if (field && current) {
            if (field[1] === 'Size') current.sizeKiB = Number(field[2]);
            if (field[1] === 'Rss') current.rssKiB = Number(field[2]);
        }
    }
    if (current) mappings.push(current);
    return mappings;
}

function parsePmap(text: string): Mapping[] {
    const mappings: Mapping[] = [];
    for (const line of text.split(/\r?\n/)) {
        if (/^total/i.test(line.trim())) continue;
        const row = PMAP_ROW_RE.exec(line.trim());
        if (!row) continue;
        const path = row[6].trim();
        mappings.push({
            path: /^\[\s*anon\s*\]$/i.test(path) ? '' : path,
            sizeKiB: Number(row[2]),
            rssKiB: Number(row[3]),
        });
    }
    return mappings;
}

/**
 * Parses `/proc/<pid>/smaps_rollup`, full `/proc/<pid>/smaps` or `pmap -x`
 * output. Rollup gives totals only; the other two give per-mapping records
 * that are bucketed with documented heuristics. Returns null when the text
 * matches none of the three formats.
 */
export function parseSmaps(text: string): SmapsResult | null {
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const isRollup = /\[rollup\]/.test(text);
    const hasSmapsHeaders = !isRollup
        && lines.some((l) => SMAPS_HEADER_RE.test(l) && !FIELD_RE.test(l));
    const hasFieldLines = lines.some((l) => FIELD_RE.test(l));

    if (isRollup || (!hasSmapsHeaders && hasFieldLines)) {
        const fields = new Map<string, number>();
        for (const line of text.split(/\r?\n/)) {
            const field = FIELD_RE.exec(line.trim());
            if (field && !fields.has(field[1])) fields.set(field[1], Number(field[2]));
        }
        if (!fields.has('Rss')) return null;
        return {
            kind: 'rollup',
            rssKiB: fields.get('Rss')!,
            ...(fields.has('Pss') && { pssKiB: fields.get('Pss') }),
            ...(fields.has('Private_Dirty') && { privateDirtyKiB: fields.get('Private_Dirty') }),
            ...(fields.has('Swap') && { swapKiB: fields.get('Swap') }),
        };
    }

    if (hasSmapsHeaders) {
        const mappings = parseFullSmaps(text);
        // A single block with field lines is a rollup someone pasted without
        // the [rollup] marker — but with real Rss fields it was caught above.
        if (mappings.length >= 1 && mappings.some((m) => m.rssKiB > 0)) return categorize(mappings);
        return null;
    }

    const pmapMappings = parsePmap(text);
    if (pmapMappings.length > 0) return categorize(pmapMappings);

    return null;
}
