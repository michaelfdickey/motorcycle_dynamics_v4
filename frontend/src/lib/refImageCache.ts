/**
 * Local-only cache for the Geometry Layout tracing photo.
 * The bitmap is never written into vehicle JSON.
 */

const DB_NAME = 'motorcycle_frame_layout';
const STORE = 'refImages';
const KEY = 'current';

export interface CachedRefImage {
	fileName: string;
	blob: Blob;
	savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function saveRefImageBlob(fileName: string, blob: Blob): Promise<void> {
	try {
		const db = await openDb();
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).put({ fileName, blob, savedAt: Date.now() }, KEY);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();
	} catch {
		/* quota / private mode — tracing still works for this session */
	}
}

export async function loadRefImageBlob(): Promise<CachedRefImage | null> {
	try {
		const db = await openDb();
		const result = await new Promise<CachedRefImage | null>((resolve, reject) => {
			const tx = db.transaction(STORE, 'readonly');
			const req = tx.objectStore(STORE).get(KEY);
			req.onsuccess = () => resolve((req.result as CachedRefImage) ?? null);
			req.onerror = () => reject(req.error);
		});
		db.close();
		return result;
	} catch {
		return null;
	}
}

export async function clearRefImageBlob(): Promise<void> {
	try {
		const db = await openDb();
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).delete(KEY);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();
	} catch {
		/* ignore */
	}
}
