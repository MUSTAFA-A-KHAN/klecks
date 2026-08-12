import { ShapeRecognizer } from '../canvas/ShapeRecognizer';
import { TBrush } from '../kl-types';
import { BB } from '../../bb/bb';
import { TextureManager } from '../textures/TextureManager';

// A dynamic brush that adapts the 20+ configs (plain, pencil, watercolor, smudge, etc.)
export interface BrushConfig {
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
    pressureOn?: boolean;
    textureOn?: boolean;
    texture?: string;
    textureScale?: number;
    outline?: boolean;
    outlineSize?: number;
    outlineOpacity?: number;
    outlineColor?: string;
    blurStrength?: number;
    flow?: number;
    blending?: number;
    softness?: number;
    intensity?: number;
    dragLength?: number;
    weight?: number;
    flatness?: number;
    ragged?: number;
    tailLength?: number;
    wetness?: number;
    bleeding?: number;
    spreading?: boolean;
    shadowStrength?: number;
    shadowColor?: string;
    neonSize?: number;
    sparkleDensity?: number;
    sparkleSize?: number;
    sparkleShape?: string;
    shape?: boolean;
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
        if (this.context) {
            this.context.beginPath();
            this.context.moveTo(x, y);
        }
    }

    goLine(x: number, y: number, p: number) {
        if (!this.isDrawing) return;
        this.points.push({x, y, p});
        if (this.context) {
            this.context.lineTo(x, y);

            // Apply brush effects here according to config
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

            this.context.stroke();
            this.context.beginPath();
            this.context.moveTo(x, y);
        }
    }

    endLine() {
        if (this.config.shape && this.points.length > 5) {
            const shape = ShapeRecognizer.recognizeShape(this.points);
            if (shape && shape.type !== 'polyline' && this.context) {
                // Clear the original stroke - this is a bit tricky if we already drew it to canvas directly
                // In a perfect system we'd redraw from history.
                // For now, if we detect a shape, we draw the shape points on top.
                this.context.beginPath();
                this.context.moveTo(shape.points[0].x, shape.points[0].y);
                for(let i=1; i<shape.points.length; i++) {
                    this.context.lineTo(shape.points[i].x, shape.points[i].y);
                }
                if (shape.type !== 'line') this.context.closePath();
                this.context.stroke();
            }
        }

        this.isDrawing = false;
        if (this.context) {
            this.context.filter = 'none';
            this.context.closePath();
        }
    }

    isDrawingActive(): boolean {
        return this.isDrawing;
    }
}
