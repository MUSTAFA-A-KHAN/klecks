import { test, expect } from '@playwright/test';
import path from 'node:path';

test('imports, paints, persists, switches back, and removes a brush', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./');
    const button = page.getByRole('button', { name: 'Import Procreate brushes' });
    await expect(button).toBeEnabled();
    const picker = page.waitForEvent('filechooser');
    await button.click();
    await (await picker).setFiles(path.resolve('tests/fixtures/tip.brush'));
    await expect(page.getByRole('status')).toContainText('Imported: 1');
    const library = page.getByRole('combobox', { name: 'Imported brush tips' });
    await expect(library.locator('option:checked')).toHaveText('Test L – 筆');
    const alpha = await page.locator('img[width="44"]').evaluate((img: HTMLImageElement) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return [ctx.getImageData(48, 80, 1, 1).data[3], ctx.getImageData(128, 64, 1, 1).data[3]];
    });
    expect(alpha[0]).toBeGreaterThan(240);
    expect(alpha[1]).toBe(0);
    const clip = { x: 200, y: 200, width: 400, height: 250 };
    await page.mouse.move(900, 100);
    const before = await page.screenshot({ clip });
    await page.mouse.move(250, 280);
    await page.mouse.down();
    await page.mouse.move(500, 350, { steps: 25 });
    await page.mouse.up();
    await page.mouse.move(900, 100);
    await expect.poll(async () => (await page.screenshot({ clip })).equals(before)).toBe(false);
    const painted = await page.screenshot({ clip });
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await page.screenshot({ clip })).equals(before)).toBe(true);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(async () => (await page.screenshot({ clip })).equals(painted)).toBe(true);
    await page.getByTitle('Circle', { exact: true }).filter({ visible: true }).click();
    await expect(library).toHaveValue('');
    await library.selectOption({ label: 'Test L – 筆' });
    await page.getByRole('button', { name: 'Remove imported brush' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/brush-library.png' });
    await page.reload();
    await expect(button).toBeEnabled();
    await library.selectOption({ label: 'Test L – 筆' });
    await expect(page.getByRole('button', { name: 'Remove imported brush' })).toBeEnabled();
    await page.getByRole('button', { name: 'Remove imported brush' }).click();
    await expect(library.locator('option')).toHaveCount(1);
    await page.reload();
    await expect(button).toBeEnabled();
    await expect(library.locator('option')).toHaveCount(1);
    expect(errors).toEqual([]);
});

test('reports partially supported sets and recovers after a bad file', async ({ page }) => {
    await page.goto('./');
    const button = page.getByRole('button', { name: 'Import Procreate brushes' });
    const upload = async (file: string | { name: string; mimeType: string; buffer: Buffer }) => {
        await expect(button).toBeEnabled();
        const picker = page.waitForEvent('filechooser');
        await button.click();
        await (await picker).setFiles(file);
    };
    await upload({ name: 'bad.brush', mimeType: 'application/octet-stream', buffer: Buffer.from('bad') });
    await expect(page.getByRole('status')).toContainText('Could not import');
    await upload(path.resolve('tests/fixtures/mixed.brushset'));
    await expect(page.getByRole('status')).toContainText('Imported: 2');
    await expect(page.getByRole('status')).toContainText('Bundled shape');
    const library = page.getByRole('combobox', { name: 'Imported brush tips' });
    await expect(library.locator('option')).toHaveCount(3);
    await library.selectOption({ label: 'Inverted' });
    await expect(library.locator('option:checked')).toHaveText('Inverted');
});

test('keeps unsaved imports usable and removable when brush storage fails', async ({ page }) => {
    await page.addInitScript(() => {
        const open = IDBFactory.prototype.open;
        IDBFactory.prototype.open = function (name, version) {
            if (name === 'klecks-imported-brushes') throw new Error('Storage unavailable in test');
            return open.call(this, name, version);
        };
    });
    await page.goto('./');
    const button = page.getByRole('button', { name: 'Import Procreate brushes' });
    await expect(button).toBeEnabled();
    const picker = page.waitForEvent('filechooser');
    await button.click();
    await (await picker).setFiles(path.resolve('tests/fixtures/tip.brush'));
    await expect(page.getByRole('status')).toContainText('only for this session');
    const library = page.getByRole('combobox', { name: 'Imported brush tips' });
    await expect(library.locator('option:checked')).toHaveText('Test L – 筆');
    await page.getByRole('button', { name: 'Remove imported brush' }).click();
    await expect(library.locator('option')).toHaveCount(1);
});
