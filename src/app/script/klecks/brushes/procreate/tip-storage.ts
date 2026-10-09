import { TProcreateProfile } from './brush-profile';

export type TSavedTip = {
    id: string; name: string; spacing: number; image: string;
    grain?: string; profile?: TProcreateProfile; unhandled?: string[];
    /** Original bytes retained for improved importers; old tip-only records remain valid. */
    source?: { archive: Uint8Array; shape: Uint8Array; grain?: Uint8Array;
        secondary?: { archive: Uint8Array; shape?: Uint8Array; grain?: Uint8Array } };
};

function database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        let blocked = false;
        const request = indexedDB.open('klecks-imported-brushes', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('tips', { keyPath: 'id' });
        request.onsuccess = () => {
            if (blocked) request.result.close();
            else resolve(request.result);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
            blocked = true;
            reject(new Error('Brush storage is blocked'));
        };
    });
}

export async function loadTips(): Promise<TSavedTip[]> {
    const db = await database();
    try {
        return await new Promise<TSavedTip[]>((resolve, reject) => {
            const request = db.transaction('tips').objectStore('tips').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } finally { db.close(); }
}

export async function saveTips(tips: TSavedTip[], removeId?: string): Promise<void> {
    const db = await database();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('tips', 'readwrite');
            const store = tx.objectStore('tips');
            tips.forEach((tip) => store.put(tip));
            if (removeId) store.delete(removeId);
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
            tx.onerror = () => reject(tx.error);
        });
    } finally { db.close(); }
}
