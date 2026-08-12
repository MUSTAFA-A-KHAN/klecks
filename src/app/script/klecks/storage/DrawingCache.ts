export class DrawingCache {
    private static DB_NAME = "DrawingCacheDB";
    private static DB_VERSION = 5;
    private static STORE_LAYER = "layerCaches";
    private static STORE_TEXTURE = "textureCaches";

    private db: IDBDatabase | null = null;

    async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DrawingCache.DB_NAME, DrawingCache.DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
                const target = e.target as IDBOpenDBRequest;
                const db = target.result;

                if (!db.objectStoreNames.contains(DrawingCache.STORE_LAYER)) {
                    const store = db.createObjectStore(DrawingCache.STORE_LAYER, { keyPath: "id", autoIncrement: true });
                    store.createIndex("game_layer_cache", ["gameId", "layerId", "cacheId"], { unique: false });
                    store.createIndex("timestamp", "timestamp", { unique: false });
                }

                if (!db.objectStoreNames.contains(DrawingCache.STORE_TEXTURE)) {
                    db.createObjectStore(DrawingCache.STORE_TEXTURE, { keyPath: "id" });
                }
            };
        });
    }

    async saveLayerSnapshot(gameId: string, layerId: string, cacheId: string, data: Blob): Promise<void> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(DrawingCache.STORE_LAYER, 'readwrite');
            const store = tx.objectStore(DrawingCache.STORE_LAYER);
            store.add({
                gameId,
                layerId,
                cacheId,
                data,
                timestamp: Date.now()
            });
            tx.oncomplete = () => {
                this.cleanupOldCaches().then(resolve).catch(reject);
            };
            tx.onerror = () => reject(tx.error);
        });
    }

    async getLayerSnapshot(gameId: string, layerId: string, cacheId: string): Promise<Blob | null> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(DrawingCache.STORE_LAYER, 'readonly');
            const store = tx.objectStore(DrawingCache.STORE_LAYER);
            const index = store.index("game_layer_cache");
            const request = index.get([gameId, layerId, cacheId]);

            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result.data);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    private async cleanupOldCaches(): Promise<void> {
        // Simple bounded cache cleanup: Keep last 50 entries
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(DrawingCache.STORE_LAYER, 'readwrite');
            const store = tx.objectStore(DrawingCache.STORE_LAYER);
            const index = store.index("timestamp");
            const request = index.openCursor(null, "prev"); // newest first

            let count = 0;
            request.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
                if (cursor) {
                    count++;
                    if (count > 50) {
                        cursor.delete();
                    }
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Similar structure would go here for texture caching if we needed offline textures.
}

export const drawingCache = new DrawingCache();
