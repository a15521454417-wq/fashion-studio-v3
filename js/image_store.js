/**
 * image_store.js — IndexedDB 图片持久化存储
 * 
 * 功能：
 * 1. 原图存入 IndexedDB（刷新不丢失）
 * 2. Canvas 生成缩略图用于展示（省内存）
 * 3. 下载时取出无损原图
 * 4. 自动过期清理（默认 24 小时）
 */
const ImageStore = (() => {
  const DB_NAME = 'FashionStudioDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'images';
  const SESSION_STORE = 'sessions'; // 存生成批次记录
  const THUMB_MAX_WIDTH = 360;
  const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 小时过期

  let _db = null;

  // ==================== DB 初始化 ====================
  function openDB() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        // 图片存储：key = id, value = { id, blob, thumbBlob, mimeType, width, height, createdAt }
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        // 会话存储：key = sessionId, value = { id, prompt, tab, imageIds[], createdAt }
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          const store = db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ==================== 生成唯一 ID ====================
  function genId() {
    return 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function genSessionId() {
    return 'ses_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // ==================== 缩略图生成 ====================
  function createThumbnail(blob, maxW = THUMB_MAX_WIDTH) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const ratio = maxW / img.naturalWidth;
        const w = maxW;
        const h = Math.round(img.naturalHeight * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((thumbBlob) => {
          if (thumbBlob) resolve({ thumbBlob, width: img.naturalWidth, height: img.naturalHeight });
          else reject(new Error('缩略图生成失败'));
        }, 'image/webp', 0.8);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
      img.src = url;
    });
  }

  // ==================== 获取图片 Blob ====================
  function fetchBlob(src) {
    if (src.startsWith('data:')) {
      // base64 转 blob
      const parts = src.split(',');
      const mime = (parts[0].match(/:([^;]+);/) || [])[1] || 'image/png';
      const binary = atob(parts[1]);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      return Promise.resolve(new Blob([arr], { type: mime }));
    }
    return fetch(src).then(r => {
      if (!r.ok) throw new Error('fetch 失败: ' + r.status);
      return r.blob();
    });
  }

  // ==================== 核心：存储图片 ====================
  /**
   * 存入单张图片
   * @param {string} src - 图片 URL 或 base64
   * @returns {Promise<{id, thumbUrl, width, height}>}
   */
  async function saveImage(src) {
    const db = await openDB();
    const blob = await fetchBlob(src);
    const { thumbBlob, width, height } = await createThumbnail(blob);

    const id = genId();
    const thumbUrl = URL.createObjectURL(thumbBlob);

    const record = {
      id,
      blob,
      thumbBlob,
      mimeType: blob.type || 'image/png',
      width,
      height,
      createdAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve({ id, thumbUrl, width, height });
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ==================== 核心：存储一个生成批次 ====================
  /**
   * @param {Array<string>} imgSrcs - 图片 URL/base64 数组
   * @param {string} prompt - 使用的提示词
   * @param {string} tab - 所在 tab
   * @returns {Promise<{sessionId, images: Array}>}
   */
  async function saveSession(imgSrcs, prompt, tab) {
    const images = await Promise.all(imgSrcs.map(src => saveImage(src)));
    const sessionId = genSessionId();
    const db = await openDB();
    const session = {
      id: sessionId,
      prompt,
      tab,
      imageIds: images.map(img => img.id),
      createdAt: Date.now()
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, 'readwrite');
      tx.objectStore(SESSION_STORE).put(session);
      tx.oncomplete = () => resolve({ sessionId, images, prompt, tab });
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ==================== 读取缩略图 URL ====================
  async function getThumbUrl(imageId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(imageId);
      req.onsuccess = () => {
        const record = req.result;
        if (record && record.thumbBlob) {
          resolve(URL.createObjectURL(record.thumbBlob));
        } else {
          resolve(null);
        }
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ==================== 读取原图 Blob ====================
  async function getOriginalBlob(imageId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(imageId);
      req.onsuccess = () => resolve(req.result?.blob || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ==================== 获取所有会话（按时间倒序） ====================
  async function getAllSessions() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, 'readonly');
      const store = tx.objectStore(SESSION_STORE);
      const index = store.index('createdAt');
      const req = index.openCursor(null, 'prev'); // 倒序
      const sessions = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          sessions.push(cursor.value);
          cursor.continue();
        } else {
          resolve(sessions);
        }
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ==================== 获取最新一个会话（刷新后恢复） ====================
  async function getLatestSession() {
    const sessions = await getAllSessions();
    return sessions.length > 0 ? sessions[0] : null;
  }

  // ==================== 获取会话的完整图片数据 ====================
  async function getSessionImages(sessionId) {
    const db = await openDB();
    const session = await new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE, 'readonly');
      const req = tx.objectStore(SESSION_STORE).get(sessionId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
    if (!session) return null;

    const images = await Promise.all(
      session.imageIds.map(async (id) => {
        const tx2 = db.transaction(STORE_NAME, 'readonly');
        const record = await new Promise((res, rej) => {
          const r = tx2.objectStore(STORE_NAME).get(id);
          r.onsuccess = () => res(r.result);
          r.onerror = (e) => rej(e.target.error);
        });
        if (!record) return null;
        return {
          id: record.id,
          thumbUrl: URL.createObjectURL(record.thumbBlob),
          blob: record.blob,
          width: record.width,
          height: record.height
        };
      })
    );

    return {
      ...session,
      images: images.filter(Boolean)
    };
  }

  // ==================== 清理过期数据 ====================
  async function cleanup(maxAge = DEFAULT_TTL) {
    const db = await openDB();
    const cutoff = Date.now() - maxAge;

    // 清理过期图片
    const tx1 = db.transaction(STORE_NAME, 'readwrite');
    const store1 = tx1.objectStore(STORE_NAME);
    let cleanedImages = 0;
    await new Promise((resolve) => {
      const req = store1.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.value.createdAt < cutoff) {
            cursor.delete();
            cleanedImages++;
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });

    // 清理过期会话
    const tx2 = db.transaction(SESSION_STORE, 'readwrite');
    const store2 = tx2.objectStore(SESSION_STORE);
    let cleanedSessions = 0;
    await new Promise((resolve) => {
      const req = store2.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.value.createdAt < cutoff) {
            cursor.delete();
            cleanedSessions++;
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });

    return { cleanedImages, cleanedSessions };
  }

  // ==================== 清空所有数据 ====================
  async function clearAll() {
    const db = await openDB();
    const tx1 = db.transaction(STORE_NAME, 'readwrite');
    tx1.objectStore(STORE_NAME).clear();
    const tx2 = db.transaction(SESSION_STORE, 'readwrite');
    tx2.objectStore(SESSION_STORE).clear();
    await Promise.all([
      new Promise(r => { tx1.oncomplete = r; }),
      new Promise(r => { tx2.oncomplete = r; })
    ]);
  }

  // ==================== 获取存储统计 ====================
  async function getStats() {
    const db = await openDB();
    const sessions = await getAllSessions();
    const imageCount = sessions.reduce((sum, s) => sum + (s.imageIds?.length || 0), 0);
    return {
      sessionCount: sessions.length,
      imageCount,
      oldestSession: sessions[sessions.length - 1]?.createdAt || null,
      newestSession: sessions[0]?.createdAt || null
    };
  }

  // ==================== 公开 API ====================
  return {
    openDB,
    saveImage,
    saveSession,
    getThumbUrl,
    getOriginalBlob,
    getAllSessions,
    getLatestSession,
    getSessionImages,
    cleanup,
    clearAll,
    getStats,
    isAvailable: () => !!window.indexedDB
  };
})();
