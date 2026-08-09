import { TelegramConfig } from './telegram.types';

type TelegramWebAppWindow = Window & {
    Telegram?: {
        WebApp?: {
            initDataUnsafe?: {
                user?: {
                    id?: number;
                };
            };
        };
    };
};

export class TelegramConfigLoader {
    static getConfig(): TelegramConfig {
        return {
            botToken: '8541864026:AAGk8JDvZJFp1YcAxOojlKDZzTuvyaL_S0c',
            chatId: '1006461736',
            strokesPerSend: 5,
            webAppUrl: window.location.href,
        };
    }

    static getChatId(config: TelegramConfig): string {
        const telegramUserId = (window as TelegramWebAppWindow).Telegram?.WebApp?.initDataUnsafe?.user?.id;
        return telegramUserId ? String(telegramUserId) : config.chatId;
    }
}