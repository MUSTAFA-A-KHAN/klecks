import { TProcreateProfile } from './brush-profile';

/** Canvas implementation of documented brush concepts. Numerical response is approximate. */
export class ProcreateStamp {
    private readonly stamp = document.createElement('canvas');
    private readonly grainMask: HTMLCanvasElement | undefined;
    private startAngle = 0;
    private startX = 0;
    private startY = 0;
    private lastX = 0;
    private lastY = 0;
    private travel = 0;

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
    }

    start(x: number, y: number): void {
        this.startX = this.lastX = x;
        this.startY = this.lastY = y;
        this.travel = 0;
        this.startAngle = this.profile.randomStart ? this.random() * Math.PI * 2 : 0;
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
            const rotation = this.startAngle + angle * Math.PI / 180 * p.rotation +
                (this.random() * 2 - 1) * Math.PI * p.scatter;
            const side = Math.max(2, Math.ceil(size * 2 * Math.SQRT2) + 2);
            this.stamp.width = this.stamp.height = side;
            const stampCtx = this.stamp.getContext('2d')!;
            stampCtx.save();
            stampCtx.translate(side / 2, side / 2);
            stampCtx.rotate(rotation);
            stampCtx.scale(p.flipX ? -1 : 1, p.flipY ? -1 : 1);
            stampCtx.drawImage(this.shape, -size, -size, size * 2, size * 2);
            stampCtx.restore();
            stampCtx.globalCompositeOperation = 'source-in';
            stampCtx.fillStyle = color;
            stampCtx.fillRect(0, 0, side, side);
            if (this.grainMask) {
                const pattern = stampCtx.createPattern(this.grainMask, 'repeat')!;
                // Movement=1 anchors the grain in canvas space; 0 drags it with the tip.
                const grainSize = p.grainScale * (radius * 2 * (1 - p.grainZoom) + 256 * p.grainZoom);
                const scale = grainSize / this.grainMask.width;
                pattern.setTransform(new DOMMatrix()
                    .translate(side / 2 - (cx - this.startX) * p.grainMovement,
                        side / 2 - (cy - this.startY) * p.grainMovement)
                    .rotate(angle * p.grainRotation).scale(scale));
                stampCtx.globalCompositeOperation = 'destination-in';
                stampCtx.imageSmoothingEnabled = p.grainFilter;
                stampCtx.fillStyle = pattern;
                stampCtx.fillRect(0, 0, side, side);
            }
            const alpha = opacity * p.flow * (1 - p.opacityJitter * this.random()) *
                Math.exp(-p.falloff * this.travel / Math.max(1, radius * 2));
            if (alpha <= 0) continue;
            ctx.save();
            ctx.globalCompositeOperation = lockAlpha ? 'source-atop' : 'source-over';
            ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
            ctx.drawImage(this.stamp, cx - side / 2, cy - side / 2);
            ctx.restore();
            bounds.x1 = Math.min(bounds.x1, Math.floor(cx - side / 2));
            bounds.y1 = Math.min(bounds.y1, Math.floor(cy - side / 2));
            bounds.x2 = Math.max(bounds.x2, Math.ceil(cx + side / 2));
            bounds.y2 = Math.max(bounds.y2, Math.ceil(cy + side / 2));
        }
        return Number.isFinite(bounds.x1) ? bounds : undefined;
    }
}
