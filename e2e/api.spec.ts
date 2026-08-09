import { expect, test } from '@playwright/test';

test('api computes the reference case', async ({ request }) => {
    const response = await request.get('/api/size?heap=384&threads=85&classes=30000&xss=1&cc=64&dm=10&hr=15');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.breakdown.containerTotal).toBe(897);
    expect(json.flags).toContain('-Xmx384m');
    expect(json.flagsPercentage).toContain('-XX:MaxRAMPercentage=42.0');
});

test('api solves container mode', async ({ request }) => {
    const response = await request.get('/api/size?mode=container&limit=1024');
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.inputs.heapMiB).toBe(489);
    expect(json.ramPercentage).toBe(47);
});

test('api rejects malformed input', async ({ request }) => {
    expect((await request.get('/api/size?gc=Epsilon')).status()).toBe(400);
    expect((await request.get('/api/size?mode=container&limit=100')).status()).toBe(422);
});
