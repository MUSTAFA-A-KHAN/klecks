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
        ctx.drawImage(img, 0, 0, 256, 256);
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
    await page.getByRole('button', { name: 'Inverted', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Inverted', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(library.locator('option:checked')).toHaveText('Inverted');
    await page.reload();
    await expect(button).toBeEnabled();
    await expect(page.getByText('mixed', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inverted', exact: true })).toBeVisible();
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

test('imports and paints every pencil in the supplied reference set', async ({ page }) => {
    test.skip(!process.env.PROCREATE_TEST_FILE, 'Set PROCREATE_TEST_FILE to the local Pencil_Brushes.brushset');
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./');
    const button = page.getByRole('button', { name: 'Import Procreate brushes' });
    await expect(button).toBeEnabled();
    const picker = page.waitForEvent('filechooser');
    await button.click();
    await (await picker).setFiles(process.env.PROCREATE_TEST_FILE!);
    await expect(page.getByRole('status')).toContainText('Imported: 17', { timeout: 30000 });
    const library = page.getByRole('combobox', { name: 'Imported brush tips' });
    await expect(library.locator('option')).toHaveText(['Built-in brush tips',
        ...Array.from({ length: 17 }, (_, i) => `Pencil ${i + 1}`)]);
    const sizeSlider = page.locator('.slider-wrapper').filter({ hasText: /^Size/ }).filter({ visible: true });
    await sizeSlider.dblclick();
    const input = page.locator('input[type="number"]').filter({ visible: true });
    await input.fill('32');
    await input.press('Enter');
    for (let i = 0; i < 17; i++) {
        const name = `Pencil ${i + 1}`;
        await library.selectOption({ label: name });
        await expect(page.locator('img[width="44"]')).toHaveAttribute('alt', name);
        const x = 60 + (i % 3) * 300;
        const y = 80 + Math.floor(i / 3) * 135;
        const clip = { x: x - 20, y: y - 30, width: 260, height: 100 };
        await page.mouse.move(960, 40);
        const before = await page.screenshot({ clip });
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 200, y + 30, { steps: 30 });
        await page.mouse.up();
        await page.mouse.move(960, 40);
        await expect.poll(async () => (await page.screenshot({ clip })).equals(before),
            { message: `${name} must produce visible paint` }).toBe(false);
    }
    await page.screenshot({ path: 'test-results/reference-pencils.png' });
    await library.selectOption({ label: 'Pencil 4' });
    await expect(page.locator('img[width="44"]')).toHaveAttribute('alt', 'Pencil 4');
    await page.getByText('Brush compatibility', { exact: true }).click();
    await expect(page.locator('details').filter({ hasText: 'Brush compatibility' }))
        .toContainText('Dual brush component');
    await page.reload();
    await expect(button).toBeEnabled();
    await expect(library.locator('option')).toHaveCount(18);
    await library.selectOption({ label: 'Pencil 3' });
    await expect(page.locator('img[width="44"]')).toHaveAttribute('alt', 'Pencil 3');
    expect(errors).toEqual([]);
});

test('renders grain differently from a solid tip and accepts XML brush metadata', async ({ page }) => {
    await page.goto('./');
    const button = page.getByRole('button', { name: 'Import Procreate brushes' });
    const upload = async (name: string) => {
        await expect(button).toBeEnabled();
        const picker = page.waitForEvent('filechooser');
        await button.click();
        await (await picker).setFiles(path.resolve(`tests/fixtures/${name}`));
    };
    await upload('advanced.brushset');
    await expect(page.getByRole('status')).toContainText('Imported: 3');
    const library = page.getByRole('combobox', { name: 'Imported brush tips' });
    await page.locator('.slider-wrapper').filter({ hasText: /^Size/ }).filter({ visible: true }).dblclick();
    const input = page.locator('input[type="number"]').filter({ visible: true });
    await input.fill('80');
    await input.press('Enter');
    const clip = { x: 300, y: 200, width: 200, height: 200 };
    const stamp = async (name: string) => {
        await library.selectOption({ label: name });
        await expect(page.locator('img[width="44"]')).toHaveAttribute('alt', name);
        await page.mouse.click(400, 300);
        await page.mouse.move(950, 50);
        return page.screenshot({ clip });
    };
    const solid = await stamp('Solid');
    await page.keyboard.press('Control+z');
    const textured = await stamp('Textured');
    expect(textured.equals(solid)).toBe(false);
    await page.keyboard.press('Control+z');
    expect((await stamp('Solid')).equals(solid)).toBe(true);
    await upload('xml.brush');
    await expect(page.getByRole('status')).toContainText('Imported: 1');
    await expect(page.locator('img[width="44"]')).toHaveAttribute('alt', 'XML tip');
});

test('maximum transfer caps overlap within a stroke and accumulates between strokes', async ({ page }) => {
    await page.goto('./');
    const button = page.getByRole('button', { name: 'Import Procreate brushes' });
    await expect(button).toBeEnabled();
    const picker = page.waitForEvent('filechooser');
    await button.click();
    await (await picker).setFiles(path.resolve('tests/fixtures/transfer.brush'));
    await expect(page.locator('img[width="44"]')).toHaveAttribute('alt', 'Transfer');
    const sample = async () => {
        await page.mouse.move(950, 50);
        const png = await page.screenshot({ clip: { x: 400, y: 300, width: 1, height: 1 } });
        return page.evaluate(async (src) => {
            const img = new Image();
            await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = src; });
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            return ctx.getImageData(0, 0, 1, 1).data[0];
        }, `data:image/png;base64,${png.toString('base64')}`);
    };
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(450, 300, { steps: 20 });
    await page.mouse.move(400, 300, { steps: 20 });
    await page.mouse.up();
    const oneStroke = await sample();
    expect(oneStroke).toBeGreaterThanOrEqual(189);
    expect(oneStroke).toBeLessThanOrEqual(193);
    await page.mouse.click(400, 300);
    const twoStrokes = await sample();
    expect(twoStrokes).toBeGreaterThanOrEqual(140);
    expect(twoStrokes).toBeLessThanOrEqual(146);
    await page.keyboard.press('Control+z');
    expect(await sample()).toBe(oneStroke);
    await page.keyboard.press('Control+Shift+z');
    expect(await sample()).toBe(twoStrokes);
});
