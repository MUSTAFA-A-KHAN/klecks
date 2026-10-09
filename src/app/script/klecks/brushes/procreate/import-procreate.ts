import { unzipSync } from 'fflate';
import { readBinaryPlist } from './binary-plist';

export type TImportedTip = { name: string; png: Uint8Array; spacing: number; inverted: boolean };
export type TImportResult = { tips: TImportedTip[]; skipped: string[] };
const MAX_FILE = 50 * 1024 * 1024;
const MAX_EXPANDED = 100 * 1024 * 1024;
export const MAX_BRUSHES = 100;

/** Read only the root settings, without recursively expanding keyed-archive references. */
function settings(bytes: Uint8Array): { name?: string; spacing: number; inverted: boolean } {
    const plist = readBinaryPlist(bytes);
    const objects = plist.$objects;
    const root = plist.$top?.root?.['CF$UID'];
    if (!Array.isArray(objects) || !Number.isInteger(root)) throw new Error('Invalid brush metadata');
    const brush = objects[root];
    if (!brush || typeof brush !== 'object') throw new Error('Invalid brush metadata');
    const name = typeof brush.name === 'string' ? brush.name : objects[brush.name?.['CF$UID']];
    const spacing = brush.plotSpacing;
    return {
        name: typeof name === 'string' ? name.slice(0, 200) : undefined,
        // Procreate spacing is relative to diameter; PenBrush uses radius.
        spacing: typeof spacing === 'number' && Number.isFinite(spacing)
            ? Math.max(0.02, Math.min(2, spacing)) * 2 : 0.2,
        inverted: brush.shapeInverted === true,
    };
}

/** Extract embedded tips. Built-in Procreate assets cannot be recovered from references. */
export function extractProcreate(bytes: Uint8Array, filename: string): TImportResult {
    if (!/\.(brush|brushset)$/i.test(filename)) throw new Error('Choose a .brush or .brushset file.');
    if (bytes.length > MAX_FILE) throw new Error('Brush files must be smaller than 50 MB.');
    let expanded = 0;
    let entries = 0;
    const result: TImportResult = { tips: [], skipped: [] };
    const unpack = (data: Uint8Array, label: string, nested: boolean) => {
        const files = unzipSync(data, {
            filter: (entry) => {
                if (++entries > 10000) throw new Error('Too many files in brush archive.');
                if (/(^|\/)(__MACOSX|Reset|QuickLook)(\/|$)/i.test(entry.name)) return false;
                if (!/(^|\/)(Shape\.png|Brush\.archive)$/i.test(entry.name) &&
                    (nested || !/\.brush$/i.test(entry.name))) return false;
                expanded += entry.originalSize;
                if (entry.originalSize > MAX_FILE || expanded > MAX_EXPANDED) {
                    throw new Error('Brush archive expands beyond the 100 MB limit.');
                }
                return true;
            },
        });
        const paths = Object.keys(files);
        const folders = new Set(paths.filter((path) => /(^|\/)(Shape\.png|Brush\.archive)$/i.test(path))
            .map((path) => path.slice(0, path.lastIndexOf('/') + 1)));
        for (const folder of folders) {
            if (result.tips.length + result.skipped.length >= MAX_BRUSHES) {
                throw new Error('Import at most 100 brushes at a time.');
            }
            const archive = paths.find((path) => path.toLowerCase() === (folder + 'Brush.archive').toLowerCase());
            const shape = paths.find((path) => path.toLowerCase() === (folder + 'Shape.png').toLowerCase());
            const fallback = folder.replace(/\/$/, '').split('/').pop() || label.replace(/\.(brush|brushset)$/i, '');
            try {
                if (!archive) throw new Error('Missing metadata');
                const meta = settings(files[archive]);
                if (!shape) {
                    result.skipped.push(meta.name || fallback);
                    continue;
                }
                result.tips.push({ ...meta, name: meta.name || fallback, png: files[shape] });
            } catch {
                result.skipped.push(fallback);
            }
        }
        if (!nested) {
            for (const path of paths.filter((path) => /\.brush$/i.test(path))) {
                try { unpack(files[path], path.split('/').pop()!, true); }
                catch (error) {
                    // Resource limits apply to the entire set, including nested brushes.
                    if (expanded > MAX_EXPANDED || entries > 10000 ||
                        result.tips.length + result.skipped.length >= MAX_BRUSHES) throw error;
                    result.skipped.push(path);
                }
            }
        }
    };
    unpack(bytes, filename, false);
    if (!result.tips.length && !result.skipped.length) throw new Error('No Procreate brushes found in this file.');
    return result;
}

/** White in Procreate's shape image represents paint coverage, not white paint. */
export async function decodeTip(png: Uint8Array, inverted: boolean): Promise<HTMLCanvasElement> {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (png.length < 24 || signature.some((byte, i) => png[i] !== byte)) throw new Error('Invalid shape image');
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (!width || !height || width > 4096 || height > 4096) throw new Error('Shape image is too large');
    const url = URL.createObjectURL(new Blob([new Uint8Array(png)], { type: 'image/png' }));
    try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Cannot decode shape image'));
            img.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d')!;
        const scale = 256 / Math.max(width, height);
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));
        ctx.drawImage(img, (256 - w) / 2, (256 - h) / 2, w, h);
        const pixels = ctx.getImageData(0, 0, 256, 256);
        for (let i = 0; i < pixels.data.length; i += 4) {
            const luminance = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
            pixels.data[i + 3] *= (inverted ? 255 - luminance : luminance) / 255;
            pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 0;
        }
        ctx.putImageData(pixels, 0, 0);
        return canvas;
    } finally { URL.revokeObjectURL(url); }
}
