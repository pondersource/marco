import localforage from 'localforage';
import Service from '@ember/service';

const DB_NAME = 'marco';

/**
 * Thin async-only wrapper around `localforage` that exposes namespaced
 * object stores under a single IndexedDB database (`marco`).
 *
 * Each "store" is a `localforage` instance created with a unique
 * `storeName`, so callers can keep data isolated (e.g. OSM cache vs.
 * contributions name cache) without managing their own connections.
 *
 * All methods return Promises — IndexedDB is inherently async, so callers
 * must `await` every read/write.
 */
export default class LocalForageService extends Service {
  _instances = new Map();

  _instance(storeName) {
    let instance = this._instances.get(storeName);
    if (!instance) {
      instance = localforage.createInstance({
        name: DB_NAME,
        storeName,
      });
      this._instances.set(storeName, instance);
    }
    return instance;
  }

  async get(storeName, key) {
    return this._instance(storeName).getItem(key);
  }

  async set(storeName, key, value) {
    return this._instance(storeName).setItem(key, value);
  }

  async remove(storeName, key) {
    return this._instance(storeName).removeItem(key);
  }

  async keys(storeName) {
    return this._instance(storeName).keys();
  }

  async clear(storeName) {
    return this._instance(storeName).clear();
  }

  async iterate(storeName, fn) {
    return this._instance(storeName).iterate(fn);
  }
}
