import { expect, test } from '@playwright/test';

const SMAPS_SAMPLE = `7f0000000000-7f001f400000 rw-p 00000000 00:00 0
Size:             512000 kB
Rss:              480000 kB
7f0040000000-7f0044000000 rw-p 00000000 00:00 0
Size:              65536 kB
Rss:               60000 kB
7f0050000000-7f0050400000 r--s 00000000 08:01 123456                     /app/app.jar
Size:               4096 kB
Rss:                2048 kB`;

test('buckets pasted smaps output and calls out the glibc arena signature', async ({ page }) => {
    await page.goto('/smaps');
    await page.getByRole('textbox').fill(SMAPS_SAMPLE);

    await expect(page.getByRole('cell', { name: /glibc malloc arenas \(signature\)/ })).toBeVisible();
    await expect(page.getByText('MALLOC_ARENA_MAX=2').first()).toBeVisible();
    await expect(page.getByText('MiB total').first()).toBeVisible();
});
