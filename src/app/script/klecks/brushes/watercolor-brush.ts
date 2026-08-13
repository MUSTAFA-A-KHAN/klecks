import { BB } from "../../bb/bb";
import { TRgb } from "../kl-types";
import { BezierLine, TBezierLineCallback } from "../../bb/math/line";
import { HISTORY_TILE_SIZE, KlHistory } from "../history/kl-history";
import { getPushableLayerChange } from "../history/push-helpers/get-pushable-layer-change";
import { createArray } from "../../bb/base/base";
import { createImageDataTile } from "../history/image-data-tile";
import { getBinaryMask } from "../select-tool/get-binary-mask";
import { getMultiPolyBounds } from "../../bb/multi-polygon/get-multi-polygon-bounds";
import { getChangedTiles } from "../history/push-helpers/changed-tiles";
import { boundsOverlap, integerBounds } from "../../bb/math/math";

export class WatercolorBrush {
  private isTesting: boolean = false;
  private context: CanvasRenderingContext2D = {} as CanvasRenderingContext2D;
  private layerId: string = "NOT_SET";
  private klHistory: KlHistory = {} as KlHistory;

  private color: TRgb = { r: 0, g: 0, b: 0 };
  private size: number = 20; // radius
  private opacity: number = 0.5; // 0-1
  private wetness: number = 0.0;
  private edgeConcentration: number = 0.33;
  private bleeding: number = 0.3;
  private edgeWidth: number = 0.7;
  private edgeWobble: number = 0.2;

  private settingLockLayerAlpha: boolean = false;
  private isDrawing: boolean = false;

  private bezierLine: BezierLine | undefined;
  private lastInput = { x: 0, y: 0, pressure: 0 };
  private lastInput2 = { x: 0, y: 0, pressure: 0 };

  private drawBuffer: any[] = [];
  private redrawBounds: any;
  private cells: (ImageData | undefined)[] = [];
  private selectionBounds: any;
  private mask: any;
  private localColOld: any;

  private brushAlpha: HTMLCanvasElement;
private brushAlphaKey = "";
  // noise arrays
  private seed: number;
  private perm: Uint8Array;
  private grad: Float32Array;

  constructor() {
    this.brushAlpha = document.createElement("canvas");

    this.seed = 1;
    this.perm = new Uint8Array(512);
    this.grad = new Float32Array(512);
    this.initSimplex();
  }

  private initSimplex(): void {
    let e = this.seed;
    const t = () => (
      (e = (1664525 * e + 1013904223) >>> 0),
      (e >>> 0) / 4294967296
    );
    for (let n = 0; n < 256; n++) {
      this.perm[n] = n;
      this.grad[n] = 2 * t() - 1;
    }
    for (let n = 255; n > 0; n--) {
      const e = Math.floor(t() * (n + 1));
      const temp = this.perm[n];
      this.perm[n] = this.perm[e];
      this.perm[e] = temp;
    }
    for (let n = 0; n < 256; n++) {
      this.perm[256 + n] = this.perm[n];
      this.grad[256 + n] = this.grad[n];
    }
  }

  private simplex3d(e: number, t: number, n: number): number {
    let r,
      i,
      a,
      o,
      s,
      l = (e + t + n) * (1 / 3),
      c = Math.floor(e + l),
      u = Math.floor(t + l),
      d = Math.floor(n + l),
      h = (c + u + d) * (1 / 6),
      p = e - c + h,
      m = t - u + h,
      g = n - d + h;
    if (p >= m) {
      if (m >= g) {
        r = 1;
        i = 0;
        a = 0;
        o = 1;
        s = 1;
      } else if (p >= g) {
        r = 1;
        i = 0;
        a = 0;
        o = 1;
        s = 0;
      } else {
        r = 0;
        i = 0;
        a = 1;
        o = 1;
        s = 0;
      }
    } else {
      if (m < g) {
        r = 0;
        i = 0;
        a = 1;
        o = 0;
        s = 1;
      } else if (p < g) {
        r = 0;
        i = 1;
        a = 0;
        o = 0;
        s = 1;
      } else {
        r = 0;
        i = 1;
        a = 0;
        o = 1;
        s = 1;
      }
    }
    let f = p - r + 1 / 6,
      _ = m - i + 1 / 6,
      b = g - a + 1 / 6,
      v = p - o + 1 / 3,
      y = m - s + 1 / 3,
      C = g - 1 + 0.5,
      T = p - 1 + 0.5,
      A = m - 1 + 0.5,
      w = g - 1 + 0.5,
      x = 255 & c,
      k = 255 & u,
      S = 255 & d;
    let M = 0.5 - p * p - m * m - g * g,
      P = 0.5 - f * f - _ * _ - b * b,
      L = 0.5 - v * v - y * y - C * C,
      R = 0.5 - T * T - A * A - w * w,
      O = 0,
      D = 0,
      I = 0,
      N = 0;
    if (M > 0) {
      M *= M;
      let e = this.perm[x + this.perm[k + this.perm[S]]] % 12;
      O =
        M *
        M *
        (this.grad[e] * p + this.grad[e + 1] * m + this.grad[e + 2] * g);
    }
    if (P > 0) {
      P *= P;
      let e = this.perm[x + r + this.perm[k + i + this.perm[S + a]]] % 12;
      D =
        P *
        P *
        (this.grad[e] * f + this.grad[e + 1] * _ + this.grad[e + 2] * b);
    }
    if (L > 0) {
      L *= L;
      let e = this.perm[x + o + this.perm[k + s + this.perm[S + 1]]] % 12;
      I =
        L *
        L *
        (this.grad[e] * v + this.grad[e + 1] * y + this.grad[e + 2] * C);
    }
    if (R > 0) {
      R *= R;
      let e = this.perm[x + 1 + this.perm[k + 1 + this.perm[S + 1]]] % 12;
      N =
        R *
        R *
        (this.grad[e] * T + this.grad[e + 1] * A + this.grad[e + 2] * w);
    }
    return 32 * (O + D + I + N);
  }

  private normalizePressure(p: number): number {
    return Math.abs(p - 0.12) < 0.001 ? 1 : p;
}
 private createBrushAlpha(size: number): HTMLCanvasElement {
  
    size = Math.max(1, Math.round(size));

    const key = [
        size,
        this.opacity,
        this.color.r,
        this.color.g,
        this.color.b,
        this.bleeding,
        this.edgeWidth,
        this.edgeConcentration,
        this.edgeWobble,
        this.seed,
    ].join("|");

    if (key === this.brushAlphaKey) {
        return this.brushAlpha;
    }

    this.brushAlphaKey = key;

    if (
        this.brushAlpha.width !== size * 2 ||
        this.brushAlpha.height !== size * 2
    ) {
        this.brushAlpha.width = size * 2;
        this.brushAlpha.height = size * 2;
    }

    const ctx = this.brushAlpha.getContext("2d")!;
    ctx.clearRect(0, 0, size * 2, size * 2);

    const imageData = ctx.createImageData(size * 2, size * 2);
    const data = imageData.data;
    const r = size;
    const rSq = r * r;

    for (let y = 0; y < size * 2; y++) {
      for (let x = 0; x < size * 2; x++) {
        const dx = x - r;
        const dy = y - r;
        const dSq = dx * dx + dy * dy;

        if (dSq <= rSq) {
          const idx = (y * size * 2 + x) * 4;

          const dist = Math.sqrt(dSq) / r; // 0 to 1

          // Edge concentration and bleeding
          let alpha = 1.0;

          // Wobble using simplex noise
          const noise =
            this.simplex3d(x * 0.1, y * 0.1, this.seed) * this.edgeWobble;
          const modDist = Math.max(0, Math.min(1, dist + noise));

          if (modDist > 1.0 - this.bleeding) {
            alpha = Math.max(
              0,
              1 - (modDist - (1.0 - this.bleeding)) / this.bleeding,
            );
          } else if (modDist > 1.0 - this.bleeding - this.edgeWidth) {
            // Edge is slightly darker/more opaque
            alpha = 1.0 + this.edgeConcentration;
          }

          alpha *= this.opacity;

          data[idx] = this.color.r;
          data[idx + 1] = this.color.g;
          data[idx + 2] = this.color.b;
          data[idx + 3] = Math.min(255, Math.floor(alpha * 255));
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return this.brushAlpha;
  }

  private drawDot(x: number, y: number, size: number, opacity: number): void {
    const brush = this.createBrushAlpha(size);

    this.context.save();
    this.context.globalCompositeOperation = "multiply";
    if (this.settingLockLayerAlpha) {
      this.context.globalCompositeOperation = "source-atop";
    }
    this.context.drawImage(brush, Math.round(x - size), Math.round(y - size));
    this.context.restore();

    const x1 = Math.floor(x - size);
    const y1 = Math.floor(y - size);
    const x2 = Math.ceil(x + size);
    const y2 = Math.ceil(y + size);

    // Update history tiles
    const cw = this.context.canvas.width;
    const ch = this.context.canvas.height;
    const startX = Math.max(0, Math.floor(x1 / HISTORY_TILE_SIZE));
    const startY = Math.max(0, Math.floor(y1 / HISTORY_TILE_SIZE));
    const endX = Math.min(
      Math.ceil(cw / HISTORY_TILE_SIZE) - 1,
      Math.floor(x2 / HISTORY_TILE_SIZE),
    );
    const endY = Math.min(
      Math.ceil(ch / HISTORY_TILE_SIZE) - 1,
      Math.floor(y2 / HISTORY_TILE_SIZE),
    );
    for (let cy = startY; cy <= endY; cy++) {
      for (let cx = startX; cx <= endX; cx++) {
        const index = cy * Math.ceil(cw / HISTORY_TILE_SIZE) + cx;
        if (!this.cells[index]) {
          this.cells[index] = this.context.getImageData(
            cx * HISTORY_TILE_SIZE,
            cy * HISTORY_TILE_SIZE,
            HISTORY_TILE_SIZE,
            HISTORY_TILE_SIZE,
          );
        }
      }
    }
  }

  private continueLine(
    x: number | undefined,
    y: number | undefined,
    pressure: number,
    isCoalesced: boolean,
  ): void {
    if (!this.bezierLine) return;

    const bDist = Math.max(1, this.size * 0.1);

    const bezierCallback: TBezierLineCallback = (val) => {
      const factor = val.t;
      const localPressure =
        this.lastInput2.pressure * (1 - factor) + pressure * factor;
      const localOpacity = this.opacity;
      const effectivePressure = this.normalizePressure(localPressure);
      const localSize = Math.max(0.1, effectivePressure * this.size);
      // const localSize = Math.max(0.1, localPressure * this.size);

      this.drawDot(val.x, val.y, localSize, localOpacity);
      
    };

    if (x === undefined || y === undefined) {
      this.bezierLine.addFinal(bDist, bezierCallback);
    } else {
      this.bezierLine.add(x, y, bDist, bezierCallback);
    }
  }

  // ----------------------------------- public -----------------------------------

  setHistory(klHistory: KlHistory): void {
    this.klHistory = klHistory;
  }

  getSize(): number {
    return this.size;
  }

  setSize(s: number): void {
    this.size = s;
  }

  getOpacity(): number {
    return this.opacity;
  }

  setOpacity(o: number): void {
    this.opacity = o;
  }

  getWetness(): number {
    return this.wetness;
  }

  setWetness(w: number): void {
    this.wetness = w;
  }

  getEdgeConcentration(): number {
    return this.edgeConcentration;
  }

  setEdgeConcentration(ec: number): void {
    this.edgeConcentration = ec;
  }

  getBleeding(): number {
    return this.bleeding;
  }

  setBleeding(b: number): void {
    this.bleeding = b;
  }

  getEdgeWidth(): number {
    return this.edgeWidth;
  }

  setEdgeWidth(ew: number): void {
    this.edgeWidth = ew;
  }

  getEdgeWobble(): number {
    return this.edgeWobble;
  }

  setEdgeWobble(ew: number): void {
    this.edgeWobble = ew;
  }

  setColor(c: TRgb): void {
    this.color = BB.copyObj(c);
  }

  setContext(c: CanvasRenderingContext2D, id: string): void {
    this.context = c;
    this.layerId = id;
  }

  getLockAlpha(): boolean {
    return this.settingLockLayerAlpha;
  }

  setLockAlpha(b: boolean): void {
    this.settingLockLayerAlpha = b;
  }

  getIsDrawing(): boolean {
    return this.isDrawing;
  }

  setIsTesting(b: boolean): void {
    this.isTesting = b;
  }

  startLine(x: number, y: number, p: number): void {
    const selection = this.klHistory.getComposed().selection.value;
    this.selectionBounds = selection
      ? integerBounds(getMultiPolyBounds(selection))
      : undefined;
    this.mask = selection
      ? getBinaryMask(
          selection,
          this.context.canvas.width,
          this.context.canvas.height,
        )
      : undefined;
    const totalCells =
      Math.ceil(this.context.canvas.width / HISTORY_TILE_SIZE) *
      Math.ceil(this.context.canvas.height / HISTORY_TILE_SIZE);
    this.cells = createArray(totalCells, undefined);

    this.isDrawing = true;
    this.seed = Math.random();

    p = Math.max(0, Math.min(1, p));
    const localPressure = this.normalizePressure(p);
    const localSize = Math.max(0.1, localPressure * this.size);

    // this.drawDot(x, y, localSize, this.opacity);
    this.lastInput = { x, y, pressure: p };
this.lastInput2 = { x, y, pressure: p };

    this.bezierLine = new BB.BezierLine();
    this.bezierLine.add(x, y, 0, () => {});

    this.lastInput.x = x;
    this.lastInput.y = y;
    this.lastInput.pressure = p;
    this.lastInput2 = BB.copyObj(this.lastInput);
  }

  goLine(x: number, y: number, p: number, isCoalesced?: boolean): void {
    if (!this.isDrawing) return;

    this.continueLine(x, y, this.lastInput.pressure, !!isCoalesced);

    this.lastInput2 = BB.copyObj(this.lastInput);
    this.lastInput.x = x;
    this.lastInput.y = y;
    this.lastInput.pressure = p;
  }

  endLine(): void {
    if (this.bezierLine) {
      this.continueLine(undefined, undefined, this.lastInput.pressure, false);
    }

    this.isDrawing = false;
    this.bezierLine = undefined;

    if (this.cells.some((item) => item)) {
      let cells = this.cells;
      if (this.selectionBounds) {
        const tilesInSelection = getChangedTiles(
          this.selectionBounds,
          this.context.canvas.width,
          this.context.canvas.height,
        );
        cells = cells.map((cell, index) => {
          return tilesInSelection[index] ? cell : undefined;
        });
      }

      this.klHistory.push(
        getPushableLayerChange(
          this.klHistory.getComposed(),
          cells.map((cell) => {
            return cell ? createImageDataTile(cell) : undefined;
          }),
        ),
      );
    }
    this.cells = [];
  }

  drawLineSegment(x1: number, y1: number, x2: number, y2: number): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(distance / 10);

    this.startLine(x1, y1, 1);

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const xi = x1 + dx * t;
      const yi = y1 + dy * t;
      this.goLine(xi, yi, 1, false);
    }

    this.endLine();
  }
}
