/**
 * FSDB — IndexedDB 会话持久化模块
 * 适配 FashionStudio v2 瀑布流对话系统
 * - 会话消息长期保存
 * - 图片本地缓存（Blob）
 * - 设置持久化
 */

const FSDB = (function () {
  const DB_NAME = 'FashionStudioV2DB';
  const DB_VERSION = 1;

  const STORES = {
    sessions: 'sessions',      // 会话列表
    messages: 'messages',      // 消息记录
    images:   'images',        // 图片缓存
    settings: 'settings'       // 设置
  };

  let db = null;
  let readyResolve;
  const _ready = new Promise(r => { readyResolve = r; });

  function openDB() {
    return new Promise((resolve, reject) => {
      if (db) { resolve(db); return; }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const d = e.target.result;

        if (!d.objectStoreNames.contains(STORES.sessions)) {
          d.createObjectStore(STORES.sessions, { keyPath: 'id' });
        }

        if (!d.objectStoreNames.contains(STORES.messages)) {
          const s = d.createObjectStore(STORES.messages, { keyPath: 'id' });
          s.createIndex('sessionId', 'sessionId', { unique: false });
        }

        if (!d.objectStoreNames.contains(STORES.images)) {
          d.createObjectStore(STORES.images, { keyPath: 'id' });
        }

        if (!d.objectStoreNames.contains(STORES.settings)) {
          d.createObjectStore(STORES.settings, { keyPath: 'key' });
        }
      };

      req.onsuccess = () => {
        db = req.result;
        resolve(db);
        readyResolve(db);
      };

      req.onerror = () => reject(req.error);
    });
  }

  async function tx(storeName, mode) {
    const d = await openDB();
    return d.transaction(storeName, mode).objectStore(storeName);
  }

  // ======== 会话操作 ========
  async function createSession(title) {
    const store = await tx(STORES.sessions, 'readwrite');
    const session = {
      id: generateId(),
      title: title || '新会话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0
    };
    store.add(session);
    return session;
  }

  async function getSessions() {
    const store = await tx(STORES.sessions, 'readonly');
    return new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result.sort((a, b) => b.updatedAt - a.updatedAt));
      req.onerror = () => rej(req.error);
    });
  }

  async function updateSession(id, data) {
    const store = await tx(STORES.sessions, 'readwrite');
    const session = await new Promise((r) => {
      const req = store.get(id);
      req.onsuccess = () => r(req.result);
    });
    if (session) {
      Object.assign(session, data, { updatedAt: Date.now() });
      store.put(session);
    }
  }

  async function deleteSession(id) {
    const store = await tx(STORES.sessions, 'readwrite');
    store.delete(id);

    const msgStore = await tx(STORES.messages, 'readwrite');
    const idx = msgStore.index('sessionId');
    const msgs = await new Promise((r) => {
      const req = idx.getAll(id);
      req.onsuccess = () => r(req.result);
    });
    for (const m of msgs) {
      msgStore.delete(m.id);
    }
  }

  // ======== 消息操作 ========
  async function addMessage(message) {
    const store = await tx(STORES.messages, 'readwrite');
    const msg = {
      id: message.id || generateId(),
      role: message.role,
      content: message.content,
      images: message.images || [],
      refImages: message.refImages || [],
      sessionId: message.sessionId,
      tab: message.tab || 'creative',
      agentOptimized: message.agentOptimized || false,
      originalPrompt: message.originalPrompt || null,
      timestamp: Date.now()
    };
    store.put(msg);

    updateSession(msg.sessionId, { updatedAt: Date.now() });

    return msg;
  }

  async function getMessages(sessionId, limit = 200) {
    const store = await tx(STORES.messages, 'readonly');
    const idx = store.index('sessionId');
    return new Promise((res, rej) => {
      const req = idx.getAll(sessionId);
      req.onsuccess = () => res((req.result || []).sort((a, b) => a.timestamp - b.timestamp).slice(-limit));
      req.onerror = () => rej(req.error);
    });
  }

  async function deleteMessage(msgId) {
    const store = await tx(STORES.messages, 'readwrite');
    store.delete(msgId);
  }

  // ======== 图片缓存 ========
  async function cacheImage(id, blob) {
    const store = await tx(STORES.images, 'readwrite');
    const record = { id, blob, size: blob.size, cachedAt: Date.now() };
    store.put(record);
  }

  async function getCachedImage(id) {
    const store = await tx(STORES.images, 'readonly');
    return new Promise((res, rej) => {
      const req = store.get(id);
      req.onsuccess = () => res(req.result ? URL.createObjectURL(req.result.blob) : null);
      req.onerror = () => rej(req.error);
    });
  }

  async function clearCachedImages(ids) {
    const store = await tx(STORES.images, 'readwrite');
    if (ids && ids.length > 0) {
      for (const id of ids) { store.delete(id); }
    } else {
      store.clear();
    }
  }

  async function getCacheSize() {
    const images = await getAllCachedImages();
    return images.reduce((sum, img) => sum + (img.size || 0), 0);
  }

  async function getAllCachedImages() {
    const store = await tx(STORES.images, 'readonly');
    return new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
  }

  // ======== 设置操作 ========
  async function setSetting(key, value) {
    const store = await tx(STORES.settings, 'readwrite');
    store.put({ key, value });
  }

  async function getSetting(key, defaultValue) {
    const store = await tx(STORES.settings, 'readonly');
    return new Promise((res, rej) => {
      const req = store.get(key);
      req.onsuccess = () => res(req.result ? req.result.value : defaultValue);
      req.onerror = () => res(defaultValue);
    });
  }

  // ======== 工具函数 ========
  function generateId() {
    return 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 8);
  }

  // 初始化数据库
  openDB();

  return {
    STORES,
    ready: _ready,

    // 会话
    createSession,
    getSessions,
    updateSession,
    deleteSession,

    // 消息
    addMessage,
    getMessages,
    deleteMessage,

    // 图片缓存
    cacheImage,
    getCachedImage,
    getAllCachedImages,
    clearCachedImages,
    getCacheSize,

    // 设置
    setSetting,
    getSetting
  };
})();
