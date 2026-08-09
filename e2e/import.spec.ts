import { expect, test } from '@playwright/test';

const DEPLOYMENT_YAML = `apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: app
          image: registry.local/orders:1.4.2
          resources:
            limits:
              memory: "1Gi"
          env:
            - name: JAVA_TOOL_OPTIONS
              value: "-XX:MaxRAMPercentage=70.0 -XX:+UseG1GC -Xss1m"`;

test('imports a deployment and hands the flags to the audit', async ({ page }) => {
    await page.goto('/import');
    await page.getByRole('textbox').fill(DEPLOYMENT_YAML);

    await expect(page.getByText('1024 Mi', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('app', { exact: false }).first()).toBeVisible();

    await page.getByRole('link', { name: 'Audit these flags' }).click();
    await expect(page).toHaveURL(/\/flags\?/);
    await expect(page.getByRole('textbox')).toHaveValue(/MaxRAMPercentage=70\.0/);
});
