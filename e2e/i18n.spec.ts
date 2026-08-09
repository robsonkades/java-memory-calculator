import { expect, test } from '@playwright/test';

test('language select switches to PT, persists across reload, and returns to EN', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Recommended container memory limit')).toBeVisible();

    await page.getByRole('combobox', { name: 'Language' }).selectOption('pt-BR');
    await expect(page.getByText('Limite de memória recomendado para o container')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Calculadora' })).toBeVisible();

    await page.reload();
    await expect(page.getByText('Limite de memória recomendado para o container')).toBeVisible();

    await page.getByRole('combobox', { name: 'Idioma' }).selectOption('es');
    await expect(page.getByText('Límite de memoria recomendado para el contenedor')).toBeVisible();

    await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
    await expect(page.getByText('Recommended container memory limit')).toBeVisible();
});

test('import page renders in Portuguese after switching', async ({ page }) => {
    await page.goto('/import');
    await page.getByRole('combobox', { name: 'Language' }).selectOption('pt-BR');
    await expect(page.getByRole('heading', { name: 'Importar do Kubernetes' })).toBeVisible();

    await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
});

test('flags audit page renders in Portuguese after switching', async ({ page }) => {
    await page.goto('/flags');
    await page.getByRole('combobox', { name: 'Language' }).selectOption('pt-BR');
    await expect(page.getByRole('heading', { name: 'Auditoria de Flags da JVM' })).toBeVisible();

    await page.getByRole('textbox').fill('-Xmx1g -XX:+UseConcMarkSweepGC');
    await expect(page.getByText('✕ Problema').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Linha corrigida para Java 25/ })).toBeVisible();

    await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
});
