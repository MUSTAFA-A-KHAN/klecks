import { TELEGRAM_CONFIG } from '../../config/telegram-config';
import { canvasToBlob } from '../../bb/base/canvas';

export class TelegramSender {
    private isSending: boolean = false;

    /**
     * Sends the current canvas to a Telegram bot via the sendPhoto API.
     * @param canvas the HTMLCanvasElement representing the final image
     * @param onSuccess optional callback when successful
     * @param onError optional callback when error occurs
     */
    public async sendCanvasToTelegram(
        canvas: HTMLCanvasElement,
        onSuccess?: () => void,
        onError?: (err: string) => void,
    ): Promise<void> {
        if (!TELEGRAM_CONFIG.enabled) {
            console.log('Telegram auto-send is disabled.');
            return;
        }

        if (!TELEGRAM_CONFIG.botToken || !TELEGRAM_CONFIG.chatId) {
            console.warn('Telegram botToken or chatId is missing in config.');
            return;
        }

        if (this.isSending) {
            console.warn('Telegram send already in progress. Skipping...');
            return;
        }

        this.isSending = true;

        try {
            const blob = await canvasToBlob(canvas, 'image/png');
            const formData = new FormData();
            formData.append('chat_id', TELEGRAM_CONFIG.chatId);
            formData.append('photo', blob, 'sketch.png');

            const url = `https://api.telegram.org/bot${TELEGRAM_CONFIG.botToken}/sendPhoto`;

            const response = await fetch(url, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.description || `HTTP error! status: ${response.status}`);
            }

            console.log('Successfully sent sketch to Telegram.');
            onSuccess?.();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Failed to send sketch to Telegram:', msg);
            onError?.(msg);
        } finally {
            this.isSending = false;
        }
    }
}
