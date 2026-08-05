// Captures live in IndexedDB on the device. Nothing is uploaded anywhere.

const DB_NAME = "timestamp-camera";
const DB_VERSION = 1;
const STORE = "captures";

export type CaptureKind = "photo" | "video";

export interface CaptureRecord {
  id: string;
  kind: CaptureKind;
  blob: Blob;
  /** small JPEG data URL for the gallery grid */
  thumb: string;
  filename: string;
  createdAt: number;
  width: number;
  height: number;
  durationMs?: number;
  /** the stamp text as burnt in, handy for searching later */
  stampText: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

export function addCapture(record: CaptureRecord): Promise<IDBValidKey> {
  return tx("readwrite", (store) => store.add(record));
}

export async function listCaptures(): Promise<CaptureRecord[]> {
  const all = await tx<CaptureRecord[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt); // newest first
}

export function deleteCapture(id: string): Promise<undefined> {
  return tx("readwrite", (store) => store.delete(id));
}

export function clearCaptures(): Promise<undefined> {
  return tx("readwrite", (store) => store.clear());
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
