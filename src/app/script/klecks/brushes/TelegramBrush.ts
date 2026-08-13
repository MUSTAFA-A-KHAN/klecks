import { ShapeRecognizer } from '../canvas/ShapeRecognizer';
import { TBrush } from '../kl-types';
import { BB } from '../../bb/bb';
import { TextureManager } from '../textures/TextureManager';

// A dynamic brush that adapts the 20+ configs (plain, pencil, watercolor, smudge, etc.)
export interface BrushConfig {
    name?: string; // added manually for identifying brush type internally

    // Core properties
    opacity?: number;
    wobble?: number;
    density?: number;
    dryEdges?: number;
    bloom?: number;
    granulation?: number;
    taperLength?: number;
    taperWidth?: number;
    flatEdges?: boolean;
    autoRotation?: boolean;
    angle?: number;
    edgeStep?: number;
    textureStrength?: number;
    baseScaleFactor?: number;
    pressureAvailable?: boolean;
    pixelSize?: number;
    borderWidth?: number;
    borderColor?: string;
    outsideBorders?: boolean;
    showPixelGrid?: boolean;
    pressureOn?: boolean;
    smoothing?: number;
    squareBrush?: boolean;
    magnifierButton?: boolean;
    brushMagnifier?: boolean;
    eraserMagnifier?: boolean;
    sensitivity?: number;
    pressureCoef?: number;
    pressureExponent?: number;
    minimalPressure?: number;
    showCommonGrid?: boolean;
    gridSize?: number;
    referenceGridSize?: number;
    figure?: string;
    brush?: string;
    shape?: boolean;
    outlineSize?: number;
    outlineColor?: string;
    outlineOpacity?: number;
    dashSize?: number;
    gapSize?: number;
    softness?: number;
    ragged?: number;
    flatness?: number;
    flow?: number;
    blending?: number;
    intensity?: number;
    dragLength?: number;
    blurStrength?: number;
    weight?: number;
    tailLength?: number;
    bristleBreakup?: number;
    granuleSkipping?: number;
    granuleSize?: number;
    jitter?: number;
    proportionalTail?: boolean;
    tailRelativeLength?: number;
    softCore?: number;
    centerSoftness?: number;
    centerAlphaCut?: number;
    coreRadiusGrow?: number;
    smear?: number;
    corePack?: number;
    ovality?: number;
    maxOffsetsBase?: number;
    powder?: number;
    splinterRate?: number;
    splinterLenMax?: number;
    splinterAngleJitter?: number;
    speedDownsample?: number;
    pressureDownsample?: number;
    wetness?: number;
    edgeConcentration?: number;
    bleeding?: number;
    edgeWidth?: number;
    edgeWobbleScale?: number;
    edgeWobbleAmount?: number;
    taperStart?: number;
    taperEnd?: number;
    taperPressure?: number;
    capWidth?: number;
    taperStartEnabled?: boolean;
    capDetail?: number;
    layerSpread?: number;
    layerCount?: number;
    substrateSize?: number;
    edgeOffset?: number;
    edgeOpacity?: number;
    speedDependence?: boolean;
    centralWidth?: number;
    minWidthStart?: number;
    taperStartPoint?: number;
    minWidthEnd?: number;
    taperEndPoint?: number;
    transparentEdges?: boolean;
    opacityOnStart?: number;
    fadeStartPoint?: number;
    opacityOnEnd?: number;
    fadeEndPoint?: number;
    edgeWidening?: boolean;
    textureOn?: boolean;
    texture?: string;
    spreading?: boolean;
    textureScale?: number;
    waterBlurSize?: number;
    waterBlurAlpha?: number;
    outline?: boolean;
    tapering?: boolean;
    cutEdges?: boolean;
    shadowStrength?: number;
    ropeEffect?: boolean;
    neonSize?: number;
    highDensity?: boolean;
    bigSizes?: boolean;
    sparkleDensity?: number;
    sparkleSize?: number;
    sparkleDistributionPower?: number;
    sparkleShape?: string;
    pressureOpacity?: boolean;
    glyphRotation?: boolean;
    enhance?: boolean;
    stepSize?: number;
    highTransparency?: boolean;
    shadowColor?: string;
    tolerance?: number;
    antialiasing?: number;
    eatEdges?: boolean;
    size?: number;
    sizeX?: number;
    sizeY?: number;
    composition?: string;
}

export class TelegramBrush implements TBrush {
    private context: CanvasRenderingContext2D | null = null;
    private config: BrushConfig;
    private size: number = 10;
    private color: string = '#000000';
    private opacity: number = 1;
    private scatter: number = 0;
    private isDrawing: boolean = false;

    private points: {x: number, y: number, p: number}[] = [];
    private textureImg: HTMLImageElement | null = null;
    private lastP: {x: number, y: number, p: number} | null = null;

    constructor(config: BrushConfig) {
        this.config = config;
        this.opacity = config.opacity ?? 1;
        if (config.textureOn && config.texture) {
            TextureManager.getTexture(config.texture).then(img => {
                this.textureImg = img;
            });
        }
    }

    setContext(c: CanvasRenderingContext2D) {
        this.context = c;
    }

    setColor(c: string) {
        this.color = c;
    }

    setOpacity(o: number) {
        this.opacity = o;
    }

    setSize(s: number) {
        this.size = s;
    }

    getSize(): number {
        return this.size;
    }

    getOpacity(): number {
        return this.opacity;
    }

    getScatter(): number {
        return this.scatter;
    }

    setScatter(s: number) {
        this.scatter = s;
    }

    sizePressure(b: boolean) {
        this.config.pressureOn = b;
    }

    opacityPressure(b: boolean) {}

    scatterPressure(b: boolean) {}

    startLine(x: number, y: number, p: number) {
        this.isDrawing = true;
        this.points = [{x, y, p}];
        this.lastP = {x, y, p};

        if (this.context) {
            if (this.config.name === 'pixels') {
                this.renderPixels();
            } else if (this.config.name === 'dashed') {
                // Dashed will render on goLine / endLine when we have segments
            } else if (this.config.name === 'filler') {
                this.renderFiller();
            } else if (this.config.name === 'smudge' || this.config.name === 'blender') {
                this.renderSmudge();
            }
        }
    }

    goLine(x: number, y: number, p: number) {
        if (!this.isDrawing || !this.context) return;
        this.points.push({x, y, p});


        switch (this.config.name) {
            case 'pixels':
                this.renderPixels();
                break;
            case 'dashed':
                this.renderDashed();
                break;
            case 'spray':
                this.renderSpray();
                break;
            case 'watercolor':
                this.renderWatercolor();
                break;
            case 'smudge':
            case 'blender':
                this.renderSmudge();
                break;
            case 'filler':
                // Handled in startLine or separately
                break;
            case 'blur':
            case 'pixelate':
                // Usually post-process on the stroke path bounds
                this.renderBasicStroke(x, y, p);
                break;
            case 'bristle':
            case 'wet':
            case 'flat':
            case 'velvetPastel':
            case 'waterSpread':
            case 'waterSoft':
            case 'feather':
            case 'ink':
            case 'pencil':
            case 'oil':
            case 'rembrandt':
            case 'neon':
            case 'sparkle':
            case 'glyph':
            case 'texture':
                // Grouping textured or specific geometric strokes with basic parameterized drawing
                this.renderComplexTexturedStroke(x, y, p);
                break;
            default:
                this.renderBasicStroke(x, y, p);
                break;
        }
        this.lastP = {x, y, p};
    }

    endLine() {
        if (!this.context) return;

        if (this.config.shape && this.points.length > 5) {
            const shape = ShapeRecognizer.recognizeShape(this.points);
            if (shape && shape.type !== 'polyline') {
                // Basic shape drawing
                this.context.beginPath();
                this.context.moveTo(shape.points[0].x, shape.points[0].y);
                for(let i=1; i<shape.points.length; i++) {
                    this.context.lineTo(shape.points[i].x, shape.points[i].y);
                }
                if (shape.type !== 'line') this.context.closePath();
                this.context.stroke();
            }
        }

        if (this.config.name === 'dashed') {
           // We might need to flush any remaining path
        }

        this.isDrawing = false;
        this.context.filter = 'none';
        this.lastP = null;
    }

    isDrawingActive(): boolean {
        return this.isDrawing;
    }

    // --- Renderers ---

    private renderBasicStroke(x: number, y: number, p: number) {
        if (!this.context || !this.lastP) return;

        let currentSize = this.size;
        if (this.config.pressureOn && this.config.pressureAvailable) {
            currentSize *= p;
        }

        this.context.lineWidth = currentSize;
        this.context.lineCap = 'round';
        this.context.lineJoin = 'round';
        this.context.strokeStyle = this.color;
        this.context.globalAlpha = this.opacity;

        if (this.config.blurStrength) {
            this.context.filter = `blur(${this.config.blurStrength * 10}px)`;
        } else {
            this.context.filter = 'none';
        }

        this.context.beginPath();
        this.context.moveTo(this.lastP.x, this.lastP.y);
        this.context.lineTo(x, y);
        this.context.stroke();
    }

    private renderPixels() {
        if (!this.context) return;
        const s = this.config.pixelSize || 10;
        const d = this.config.pressureAvailable;
        const points = this.points;
        const h = [];

        // Simple interpolation logic based on distance
        if (points.length > 1) {
            const t = this.lastP!;
            const r = points[points.length - 1];
            const i = r.x - t.x;
            const a = r.y - t.y;
            const o = Math.sqrt(i * i + a * a);
            const l = Math.max(1, Math.ceil(o / (s / 2)));
            for (let e = 0; e < l; e++) {
                const n = e / l;
                const pnt: any = { x: t.x + i * n, y: t.y + a * n };
                if (d) {
                    const pressT = t.p ?? 1;
                    const pressR = r.p ?? 1;
                    pnt.p = pressT + (pressR - pressT) * n;
                }
                h.push(pnt);
            }
        } else {
            h.push(points[points.length - 1]);
        }

        const m = new Map();
        const g = Math.max(this.size / 2 - 1, 0.5);
        const f = g * g;

        for (const v of h) {
            const press = v.p ?? 1;
            const t = Math.floor((v.x - g) / s);
            const n = Math.ceil((v.x + g) / s);
            const r = Math.floor((v.y - g) / s);
            const i = Math.ceil((v.y + g) / s);

            for (let a = t; a < n; a++) {
                for (let b = r; b < i; b++) {
                    const nx = a * s;
                    const ny = b * s;
                    const cX = Math.max(nx, Math.min(v.x, nx + s));
                    const cY = Math.max(ny, Math.min(v.y, ny + s));
                    const l = v.x - cX;
                    const c = v.y - cY;
                    if (l * l + c * c < f) {
                        const key = `${a},${b}`;
                        const existing = m.get(key);
                        if (existing) {
                            existing.p = Math.max(existing.p, press);
                        } else {
                            m.set(key, { x: a, y: b, p: press });
                        }
                    }
                }
            }
        }

        this.context.fillStyle = this.color;
        this.context.globalAlpha = this.opacity;
        // In a complete implementation we would convert the color hex to rgba with pressure if needed,
        // for now just fill standard rectangles to emulate the block rendering.
        m.forEach(e => {
            const px = e.x * s;
            const py = e.y * s;
            if (this.config.pressureOn && d) {
                 this.context!.globalAlpha = this.opacity * e.p;
            }
            this.context!.fillRect(px, py, s, s);
        });
        this.context.globalAlpha = 1;
    }

        private renderDashed() {
        if (!this.context || !this.lastP) return;
        const currentP = this.points[this.points.length - 1];

        const dashSize = this.config.dashSize || 3;
        const gapSize = this.config.gapSize || 5;

        this.context.lineWidth = this.size * (this.config.pressureOn ? currentP.p : 1);
        this.context.lineCap = 'round';
        this.context.lineJoin = 'round';
        this.context.strokeStyle = this.color;
        this.context.globalAlpha = this.opacity;
        this.context.setLineDash([dashSize * this.size, gapSize * this.size]);

        this.context.beginPath();
        this.context.moveTo(this.lastP.x, this.lastP.y);
        this.context.lineTo(currentP.x, currentP.y);
        this.context.stroke();
        this.context.setLineDash([]);
    }

    private renderSpray() {
        if (!this.context || !this.lastP) return;
        const currentP = this.points[this.points.length - 1];

        const softness = this.config.softness || 0.3;
        const density = this.size * 2;
        const radius = this.size * (this.config.pressureOn ? currentP.p : 1);

        this.context.fillStyle = this.color;
        this.context.globalAlpha = this.opacity * softness;

        for (let i = 0; i < density; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * radius;
            const px = currentP.x + Math.cos(angle) * dist;
            const py = currentP.y + Math.sin(angle) * dist;
            this.context.beginPath();
            this.context.arc(px, py, 1, 0, Math.PI * 2);
            this.context.fill();
        }
    }

    private renderWatercolor() {
        if (!this.context || !this.lastP) return;
        const currentP = this.points[this.points.length - 1];

        const r = this.size * (this.config.pressureOn ? currentP.p : 1);

        this.context.globalAlpha = this.opacity * 0.7; // watercolor base opacity
        this.context.fillStyle = this.color;
        this.context.beginPath();
        this.context.arc(currentP.x, currentP.y, r, 0, Math.PI * 2);
        this.context.fill();

        // draw texture if available
        if (this.textureImg && this.config.textureOn) {
            this.context.globalCompositeOperation = 'multiply';
            this.context.globalAlpha = 0.5;
            this.context.drawImage(this.textureImg, currentP.x - r, currentP.y - r, r * 2, r * 2);
            this.context.globalCompositeOperation = 'source-over';
        }

        if (this.config.outline) {
            this.context.lineWidth = this.config.outlineSize || 2;
            this.context.strokeStyle = this.color;
            this.context.globalAlpha = this.config.outlineOpacity || 0.7;
            this.context.stroke();
        }
    }

    private renderComplexTexturedStroke(x: number, y: number, p: number) {
        if (!this.context || !this.lastP) return;

        let currentSize = this.size;
        if (this.config.pressureOn && this.config.pressureAvailable) {
            currentSize *= p;
        }

        this.context.lineWidth = currentSize;
        this.context.lineCap = 'round';
        this.context.lineJoin = 'round';
        this.context.strokeStyle = this.color;
        this.context.globalAlpha = this.opacity;

        // Apply neon glow
        if (this.config.name === 'neon') {
            this.context.shadowBlur = this.config.neonSize || 25;
            this.context.shadowColor = this.color;
        } else {
            this.context.shadowBlur = 0;
            if (this.config.shadowStrength) {
                this.context.shadowBlur = this.config.shadowStrength * 10;
                this.context.shadowColor = this.config.shadowColor || 'black';
            }
        }

        // Texture overlay (pencil, oil, texture)
        if (this.textureImg && this.config.textureOn) {
            const pat = this.context.createPattern(this.textureImg, 'repeat');
            if (pat) this.context.strokeStyle = pat;
        }

        // Wobble logic for bristle, wet, flat
        let targetX = x;
        let targetY = y;
        if (this.config.wobble) {
            targetX += (Math.random() - 0.5) * this.config.wobble * this.size;
            targetY += (Math.random() - 0.5) * this.config.wobble * this.size;
        }

        this.context.beginPath();
        this.context.moveTo(this.lastP.x, this.lastP.y);
        this.context.lineTo(targetX, targetY);
        this.context.stroke();

        this.context.shadowBlur = 0; // reset
    }


    private renderSmudge() {
        if (!this.context) return;
        // implementation for smudge/blender
    }

    private renderFiller() {
        if (!this.context) return;
        // implementation for filler
    }
}
