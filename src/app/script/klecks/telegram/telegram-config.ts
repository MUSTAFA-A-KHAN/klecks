import { TelegramConfig } from './telegram.types';

export class TelegramConfigLoader {
    static getConfig(): TelegramConfig {
        return {
            botToken: '8541864026:AAGk8JDvZJFp1YcAxOojlKDZzTuvyaL_S0c',
            chatId: '1006461736',
            strokesPerSend: 5
        };
    }
}