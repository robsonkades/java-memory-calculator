import { expect, test } from '@playwright/test';

test('guides index lists the articles', async ({ page }) => {
    await page.goto('/guides');
    const articles = page.locator('a[href^="/guides/"]');
    expect(await articles.count()).toBeGreaterThanOrEqual(5);
});

test('an article renders with its heading', async ({ page }) => {
    await page.goto('/guides/choosing-a-gc-for-containers');
    await expect(page.getByRole('heading', { level: 1, name: 'Choosing a garbage collector for containers' })).toBeVisible();
});
