import { TelegramConfig } from './telegram.types';

export class TelegramConfigLoader {
    private static instance: TelegramConfig | null = null;
    private static isLoaded = false;
    private static isLoading = false;

    static async getConfig(): Promise<TelegramConfig | null> {
        if (this.isLoaded) {
            return this.instance;
        }
        if (this.isLoading) {
            // Very simplistic handling for concurrent loads if any
            while (this.isLoading) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            return this.instance;
        }

        this.isLoading = true;
        try {
            // For now, in a local development environment, we fetch the config file.
            // When moving to production this might change to env vars or server-side config.
            const response = await fetch('/config/telegram.json');
            if (!response.ok) {
                console.warn('Telegram configuration not found. Copy config/telegram.example.json to config/telegram.json and configure your Telegram bot token and chat ID.');
                this.isLoaded = true;
                this.isLoading = false;
                return null;
            }

            const data = await response.json();

            if (!data.botToken || typeof data.botToken !== 'string' || data.botToken.trim() === '') {
                console.warn('Telegram configuration invalid: missing or empty botToken.');
                this.isLoaded = true;
                this.isLoading = false;
                return null;
            }

            if (!data.chatId || typeof data.chatId !== 'string' || data.chatId.trim() === '') {
                console.warn('Telegram configuration invalid: missing or empty chatId.');
                this.isLoaded = true;
                this.isLoading = false;
                return null;
            }

            const strokesPerSend = parseInt(data.strokesPerSend, 10);
            if (isNaN(strokesPerSend) || strokesPerSend <= 0) {
                console.warn('Telegram configuration invalid: strokesPerSend must be a positive integer.');
                this.isLoaded = true;
                this.isLoading = false;
                return null;
            }

            this.instance = {
                botToken: data.botToken.trim(),
                chatId: data.chatId.trim(),
                strokesPerSend: strokesPerSend
            };
        } catch (e) {
            console.warn('Failed to load Telegram configuration. Make sure config/telegram.json is valid JSON.');
        } finally {
            this.isLoaded = true;
            this.isLoading = false;
        }

        return this.instance;
    }
}
