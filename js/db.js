/* La Cesta — almacenamiento local (IndexedDB) */
(function () {
  'use strict';

  const DB_NAME = 'la-cesta';
  const DB_VERSION = 1;
  const STORES = ['products', 'categories', 'meta'];

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('Tu navegador no permite guardar datos locales (IndexedDB).'));
        return;
      }
      let request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('products')) {
          const products = db.createObjectStore('products', { keyPath: 'id' });
          products.createIndex('categoriaId', 'categoriaId', { unique: false });
          products.createIndex('enLista', 'enLista', { unique: false });
          products.createIndex('catalogoId', 'catalogoId', { unique: false });
        }
        if (!db.objectStoreNames.contains('categories')) {
          const categories = db.createObjectStore('categories', { keyPath: 'id' });
          categories.createIndex('orden', 'orden', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('No se ha podido abrir la base de datos.'));
      request.onblocked = () => {
        reject(new Error('La base de datos está abierta en otra pestaña. Ciérrala y vuelve a intentarlo.'));
      };
    });
    return dbPromise;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Error de lectura.'));
    });
  }

  async function getAll(store) {
    const db = await open();
    return requestResult(db.transaction(store, 'readonly').objectStore(store).getAll());
  }

  async function get(store, key) {
    const db = await open();
    return requestResult(db.transaction(store, 'readonly').objectStore(store).get(key));
  }

  async function put(store, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error || new Error('No se ha podido guardar.'));
      tx.onabort = () => reject(tx.error || new Error('No se ha podido guardar.'));
    });
  }

  async function bulkPut(store, values) {
    if (!values || !values.length) return [];
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const objectStore = tx.objectStore(store);
      values.forEach((value) => objectStore.put(value));
      tx.oncomplete = () => resolve(values);
      tx.onerror = () => reject(tx.error || new Error('No se han podido guardar los datos.'));
      tx.onabort = () => reject(tx.error || new Error('No se han podido guardar los datos.'));
    });
  }

  async function remove(store, key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('No se ha podido eliminar.'));
      tx.onabort = () => reject(tx.error || new Error('No se ha podido eliminar.'));
    });
  }

  async function clear(store) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('No se han podido borrar los datos.'));
      tx.onabort = () => reject(tx.error || new Error('No se han podido borrar los datos.'));
    });
  }

  async function metaGet(key) {
    const row = await get('meta', key);
    return row ? row.value : undefined;
  }

  async function metaSet(key, value) {
    await put('meta', { key, value });
    return value;
  }

  async function metaGetAll() {
    const rows = await getAll('meta');
    const result = {};
    rows.forEach((row) => {
      result[row.key] = row.value;
    });
    return result;
  }

  async function replaceAll({ products = [], categories = [], meta = {} } = {}) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES, 'readwrite');
      tx.objectStore('products').clear();
      tx.objectStore('categories').clear();
      tx.objectStore('meta').clear();
      products.forEach((product) => tx.objectStore('products').put(product));
      categories.forEach((category) => tx.objectStore('categories').put(category));
      Object.keys(meta).forEach((key) => tx.objectStore('meta').put({ key, value: meta[key] }));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('No se han podido restaurar los datos.'));
      tx.onabort = () => reject(tx.error || new Error('No se han podido restaurar los datos.'));
    });
  }

  async function clearAll() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES, 'readwrite');
      STORES.forEach((store) => tx.objectStore(store).clear());
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('No se han podido borrar los datos.'));
      tx.onabort = () => reject(tx.error || new Error('No se han podido borrar los datos.'));
    });
  }

  async function storageInfo() {
    try {
      if (navigator.storage && typeof navigator.storage.estimate === 'function') {
        return await navigator.storage.estimate();
      }
    } catch (error) {
      /* sin información de almacenamiento */
    }
    return null;
  }

  window.CestaDB = {
    open,
    getAll,
    get,
    put,
    bulkPut,
    remove,
    clear,
    metaGet,
    metaSet,
    metaGetAll,
    replaceAll,
    clearAll,
    storageInfo,
  };
})();
