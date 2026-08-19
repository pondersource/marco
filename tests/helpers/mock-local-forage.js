import Service from '@ember/service';

/**
 * In-memory mock of the `localForage` service for tests. Uses per-store
 * `Map`s so tests stay isolated from real IndexedDB state and stay
 * deterministic.
 *
 * Mirrors the real service's interface: `get/set/remove/keys/clear/iterate`.
 */
export class MockLocalForageService extends Service {
  _stores = new Map();

  _store(name) {
    let store = this._stores.get(name);
    if (!store) {
      store = new Map();
      this._stores.set(name, store);
    }
    return store;
  }

  async get(storeName, key) {
    const store = this._store(storeName);
    return store.has(key) ? store.get(key) : null;
  }

  async set(storeName, key, value) {
    this._store(storeName).set(key, value);
    return value;
  }

  async remove(storeName, key) {
    this._store(storeName).delete(key);
  }

  async keys(storeName) {
    return [...this._store(storeName).keys()];
  }

  async clear(storeName) {
    this._store(storeName).clear();
  }

  async iterate(storeName, fn) {
    let result;
    let idx = 0;
    for (const [key, value] of this._store(storeName)) {
      result = fn(value, key, idx);
      idx++;
    }
    return result;
  }
}

export function setupLocalForageMock(hooks) {
  hooks.beforeEach(function () {
    this.owner.register('service:localForage', MockLocalForageService);
  });
}
