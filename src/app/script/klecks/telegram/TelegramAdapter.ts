export class TelegramAdapter {
    static isTelegram(): boolean {
        return typeof window !== 'undefined' &&
               !!(window as any).Telegram &&
               !!(window as any).Telegram.WebApp;
    }

    static init(onSettingsClicked?: () => void) {
        if (this.isTelegram()) {
            const webApp = (window as any).Telegram.WebApp;
            webApp.ready();
            webApp.expand();
            if (webApp.SettingsButton) {
                webApp.SettingsButton.show();
            }
            if (onSettingsClicked && webApp.onEvent) {
                webApp.onEvent('settingsButtonClicked', onSettingsClicked);
            }

            // disable vertical swipes if supported
            if (webApp.disableVerticalSwipes) {
                try {
                    webApp.disableVerticalSwipes();
                } catch(e) {
                    console.warn(e);
                }
            }
        }
    }
}
