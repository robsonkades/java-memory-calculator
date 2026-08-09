import { expect, test } from '@playwright/test';

const NMT_SAMPLE = `Total: reserved=1892974KB, committed=595406KB

-                 Java Heap (reserved=524288KB, committed=524288KB)
                            (mmap: reserved=524288KB, committed=524288KB)
-                     Class (reserved=1049289KB, committed=12233KB)
                            (classes #21015)
-                    Thread (reserved=41172KB, committed=4128KB)
                            (thread #40)
-                      Code (reserved=50208KB, committed=14848KB)
-                        GC (reserved=134794KB, committed=25610KB)`;

test('analyzes a summary, bridges to the calculator and checks RSS', async ({ page }) => {
    await page.goto('/nmt');
    await page.getByRole('textbox').first().fill(NMT_SAMPLE);

    await expect(page.getByText('Recommended container memory limit', { exact: true })).toBeVisible();
    await expect(page.getByText('669 Mi', { exact: true })).toBeVisible();

    const bridge = page.getByRole('link', { name: 'Open in calculator with these numbers' });
    await expect(bridge).toHaveAttribute('href', /heap=512/);
    await expect(bridge).toHaveAttribute('href', /threads=40/);
    await expect(bridge).toHaveAttribute('href', /classes=21015/);

    await page.getByRole('spinbutton').last().fill('650');
    await expect(page.getByText('+69 MiB', { exact: false })).toBeVisible();
    await expect(page.getByText('748 Mi', { exact: false })).toBeVisible();
});
