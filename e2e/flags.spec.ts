import { expect, test } from '@playwright/test';

const LEGACY_LINE = 'java -Xmx1g -XX:MaxRAMPercentage=75.0 -XX:+UseConcMarkSweepGC '
    + '-XX:MaxGCPauseMillis=200 -XX:NativeMemoryTracking=summary -XX:+UseContainerSupport '
    + '-Xss1m -XX:ReservedCodeCacheSize=128m -Dspring.profiles.active=prod -jar app.jar';

test('audits a legacy line and prefills the calculator', async ({ page }) => {
    await page.goto('/flags');
    await page.getByRole('textbox').fill(LEGACY_LINE);

    await expect(page.getByText('CMS was removed in JDK 14', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('MaxRAMPercentage is silently ignored', { exact: false }).first()).toBeVisible();

    await page.getByRole('link', { name: 'Open in calculator with these values' }).click();
    await expect(page).toHaveURL(/heap=1024/);
    await expect(page.getByRole('spinbutton').first()).toHaveValue('1024');
});
