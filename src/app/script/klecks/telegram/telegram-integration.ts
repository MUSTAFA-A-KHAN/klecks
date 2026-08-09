import { TelegramConfigLoader } from './telegram-config';
import { TelegramService } from './telegram-service';
import { KlCanvas } from '../canvas/kl-canvas';
import { klCanvasToPsdBlob } from '../storage/kl-canvas-to-psd-blob';

export class TelegramIntegration {
    private completedStrokeCount = 0;
    private isSending = false;
    private klCanvas: KlCanvas;

    constructor(klCanvas: KlCanvas) {
        this.klCanvas = klCanvas;
    }

    async onStrokeCompleted() {
        const config = await TelegramConfigLoader.getConfig();
        if (!config) {
            return;
        }

        this.completedStrokeCount++;

        if (this.completedStrokeCount >= config.strokesPerSend && !this.isSending) {
            // It's time to send
            await this.sendSketch();
        }
    }

    private async sendSketch() {
        this.isSending = true;
        const currentStrokeCount = this.completedStrokeCount;

        try {
            // Get canvas as Blob (PNG)
            const canvasElement = this.klCanvas.getCompleteCanvas(1);
            const blob = await new Promise<Blob | null>(resolve => {
                canvasElement.toBlob(resolve, 'image/png');
            });

            if (!blob) {
                console.warn('Failed to export canvas for Telegram.');
                return;
            }

            const success = await TelegramService.sendSketch(blob, currentStrokeCount);

            if (success) {
                // Only reset the strokes that were successfully sent.
                // If the user made more strokes during sending, we keep them.
                this.completedStrokeCount -= currentStrokeCount;
                if (this.completedStrokeCount < 0) {
                    this.completedStrokeCount = 0; // Should not happen, but just in case
                }
            } else {
                console.warn('Failed to send sketch to Telegram. Will retry on next stroke.');
            }
        } catch(e) {
            console.warn('Error during Telegram send process.');
        } finally {
            this.isSending = false;
            // If while we were sending we crossed the threshold again, trigger another send
            const config = await TelegramConfigLoader.getConfig();
            if (config && this.completedStrokeCount >= config.strokesPerSend) {
                // Fire and forget
                this.sendSketch();
            }
        }
    }
}
