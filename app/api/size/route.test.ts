import { describe, expect, it } from 'vitest';
import { GET } from './route';

const get = (query: string) => GET(new Request(`http://localhost/api/size${query}`));

describe('GET /api/size', () => {
    it('computes the reference case with defaults', async () => {
        const response = await get('');
        expect(response.status).toBe(200);
        const json = await response.json();

        expect(json.breakdown.containerTotal).toBe(897);
        expect(json.containerLimitMiB).toBe(897);
        expect(json.ramPercentage).toBe(42); // floor(384 / 897 * 100)
        expect(json.flags).toContain('-Xmx384m');
        expect(json.flagsPercentage).toContain('-XX:MaxRAMPercentage=42.0');
        expect(json.inputs.javaVersion).toBe(25);
    });

    it('honors explicit parameters', async () => {
        const response = await get('?gc=ZGC&v=21&heap=512&threads=100&hr=0');
        const json = await response.json();

        expect(json.inputs.gcType).toBe('ZGC');
        expect(json.inputs.javaVersion).toBe(21);
        expect(json.breakdown.gcStructures).toBe(31); // ceil(512 * 6%)
        expect(json.breakdown.headroom).toBe(0);
        expect(json.flags).toContain('-XX:+UseZGC');
    });

    it('solves container mode', async () => {
        const response = await get('?mode=container&limit=1024');
        const json = await response.json();

        expect(json.inputs.heapMiB).toBe(489); // session reference: largest heap fitting 1024 Mi
        expect(json.containerLimitMiB).toBe(1024);
        expect(json.ramPercentage).toBe(47);
        expect(json.breakdown.containerTotal).toBeLessThanOrEqual(1024);
    });

    it('rejects malformed parameters with 400', async () => {
        expect((await get('?gc=Epsilon')).status).toBe(400);
        expect((await get('?v=17')).status).toBe(400);
        expect((await get('?heap=abc')).status).toBe(400);
        expect((await get('?mode=magic')).status).toBe(400);

        const json = await (await get('?heap=-5')).json();
        expect(json.error).toContain('heap');
    });

    it('returns 422 for an infeasible container limit', async () => {
        const response = await get('?mode=container&limit=100');
        expect(response.status).toBe(422);
        const json = await response.json();
        expect(json.error).toContain('100');
    });
});
