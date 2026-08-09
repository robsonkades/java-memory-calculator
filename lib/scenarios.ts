import {
    calculateMemory,
    solveHeapForContainer,
    type GcType,
    type JavaVersion,
} from './jvm-memory';

export interface Scenario {
    name: string;
    /** Calculator query string (without the leading "?"). */
    query: string;
    savedAt: number;
}

const DEFAULTS: Record<string, string> = {
    mode: 'heap',
    v: '25',
    gc: 'G1',
    heap: '384',
    limit: '1024',
    threads: '85',
    classes: '30000',
    xss: '1',
    cc: '64',
    dm: '10',
    hr: '15',
    coh: '0',
    vt: '0',
    cpu: '0',
};

export const PARAM_LABELS: Record<string, string> = {
    mode: 'Mode',
    v: 'Java version',
    gc: 'Garbage collector',
    heap: 'Heap (MiB)',
    limit: 'Container limit (Mi)',
    threads: 'Threads',
    classes: 'Classes',
    xss: 'Stack per thread (MiB)',
    cc: 'Code cache (MiB)',
    dm: 'Direct memory (MiB)',
    hr: 'Headroom (%)',
    coh: 'Compact object headers',
    vt: 'Virtual threads mode',
    cpu: 'CPU limit (cores)',
};

const num = (value: string): number => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Calculator params with the same defaults the calculator itself applies. */
export function canonicalParams(query: string): Record<string, string> {
    const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
    const out: Record<string, string> = {};
    for (const key of Object.keys(DEFAULTS)) {
        out[key] = params.get(key) ?? DEFAULTS[key];
    }
    return out;
}

export function parseScenarios(json: string | null): Scenario[] {
    if (!json) return [];
    try {
        const data: unknown = JSON.parse(json);
        if (!Array.isArray(data)) return [];
        return data.filter((s): s is Scenario =>
            typeof (s as Scenario)?.name === 'string' && typeof (s as Scenario)?.query === 'string');
    } catch {
        // Corrupted localStorage is not an error condition — start over empty.
        return [];
    }
}

export function serializeScenarios(list: Scenario[]): string {
    return JSON.stringify(list);
}

export function upsertScenario(list: Scenario[], name: string, query: string, savedAt = Date.now()): Scenario[] {
    return [...list.filter((s) => s.name !== name), { name, query, savedAt }];
}

export function removeScenario(list: Scenario[], name: string): Scenario[] {
    return list.filter((s) => s.name !== name);
}

const EXPORT_APP = 'jvm-expert';
const EXPORT_VERSION = 1;

/** Versioned JSON envelope for sharing scenarios between browsers/teams. */
export function exportScenarios(list: Scenario[]): string {
    return JSON.stringify({ app: EXPORT_APP, version: EXPORT_VERSION, scenarios: list }, null, 2);
}

/** Parses an exported envelope; null when the file is not ours or malformed. */
export function importScenarios(json: string): Scenario[] | null {
    try {
        const data = JSON.parse(json) as { app?: unknown; version?: unknown; scenarios?: unknown };
        if (data?.app !== EXPORT_APP || data.version !== EXPORT_VERSION || !Array.isArray(data.scenarios)) {
            return null;
        }
        return data.scenarios.filter((s): s is Scenario =>
            typeof (s as Scenario)?.name === 'string' && typeof (s as Scenario)?.query === 'string');
    } catch {
        return null;
    }
}

export interface FleetRow {
    name: string;
    /** Calculator query for scenario-backed rows. */
    query?: string;
    /** Fixed limit for manual rows. */
    limitMi?: number;
}

/** Fleet rows as a base64url token for the /fleet?fleet= share link. */
export function encodeFleet(rows: FleetRow[]): string {
    const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, rows }));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decodes a ?fleet= token; null for anything that is not a valid token. */
export function decodeFleet(encoded: string): FleetRow[] | null {
    try {
        const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const data = JSON.parse(new TextDecoder().decode(bytes)) as { v?: unknown; rows?: unknown };
        if (data?.v !== 1 || !Array.isArray(data.rows)) return null;
        return data.rows.filter((r): r is FleetRow =>
            typeof (r as FleetRow)?.name === 'string'
            && (typeof (r as FleetRow).query === 'string' || typeof (r as FleetRow).limitMi === 'number'));
    } catch {
        return null;
    }
}

export interface ScenarioDiffRow {
    key: string;
    label: string;
    a: string;
    b: string;
}

/** Rows for every calculator input that differs between the two scenarios. */
export function diffScenarios(a: Scenario, b: Scenario): ScenarioDiffRow[] {
    const pa = canonicalParams(a.query);
    const pb = canonicalParams(b.query);
    return Object.keys(DEFAULTS)
        .filter((key) => pa[key] !== pb[key])
        .map((key) => ({ key, label: PARAM_LABELS[key], a: pa[key], b: pb[key] }));
}

/**
 * The container total the calculator would show for this query — solved
 * from the limit in container mode. Null when the configuration is
 * infeasible (fixed overheads exceed the limit).
 */
export function containerTotalFromQuery(query: string): number | null {
    const p = canonicalParams(query);
    const gc: GcType = p.gc === 'ZGC' || p.gc === 'Serial' || p.gc === 'Parallel' ? p.gc : 'G1';
    const shared = {
        javaVersion: (p.v === '21' ? 21 : 25) as JavaVersion,
        gcType: gc,
        threads: num(p.threads),
        stackSizeMiB: num(p.xss),
        classes: num(p.classes),
        codeCacheMiB: num(p.cc),
        directMemoryMiB: num(p.dm),
        headroomPercent: num(p.hr),
    };
    if (p.mode === 'container') {
        const solved = solveHeapForContainer(num(p.limit), shared);
        return solved ? solved.breakdown.containerTotal : null;
    }
    return calculateMemory({ ...shared, heapMiB: num(p.heap) }).containerTotal;
}
