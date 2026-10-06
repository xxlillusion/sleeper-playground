/* Raw Sleeper responses in IndexedDB. This is the SAME database the explorer page uses (explorer/index.html, "response cache"),
   so a season loaded on either page is served from disk on the other. Keep the name, version and record shape identical. */

export interface CacheRecord { path: string; data: unknown; bytes: number; at: number }

let dbP: Promise<IDBDatabase | null> | undefined;
const db = () => (dbP ??= new Promise(res => {
  try {
    const rq = indexedDB.open("sleeper_cache", 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore("responses", { keyPath: "path" });
    rq.onsuccess = () => res(rq.result);
    rq.onerror = rq.onblocked = () => res(null);
  } catch { res(null); }
}));

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return db().then(d => d && new Promise<T | null>(res => {
    try {
      const rq = fn(d.transaction("responses", mode).objectStore("responses"));
      rq.onsuccess = () => res(rq.result ?? null);
      rq.onerror = () => res(null);
    } catch { res(null); }
  }));
}

export const cacheGet = (path: string) => run<CacheRecord>("readonly", s => s.get(path) as IDBRequest<CacheRecord>);
export const cachePut = (rec: CacheRecord) => run("readwrite", s => s.put(rec)).then(() => undefined);
export const cacheClear = () => run("readwrite", s => s.clear()).then(() => undefined);
export const cacheCount = () => run<number>("readonly", s => s.count());
