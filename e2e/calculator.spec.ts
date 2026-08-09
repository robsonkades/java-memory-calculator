import { expect, test } from '@playwright/test';

test('default load shows the reference sizing', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Recommended container memory limit', { exact: true })).toBeVisible();
    await expect(page.getByText('897 Mi', { exact: true }).first()).toBeVisible();
});

test('container-mode URL round-trip restores state and solves the heap', async ({ page }) => {
    await page.goto('/?mode=container&gc=ZGC&v=21&limit=2048&threads=40&classes=30000&xss=1&cc=64&dm=10&hr=10');
    await expect(page.getByText('Recommended heap', { exact: true })).toBeVisible();
    await expect(page.getByText('1443 MiB (-Xmx1443m)')).toBeVisible();
    await expect(page.getByText('ZGC is single-generation by default', { exact: false })).toBeVisible();
});

test('collector comparison row click switches the selected GC', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('cell', { name: 'ZGC', exact: true }).click();
    await expect(page.getByRole('cell', { name: 'ZGC (selected)' })).toBeVisible();
    await expect(page.getByText('-XX:+UseZGC').first()).toBeVisible();
});

test('heap sizing style toggles between percentage and fixed flags', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('-XX:InitialRAMPercentage=42.0 -XX:MaxRAMPercentage=42.0', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Fixed -Xms/-Xmx' }).click();
    await expect(page.getByText('-Xms384m -Xmx384m', { exact: true })).toBeVisible();
});

test('deployment snippet format switches to Docker Compose', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Docker Compose' }).click();
    await expect(page.getByText('mem_limit: 897m')).toBeVisible();
});
