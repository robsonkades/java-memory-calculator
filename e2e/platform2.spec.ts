import { expect, test } from '@playwright/test';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('api docs page documents the size endpoint', async ({ page }) => {
    await page.goto('/api-docs');
    await expect(page.getByText('GET /api/size')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'threads', exact: true })).toBeVisible();
    await expect(page.getByText('"containerTotal": 897')).toBeVisible();
});

test('fleet round-trips through the ?fleet= share link', async ({ page }) => {
    await page.goto('/fleet');
    await page.getByPlaceholder('service name').fill('orders-api');
    await page.getByPlaceholder('limit (Mi)').fill('512');
    await page.getByRole('button', { name: 'Add manual entry' }).click();
    await expect(page.getByRole('cell', { name: 'orders-api' })).toBeVisible();

    await page.getByRole('button', { name: 'Copy fleet link' }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain('/fleet?fleet=');

    await page.goto(link);
    await expect(page.getByText('Viewing a shared fleet')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'orders-api' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '512', exact: true })).toBeVisible();
});
