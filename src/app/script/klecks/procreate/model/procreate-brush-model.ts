export interface ProcreateBrushModel {
    id: string; // e.g. procreate:<uuid>
    name: string;

    // Stroke Attributes
    spacing: number;
    jitter: number;

    // Base Attributes
    size: number;
    opacity: number;

    // Dynamics - Pressure
    pressureSize: number;
    pressureOpacity: number;

    // Shape Dynamics
    scatter: number;
    rotation: number;
}

export const defaultProcreateBrushModel: ProcreateBrushModel = {
    id: 'procreate:default',
    name: 'Imported Brush',

    spacing: 0.1,
    jitter: 0,

    size: 20,
    opacity: 1,

    pressureSize: 1,
    pressureOpacity: 1,

    scatter: 0,
    rotation: 0,
};
