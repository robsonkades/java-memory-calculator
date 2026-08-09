import { expect, test } from '@playwright/test';

test('drawer opens as a modal dialog, navigates, and closes on Escape', async ({ page }) => {
    await page.goto('/');
    const menuButton = page.getByRole('button', { name: 'Menu', exact: true });

    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await menuButton.click();

    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer).toBeVisible();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused();

    // Grouped site map with the current page marked.
    await expect(drawer.getByRole('heading', { name: 'Analyzers' })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Calculator' })).toHaveAttribute('aria-current', 'page');

    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(menuButton).toBeFocused();

    // Navigate through the drawer.
    await menuButton.click();
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'NMT Analyzer' }).click();
    await expect(page).toHaveURL(/\/nmt/);
});

test('drawer works on a mobile viewport where the top bar collapses', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer.getByRole('combobox', { name: 'Language' })).toBeVisible();
    await expect(drawer.getByRole('combobox', { name: 'Theme' })).toBeVisible();
    await drawer.getByRole('link', { name: 'GC Log' }).click();
    await expect(page).toHaveURL(/\/gclog/);
});

test('opening and closing the drawer does not shift centered content', async ({ page }) => {
    await page.goto('/');
    const title = page.locator('main h1').first();
    const before = (await title.boundingBox())!.x;

    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
    const during = (await title.boundingBox())!.x;

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Menu' })).not.toBeVisible();
    const after = (await title.boundingBox())!.x;

    expect(during).toBe(before);
    expect(after).toBe(before);
});

test('skip link targets the content and precedes every other focusable', async ({ page }) => {
    await page.goto('/');
    const skip = page.getByRole('link', { name: 'Skip to content' });

    // First focusable in DOM order (real-Tab checks flake without OS window focus).
    const isFirst = await page.evaluate(() => {
        const focusables = document.querySelectorAll('a[href], button, select, input, [tabindex]:not([tabindex="-1"])');
        return focusables[0]?.textContent?.includes('Skip to content') ?? false;
    });
    expect(isFirst).toBe(true);

    await skip.focus();
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page).toHaveURL(/#main/);
});
