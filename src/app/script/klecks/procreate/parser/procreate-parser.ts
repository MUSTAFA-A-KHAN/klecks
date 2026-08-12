import * as fflate from 'fflate';
import { parse } from '@plist/binary.parse';
import { ProcreateBrushModel, defaultProcreateBrushModel } from '../model/procreate-brush-model';
import { createImage } from '../../../bb/base/ui';

export interface ParsedProcreateBrush {
    model: ProcreateBrushModel;
    shapeImage?: HTMLImageElement | HTMLCanvasElement;
    grainImage?: HTMLImageElement | HTMLCanvasElement;
}

export class ProcreateBrushParser {
    static async parseBrush(buffer: ArrayBuffer): Promise<ParsedProcreateBrush> {
        return new Promise((resolve, reject) => {
            const uint8Array = new Uint8Array(buffer);

            fflate.unzip(uint8Array, async (err, unzipped) => {
                if (err) {
                    return reject(new Error('Failed to unzip .brush file: ' + err.message));
                }

                let bplistData: Uint8Array | undefined;
                let shapeData: Uint8Array | undefined;
                let grainData: Uint8Array | undefined;
                let shapeName = '';
                let grainName = '';

                for (const [filename, data] of Object.entries(unzipped)) {
                    if (filename.endsWith('Node.plist')) {
                        bplistData = data;
                    } else if (filename.toLowerCase().includes('shape')) {
                        shapeData = data;
                        shapeName = filename;
                    } else if (filename.toLowerCase().includes('grain')) {
                        grainData = data;
                        grainName = filename;
                    }
                }

                if (!bplistData) {
                    return reject(new Error('Invalid .brush file: Missing Node.plist'));
                }

                let parsedBplist: any;
                try {
                    parsedBplist = parse(bplistData);
                } catch (e: any) {
                    return reject(new Error('Failed to parse Node.plist: ' + e.message));
                }

                const model = this.mapBplistToModel(parsedBplist);

                let shapeImage: HTMLImageElement | undefined;
                let grainImage: HTMLImageElement | undefined;

                if (shapeData) {
                    const blob = new Blob([shapeData], { type: this.getMimeType(shapeName) });
                    const url = URL.createObjectURL(blob);
                    try {
                        shapeImage = await this.loadImage(url);
                    } catch (e) {}
                    URL.revokeObjectURL(url);
                }

                if (grainData) {
                    const blob = new Blob([grainData], { type: this.getMimeType(grainName) });
                    const url = URL.createObjectURL(blob);
                    try {
                        grainImage = await this.loadImage(url);
                    } catch (e) {}
                    URL.revokeObjectURL(url);
                }

                resolve({
                    model,
                    shapeImage,
                    grainImage
                });
            });
        });
    }

    private static getMimeType(filename: string): string {
        const ext = filename.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'png': return 'image/png';
            case 'jpg':
            case 'jpeg': return 'image/jpeg';
            case 'webp': return 'image/webp';
            default: return 'image/png';
        }
    }

    private static async loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = createImage();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = url;
        });
    }

    private static mapBplistToModel(bplist: any): ProcreateBrushModel {
        const model = { ...defaultProcreateBrushModel };
        model.id = 'procreate:' + Math.random().toString(36).substr(2, 9); // stable random id for now

        const objects = bplist.$objects;
        if (!objects || !Array.isArray(objects)) {
            return model;
        }

        let mainDict: any = null;
        for (const obj of objects) {
            if (obj && typeof obj === 'object' && obj['strokeSpacing']) {
                mainDict = obj;
                break;
            }
        }

        if (!mainDict && bplist.$top && bplist.$top.root) {
            const rootRef = bplist.$top.root.UID;
            mainDict = objects[rootRef];
        }

        if (mainDict) {
            model.name = this.resolveValue(mainDict['name'], objects) || model.name;
            model.spacing = this.resolveValue(mainDict['strokeSpacing'], objects) ?? model.spacing;
            model.opacity = this.resolveValue(mainDict['opacity'], objects) ?? model.opacity;
            model.size = this.resolveValue(mainDict['size'], objects) ?? model.size;
            model.pressureSize = this.resolveValue(mainDict['pressureSize'], objects) ?? model.pressureSize;
            model.pressureOpacity = this.resolveValue(mainDict['pressureOpacity'], objects) ?? model.pressureOpacity;
            model.scatter = this.resolveValue(mainDict['scatter'], objects) ?? model.scatter;
            model.jitter = this.resolveValue(mainDict['jitter'], objects) ?? model.jitter;
        }

        return model;
    }

    private static resolveValue(val: any, objects: any[]): any {
        if (val && typeof val === 'object' && 'UID' in val) {
            const refObj = objects[val.UID];
            if (typeof refObj !== 'object' || refObj === null) {
                return refObj;
            }
            return refObj;
        }
        return val;
    }
}
