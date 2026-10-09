import { TProcreateProfile } from './brush-profile';

/** Canvas implementation of documented brush concepts. Numerical response is approximate. */
export class ProcreateStamp {
    // Reused across dabs: resizing a canvas reallocates it, which is far too slow per dab.
    private readonly stamp = document.createElement('canvas');
    private readonly stampCtx: CanvasRenderingContext2D;
    private readonly grainMask: HTMLCanvasElement | undefined;
    private readonly grainPattern: CanvasPattern | undefined;
    private startAngle = 0;
    private lastX = 0;
    private lastY = 0;
    private travel = 0;
    private readonly tiles = new Map<string, {
        original: HTMLCanvasElement; coverage: HTMLCanvasElement; pixels: ImageData;
    }>();
    /** Tile regions changed since the last flush, so the layer is written once per draw call. */
    private readonly dirty = new Map<string, { x1: number; y1: number; x2: number; y2: number }>();

    constructor(
        private readonly shape: HTMLCanvasElement,
        grain: HTMLCanvasElement | undefined,
        readonly profile: TProcreateProfile,
        private readonly random: () => number = Math.random,
    ) {
        if (grain) {
            this.grainMask = document.createElement('canvas');
            this.grainMask.width = grain.width;
            this.grainMask.height = grain.height;
            const ctx = this.grainMask.getContext('2d')!;
            ctx.drawImage(grain, 0, 0);
            const pixels = ctx.getImageData(0, 0, grain.width, grain.height);
            const contrast = 2 ** (profile.grainContrast * 2);
            for (let i = 3; i < pixels.data.length; i += 4) {
                const level = Math.max(0, Math.min(1,
                    (pixels.data[i] / 255 - 0.5) * contrast + 0.5 + profile.grainBrightness));
                pixels.data[i] = 255 * (1 - profile.grainDepth * (1 - level));
            }
            ctx.putImageData(pixels, 0, 0);
        }
        // Max transfer reads the dab back every time; keep it on the CPU to avoid GPU sync stalls.
        this.stampCtx = this.stamp.getContext('2d',
            { willReadFrequently: profile.maxTransfer })!;
        if (this.grainMask) {
            this.grainPattern = this.stampCtx.createPattern(this.grainMask, 'repeat')!;
        }
    }

    start(x: number, y: number): void {
        this.lastX = x;
        this.lastY = y;
        this.travel = 0;
        this.tiles.clear();
        this.startAngle = this.profile.randomStart ? this.random() * Math.PI * 2 : 0;
    }

    /** Maximum per-stroke coverage. Tiles avoid cloning a potentially very large layer. */
    private transfer(ctx: CanvasRenderingContext2D, left: number, top: number, side: number,
        alpha: number): void {
        const tileSize = 128;
        const x0 = Math.floor(left);
        const y0 = Math.floor(top);
        const right = Math.min(ctx.canvas.width, x0 + side);
        const bottom = Math.min(ctx.canvas.height, y0 + side);
        const dab = this.stampCtx.getImageData(0, 0, side, side);
        for (let ty = Math.max(0, Math.floor(y0 / tileSize) * tileSize); ty < bottom; ty += tileSize) {
            for (let tx = Math.max(0, Math.floor(x0 / tileSize) * tileSize); tx < right; tx += tileSize) {
                const key = `${tx},${ty}`;
                let tile = this.tiles.get(key);
                if (!tile) {
                    const original = document.createElement('canvas');
                    const coverage = document.createElement('canvas');
                    original.width = coverage.width = Math.min(tileSize, ctx.canvas.width - tx);
                    original.height = coverage.height = Math.min(tileSize, ctx.canvas.height - ty);
                    original.getContext('2d')!.drawImage(ctx.canvas, tx, ty, original.width,
                        original.height, 0, 0, original.width, original.height);
                    tile = { original, coverage, pixels: coverage.getContext('2d')!
                        .createImageData(coverage.width, coverage.height) };
                    this.tiles.set(key, tile);
                }
                const sx = Math.max(x0, tx);
                const sy = Math.max(y0, ty);
                const ex = Math.min(right, tx + tileSize);
                const ey = Math.min(bottom, ty + tileSize);
                const from = dab.data;
                const to = tile.pixels.data;
                const tileWidth = tile.coverage.width;
                for (let y = sy; y < ey; y++) {
                    for (let x = sx; x < ex; x++) {
                        const src = ((y - y0) * side + x - x0) * 4;
                        const dst = ((y - ty) * tileWidth + x - tx) * 4;
                        const opacity = Math.round(from[src + 3] * alpha);
                        if (opacity <= to[dst + 3]) continue;
                        to[dst] = from[src];
                        to[dst + 1] = from[src + 1];
                        to[dst + 2] = from[src + 2];
                        to[dst + 3] = opacity;
                    }
                }
                const region = this.dirty.get(key);
                this.dirty.set(key, region ? {
                    x1: Math.min(region.x1, sx), y1: Math.min(region.y1, sy),
                    x2: Math.max(region.x2, ex), y2: Math.max(region.y2, ey),
                } : { x1: sx, y1: sy, x2: ex, y2: ey });
            }
        }
    }

    private flush(ctx: CanvasRenderingContext2D, lockAlpha: boolean): void {
        this.dirty.forEach(({ x1, y1, x2, y2 }, key) => {
            const tile = this.tiles.get(key)!;
            const [tx, ty] = key.split(',').map(Number);
            const w = x2 - x1;
            const h = y2 - y1;
            tile.coverage.getContext('2d')!.putImageData(tile.pixels, 0, 0, x1 - tx, y1 - ty, w, h);
            // drawImage/clearRect respect the selection clip; putImageData on the layer would not.
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.clearRect(x1, y1, w, h);
            ctx.drawImage(tile.original, x1 - tx, y1 - ty, w, h, x1, y1, w, h);
            ctx.globalCompositeOperation = lockAlpha ? 'source-atop' : 'source-over';
            ctx.drawImage(tile.coverage, x1 - tx, y1 - ty, w, h, x1, y1, w, h);
            ctx.restore();
        });
        this.dirty.clear();
    }

    end(): void {
        this.tiles.clear();
        this.dirty.clear();
    }

    draw(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number,
        opacity: number, color: string, angle = 0, lockAlpha = false) {
        const p = this.profile;
        this.travel += Math.hypot(x - this.lastX, y - this.lastY);
        this.lastX = x;
        this.lastY = y;
        const count = Math.max(1, Math.round(p.count * (1 - p.countJitter * this.random())));
        const bounds = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
        for (let i = 0; i < count; i++) {
            const size = Math.max(0.1, radius * (1 - p.sizeJitter * this.random()));
            const jitterAngle = this.random() * Math.PI * 2;
            const offset = Math.sqrt(this.random()) * radius * 2 * p.jitter;
            const cx = x + Math.cos(jitterAngle) * offset;
            const cy = y + Math.sin(jitterAngle) * offset;
            const rotation = p.angle + this.startAngle + angle * Math.PI / 180 * p.rotation +
                (this.random() * 2 - 1) * Math.PI * p.scatter;
            const side = Math.max(2, Math.ceil(size * 2 * Math.SQRT2) + 2);
            if (this.stamp.width < side) {
                this.stamp.width = this.stamp.height = Math.max(side, this.stamp.width * 2);
            }
            const stampCtx = this.stampCtx;
            stampCtx.globalCompositeOperation = 'source-over';
            stampCtx.clearRect(0, 0, side, side);
            stampCtx.save();
            stampCtx.translate(side / 2, side / 2);
            stampCtx.rotate(rotation);
            const flipX = p.flipX !== (p.flipXJitter && this.random() < 0.5);
            const flipY = p.flipY !== (p.flipYJitter && this.random() < 0.5);
            stampCtx.scale(flipX ? -1 : 1, (flipY ? -1 : 1) * p.roundness);
            stampCtx.drawImage(this.shape, -size, -size, size * 2, size * 2);
            stampCtx.restore();
            stampCtx.globalCompositeOperation = 'source-in';
            stampCtx.fillStyle = color;
            stampCtx.fillRect(0, 0, side, side);
            if (this.grainMask && this.grainPattern) {
                const pattern = this.grainPattern;
                // Movement=1 anchors the grain in canvas space; 0 drags it with the tip.
                const grainSize = p.grainScale * (radius * 2 * (1 - p.grainZoom) + 256 * p.grainZoom);
                const scale = grainSize / this.grainMask.width;
                pattern.setTransform(new DOMMatrix()
                    .translate(side / 2 - cx * p.grainMovement,
                        side / 2 - cy * p.grainMovement)
                    .rotate(angle * p.grainRotation).scale(scale));
                stampCtx.globalCompositeOperation = 'destination-in';
                stampCtx.imageSmoothingEnabled = p.grainFilter;
                stampCtx.fillStyle = pattern;
                stampCtx.fillRect(0, 0, side, side);
                stampCtx.imageSmoothingEnabled = true;
            }
            const alpha = opacity * p.flow * (1 - p.opacityJitter * this.random()) *
                Math.exp(-p.falloff * this.travel / Math.max(1, radius * 2));
            if (alpha <= 0) continue;
            if (p.maxTransfer) {
                this.transfer(ctx, cx - side / 2, cy - side / 2, side,
                    Math.max(0, Math.min(1, alpha)));
            } else {
                ctx.save();
                ctx.globalCompositeOperation = lockAlpha ? 'source-atop' : 'source-over';
                ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                ctx.drawImage(this.stamp, 0, 0, side, side, cx - side / 2, cy - side / 2, side, side);
                ctx.restore();
            }
            bounds.x1 = Math.min(bounds.x1, Math.floor(cx - side / 2));
            bounds.y1 = Math.min(bounds.y1, Math.floor(cy - side / 2));
            bounds.x2 = Math.max(bounds.x2, Math.ceil(cx + side / 2));
            bounds.y2 = Math.max(bounds.y2, Math.ceil(cy + side / 2));
        }
        if (this.dirty.size) this.flush(ctx, lockAlpha);
        return Number.isFinite(bounds.x1) ? bounds : undefined;
    }
}
