/** Normalized controls for Klecks' Procreate approximation, not an engine specification. */
export type TProcreateProfile = {
    jitter: number;
    rotation: number;
    scatter: number;
    randomStart: boolean;
    count: number;
    countJitter: number;
    flipX: boolean;
    flipY: boolean;
    pressureSize: number;
    pressureOpacity: number;
    minSize: number;
    minOpacity: number;
    opacity: number;
    flow: number;
    sizeJitter: number;
    opacityJitter: number;
    falloff: number;
    grainScale: number;
    grainMovement: number;
    grainZoom: number;
    grainRotation: number;
    grainDepth: number;
    grainBrightness: number;
    grainContrast: number;
    grainInverted: boolean;
    grainFilter: boolean;
};

export function readProfile(raw: Record<string, unknown>): {
    profile: TProcreateProfile;
    unhandled: string[];
} {
    const consumed = new Set(['name', '$class', 'bundledShapePath', 'bundledGrainPath',
        'shapeInverted', 'plotSpacing', 'color', 'paintSize', 'eraseSize', 'eraseOpacity',
        'smudgeSize', 'smudgeOpacity', 'maxSize', 'maxOpacity']);
    const n = (key: string, fallback: number, min = 0, max = 1): number => {
        consumed.add(key);
        const value = raw[key];
        return typeof value === 'number' && Number.isFinite(value)
            ? Math.min(max, Math.max(min, value)) : fallback;
    };
    const b = (key: string, fallback = false): boolean => {
        consumed.add(key);
        return typeof raw[key] === 'boolean' ? raw[key] : fallback;
    };
    const oriented = b('oriented');
    const profile: TProcreateProfile = {
        jitter: n('plotJitter', 0),
        rotation: n('shapeRotation', oriented ? 1 : 0, -1),
        scatter: n('shapeScatter', 0),
        randomStart: b('shapeRandomise'),
        count: Math.round(n('shapeCount', 1, 1, 16)),
        countJitter: n('shapeCountJitter', 0),
        flipX: b('shapeFlipX'),
        flipY: b('shapeFlipY'),
        pressureSize: n('dynamicsPressureSize', 1, -1),
        pressureOpacity: n('dynamicsPressureOpacity', 0, -1),
        minSize: n('minSize', 0),
        minOpacity: n('minOpacity', 0),
        opacity: n('paintOpacity', 1),
        flow: n('dynamicsGlazeFlow', 1),
        sizeJitter: n('dynamicsJitterSize', 0),
        opacityJitter: n('dynamicsJitterOpacity', 0),
        falloff: n('dynamicsFalloff', 0),
        grainScale: n('textureScale', 0.25, 0.01, 4),
        grainMovement: n('textureMovement', 1),
        grainZoom: n('textureZoom', 0),
        grainRotation: n('textureRotation', 0, -1),
        grainDepth: n('textureDepth', 1),
        grainBrightness: n('textureBrightness', 0, -1),
        grainContrast: n('textureContrast', 0, -1),
        grainInverted: b('textureInverted'),
        grainFilter: b('textureFilter', true),
    };
    // Preserve/report even unfamiliar fields: their meaning may change between Procreate versions.
    const unhandled = Object.keys(raw).filter((key) => !consumed.has(key) &&
        !key.startsWith('$') && raw[key] !== false && raw[key] !== 0 && raw[key] !== null);
    return { profile, unhandled };
}

export function pressureFactor(pressure: number, amount: number, minimum: number): number {
    const p = Math.max(0, Math.min(1, pressure));
    const response = amount >= 0 ? 1 - amount * (1 - p) : 1 + amount * p;
    return Math.max(minimum, response);
}
