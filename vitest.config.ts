import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('.', import.meta.url)),
        },
    },
    test: {
        // Playwright specs live in e2e/ and are not vitest tests.
        exclude: [...configDefaults.exclude, 'e2e/**'],
    },
});
