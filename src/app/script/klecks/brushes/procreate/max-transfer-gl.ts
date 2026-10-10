const VERTEX = `
attribute vec2 corner;
uniform vec2 center;
uniform float halfSide;
uniform vec2 resolution;
varying vec2 pos;
void main() {
    pos = center + corner * halfSide;
    gl_Position = vec4(pos.x / resolution.x * 2.0 - 1.0, 1.0 - pos.y / resolution.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENT = `
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
uniform vec3 color;
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
    gl_FragColor = vec4(color * a, a);
}`;

export type TGlDab = {
    x: number; y: number; size: number; side: number; rotation: number;
    scaleX: number; scaleY: number; alpha: number;
    /** Grain transform: canvas point → grain image pixel is rotate(-angle) / scale around origin. */
    grain?: { originX: number; originY: number; angle: number; scale: number };
};

/**
 * Max transfer on the GPU. Dabs blend with MAX into a layer-sized buffer, so per-pixel coverage
 * is capped within a stroke without reading pixels back, which stalls badly in Safari.
 */
export class MaxTransferGl {
    readonly canvas: HTMLCanvasElement;
    private readonly gl: WebGLRenderingContext;
    private readonly program: WebGLProgram;
    private readonly uniforms: Record<string, WebGLUniformLocation | null> = {};
    private readonly maxSize: number;
    private readonly grainWidth: number = 1;
    private readonly grainHeight: number = 1;
    private readonly hasGrain: boolean;

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
        this.program = gl.createProgram()!;
        gl.attachShader(this.program, compile(gl.VERTEX_SHADER, VERTEX));
        gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(this.program) || 'Program link failed');
        }
        gl.useProgram(this.program);
        ['center', 'halfSide', 'resolution', 'shape', 'grain', 'hasGrain', 'shapeRowX', 'shapeRowY',
            'size', 'grainOrigin', 'grainRowX', 'grainRowY', 'grainSize', 'color', 'alpha']
            .forEach((name) => this.uniforms[name] = gl.getUniformLocation(this.program, name));

        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const corner = gl.getAttribLocation(this.program, 'corner');
        gl.enableVertexAttribArray(corner);
        gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

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
        texture(0, shape, true, false);
        gl.uniform1i(this.uniforms.shape, 0);
        this.hasGrain = !!grain;
        if (grain) {
            texture(1, grain, grainFilter, true);
            gl.uniform1i(this.uniforms.grain, 1);
            this.grainWidth = grain.width;
            this.grainHeight = grain.height;
        }
        gl.uniform1i(this.uniforms.hasGrain, grain ? 1 : 0);

        gl.enable(gl.BLEND);
        gl.blendEquation(maxEquation);
        gl.blendFunc(gl.ONE, gl.ONE);
        const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
        this.maxSize = Math.min(viewport[0], viewport[1], gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
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

    /** Clear the buffer for a new stroke. False if the layer is too large for this GPU. */
    begin(width: number, height: number, color: string): boolean {
        const gl = this.gl;
        if (gl.isContextLost() || width > this.maxSize || height > this.maxSize) return false;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.uniform2f(this.uniforms.resolution, width, height);
        const [r, g, b] = (color.match(/\d+(\.\d+)?/g) || ['0', '0', '0']).map(Number);
        gl.uniform3f(this.uniforms.color, r / 255, g / 255, b / 255);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return true;
    }

    dab(d: TGlDab): void {
        const gl = this.gl;
        const u = this.uniforms;
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
}
