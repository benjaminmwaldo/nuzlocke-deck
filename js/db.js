/* IndexedDB helper — stores ROMs, docs, runs, api cache */
const DB = (() => {
  const NAME = "nuzlocke-deck", VER = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const rq = indexedDB.open(NAME, VER);
      rq.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("roms")) db.createObjectStore("roms", { keyPath: "id" });
        if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "id" });
        if (!db.objectStoreNames.contains("runs")) db.createObjectStore("runs", { keyPath: "id" });
        if (!db.objectStoreNames.contains("api")) db.createObjectStore("api", { keyPath: "url" });
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => res(out && out._v !== undefined ? out._v : out);
      t.onerror = () => rej(t.error);
    });
  }

  function reqval(rq) { const o = {}; rq.onsuccess = () => o._v = rq.result; return o; }

  return {
    put: (store, obj) => tx(store, "readwrite", s => s.put(obj)),
    get: (store, key) => tx(store, "readonly", s => reqval(s.get(key))),
    del: (store, key) => tx(store, "readwrite", s => s.delete(key)),
    all: (store) => tx(store, "readonly", s => reqval(s.getAll())),
  };
})();
