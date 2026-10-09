import { unzipSync } from 'fflate';
import { readPlist } from './read-plist';
import { readProfile, TProcreateProfile } from './brush-profile';

export type TImportedTip = {
    name: string; png: Uint8Array; grain?: Uint8Array; spacing: number; inverted: boolean;
    profile: TProcreateProfile; unhandled: string[]; archive: Uint8Array;
    secondary?: { archive: Uint8Array; shape?: Uint8Array; grain?: Uint8Array };
};
export type TImportResult = { tips: TImportedTip[]; skipped: string[] };
const MAX_FILE = 50 * 1024 * 1024;
const MAX_EXPANDED = 100 * 1024 * 1024;
export const MAX_BRUSHES = 100;

/** Read only the root settings, without recursively expanding keyed-archive references. */
export function settings(bytes: Uint8Array) {
    const plist = readPlist(bytes);
    const objects = plist.$objects;
    const root = plist.$top?.root?.['CF$UID'];
    if (!Array.isArray(objects) || !Number.isInteger(root)) throw new Error('Invalid brush metadata');
    const brush = objects[root];
    if (!brush || typeof brush !== 'object') throw new Error('Invalid brush metadata');
    let budget = 50000;
    const resolve = (value: any, depth = 0): any => {
        if (depth > 30 || --budget < 0) throw new Error('Invalid metadata reference');
        if (value && typeof value === 'object' && 'CF$UID' in value) {
            const id = value['CF$UID'];
            if (!Number.isInteger(id) || id < 0 || id >= objects.length) throw new Error('Invalid metadata reference');
            return id === 0 ? null : resolve(objects[id], depth + 1);
        }
        if (Array.isArray(value)) return value.map((item) => resolve(item, depth + 1));
        if (value && typeof value === 'object' && !(value instanceof Uint8Array)) {
            return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$class')
                .map(([key, item]) => [key, resolve(item, depth + 1)]));
        }
        return value;
    };
    const raw = Object.fromEntries(Object.entries(brush).map(([key, value]) => [key, resolve(value)]));
    const name = raw.name;
    const spacing = raw.plotSpacing;
    return {
        name: typeof name === 'string' ? name.slice(0, 200) : undefined,
        // Procreate spacing is relative to diameter; PenBrush uses radius.
        spacing: typeof spacing === 'number' && Number.isFinite(spacing)
            ? Math.max(0.02, Math.min(2, spacing)) * 2 : 0.2,
        inverted: brush.shapeInverted === true,
        ...readProfile(raw),
        bundledGrain: typeof raw.bundledGrainPath === 'string' ? raw.bundledGrainPath : undefined,
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
                if (!/(^|\/)(Shape\.png|Grain\.png|Brush\.archive|brushset\.plist)$/i.test(entry.name) &&
                    (nested || !/\.brush$/i.test(entry.name))) return false;
                expanded += entry.originalSize;
                if (entry.originalSize > MAX_FILE || expanded > MAX_EXPANDED) {
                    throw new Error('Brush archive expands beyond the 100 MB limit.');
                }
                return true;
            },
        });
        const paths = Object.keys(files);
        const folders = new Set(paths.filter((path) => /(^|\/)(Shape\.png|Brush\.archive)$/i.test(path) &&
            !/(^|\/)Sub\d+(\/|$)/i.test(path))
            .map((path) => path.slice(0, path.lastIndexOf('/') + 1)));
        let orderedFolders = [...folders];
        if (files['brushset.plist']) {
            try {
                const order = readPlist(files['brushset.plist']).brushes;
                if (Array.isArray(order)) orderedFolders.sort((a, b) => {
                    const rank = (folder: string) => {
                        const index = order.indexOf(folder.replace(/\/$/, ''));
                        return index < 0 ? order.length : index;
                    };
                    return rank(a) - rank(b);
                });
            } catch { /* A damaged manifest does not invalidate usable brush records. */ }
        }
        for (const folder of orderedFolders) {
            if (result.tips.length + result.skipped.length >= MAX_BRUSHES) {
                throw new Error('Import at most 100 brushes at a time.');
            }
            const archive = paths.find((path) => path.toLowerCase() === (folder + 'Brush.archive').toLowerCase());
            const shape = paths.find((path) => path.toLowerCase() === (folder + 'Shape.png').toLowerCase());
            const grain = paths.find((path) => path.toLowerCase() === (folder + 'Grain.png').toLowerCase());
            const fallback = folder.replace(/\/$/, '').split('/').pop() || label.replace(/\.(brush|brushset)$/i, '');
            try {
                if (!archive) throw new Error('Missing metadata');
                const meta = settings(files[archive]);
                const secondaryArchive = paths.find((path) => path.toLowerCase() === (folder + 'Sub01/Brush.archive').toLowerCase());
                let secondary: TImportedTip['secondary'];
                if (secondaryArchive) {
                    const find = (name: string) => {
                        const path = paths.find((item) => item.toLowerCase() === (folder + 'Sub01/' + name).toLowerCase());
                        return path ? files[path] : undefined;
                    };
                    secondary = { archive: files[secondaryArchive], shape: find('Shape.png'), grain: find('Grain.png') };
                    meta.unhandled.push('Dual brush component (Sub01)');
                }
                if (!shape) {
                    result.skipped.push(meta.name || fallback);
                    continue;
                }
                if (!grain && meta.bundledGrain) meta.unhandled.push(`Missing grain: ${meta.bundledGrain}`);
                result.tips.push({ ...meta, name: meta.name || fallback, png: files[shape],
                    grain: grain ? files[grain] : undefined, archive: files[archive], secondary });
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
export async function decodeTip(png: Uint8Array, inverted: boolean,
    resolution = 256, isGrain = false): Promise<HTMLCanvasElement> {
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
        const scale = resolution / Math.max(width, height);
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));
        canvas.width = isGrain ? w : resolution;
        canvas.height = isGrain ? h : resolution;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < pixels.data.length; i += 4) {
            const luminance = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
            pixels.data[i + 3] *= (inverted ? 255 - luminance : luminance) / 255;
            pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 0;
        }
        ctx.putImageData(pixels, 0, 0);
        return canvas;
    } finally { URL.revokeObjectURL(url); }
}
