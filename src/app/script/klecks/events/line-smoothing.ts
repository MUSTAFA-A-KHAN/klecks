import { BB } from '../../bb/bb';
import { TDrawEvent, TDrawMoveEvent } from '../kl-types';

/**
 * Line smoothing. EventChain element.
 * Improved spring-based or exponential moving average smoothing for better drawing feel.
 */
export class LineSmoothing {
    private chainOut: ((drawEvent: TDrawEvent) => void) | undefined;
    private smoothing: number; // 0 to 1
    private lastMixedInput:
        | {
              x: number;
              y: number;
              pressure: number;
          }
        | undefined;
    private rawInput:
        | {
              x: number;
              y: number;
              pressure: number;
          }
        | undefined;
    private interval: ReturnType<typeof setInterval> | undefined;

    constructor(p: {
        smoothing: number;
    }) {
        this.smoothing = BB.clamp(p.smoothing, 0, 1);
    }

    chainIn(event: TDrawEvent): TDrawEvent | null {
        event = BB.copyObj(event);
        clearInterval(this.interval);

        if (event.type === 'down') {
            this.lastMixedInput = {
                x: event.x,
                y: event.y,
                pressure: event.pressure,
            };
            this.rawInput = {
                x: event.x,
                y: event.y,
                pressure: event.pressure,
            };
            return event;
        }

        if (event.type === 'move') {
            this.rawInput = {
                x: event.x,
                y: event.y,
                pressure: event.pressure,
            };

            // Non-linear spring/exponential moving average for natural stroke trailing
            // smoothing of 0 = instant, smoothing of 1 = max delay
            const weight = Math.pow(1 - this.smoothing, 1.5);
            // The more smoothing, the smaller the weight (closer to 0), meaning it takes longer to catch up.

            // For pressure, use a slightly faster catch-up to feel responsive
            const pressureWeight = Math.min(1, weight * 1.5);

            event.x = BB.mix(this.lastMixedInput!.x, event.x, weight);
            event.y = BB.mix(this.lastMixedInput!.y, event.y, weight);
            event.pressure = BB.mix(this.lastMixedInput!.pressure, event.pressure, pressureWeight);

            this.lastMixedInput = {
                x: event.x,
                y: event.y,
                pressure: event.pressure,
            };

            if (this.smoothing > 0) {
                // The catch-up timer ensures the stroke reaches the pen's actual location if it stops moving
                this.interval = setInterval(() => {
                    // Check distance to raw input
                    const dx = this.rawInput!.x - this.lastMixedInput!.x;
                    const dy = this.rawInput!.y - this.lastMixedInput!.y;
                    const dPress = this.rawInput!.pressure - this.lastMixedInput!.pressure;

                    const distSq = dx * dx + dy * dy;
                    if (distSq < 0.05 && Math.abs(dPress) < 0.01) {
                        clearInterval(this.interval);
                        return;
                    }

                    event = JSON.parse(JSON.stringify(event)) as TDrawMoveEvent;

                    // Catch-up weight
                    const catchUpWeight = weight * 0.5;

                    event.x = BB.mix(this.lastMixedInput!.x, this.rawInput!.x, catchUpWeight);
                    event.y = BB.mix(this.lastMixedInput!.y, this.rawInput!.y, catchUpWeight);
                    event.pressure = BB.mix(this.lastMixedInput!.pressure, this.rawInput!.pressure, catchUpWeight);

                    this.lastMixedInput = {
                        x: event.x,
                        y: event.y,
                        pressure: event.pressure,
                    };

                    this.chainOut?.(event);
                }, 16); // roughly 60fps catch-up loop
            }
        }

        if (event.type === 'up' && this.smoothing > 0 && this.lastMixedInput && this.rawInput) {
            // Immediately catch up to the final point when lifting the pen, to avoid cut-off hooks
            clearInterval(this.interval);
            event.x = this.rawInput.x;
            event.y = this.rawInput.y;
            event.pressure = this.rawInput.pressure;
            this.lastMixedInput = undefined;
            this.rawInput = undefined;
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
