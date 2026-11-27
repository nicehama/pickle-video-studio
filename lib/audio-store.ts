/**
 * 생성된 성우·효과음 오디오를 브라우저에 보관하는 작은 저장소.
 * 같은 문장·같은 프롬프트는 다시 생성하지 않고 이 캐시를 재사용해 크레딧을 아낀다.
 * IndexedDB를 못 쓰는 환경에서는 메모리 캐시만 쓴다.
 */

const DB_NAME = 'pickle-studio-audio';
const DB_VERSION = 1;
const STORE = 'clips';

export interface StoredAudio {
  key: string;
  blob: Blob;
  provider: string;
  at: number;
}

const mem = new Map<string, StoredAudio>();

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let req: IDBRequest<T>;
    try {
      req = fn(db.transaction(STORE, mode).objectStore(STORE));
    } catch (e) {
      reject(e);
      return;
    }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb error'));
  });
}

export async function readAudio(key: string): Promise<StoredAudio | null> {
  const hit = mem.get(key);
  if (hit) return hit;
  const db = await openDb();
  if (!db) return null;
  try {
    const row = await run<StoredAudio | undefined>(db, 'readonly', (s) => s.get(key) as IDBRequest<StoredAudio | undefined>);
    db.close();
    if (row?.blob) {
      mem.set(key, row);
      return row;
    }
    return null;
  } catch {
    try {
      db.close();
    } catch {
      /* noop */
    }
    return null;
  }
}

export async function writeAudio(key: string, blob: Blob, provider: string): Promise<void> {
  const record: StoredAudio = { key, blob, provider, at: Date.now() };
  mem.set(key, record);
  const db = await openDb();
  if (!db) return;
  try {
    await run(db, 'readwrite', (s) => s.put(record) as IDBRequest<IDBValidKey>);
    db.close();
  } catch {
    try {
      db.close();
    } catch {
      /* noop */
    }
  }
}

export function clearAudioCacheMemory() {
  mem.clear();
}
