import { TelegramConfigLoader } from './telegram-config';

export class TelegramService {

    // We only need the canvas Blob.
    static async sendSketch(canvasBlob: Blob, strokeCount: number): Promise<boolean> {
        const config = await TelegramConfigLoader.getConfig();
        if (!config) {
            return false;
        }

        const formData = new FormData();
        formData.append('chat_id', config.chatId);
        formData.append('photo', canvasBlob, 'sketch.png');
        formData.append('caption', `Klecks sketch — ${strokeCount} strokes`);

        try {
            const url = `https://api.telegram.org/bot${config.botToken}/sendPhoto`;
            const response = await fetch(url, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                console.warn(`Telegram API error: ${response.status} ${response.statusText}`);
                return false;
            }

            const json = await response.json();
            if (!json.ok) {
                console.warn('Telegram API response indicated failure.');
                return false;
            }

            return true;
        } catch (e) {
            console.warn('Network error while sending sketch to Telegram.');
            return false;
        }
    }
}
