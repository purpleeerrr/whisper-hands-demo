// storage.js — IndexedDB 存储层
// 数据库名 whisper_hands，store 名 sessions，主键 id
// 所有函数返回 Promise，Blob 直接存储不转 base64

const DB_NAME = "whisper_hands";
const DB_VERSION = 1;
const STORE = "sessions";

let cachedDB = null;      // 复用连接，避免每次都 open
let openPromise = null;   // 并发打开去重

export function openDB() {
  if (cachedDB) return Promise.resolve(cachedDB);
  if (openPromise) return openPromise;

  openPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      cachedDB = req.result;
      // 连接意外关闭时清缓存，下次可重连
      cachedDB.onclose = () => { cachedDB = null; };
      cachedDB.onerror = () => { cachedDB = null; };
      openPromise = null;
      resolve(cachedDB);
    };
    req.onerror = () => {
      openPromise = null;
      cachedDB = null;
      reject(req.error);
    };
    req.onblocked = () => {
      console.warn("[Storage] IndexedDB 被旧版本页面阻塞，请关闭其它标签页");
    };
  });

  return openPromise;
}

export async function saveSession(session) {
  const db = await openDB();
  session.updatedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(session);
    tx.oncomplete = () => resolve(session);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllSessions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getSession(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSession(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// 向会话追加一个文件（截图/录音/录像/标记）
// fileData: { type: "image"|"video"|"audio"|"marker", blob: Blob, note?, transcript?, visualChange? }
export async function addFile(sessionId, fileData) {
  const session = await getSession(sessionId);
  if (!session) throw new Error("Session not found: " + sessionId);
  if (!session.files) session.files = [];

  const now = Date.now();
  const file = {
    id: "f_" + now + "_" + Math.random().toString(36).slice(2, 6),
    type: fileData.type || "marker",
    blob: fileData.blob || null,
    timestamp: now,
    elapsedSeconds: session.createdAt
      ? Math.round((now - session.createdAt) / 1000)
      : 0,
    note: fileData.note || "",
    transcript: fileData.transcript || "",
    visualChange: fileData.visualChange || "",
    mode: fileData.mode || session.mode || "explore"
  };
  session.files.push(file);
  await saveSession(session);
  return file;
}
