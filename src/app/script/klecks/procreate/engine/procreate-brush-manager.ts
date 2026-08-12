import { ParsedProcreateBrush } from '../parser/procreate-parser';
import { ProcreateBrush } from './procreate-brush';

export const importedProcreateBrushes: ParsedProcreateBrush[] = [];

// Allow registering a callback to update the UI when a brush is imported
type RegistryListener = () => void;
const listeners: RegistryListener[] = [];

export function onProcreateBrushImported(callback: RegistryListener): void {
    listeners.push(callback);
}

export function importProcreateBrush(parsedBrush: ParsedProcreateBrush): void {
    importedProcreateBrushes.push(parsedBrush);
    listeners.forEach(l => l());
}

export function createProcreateBrushInstance(index: number): ProcreateBrush | null {
    const data = importedProcreateBrushes[index];
    if (!data) return null;
    return new ProcreateBrush(data.model, data.shapeImage, data.grainImage);
}
