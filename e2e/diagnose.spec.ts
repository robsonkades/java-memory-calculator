import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const fixture = (name: string) =>
    readFileSync(join(__dirname, '..', 'lib', '__fixtures__', name), 'utf8');

test('diagnosis session cross-checks real NMT + thread dump and exports', async ({ page }) => {
    await page.goto('/diagnose');
    await page.getByLabel('NMT summary').fill(fixture('real-nmt-summary.txt'));
    await page.getByLabel('Thread dump').fill(fixture('real-threaddump.txt'));

    await expect(page.getByText('252 Mi').first()).toBeVisible();
    await expect(page.getByText(/the other 28 are VM-internal/).first()).toBeVisible();
    await expect(page.getByText(/peaked at 512 MiB/).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open in calculator' })).toHaveAttribute('href', /threads=38/);
    await expect(page.getByRole('button', { name: 'Download report (.md)' })).toBeVisible();
});

test('runbook checklist persists progress across reloads', async ({ page }) => {
    await page.goto('/runbook');
    await expect(page.getByText('0/6 steps done')).toBeVisible();

    await page.getByRole('checkbox').first().check();
    await expect(page.getByText('1/6 steps done')).toBeVisible();

    await page.reload();
    await expect(page.getByText('1/6 steps done')).toBeVisible();
    await expect(page.getByRole('checkbox').first()).toBeChecked();

    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByText('0/6 steps done')).toBeVisible();
});

test('GC log analyzer flags a rising live set as a possible leak', async ({ page }) => {
    const leakingLog = Array.from({ length: 5 }, (_, i) =>
        `[${100 + i * 300}.000s][info][gc] GC(${i}) Pause Full (G1 Compaction Pause) ${400 + i * 50}M->${100 + i * 30}M(1024M) 100.0ms`,
    ).join('\n');
    await page.goto('/gclog');
    await page.getByRole('textbox').first().fill(leakingLog);

    await expect(page.getByText('Possible memory leak')).toBeVisible();
    await expect(page.getByText(/360\.0 MiB\/h/).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Histogram Analyzer' })).toHaveAttribute('href', '/histogram');
});

test('GC log analyzer renders generational ZGC stats from a real log', async ({ page }) => {
    await page.goto('/gclog');
    await page.getByRole('textbox').first().fill(fixture('real-gc-zgc.log'));

    await expect(page.getByText('ZGC Collections')).toBeVisible();
    await expect(page.getByText('STW Pauses')).toBeVisible();
    await expect(page.getByText(/24 MiB/).first()).toBeVisible(); // recommended heap: live 8 × 3
});
