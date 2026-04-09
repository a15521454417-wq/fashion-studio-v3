/**
 * Fashion Studio - IndexedDB 存储模块
 * 历史记录 + 图片本地缓存
 */

const DB_NAME = 'fashion_studio_db';
const DB_VERSION = 1;

// 存储桶名称
const STORES = {
  history: 'chat_history',      // 对话历史
  images: 'cached_images'       // 图片缓存
};

class FashionStudioDB {
  constructor() {
    this.db = null;
    this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 对话历史存储
        if (!db.objectStoreNames.contains(STORES.history)) {
          const historyStore = db.createObjectStore(STORES.history, { keyPath: 'id', autoIncrement: true });
          historyStore.createIndex('timestamp', 'timestamp', { unique: false });
          historyStore.createIndex('sessionId', 'sessionId', { unique: false });
        }

        // 图片缓存存储
        if (!db.objectStoreNames.contains(STORES.images)) {
          const imagesStore = db.createObjectStore(STORES.images, { keyPath: 'id', autoIncrement: true });
          imagesStore.createIndex('timestamp', 'timestamp', { unique: false });
          imagesStore.createIndex('historyId', 'historyId', { unique: false });
        }
      };
    });
  }

  // ============ 对话历史操作 ============

  /**
   * 保存对话消息
   * @param {string} sessionId - 会话ID
   * @param {object} message - 消息对象 { type: 'user'|'ai', content, images?, prompt? }
   */
  async saveMessage(sessionId, message) {
    const record = {
      sessionId,
      type: message.type,
      content: message.content || '',
      images: message.images || [],
      prompt: message.prompt || '',  // 原始提示词
      model: message.model || '',
      timestamp: Date.now()
    };

    return this.add(STORES.history, record);
  }

  /**
   * 获取会话的所有消息
   * @param {string} sessionId - 会话ID
   */
  async getSessionMessages(sessionId) {
    return this.getAllByIndex(STORES.history, 'sessionId', sessionId);
  }

  /**
   * 获取所有会话列表（按时间倒序）
   */
  async getAllSessions() {
    const all = await this.getAll(STORES.history);
    // 按 sessionId 分组，取每个会话的第一条消息作为预览
    const sessions = {};
    all.forEach(msg => {
      if (!sessions[msg.sessionId]) {
        sessions[msg.sessionId] = {
          sessionId: msg.sessionId,
          preview: msg.content?.substring(0, 50) || msg.prompt?.substring(0, 50) || '新对话',
          timestamp: msg.timestamp,
          messageCount: 0
        };
      }
      sessions[msg.sessionId].messageCount++;
    });

    return Object.values(sessions).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 删除整个会话
   */
  async deleteSession(sessionId) {
    const messages = await this.getSessionMessages(sessionId);
    const tx = this.db.transaction([STORES.history, STORES.images], 'readwrite');

    // 删除历史消息
    const historyStore = tx.objectStore(STORES.history);
    for (const msg of messages) {
      historyStore.delete(msg.id);
    }

    // 删除关联的图片
    const imagesStore = tx.objectStore(STORES.images);
    const imageIndex = imagesStore.index('historyId');
    const imageRequest = imageIndex.getAllKeys(sessionId);
    imageRequest.onsuccess = () => {
      imageRequest.result.forEach(key => imagesStore.delete(key));
    };

    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * 清理所有历史
   */
  async clearAllHistory() {
    return this.clearStore(STORES.history);
  }

  // ============ 图片缓存操作 ============

  /**
   * 缓存图片
   * @param {string} historyId - 关联的历史消息ID
   * @param {string} imageUrl - 原始图片URL
   * @param {Blob} blob - 图片二进制数据
   * @param {object} metadata - 元数据 { width, height, size }
   */
  async cacheImage(historyId, imageUrl, blob, metadata = {}) {
    const record = {
      historyId,
      originalUrl: imageUrl,
      blob: blob,
      width: metadata.width || 0,
      height: metadata.height || 0,
      size: blob.size,
      timestamp: Date.now()
    };

    const id = await this.add(STORES.images, record);
    return id;
  }

  /**
   * 获取缓存的图片 Blob
   */
  async getCachedImage(id) {
    return this.get(STORES.images, id);
  }

  /**
   * 获取缓存的图片 URL（带过期检查）
   */
  async getCachedImageUrl(id) {
    const record = await this.get(STORES.images, id);
    if (record && record.blob) {
      return URL.createObjectURL(record.blob);
    }
    return null;
  }

  /**
   * 删除单张缓存图片
   */
  async deleteCachedImage(id) {
    return this.delete(STORES.images, id);
  }

  /**
   * 清理所有图片缓存
   */
  async clearAllImages() {
    return this.clearStore(STORES.images);
  }

  /**
   * 获取缓存统计
   */
  async getCacheStats() {
    const images = await this.getAll(STORES.images);
    const history = await this.getAll(STORES.history);

    let totalSize = 0;
    images.forEach(img => totalSize += img.size || 0);

    return {
      imageCount: images.length,
      historyCount: history.length,
      sessionCount: new Set(history.map(h => h.sessionId)).size,
      totalCacheSize: totalSize,
      formattedSize: this.formatBytes(totalSize)
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ============ 通用操作 ============

  add(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.add(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  put(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  get(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  getAllByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  clearStore(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// 导出单例
const fsDB = new FashionStudioDB();
