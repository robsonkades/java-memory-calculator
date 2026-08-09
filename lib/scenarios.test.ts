import { describe, expect, it } from 'vitest';
import {
    containerTotalFromQuery,
    decodeFleet,
    diffScenarios,
    encodeFleet,
    exportScenarios,
    importScenarios,
    parseScenarios,
    removeScenario,
    serializeScenarios,
    upsertScenario,
    type FleetRow,
    type Scenario,
} from './scenarios';

const scenario = (name: string, query: string): Scenario => ({ name, query, savedAt: 1 });

describe('parseScenarios', () => {
    it('round-trips through serialize', () => {
        const list = [scenario('api', 'heap=512&gc=ZGC')];
        expect(parseScenarios(serializeScenarios(list))).toEqual(list);
    });

    it('returns empty for null, garbage and non-arrays', () => {
        expect(parseScenarios(null)).toEqual([]);
        expect(parseScenarios('not json')).toEqual([]);
        expect(parseScenarios('{"a":1}')).toEqual([]);
    });

    it('drops malformed entries but keeps valid ones', () => {
        const json = JSON.stringify([scenario('ok', 'heap=1'), { name: 42 }, 'junk']);
        expect(parseScenarios(json)).toHaveLength(1);
    });
});

describe('upsertScenario / removeScenario', () => {
    it('replaces an existing name instead of duplicating it', () => {
        let list = upsertScenario([], 'api', 'heap=512', 1);
        list = upsertScenario(list, 'api', 'heap=1024', 2);
        expect(list).toHaveLength(1);
        expect(list[0].query).toBe('heap=1024');
    });

    it('removes by name', () => {
        const list = upsertScenario(upsertScenario([], 'a', 'heap=1', 1), 'b', 'heap=2', 2);
        expect(removeScenario(list, 'a').map((s) => s.name)).toEqual(['b']);
    });
});

describe('diffScenarios', () => {
    it('lists only the inputs that differ, with defaults applied', () => {
        const rows = diffScenarios(scenario('a', ''), scenario('b', 'gc=ZGC&heap=512'));
        expect(rows.map((r) => r.key).sort()).toEqual(['gc', 'heap']);
        const gcRow = rows.find((r) => r.key === 'gc')!;
        expect(gcRow.a).toBe('G1');
        expect(gcRow.b).toBe('ZGC');
    });

    it('returns no rows for equivalent queries', () => {
        expect(diffScenarios(scenario('a', ''), scenario('b', 'gc=G1&heap=384'))).toEqual([]);
    });
});

describe('exportScenarios / importScenarios', () => {
    it('round-trips through the versioned envelope', () => {
        const list = [scenario('api', 'heap=512&gc=ZGC'), scenario('worker', 'mode=container&limit=768')];
        expect(importScenarios(exportScenarios(list))).toEqual(list);
    });

    it('rejects foreign or malformed files', () => {
        expect(importScenarios('not json')).toBeNull();
        expect(importScenarios('{"scenarios":[]}')).toBeNull(); // missing envelope
        expect(importScenarios(JSON.stringify({ app: 'other-app', version: 1, scenarios: [] }))).toBeNull();
        expect(importScenarios(JSON.stringify({ app: 'jvm-expert', version: 999, scenarios: [] }))).toBeNull();
    });

    it('drops malformed entries but keeps valid ones', () => {
        const json = JSON.stringify({ app: 'jvm-expert', version: 1, scenarios: [scenario('ok', 'heap=1'), { name: 42 }] });
        expect(importScenarios(json)).toHaveLength(1);
    });
});

describe('encodeFleet / decodeFleet', () => {
    it('round-trips scenario-backed and manual rows in a URL-safe token', () => {
        const rows: FleetRow[] = [
            { name: 'orders-api', query: 'heap=512&gc=ZGC' },
            { name: 'legacy búfer', limitMi: 768 }, // non-ASCII name survives
        ];
        const token = encodeFleet(rows);
        expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, query-safe
        expect(decodeFleet(token)).toEqual(rows);
    });

    it('rejects garbage and foreign tokens', () => {
        expect(decodeFleet('not-a-token!')).toBeNull();
        expect(decodeFleet(btoa(JSON.stringify({ v: 2, rows: [] })))).toBeNull();
        expect(decodeFleet('')).toBeNull();
    });

    it('drops rows with neither query nor limit', () => {
        const token = encodeFleet([{ name: 'ok', limitMi: 100 }]);
        const tampered = btoa(JSON.stringify({ v: 1, rows: [{ name: 'ok', limitMi: 100 }, { name: 'bad' }] }))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        expect(decodeFleet(token)).toHaveLength(1);
        expect(decodeFleet(tampered)).toHaveLength(1);
    });
});

describe('containerTotalFromQuery', () => {
    it('matches the calculator reference case on defaults', () => {
        expect(containerTotalFromQuery('')).toBe(897);
    });

    it('solves container mode from the limit', () => {
        expect(containerTotalFromQuery('mode=container&limit=1024')).toBe(1024);
    });

    it('returns null for infeasible container configurations', () => {
        expect(containerTotalFromQuery('mode=container&limit=100')).toBeNull();
    });
});
