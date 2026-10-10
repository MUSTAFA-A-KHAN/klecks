import { TProcreateProfile } from './brush-profile';
import { MaxTransferGl } from './max-transfer-gl';
import { IS_WEBKIT } from '../../../bb/base/browser';

/**
 * Dabs up to this size are batched for max transfer. Each readback has a fixed cost, but also
 * one that grows with the canvas size, so larger dabs are faster read back one at a time.
 */
const BATCH_MAX_SIDE = 128;
const TILE_SIZE = 128;

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
    /** Per-stroke layer snapshots. The CPU path also keeps its coverage per tile. */
    private readonly tiles = new Map<string, {
        tx: number; ty: number; original: HTMLCanvasElement;
        coverage?: HTMLCanvasElement; pixels?: ImageData;
    }>();
    /** Snapshot canvases kept between strokes: creating canvases is slow, especially on iOS. */
    private readonly pool: HTMLCanvasElement[] = [];
    /** Max transfer on the GPU when available: nothing has to be read back per dab. */
    private readonly gpu: MaxTransferGl | undefined;
    /** Whether this stroke uses the GPU; decided on its first dab, once the layer size is known. */
    private gpuStroke: boolean | undefined;
    /**
     * Max transfer packs a batch of dabs side by side in the stamp canvas and reads them back with
     * a single getImageData in commit(): each readback has a high fixed cost, so one per dab stalls.
     */
    private readonly pending: { ax: number; ay: number; side: number;
        left: number; top: number; alpha: number }[] = [];
    private atlasX = 0;
    private atlasY = 0;
    private shelfHeight = 0;
    private atlasWidthUsed = 0;
    /** Tile regions changed since the last flush, so the layer is written once per commit. */
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
                // Stored inverted: destination-out only touches the filled area, unlike destination-in.
                pixels.data[i] = 255 * profile.grainDepth * (1 - level);
            }
            ctx.putImageData(pixels, 0, 0);
        }
        // Max transfer reads the dab back every time; keep it on the CPU to avoid GPU sync stalls.
        this.stampCtx = this.stamp.getContext('2d',
            { willReadFrequently: profile.maxTransfer })!;
        if (this.grainMask) {
            this.grainPattern = this.stampCtx.createPattern(this.grainMask, 'repeat')!;
        }
        // WebKit reads canvases back from the GPU on every getImageData, so the CPU path stalls there.
        // Chrome is the opposite: it keeps layers in CPU memory once they have been read, so drawing
        // a WebGL canvas into them is a GPU readback per commit, and the batched CPU path is faster.
        if (profile.maxTransfer && IS_WEBKIT) {
            this.gpu = MaxTransferGl.create(shape, this.grainMask, profile.grainFilter);
        }
    }

    start(x: number, y: number): void {
        this.lastX = x;
        this.lastY = y;
        this.travel = 0;
        this.releaseTiles();
        this.gpuStroke = undefined;
        this.startAngle = this.profile.randomStart ? this.random() * Math.PI * 2 : 0;
    }

    /** Maximum per-stroke coverage. Tiles avoid cloning a potentially very large layer. */
    private transfer(ctx: CanvasRenderingContext2D, left: number, top: number, side: number,
        alpha: number, atlas: ImageData, ax: number, ay: number): void {
        const tileSize = TILE_SIZE;
        const x0 = Math.floor(left);
        const y0 = Math.floor(top);
        const right = Math.min(ctx.canvas.width, x0 + side);
        const bottom = Math.min(ctx.canvas.height, y0 + side);
        for (let ty = Math.max(0, Math.floor(y0 / tileSize) * tileSize); ty < bottom; ty += tileSize) {
            for (let tx = Math.max(0, Math.floor(x0 / tileSize) * tileSize); tx < right; tx += tileSize) {
                const key = `${tx},${ty}`;
                const tile = this.tile(ctx, tx, ty);
                if (!tile.coverage) {
                    tile.coverage = document.createElement('canvas');
                    tile.coverage.width = tile.original.width;
                    tile.coverage.height = tile.original.height;
                    tile.pixels = tile.coverage.getContext('2d')!
                        .createImageData(tile.coverage.width, tile.coverage.height);
                }
                const sx = Math.max(x0, tx);
                const sy = Math.max(y0, ty);
                const ex = Math.min(right, tx + tileSize);
                const ey = Math.min(bottom, ty + tileSize);
                const from = atlas.data;
                const to = tile.pixels!.data;
                const tileWidth = tile.coverage.width;
                for (let y = sy; y < ey; y++) {
                    for (let x = sx; x < ex; x++) {
                        const src = ((ay + y - y0) * atlas.width + ax + x - x0) * 4;
                        const dst = ((y - ty) * tileWidth + x - tx) * 4;
                        const opacity = Math.round(from[src + 3] * alpha);
                        if (opacity <= to[dst + 3]) continue;
                        to[dst] = from[src];
                        to[dst + 1] = from[src + 1];
                        to[dst + 2] = from[src + 2];
                        to[dst + 3] = opacity;
                    }
                }
                this.markDirty(key, sx, sy, ex, ey);
            }
        }
    }

    /** The layer's content in this tile from before the stroke. */
    private tile(ctx: CanvasRenderingContext2D, tx: number, ty: number) {
        const key = `${tx},${ty}`;
        let tile = this.tiles.get(key);
        if (!tile) {
            const original = this.pool.pop() || document.createElement('canvas');
            const width = Math.min(TILE_SIZE, ctx.canvas.width - tx);
            const height = Math.min(TILE_SIZE, ctx.canvas.height - ty);
            if (original.width !== width || original.height !== height) {
                original.width = width;
                original.height = height;
            }
            const originalCtx = original.getContext('2d')!;
            originalCtx.globalCompositeOperation = 'copy';
            originalCtx.drawImage(ctx.canvas, tx, ty, width, height, 0, 0, width, height);
            tile = { tx, ty, original };
            this.tiles.set(key, tile);
        }
        return tile;
    }

    private releaseTiles(): void {
        this.tiles.forEach((tile) => {
            if (this.pool.length < 256) this.pool.push(tile.original);
        });
        this.tiles.clear();
    }

    private markDirty(key: string, sx: number, sy: number, ex: number, ey: number): void {
        const region = this.dirty.get(key);
        this.dirty.set(key, region ? {
            x1: Math.min(region.x1, sx), y1: Math.min(region.y1, sy),
            x2: Math.max(region.x2, ex), y2: Math.max(region.y2, ey),
        } : { x1: sx, y1: sy, x2: ex, y2: ey });
    }

    /** GPU path: snapshot the tiles a dab covers before commit() redraws them. */
    private gpuTiles(ctx: CanvasRenderingContext2D, left: number, top: number, side: number): void {
        const x0 = Math.max(0, Math.floor(left));
        const y0 = Math.max(0, Math.floor(top));
        const right = Math.min(ctx.canvas.width, Math.ceil(left + side));
        const bottom = Math.min(ctx.canvas.height, Math.ceil(top + side));
        for (let ty = Math.floor(y0 / TILE_SIZE) * TILE_SIZE; ty < bottom; ty += TILE_SIZE) {
            for (let tx = Math.floor(x0 / TILE_SIZE) * TILE_SIZE; tx < right; tx += TILE_SIZE) {
                this.tile(ctx, tx, ty);
                this.markDirty(`${tx},${ty}`, Math.max(x0, tx), Math.max(y0, ty),
                    Math.min(right, tx + TILE_SIZE), Math.min(bottom, ty + TILE_SIZE));
            }
        }
    }

    /**
     * GPU flush: one drawImage of the coverage buffer over the dirty area, since browsers may copy
     * the whole WebGL canvas per drawImage. Every snapshotted tile in that area is restored first;
     * elsewhere the buffer is still empty, so drawing it there changes nothing.
     */
    private flushGpu(ctx: CanvasRenderingContext2D, lockAlpha: boolean): void {
        let x1 = Infinity;
        let y1 = Infinity;
        let x2 = -Infinity;
        let y2 = -Infinity;
        this.dirty.forEach((region) => {
            x1 = Math.min(x1, region.x1);
            y1 = Math.min(y1, region.y1);
            x2 = Math.max(x2, region.x2);
            y2 = Math.max(y2, region.y2);
        });
        this.dirty.clear();
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        this.tiles.forEach(({ tx, ty, original }) => {
            const sx = Math.max(x1, tx);
            const sy = Math.max(y1, ty);
            const w = Math.min(x2, tx + original.width) - sx;
            const h = Math.min(y2, ty + original.height) - sy;
            if (w <= 0 || h <= 0) return;
            ctx.clearRect(sx, sy, w, h);
            ctx.drawImage(original, sx - tx, sy - ty, w, h, sx, sy, w, h);
        });
        ctx.globalCompositeOperation = lockAlpha ? 'source-atop' : 'source-over';
        ctx.drawImage(this.gpu!.canvas, x1, y1, x2 - x1, y2 - y1, x1, y1, x2 - x1, y2 - y1);
        ctx.restore();
    }

    private flush(ctx: CanvasRenderingContext2D, lockAlpha: boolean): void {
        if (this.gpuStroke) {
            this.flushGpu(ctx, lockAlpha);
            return;
        }
        this.dirty.forEach(({ x1, y1, x2, y2 }, key) => {
            const tile = this.tiles.get(key)!;
            const [tx, ty] = key.split(',').map(Number);
            const w = x2 - x1;
            const h = y2 - y1;
            tile.coverage!.getContext('2d')!.putImageData(tile.pixels!, 0, 0, x1 - tx, y1 - ty, w, h);
            // drawImage/clearRect respect the selection clip; putImageData on the layer would not.
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.clearRect(x1, y1, w, h);
            ctx.drawImage(tile.original, x1 - tx, y1 - ty, w, h, x1, y1, w, h);
            ctx.globalCompositeOperation = lockAlpha ? 'source-atop' : 'source-over';
            ctx.drawImage(tile.coverage!, x1 - tx, y1 - ty, w, h, x1, y1, w, h);
            ctx.restore();
        });
        this.dirty.clear();
    }

    /** Reserve a side×side region of the stamp canvas for the next dab in the batch. */
    private allocate(ctx: CanvasRenderingContext2D, side: number, lockAlpha: boolean): [number, number] {
        if (this.atlasX + side > this.stamp.width) {
            this.atlasX = 0;
            this.atlasY += this.shelfHeight;
            this.shelfHeight = 0;
        }
        if (this.atlasY + side > this.stamp.height) this.commit(ctx, lockAlpha);
        if (!this.pending.length && this.atlasY === 0 && this.atlasX === 0) {
            // Size the canvas to the batch: Chrome's readback cost grows with the whole canvas.
            // Resizing clears it, which is safe only while the batch is empty.
            if (side > BATCH_MAX_SIDE) {
                if (this.stamp.width < side || this.stamp.width > side * 2) {
                    this.stamp.width = this.stamp.height = side;
                }
            } else {
                const dim = 2 ** Math.ceil(Math.log2(side * 4));
                if (this.stamp.width !== dim) this.stamp.width = this.stamp.height = dim;
            }
        }
        const slot: [number, number] = [this.atlasX, this.atlasY];
        this.atlasX += side;
        this.shelfHeight = Math.max(this.shelfHeight, side);
        this.atlasWidthUsed = Math.max(this.atlasWidthUsed, this.atlasX);
        return slot;
    }

    /** Apply batched max-transfer dabs to the layer. Call within the same clip as draw(). */
    commit(ctx: CanvasRenderingContext2D, lockAlpha: boolean): void {
        if (this.pending.length) {
            const atlas = this.stampCtx.getImageData(0, 0, this.atlasWidthUsed,
                this.atlasY + this.shelfHeight);
            for (const dab of this.pending) {
                this.transfer(ctx, dab.left, dab.top, dab.side, dab.alpha, atlas, dab.ax, dab.ay);
            }
            this.pending.length = 0;
        }
        this.atlasX = this.atlasY = this.shelfHeight = this.atlasWidthUsed = 0;
        if (this.dirty.size) this.flush(ctx, lockAlpha);
    }

    end(): void {
        this.releaseTiles();
        this.gpuStroke = undefined;
        this.dirty.clear();
        this.pending.length = 0;
        this.atlasX = this.atlasY = this.shelfHeight = this.atlasWidthUsed = 0;
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
            if (p.maxTransfer && this.gpu && (this.gpuStroke ??=
                this.gpu.begin(ctx.canvas.width, ctx.canvas.height, color))) {
                const flipX = p.flipX !== (p.flipXJitter && this.random() < 0.5);
                const flipY = p.flipY !== (p.flipYJitter && this.random() < 0.5);
                const alpha = opacity * p.flow * (1 - p.opacityJitter * this.random()) *
                    Math.exp(-p.falloff * this.travel / Math.max(1, radius * 2));
                if (alpha <= 0) continue;
                const grainSize = p.grainScale * (radius * 2 * (1 - p.grainZoom) + 256 * p.grainZoom);
                // Snap like the canvas path, which places each stamp at a whole pixel: every dab then
                // samples the tip identically, instead of thin lines aliasing differently per dab.
                const sx = Math.floor(cx - side / 2) + side / 2;
                const sy = Math.floor(cy - side / 2) + side / 2;
                this.gpu.dab({
                    x: sx, y: sy, size, side, rotation,
                    scaleX: flipX ? -1 : 1, scaleY: (flipY ? -1 : 1) * p.roundness,
                    alpha: Math.min(1, alpha),
                    grain: this.grainMask && {
                        originX: sx - cx * p.grainMovement, originY: sy - cy * p.grainMovement,
                        angle: angle * p.grainRotation * Math.PI / 180,
                        scale: grainSize / this.grainMask.width,
                    },
                });
                this.gpuTiles(ctx, sx - side / 2, sy - side / 2, side);
                bounds.x1 = Math.min(bounds.x1, Math.floor(cx - side / 2));
                bounds.y1 = Math.min(bounds.y1, Math.floor(cy - side / 2));
                bounds.x2 = Math.max(bounds.x2, Math.ceil(cx + side / 2));
                bounds.y2 = Math.max(bounds.y2, Math.ceil(cy + side / 2));
                continue;
            }
            let ox = 0;
            let oy = 0;
            if (p.maxTransfer) {
                [ox, oy] = this.allocate(ctx, side, lockAlpha);
            } else if (this.stamp.width < side) {
                this.stamp.width = this.stamp.height = Math.max(side, this.stamp.width * 2);
            }
            const stampCtx = this.stampCtx;
            stampCtx.save();
            // Only bounded operations below, so other dabs in the batch stay untouched.
            stampCtx.globalCompositeOperation = 'source-over';
            stampCtx.clearRect(ox, oy, side, side);
            stampCtx.save();
            stampCtx.translate(ox + side / 2, oy + side / 2);
            stampCtx.rotate(rotation);
            const flipX = p.flipX !== (p.flipXJitter && this.random() < 0.5);
            const flipY = p.flipY !== (p.flipYJitter && this.random() < 0.5);
            stampCtx.scale(flipX ? -1 : 1, (flipY ? -1 : 1) * p.roundness);
            stampCtx.drawImage(this.shape, -size, -size, size * 2, size * 2);
            stampCtx.restore();
            stampCtx.globalCompositeOperation = 'source-atop';
            stampCtx.fillStyle = color;
            stampCtx.fillRect(ox, oy, side, side);
            if (this.grainMask && this.grainPattern) {
                const pattern = this.grainPattern;
                // Movement=1 anchors the grain in canvas space; 0 drags it with the tip.
                const grainSize = p.grainScale * (radius * 2 * (1 - p.grainZoom) + 256 * p.grainZoom);
                const scale = grainSize / this.grainMask.width;
                pattern.setTransform(new DOMMatrix()
                    .translate(ox + side / 2 - cx * p.grainMovement,
                        oy + side / 2 - cy * p.grainMovement)
                    .rotate(angle * p.grainRotation).scale(scale));
                stampCtx.globalCompositeOperation = 'destination-out';
                stampCtx.imageSmoothingEnabled = p.grainFilter;
                stampCtx.fillStyle = pattern;
                stampCtx.fillRect(ox, oy, side, side);
            }
            stampCtx.restore();
            const alpha = opacity * p.flow * (1 - p.opacityJitter * this.random()) *
                Math.exp(-p.falloff * this.travel / Math.max(1, radius * 2));
            if (alpha <= 0) continue;
            if (p.maxTransfer) {
                this.pending.push({ ax: ox, ay: oy, side, left: cx - side / 2, top: cy - side / 2,
                    alpha: Math.max(0, Math.min(1, alpha)) });
                if (side > BATCH_MAX_SIDE) this.commit(ctx, lockAlpha);
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
        return Number.isFinite(bounds.x1) ? bounds : undefined;
    }
}
