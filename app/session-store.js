const DB_NAME = 'whisper-hands';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;

export class SessionStore {
  constructor(indexedDB = globalThis.indexedDB) {
    this.indexedDB = indexedDB;
    this.databasePromise = null;
  }

  open() {
    if (!this.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable'));
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
          store.createIndex('savedAt', 'savedAt');
          store.createIndex('templateId', 'templateId');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('failed to open IndexedDB'));
    });
    return this.databasePromise;
  }

  async save(record) {
    return this.request('readwrite', (store) => store.put(record));
  }

  async get(sessionId) {
    return this.request('readonly', (store) => store.get(sessionId));
  }

  async list() {
    const records = await this.request('readonly', (store) => store.getAll());
    return records.sort((left, right) => Number(right.savedAt || 0) - Number(left.savedAt || 0));
  }

  async delete(sessionId) {
    return this.request('readwrite', (store) => store.delete(sessionId));
  }

  async request(mode, operation) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
    });
  }
}
