import { ProcreateBrushModel } from '../model/procreate-brush-model';
import { BB } from '../../../bb/bb';
import { KlHistory } from '../../history/kl-history';
import { getSelectionPath2d } from '../../../bb/multi-polygon/get-selection-path-2d';
import { getMultiPolyBounds } from '../../../bb/multi-polygon/get-multi-polygon-bounds';
import { canvasAndChangedTilesToLayerTiles } from '../../history/push-helpers/canvas-to-layer-tiles';
import { getPushableLayerChange } from '../../history/push-helpers/get-pushable-layer-change';
import { integerBounds } from '../../../bb/math/math';

export class ProcreateBrush {
    private context!: CanvasRenderingContext2D;
    private klHistory!: KlHistory;

    private model: ProcreateBrushModel;
    private shapeImage?: HTMLImageElement | HTMLCanvasElement;
    private grainImage?: HTMLImageElement | HTMLCanvasElement;

    private isDrawing: boolean = false;
    private selectionPath: Path2D | undefined;
    private changedTiles: boolean[] = [];

    // Tracking the last coordinate for spacing
    private lastX: number = 0;
    private lastY: number = 0;
    private lastPressure: number = 0;
    private remainderDist: number = 0;

    constructor(model: ProcreateBrushModel, shapeImage?: HTMLImageElement | HTMLCanvasElement, grainImage?: HTMLImageElement | HTMLCanvasElement) {
        this.model = model;
        this.shapeImage = shapeImage;
        this.grainImage = grainImage;
    }

    setContext(c: CanvasRenderingContext2D): void {
        this.context = c;
    }

    setHistory(klHistory: KlHistory): void {
        this.klHistory = klHistory;
    }

    getSize(): number {
        return this.model.size;
    }

    setSize(s: number): void {
        this.model.size = s;
    }

    getOpacity(): number {
        return this.model.opacity;
    }

    setOpacity(o: number): void {
        this.model.opacity = o;
    }

    getScatter(): number {
        return this.model.scatter;
    }

    setScatter(s: number): void {
        this.model.scatter = s;
    }

    startLine(x: number, y: number, p: number): void {
        this.isDrawing = true;
        const selection = this.klHistory.getComposed().selection.value;
        this.selectionPath = selection ? getSelectionPath2d(selection) : undefined;
        this.changedTiles = [];

        this.lastX = x;
        this.lastY = y;
        this.lastPressure = p;
        this.remainderDist = 0;

        this.context.save();
        if (this.selectionPath) {
            this.context.clip(this.selectionPath);
        }

        // Draw initial dot
        this.drawStamp(x, y, p, 0);

        this.context.restore();
    }

    goLine(x: number, y: number, p: number): void {
        if (!this.isDrawing) return;

        this.context.save();
        if (this.selectionPath) {
            this.context.clip(this.selectionPath);
        }

        const dist = Math.sqrt(Math.pow(x - this.lastX, 2) + Math.pow(y - this.lastY, 2));
        const angle = Math.atan2(y - this.lastY, x - this.lastX);

        // Normalize spacing
        const spacingSize = Math.max(1, this.model.size * Math.max(0.01, this.model.spacing));

        let currentDist = this.remainderDist;
        while (currentDist + spacingSize <= dist) {
            currentDist += spacingSize;
            const t = currentDist / dist;

            const stampX = this.lastX + (x - this.lastX) * t;
            const stampY = this.lastY + (y - this.lastY) * t;
            const stampP = this.lastPressure + (p - this.lastPressure) * t;

            this.drawStamp(stampX, stampY, stampP, angle);
        }

        this.remainderDist = dist - currentDist;

        this.context.restore();

        this.lastX = x;
        this.lastY = y;
        this.lastPressure = p;
    }

    endLine(): void {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        // Commit history changes if any tiles were touched
        if (this.changedTiles.some(item => item)) {
            this.klHistory.push(
                getPushableLayerChange(
                    this.klHistory.getComposed(),
                    canvasAndChangedTilesToLayerTiles(this.context.canvas, this.changedTiles)
                )
            );
        }
    }

    getIsDrawing(): boolean {
        return this.isDrawing;
    }

    private drawStamp(x: number, y: number, pressure: number, angle: number): void {
        // Dynamics
        const sizeFactor = this.model.pressureSize === 0 ? 1 :
            (1 - this.model.pressureSize) + (this.model.pressureSize * pressure);

        const opacityFactor = this.model.pressureOpacity === 0 ? 1 :
            (1 - this.model.pressureOpacity) + (this.model.pressureOpacity * pressure);

        const currentSize = Math.max(1, this.model.size * sizeFactor);
        const currentOpacity = BB.clamp(this.model.opacity * opacityFactor, 0, 1);

        // Jitter / Scatter
        let stampX = x;
        let stampY = y;

        if (this.model.jitter > 0) {
            const maxJitter = currentSize * this.model.jitter;
            stampX += (Math.random() * 2 - 1) * maxJitter;
            stampY += (Math.random() * 2 - 1) * maxJitter;
        }

        if (this.model.scatter > 0) {
            const maxScatter = currentSize * this.model.scatter;
            stampX += (Math.random() * 2 - 1) * maxScatter;
            stampY += (Math.random() * 2 - 1) * maxScatter;
        }

        this.context.save();
        this.context.translate(stampX, stampY);

        // Follow stroke or scatter rotation
        let stampAngle = angle;
        if (this.model.rotation > 0) {
            stampAngle += (Math.random() * 2 - 1) * this.model.rotation * Math.PI;
        }
        this.context.rotate(stampAngle);

        this.context.globalAlpha = currentOpacity;

        if (this.shapeImage) {
            // Draw shape texture centered
            this.context.drawImage(
                this.shapeImage,
                -currentSize / 2,
                -currentSize / 2,
                currentSize,
                currentSize
            );
        } else {
            // Fallback circular stamp
            this.context.beginPath();
            this.context.arc(0, 0, currentSize / 2, 0, Math.PI * 2);
            this.context.fill();
        }

        this.context.restore();

        const radius = currentSize / 2;
        this.markTiles(stampX - radius, stampY - radius, stampX + radius, stampY + radius);
    }

    private markTiles(x1: number, y1: number, x2: number, y2: number): void {
        const tw = 256;
        const th = 256;

        const startCol = Math.max(0, Math.floor(x1 / tw));
        const startRow = Math.max(0, Math.floor(y1 / th));
        const endCol = Math.min(Math.ceil(this.context.canvas.width / tw) - 1, Math.floor(x2 / tw));
        const endRow = Math.min(Math.ceil(this.context.canvas.height / th) - 1, Math.floor(y2 / th));

        const cols = Math.ceil(this.context.canvas.width / tw);

        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                this.changedTiles[r * cols + c] = true;
            }
        }
    }
}
