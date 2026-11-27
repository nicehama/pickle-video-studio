import type { MediaAsset, Project } from './types';

/**
 * 프로젝트 자동 저장 — IndexedDB에 프로젝트(JSON)와 업로드 파일(Blob)을 나눠 담는다.
 * IndexedDB를 못 쓰는 브라우저(사생활 보호 모드 등)에서는 localStorage에 프로젝트만 저장한다.
 */

const DB_NAME = 'pickle-studio';
const DB_VERSION = 1;
const KV = 'kv';
const ASSET_STORE = 'assets';
const LS_KEY = 'pickle-studio:project';

export interface StoredMeta {
  project: Project;
  savedAt: number;
  version: number;
}

export interface StoredAsset {
  id: string;
  name: string;
  mime: string;
  duration: number;
  blob: Blob;
}

interface KvRecord extends StoredMeta {
  key: 'current';
}

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
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let req: IDBRequest<T>;
    try {
      req = run(db.transaction(store, mode).objectStore(store));
    } catch (e) {
      reject(e);
      return;
    }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export const PROJECT_VERSION = 2;

export async function loadSaved(): Promise<StoredMeta | null> {
  const db = await openDb();
  if (db) {
    try {
      const rec = await tx<KvRecord | undefined>(db, KV, 'readonly', (s) => s.get('current') as IDBRequest<KvRecord | undefined>);
      db.close();
      if (rec?.project?.clips) return { project: rec.project, savedAt: rec.savedAt ?? 0, version: rec.version ?? 1 };
    } catch {
      db.close();
    }
  }
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMeta;
    if (!parsed?.project?.clips) return null;
    return { project: parsed.project, savedAt: parsed.savedAt ?? 0, version: parsed.version ?? 1 };
  } catch {
    return null;
  }
}

export async function saveProject(project: Project): Promise<number> {
  const savedAt = Date.now();
  const record: KvRecord = { key: 'current', project, savedAt, version: PROJECT_VERSION };
  const db = await openDb();
  if (db) {
    try {
      await tx(db, KV, 'readwrite', (s) => s.put(record) as IDBRequest<IDBValidKey>);
      db.close();
      return savedAt;
    } catch {
      db.close();
    }
  }
  window.localStorage.setItem(LS_KEY, JSON.stringify({ project, savedAt, version: PROJECT_VERSION }));
  return savedAt;
}

/** 업로드 파일은 통째로 담는다 — 용량이 크면 브라우저가 거절하므로 호출한 쪽에서 알린다 */
export async function saveAsset(asset: StoredAsset): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    await tx(db, ASSET_STORE, 'readwrite', (s) => s.put(asset) as IDBRequest<IDBValidKey>);
    db.close();
    return true;
  } catch {
    db.close();
    return false;
  }
}

export async function loadAssets(): Promise<StoredAsset[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const rows = await tx<StoredAsset[]>(db, ASSET_STORE, 'readonly', (s) => s.getAll() as IDBRequest<StoredAsset[]>);
    db.close();
    return rows ?? [];
  } catch {
    db.close();
    return [];
  }
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await tx(db, ASSET_STORE, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
    db.close();
  } catch {
    db.close();
  }
}

/** 프로젝트와 업로드 파일을 모두 지운다 (초기화) */
export async function clearAll(): Promise<void> {
  try {
    window.localStorage.removeItem(LS_KEY);
  } catch {
    /* 무시 */
  }
  const db = await openDb();
  if (!db) return;
  try {
    await tx(db, KV, 'readwrite', (s) => s.clear() as IDBRequest<undefined>);
    await tx(db, ASSET_STORE, 'readwrite', (s) => s.clear() as IDBRequest<undefined>);
    db.close();
  } catch {
    db.close();
  }
}

export function assetToStored(a: MediaAsset, blob: Blob, mime: string): StoredAsset {
  return { id: a.id, name: a.name, mime, duration: a.duration, blob };
}

export function formatSavedAt(at: number | null): string {
  if (!at) return '';
  const d = new Date(at);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const p = (n: number) => String(n).padStart(2, '0');
  return sameDay ? `${p(d.getHours())}:${p(d.getMinutes())}` : `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
