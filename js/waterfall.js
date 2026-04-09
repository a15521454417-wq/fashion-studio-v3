/**
 * Fashion Studio - 瀑布流对话界面
 */

// 简单的 Toast 实现
function showToast(msg, type = 'default') {
  const container = document.getElementById('toastContainer');
  if (!container) {
    alert(msg);
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

class WaterfallView {
  constructor() {
    this.db = fsDB;
    this.currentSessionId = this.getOrCreateSessionId();
    this.messages = [];
    this.isAgentEnabled = false;
    this.selectedImageCount = 2;
    this.referenceImages = [];
    this.isLoading = false;

    this.init();
  }

  init() {
    this.createDOM();
    this.bindEvents();
    this.loadSession();
    this.updateCacheStatus();
  }

  getOrCreateSessionId() {
    let sessionId = sessionStorage.getItem('wf_session_id');
    if (!sessionId) {
      sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('wf_session_id', sessionId);
    }
    return sessionId;
  }

  createDOM() {
    const container = document.createElement('div');
    container.id = 'waterfallView';
    container.className = 'waterfall-overlay';
    container.innerHTML = this.getTemplate();
    document.body.appendChild(container);

    this.elements = {
      container: container,
      header: container.querySelector('.wf-header'),
      content: container.querySelector('.wf-content'),
      inputArea: container.querySelector('.wf-input-area'),
      textarea: container.querySelector('.wf-textarea'),
      sendBtn: container.querySelector('.wf-send-btn'),
      agentToggle: container.querySelector('.wf-agent-toggle'),
      countBtns: container.querySelectorAll('.wf-count-btn'),
      refSection: container.querySelector('.wf-ref-section'),
      refAdd: container.querySelector('.wf-ref-add'),
      refInput: container.querySelector('#wfRefInput'),
      settingsPanel: container.querySelector('.wf-settings-panel'),
      sessionsPanel: container.querySelector('.wf-sessions-panel'),
    };
  }

  getTemplate() {
    return `
      <!-- 主视图 -->
      <header class="wf-header">
        <div class="wf-header__left">
          <button class="wf-header__back" id="wfBackBtn" title="返回">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <h1 class="wf-header__title">对话</h1>
          <span class="wf-header__subtitle" id="wfSessionSub">新对话</span>
        </div>
        <div class="wf-header__right">
          <div class="wf-cache-status" id="wfCacheStatus">
            <span class="wf-cache-status__dot"></span>
            <span class="wf-cache-status__text">加载中...</span>
          </div>
          <button class="wf-header__btn" id="wfSessionsBtn" title="会话列表">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          <button class="wf-header__btn" id="wfSettingsBtn" title="设置">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      <!-- 对话内容 -->
      <div class="wf-content" id="wfContent">
        <div class="wf-empty" id="wfEmpty">
          <div class="wf-empty__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <h3 class="wf-empty__title">开始对话</h3>
          <p class="wf-empty__text">输入描述，AI 将为你生成时尚大片级图片</p>
        </div>
        <div class="wf-messages" id="wfMessages"></div>
      </div>

      <!-- 输入区 -->
      <div class="wf-input-area">
        <!-- 工具栏 -->
        <div class="wf-toolbar">
          <div class="wf-agent-toggle" id="wfAgentToggle">
            <span class="wf-agent-toggle__icon">🤖</span>
            <span class="wf-agent-toggle__label">Agent</span>
          </div>
          <div class="wf-count-selector">
            <button class="wf-toolbar__item wf-count-btn" data-count="1">1张</button>
            <button class="wf-toolbar__item wf-count-btn active" data-count="2">2张</button>
            <button class="wf-toolbar__item wf-count-btn" data-count="4">4张</button>
            <button class="wf-toolbar__item wf-count-btn" data-count="9">9张</button>
          </div>
        </div>

        <!-- 参考图 -->
        <div class="wf-ref-section" id="wfRefSection">
          <button class="wf-ref-add" id="wfRefAdd" title="添加参考图">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <input type="file" id="wfRefInput" accept="image/*" hidden multiple />
        </div>

        <!-- 输入框 -->
        <div class="wf-input-row">
          <div class="wf-textarea-wrap">
            <textarea
              class="wf-textarea"
              id="wfTextarea"
              placeholder="描述你想要的画面..."
              rows="1"
            ></textarea>
          </div>
          <button class="wf-send-btn" id="wfSendBtn" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 设置面板 -->
      <div class="wf-settings-panel" id="wfSettingsPanel">
        <div class="wf-settings-panel__header">
          <h3 class="wf-settings-panel__title">设置</h3>
          <button class="icn-btn" id="wfCloseSettings">&times;</button>
        </div>
        <div class="wf-settings-panel__body">
          <div class="wf-settings-section">
            <h4 class="wf-settings-section__title">缓存管理</h4>
            <div class="wf-settings-row">
              <span class="wf-settings-row__label">图片缓存</span>
              <span class="wf-settings-row__value" id="wfCacheSize">0 KB</span>
            </div>
            <div class="wf-settings-row">
              <span class="wf-settings-row__label">对话记录</span>
              <span class="wf-settings-row__value" id="wfHistoryCount">0 条</span>
            </div>
            <div class="wf-settings-row">
              <span class="wf-settings-row__label">会话数量</span>
              <span class="wf-settings-row__value" id="wfSessionCount">0 个</span>
            </div>
          </div>
          <div class="wf-settings-section">
            <h4 class="wf-settings-section__title">清理</h4>
            <button class="wf-danger-btn" id="wfClearImages">清空图片缓存</button>
            <button class="wf-danger-btn" id="wfClearHistory">清空所有历史</button>
          </div>
          <div class="wf-settings-section">
            <h4 class="wf-settings-section__title">关于</h4>
            <p style="font-size: 13px; color: var(--text-secondary, #888); line-height: 1.6;">
              Fashion Studio 瀑布流对话界面 · 使用 IndexedDB 本地存储
            </p>
          </div>
        </div>
      </div>

      <!-- 会话列表面板 -->
      <div class="wf-sessions-panel" id="wfSessionsPanel">
        <div class="wf-sessions-panel__header">
          <h3 class="wf-sessions-panel__title">历史会话</h3>
          <button class="icn-btn" id="wfCloseSessions">&times;</button>
        </div>
        <div class="wf-sessions-panel__list" id="wfSessionsList">
          <div class="wf-empty" style="padding: 40px 0;">
            <p class="wf-empty__text">暂无历史会话</p>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // 返回按钮
    document.getElementById('wfBackBtn').onclick = () => this.hide();

    // 发送按钮
    this.elements.sendBtn.onclick = () => this.handleSend();
    this.elements.textarea.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    };

    // 文本框输入监听
    this.elements.textarea.oninput = () => {
      this.elements.sendBtn.disabled = !this.elements.textarea.value.trim();
      this.autoResizeTextarea();
    };

    // Agent 开关
    this.elements.agentToggle.onclick = () => {
      this.isAgentEnabled = !this.isAgentEnabled;
      this.elements.agentToggle.classList.toggle('active', this.isAgentEnabled);
    };

    // 张数选择
    document.querySelectorAll('.wf-count-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.wf-count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedImageCount = parseInt(btn.dataset.count);
      };
    });

    // 参考图
    this.elements.refAdd.onclick = () => this.elements.refInput.click();
    this.elements.refInput.onchange = (e) => this.handleRefImages(e);

    // 设置面板
    document.getElementById('wfSettingsBtn').onclick = () => {
      this.elements.settingsPanel.classList.add('active');
      this.updateSettingsPanel();
    };
    document.getElementById('wfCloseSettings').onclick = () => {
      this.elements.settingsPanel.classList.remove('active');
    };

    // 会话列表
    document.getElementById('wfSessionsBtn').onclick = () => {
      this.elements.sessionsPanel.classList.add('active');
      this.loadSessionsList();
    };
    document.getElementById('wfCloseSessions').onclick = () => {
      this.elements.sessionsPanel.classList.remove('active');
    };

    // 清理按钮
    document.getElementById('wfClearImages').onclick = () => this.clearImages();
    document.getElementById('wfClearHistory').onclick = () => this.clearHistory();

    // 点击外部关闭面板
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('wf-settings-panel') ||
          e.target.classList.contains('wf-sessions-panel')) {
        e.target.classList.remove('active');
      }
    });
  }

  async loadSession() {
    const messages = await this.db.getSessionMessages(this.currentSessionId);
    this.messages = messages.sort((a, b) => a.timestamp - b.timestamp);
    this.renderMessages();

    // 更新会话标题
    if (this.messages.length > 0) {
      const firstUserMsg = this.messages.find(m => m.type === 'user');
      if (firstUserMsg) {
        document.getElementById('wfSessionSub').textContent =
          firstUserMsg.content?.substring(0, 20) || firstUserMsg.prompt?.substring(0, 20) || '新对话';
      }
    }
  }

  renderMessages() {
    const container = document.getElementById('wfMessages');
    const emptyState = document.getElementById('wfEmpty');

    if (this.messages.length === 0) {
      emptyState.style.display = 'flex';
      container.innerHTML = '';
      return;
    }

    emptyState.style.display = 'none';
    container.innerHTML = this.messages.map(msg => this.renderMessage(msg)).join('');

    // 绑定图片事件
    container.querySelectorAll('.wf-image-item').forEach(item => {
      const imageId = item.dataset.imageId;
      const imageUrl = item.dataset.url;

      item.onclick = () => this.showImageActions(imageId, imageUrl);
    });

    // 滚动到底部
    this.elements.content.scrollTop = this.elements.content.scrollHeight;
  }

  renderMessage(msg) {
    const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    if (msg.type === 'user') {
      return `
        <div class="wf-message wf-message--user">
          <div class="wf-message__user-bubble">${this.escapeHtml(msg.content || msg.prompt)}</div>
          <div class="wf-message__user-time">${time}</div>
        </div>
      `;
    }

    // AI 消息
    const imagesHtml = msg.images?.length > 0 ? this.renderImages(msg.images) : '';
    const promptHtml = msg.prompt ? `
      <div class="wf-message__prompt">
        <div class="wf-message__prompt-label">Prompt</div>
        <div class="wf-message__prompt-text">${this.escapeHtml(msg.prompt)}</div>
      </div>
    ` : '';

    return `
      <div class="wf-message wf-message--ai">
        <div class="wf-message__ai-header">
          <div class="wf-message__ai-avatar">AI</div>
          <span class="wf-message__ai-name">Fashion Studio</span>
          <span class="wf-message__ai-time">${time}</span>
        </div>
        <div class="wf-message__ai-bubble">
          ${promptHtml}
          ${imagesHtml}
        </div>
      </div>
    `;
  }

  renderImages(images) {
    const count = images.length;
    return `
      <div class="wf-images" data-count="${count}">
        ${images.map(img => `
          <div class="wf-image-item" data-image-id="${img.id || ''}" data-url="${img.url}">
            <img src="${img.url}" alt="生成图片" loading="lazy" />
            <div class="wf-image-menu">
              <button class="wf-image-menu__btn" title="下载" onclick="event.stopPropagation(); waterfallView.downloadImage('${img.url}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
              <button class="wf-image-menu__btn" title="抠图" onclick="event.stopPropagation(); waterfallView.removeBackground('${img.url}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/>
                </svg>
              </button>
              <button class="wf-image-menu__btn" title="删除" onclick="event.stopPropagation(); waterfallView.deleteMessage(${img.msgId || 0})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
            <div class="wf-image-info">
              ${img.model || 'BLOOOOM Flash'} · ${img.size || '1K'}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  async handleSend() {
    const content = this.elements.textarea.value.trim();
    if (!content || this.isLoading) return;

    const prompt = content;
    let finalPrompt = prompt;

    // 添加用户消息
    await this.db.saveMessage(this.currentSessionId, {
      type: 'user',
      content: prompt
    });

    // 清空输入
    this.elements.textarea.value = '';
    this.elements.sendBtn.disabled = true;
    this.autoResizeTextarea();

    // 渲染用户消息
    await this.loadSession();

    // 如果启用了 Agent，先优化提示词
    if (this.isAgentEnabled) {
      try {
        finalPrompt = await optimizePrompt(prompt, this.referenceImages);
      } catch (error) {
        console.error('Agent 优化失败:', error);
        showToast('Agent 优化失败，使用原始提示词', 'warning');
      }
    }

    // 添加思考中状态
    await this.db.saveMessage(this.currentSessionId, {
      type: 'ai',
      content: '🤖 思考中...',
      prompt: finalPrompt,
      model: 'thinking'
    });
    await this.loadSession();

    this.isLoading = true;

    try {
      // 调用生图 API
      const results = await generateImages({
        prompt: finalPrompt,
        count: this.selectedImageCount,
        referenceImages: this.referenceImages,
        onProgress: (status) => {
          // 可以在这里更新状态
        }
      });

      // 删除思考中消息，添加结果
      const messages = await this.db.getSessionMessages(this.currentSessionId);
      const lastMsg = messages[messages.length - 1];

      // 更新最后一条消息为结果
      if (lastMsg && lastMsg.model === 'thinking') {
        lastMsg.content = '';
        lastMsg.images = results.map(r => ({
          url: r.url,
          prompt: finalPrompt,
          model: r.model || 'BLOOOOM Flash',
          size: r.size || '1K'
        }));
        lastMsg.model = results[0]?.model || 'BLOOOOM Flash';
        await this.db.put(this.db.db, lastMsg);
      }

      // 缓存图片
      for (const img of results) {
        try {
          const response = await fetch(img.url);
          const blob = await response.blob();
          await this.db.cacheImage(lastMsg.id, img.url, blob);
        } catch (e) {
          console.warn('图片缓存失败:', e);
        }
      }

      // 清除参考图
      this.referenceImages = [];
      this.renderRefImages();

    } catch (error) {
      console.error('生图失败:', error);
      showToast('生成失败: ' + error.message, 'error');

      // 更新错误状态
      const messages = await this.db.getSessionMessages(this.currentSessionId);
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.model === 'thinking') {
        lastMsg.content = '❌ 生成失败: ' + error.message;
        lastMsg.model = 'error';
        await this.db.put(this.db.db, lastMsg);
      }
    }

    this.isLoading = false;
    await this.loadSession();
    await this.updateCacheStatus();
  }

  handleRefImages(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      if (this.referenceImages.length >= 9) {
        showToast('最多上传 9 张参考图', 'warning');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        this.referenceImages.push({
          url: event.target.result,
          name: file.name
        });
        this.renderRefImages();
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  }

  renderRefImages() {
    const container = document.getElementById('wfRefSection');
    const addBtn = document.getElementById('wfRefAdd');

    // 移除现有的图片项
    container.querySelectorAll('.wf-ref-item').forEach(el => el.remove());

    // 添加图片
    this.referenceImages.forEach((img, index) => {
      const item = document.createElement('div');
      item.className = 'wf-ref-item';
      item.innerHTML = `
        <img src="${img.url}" alt="参考图" />
        <button class="wf-ref-item__remove" onclick="waterfallView.removeRefImage(${index})">&times;</button>
      `;
      container.insertBefore(item, addBtn);
    });
  }

  removeRefImage(index) {
    this.referenceImages.splice(index, 1);
    this.renderRefImages();
  }

  // 图片操作
  downloadImage(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fashion_studio_' + Date.now() + '.png';
    a.click();
  }

  async removeBackground(url) {
    try {
      showToast('正在抠图...', 'info');

      // 显示加载状态
      const originalUrl = url;

      const result = await removeBackground({ imageUrl: url });

      // 打开结果
      window.open(result.url, '_blank');
      showToast('抠图完成', 'success');
    } catch (error) {
      showToast('抠图失败: ' + error.message, 'error');
    }
  }

  async deleteMessage(msgId) {
    if (msgId && confirm('确定删除这条消息？')) {
      await this.db.delete('chat_history', msgId);
      await this.loadSession();
      showToast('已删除', 'success');
    }
  }

  showImageActions(imageId, imageUrl) {
    // 可以扩展更多操作
    this.downloadImage(imageUrl);
  }

  // 设置面板
  async updateSettingsPanel() {
    const stats = await this.db.getCacheStats();
    document.getElementById('wfCacheSize').textContent = stats.formattedSize;
    document.getElementById('wfHistoryCount').textContent = stats.historyCount + ' 条';
    document.getElementById('wfSessionCount').textContent = stats.sessionCount + ' 个';
  }

  async updateCacheStatus() {
    const stats = await this.db.getCacheStats();
    const dot = document.querySelector('#wfCacheStatus .wf-cache-status__dot');
    const text = document.querySelector('#wfCacheStatus .wf-cache-status__text');

    dot.classList.remove('warning', 'error');

    if (stats.totalCacheSize > 500 * 1024 * 1024) { // > 500MB
      dot.classList.add('error');
      text.textContent = '缓存已满 ' + stats.formattedSize;
    } else if (stats.totalCacheSize > 200 * 1024 * 1024) { // > 200MB
      dot.classList.add('warning');
      text.textContent = stats.formattedSize;
    } else {
      text.textContent = stats.formattedSize;
    }
  }

  async clearImages() {
    if (confirm('确定清空所有图片缓存？这不会影响对话历史。')) {
      await this.db.clearAllImages();
      this.updateSettingsPanel();
      this.updateCacheStatus();
      showToast('图片缓存已清空', 'success');
    }
  }

  async clearHistory() {
    if (confirm('确定清空所有历史记录？此操作不可恢复！')) {
      await this.db.clearAllHistory();
      await this.loadSession();
      this.updateSettingsPanel();
      showToast('历史已清空', 'success');
    }
  }

  // 会话列表
  async loadSessionsList() {
    const sessions = await this.db.getAllSessions();
    const container = document.getElementById('wfSessionsList');

    if (sessions.length === 0) {
      container.innerHTML = `
        <div class="wf-empty" style="padding: 40px 0;">
          <p class="wf-empty__text">暂无历史会话</p>
        </div>
      `;
      return;
    }

    container.innerHTML = sessions.map(session => `
      <div class="wf-session-item ${session.sessionId === this.currentSessionId ? 'active' : ''}"
           onclick="waterfallView.switchSession('${session.sessionId}')">
        <div class="wf-session-item__preview">${session.preview || '新对话'}</div>
        <div class="wf-session-item__meta">
          <span>${session.messageCount} 条</span>
          <span>·</span>
          <span>${this.formatTime(session.timestamp)}</span>
        </div>
      </div>
    `).join('');
  }

  switchSession(sessionId) {
    this.currentSessionId = sessionId;
    sessionStorage.setItem('wf_session_id', sessionId);
    this.loadSession();
    this.elements.sessionsPanel.classList.remove('active');
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    return date.toLocaleDateString('zh-CN');
  }

  autoResizeTextarea() {
    const textarea = this.elements.textarea;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 显示/隐藏
  show() {
    this.elements.container.classList.add('active');
    document.body.style.overflow = 'hidden';
    this.loadSession();
  }

  hide() {
    this.elements.container.classList.remove('active');
    document.body.style.overflow = '';
    this.elements.settingsPanel.classList.remove('active');
    this.elements.sessionsPanel.classList.remove('active');
  }

  toggle() {
    if (this.elements.container.classList.contains('active')) {
      this.hide();
    } else {
      this.show();
    }
  }
}

// 创建全局实例
let waterfallView;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  waterfallView = new WaterfallView();
});
