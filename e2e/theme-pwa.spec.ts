import { expect, test } from '@playwright/test';

test('theme select applies Light, Dark and back to System', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    const themeSelect = page.getByRole('combobox', { name: 'Theme' });

    await expect(html).not.toHaveAttribute('data-theme', /./);
    await themeSelect.selectOption('light');
    await expect(html).toHaveAttribute('data-theme', 'light');
    await themeSelect.selectOption('dark');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await themeSelect.selectOption('system');
    await expect(html).not.toHaveAttribute('data-theme', /./);
});

test('explicit theme survives a reload before paint, without hydration errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('/');
    await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // The pre-paint data-theme stamp must not trip React's hydration diff
    // (suppressHydrationWarning on <html> covers it by design).
    await expect(page.getByRole('combobox', { name: 'Theme' })).toBeVisible(); // hydration done
    expect(consoleErrors.filter((text) => /hydrat/i.test(text))).toEqual([]);
});

test('web app manifest is served', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.name).toBe('JVM Expert');
    expect(manifest.display).toBe('standalone');
});

test('start wizard routes to the flags audit', async ({ page }) => {
    await page.goto('/start');
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await page.getByRole('button', { name: 'Its JVM flags' }).click();
    await page.getByRole('link', { name: 'Open the Flags Audit' }).click();
    await expect(page).toHaveURL(/\/flags/);
});
