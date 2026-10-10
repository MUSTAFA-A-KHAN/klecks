const DAB_VERTEX = `
attribute vec2 corner;
uniform vec2 center;
uniform float halfSide;
uniform vec2 resolution;
varying vec2 pos;
void main() {
    pos = center + corner * halfSide;
    gl_Position = vec4(pos.x / resolution.x * 2.0 - 1.0, 1.0 - pos.y / resolution.y * 2.0, 0.0, 1.0);
}`;

/** Writes the dab's coverage; the color mask picks the channel (A: coverage, R: applied). */
const DAB_FRAGMENT = `
precision highp float;
uniform sampler2D shape;
uniform sampler2D grain;
uniform bool hasGrain;
uniform vec2 center;
uniform vec2 shapeRowX;
uniform vec2 shapeRowY;
uniform float size;
uniform vec2 grainOrigin;
uniform vec2 grainRowX;
uniform vec2 grainRowY;
uniform vec2 grainSize;
uniform float alpha;
varying vec2 pos;
void main() {
    vec2 d = pos - center;
    vec2 uv = (vec2(dot(shapeRowX, d), dot(shapeRowY, d)) + size) / (2.0 * size);
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
    float a = texture2D(shape, uv).a * alpha;
    if (hasGrain) {
        vec2 g = pos - grainOrigin;
        // The grain is stored inverted (see ProcreateStamp).
        a *= 1.0 - texture2D(grain, vec2(dot(grainRowX, g), dot(grainRowY, g)) / grainSize).a;
    }
    gl_FragColor = vec4(a, 0.0, 0.0, a);
}`;

const OUTPUT_VERTEX = `
attribute vec2 corner;
void main() {
    gl_Position = vec4(corner, 0.0, 1.0);
}`;

/**
 * The layer already shows the stroke at the applied coverage (R). Drawing the color source-over
 * with opacity (target - applied) / (1 - applied) brings it to the target coverage (A), exactly
 * as if the layer had been restored and redrawn at the target.
 */
const OUTPUT_FRAGMENT = `
precision highp float;
uniform sampler2D coverage;
uniform vec2 origin;
uniform float outputHeight;
uniform vec2 resolution;
uniform vec3 color;
void main() {
    vec2 pos = origin + vec2(gl_FragCoord.x, outputHeight - gl_FragCoord.y);
    vec4 c = texture2D(coverage, vec2(pos.x / resolution.x, 1.0 - pos.y / resolution.y));
    float a = c.a > c.r ? (c.a - c.r) / (1.0 - c.r) : 0.0;
    gl_FragColor = vec4(color * a, a);
}`;

export type TGlDab = {
    x: number; y: number; size: number; side: number; rotation: number;
    scaleX: number; scaleY: number; alpha: number;
    /** Grain transform: canvas point → grain image pixel is rotate(-angle) / scale around origin. */
    grain?: { originX: number; originY: number; angle: number; scale: number };
};

/**
 * Max transfer on the GPU, so nothing is read back per dab, which stalls badly in Safari.
 * Dabs blend with MAX into a layer-sized coverage texture. commit() then renders only the change
 * since the last commit into a small canvas, for the caller to draw over the layer.
 */
export class MaxTransferGl {
    /** Output of commit(): the region's change sits in its top-left corner. */
    readonly canvas: HTMLCanvasElement;
    private readonly gl: WebGLRenderingContext;
    private readonly dabProgram: WebGLProgram;
    private readonly outputProgram: WebGLProgram;
    private readonly dabUniforms: Record<string, WebGLUniformLocation | null> = {};
    private readonly outputUniforms: Record<string, WebGLUniformLocation | null> = {};
    private readonly coverage: WebGLTexture;
    private readonly framebuffer: WebGLFramebuffer;
    private readonly maxSize: number;
    private readonly grainWidth: number = 1;
    private readonly grainHeight: number = 1;
    private readonly hasGrain: boolean;
    private width = 0;
    private height = 0;
    /** Dabs since the last commit, replayed into R once their change is on the layer. */
    private readonly pending: TGlDab[] = [];

    private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext, maxEquation: number,
        shape: HTMLCanvasElement, grain: HTMLCanvasElement | undefined, grainFilter: boolean) {
        this.canvas = canvas;
        this.gl = gl;
        const compile = (type: number, source: string) => {
            const shader = gl.createShader(type)!;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
            }
            return shader;
        };
        const link = (vertex: string, fragment: string, uniforms: Record<string, unknown>,
            names: string[]) => {
            const program = gl.createProgram()!;
            gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
            gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
            // Both programs read the same quad buffer through attribute 0.
            gl.bindAttribLocation(program, 0, 'corner');
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
            }
            names.forEach((name) => uniforms[name] = gl.getUniformLocation(program, name));
            return program;
        };
        this.dabProgram = link(DAB_VERTEX, DAB_FRAGMENT, this.dabUniforms, ['center', 'halfSide',
            'resolution', 'shape', 'grain', 'hasGrain', 'shapeRowX', 'shapeRowY', 'size',
            'grainOrigin', 'grainRowX', 'grainRowY', 'grainSize', 'alpha']);
        this.outputProgram = link(OUTPUT_VERTEX, OUTPUT_FRAGMENT, this.outputUniforms,
            ['coverage', 'origin', 'outputHeight', 'resolution', 'color']);

        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        const texture = (unit: number, source: HTMLCanvasElement, linear: boolean, repeat: boolean) => {
            let image = source;
            if (repeat) {
                // REPEAT needs power-of-two sizes in WebGL 1.
                const pot = (n: number) => 2 ** Math.max(0, Math.round(Math.log2(n)));
                image = document.createElement('canvas');
                image.width = pot(source.width);
                image.height = pot(source.height);
                const ctx = image.getContext('2d')!;
                ctx.imageSmoothingEnabled = linear;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(source, 0, 0, image.width, image.height);
            }
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            // Plain bilinear like canvas drawImage, so both paths look the same.
            const filter = linear ? gl.LINEAR : gl.NEAREST;
            const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        };
        gl.useProgram(this.dabProgram);
        texture(0, shape, true, false);
        gl.uniform1i(this.dabUniforms.shape, 0);
        this.hasGrain = !!grain;
        if (grain) {
            texture(1, grain, grainFilter, true);
            gl.uniform1i(this.dabUniforms.grain, 1);
            this.grainWidth = grain.width;
            this.grainHeight = grain.height;
        }
        gl.uniform1i(this.dabUniforms.hasGrain, grain ? 1 : 0);

        // Unit 2 is only sampled by the output program, never while rendering into it.
        gl.activeTexture(gl.TEXTURE2);
        this.coverage = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.coverage);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.framebuffer = gl.createFramebuffer()!;
        gl.useProgram(this.outputProgram);
        gl.uniform1i(this.outputUniforms.coverage, 2);

        gl.blendEquation(maxEquation);
        gl.blendFunc(gl.ONE, gl.ONE);
        const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
        this.maxSize = Math.min(viewport[0], viewport[1], gl.getParameter(gl.MAX_TEXTURE_SIZE));
    }

    /** Undefined when WebGL or MAX blending is unavailable; callers then use the CPU path. */
    static create(shape: HTMLCanvasElement, grain: HTMLCanvasElement | undefined,
        grainFilter: boolean): MaxTransferGl | undefined {
        try {
            const canvas = document.createElement('canvas');
            const options = { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false };
            const gl2 = canvas.getContext('webgl2', options) as WebGL2RenderingContext | null;
            const gl = gl2 || canvas.getContext('webgl', options) as WebGLRenderingContext | null;
            const maxEquation = gl2 ? gl2.MAX : gl?.getExtension('EXT_blend_minmax')?.MAX_EXT;
            if (!gl || maxEquation === undefined) return undefined;
            return new MaxTransferGl(canvas, gl, maxEquation, shape, grain, grainFilter);
        } catch {
            return undefined;
        }
    }

    /** Clear the coverage for a new stroke. False if the layer is too large for this GPU. */
    begin(width: number, height: number, color: string): boolean {
        const gl = this.gl;
        if (gl.isContextLost() || width > this.maxSize || height > this.maxSize) return false;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        if (this.width !== width || this.height !== height) {
            this.width = width;
            this.height = height;
            gl.activeTexture(gl.TEXTURE2);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
                this.coverage, 0);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
                this.width = this.height = 0;
                return false;
            }
        }
        gl.colorMask(true, true, true, true);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const [r, g, b] = (color.match(/\d+(\.\d+)?/g) || ['0', '0', '0']).map(Number);
        gl.useProgram(this.outputProgram);
        gl.uniform3f(this.outputUniforms.color, r / 255, g / 255, b / 255);
        gl.uniform2f(this.outputUniforms.resolution, width, height);
        gl.useProgram(this.dabProgram);
        gl.uniform2f(this.dabUniforms.resolution, width, height);
        this.pending.length = 0;
        return true;
    }

    private drawDab(d: TGlDab): void {
        const gl = this.gl;
        const u = this.dabUniforms;
        const cos = Math.cos(d.rotation);
        const sin = Math.sin(d.rotation);
        gl.uniform2f(u.center, d.x, d.y);
        gl.uniform1f(u.halfSide, d.side / 2);
        gl.uniform1f(u.size, d.size);
        // Inverse of rotate(rotation) · scale(scaleX, scaleY), as in the canvas stamp path.
        gl.uniform2f(u.shapeRowX, cos / d.scaleX, sin / d.scaleX);
        gl.uniform2f(u.shapeRowY, -sin / d.scaleY, cos / d.scaleY);
        gl.uniform1f(u.alpha, d.alpha);
        if (this.hasGrain && d.grain) {
            const gc = Math.cos(d.grain.angle);
            const gs = Math.sin(d.grain.angle);
            gl.uniform2f(u.grainOrigin, d.grain.originX, d.grain.originY);
            gl.uniform2f(u.grainRowX, gc / d.grain.scale, gs / d.grain.scale);
            gl.uniform2f(u.grainRowY, -gs / d.grain.scale, gc / d.grain.scale);
            gl.uniform2f(u.grainSize, this.grainWidth, this.grainHeight);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /** Raise the target coverage (A) under this dab. */
    dab(d: TGlDab): void {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(this.dabProgram);
        gl.enable(gl.BLEND);
        gl.colorMask(false, false, false, true);
        this.drawDab(d);
        this.pending.push(d);
    }

    /**
     * Render the change within the region since the last commit into the top-left of `canvas`,
     * then mark it applied. The caller must draw it over the layer before the next commit.
     */
    commit(x: number, y: number, width: number, height: number): void {
        const gl = this.gl;
        if (this.canvas.width < width || this.canvas.height < height) {
            // Grow in steps, so a growing stroke does not reallocate on every commit.
            this.canvas.width = Math.max(this.canvas.width, 2 ** Math.ceil(Math.log2(width)));
            this.canvas.height = Math.max(this.canvas.height, 2 ** Math.ceil(Math.log2(height)));
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, this.canvas.height - height, width, height);
        gl.useProgram(this.outputProgram);
        gl.disable(gl.BLEND);
        gl.colorMask(true, true, true, true);
        gl.uniform2f(this.outputUniforms.origin, x, y);
        gl.uniform1f(this.outputUniforms.outputHeight, this.canvas.height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Applied coverage (R) catches up with the target (A) by replaying the same dabs.
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(this.dabProgram);
        gl.enable(gl.BLEND);
        gl.colorMask(true, false, false, false);
        this.pending.forEach((d) => this.drawDab(d));
        this.pending.length = 0;
    }
}
