export class TextureManager {
    private static cache = new Map<string, HTMLImageElement>();
    private static loading = new Map<string, Promise<HTMLImageElement>>();

    // Map the short names from extracted_brushes.json to full asset URLs
    private static textureUrls: Record<string, string> = {
        'waterAi': 'water-ai-400.png',
        'waterAi-l': 'water-ai-400-l.png',
        'basic': 'pencil-150.png',
        'fabric': 'fabric.png',
        'paper': 'paper.png',
        'paper-l': 'paper-l.png',
        'natural-paper': 'natural-paper.png',
        'natural-paper-l2': 'natural-paper-l2.png',
        'diagonal-striped-brick': 'diagonal-striped-brick.png',
        'graphite': 'graphite-250.png'
    };

    static async getTexture(name: string): Promise<HTMLImageElement | null> {
        if (this.cache.has(name)) {
            return this.cache.get(name)!;
        }

        if (this.loading.has(name)) {
            return this.loading.get(name)!;
        }

        const url = this.textureUrls[name];
        if (!url) {
            console.warn(`Texture ${name} not found in manifest.`);
            return null;
        }

        const promise = new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                this.cache.set(name, img);
                this.loading.delete(name);
                resolve(img);
            };
            img.onerror = (e) => {
                this.loading.delete(name);
                console.warn(`Failed to load texture ${name} from ${url}`);
                reject(e);
            };
            // Since we don't have the assets in repo, fallback gracefully or use placeholder.
            // Ideally we'd host these in dist/ or assets/
            img.src = '/assets/' + url;
        }).catch(() => null);

        this.loading.set(name, promise as Promise<HTMLImageElement>);
        return promise;
    }
}
