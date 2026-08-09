import { BB } from '../../bb/bb';
import { TDrawEvent, TDrawMoveEvent } from '../kl-types';

/**
 * Line smoothing. EventChain element.
 * Provides an immediate, low-latency EMA smoothing based on distance and velocity.
 */
export class LineSmoothing {
    private chainOut: ((drawEvent: TDrawEvent) => void) | undefined;
    private smoothing: number = 0;
    private smoothedPoint: { x: number; y: number; pressure: number } | undefined;

    constructor(p: { smoothing: number; }) {
        this.smoothing = BB.clamp(p.smoothing, 0, 1);
    }

    chainIn(event: TDrawEvent): TDrawEvent | null {
        if (event.type === 'down') {
            this.smoothedPoint = {
                x: event.x,
                y: event.y,
                pressure: event.pressure,
            };
            return event;
        }

        if (event.type === 'move') {
            if (!this.smoothedPoint || this.smoothing === 0) {
                this.smoothedPoint = {
                    x: event.x,
                    y: event.y,
                    pressure: event.pressure,
                };
                return event;
            }

            const newEvent = BB.copyObj(event) as TDrawMoveEvent;

            const dx = event.x - this.smoothedPoint.x;
            const dy = event.y - this.smoothedPoint.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            let lastWeight = this.smoothing;

            // To simulate pulled string, we lower the weight (so we use more of the new event)
            // if distance is large. For high smoothing, dist will be larger.
            // Let's use a dynamic pull string radius based on the smoothing itself.
            const pullStringRadius = (lastWeight / (1.0 - lastWeight + 0.001)) * 0.5; // Roughly 0 to 50

            if (dist > pullStringRadius && pullStringRadius > 0) {
                 const pullFactor = Math.min(1.0, (dist - pullStringRadius) / pullStringRadius);
                 lastWeight = lastWeight * (1.0 - (pullFactor * 0.5));
            }

            newEvent.x = BB.mix(event.x, this.smoothedPoint.x, lastWeight);
            newEvent.y = BB.mix(event.y, this.smoothedPoint.y, lastWeight);
            newEvent.pressure = BB.mix(event.pressure, this.smoothedPoint.pressure, lastWeight);

            this.smoothedPoint = {
                x: newEvent.x,
                y: newEvent.y,
                pressure: newEvent.pressure,
            };

            return newEvent;
        }

        if (event.type === 'up') {
            // Because line smoothing modifies the trajectory dynamically, we output the raw event position at the end.
            // This ensures that the stroke terminates exactly where the pointer lifted.
            this.smoothedPoint = undefined;
            return event;
        }

        return event;
    }

    setChainOut(func: (drawEvent: TDrawEvent) => void): void {
        this.chainOut = func;
    }

    setSmoothing(s: number): void {
        this.smoothing = BB.clamp(s, 0, 1);
    }
}
