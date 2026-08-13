import { ShapeRecognizer } from '../canvas/ShapeRecognizer';
import { TRgb } from '../kl-types';
import { TextureManager } from '../textures/TextureManager';

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
    opacityPressureOn?: boolean;
    scatterPressureOn?: boolean;
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
    pixelSize?: number;
    borderWidth?: number;
    borderColor?: string;
    outsideBorders?: boolean;
    showPixelGrid?: boolean;
    dashSize?: number;
    gapSize?: number;
    figure?: string;
    brush?: string;
    tolerance?: number;
    antialiasing?: number;
    eatEdges?: boolean;
    size?: number;
    sizeX?: number;
    sizeY?: number;
    composition?: string;

    [key: string]: any;
}

interface BrushPoint {
    x: number;
    y: number;
    p: number;
    time: number;
}

export class TelegramBrush {
    private context: CanvasRenderingContext2D | null = null;

    private config: BrushConfig;

    private size = 10;

    private color: TRgb = {
        r: 0,
        g: 0,
        b: 0
    };

    private opacity = 1;

    private scatter = 0;

    private isDrawing = false;

    /*
     * We don't depend on the project's KlHistory type.
     * Keep it as an unknown-compatible value in case
     * the surrounding application passes history.
     */
    private klHistory: unknown = null;

    private points: BrushPoint[] = [];

    private textureImg: HTMLImageElement | null = null;

    /*
     * Dash state persists between pointer events.
     */
    private dashDrawing = true;

    private dashDistance = 0;

    constructor(config: BrushConfig) {
        this.config = config;

        this.opacity =
            config.opacity ?? 1;

        if (config.size !== undefined) {
            this.size =
                Math.max(
                    0.1,
                    config.size
                );
        }

        if (
            config.textureOn &&
            config.texture
        ) {
            TextureManager
                .getTexture(config.texture)
                .then(img => {
                    this.textureImg = img;
                })
                .catch(() => {
                    this.textureImg = null;
                });
        }
    }

    /*
     * Kept for compatibility with code
     * that calls brush.setHistory(...).
     *
     * No KlHistory import is required.
     */
    setHistory(history: unknown): void {
        this.klHistory = history;
    }

    setContext(
        context: CanvasRenderingContext2D
    ): void {
        this.context = context;
    }

    setColor(
        color: TRgb | string
    ): void {
        if (
            typeof color ===
            'string'
        ) {
            const value =
                color.trim();

            /*
             * #RGB
             */
            const shortHex =
                value.match(
                    /^#?([a-f\d])([a-f\d])([a-f\d])$/i
                );

            if (shortHex) {
                this.color = {
                    r: parseInt(
                        shortHex[1] +
                            shortHex[1],
                        16
                    ),

                    g: parseInt(
                        shortHex[2] +
                            shortHex[2],
                        16
                    ),

                    b: parseInt(
                        shortHex[3] +
                            shortHex[3],
                        16
                    )
                };

                return;
            }

            /*
             * #RRGGBB
             */
            const hex =
                value.match(
                    /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i
                );

            if (hex) {
                this.color = {
                    r: parseInt(
                        hex[1],
                        16
                    ),

                    g: parseInt(
                        hex[2],
                        16
                    ),

                    b: parseInt(
                        hex[3],
                        16
                    )
                };
            }

            return;
        }

        this.color = {
            r: color.r,
            g: color.g,
            b: color.b
        };
    }

    setOpacity(
        opacity: number
    ): void {
        this.opacity =
            Math.max(
                0,
                Math.min(
                    1,
                    opacity
                )
            );
    }

    setSize(
        size: number
    ): void {
        this.size =
            Math.max(
                0.1,
                size
            );
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

    setScatter(
        scatter: number
    ): void {
        this.scatter =
            Math.max(
                0,
                scatter
            );
    }

    sizePressure(
        enabled: boolean
    ): void {
        this.config.pressureOn =
            enabled;
    }

    opacityPressure(
        enabled: boolean
    ): void {
        this.config.opacityPressureOn =
            enabled;
    }

    scatterPressure(
        enabled: boolean
    ): void {
        this.config.scatterPressureOn =
            enabled;
    }

    startLine(
        x: number,
        y: number,
        pressure: number
    ): void {
        if (!this.context) {
            return;
        }

        this.isDrawing = true;

        this.points = [];

        this.dashDrawing = true;

        this.dashDistance = 0;

        const point =
            this.createPoint(
                x,
                y,
                pressure
            );

        this.points.push(
            point
        );

        /*
         * Shape mode collects points
         * and renders only at endLine().
         */
        if (!this.config.shape) {
            this.renderInitialPoint(
                point
            );
        }
    }

    goLine(
        x: number,
        y: number,
        pressure: number
    ): void {
        if (
            !this.isDrawing ||
            !this.context
        ) {
            return;
        }

        const previous =
            this.points[
                this.points.length - 1
            ];

        const current =
            this.createPoint(
                x,
                y,
                pressure
            );

        if (!previous) {
            this.points.push(
                current
            );

            this.renderInitialPoint(
                current
            );

            return;
        }

        /*
         * Ignore duplicate events.
         */
        if (
            previous.x === current.x &&
            previous.y === current.y
        ) {
            return;
        }

        this.points.push(
            current
        );

        /*
         * Shape brush:
         * don't paint the raw stroke.
         */
        if (this.config.shape) {
            return;
        }

        const normalizedPressure =
            this.getPressure(
                current.p
            );

        const currentSize =
            this.getPressureSize(
                this.size,
                normalizedPressure
            );

        /*
         * Pixel brush.
         */
        if (
            this.config.pixelSize
        ) {
            this.drawPixelSegment(
                previous,
                current,
                currentSize
            );

            return;
        }

        /*
         * Dashed brush.
         */
        if (
            this.config.dashSize
        ) {
            this.drawDashedSegment(
                previous,
                current,
                currentSize
            );

            return;
        }

        /*
         * Normal brush.
         *
         * This interpolates between
         * pointer events so the stroke
         * doesn't appear as dots.
         */
        this.drawSmoothSegment(
            previous,
            current,
            currentSize
        );
    }

    endLine(): void {
        if (!this.isDrawing) {
            return;
        }

        if (
            this.config.shape &&
            this.points.length >= 5
        ) {
            this.drawRecognizedShape();
        }

        this.isDrawing = false;

        this.points = [];

        this.dashDrawing = true;

        this.dashDistance = 0;

        this.resetContextEffects();
    }

    isDrawingActive(): boolean {
        return this.isDrawing;
    }

    reset(): void {
        this.isDrawing = false;

        this.points = [];

        this.dashDrawing = true;

        this.dashDistance = 0;

        this.resetContextEffects();
    }

    /*
     * ---------------------------------------------------------
     * POINTS
     * ---------------------------------------------------------
     */

    private createPoint(
        x: number,
        y: number,
        pressure: number
    ): BrushPoint {
        return {
            x,
            y,
            p: pressure,

            time:
                typeof performance !==
                'undefined'
                    ? performance.now()
                    : Date.now()
        };
    }

    private getPressure(
        pressure: number
    ): number {
        if (
            !this.config.pressureOn ||
            !this.config.pressureAvailable
        ) {
            return 1;
        }

        if (
            !Number.isFinite(
                pressure
            )
        ) {
            return 1;
        }

        return Math.max(
            0.05,
            Math.min(
                1,
                pressure
            )
        );
    }

    private getPressureSize(
        size: number,
        pressure: number
    ): number {
        if (
            !this.config.pressureOn ||
            !this.config.pressureAvailable
        ) {
            return size;
        }

        return Math.max(
            0.1,
            size * pressure
        );
    }

    /*
     * ---------------------------------------------------------
     * COLORS
     * ---------------------------------------------------------
     */

    private getColorString(): string {
        return (
            `rgb(` +
            `${this.color.r}, ` +
            `${this.color.g}, ` +
            `${this.color.b}` +
            `)`
        );
    }

    /*
     * ---------------------------------------------------------
     * CANVAS CONTEXT
     * ---------------------------------------------------------
     */

    private prepareContext(
        pressure: number
    ): void {
        if (!this.context) {
            return;
        }

        const ctx =
            this.context;

        let alpha =
            this.opacity;

        /*
         * Pressure opacity.
         */
        if (
            this.config.opacityPressureOn
        ) {
            alpha *=
                this.getPressure(
                    pressure
                );
        }

        /*
         * Flow.
         */
        if (
            this.config.flow !==
            undefined
        ) {
            alpha *=
                Math.max(
                    0,
                    Math.min(
                        1,
                        this.config.flow
                    )
                );
        }

        ctx.globalAlpha =
            Math.max(
                0,
                Math.min(
                    1,
                    alpha
                )
            );

        ctx.strokeStyle =
            this.getColorString();

        ctx.fillStyle =
            this.getColorString();

        ctx.lineCap =
            'round';

        ctx.lineJoin =
            'round';

        /*
         * Canvas compositing.
         */
        if (
            this.config.composition
        ) {
            ctx.globalCompositeOperation =
                this.config.composition as GlobalCompositeOperation;
        }

        /*
         * Blur.
         */
        if (
            this.config.blurStrength
        ) {
            ctx.filter =
                `blur(${Math.max(
                    0,
                    this.config.blurStrength *
                        10
                )}px)`;
        }

        /*
         * Neon.
         */
        if (
            this.config.neonSize
        ) {
            ctx.shadowColor =
                this.getColorString();

            ctx.shadowBlur =
                Math.max(
                    0,
                    this.config.neonSize
                );
        }

        /*
         * Shadow.
         */
        if (
            this.config.shadowStrength
        ) {
            ctx.shadowBlur =
                Math.max(
                    ctx.shadowBlur,
                    this.config.shadowStrength
                );

            ctx.shadowColor =
                this.config.shadowColor ||
                this.getColorString();
        }
    }

    private resetContextEffects(): void {
        if (!this.context) {
            return;
        }

        this.context.filter =
            'none';

        this.context.shadowBlur =
            0;

        this.context.shadowColor =
            'transparent';

        this.context.globalAlpha =
            1;

        this.context.globalCompositeOperation =
            'source-over';
    }

    /*
     * ---------------------------------------------------------
     * NORMAL BRUSH
     * ---------------------------------------------------------
     *
     * The important part:
     *
     * Pointer events:
     *
     * A -------- B
     *
     * Instead of painting only A and B,
     * we generate:
     *
     * A . . . . . . B
     *
     * and place overlapping brush dabs.
     *
     * This removes the dotted appearance.
     */

    private drawSmoothSegment(
        previous: BrushPoint,
        current: BrushPoint,
        size: number
    ): void {
        if (!this.context) {
            return;
        }

        const dx =
            current.x -
            previous.x;

        const dy =
            current.y -
            previous.y;

        const distance =
            Math.sqrt(
                dx * dx +
                dy * dy
            );

        if (distance <= 0) {
            return;
        }

        /*
         * Brush spacing.
         *
         * 0.15 = 15% of brush size.
         *
         * This means dabs overlap heavily,
         * creating a continuous stroke.
         */
        const spacingFactor =
            this.config.edgeStep !==
            undefined
                ? Math.max(
                    0.02,
                    this.config.edgeStep
                )
                : 0.15;

        const spacing =
            Math.max(
                0.5,
                size *
                    spacingFactor
            );

        const steps =
            Math.max(
                1,
                Math.ceil(
                    distance /
                        spacing
                )
            );

        this.context.save();

        this.prepareContext(
            current.p
        );

        for (
            let i = 1;
            i <= steps;
            i++
        ) {
            const t =
                i / steps;

            const x =
                previous.x +
                dx * t;

            const y =
                previous.y +
                dy * t;

            const pressure =
                previous.p +
                (
                    current.p -
                    previous.p
                ) * t;

            const point: BrushPoint = {
                x,
                y,
                p: pressure,

                time:
                    previous.time +
                    (
                        current.time -
                        previous.time
                    ) * t
            };

            const normalizedPressure =
                this.getPressure(
                    pressure
                );

            const taperedSize =
                this.getTaperedSize(
                    size,
                    this.getStrokeProgress()
                );

            const finalSize =
                this.getPressureSize(
                    taperedSize,
                    normalizedPressure
                );

            this.drawDab(
                x,
                y,
                finalSize,
                point
            );
        }

        this.context.restore();
    }

    private renderInitialPoint(
        point: BrushPoint
    ): void {
        if (!this.context) {
            return;
        }

        const pressure =
            this.getPressure(
                point.p
            );

        const size =
            this.getPressureSize(
                this.size,
                pressure
            );

        this.context.save();

        this.prepareContext(
            point.p
        );

        if (
            this.config.pixelSize
        ) {
            this.drawPixelDab(
                point.x,
                point.y,
                size
            );
        } else {
            this.drawDab(
                point.x,
                point.y,
                size,
                point
            );
        }

        this.context.restore();
    }

    private drawDab(
        x: number,
        y: number,
        size: number,
        point?: BrushPoint
    ): void {
        if (!this.context) {
            return;
        }

        const ctx =
            this.context;

        let px = x;
        let py = y;

        /*
         * Scatter.
         */
        const scatter =
            this.getEffectiveScatter(
                point?.p ?? 1,
                size
            );

        if (scatter > 0) {
            const angle =
                Math.random() *
                Math.PI *
                2;

            const radius =
                Math.random() *
                scatter;

            px +=
                Math.cos(angle) *
                radius;

            py +=
                Math.sin(angle) *
                radius;
        }

        /*
         * Wobble.
         */
        if (
            this.config.wobble
        ) {
            const wobble =
                this.config.wobble *
                size;

            px +=
                (
                    Math.random() -
                    0.5
                ) * wobble;

            py +=
                (
                    Math.random() -
                    0.5
                ) * wobble;
        }

        /*
         * Texture.
         */
        if (
            this.config.textureOn &&
            this.textureImg &&
            this.config.textureStrength
        ) {
            this.drawTextureDab(
                px,
                py,
                size
            );

            return;
        }

        /*
         * Ragged edges.
         */
        if (
            this.config.ragged
        ) {
            this.drawRaggedDab(
                px,
                py,
                size
            );

            return;
        }

        /*
         * Normal circular dab.
         */
        ctx.beginPath();

        ctx.arc(
            px,
            py,
            Math.max(
                0.05,
                size / 2
            ),
            0,
            Math.PI * 2
        );

        ctx.fill();

        /*
         * Sparkles.
         */
        if (
            this.config.sparkleDensity &&
            Math.random() <
                this.config.sparkleDensity
        ) {
            this.drawSparkle(
                px,
                py,
                size
            );
        }
    }

    /*
     * ---------------------------------------------------------
     * TAPER
     * ---------------------------------------------------------
     */

    private getStrokeProgress(): number {
        if (
            this.points.length < 2
        ) {
            return 0;
        }

        const first =
            this.points[0];

        const last =
            this.points[
                this.points.length - 1
            ];

        const dx =
            last.x -
            first.x;

        const dy =
            last.y -
            first.y;

        const distance =
            Math.sqrt(
                dx * dx +
                dy * dy
            );

        const taperLength =
            this.config.taperLength ??
            0;

        if (
            taperLength <= 0
        ) {
            return 1;
        }

        return Math.min(
            1,
            distance /
                taperLength
        );
    }

    private getTaperedSize(
        size: number,
        progress: number
    ): number {
        const taper =
            this.config.taperWidth ??
            0;

        if (taper <= 0) {
            return size;
        }

        const factor =
            1 -
            taper *
                (1 - progress);

        return Math.max(
            size * 0.05,
            size * factor
        );
    }

    /*
     * ---------------------------------------------------------
     * SCATTER
     * ---------------------------------------------------------
     */

    private getEffectiveScatter(
        pressure: number,
        size: number
    ): number {
        let scatter =
            this.scatter;

        if (
            this.config.scatter
        ) {
            scatter +=
                this.config.scatter;
        }

        if (
            this.config.scatterPressureOn
        ) {
            scatter *=
                this.getPressure(
                    pressure
                );
        }

        return Math.max(
            0,
            scatter * size
        );
    }

    /*
     * ---------------------------------------------------------
     * PIXEL BRUSH
     * ---------------------------------------------------------
     */

    private drawPixelSegment(
        previous: BrushPoint,
        current: BrushPoint,
        size: number
    ): void {
        if (!this.context) {
            return;
        }

        const pixelSize =
            Math.max(
                1,
                this.config.pixelSize ||
                    5
            );

        const dx =
            current.x -
            previous.x;

        const dy =
            current.y -
            previous.y;

        const distance =
            Math.sqrt(
                dx * dx +
                dy * dy
            );

        const spacing =
            Math.max(
                1,
                pixelSize * 0.5
            );

        const steps =
            Math.max(
                1,
                Math.ceil(
                    distance /
                        spacing
                )
            );

        this.context.save();

        this.prepareContext(
            current.p
        );

        for (
            let i = 0;
            i <= steps;
            i++
        ) {
            const t =
                i / steps;

            const x =
                previous.x +
                dx * t;

            const y =
                previous.y +
                dy * t;

            this.drawPixelDab(
                x,
                y,
                size
            );
        }

        this.context.restore();
    }

    private drawPixelDab(
        x: number,
        y: number,
        size: number
    ): void {
        if (!this.context) {
            return;
        }

        const pixelSize =
            Math.max(
                1,
                this.config.pixelSize ||
                    5
            );

        const snappedX =
            Math.round(
                x / pixelSize
            ) * pixelSize;

        const snappedY =
            Math.round(
                y / pixelSize
            ) * pixelSize;

        this.context.fillRect(
            snappedX -
                pixelSize / 2,
            snappedY -
                pixelSize / 2,
            pixelSize,
            pixelSize
        );
    }

    /*
     * ---------------------------------------------------------
     * DASHED BRUSH
     * ---------------------------------------------------------
     */

    private drawDashedSegment(
        previous: BrushPoint,
        current: BrushPoint,
        size: number
    ): void {
        if (!this.context) {
            return;
        }

        const dashSize =
            Math.max(
                0.1,
                this.config.dashSize ||
                    3
            );

        const gapSize =
            Math.max(
                0.1,
                this.config.gapSize ||
                    5
            );

        const dx =
            current.x -
            previous.x;

        const dy =
            current.y -
            previous.y;

        const distance =
            Math.sqrt(
                dx * dx +
                dy * dy
            );

        if (distance <= 0) {
            return;
        }

        const spacing =
            Math.max(
                0.5,
                size * 0.1
            );

        const steps =
            Math.max(
                1,
                Math.ceil(
                    distance /
                        spacing
                )
            );

        this.context.save();

        this.prepareContext(
            current.p
        );

        for (
            let i = 0;
            i <= steps;
            i++
        ) {
            const t =
                i / steps;

            const x =
                previous.x +
                dx * t;

            const y =
                previous.y +
                dy * t;

            const movement =
                distance / steps;

            this.dashDistance +=
                movement;

            if (
                this.dashDrawing
            ) {
                this.drawDab(
                    x,
                    y,
                    size,
                    current
                );

                if (
                    this.dashDistance >=
                    dashSize
                ) {
                    this.dashDrawing =
                        false;

                    this.dashDistance =
                        0;
                }
            } else if (
                this.dashDistance >=
                gapSize
            ) {
                this.dashDrawing =
                    true;

                this.dashDistance =
                    0;
            }
        }

        this.context.restore();
    }

    /*
     * ---------------------------------------------------------
     * TEXTURE
     * ---------------------------------------------------------
     */

    private drawTextureDab(
        x: number,
        y: number,
        size: number
    ): void {
        if (
            !this.context ||
            !this.textureImg
        ) {
            return;
        }

        const ctx =
            this.context;

        const scale =
            this.config.textureScale ??
            1;

        const strength =
            Math.max(
                0,
                Math.min(
                    1,
                    this.config.textureStrength ??
                        1
                )
            );

        const width =
            size * scale;

        const height =
            size * scale;

        ctx.save();

        ctx.beginPath();

        ctx.arc(
            x,
            y,
            size / 2,
            0,
            Math.PI * 2
        );

        ctx.clip();

        ctx.globalAlpha *=
            strength;

        ctx.drawImage(
            this.textureImg,
            x - width / 2,
            y - height / 2,
            width,
            height
        );

        ctx.restore();
    }

    /*
     * ---------------------------------------------------------
     * RAGGED BRUSH
     * ---------------------------------------------------------
     */

    private drawRaggedDab(
        x: number,
        y: number,
        size: number
    ): void {
        if (!this.context) {
            return;
        }

        const ctx =
            this.context;

        const ragged =
            Math.max(
                0,
                Math.min(
                    1,
                    this.config.ragged ||
                        0
                )
            );

        const radius =
            size / 2;

        const segments = 16;

        ctx.beginPath();

        for (
            let i = 0;
            i <= segments;
            i++
        ) {
            const angle =
                (
                    Math.PI *
                    2 *
                    i
                ) / segments;

            const random =
                1 -
                ragged *
                    Math.random();

            const r =
                radius *
                random;

            const px =
                x +
                Math.cos(angle) *
                    r;

            const py =
                y +
                Math.sin(angle) *
                    r;

            if (i === 0) {
                ctx.moveTo(
                    px,
                    py
                );
            } else {
                ctx.lineTo(
                    px,
                    py
                );
            }
        }

        ctx.closePath();

        ctx.fill();
    }

    /*
     * ---------------------------------------------------------
     * SPARKLES
     * ---------------------------------------------------------
     */

    private drawSparkle(
        x: number,
        y: number,
        size: number
    ): void {
        if (!this.context) {
            return;
        }

        const ctx =
            this.context;

        const sparkleSize =
            this.config.sparkleSize ??
            Math.max(
                1,
                size * 0.15
            );

        ctx.save();

        ctx.globalAlpha *= 0.7;

        ctx.beginPath();

        ctx.moveTo(
            x - sparkleSize,
            y
        );

        ctx.lineTo(
            x + sparkleSize,
            y
        );

        ctx.moveTo(
            x,
            y - sparkleSize
        );

        ctx.lineTo(
            x,
            y + sparkleSize
        );

        ctx.stroke();

        ctx.restore();
    }

    /*
     * ---------------------------------------------------------
     * SHAPE RECOGNITION
     * ---------------------------------------------------------
     */

    private drawRecognizedShape(): void {
        if (
            !this.context ||
            this.points.length < 5
        ) {
            return;
        }

        const shape =
            ShapeRecognizer.recognizeShape(
                this.points.map(
                    point => ({
                        x: point.x,
                        y: point.y,
                        p: point.p
                    })
                )
            );

        /*
         * If recognition failed,
         * draw the original smooth stroke.
         */
        if (
            !shape ||
            !shape.points ||
            shape.points.length === 0 ||
            shape.type ===
                'polyline'
        ) {
            this.drawCollectedStroke();

            return;
        }

        const ctx =
            this.context;

        ctx.save();

        this.prepareContext(
            this.points[
                this.points.length - 1
            ].p
        );

        ctx.lineWidth =
            this.size;

        ctx.lineCap =
            'round';

        ctx.lineJoin =
            'round';

        ctx.beginPath();

        const first =
            shape.points[0];

        ctx.moveTo(
            first.x,
            first.y
        );

        for (
            let i = 1;
            i < shape.points.length;
            i++
        ) {
            const point =
                shape.points[i];

            ctx.lineTo(
                point.x,
                point.y
            );
        }

        if (
            shape.type !== 'line'
        ) {
            ctx.closePath();
        }

        ctx.stroke();

        ctx.restore();
    }

    /*
     * ---------------------------------------------------------
     * FALLBACK STROKE
     * ---------------------------------------------------------
     */

    private drawCollectedStroke(): void {
        if (
            !this.context ||
            this.points.length === 0
        ) {
            return;
        }

        if (
            this.points.length === 1
        ) {
            this.renderInitialPoint(
                this.points[0]
            );

            return;
        }

        for (
            let i = 1;
            i < this.points.length;
            i++
        ) {
            this.drawSmoothSegment(
                this.points[i - 1],
                this.points[i],
                this.size
            );
        }
    }
}