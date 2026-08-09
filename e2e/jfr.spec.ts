import { expect, test } from '@playwright/test';

const JFR_PRINT_SAMPLE = `jdk.GCHeapSummary {
  gcId = 3
  when = "After GC"
  heapUsed = 40.0 MB
}

jdk.GCHeapSummary {
  gcId = 4
  when = "After GC"
  heapUsed = 34.4 MB
}

jdk.NativeMemoryUsage {
  type = "Java Heap"
  reserved = 4.0 GB
  committed = 128.0 MB
}`;

test('parses jfr print output into a heap recommendation', async ({ page }) => {
    await page.goto('/jfr');
    await page.getByRole('textbox').fill(JFR_PRINT_SAMPLE);

    await expect(page.getByText('Recommended heap', { exact: true })).toBeVisible();
    await expect(page.getByText('102 MiB', { exact: true })).toBeVisible();
    await expect(page.getByText('Java Heap', { exact: true })).toBeVisible();

    await expect(page.getByRole('link', { name: 'Open in calculator with this heap' }))
        .toHaveAttribute('href', /heap=102/);
});
