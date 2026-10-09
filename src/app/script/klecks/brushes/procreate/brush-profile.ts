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
    sizeCurve: [number, number][];
    opacityCurve: [number, number][];
    roundness: number;
    angle: number;
    flipXJitter: boolean;
    flipYJitter: boolean;
    maxTransfer: boolean;
};

export function readProfile(raw: Record<string, unknown>): {
    profile: TProcreateProfile;
    unhandled: string[];
} {
    const consumed = new Set(['name', '$class', 'bundledShapePath', 'bundledGrainPath',
        'shapeInverted', 'plotSpacing', 'color', 'paintSize', 'eraseSize', 'eraseOpacity',
        'smudgeSize', 'smudgeOpacity', 'maxSize', 'maxOpacity', 'authorName', 'creationDate',
        'previewSize', 'importedFromABR', 'version', 'cloneSize', 'cloneOpacity']);
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
    const curve = (key: string): [number, number][] => {
        const source = raw[key] as { points?: { 'NS.objects'?: unknown[] } } | undefined;
        const points = source?.points?.['NS.objects'];
        if (!Array.isArray(points) || points.length < 2 || points.length > 16) return [[0, 0], [1, 1]];
        const parsed: [number, number][] = [];
        for (const point of points) {
            const match = typeof point === 'string' && point.match(/^\{\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*\}$/);
            if (!match) return [[0, 0], [1, 1]];
            const x = Number(match[1]);
            const y = Number(match[2]);
            if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return [[0, 0], [1, 1]];
            parsed.push([x, y]);
        }
        consumed.add(key);
        return parsed.sort((a, b) => a[0] - b[0]);
    };
    const count = n('shapeCount', 0, 0, 16);
    const profile: TProcreateProfile = {
        jitter: n('plotJitter', 0),
        rotation: n('shapeRotation', oriented ? 1 : 0, -1),
        scatter: n('shapeScatter', 0, 0, 2),
        randomStart: b('shapeRandomise'),
        count: Math.max(1, Math.round(count <= 1 ? count * 16 : count)),
        countJitter: n('shapeCountJitter', 0),
        flipX: b('shapeFlipX'),
        flipY: b('shapeFlipY'),
        pressureSize: n('dynamicsPressureSize', 1, -1),
        pressureOpacity: n('dynamicsPressureOpacity', 0, -1),
        minSize: n('minSize', 0),
        minOpacity: n('minOpacity', 0),
        opacity: n('paintOpacity', 1),
        flow: n('dynamicsGlazedFlow', n('dynamicsGlazeFlow', 1)),
        sizeJitter: n('dynamicsJitterSize', 0),
        opacityJitter: n('dynamicsJitterOpacity', 0),
        falloff: n('dynamicsFalloff', 0),
        grainScale: n('textureScale', 0.25, 0.01, 4),
        grainMovement: n('textureMovement', 1),
        grainZoom: n('textureZoom', 0),
        grainRotation: n('textureRotation', 0, -1),
        grainDepth: n('grainDepth', n('textureDepth', 1)),
        grainBrightness: n('textureBrightness', 0, -1),
        grainContrast: n('textureContrast', 0, -1),
        grainInverted: b('textureInverted'),
        grainFilter: b('textureFilter', true),
        sizeCurve: curve('dynamicsPressureSizeCurve'),
        opacityCurve: curve('dynamicsPressureOpacityCurve'),
        roundness: n('shapeRoundness', 1, 0.01),
        angle: n('shapeAngle', 0, -Math.PI * 2, Math.PI * 2),
        flipXJitter: b('shapeFlipXJitter'),
        flipYJitter: b('shapeFlipYJitter'),
        maxTransfer: b('renderingMaxTransfer'),
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

/** Linear interpolation of archived pressure control points; Procreate's spline may differ. */
export function curvePressure(pressure: number, points: [number, number][]): number {
    if (pressure <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
        if (pressure <= points[i][0]) {
            const [x0, y0] = points[i - 1];
            const [x1, y1] = points[i];
            return x1 === x0 ? y1 : y0 + (y1 - y0) * (pressure - x0) / (x1 - x0);
        }
    }
    return points[points.length - 1][1];
}
