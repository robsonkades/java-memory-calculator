import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

// The captured jcmd outputs from a live Temurin 25 process (lib/__fixtures__)
// pasted into each analyzer — the four tools working on real data, end to end.
const fixture = (name: string) =>
    readFileSync(join(__dirname, '..', 'lib', '__fixtures__', name), 'utf8');

test('NMT analyzer digests a real JDK 25 summary and warns about the off-peak heap', async ({ page }) => {
    await page.goto('/nmt');
    await page.getByRole('textbox').first().fill(fixture('real-nmt-summary.txt'));

    await expect(page.getByText(/252 Mi/).first()).toBeVisible(); // ceil(218.59 × 1.15)
    await expect(page.getByText(/peaked at 512(\.0)? MiB/).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Peak (MiB)' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Open in calculator/ })).toHaveAttribute('href', /threads=66/);
});

test('GC log analyzer digests a real -Xlog:gc* file', async ({ page }) => {
    await page.goto('/gclog');
    await page.getByRole('textbox').first().fill(fixture('real-gc.log'));

    await expect(page.getByText('25', { exact: true }).first()).toBeVisible(); // pause count
    await expect(page.getByText(/39 MiB/).first()).toBeVisible(); // live set 13 × 3
});

test('thread dump analyzer digests a real JDK 25 Thread.print', async ({ page }) => {
    await page.goto('/threads');
    await page.getByRole('textbox').first().fill(fixture('real-threaddump.txt'));

    await expect(page.getByText(/38/).first()).toBeVisible();
    await expect(page.getByText(/34 daemon/).first()).toBeVisible();
    await expect(page.getByText('Top CPU Threads')).toBeVisible();
});

test('histogram analyzer digests a real GC.class_histogram', async ({ page }) => {
    await page.goto('/histogram');
    await page.getByRole('textbox').first().fill(fixture('real-histogram.txt'));

    await expect(page.getByRole('cell', { name: '[B', exact: true })).toBeVisible();
    await expect(page.getByText(/312,424|312424/).first()).toBeVisible();
});

test('histogram analyzer diffs two pasted real snapshots', async ({ page }) => {
    const snapshot = fixture('real-histogram.txt');
    await page.goto('/histogram');
    await page.getByRole('textbox').first().fill(`${snapshot}\n${snapshot}`);

    await expect(page.getByText('Growth between snapshots')).toBeVisible();
    await expect(page.getByText(/\+0\.0 MiB/).first()).toBeVisible();
});
