/**
 * FashionStudio — 主逻辑
 * v3: 全屏画布 + 底部控制台布局
 */

(function () {
  'use strict';

  // ===================== 状态 =====================
  const S = {
    tab:          'creative',
    subType:      {},
    count:        2,
    aspect:       'auto',
    quality:      '1K',
    model:        localStorage.getItem('fs_default_model') || 'flash',
    prompt:       '',
    refImages:    { main: [] },
    results:      [],
    enhancing:    false,
    // Wan 专属状态
    wan: {
      imageModel: localStorage.getItem('fs_wan_image_model') || 'wan2.7-image',
      videoResolution: '1080P',
      videoRatio: '16:9',
      videoDuration: 5,
      imageN: 1,
      thinkingMode: true,
      videoPollTimer: null
    }
  };

  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  // ===================== 工具函数 =====================
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ===================== 多任务管理器 =====================
  let taskCounter = 1;
  const taskStore = {}; // id -> Task

  class Task {
    constructor(id) {
      this.id = id;
      this.prompt = '';
      this.refs = [];     // [{thumb, b64}]
      this.model = S.model;
      this.aspect = S.aspect;
      this.quality = S.quality;
      this.status = 'idle'; // idle | running | done | error
      this.results = [];
      this.signal = null;
    }
  }

  const TaskManager = {
    add() {
      const id = ++taskCounter;
      taskStore[id] = new Task(id);
      this.render();
      this.updateBadge();
      return id;
    },

    remove(id) {
      if (!taskStore[id]) return;
      delete taskStore[id];
      this.render();
      this.updateBadge();
    },

    get(id) { return taskStore[id]; },

    updateBadge() {
      const running = Object.values(taskStore).filter(t => t.status === 'running' || t.status === 'idle').length;
      const badge = $('taskBadge');
      if (badge) {
        badge.textContent = running;
        badge.classList.toggle('hidden', running === 0);
      }
    },

    render() {
      const list = $('taskList');
      if (!list) return;
      list.innerHTML = '';

      Object.values(taskStore).forEach(task => {
        const card = document.createElement('div');
        card.className = `task-card task-card--${task.status === 'running' ? 'running' : task.status === 'done' ? 'done' : ''}`;
        card.id = `task-card-${task.id}`;

        const thumbHtml = task.refs.length > 0
          ? `<img class="task-card__ref-thumb" src="${task.refs[0].thumb}" alt="参考图" title="${task.refs[0].b64.slice(0, 20)}..." />`
          : '';

        card.innerHTML = `
          <div class="task-card__header">
            <span class="task-card__id">任务 #${task.id}</span>
            <div class="task-card__status task-card__status--${task.status === 'running' ? 'running' : task.status === 'done' ? 'done' : 'error'}">
              ${task.status === 'running' ? '<span class="task-card__dot"></span>生成中…' : ''}
              ${task.status === 'done' ? '<span class="task-card__dot"></span>已完成' : ''}
              ${task.status === 'idle' ? '等待生成' : ''}
              ${task.status === 'error' ? '生成失败' : ''}
            </div>
            <button class="task-card__remove" data-task-remove="${task.id}" title="删除任务">×</button>
          </div>
          <textarea class="task-card__prompt" id="task-prompt-${task.id}" placeholder="描述你想要的画面…">${task.prompt || ''}</textarea>
          <div class="task-card__ref-row" id="task-ref-row-${task.id}">
            ${thumbHtml}
            <label class="task-card__ref-add" title="添加参考图">
              <input type="file" accept="image/*" data-task-ref="${task.id}" hidden />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </label>
          </div>
          <div class="task-card__footer">
            <button class="task-card__gen-btn" id="task-gen-btn-${task.id}" data-task-gen="${task.id}">
              ${task.status === 'running'
                ? '<span class="task-card__spinner"></span>生成中…'
                : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>生成'}
            </button>
          </div>
          <div class="task-card__results" id="task-results-${task.id}">
            ${task.results.map(r => `<img src="${r._thumbUrl || 'data:image/png;base64,' + (r.b64_json || '')}" alt="结果" loading="lazy" />`).join('')}
          </div>
        `;

        // 事件绑定
        card.querySelector(`[data-task-remove]`).addEventListener('click', () => {
          if (task.status === 'running') { showToast('任务进行中，无法删除', 'warning'); return; }
          this.remove(task.id);
        });

        card.querySelector(`#task-prompt-${task.id}`).addEventListener('input', e => {
          task.prompt = e.target.value;
        });

        card.querySelector(`[data-task-ref]`).addEventListener('change', async e => {
          const file = e.target.files[0];
          if (!file) return;
          const b64 = await fileToBase64(file);
          const thumb = b64; // 用同一张图当缩略图
          task.refs = [{ b64, thumb }];
          this.render(); // 重新渲染显示缩略图
        });

        card.querySelector(`[data-task-gen]`).addEventListener('click', () => {
          if (task.status === 'running') return;
          task.prompt = $(`task-prompt-${task.id}`)?.value?.trim() || '';
          if (!task.prompt) { showToast('请输入描述', 'warning'); return; }
          if (!API_CLIENT.hasKey()) { showToast('请先在设置中填写 API Key', 'error'); $('settingsModal')?.classList.remove('hidden'); return; }
          runTaskGen(task.id);
        });

        // 结果图片点击放大
        card.querySelectorAll('.task-card__results img').forEach((img, i) => {
          img.addEventListener('click', () => {
            openLightbox(img.src, task.results[i]?.revised_prompt || task.prompt);
          });
        });

        list.appendChild(card);
      });

      // 空状态
      if (Object.keys(taskStore).length === 0) {
        list.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:.75rem;padding:20px 0;">暂无并行任务<br>点击「新建任务」添加</div>';
      }
    }
  };

  // 并行任务生成（独立，不影响全局状态）
  async function runTaskGen(taskId) {
    const task = TaskManager.get(taskId);
    if (!task) return;

    task.status = 'running';
    task.signal = new AbortController();
    task.results = [];
    TaskManager.render();
    TaskManager.updateBadge();

    try {
      const refs = task.refs.map(r => r.b64);
      let results = [];

      if (refs.length > 0) {
        // 有参考图，走 imageEdit
        const { dataUrl } = await compositeImages(refs, task.aspect === 'auto');
        const editAspect = task.aspect === 'auto' ? _dimsToAspect(
          refs.length > 0 ? 1024 : 0,
          refs.length > 0 ? 1024 : 0
        ) : task.aspect;
        results = await API_CLIENT.imageEdit({
          prompt: task.prompt,
          imageBase64: dataUrl,
          provider: task.model,
          aspect: editAspect,
          quality: task.quality,
          signal: task.signal.signal
        });
      } else {
        // 无参考图，走 textToImage
        results = await API_CLIENT.textToImage({
          prompt: task.prompt,
          provider: task.model,
          count: 1,
          aspect: task.aspect,
          quality: task.quality,
          signal: task.signal.signal
        });
      }

      task.results = Array.isArray(results) ? results : [results];
      task.status = 'done';

      // 存入 IndexedDB
      if (task.results.length > 0) {
        persistResults(task.results, task.prompt, S.tab);
      }

      TaskManager.render();
      TaskManager.updateBadge();
      showToast(`任务 #${taskId} 生成完成 🎉`, 'success');
    } catch (e) {
      if (e.name !== 'AbortError') {
        task.status = 'error';
        showToast(`任务 #${taskId} 失败：${e.message}`, 'error');
      }
      TaskManager.render();
      TaskManager.updateBadge();
    }
  }

  // ===================== 初始化 =====================
  function init() {
    bindTabNav();
    bindPrompt();
    bindModelSelector();
    bindAspectSelector();
    bindQualitySelector();
    bindGenerate();
    bindResults();
    bindHistory();
    bindSettings();
    bindUpload();
    bindLightbox();
    bindKeyboard();
    bindControlDock();
    bindTaskPanel();
    bindAgentPanel();
    bindSetupWizard();    // 首次启动引导
    loadTemplates();
    loadSettings();
    checkApiStatus();
    switchTab('creative');
    // IndexedDB 初始化：刷新后恢复上次生成结果
    if (ImageStore.isAvailable()) {
      ImageStore.openDB().then(() => restoreLastSession()).catch(() => {});
    }
  }

  // ===================== 首次启动引导 =====================
  function bindSetupWizard() {
    const overlay = $('setupOverlay');
    const saveBtn = $('setupSaveBtn');
    const skipBtn = $('setupSkipBtn');
    if (!overlay) return;

    // 检查是否需要显示引导（BLOOOOM Key 为空且没有旧的 localStorage key）
    const hasBlooomKey = API_CLIENT.hasKey();
    const hasWanKey = WAN_API.hasKey();
    if (hasBlooomKey) return; // 已有 Key，不显示引导

    overlay.classList.remove('hidden');

    saveBtn.addEventListener('click', () => {
      const blooomKey = $('setupBlooomKey').value.trim();
      const wanKey = $('setupWanKey').value.trim();

      if (!blooomKey) {
        showToast('请填写 BLOOOOM API Key', 'error');
        $('setupBlooomKey').focus();
        return;
      }

      // 保存 Key
      API_CLIENT.setConfig({ apiKey: blooomKey });
      if (wanKey) WAN_API.setKey(wanKey);

      overlay.classList.add('hidden');
      checkApiStatus(); // Key 设置后立即检测
      showToast('API Key 已保存', 'success');
    });

    skipBtn.addEventListener('click', (e) => {
      e.preventDefault();
      overlay.classList.add('hidden');
    });

    // 回车提交
    $('setupBlooomKey').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveBtn.click();
    });
    $('setupWanKey').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveBtn.click();
    });
  }

  // ===================== Tab 导航 =====================
  function bindTabNav() {
    $$('.tab-nav__item').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  function switchTab(tab) {
    S.tab = tab;

    // Nav buttons
    $$('.tab-nav__item').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });

    // 更新信息面板
    const info = TAB_INFO[tab] || TAB_INFO.creative;
    $('infoContent').innerHTML = info.content;

    // 更新参考图提示
    updateRefHint(tab);

    // 更新生成按钮文字
    updateGenerateBtnText(tab);

    // 生图数量选择器只在 creative Tab 显示
    const countSel = $('countSelector');
    if (countSel) countSel.classList.toggle('hidden', tab !== 'creative');

    // 模型选择器(Flash/Pro) 只在 creative/edit/retouch/model/background/wearables/lighting/grid/multiangle/camera_view Tab 显示
    const modelSel = $('modelSelector');
    const needsModel = ['creative', 'edit', 'retouch', 'model', 'background', 'wearables', 'lighting', 'grid', 'multiangle', 'camera_view'].includes(tab);
    if (modelSel) modelSel.classList.toggle('hidden', !needsModel);

    // 比例选择器在 cutout Tab 隐藏（抠图保持原图尺寸）
    const aspectSel = $('aspectSelector');
    if (aspectSel) aspectSel.classList.toggle('hidden', tab === 'cutout');

    // 分辨率选择器在 cutout Tab 隐藏（抠图保持原图分辨率）
    const qualitySel = $('qualitySelector');
    if (qualitySel) qualitySel.classList.toggle('hidden', tab === 'cutout');

    // Wan Tab 和批量 Tab 隐藏底部参数栏的部分元素
    const isWanTab = tab === 'wan-image' || tab === 'wan-video';
    const isBatchTab = tab === 'grid' || tab === 'multiangle';
    const paramsRow = document.querySelector('.dock-params-row__right');
    if (paramsRow) paramsRow.classList.toggle('hidden', isWanTab || isBatchTab);

    // 更新子面板标题
    const title = $('subPanelTitle');
    if (title) title.textContent = info.title;

    // 重新渲染子面板内容（先渲染HTML）
    renderSubPanel(tab);

    // Tab 专属初始化（HTML渲染后再绑定事件）
    if (tab === 'wearables')    bindWearableTypes();
    if (tab === 'model')        bindModelTypes();
    if (tab === 'retouch')      bindRetouchTypes();
    if (tab === 'cutout')       bindCutoutTypes();
    if (tab === 'background')   bindBgTypes();
    if (tab === 'edit')         bindEditTypes();
    if (tab === 'wan-image')    bindWanImageTypes();
    if (tab === 'wan-video')    bindWanVideoTypes();
    if (tab === 'lighting')     bindLightingTypes();
    if (tab === 'grid')         bindGridTypes();
    if (tab === 'multiangle')   bindMultiangleTypes();
    if (tab === 'camera_view')  bindCameraViewTypes();

    // 清除旧参考图状态
    clearRefImage();

    // Wan 视频轮询清理
    if (tab !== 'wan-video' && S.wan.videoPollTimer) {
      clearInterval(S.wan.videoPollTimer);
      S.wan.videoPollTimer = null;
    }
  }

  function updateRefHint(tab) {
    const hints = {
      creative:   '添加参考图',
      wearables:  S.subType.wearable === 'custom' ? '图1人物+图2服装' : '添加人物参考图',
      model:      '添加主体参考图',
      retouch:    '添加商品原图',
      cutout:     '添加待抠图片',
      background: '添加商品原图',
      edit:       '添加原图',
      'wan-image': '添加参考图（可选，最多9张）',
      'wan-video': '添加首帧图片（可选，图生视频模式）',
      lighting:   '上传原图进行光影优化（可选）',
      grid:       '上传参考图（可选，保持一致性）',
      multiangle: '上传角色/产品参考图（可选）'
    };
    const hint = $('refHintText');
    if (hint) hint.textContent = hints[tab] || '添加参考图';
  }

  function updateGenerateBtnText(tab) {
    const texts = {
      creative:   '生成',
      wearables:  '穿戴',
      model:      '修整',
      retouch:    '精修',
      cutout:     '抠图',
      background: '换背景',
      edit:       '编辑',
      'wan-image': '万相生图',
      'wan-video': '万相视频',
      lighting:   '光影生成',
      grid:       '批量生成',
      multiangle: '批量生成',
      camera_view: '相机生成'
    };
    const btn = $('btnGenerate');
    if (btn) btn.querySelector('.btn__text').textContent = texts[tab] || '生成';
  }

  // ===================== 子面板（浮动选项面板） =====================
  // 各 Tab 的面板 HTML 内容
  const PANEL_TEMPLATES = {
    creative: () => `
      <div class="panel-section">
        <h3 class="panel-section__title">快速模板</h3>
        <div class="template-grid" id="templateBtns"></div>
      </div>
      <div class="panel-section">
        <h3 class="panel-section__title">模特场景</h3>
        <div class="tag-grid">
          <button class="tag" data-scene="室内">室内</button>
          <button class="tag" data-scene="室外">室外</button>
          <button class="tag" data-scene="半身">半身</button>
          <button class="tag" data-scene="全身">全身</button>
          <button class="tag" data-scene="特写">特写</button>
          <button class="tag" data-scene="居家">居家</button>
          <button class="tag" data-scene="街道">街道</button>
        </div>
      </div>
      <div class="panel-section">
        <h3 class="panel-section__title">风格标签</h3>
        <div class="tag-grid">
          <button class="tag" data-style="写真">写真</button>
          <button class="tag" data-style="街拍">街拍</button>
          <button class="tag" data-style="杂志">杂志</button>
          <button class="tag" data-style="商业">商业</button>
          <button class="tag" data-style="氛围感">氛围感</button>
          <button class="tag" data-style="复古">复古</button>
          <button class="tag" data-style="清新">清新</button>
          <button class="tag" data-style="法式">法式</button>
          <button class="tag" data-style="韩系">韩系</button>
          <button class="tag" data-style="日系">日系</button>
        </div>
      </div>
    `,
    wearables: () => `
      <div class="panel-section">
        <h3 class="panel-section__title">穿戴类型</h3>
        <div class="item-grid" id="wearableTypes">
          <button class="item-btn active" data-type="bag"><span class="item-btn__icon">👜</span><span>包包</span></button>
          <button class="item-btn" data-type="hat"><span class="item-btn__icon">🧢</span><span>帽子</span></button>
          <button class="item-btn" data-type="accessory"><span class="item-btn__icon">💍</span><span>配饰</span></button>
          <button class="item-btn" data-type="glasses"><span class="item-btn__icon">🕶️</span><span>眼镜</span></button>
          <button class="item-btn" data-type="top"><span class="item-btn__icon">👕</span><span>上衣</span></button>
          <button class="item-btn" data-type="bottom"><span class="item-btn__icon">👖</span><span>裤子</span></button>
          <button class="item-btn" data-type="shoes"><span class="item-btn__icon">👟</span><span>鞋子</span></button>
          <button class="item-btn" data-type="custom"><span class="item-btn__icon">✏️</span><span>自定义</span></button>
        </div>
      </div>
      <div class="panel-section">
        <h3 class="panel-section__title">物品描述</h3>
        <textarea class="input-textarea" id="wearableDesc" placeholder="描述要穿戴的物品：材质、颜色、款式..." rows="3"></textarea>
      </div>
    `,
    model: () => `
      <div class="panel-section">
        <h3 class="panel-section__title">修整类型</h3>
        <div class="item-grid" id="modelTypes">
          <button class="item-btn active" data-type="face"><span class="item-btn__icon">🙍</span><span>换脸</span></button>
          <button class="item-btn" data-type="model"><span class="item-btn__icon">👤</span><span>换模特</span></button>
          <button class="item-btn" data-type="background"><span class="item-btn__icon">🌄</span><span>换背景</span></button>
        </div>
      </div>
      <div class="panel-section" id="modelFaceRefSection">
        <h3 class="panel-section__title">面部参考图</h3>
        <div class="upload-zone" id="faceRefZone">
          <input type="file" id="faceRefInput" accept="image/*" hidden />
          <div class="upload-zone__inner" id="faceRefPreview">
            <span class="upload-zone__icon">+</span>
            <span class="upload-zone__text">上传面部参考图</span>
          </div>
        </div>
      </div>
      <div class="panel-section">
        <h3 class="panel-section__title">换背景描述</h3>
        <textarea class="input-textarea" id="modelBgDesc" placeholder="描述想要的背景..." rows="2"></textarea>
      </div>
    `,
    retouch: () => `
      <div class="panel-section">
        <h3 class="panel-section__title">精修类型</h3>
        <div class="item-grid" id="retouchTypes">
          <button class="item-btn active" data-type="refine"><span class="item-btn__icon">✨</span><span>服装精修</span></button>
          <button class="item-btn" data-type="3d"><span class="item-btn__icon">📦</span><span>平铺转3D</span></button>
        </div>
      </div>
      <div class="panel-section">
        <h3 class="panel-section__title">精修要求（可选）</h3>
        <textarea class="input-textarea" id="retouchDesc" placeholder="指定精修要求..." rows="3"></textarea>
      </div>
    `,
    cutout: () => `
      <div class="panel-section">
        <h3 class="panel-section__title">抠图类型</h3>
        <div class="item-grid" id="cutoutTypes">
          <button class="item-btn active" data-type="white"><span class="item-btn__icon">◻️</span><span>白底抠图</span></button>
          <button class="item-btn" data-type="scene"><span class="item-btn__icon">✂️</span><span>场景抠图</span></button>
        </div>
      </div>
      <div class="panel-section">
        <p class="panel-hint">上传商品图或人物图，AI 自动识别主体并精准抠出边缘。</p>
      </div>
    `,
    background: () => `
      <div class="panel-section">
        <h3 class="panel-section__title">背景类型</h3>
        <div class="item-grid" id="bgTypes">
          <button class="item-btn active" data-type="indoor"><span class="item-btn__icon">🏠</span><span>室内场景</span></button>
          <button class="item-btn" data-type="outdoor"><span class="item-btn__icon">🌿</span><span>外景/自然</span></button>
          <button class="item-btn" data-type="solid"><span class="item-btn__icon">◻️</span><span>纯色背景</span></button>
        </div>
      </div>
      <div class="panel-section">
        <h3 class="panel-section__title">背景描述</h3>
        <textarea class="input-textarea" id="bgDesc" placeholder="描述想要的背景..." rows="2"></textarea>
      </div>
      <div class="panel-section" id="bgColorSection" style="display:none;">
        <h3 class="panel-section__title">纯色颜色</h3>
        <div class="color-picker">
          <input type="color" id="bgColorInput" value="#ffffff" />
          <input type="text" class="input-field" id="bgColorHex" value="#ffffff" placeholder="#ffffff" />
        </div>
      </div>
    `,
    edit: () => `
      <div class="panel-section">
        <h3 class="panel-section__title">编辑类型</h3>
        <div class="item-grid" id="editTypes">
          <button class="item-btn active" data-type="recolor"><span class="item-btn__icon">🎨</span><span>AI换色</span></button>
          <button class="item-btn" data-type="expand"><span class="item-btn__icon">↔️</span><span>AI扩图</span></button>
          <button class="item-btn" data-type="erase"><span class="item-btn__icon">✕</span><span>消除笔</span></button>
          <button class="item-btn" data-type="upscale"><span class="item-btn__icon">🔍</span><span>高清修复</span></button>
        </div>
      </div>
      <div class="panel-section">
        <h3 class="panel-section__title">编辑描述</h3>
        <textarea class="input-textarea" id="editDesc" placeholder="描述编辑要求..." rows="3"></textarea>
      </div>
    `,
    'wan-image': () => `
      <div class="panel-section">
        <h3 class="panel-section__title">模型选择</h3>
        <div class="seg-control" id="wanImageModelSelector">
          <button class="seg-btn active" data-model="wan2.7-image">标准版 (0.2元/张)</button>
          <button class="seg-btn" data-model="wan2.7-image-pro">Pro版 (0.5元/张)</button>
        </div>
        <p class="panel-hint">Pro 版支持 4K 输出和更强推理能力</p>
      </div>
      <div class="panel-section">
        <h3 class="panel-section__title">生成数量</h3>
        <div class="seg-control" id="wanImageNSelector">
          <button class="seg-btn" data-n="1">1张</button>
          <button class="seg-btn active" data-n="2">2张</button>
          <button class="seg-btn" data-n="4">4张</button>
        </div>
      </div>
      <div class="panel-section">
        <h3 class="panel-section__title">分辨率</h3>
        <div class="seg-control" id="wanImageSizeSelector">
          <button class="seg-btn active" data-size="1024*1024">1024×1024</button>
          <button class="seg-btn" data-size="1536*1536">1536×1536</button>
          <button class="seg-btn wan-size-pro" data-size="2048*2048">2048×2048 (Pro)</button>
        </div>
      </div>
      <div class="panel-section">
        <label class="panel-checkbox">
          <input type="checkbox" id="wanThinkingMode" checked />
          <span>思维模式（更精准但稍慢）</span>
        </label>
      </div>
      <div class="panel-section">
        <h3 class="panel-section__title">反向提示词</h3>
        <textarea class="input-textarea" id="wanNegPrompt" placeholder="不想要的元素，如：模糊, 低质量, 变形..." rows="2"></textarea>
      </div>
    `,
    'wan-video': () => `
      <div class="panel-section">
        <h3 class="panel-section__title">视频模式</h3>
        <div class="item-grid" id="wanVideoModes">
          <button class="item-btn active" data-mode="t2v"><span class="item-btn__icon">📝</span><span>文生视频</span></button>
          <button class="item-btn" data-mode="i2v"><span class="item-btn__icon">🖼️</span><span>图生视频</span></button>
        </div>
      </div>
      <div class="panel-section">
        <h3 class="panel-section__title">分辨率</h3>
        <div class="seg-control" id="wanVideoResSelector">
          <button class="seg-btn" data-res="720P">720P (0.6元/秒)</button>
          <button class="seg-btn active" data-res="1080P">1080P (1.0元/秒)</button>
        </div>
      </div>
      <div class="panel-section">
        <h3 class="panel-section__title">画面比例</h3>
        <div class="seg-control seg-control--wrap" id="wanVideoRatioSelector">
          <button class="seg-btn seg-btn--sm active" data-ratio="16:9">16:9</button>
          <button class="seg-btn seg-btn--sm" data-ratio="9:16">9:16</button>
          <button class="seg-btn seg-btn--sm" data-ratio="1:1">1:1</button>
          <button class="seg-btn seg-btn--sm" data-ratio="4:3">4:3</button>
          <button class="seg-btn seg-btn--sm" data-ratio="3:4">3:4</button>
        </div>
      </div>
      <div class="panel-section">
        <h3 class="panel-section__title">时长（秒）</h3>
        <div class="seg-control" id="wanVideoDurSelector">
          <button class="seg-btn" data-dur="2">2s</button>
          <button class="seg-btn active" data-dur="5">5s</button>
          <button class="seg-btn" data-dur="10">10s</button>
          <button class="seg-btn" data-dur="15">15s</button>
        </div>
      </div>
      <div class="panel-section">
        <h3 class="panel-section__title">反向提示词</h3>
        <textarea class="input-textarea" id="wanVideoNegPrompt" placeholder="不想要的元素..." rows="2"></textarea>
      </div>
      <div class="panel-section panel-hint">
        <p>💡 视频生成需要数分钟，请耐心等待。生成完成后可直接预览和下载。</p>
      </div>
    `,
    lighting: () => `
      <div class="lighting-workspace" id="lightingWorkspace">
        <!-- 顶部：模式切换 -->
        <div class="lighting-mode-tabs" id="lightingModeTabs">
          <button class="lighting-tab active" data-ltab="manual"><span>🎯</span>手动打光</button>
          <button class="lighting-tab" data-ltab="smart"><span>💡</span>智能模式</button>
        </div>

        <!-- 手动打光区域 -->
        <div class="lighting-manual" id="lightingManual">
          <!-- 坐标球区域 -->
          <div class="lighting-coords">
            <!-- 主光坐标球 -->
            <div class="coord-section">
              <div class="coord-section__header">
                <span class="coord-section__label">主光</span>
                <span class="coord-section__name" id="mainLightName">未设置</span>
              </div>
              <div class="coord-ball-wrap coord-ball-wrap--3d">
                <div id="mainLightBall" class="coord-ball-3d"></div>
                <div class="coord-ball-hint">拖动旋转 · 点击选位置</div>
              </div>
            </div>
            <!-- 轮廓光坐标球 -->
            <div class="coord-section">
              <div class="coord-section__header">
                <span class="coord-section__label">轮廓光</span>
                <label class="coord-toggle">
                  <input type="checkbox" id="rimLightToggle" />
                  <span class="coord-toggle__track"></span>
                  <span class="coord-toggle__label">开启</span>
                </label>
              </div>
              <div class="coord-ball-wrap coord-ball-wrap--3d coord-ball-wrap--rim" id="rimBallWrap">
                <div id="rimLightBall" class="coord-ball-3d coord-ball-3d--rim"></div>
                <div class="coord-ball-hint">拖动旋转 · 点击选位置</div>
              </div>
            </div>
          </div>

          <!-- 参数调节区 -->
          <div class="lighting-params">
            <!-- 亮度 -->
            <div class="lighting-param">
              <div class="lighting-param__header">
                <span class="lighting-param__label">亮度</span>
                <span class="lighting-param__value" id="brightnessValue">—</span>
              </div>
              <div class="brightness-slider" id="brightnessSlider">
                <div class="brightness-slider__track">
                  <div class="brightness-slider__fill" id="brightnessFill"></div>
                  <div class="brightness-slider__thumb" id="brightnessThumb"></div>
                </div>
                <div class="brightness-slider__ticks">
                  <span data-val="10">10%</span>
                  <span data-val="30">30%</span>
                  <span data-val="50" class="active">50%</span>
                  <span data-val="75">75%</span>
                  <span data-val="100">100%</span>
                </div>
              </div>
            </div>

            <!-- 颜色 -->
            <div class="lighting-param">
              <div class="lighting-param__header">
                <span class="lighting-param__label">光源颜色</span>
                <span class="lighting-param__value" id="lightColorValue">—</span>
              </div>
              <div class="color-picker-row">
                <div class="color-presets" id="lightColorPresets">
                  <button class="color-preset active" data-color="" style="background:#fff;" title="无（白色）"></button>
                  <button class="color-preset" data-color="#FFB347" style="background:#FFB347;" title="暖黄"></button>
                  <button class="color-preset" data-color="#87CEEB" style="background:#87CEEB;" title="天蓝"></button>
                  <button class="color-preset" data-color="#98FB98" style="background:#98FB98;" title="嫩绿"></button>
                  <button class="color-preset" data-color="#FF6B6B" style="background:#FF6B6B;" title="日落红"></button>
                  <button class="color-preset" data-color="#DDA0DD" style="background:#DDA0DD;" title="紫色"></button>
                  <button class="color-preset" data-color="#F0E68C" style="background:#F0E68C;" title="金黄"></button>
                </div>
                <label class="color-custom-btn" title="自定义颜色">
                  <input type="color" id="lightColorCustom" value="#ffffff" />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </label>
              </div>
            </div>

            <!-- 主光预设 -->
            <div class="lighting-param">
              <div class="lighting-param__header">
                <span class="lighting-param__label">主光预设</span>
              </div>
              <div class="lighting-preset-grid" id="lightingPresets">
                <button class="lighting-preset-btn active" data-preset="front"><span>前</span>正面光</button>
                <button class="lighting-preset-btn" data-preset="rembrandt"><span>🦁</span>伦勃朗</button>
                <button class="lighting-preset-btn" data-preset="butterfly"><span>🦋</span>蝴蝶光</button>
                <button class="lighting-preset-btn" data-preset="split"><span>🎭</span>分割光</button>
                <button class="lighting-preset-btn" data-preset="side"><span>⬅️</span>侧光</button>
                <button class="lighting-preset-btn" data-preset="bottom"><span>⬆️</span>底光</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 智能模式区域 -->
        <div class="lighting-smart hidden" id="lightingSmart">
          <div class="smart-mode-desc">
            <p>通过文字描述打光氛围，或上传参考图，AI 将自动分析并应用打光效果。</p>
          </div>
          <div class="smart-mode-inputs">
            <div class="smart-ref-upload" id="lightingRefUpload">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span>上传打光参考图</span>
              <input type="file" accept="image/*" id="lightingRefInput" hidden />
            </div>
            <div class="smart-prompt-hint" id="lightingSmartHint">
              例如：「戏剧性的侧光，营造神秘氛围，橙色调」
            </div>
          </div>
        </div>
      </div>
    `,
    grid: () => `
      <div class="panel-section">
        <h3 class="panel-section__title">宫格类型</h3>
        <div class="item-grid" id="gridTypes">
          <button class="item-btn active" data-type="9cam"><span class="item-btn__icon">📷</span><span>多机位<br/>九宫格</span></button>
          <button class="item-btn" data-type="4story"><span class="item-btn__icon">📖</span><span>剧情<br/>四宫格</span></button>
          <button class="item-btn" data-type="25board"><span class="item-btn__icon">🎬</span><span>25格<br/>分镜</span></button>
        </div>
      </div>
      <div class="panel-section">
        <p class="panel-hint">💡 每个格子独立生成一张图，描述中写主体内容即可。AI 会自动分配不同机位/场景/视角。生成后可组合拼图。</p>
      </div>
    `,
    multiangle: () => `
      <div class="panel-section">
        <h3 class="panel-section__title">视角方案</h3>
        <div class="item-grid" id="multiangleTypes">
          <button class="item-btn active" data-type="3view"><span class="item-btn__icon">🔄</span><span>角色<br/>三视图</span></button>
          <button class="item-btn" data-type="8dir"><span class="item-btn__icon">🌀</span><span>8方向<br/>环绕</span></button>
          <button class="item-btn" data-type="15full"><span class="item-btn__icon">🌐</span><span>15角度<br/>全视角</span></button>
        </div>
      </div>

      <div class="panel-section">
        <p class="panel-hint">💡 每个格子独立生成一张图，描述中写主体内容即可。AI 会自动分配不同机位/场景/视角。生成后可组合拼图。</p>
      </div>
    `,

    camera_view: () => `
      <div class="panel-section">
        <h3 class="panel-section__title">三维相机视角</h3>
        <div class="camera-view-workspace">
          <div class="camera-view-left">
            <div class="camera-ball-container" id="cameraViewBall"></div>
            <p class="camera-ball-hint" id="cameraBallHint">拖动旋转 · 点击球面定位</p>
          </div>
          <div class="camera-view-right">
            <div class="camera-param">
              <div class="camera-param__header">
                <span class="camera-param__label">俯仰角 (Pitch)</span>
                <span class="camera-param__value" id="pitchValue">0°</span>
              </div>
              <div class="camera-slider" id="pitchSlider">
                <div class="camera-slider__track">
                  <div class="camera-slider__fill" id="pitchFill" style="width:50%"></div>
                  <div class="camera-slider__thumb" id="pitchThumb" style="left:50%"></div>
                </div>
              </div>
            </div>
            <div class="camera-param">
              <div class="camera-param__header">
                <span class="camera-param__label">偏航角 (Yaw)</span>
                <span class="camera-param__value" id="yawValue">0°</span>
              </div>
              <div class="camera-slider" id="yawSlider">
                <div class="camera-slider__track">
                  <div class="camera-slider__fill" id="yawFill" style="width:50%"></div>
                  <div class="camera-slider__thumb" id="yawThumb" style="left:50%"></div>
                </div>
              </div>
            </div>
            <div class="camera-param">
              <div class="camera-param__header">
                <span class="camera-param__label">视野角 (FOV)</span>
                <span class="camera-param__value" id="fovValue">50°</span>
              </div>
              <div class="camera-slider" id="fovSlider">
                <div class="camera-slider__track">
                  <div class="camera-slider__fill" id="fovFill" style="width:37.5%"></div>
                  <div class="camera-slider__thumb" id="fovThumb" style="left:37.5%"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="panel-section">
        <h3 class="panel-section__title">景别 Shot Type</h3>
        <div class="camera-shot-grid" id="cameraShotGrid">
          <button class="camera-shot-btn active" data-shot="extreme-wide" title="极远景">
            <span class="shot-icon">🖼</span><span>极远景</span>
          </button>
          <button class="camera-shot-btn" data-shot="full-shot" title="全景">
            <span class="shot-icon">🌄</span><span>全景</span>
          </button>
          <button class="camera-shot-btn" data-shot="medium-shot" title="中景">
            <span class="shot-icon">👤</span><span>中景</span>
          </button>
          <button class="camera-shot-btn" data-shot="close-up" title="近景">
            <span class="shot-icon">🎯</span><span>近景</span>
          </button>
          <button class="camera-shot-btn" data-shot="extreme-close-up" title="特写">
            <span class="shot-icon">👁</span><span>特写</span>
          </button>
        </div>
      </div>

      <div class="panel-section">
        <h3 class="panel-section__title">预设视角</h3>
        <div class="camera-presets" id="cameraPresets">
          <button class="camera-preset-btn active" data-pitch="0" data-yaw="0" data-shot="medium-shot" title="正面中景"><span class="preset-icon">F</span><br><span>正面</span></button>
          <button class="camera-preset-btn" data-pitch="0" data-yaw="45" data-shot="medium-shot" title="前右中景"><span class="preset-icon">FR</span><br><span>前右</span></button>
          <button class="camera-preset-btn" data-pitch="0" data-yaw="90" data-shot="medium-shot" title="侧面中景"><span class="preset-icon">R</span><br><span>侧面</span></button>
          <button class="camera-preset-btn" data-pitch="0" data-yaw="-45" data-shot="medium-shot" title="前左中景"><span class="preset-icon">FL</span><br><span>前左</span></button>
          <button class="camera-preset-btn" data-pitch="0" data-yaw="135" data-shot="medium-shot" title="后右"><span class="preset-icon">BR</span><br><span>后右</span></button>
          <button class="camera-preset-btn" data-pitch="0" data-yaw="-90" data-shot="medium-shot" title="左侧面"><span class="preset-icon">L</span><br><span>左侧面</span></button>
          <button class="camera-preset-btn" data-pitch="25" data-yaw="0" data-shot="close-up" title="前高近景"><span class="preset-icon">FH</span><br><span>前高</span></button>
          <button class="camera-preset-btn" data-pitch="-25" data-yaw="0" data-shot="close-up" title="前低近景"><span class="preset-icon">FL</span><br><span>前低</span></button>
          <button class="camera-preset-btn" data-pitch="0" data-yaw="180" data-shot="medium-shot" title="背面"><span class="preset-icon">B</span><br><span>背面</span></button>
        </div>
      </div>

      <div class="panel-section">
        <div class="camera-custom-toggle">
          <div class="camera-custom-toggle__header">
            <label class="toggle-switch">
              <input type="checkbox" id="cameraCustomModeToggle">
              <span class="toggle-slider"></span>
            </label>
            <span>自定义调整（三维球+滑块控制视角）</span>
          </div>
          <p class="camera-custom-toggle__hint">开启后，可拖拽三维球或调整滑块自由设置视角，关闭预设高亮</p>
        </div>
      </div>

      <div class="panel-section">
        <div class="camera-extra-prompt">
          <div class="camera-extra-prompt__header">
            <label class="toggle-switch">
              <input type="checkbox" id="cameraExtraPromptToggle">
              <span class="toggle-slider"></span>
            </label>
            <span>额外提示词（强化视角效果）</span>
          </div>
          <textarea class="input-textarea camera-extra-prompt__input" id="cameraExtraPrompt" rows="2" placeholder="输入镜头效果，如：鱼眼、移轴、柔焦、光晕..."></textarea>
        </div>
      </div>

      <div class="panel-section">
        <div class="camera-preview-row">
          <span class="camera-preview-label">当前视角：</span>
          <span class="camera-preview-text" id="cameraPreviewText">正面中景 · 50mm · 自然透视</span>
        </div>
      </div>

      <div class="panel-section">
        <button class="btn btn--primary btn--full" id="cameraViewConfirmBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          确定 — 添加镜头效果
        </button>
      </div>

      <div class="panel-section">
        <p class="panel-hint">💡 预设视角一键设置，自定义模式自由调整。推荐配合参考图使用效果更佳。</p>
      </div>
    `
  };

  function renderSubPanel(tab) {
    const body = $('subPanelBody');
    if (!body) return;
    const tpl = PANEL_TEMPLATES[tab];
    if (tpl) body.innerHTML = tpl();

    // 重新绑定面板内的事件
    if (tab === 'creative') loadTemplates();
    if (tab === 'wearables') bindWearableTypes();
    if (tab === 'model') bindModelTypes();
    if (tab === 'retouch') bindRetouchTypes();
    if (tab === 'cutout') bindCutoutTypes();
    if (tab === 'background') bindBgTypes();
    if (tab === 'edit') bindEditTypes();
    if (tab === 'wan-image') bindWanImageTypes();
    if (tab === 'wan-video') bindWanVideoTypes();
    if (tab === 'lighting') bindLightingTypes();
    if (tab === 'grid') bindGridTypes();
    if (tab === 'multiangle') bindMultiangleTypes();
    if (tab === 'camera_view')  bindCameraViewTypes();
  }

  // ===================== 控制台按钮 =====================
  function bindControlDock() {
    // 参考图条切换
    $('btnToggleRef')?.addEventListener('click', () => {
      const refSection = $('refSection');
      const btn = $('btnToggleRef');
      if (refSection) {
        refSection.classList.toggle('hidden');
        btn?.classList.toggle('active', !refSection.classList.contains('hidden'));
      }
    });

    // 选项面板切换
    $('btnToggleSubPanel')?.addEventListener('click', () => {
      toggleSubPanel();
    });

    // 子面板关闭
    $('closeSubPanel')?.addEventListener('click', () => toggleSubPanel(false));
    $('subPanelOverlay')?.addEventListener('click', () => toggleSubPanel(false));
  }

  // ===================== 并行任务面板 =====================
  function bindTaskPanel() {
    // 切换任务面板
    $('btnToggleTaskPanel')?.addEventListener('click', () => {
      const panel = $('taskPanel');
      panel?.classList.toggle('hidden');
    });

    // 新建任务按钮（面板内）
    $('btnNewTask')?.addEventListener('click', () => {
      TaskManager.add();
      $('taskPanel')?.classList.remove('hidden');
    });

    // 关闭面板时不清空任务
    // ESC 关闭面板
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') $('taskPanel')?.classList.add('hidden');
    });
  }

  function toggleSubPanel(forceState) {
    const panel = $('subPanel');
    const overlay = $('subPanelOverlay');
    const btn = $('btnToggleSubPanel');
    const isOpen = forceState !== undefined ? forceState : !panel?.classList.contains('open');

    panel?.classList.toggle('open', isOpen);
    overlay?.classList.toggle('hidden', !isOpen);
    btn?.classList.toggle('active', isOpen);

    // 打开时渲染当前 Tab 内容
    if (isOpen) renderSubPanel(S.tab);
  }

  // ===================== 子选项绑定 =====================
  function bindWearableTypes() {
    const container = document.querySelector('#subPanelBody #wearableTypes');
    if (!container) return;
    container.querySelectorAll('.item-btn').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', () => {
        container.querySelectorAll('.item-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        S.subType.wearable = btn.dataset.type;
        applyPresetPrompt('wearables', btn.dataset.type);
        updateRefHint(S.tab);
        if (btn.dataset.type === 'custom') {
          S.refImages.main = [];
          renderRefGrid();
          updateRefAddBtnVisibility();
        }
      });
    });
    if (!S.subType.wearable) S.subType.wearable = 'bag';
  }

  function bindModelTypes() {
    const container = document.querySelector('#subPanelBody #modelTypes');
    if (!container) return;
    container.querySelectorAll('.item-btn').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', () => {
        container.querySelectorAll('.item-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        S.subType.model = btn.dataset.type;
        applyPresetPrompt('model', btn.dataset.type);
        const faceSection = $('modelFaceRefSection');
        if (faceSection) faceSection.style.display = btn.dataset.type === 'face' ? 'block' : 'none';
      });
    });
    if (!S.subType.model) { S.subType.model = 'face'; bindFaceRefUpload(); }
  }

  function bindRetouchTypes() {
    const container = document.querySelector('#subPanelBody #retouchTypes');
    if (!container) return;
    container.querySelectorAll('.item-btn').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', () => {
        container.querySelectorAll('.item-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        S.subType.retouch = btn.dataset.type;
        applyPresetPrompt('retouch', btn.dataset.type);
      });
    });
    if (!S.subType.retouch) S.subType.retouch = 'refine';
  }

  function bindCutoutTypes() {
    const container = document.querySelector('#subPanelBody #cutoutTypes');
    if (!container) return;
    container.querySelectorAll('.item-btn').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', () => {
        container.querySelectorAll('.item-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        S.subType.cutout = btn.dataset.type;
        // 抠图不需要预设提示词，清空输入框
        S.prompt = '';
        $('promptInput').value = '';
        updatePromptCounter();
      });
    });
    if (!S.subType.cutout) S.subType.cutout = 'white';
  }

  function bindBgTypes() {
    const container = document.querySelector('#subPanelBody #bgTypes');
    if (!container) return;
    container.querySelectorAll('.item-btn').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', () => {
        container.querySelectorAll('.item-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        S.subType.background = btn.dataset.type;
        applyPresetPrompt('background', btn.dataset.type);
        const colorSection = $('bgColorSection');
        if (colorSection) colorSection.style.display = btn.dataset.type === 'solid' ? 'block' : 'none';
      });
    });
    if (!S.subType.background) S.subType.background = 'indoor';
    $('bgColorInput')?.addEventListener('input', e => { $('bgColorHex').value = e.target.value; });
    $('bgColorHex')?.addEventListener('input', e => {
      if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) $('bgColorInput').value = e.target.value;
    });
  }

  function bindEditTypes() {
    const container = document.querySelector('#subPanelBody #editTypes');
    if (!container) return;
    container.querySelectorAll('.item-btn').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', () => {
        container.querySelectorAll('.item-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        S.subType.edit = btn.dataset.type;
        applyPresetPrompt('edit', btn.dataset.type);
      });
    });
    if (!S.subType.edit) S.subType.edit = 'recolor';
  }

  // ===================== 光影工坊 Tab =====================
  function bindLightingTypes() {
    // 初始化光影状态
    if (!S.subType.mainLight) {
      S.subType.mainLight = { x: 0.5, y: 0.3 }; // 前上方
      S.subType.rimLight = { x: 0.5, y: 0.6, enabled: false };
      S.subType.brightness = 50;
      S.subType.lightColor = '';
    }
    initLightingBall();
    initRimBall();
    bindLightingModes();
    bindBrightnessSlider();
    bindColorPickers();
    bindLightingPresets();
    bindLightingRefUpload();
    updateLightingPrompt();
  }

  // 预设光位映射（preset id -> LIGHT_POSITIONS_3D id）
  const PRESET_LIGHT_MAP = {
    front:     'front',
    rembrandt: 'tl',
    butterfly: 'top',
    split:     'l',
    side:      'l',
    bottom:    'bottom',
  };

  // ===================== 3D 球初始化 =====================
  // 3D 主光位置：球坐标转换为 3D 单位球坐标 (x,y,z)
  // Z 正方向朝前（朝向相机）
  function to3D(x2d, y2d, inFront = true) {
    // x2d/y2d 是归一化的 0-1 位置
    // front hemisphere: x=[0..1], y=[0..0.5]
    const r = 1;
    const theta = (1 - y2d) * Math.PI * 0.55;  // polar angle from top
    const phi = (x2d - 0.5) * Math.PI * 1.2;   // azimuth
    const x = r * Math.sin(theta) * Math.sin(phi);
    const y = r * Math.cos(theta);
    const z = inFront ? r * Math.abs(Math.sin(theta) * Math.cos(phi)) : -r * Math.abs(Math.sin(theta) * Math.cos(phi));
    return { x, y, z };
  }

  // 构建 3D 光源位置
  const LIGHT_POSITIONS_3D = [
    { ...to3D(0.50, 0.35, true),  id: 'front',   label: '正面光',  zPositive: true },
    { ...to3D(0.50, 0.18, true),  id: 'top',     label: '顶光',    zPositive: true },
    { ...to3D(0.27, 0.22, true),  id: 'tl',      label: '左前上方', zPositive: true },
    { ...to3D(0.73, 0.22, true),  id: 'tr',      label: '右前上方', zPositive: true },
    { ...to3D(0.16, 0.35, true),  id: 'l',       label: '左侧光',  zPositive: true },
    { ...to3D(0.84, 0.35, true),  id: 'r',       label: '右侧光',  zPositive: true },
    { ...to3D(0.27, 0.48, true),  id: 'bl',      label: '左前下方', zPositive: true },
    { ...to3D(0.73, 0.48, true),  id: 'br',      label: '右前下方', zPositive: true },
    { ...to3D(0.50, 0.52, true),  id: 'bottom',  label: '底光',    zPositive: false },
    { ...to3D(0.22, 0.14, true),  id: 'tlt',     label: '左上角',  zPositive: true },
    { ...to3D(0.78, 0.14, true),  id: 'rt',      label: '右上角',  zPositive: true },
    { ...to3D(0.28, 0.35, true),  id: 'fl',      label: '左斜前',  zPositive: true },
    { ...to3D(0.72, 0.35, true),  id: 'fr',      label: '右斜前',  zPositive: true },
    { ...to3D(0.50, 0.35, true),  id: 'c',       label: '中心',    zPositive: true },
    // 后半球 - 淡化显示
    { ...to3D(0.50, 0.35, false), id: 'back_c',  label: '背面中',  zPositive: false },
    { ...to3D(0.22, 0.14, false), id: 'back_tl', label: '背左上',  zPositive: false },
    { ...to3D(0.78, 0.14, false), id: 'back_tr', label: '背右上',  zPositive: false },
    { ...to3D(0.16, 0.35, false), id: 'back_l',  label: '背左侧',  zPositive: false },
    { ...to3D(0.84, 0.35, false), id: 'back_r',  label: '背右侧',  zPositive: false },
  ];

  const RIM_POSITIONS_3D = [
    { x: -0.7, y: 0.6, z: -0.4, id: 'rb1', label: '背上左' },
    { x:  0,   y: 0.8, z: -0.6, id: 'rb2', label: '背正中上' },
    { x:  0.7, y: 0.6, z: -0.4, id: 'rb3', label: '背上右' },
    { x: -0.85,y: 0,   z: -0.5, id: 'rm1', label: '背左侧' },
    { x:  0,   y: 0,   z: -1,   id: 'rm2', label: '背正中央' },
    { x:  0.85,y: 0,   z: -0.5, id: 'rm3', label: '背右侧' },
    { x: -0.7, y:-0.6, z: -0.4, id: 'rf1', label: '背下左' },
    { x:  0,  y:-0.8,  z: -0.6, id: 'rf2', label: '背正下' },
    { x:  0.7, y:-0.6, z: -0.4, id: 'rf3', label: '背下右' },
  ];

  let mainBall3D = null;
  let rimBall3D = null;

  function initLightingBall() {
    const container = $('mainLightBall');
    if (!container || typeof THREE === 'undefined') return;

    // Destroy old instance
    if (mainBall3D) { mainBall3D.destroy(); mainBall3D = null; }

    const savedId = S.subType.mainLight?.id || 'front';
    const positions = LIGHT_POSITIONS_3D.map(p => ({
      ...p,
      visible: p.zPositive !== false
    }));

    mainBall3D = window.LightingBallManager.create('mainLightBall', {
      positions,
      selectedId: savedId,
      isRim: false,
      onSelect: (id, pos) => {
        if (!pos || pos.zPositive === false) return; // Don't select back positions
        S.subType.mainLight = { id: pos.id, x: pos.x, y: pos.y, z: pos.z, label: pos.label };
        $('mainLightName').textContent = pos.label || '未设置';
        document.querySelectorAll('.lighting-preset-btn').forEach(b => b.classList.remove('active'));
        updateLightingPrompt();
      }
    });

    if (savedId !== 'front') {
      const pos = positions.find(p => p.id === savedId);
      if (pos) $('mainLightName').textContent = pos.label || '未设置';
    }
  }

  function initRimBall() {
    const container = $('rimLightBall');
    const wrap = $('rimBallWrap');
    if (!container || typeof THREE === 'undefined') return;

    if (rimBall3D) { rimBall3D.destroy(); rimBall3D = null; }

    const enabled = S.subType.rimLight?.enabled || false;
    const savedId = S.subType.rimLight?.id || null;

    if (wrap) {
      wrap.classList.toggle('disabled', !enabled);
    }

    rimBall3D = window.LightingBallManager.create('rimLightBall', {
      positions: RIM_POSITIONS_3D,
      selectedId: enabled ? savedId : null,
      isRim: true,
      onSelect: (id, pos) => {
        S.subType.rimLight = { ...S.subType.rimLight, id: pos.id, x: pos.x, y: pos.y, z: pos.z, label: pos.label, enabled: true };
        if ($('rimLightToggle')) $('rimLightToggle').checked = true;
        if (wrap) wrap.classList.remove('disabled');
        updateLightingPrompt();
      }
    });
  }

  // ===================== 亮度滑块 =====================
  function bindBrightnessSlider() {
    const track = $('brightnessSlider');
    const thumb = $('brightnessThumb');
    const fill = $('brightnessFill');
    const valDisplay = $('brightnessValue');
    const ticks = track?.querySelectorAll('.brightness-slider__ticks span');
    if (!track || !thumb) return;

    let dragging = false;

    function setBrightness(val) {
      const clamped = Math.max(10, Math.min(100, val));
      S.subType.brightness = clamped;
      const pct = (clamped - 10) / 90 * 100;
      thumb.style.left = pct + '%';
      fill.style.width = pct + '%';
      valDisplay.textContent = clamped + '%';
      ticks?.forEach(t => {
        const tv = parseInt(t.dataset.val);
        t.classList.toggle('active', tv === clamped || (clamped < tv && clamped > parseInt(t.previousElementSibling?.dataset?.val || tv)));
      });
      updateLightingPrompt();
    }

    track.addEventListener('mousedown', e => {
      dragging = true;
      updateFromMouse(e);
    });
    document.addEventListener('mousemove', e => { if (dragging) updateFromMouse(e); });
    document.addEventListener('mouseup', () => dragging = false);

    ticks?.forEach(t => t.addEventListener('click', () => setBrightness(parseInt(t.dataset.val))));

    function updateFromMouse(e) {
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setBrightness(Math.round(10 + pct * 90));
    }

    // 初始化
    setBrightness(S.subType.brightness || 50);
  }

  // ===================== 颜色选择器 =====================
  function bindColorPickers() {
    const presets = document.querySelectorAll('.color-preset');
    const customInput = $('lightColorCustom');
    const valDisplay = $('lightColorValue');

    function setColor(hex) {
      S.subType.lightColor = hex;
      presets.forEach(p => {
        p.classList.toggle('active', p.dataset.color === hex);
      });
      if (customInput) customInput.value = hex || '#ffffff';
      valDisplay.textContent = hex ? hex.toUpperCase() : '无（白色）';
      valDisplay.style.color = hex || '#666';
      updateLightingPrompt();
    }

    presets.forEach(btn => {
      btn.addEventListener('click', () => setColor(btn.dataset.color));
    });

    customInput?.addEventListener('input', e => {
      setColor(e.target.value);
    });

    setColor(S.subType.lightColor || '');
  }

  // ===================== 预设按钮 =====================
  function bindLightingPresets() {
    const btns = document.querySelectorAll('.lighting-preset-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const presetId = btn.dataset.preset;
        const posId = PRESET_LIGHT_MAP[presetId];
        const pos = LIGHT_POSITIONS_3D.find(p => p.id === posId && p.zPositive !== false);
        if (pos) {
          S.subType.mainLight = { id: pos.id, x: pos.x, y: pos.y, z: pos.z, label: pos.label };
          $('mainLightName').textContent = pos.label;
          if (mainBall3D) mainBall3D.setSelected(pos.id);
        }
        updateLightingPrompt();
      });
    });
  }

  // ===================== 模式切换 =====================
  function bindLightingModes() {
    const tabs = document.querySelectorAll('.lighting-tab');
    const manual = $('lightingManual');
    const smart = $('lightingSmart');
    const rimToggle = $('rimLightToggle');
    const rimWrap = $('rimBallWrap');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const isManual = tab.dataset.ltab === 'manual';
        manual?.classList.toggle('hidden', !isManual);
        smart?.classList.toggle('hidden', isManual);
      });
    });

    // 轮廓光开关
    rimToggle?.addEventListener('change', e => {
      S.subType.rimLight = { ...S.subType.rimLight, enabled: e.target.checked };
      rimWrap?.classList.toggle('disabled', !e.target.checked);
      if (!e.target.checked) {
        // 关闭时清空 3D 球选中
        if (rimBall3D) rimBall3D.setSelected(null);
      } else {
        initRimBall();
      }
      updateLightingPrompt();
    });

    if ($('rimLightToggle')) $('rimLightToggle').checked = S.subType.rimLight?.enabled || false;
  }

  // ===================== 智能模式上传 =====================
  function bindLightingRefUpload() {
    const upload = $('lightingRefUpload');
    const input = $('lightingRefInput');
    upload?.addEventListener('click', () => input?.click());
    input?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        S.subType.lightingRefImg = ev.target.result;
        upload.innerHTML = `<img src="${ev.target.result}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;" />`;
        upload.style.border = '1.5px dashed var(--border-accent)';
        updateLightingPrompt();
      };
      reader.readAsDataURL(file);
    });
  }

  // ===================== 生成打光描述词 =====================
  function buildLightingPrompt() {
    const mode = S.subType.lightingTab || 'manual';
    const main = S.subType.mainLight;
    const rim = S.subType.rimLight;
    const bright = S.subType.brightness;
    const color = S.subType.lightColor;

    if (mode === 'smart') {
      const refImg = S.subType.lightingRefImg;
      return { prompt: 'Professional intelligent relighting: analyze reference image lighting and apply similar dramatic studio lighting to the subject, preserve original composition, commercial-grade quality', refImages: refImg ? [refImg] : [] };
    }

    // 亮度描述
    let brightDesc = '';
    if (bright === 10) brightDesc = 'extremely dark, moody low-key lighting';
    else if (bright <= 30) brightDesc = 'low key, dramatic shadow';
    else if (bright <= 50) brightDesc = 'balanced studio exposure';
    else if (bright <= 75) brightDesc = 'bright, well-lit';
    else brightDesc = 'high key, bright overexposed effect';

    // 颜色描述
    let colorDesc = '';
    if (color === '#FFB347') colorDesc = 'warm orange tungsten light';
    else if (color === '#87CEEB') colorDesc = 'cool blue daylight';
    else if (color === '#98FB98') colorDesc = 'fresh green accent light';
    else if (color === '#FF6B6B') colorDesc = 'warm sunset red accent';
    else if (color === '#DDA0DD') colorDesc = 'purple accent light';
    else if (color === '#F0E68C') colorDesc = 'golden warm light';
    else if (color) colorDesc = `colored light (${color})`;

    // 主光位置描述
    let lightDesc = '';
    if (main?.label) {
      const label = main.label;
      if (label.includes('左')) lightDesc = 'key light from the left side';
      else if (label.includes('右')) lightDesc = 'key light from the right side';
      else if (label.includes('顶')) lightDesc = 'overhead key light';
      else if (label.includes('底')) lightDesc = 'underneath uplighting';
      else lightDesc = `key light at ${label}`;
    }

    // 轮廓光描述
    let rimDesc = '';
    if (rim?.enabled && rim?.id) {
      const rimLabel = RIM_POSITIONS_3D.find(r => r.id === rim.id)?.label || '';
      if (rimLabel.includes('背左') || rimLabel.includes('背侧')) rimDesc = 'strong rim light from back left creating hair light separation';
      else if (rimLabel.includes('背右')) rimDesc = 'strong rim light from back right';
      else rimDesc = 'dramatic rim light from behind creating silhouette separation';
    }

    // 组合
    const parts = [
      'Fashion photography, professional commercial quality',
      lightDesc,
      brightDesc,
      colorDesc,
      rimDesc,
      'preserve original subject and composition',
      'high-end studio lighting setup'
    ].filter(Boolean);

    return { prompt: parts.join(', '), refImages: [] };
  }

  function updateLightingPrompt() {
    const ta = $('promptInput');
    if (!ta) return;
    const { prompt, refImages } = buildLightingPrompt();
    ta.value = prompt;
    S.prompt = prompt;
    S.promptRefImages = refImages;
    updatePromptCounter();
  }


  // ===================== 宫格生成 Tab =====================
  function bindGridTypes() {
    const GRID_MAP = { '9cam': 'nine', '4story': 'story4', '25board': 'storyboard25' };
    function fillGridPrompt() {
      const gridType = S.subType.grid || '9cam';
      const gpKey = GRID_MAP[gridType] || 'nine';
      const gp = window.GRID_PRESETS?.[gpKey];
      const ta = $('promptInput');
      if (!ta || !gp) return;
      const base = 'Professional fashion photography, high-end editorial quality';
      if (gpKey === 'nine' && gp.angles?.[0]) {
        ta.value = `${base}, ${gp.angles[0].prompt} (共${gp.angles.length}个机位，将自动生成全部)`;
      } else if (gpKey === 'story4' && gp.stages?.[0]) {
        ta.value = `${base}, ${gp.stages[0].prompt} (起承转合共${gp.stages.length}帧，将自动生成全部)`;
      } else {
        ta.value = `${base}, storyboard sequence (共25帧，将自动生成全部)`;
      }
      S.prompt = ta.value;
      updatePromptCounter();
    }
    const container = document.querySelector('#subPanelBody #gridTypes');
    if (!container) return;
    container.querySelectorAll('.item-btn').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', () => {
        container.querySelectorAll('.item-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        S.subType.grid = btn.dataset.type;
        fillGridPrompt();
      });
    });
    if (!S.subType.grid) S.subType.grid = '9cam';
    fillGridPrompt();
  }

  // ===================== 相机视角控制 =====================
  let cameraViewBall = null;

  function initCameraViewBall() {
    const container = $('cameraViewBall');
    console.log('[initCameraViewBall] Container:', container);
    console.log('[initCameraViewBall] THREE defined:', typeof THREE !== 'undefined');
    if (!container || typeof THREE === 'undefined') {
      console.error('[initCameraViewBall] Failed: container or THREE missing');
      return;
    }
    if (cameraViewBall) { cameraViewBall.destroy(); cameraViewBall = null; }
    cameraViewBall = window.CameraViewManager.create('cameraViewBall', {
      pitch: S.subType.cameraPitch || 0,
      yaw: S.subType.cameraYaw || 0,
      fov: S.subType.cameraFov || 50,
      onChange: function(values) {
        // 仅在自定义模式下响应三维球操作
        if (S.subType.cameraCustomMode) {
          S.subType.cameraPitch = values.pitch;
          S.subType.cameraYaw = values.yaw;
          S.subType.cameraFov = values.fov;
          updateCameraUI(values);
          updateCameraPreviewText();
        }
      }
    });
  }

  function initCameraSliders() {
    var pitchSlider = $('pitchSlider');
    if (pitchSlider) setupSlider(pitchSlider, -90, 90, S.subType.cameraPitch || 0, function(val) {
      // 仅在自定义模式下响应
      if (S.subType.cameraCustomMode) {
        S.subType.cameraPitch = val;
        if (cameraViewBall) cameraViewBall.setPitch(val);
        updateCameraUI({ pitch: val, yaw: S.subType.cameraYaw || 0, fov: S.subType.cameraFov || 50 });
        updateCameraPreviewText();
      }
    });

    var yawSlider = $('yawSlider');
    if (yawSlider) setupSlider(yawSlider, -180, 180, S.subType.cameraYaw || 0, function(val) {
      // 仅在自定义模式下响应
      if (S.subType.cameraCustomMode) {
        S.subType.cameraYaw = val;
        if (cameraViewBall) cameraViewBall.setYaw(val);
        updateCameraUI({ pitch: S.subType.cameraPitch || 0, yaw: val, fov: S.subType.cameraFov || 50 });
        updateCameraPreviewText();
      }
    });

    var fovSlider = $('fovSlider');
    if (fovSlider) setupSlider(fovSlider, 20, 120, S.subType.cameraFov || 50, function(val) {
      S.subType.cameraFov = val;
      if (cameraViewBall) cameraViewBall.setFov(val);
      updateCameraUI({ pitch: S.subType.cameraPitch || 0, yaw: S.subType.cameraYaw || 0, fov: val });
      updateCameraPreviewText();
    });
  }

  function setupSlider(sliderEl, min, max, initVal, onChange) {
    var track = sliderEl.querySelector('.camera-slider__track');
    var fill = sliderEl.querySelector('.camera-slider__fill');
    var thumb = sliderEl.querySelector('.camera-slider__thumb');
    if (!track || !fill || !thumb) return;

    function updateUI(val) {
      var pct = ((val - min) / (max - min)) * 100;
      fill.style.width = pct + '%';
      thumb.style.left = pct + '%';
    }

    function setFromEvent(e) {
      var rect = track.getBoundingClientRect();
      var pct = (e.clientX - rect.left) / rect.width;
      pct = Math.max(0, Math.min(1, pct));
      var val = Math.round(min + pct * (max - min));
      updateUI(val);
      onChange(val);
    }

    var dragging = false;
    track.addEventListener('mousedown', function(e) { dragging = true; setFromEvent(e); });
    document.addEventListener('mousemove', function(e) { if (dragging) setFromEvent(e); });
    document.addEventListener('mouseup', function() { dragging = false; });

    updateUI(initVal);
  }

  function updateCameraUI(values) {
    var pv = $('pitchValue');
    var yv = $('yawValue');
    var fv = $('fovValue');
    if (pv) pv.textContent = values.pitch + '\u00B0';
    if (yv) yv.textContent = values.yaw + '\u00B0';
    if (fv) fv.textContent = values.fov + '\u00B0';
  }

  function initCameraPresets() {
    var presets = document.querySelectorAll('.camera-preset-btn');
    presets.forEach(function(btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function() {
        presets.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var pitch = parseInt(btn.dataset.pitch);
        var yaw = parseInt(btn.dataset.yaw);
        var shot = btn.dataset.shot || 'medium-shot';
        S.subType.cameraPitch = pitch;
        S.subType.cameraYaw = yaw;
        S.subType.cameraShot = shot;
        S.subType.cameraCustomMode = false;  // 取消自定义模式
        if (cameraViewBall) cameraViewBall.setAngles(pitch, yaw);
        updateCameraUI({ pitch: pitch, yaw: yaw, fov: S.subType.cameraFov || 50 });
        // 更新景别按钮高亮
        document.querySelectorAll('.camera-shot-btn').forEach(function(b) {
          b.classList.toggle('active', b.dataset.shot === shot);
        });
        updateCameraPreviewText();
        updateCustomModeUI();
      });
    });
  }

  function initCameraExtraPrompt() {
    var toggle = $('cameraExtraPromptToggle');
    var input = $('cameraExtraPrompt');
    if (toggle) {
      toggle.checked = S.subType.cameraExtraEnabled || false;
      toggle.addEventListener('change', function() {
        S.subType.cameraExtraEnabled = toggle.checked;
      });
    }
    if (input) {
      input.value = S.subType.cameraExtraPrompt || '';
      input.addEventListener('input', function() {
        S.subType.cameraExtraPrompt = input.value;
      });
    }
  }

  // ===================== 相机视角 Prompt 拼接 =====================
  // 景别（Shot Type）映射表
  const SHOT_PRESETS = {
    'extreme-wide': {
      name: '极远景',
      desc: '',
      label: '极远景'
    },
    'full-shot': {
      name: '全景',
      desc: '',
      label: '全景'
    },
    'medium-shot': {
      name: '中景',
      desc: '',
      label: '中景'
    },
    'close-up': {
      name: '近景',
      desc: '',
      label: '近景'
    },
    'extreme-close-up': {
      name: '特写',
      desc: '',
      label: '特写'
    }
  };

  // 专业摄影术语映射（精确角度描述）
  function getCameraViewSnippet() {
    const pitch = S.subType.cameraPitch || 0;
    const yaw = S.subType.cameraYaw || 0;
    const fov = S.subType.cameraFov || 50;
    const shot = S.subType.cameraShot || 'medium-shot';
    const shotPreset = SHOT_PRESETS[shot] || SHOT_PRESETS['medium-shot'];

    // 俯仰角 → 精确摄影角度描述
    // 注意：三维球中 y > 0 表示相机指向下方（俯拍），y < 0 表示相机指向上方（仰拍）
    // 所以 pitch > 0 = 俯拍，pitch < 0 = 仰拍
    let angleDesc;
    if (pitch >= 30) angleDesc = `high angle camera, shooting downward ${pitch}°, bird's eye view, subject appears smaller`;
    else if (pitch >= 15) angleDesc = `slightly high angle, downward ${pitch}° tilt, overhead perspective`;
    else if (pitch >= 5) angleDesc = `slightly high angle, ${pitch}° downward tilt, subtle overhead`;
    else if (pitch <= -30) angleDesc = `low angle camera, shooting upward ${Math.abs(pitch)}°, heroizing perspective, imposing presence`;
    else if (pitch <= -15) angleDesc = `slightly low angle, upward ${Math.abs(pitch)}° tilt, dignified perspective`;
    else if (pitch <= -5) angleDesc = `slightly low angle, ${Math.abs(pitch)}° upward tilt, subtle hero framing`;
    else if (Math.abs(pitch) <= 3) angleDesc = `eye-level camera, horizontal gaze, neutral angle`;
    else angleDesc = `camera tilted ${pitch}°`;

    // 偏航角 → 精确位置描述（包含具体度数）
    let positionDesc;
    const absYaw = Math.abs(yaw);
    const yawDir = yaw > 0 ? 'right' : yaw < 0 ? 'left' : '';
    
    if (absYaw <= 15 || absYaw >= 165) {
      positionDesc = 'frontal view, camera faces subject directly';
    } else if (absYaw <= 45) {
      positionDesc = `quarter turn, 3/4 view, ${absYaw}° ${yawDir} rotation`;
    } else if (absYaw <= 75) {
      positionDesc = `profile view, ${absYaw}° ${yawDir} side presentation`;
    } else if (absYaw <= 105) {
      positionDesc = `three-quarter back view, rear ${yawDir === 'right' ? 'right' : 'left'} quarter, ${absYaw}° from back`;
    } else if (absYaw <= 135) {
      positionDesc = `back-three-quarter view, rear side at ${absYaw}°`;
    } else {
      positionDesc = `back view, rear presentation, ${absYaw}° from front`;
    }

    // FOV → 焦距和透视
    let lensDesc;
    if (fov <= 25) lensDesc = `super telephoto ${fov}mm, extreme background compression`;
    else if (fov <= 35) lensDesc = `telephoto ${fov}mm, strong compression, bokeh background`;
    else if (fov <= 50) lensDesc = `standard ${fov}mm lens, natural perspective`;
    else if (fov <= 65) lensDesc = `wide ${fov}mm lens, slight environmental context`;
    else if (fov <= 85) lensDesc = `wide angle ${fov}mm, expanded perspective, immersive`;
    else lensDesc = `ultra wide ${fov}mm, strong perspective distortion`;

    let extra = '';
    if (S.subType.cameraExtraEnabled && S.subType.cameraExtraPrompt) {
      extra = `, ${S.subType.cameraExtraPrompt}`;
    }

    // 构建综合摄影描述
    const fixedPrompt = '发挥想象力根据以下的提示词修改画面镜头：';
    const parts = [angleDesc, positionDesc, lensDesc];
    if (extra) parts.push(extra);

    return fixedPrompt + ' ' + parts.filter(p => p).join('; ');
  }

  // 更新当前视角预览文本
  function updateCameraPreviewText() {
    const el = $('cameraPreviewText');
    if (!el) return;
    const shot = S.subType.cameraShot || 'medium-shot';
    const shotPreset = SHOT_PRESETS[shot] || SHOT_PRESETS['medium-shot'];
    const fov = S.subType.cameraFov || 50;
    const pitch = S.subType.cameraPitch || 0;
    const yaw = S.subType.cameraYaw || 0;

    // 简化的方位描述
    let dir = '正面';
    const absYaw = Math.abs(yaw);
    if (absYaw > 20 && absYaw <= 75) dir = yaw > 0 ? '右侧' : '左侧';
    else if (absYaw > 75 && absYaw <= 115) dir = yaw > 0 ? '后右' : '后左';
    else if (absYaw > 115) dir = '背面';

    // 注意：pitch > 0 是俯拍（相机在上方朝下），pitch < 0 是仰拍（相机在下方朝上）
    let height = '';
    if (pitch >= 25) height = '俯拍';
    else if (pitch >= 10) height = '微俯';
    else if (pitch <= -25) height = '仰拍';
    else if (pitch <= -10) height = '微仰';
    else height = '平视';

    let lens = '';
    if (fov <= 35) lens = '长焦';
    else if (fov <= 65) lens = '标准';
    else if (fov <= 100) lens = '广角';

    el.textContent = `${height}${dir} · ${shotPreset.label} · ${lens}`;
  }

  // 初始化景别按钮
  function initCameraShotTypes() {
    var btns = document.querySelectorAll('.camera-shot-btn');
    btns.forEach(function(btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function() {
        btns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        S.subType.cameraShot = btn.dataset.shot;
        // 自定义模式下切换景别也取消预设选中
        if (S.subType.cameraCustomMode) {
          document.querySelectorAll('.camera-preset-btn').forEach(function(b) {
            b.classList.remove('active');
          });
        }
        updateCameraPreviewText();
      });
    });
  }

  // 初始化自定义模式开关
  function initCameraCustomMode() {
    var toggle = $('cameraCustomModeToggle');
    var hint = $('cameraBallHint');
    if (!toggle) return;
    
    toggle.addEventListener('change', function() {
      S.subType.cameraCustomMode = toggle.checked;
      updateCustomModeUI();
    });
  }

  // 更新自定义模式 UI 状态
  function updateCustomModeUI() {
    var toggle = $('cameraCustomModeToggle');
    var hint = $('cameraBallHint');
    if (!toggle) return;
    
    toggle.checked = S.subType.cameraCustomMode;
    
    if (hint) {
      if (S.subType.cameraCustomMode) {
        hint.textContent = '自定义模式 · 可拖拽调整';
        hint.style.color = '#10b981';
      } else {
        hint.textContent = '拖动旋转 · 点击球面定位';
        hint.style.color = '';
      }
    }
  }

  // 点击确定时：将专业相机约束写入主 prompt
  function applyCameraViewPrompt() {
    const ta = $('promptInput');
    if (!ta) return;
    const mainPrompt = ta.value.trim();

    // 三维球生成的精确镜头角度描述
    const cameraSnippet = getCameraViewSnippet();

    // 相机控制约束（固定不变）
    const constraintPart = `严格的相机RE定位：这仅仅是相机角度的改变。所有视觉元素必须保持绝对一致，唯一允许的改变是：相机角度、相机高度、相机距离、镜头焦距、透视畸变 —— 其他一概不变。`;

    // 负约束（固定不变）
    const negPart = `不同的主体、不同的面部、不同的服装、不同的姿势、不同的背景、颜色偏移、光照变化、额外的物体、缺失的物体、比例改变`;

    // 组装：用户内容 + 固定约束
    const userPart = mainPrompt ? mainPrompt + '\n\n' : '';
    const full = `${userPart}## 相机控制
${constraintPart}

## 摄影描述
${cameraSnippet}

## 负约束
(${negPart})`;

    ta.value = full;
    S.prompt = full;
    updatePromptCounter();
    showToast('相机视角约束已加入提示词 ✅', 'success');
  }

  // ===================== 多角度 Tab =====================
  function bindMultiangleTypes() {
    const MA_MAP = { '3view': 'triview', '8dir': 'surround8', '15full': 'multi15' };
    function fillMultianglePrompt() {
      const maType = S.subType.multiangle || '3view';
      const maKey = MA_MAP[maType] || 'triview';
      const ma = window.MULTIANGLE_PRESETS?.[maKey];
      const ta = $('promptInput');
      if (!ta || !ma) return;
      const base = 'Character design showcase, professional fashion photography, clean background';
      const sample = ma.angles?.[0]?.prompt || '';
      ta.value = sample ? base + ', ' + sample + ' (共' + ma.angles.length + '个角度，将自动生成全部)' : base + ', multi-angle view';
      S.prompt = ta.value;
      updatePromptCounter();
    }
    const container = document.querySelector('#subPanelBody #multiangleTypes');
    if (!container) return;

    container.querySelectorAll('.item-btn').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', () => {
        container.querySelectorAll('.item-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        S.subType.multiangle = btn.dataset.type;
        fillMultianglePrompt();
      });
    });
    if (!S.subType.multiangle) S.subType.multiangle = '3view';
    fillMultianglePrompt();
  }

  // ===================== 相机视角 Tab =====================
  function bindCameraViewTypes() {
    // 初始化相机视角 3D 球
    initCameraViewBall();
    initCameraSliders();
    initCameraShotTypes();
    initCameraPresets();
    initCameraCustomMode();  // 初始化自定义模式开关
    initCameraExtraPrompt();
    updateCameraPreviewText();
    updateCustomModeUI();  // 更新自定义模式 UI 状态
    // 确定按钮：点击后将相机约束写入主 prompt
    var confirmBtn = $('cameraViewConfirmBtn');
    if (confirmBtn && !confirmBtn._bound) {
      confirmBtn._bound = true;
      confirmBtn.addEventListener('click', applyCameraViewPrompt);
    }
  }

  // ===================== Wan 图像 Tab =====================
  function bindWanImageTypes() {
    // 模型选择
    const modelSel = document.querySelector('#wanImageModelSelector');
    if (modelSel) {
      modelSel.querySelectorAll('.seg-btn').forEach(btn => {
        if (btn._bound) return;
        btn._bound = true;
        btn.addEventListener('click', () => {
          modelSel.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          S.wan.imageModel = btn.dataset.model;
          localStorage.setItem('fs_wan_image_model', S.wan.imageModel);
          // Pro 版才能选 2048
          const proBtn = modelSel.parentElement.querySelector('.wan-size-pro');
          if (proBtn) proBtn.style.opacity = S.wan.imageModel === 'wan2.7-image-pro' ? '1' : '0.4';
        });
      });
    }

    // 数量选择
    const nSel = document.querySelector('#wanImageNSelector');
    if (nSel) {
      nSel.querySelectorAll('.seg-btn').forEach(btn => {
        if (btn._bound) return;
        btn._bound = true;
        btn.addEventListener('click', () => {
          nSel.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          S.wan.imageN = parseInt(btn.dataset.n);
        });
      });
    }

    // 分辨率选择
    const sizeSel = document.querySelector('#wanImageSizeSelector');
    if (sizeSel) {
      sizeSel.querySelectorAll('.seg-btn').forEach(btn => {
        if (btn._bound) return;
        btn._bound = true;
        btn.addEventListener('click', () => {
          if (btn.dataset.size === '2048*2048' && S.wan.imageModel !== 'wan2.7-image-pro') {
            showToast('4K 分辨率仅 Pro 版可用', 'warning');
            return;
          }
          sizeSel.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
      // 初始化 Pro 按钮状态
      const proBtn = sizeSel.querySelector('.wan-size-pro');
      if (proBtn) proBtn.style.opacity = S.wan.imageModel === 'wan2.7-image-pro' ? '1' : '0.4';
    }

    // 思维模式
    const thinkCb = $('wanThinkingMode');
    if (thinkCb && !thinkCb._bound) {
      thinkCb._bound = true;
      thinkCb.addEventListener('change', () => { S.wan.thinkingMode = thinkCb.checked; });
    }

    // 参考图数量上限
    const origProcessFiles = processFiles;
  }

  // ===================== Wan 视频 Tab =====================
  function bindWanVideoTypes() {
    // 模式选择（文生视频 / 图生视频）
    const modeContainer = document.querySelector('#wanVideoModes');
    if (modeContainer) {
      modeContainer.querySelectorAll('.item-btn').forEach(btn => {
        if (btn._bound) return;
        btn._bound = true;
        btn.addEventListener('click', () => {
          modeContainer.querySelectorAll('.item-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          S.wan.videoMode = btn.dataset.mode;
          // 图生视频模式需要显示参考图区域
          updateRefHint('wan-video');
        });
      });
      if (!S.wan.videoMode) S.wan.videoMode = 't2v';
    }

    // 分辨率
    const resSel = document.querySelector('#wanVideoResSelector');
    if (resSel) {
      resSel.querySelectorAll('.seg-btn').forEach(btn => {
        if (btn._bound) return;
        btn._bound = true;
        btn.addEventListener('click', () => {
          resSel.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          S.wan.videoResolution = btn.dataset.res;
        });
      });
    }

    // 比例
    const ratioSel = document.querySelector('#wanVideoRatioSelector');
    if (ratioSel) {
      ratioSel.querySelectorAll('.seg-btn').forEach(btn => {
        if (btn._bound) return;
        btn._bound = true;
        btn.addEventListener('click', () => {
          ratioSel.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          S.wan.videoRatio = btn.dataset.ratio;
        });
      });
    }

    // 时长
    const durSel = document.querySelector('#wanVideoDurSelector');
    if (durSel) {
      durSel.querySelectorAll('.seg-btn').forEach(btn => {
        if (btn._bound) return;
        btn._bound = true;
        btn.addEventListener('click', () => {
          durSel.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          S.wan.videoDuration = parseInt(btn.dataset.dur);
        });
      });
    }
  }

  function applyPresetPrompt(category, type) {
    const preset = PRESET_PROMPTS[category]?.[type];
    if (!preset) return;
    const prompt = typeof preset === 'string' ? preset : preset.prompt;
    if (!prompt) return;

    const extraMap = { wearables: 'wearableDesc', model: 'modelBgDesc', retouch: 'retouchDesc', background: 'bgDesc', edit: 'editDesc' };
    const extraId = extraMap[category];
    const extra = extraId ? ($(extraId)?.value || '').trim() : '';

    const finalPrompt = extra ? `${prompt}\n\n用户补充：${extra}` : prompt;
    S.prompt = finalPrompt;
    $('promptInput').value = finalPrompt;
    updatePromptCounter();
  }

  // ===================== Prompt =====================
  function bindPrompt() {
    const ta = $('promptInput');
    ta.addEventListener('input', () => { S.prompt = ta.value; updatePromptCounter(); });
    $('btnClearPrompt')?.addEventListener('click', () => { ta.value = ''; S.prompt = ''; updatePromptCounter(); });
    $('btnEnhance')?.addEventListener('click', enhancePrompt);
    updatePromptCounter();
  }

  function updatePromptCounter() {
    const len = $('promptInput')?.value.length || 0;
    const el = $('promptCounter');
    const max = (S.tab === 'wan-image' || S.tab === 'wan-video') ? 5000 : 500;
    if (el) el.textContent = `${len} / ${max}`;
  }

  const ENHANCE_TEMPLATES = [
    '，专业摄影棚灯光，高清质感，8K分辨率',
    '，法式氛围，电影感色调，暖色调',
    '，杂志封面级别，商业大片质感',
    '，自然采光，柔和阴影，精准色彩还原',
    '，韩系清新风格，奶油色调，轻柔光线'
  ];

  // Agent 优化后的结果暂存
  let _lastAgentResult = null;

  async function enhancePrompt() {
    if (S.enhancing) return;
    const ta = $('promptInput');
    const base = ta.value.trim();
    if (!base) { showToast('请先输入一些描述', 'warning'); return; }

    // 检查 Agent 是否可用
    if (!PROMPT_AGENT.isReady()) {
      // 降级：使用旧的模板追加模式
      showToast('Agent 未配置，使用快速优化模式', 'info');
      S.enhancing = true;
      const btn = $('btnEnhance');
      if (btn) { btn.disabled = true; btn.textContent = '✨ 优化中…'; }
      try {
        const extra = ENHANCE_TEMPLATES[Math.floor(Math.random() * ENHANCE_TEMPLATES.length)];
        const enhanced = base + extra;
        ta.value = enhanced; S.prompt = enhanced; updatePromptCounter();
        showToast('Prompt 优化完成 ✨', 'success');
      } catch (e) { showToast('优化失败：' + e.message, 'error'); }
      finally { S.enhancing = false; if (btn) { btn.disabled = false; btn.textContent = '🤖 AI优化'; } }
      return;
    }

    // Agent 模式
    S.enhancing = true;
    const btn = $('btnEnhance');
    const panel = $('agentPanel');
    const thinkingEl = $('agentThinking');
    const enhancedEl = $('agentEnhanced');
    const labelEl = $('agentPanelLabel');
    const sourceEl = $('agentSource');

    if (btn) { btn.disabled = true; btn.textContent = '🤖 思考中…'; }
    if (panel) panel.classList.remove('hidden');
    if (thinkingEl) thinkingEl.innerHTML = '<span class="agent-panel__loading">正在分析你的描述...</span>';
    if (enhancedEl) enhancedEl.innerHTML = '';
    if (labelEl) labelEl.textContent = 'Agent 分析中...';

    const status = PROMPT_AGENT.getStatus();
    if (sourceEl) {
      sourceEl.textContent = status.source === 'blooom'
        ? `BLOOOOM · ${status.model}`
        : `百炼 · ${status.model}`;
    }

    try {
      const result = await PROMPT_AGENT.optimize(base, {
        signal: (new AbortController()).signal
      });
      _lastAgentResult = result;

      // 显示思考过程
      if (thinkingEl) {
        thinkingEl.innerHTML = `<p>${escapeHtml(result.thinking)}</p>`;
      }
      // 显示优化后的 prompt
      if (enhancedEl) {
        enhancedEl.textContent = result.enhanced;
      }
      if (labelEl) labelEl.textContent = 'Agent 分析完成';

      // 高亮差异
      highlightDiff(base, result.enhanced);

    } catch (e) {
      if (e.name !== 'AbortError') {
        if (thinkingEl) thinkingEl.innerHTML = `<p class="agent-panel__error">优化失败：${escapeHtml(e.message)}</p>`;
        if (labelEl) labelEl.textContent = '优化失败';
        showToast('Agent 优化失败：' + e.message, 'error');
      }
    } finally {
      S.enhancing = false;
      if (btn) { btn.disabled = false; btn.textContent = '🤖 AI优化'; }
    }
  }

  // 采纳 Agent 优化结果
  function applyAgentResult() {
    if (!_lastAgentResult) { showToast('没有可采纳的优化结果', 'warning'); return; }
    const ta = $('promptInput');
    if (ta) {
      ta.value = _lastAgentResult.enhanced;
      S.prompt = _lastAgentResult.enhanced;
      updatePromptCounter();
      showToast('已采纳 Agent 优化结果 ✅', 'success');
    }
  }

  // 关闭 Agent 面板
  function closeAgentPanel() {
    const panel = $('agentPanel');
    if (panel) panel.classList.add('hidden');
  }

  // 高亮原始 prompt 与优化结果的差异
  function highlightDiff(original, enhanced) {
    const enhancedEl = $('agentEnhanced');
    if (!enhancedEl) return;
    // 找出新增的部分
    if (enhanced.startsWith(original.trim()) || enhanced.includes(original.trim())) {
      // 原始部分普通显示，新增部分高亮
      const idx = enhanced.indexOf(original.trim());
      if (idx >= 0) {
        const before = enhanced.slice(0, idx);
        const match = enhanced.slice(idx, idx + original.trim().length);
        const after = enhanced.slice(idx + original.trim().length);
        enhancedEl.innerHTML = `${escapeHtml(before)}<span class="agent-diff__original">${escapeHtml(match)}</span><span class="agent-diff__added">${escapeHtml(after)}</span>`;
      } else {
        enhancedEl.textContent = enhanced;
      }
    } else {
      // 完全重写，整体高亮
      enhancedEl.innerHTML = `<span class="agent-diff__added">${escapeHtml(enhanced)}</span>`;
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Agent 面板事件绑定
  function bindAgentPanel() {
    $('btnAgentApply')?.addEventListener('click', applyAgentResult);
    $('btnAgentRetry')?.addEventListener('click', () => {
      _lastAgentResult = null;
      enhancePrompt();
    });
    $('btnAgentClose')?.addEventListener('click', closeAgentPanel);
  }

  // ===================== 模型选择 =====================
  function bindModelSelector() {
    const saved = localStorage.getItem('fs_default_model') || 'flash';
    $$('#modelSelector .seg-btn').forEach(btn => {
      if (btn.dataset.model === saved) btn.classList.add('active');
      else btn.classList.remove('active');
      btn.addEventListener('click', () => {
        $$('#modelSelector .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        S.model = btn.dataset.model;
        localStorage.setItem('fs_default_model', S.model);
        updateModelInfoDisplay(S.model);
      });
    });
  }

  function updateModelInfoDisplay(modelId) {
    const labels = {
      flash:   'BLOOOOM Flash',
      pro:     'BLOOOOM Pro'
    };
    const models = {
      flash:   'gemini-3.1-flash-image-preview',
      pro:     'gemini-3-pro-image-preview'
    };
    const infoEl = $('currentModelInfo');
    if (infoEl) infoEl.innerHTML = `<span class="form-badge">${labels[modelId] || 'BLOOOOM'}</span><span class="form-hint">${models[modelId] || ''}</span>`;
  }

  // ===================== 比例选择 =====================
  function bindAspectSelector() {
    $$('#aspectSelector .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#aspectSelector .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        S.aspect = btn.dataset.aspect;
      });
    });
  }

  // ===================== 分辨率选择 =====================
  function bindQualitySelector() {
    $$('#qualitySelector .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#qualitySelector .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        S.quality = btn.dataset.quality;
      });
    });
  }

  // ===================== 生成逻辑 =====================
  function bindGenerate() { $('btnGenerate')?.addEventListener('click', generate); }

  async function generate() {
    const prompt = $('promptInput')?.value.trim();
    if (S.tab !== 'cutout' && S.tab !== 'wan-video' && !prompt) { showToast('请输入描述', 'warning'); return; }

    // Wan Tab 使用独立 Key 检查
    const isWanTab = S.tab === 'wan-image' || S.tab === 'wan-video';
    if (isWanTab) {
      if (!WAN_API.hasKey()) { showToast('请先在设置中填写万相 Wan API Key', 'error'); $('settingsModal').classList.remove('hidden'); return; }
    } else {
      if (!API_CLIENT.hasKey()) { showToast('请先在设置中填写 API Key', 'error'); $('settingsModal').classList.remove('hidden'); return; }
    }

    showLoading(true);
    const signal = (new AbortController()).signal;
    let results = [];

    try {
      const refs = S.refImages.main || [];
      const faceRef = S.refImages.face || null;
      const isAuto = S.aspect === 'auto';

      // ============ Wan 图像 Tab ============
      if (S.tab === 'wan-image') {
        const negPrompt = $('wanNegPrompt')?.value.trim() || '';
        const sizeBtn = document.querySelector('#wanImageSizeSelector .seg-btn.active');
        const size = sizeBtn?.dataset.size || '1024*1024';

        results = await WAN_API.textToImage({
          prompt,
          negativePrompt: negPrompt,
          model: S.wan.imageModel,
          size,
          n: S.wan.imageN,
          thinkingMode: S.wan.thinkingMode,
          refImages: refs,
          refPrompt: prompt,
          signal
        });

        S.results = results;
        showResults(results, prompt);
        saveToHistory({ tab: S.tab, prompt, results, model: S.wan.imageModel });
        persistResults(results, prompt, S.tab); // 存入 IndexedDB
        showToast('万相生图完成 🎉', 'success');
        showLoading(false);
        return;
      }

      // ============ Wan 视频 Tab ============
      if (S.tab === 'wan-video') {
        const negPrompt = $('wanVideoNegPrompt')?.value.trim() || '';
        const mode = S.wan.videoMode || 't2v';

        // 更新加载文案
        $('loadingText').textContent = '视频生成中，请耐心等待...';
        $('loadingSub').textContent = '预计 1-5 分钟';

        let videoResult;
        if (mode === 'i2v' && refs.length > 0) {
          // 图生视频
          videoResult = await WAN_API.imageToVideo({
            prompt: prompt || '根据首帧图片生成自然流畅的视频',
            imageBase64: refs[0],
            resolution: S.wan.videoResolution,
            ratio: S.wan.videoRatio,
            duration: S.wan.videoDuration,
            signal,
            onProgress: (status, elapsed) => {
              const mins = Math.floor(elapsed / 60);
              const secs = elapsed % 60;
              $('loadingSub').textContent = status === 'RUNNING'
                ? `已等待 ${mins}:${secs.toString().padStart(2, '0')}，视频渲染中...`
                : `已等待 ${mins}:${secs.toString().padStart(2, '0')}，排队中...`;
            }
          });
        } else {
          // 文生视频
          videoResult = await WAN_API.textToVideo({
            prompt,
            negativePrompt: negPrompt,
            resolution: S.wan.videoResolution,
            ratio: S.wan.videoRatio,
            duration: S.wan.videoDuration,
            signal,
            onProgress: (status, elapsed) => {
              const mins = Math.floor(elapsed / 60);
              const secs = elapsed % 60;
              $('loadingSub').textContent = status === 'RUNNING'
                ? `已等待 ${mins}:${secs.toString().padStart(2, '0')}，视频渲染中...`
                : `已等待 ${mins}:${secs.toString().padStart(2, '0')}，排队中...`;
            }
          });
        }

        // 恢复加载文案
        $('loadingText').textContent = '正在生成，请稍候...';
        $('loadingSub').textContent = '预计 10-30 秒';

        S.results = [{ url: videoResult.url, isVideo: true, duration: videoResult.duration }];
        showVideoResult(videoResult, prompt);
        saveToHistory({ tab: S.tab, prompt, results: S.results, model: 'wan2.7-t2v' });
        showToast('万相视频生成完成 🎬', 'success');
        showLoading(false);
        return;
      }

      // ============ BLOOOOM 系列（原有逻辑不变）============
      const { dataUrl: compositeMain, width: compositeW, height: compositeH } =
        refs.length > 0 ? await compositeImages(refs, isAuto) : { dataUrl: null, width: 0, height: 0 };

      const editAspect = isAuto ? _dimsToAspect(compositeW, compositeH) : S.aspect;

      switch (S.tab) {
        case 'creative': {
          if (refs.length > 0) {
            results = await API_CLIENT.imageEdit({ prompt, imageBase64: compositeMain, provider: S.model, aspect: editAspect, quality: S.quality, signal });
          } else {
            results = await API_CLIENT.textToImage({ prompt, provider: S.model, count: S.count, aspect: S.aspect, quality: S.quality, signal });
          }
          break;
        }
        case 'wearables': {
          const isDualMode = S.subType.wearable === 'custom' && refs.length === 2;
          if (isDualMode) {
            if (!prompt.trim()) { showToast('请填写提示词描述要做什么', 'warning'); showLoading(false); return; }
            results = await API_CLIENT.imageEdit({ prompt, imageBase64: refs, provider: S.model, aspect: 'auto', quality: S.quality, signal });
          } else {
            if (!compositeMain) { showToast('请上传参考图', 'warning'); showLoading(false); return; }
            results = await API_CLIENT.imageEdit({ prompt, imageBase64: compositeMain, provider: S.model, aspect: editAspect, quality: S.quality, signal });
          }
          break;
        }
        case 'model':
          if (S.subType.model === 'face' && faceRef) {
            results = await API_CLIENT.imageEdit({ prompt: '将原图中人物面部替换为参考图中的面部，保持原图的发型、身体、服装、姿势、光影完全不变。', imageBase64: compositeMain, provider: S.model, aspect: editAspect, quality: S.quality, signal });
          } else {
            results = await API_CLIENT.imageEdit({ prompt, imageBase64: compositeMain, provider: S.model, aspect: editAspect, quality: S.quality, signal });
          }
          break;
        case 'retouch':
          results = await API_CLIENT.imageEdit({ prompt, imageBase64: compositeMain, provider: S.model, aspect: editAspect, quality: S.quality, signal });
          break;
        case 'cutout': {
          if (!compositeMain) { showToast('请先上传待抠图片', 'warning'); showLoading(false); return; }

          // 更新加载文案
          $('loadingText').textContent = '智能抠图中，请稍候...';
          $('loadingSub').textContent = '正在识别主体并移除背景';

          const imageBase64 = compositeMain;

          results = await API_CLIENT.removeBackground({
            imageBase64,
            signal,
            onProgress: (task) => {
              const statusMap = {
                'processing': '正在抠图处理...',
                'succeeded': '处理完成',
                'failed': '处理失败'
              };
              $('loadingSub').textContent = statusMap[task.status] || `状态: ${task.status}`;
            }
          });

          // 恢复加载文案
          $('loadingText').textContent = '正在生成，请稍候...';
          $('loadingSub').textContent = '预计 10-30 秒';
          break;
        }
        case 'background': {
          let bgPrompt = prompt;
          if (S.subType.background === 'solid') {
            const color = $('bgColorHex')?.value || '#ffffff';
            bgPrompt = `将商品置于纯色背景，背景颜色：${color}，保持商品原有质感、光影、颜色不变。`;
          }
          results = await API_CLIENT.imageEdit({ prompt: bgPrompt, imageBase64: compositeMain, provider: S.model, aspect: editAspect, quality: S.quality, signal });
          break;
        }
        case 'edit':
          results = await API_CLIENT.imageEdit({ prompt, imageBase64: compositeMain, provider: S.model, aspect: editAspect, quality: S.quality, signal });
          break;
        case 'lighting': {
          const lightTab = S.subType.lightingTab || 'manual';

          if (lightTab === 'smart') {
            // 智能模式：支持参考图
            const refImg = S.promptRefImages?.[0];
            const imgToUse = refImg || compositeMain;
            if (!imgToUse) { showToast('智能打光请上传原图或打光参考图', 'warning'); showLoading(false); return; }
            const lp = prompt || 'Professional intelligent relighting: analyze reference image lighting and apply similar dramatic studio lighting to the subject, preserve original composition, commercial-grade quality';
            results = await API_CLIENT.imageEdit({ prompt: lp, imageBase64: imgToUse, provider: S.model, aspect: editAspect, quality: S.quality, signal });
          } else {
            // 手动模式：使用 buildLightingPrompt 的结果
            const { prompt: lightPrompt } = buildLightingPrompt();
            const fullPrompt = lightPrompt || prompt || 'Fashion photography, professional studio lighting';
            if (compositeMain) {
              results = await API_CLIENT.imageEdit({ prompt: fullPrompt, imageBase64: compositeMain, provider: S.model, aspect: editAspect, quality: S.quality, signal });
            } else {
              results = await API_CLIENT.textToImage({ prompt: fullPrompt, provider: S.model, count: S.count, aspect: S.aspect, quality: S.quality, signal });
            }
          }
          break;
        }
        case 'grid': {
          const gridType = S.subType.grid || '9cam';
          // 使用 prompts.js 中的 GRID_PRESETS
          const GRID_MAP = { '9cam': 'nine', '4story': 'story4', '25board': 'storyboard25' };
          const gpKey = GRID_MAP[gridType] || 'nine';
          const gridPreset = window.GRID_PRESETS?.[gpKey];

          const desc = gridPreset?.desc || `${gridPreset?.name || '宫格生成'}`;
          let shots;
          if (gpKey === 'nine' && gridPreset?.angles) {
            shots = gridPreset.angles.map(a => a.prompt);
          } else if (gpKey === 'story4' && gridPreset?.stages) {
            shots = gridPreset.stages.map(s => s.prompt);
          } else if (gpKey === 'storyboard25') {
            shots = Array.from({length: 25}, (_, i) => `storyboard frame ${i+1}, sequential action, continuous narrative flow`);
          } else {
            shots = ['professional fashion photography, commercial quality'];
          }

          const basePrompt = prompt ? prompt.replace(/\s*\(共.*?\)\s*$/, '').trim() : 'Professional fashion photography, high-end editorial quality';
          showToast(`${desc}：将依次生成 ${shots.length} 张图，请耐心等待...`, 'info');
          results = [];
          for (let i = 0; i < shots.length; i++) {
            const fullPrompt = `${basePrompt}, ${shots[i]}`;
            try {
              const res = refs.length > 0
                ? await API_CLIENT.imageEdit({ prompt: fullPrompt, imageBase64: compositeMain, provider: S.model, aspect: 'auto', quality: S.quality, signal })
                : await API_CLIENT.textToImage({ prompt: fullPrompt, provider: S.model, count: 1, aspect: 'auto', quality: S.quality, signal });
              if (res?.length) results.push(...res);
              const loadingSub = $('loadingSub');
              if (loadingSub) {
                loadingSub.textContent = `${desc}：${i + 1} / ${shots.length} 完成`;
              }
            } catch (e) {
              console.warn(`宫格第${i+1}张生成失败:`, e);
            }
          }
          if (results.length === 0) { showToast('所有宫格图生成失败', 'error'); showLoading(false); return; }
          showToast(`${desc}完成，共 ${results.length} 张 ✅`, 'success');
          break;
        }
        case 'multiangle': {
          const maType = S.subType.multiangle || '3view';
          // 使用 prompts.js 中的 MULTIANGLE_PRESETS
          const MA_MAP = { '3view': 'triview', '8dir': 'surround8', '15full': 'multi15' };
          const maKey = MA_MAP[maType] || 'triview';
          const maPreset = window.MULTIANGLE_PRESETS?.[maKey];

          const desc = maPreset?.desc || maPreset?.name || '多角度生成';
          const shots = maPreset?.angles
            ? maPreset.angles.map(a => a.prompt)
            : ['front view, professional photography'];

          const basePrompt = prompt ? prompt.replace(/\s*\(共.*?\)\s*$/, '').trim() : 'Character design showcase, professional fashion photography, clean white or light gray background';
          showToast(`${desc}：将依次生成 ${shots.length} 张图，请耐心等待...`, 'info');
          results = [];
          for (let i = 0; i < shots.length; i++) {
            const fullPrompt = `${basePrompt}, ${shots[i]}`;
            try {
              const res = refs.length > 0
                ? await API_CLIENT.imageEdit({ prompt: fullPrompt, imageBase64: compositeMain, provider: S.model, aspect: 'auto', quality: S.quality, signal })
                : await API_CLIENT.textToImage({ prompt: fullPrompt, provider: S.model, count: 1, aspect: 'auto', quality: S.quality, signal });
              if (res?.length) results.push(...res);
              const loadingSub = $('loadingSub');
              if (loadingSub) {
                loadingSub.textContent = `${desc}：${i + 1} / ${shots.length} 完成`;
              }
            } catch (e) {
              console.warn(`多角度第${i+1}张生成失败:`, e);
            }
          }
          if (results.length === 0) { showToast('所有角度图生成失败', 'error'); showLoading(false); return; }
          showToast(`${desc}完成，共 ${results.length} 张 ✅`, 'success');
          break;
        }
        case 'camera_view': {
          // 相机视角：prompt 由用户点击确定按钮通过 applyCameraViewPrompt() 写入主 prompt 框
          const camPrompt = prompt || 'Professional fashion photography, high-end editorial quality';
          const loadingSub = $('loadingSub');
          if (loadingSub) loadingSub.textContent = '相机视角生成中...';
          try {
            results = refs.length > 0
              ? await API_CLIENT.imageEdit({ prompt: camPrompt, imageBase64: compositeMain, provider: S.model, aspect: editAspect, quality: S.quality, signal })
              : await API_CLIENT.textToImage({ prompt: camPrompt, provider: S.model, count: S.count, aspect: S.aspect, quality: S.quality, signal });
          } catch (e) {
            console.warn('相机视角生成失败:', e);
            results = [];
          }
          if (results.length === 0) { showToast('相机视角图生成失败', 'error'); showLoading(false); return; }
          showToast('相机视角完成 ✅', 'success');
          break;
        }
        default:
          results = await API_CLIENT.textToImage({ prompt, provider: S.model, count: S.count, aspect: S.aspect, quality: S.quality, signal });
      }

      S.results = results;
      showResults(results, prompt);
      saveToHistory({ tab: S.tab, prompt, results, aspect: S.aspect, quality: S.quality, model: S.model });
      persistResults(results, prompt, S.tab); // 存入 IndexedDB
      showToast('生成完成 🎉', 'success');
    } catch (e) {
      if (e.name !== 'AbortError') {
        const msg = e.message || (typeof e === 'object' ? JSON.stringify(e) : String(e));
        showToast('生成失败：' + msg, 'error');
      }
    } finally { showLoading(false); }
  }

  // ===================== 加载/结果/下载 =====================
  function showLoading(on) {
    $('loadingState')?.classList.toggle('hidden', !on);
    $('results')?.classList.toggle('hidden', on);
    $('emptyState')?.classList.toggle('hidden', !on);
    $('infoPanel')?.classList.toggle('hidden', on);
    const btn = $('btnGenerate'); if (btn) btn.disabled = on;
    if (on) {
      $('loadingText').textContent = '正在生成，请稍候...';
      $('loadingSub').textContent = S.tab === 'wan-video' ? '预计 1-5 分钟' : '预计 10-30 秒';
    }
  }

  function bindResults() {
    $('btnDownloadAll')?.addEventListener('click', downloadAll);
    $('btnNewGenerate')?.addEventListener('click', generate);
  }

  // ===================== IndexedDB 集成 =====================
  // 当前会话的图片存储映射：imageId -> { blob, thumbUrl }
  let _imageStoreMap = {};
  // 当前会话 ID
  let _currentSessionId = null;

  // 刷新后恢复上次生成结果
  async function restoreLastSession() {
    try {
      const session = await ImageStore.getLatestSession();
      if (!session) return;
      const sessionData = await ImageStore.getSessionImages(session.id);
      if (!sessionData || !sessionData.images.length) return;

      _currentSessionId = session.id;
      // 重建 _imageStoreMap
      sessionData.images.forEach(img => {
        _imageStoreMap[img.id] = { blob: img.blob, thumbUrl: img.thumbUrl };
      });

      // 构建 S.results 兼容格式
      const results = sessionData.images.map(img => ({
        _storeId: img.id,
        _thumbUrl: img.thumbUrl,
        _blob: img.blob,
        url: URL.createObjectURL(img.blob),
        revised_prompt: session.prompt
      }));

      S.results = results;
      switchTab(session.tab || 'creative');
      showResults(results, session.prompt);
      // 显示提示（不每次刷新都弹）
    } catch (e) { /* 静默失败 */ }
  }

  // 生成完成后存入 IndexedDB
  async function persistResults(results, prompt, tab) {
    if (!ImageStore.isAvailable()) return false;
    try {
      const imgSrcs = results
        .filter(r => !r.isVideo && (r.url || (r.isBase64 && r.b64_json)))
        .map(r => r.isBase64 && r.b64_json ? ('data:image/png;base64,' + r.b64_json) : r.url);

      if (imgSrcs.length === 0) return false;

      const sessionData = await ImageStore.saveSession(imgSrcs, prompt, tab);
      _currentSessionId = sessionData.sessionId;

      // 重建 _imageStoreMap
      for (let i = 0; i < sessionData.images.length; i++) {
        const imgInfo = sessionData.images[i];
        // 找到对应的 result
        const result = results.filter(r => !r.isVideo)[i];
        if (result) {
          result._storeId = imgInfo.id;
          result._thumbUrl = imgInfo.thumbUrl;
        }
        // 异步获取 blob 供下载用
        const blob = await ImageStore.getOriginalBlob(imgInfo.id);
        _imageStoreMap[imgInfo.id] = { blob, thumbUrl: imgInfo.thumbUrl };
      }

      return true;
    } catch (e) {
      console.warn('IndexedDB 存储失败:', e);
      return false;
    }
  }

  function getImgSrc(item) {
    if (item.isBase64 && item.b64_json) return 'data:image/png;base64,' + item.b64_json;
    return item.url || '';
  }

  function showResults(results, prompt) {
    $('emptyState')?.classList.add('hidden');
    $('infoPanel')?.classList.add('hidden');
    $('results')?.classList.remove('hidden');

    const grid = $('resultsGrid'); grid.innerHTML = '';
    results.forEach((item, i) => {
      // 优先使用缩略图
      const imgSrc = item._thumbUrl || getImgSrc(item);
      // 下载用原图 blob
      const hasStoreId = !!item._storeId;

      const card = document.createElement('div'); card.className = 'result-card';
      card.innerHTML = `
        <img class="result-card__img" src="${imgSrc}" alt="结果${i + 1}" loading="lazy" />
        <div class="result-card__footer">
          <p class="result-card__prompt">${(item.revised_prompt || prompt).slice(0, 120)}…</p>
          <div class="result-card__actions">
            <button class="btn btn--ghost btn--sm" data-action="copy" title="复制Prompt">📋</button>
            <button class="btn btn--ghost btn--sm" data-action="download" title="下载">⬇</button>
          </div>
        </div>`;
      // 灯箱：如果有 blob 则用 blob URL（原图），否则用 imgSrc
      card.querySelector('.result-card__img').addEventListener('click', () => {
        _lightboxStoreId = hasStoreId ? item._storeId : null;
        if (item._blob) {
          openLightbox(URL.createObjectURL(item._blob), item.revised_prompt || prompt);
        } else {
          openLightbox(getImgSrc(item), item.revised_prompt || prompt);
        }
      });
      card.querySelector('[data-action="copy"]').addEventListener('click', e => {
        e.stopPropagation();
        navigator.clipboard.writeText(item.revised_prompt || prompt).then(() => showToast('Prompt 已复制', 'success')).catch(() => showToast('复制失败', 'error'));
      });
      card.querySelector('[data-action="download"]').addEventListener('click', e => {
        e.stopPropagation();
        const filename = `fashion_${Date.now()}.png`;
        if (hasStoreId && item._storeId) {
          // 从 IndexedDB 取原图下载
          ImageStore.getOriginalBlob(item._storeId).then(blob => {
            if (blob) downloadBlob(blob, filename);
            else downloadImage(getImgSrc(item), filename);
          }).catch(() => downloadImage(getImgSrc(item), filename));
        } else {
          downloadImage(getImgSrc(item), filename);
        }
      });
      grid.appendChild(card);
    });
  }

  // ===================== 视频结果展示 =====================
  function showVideoResult(videoResult, prompt) {
    $('emptyState')?.classList.add('hidden');
    $('infoPanel')?.classList.add('hidden');
    $('results')?.classList.remove('hidden');

    const grid = $('resultsGrid'); grid.innerHTML = '';
    const card = document.createElement('div'); card.className = 'result-card result-card--video';
    card.innerHTML = `
      <div class="result-card__video-wrap">
        <video class="result-card__video" src="${videoResult.url}" controls loop playsinline preload="auto"></video>
      </div>
      <div class="result-card__footer">
        <p class="result-card__prompt">${prompt.slice(0, 120)}…</p>
        <div class="result-card__actions">
          <span class="result-card__meta">${videoResult.duration}s · ${S.wan.videoResolution} · ${S.wan.videoRatio}</span>
          <button class="btn btn--ghost btn--sm" data-action="copy" title="复制Prompt">📋</button>
          <button class="btn btn--ghost btn--sm" data-action="download" title="下载视频">⬇</button>
        </div>
      </div>`;
    card.querySelector('[data-action="copy"]').addEventListener('click', e => {
      e.stopPropagation();
      navigator.clipboard.writeText(prompt).then(() => showToast('Prompt 已复制', 'success')).catch(() => showToast('复制失败', 'error'));
    });
    card.querySelector('[data-action="download"]').addEventListener('click', e => {
      e.stopPropagation(); downloadImage(videoResult.url, `wan_video_${Date.now()}.mp4`);
    });
    grid.appendChild(card);

    // 自动播放
    const video = card.querySelector('video');
    video.play().catch(() => {});
  }

  function downloadAll() {
    S.results.forEach((item, i) => {
      const filename = `fashion_${Date.now()}_${i + 1}.png`;
      if (item._storeId) {
        ImageStore.getOriginalBlob(item._storeId).then(blob => {
          if (blob) downloadBlob(blob, filename);
          else downloadImage(item.url, filename);
        }).catch(() => downloadImage(item.url, filename));
      } else {
        downloadImage(item.url, filename);
      }
    });
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function downloadImage(src, filename) {
    if (src.startsWith('data:')) {
      const parts = src.split(','); const mime = (parts[0].match(/:([^;]+);/) || [])[1] || 'image/png';
      const binary = atob(parts[1]); const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      const blob = new Blob([arr], { type: mime }); const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename; a.click(); return;
    }
    fetch(src).then(r => r.blob()).then(blob => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    }).catch(() => showToast('下载失败', 'error'));
  }

  // ===================== 历史记录 =====================
  const HISTORY_KEY = 'fs_history'; const MAX_HISTORY = 50;

  function bindHistory() {
    $('btnHistory')?.addEventListener('click', () => { $('historyPanel')?.classList.add('open'); $('historyOverlay')?.classList.add('open'); renderHistory(); });
    $('closeHistory')?.addEventListener('click', closeHistoryPanel);
    $('historyOverlay')?.addEventListener('click', closeHistoryPanel);
    $('clearHistory')?.addEventListener('click', () => {
      localStorage.removeItem(HISTORY_KEY);
      // 同时清空 IndexedDB
      if (ImageStore.isAvailable()) ImageStore.clearAll().catch(() => {});
      renderHistory();
    });
  }

  function closeHistoryPanel() { $('historyPanel')?.classList.remove('open'); $('historyOverlay')?.classList.remove('open'); }

  function saveToHistory(entry) {
    try {
      // IndexedDB 已有完整数据，localStorage 只存元数据（用于列表显示）
      const cleanResults = (entry.results || []).map(r => {
        if (r._storeId) return { _storeId: r._storeId, revised_prompt: r.revised_prompt };
        if (r.isBase64 && r.b64_json) return { isBase64: true, revised_prompt: r.revised_prompt };
        return { url: r.url, revised_prompt: r.revised_prompt };
      });
      const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      list.unshift({ ...entry, results: cleanResults, time: Date.now() });
      if (list.length > MAX_HISTORY) list.splice(MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch {}
  }

  async function renderHistory() {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const container = $('historyList'); if (!container) return;
    if (list.length === 0) { container.innerHTML = '<div class="history-empty">暂无历史记录</div>'; return; }

    // 尝试从 IndexedDB 获取缩略图
    const idbAvailable = ImageStore.isAvailable();
    let idbSessions = [];
    if (idbAvailable) {
      try { idbSessions = await ImageStore.getAllSessions(); } catch {}
    }
    // 建立 sessionId -> session 的映射
    const sessionMap = {};
    idbSessions.forEach(s => { sessionMap[s.id] = s; });

    // 匹配 localStorage 历史（最近一条）和 IndexedDB 会话
    const historyItems = list.map((item, idx) => {
      // 找对应的 IndexedDB 会话（通过时间戳近似匹配）
      let matchedSession = null;
      if (idbAvailable) {
        const itemTime = item.time;
        // 最近匹配：找时间最接近且差距在 10 秒内的
        for (const s of idbSessions) {
          if (Math.abs(s.createdAt - itemTime) < 10000) {
            matchedSession = s;
            break;
          }
        }
      }
      return { ...item, idx, matchedSession };
    });

    container.innerHTML = historyItems.map(item => `
      <div class="history-item" data-idx="${item.idx}">
        <div class="history-item__meta">
          <span class="history-item__tab">${TAB_INFO[item.tab]?.title || item.tab}</span>
          <span class="history-item__time">${fmtTime(item.time)}</span>
        </div>
        <p class="history-item__prompt">${item.prompt?.slice(0, 80)}…</p>
        <div class="history-item__thumbs" data-session-id="${item.matchedSession?.id || ''}">
          ${item.matchedSession ? '<span class="history-item__loading">加载中...</span>' : (item.results || []).slice(0, 3).map(r => {
            const src = r._storeId ? '' : getImgSrc(r);
            return src ? `<img class="history-item__thumb" src="${src}" alt="thumb" />` : (r._storeId ? `<div class="history-item__thumb history-item__thumb--placeholder">💾</div>` : `<div class="history-item__thumb history-item__thumb--placeholder">✂️</div>`);
          }).join('')}
        </div>
      </div>`).join('');

    // 异步加载缩略图
    if (idbAvailable) {
      historyItems.forEach(item => {
        if (!item.matchedSession) return;
        const thumbsEl = container.querySelector(`[data-session-id="${item.matchedSession.id}"]`);
        if (!thumbsEl) return;
        // 从 IndexedDB 加载缩略图
        Promise.all(
          item.matchedSession.imageIds.slice(0, 3).map(id => ImageStore.getThumbUrl(id))
        ).then(urls => {
          thumbsEl.innerHTML = urls.filter(Boolean).map(url =>
            `<img class="history-item__thumb" src="${url}" alt="thumb" />`
          ).join('') || '<div class="history-item__thumb history-item__thumb--placeholder">✂️</div>';
        }).catch(() => {
          thumbsEl.innerHTML = '<div class="history-item__thumb history-item__thumb--placeholder">✂️</div>';
        });
      });
    }

    container.querySelectorAll('.history-item').forEach(el => {
      const idx = parseInt(el.dataset.idx);
      el.addEventListener('click', () => {
        const entry = list[idx];
        restoreFromHistory(entry);
        // 如果有对应的 IndexedDB 会话，从 IDB 恢复完整图片
        const sessionId = el.querySelector('[data-session-id]')?.dataset.sessionId;
        if (sessionId && ImageStore.isAvailable()) {
          ImageStore.getSessionImages(sessionId).then(sessionData => {
            if (sessionData && sessionData.images.length) {
              _currentSessionId = sessionId;
              sessionData.images.forEach(img => {
                _imageStoreMap[img.id] = { blob: img.blob, thumbUrl: img.thumbUrl };
              });
              const results = sessionData.images.map(img => ({
                _storeId: img.id,
                _thumbUrl: img.thumbUrl,
                _blob: img.blob,
                url: URL.createObjectURL(img.blob),
                revised_prompt: entry.prompt
              }));
              S.results = results;
              showResults(results, entry.prompt);
            }
          }).catch(() => {});
        }
        closeHistoryPanel();
      });
    });
  }

  function restoreFromHistory(entry) {
    $('promptInput').value = entry.prompt || ''; S.prompt = entry.prompt || ''; updatePromptCounter();
    switchTab(entry.tab || 'creative');
    if (entry.results?.length) showResults(entry.results, entry.prompt);
  }

  function fmtTime(ts) { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; }

  // ===================== 设置 =====================
  function bindSettings() {
    $('btnSettings')?.addEventListener('click', () => { $('settingsModal')?.classList.remove('hidden'); loadSettings(); });
    $('closeSettings')?.addEventListener('click', () => { $('settingsModal')?.classList.add('hidden'); });
    $('cancelSettings')?.addEventListener('click', () => { $('settingsModal')?.classList.add('hidden'); });
    $('saveSettings')?.addEventListener('click', saveSettings);
    $$('#endpointSelector .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => { $$('#endpointSelector .seg-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); });
    });
    // Agent 来源选择
    $$('#agentSourceSelector .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#agentSourceSelector .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const source = btn.dataset.source;
        const hint = $('agentSourceHint');
        if (hint) {
          hint.textContent = source === 'blooom'
            ? 'BLOOOOM: 使用 gemini-2.5-flash，免费额度内可用'
            : '百炼: 使用 qwen-turbo，约 ¥0.0008/千 token';
        }
        updateAgentStatusDisplay();
      });
    });
  }

  function loadSettings() {
    const cfg = API_CLIENT.getConfig();
    $$('#endpointSelector .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.endpoint === cfg.endpoint));
    const keyInput = $('apiKeyInput'); if (keyInput) keyInput.value = '';
    const hint = $('apiKeyHint');
    if (hint) hint.textContent = cfg.apiKey ? '已填写，当前会话有效' : '当前会话有效，关闭后需重新输入';
    $('outputDir').value = cfg.outputDir || '~/Documents/FashionStudio_Output';
    updateModelInfoDisplay(cfg.defaultModel || 'flash');

    // Agent 设置
    const agentSource = PROMPT_AGENT.getSource();
    $$('#agentSourceSelector .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.source === agentSource));
    const agentHint = $('agentSourceHint');
    if (agentHint) {
      agentHint.textContent = agentSource === 'blooom'
        ? 'BLOOOOM: 使用 gemini-2.5-flash，免费额度内可用'
        : '百炼: 使用 qwen-turbo，约 ¥0.0008/千 token';
    }
    const agentModelInput = $('agentModelInput');
    if (agentModelInput) agentModelInput.value = PROMPT_AGENT.getModel();
    updateAgentStatusDisplay();

    // Wan Key
    const wanKeyInput = $('wanApiKeyInput');
    if (wanKeyInput) wanKeyInput.value = '';
    const wanHint = $('wanApiKeyHint');
    if (wanHint) wanHint.textContent = WAN_API.hasKey() ? '已配置' : '阿里云百炼平台 Key，用于万相生图和视频生成';
    const wanStatus = $('wanStatusInfo');
    if (wanStatus) wanStatus.innerHTML = WAN_API.hasKey()
      ? '<span class="form-badge form-badge--ok">已配置</span><span class="form-hint">万相生图 + 视频可用</span>'
      : '<span class="form-badge form-badge--wan">未配置</span>';

    // 抠图功能（通过线上代理，无需配置 Key）
    const repStatus = $('replicateStatusInfo');
    if (repStatus) repStatus.innerHTML = '<span class="form-badge form-badge--ok">已就绪</span><span class="form-hint">智能抠图可用（云端代理）</span>';
  }

  function saveSettings() {
    const activeEp = $$('#endpointSelector .seg-btn.active')[0]?.dataset.endpoint || 't8star';
    const key = $('apiKeyInput')?.value.trim() || '';
    API_CLIENT.setConfig({ endpoint: activeEp, apiKey: key, outputDir: $('outputDir').value });
    const hint = $('apiKeyHint');
    if (hint) hint.textContent = key ? '已填写，当前会话有效' : '当前会话有效，关闭后需重新输入';

    // Wan Key
    const wanKey = $('wanApiKeyInput')?.value.trim() || '';
    if (wanKey) WAN_API.setKey(wanKey);
    const wanHint = $('wanApiKeyHint');
    if (wanHint) wanHint.textContent = WAN_API.hasKey() ? '已配置' : '阿里云百炼平台 Key，用于万相生图和视频生成';
    const wanStatus = $('wanStatusInfo');
    if (wanStatus) wanStatus.innerHTML = WAN_API.hasKey()
      ? '<span class="form-badge form-badge--ok">已配置</span><span class="form-hint">万相生图 + 视频可用</span>'
      : '<span class="form-badge form-badge--wan">未配置</span>';

    // 抠图功能（通过线上代理，无需配置 Key）

    // Agent 设置
    const activeAgentSource = $$('#agentSourceSelector .seg-btn.active')[0]?.dataset.source || 'blooom';
    PROMPT_AGENT.setSource(activeAgentSource);
    const agentModel = $('agentModelInput')?.value.trim() || '';
    PROMPT_AGENT.setModel(agentModel);
    updateAgentStatusDisplay();

    $('settingsModal')?.classList.add('hidden');
    checkApiStatus();
    showToast(key || wanKey ? '设置已保存' : '端点已保存', 'success');
  }

  function checkApiStatus() {
    const ready = API_CLIENT.hasKey();
    const wanReady = WAN_API.hasKey();
    const dot = $('apiStatus'); const text = $('apiStatusText');
    if (!dot || !text) return;

    if (ready && wanReady) {
      dot.className = 'status-dot status-dot--online';
      text.textContent = '就绪';
    } else if (ready || wanReady) {
      dot.className = 'status-dot status-dot--warning';
      const readyList = [];
      if (ready) readyList.push('BLOOOOM');
      if (wanReady) readyList.push('Wan');
      text.textContent = readyList.join('·') + ' 就绪';
    } else {
      dot.className = 'status-dot status-dot--offline';
      text.textContent = '请配置';
    }
  }

  // ===================== Agent 状态 =====================
  function updateAgentStatusDisplay() {
    const status = PROMPT_AGENT.getStatus();
    const el = $('agentStatusInfo');
    if (!el) return;
    const model = status.model;
    if (PROMPT_AGENT.isReady()) {
      const sourceLabel = status.source === 'blooom' ? 'BLOOOOM' : '百炼';
      el.innerHTML = `<span class="form-badge form-badge--ok">就绪</span><span class="form-hint">${sourceLabel} · ${model}</span>`;
    } else {
      const needKey = status.source === 'blooom' ? 'BLOOOOM API Key' : '万相 Wan API Key';
      el.innerHTML = `<span class="form-badge form-badge--wan">未就绪</span><span class="form-hint">请先配置 ${needKey}</span>`;
    }
  }

  // ===================== 上传区 =====================
  const MAX_REF_IMAGES = 4;

  function bindUpload() {
    const zone = $('mainRefZone'); const input = $('mainRefInput');
    if (!zone || !input) return;
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); });
    zone.addEventListener('drop', e => { e.preventDefault(); const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/')); if (files.length) processFiles(files); });
    input.addEventListener('change', () => { const files = Array.from(input.files || []).filter(f => f.type.startsWith('image/')); if (files.length) processFiles(files); input.value = ''; });
    $('btnClearRef')?.addEventListener('click', clearRefImage);
  }

  function processFiles(files) {
    const refs = S.refImages.main || [];
    const isDualMode = S.tab === 'wearables' && S.subType.wearable === 'custom';
    const isWanImage = S.tab === 'wan-image';
    const isWanVideo = S.tab === 'wan-video';
    let maxImages = MAX_REF_IMAGES;
    if (isDualMode) maxImages = 2;
    if (isWanImage) maxImages = 9;    // Wan 支持最多 9 张参考图
    if (isWanVideo) maxImages = 1;    // 视频首帧只需要 1 张
    const remaining = maxImages - refs.length;
    if (remaining <= 0) { showToast(`最多上传 ${maxImages} 张参考图`, 'warning'); return; }
    files.slice(0, remaining).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        S.refImages.main = S.refImages.main || [];
        S.refImages.main.push(e.target.result);
        renderRefGrid();
        updateRefAddBtnVisibility();
        if (S.refImages.main.length > 0) {
          $('refSection')?.classList.remove('hidden');
          $('btnToggleRef')?.classList.add('active');
          $('btnClearRef')?.classList.remove('hidden');
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function renderRefGrid() {
    const grid = $('refImagesGrid');
    if (!grid) return;
    grid.querySelectorAll('.ref-thumb').forEach(el => el.remove());

    const refs = S.refImages.main || [];
    const isDualMode = S.tab === 'wearables' && S.subType.wearable === 'custom';
    const idxLabels = isDualMode ? ['图1人物', '图2服装'] : null;
    refs.forEach((base64, idx) => {
      const thumb = document.createElement('div');
      thumb.className = 'ref-thumb';
      const label = idxLabels ? `<div class="ref-thumb__label">${idxLabels[idx] || ''}</div>` : '';
      thumb.innerHTML = `<img src="${base64}" alt="参考图${idx + 1}" />${label}<button class="ref-thumb__remove" data-idx="${idx}" title="移除">×</button>`;
      thumb.querySelector('.ref-thumb__remove').addEventListener('click', e => { e.stopPropagation(); removeRefImage(idx); });
      grid.appendChild(thumb);
    });
    updateRefAddBtnVisibility();
  }

  function updateRefAddBtnVisibility() {
    const addBtn = $('mainRefZone'); if (!addBtn) return;
    const isDualMode = S.tab === 'wearables' && S.subType.wearable === 'custom';
    const isWanImage = S.tab === 'wan-image';
    const isWanVideo = S.tab === 'wan-video';
    let maxImages = MAX_REF_IMAGES;
    if (isDualMode) maxImages = 2;
    if (isWanImage) maxImages = 9;
    if (isWanVideo) maxImages = 1;
    addBtn.classList.toggle('hidden', (S.refImages.main?.length || 0) >= maxImages);
  }

  function removeRefImage(idx) {
    S.refImages.main = (S.refImages.main || []).filter((_, i) => i !== idx);
    renderRefGrid();
    updateRefAddBtnVisibility();
    if ((S.refImages.main || []).length === 0) {
      $('btnClearRef')?.classList.add('hidden');
    }
  }

  function clearRefImage() {
    S.refImages.main = [];
    renderRefGrid();
    updateRefAddBtnVisibility();
    $('mainRefInput').value = '';
    $('btnClearRef')?.classList.add('hidden');
  }

  function bindFaceRefUpload() {
    if (S._faceRefBound) return;
    S._faceRefBound = true;
    const zone = $('faceRefZone'); const input = $('faceRefInput');
    if (!zone || !input) return;
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); });
    zone.addEventListener('drop', e => { e.preventDefault(); const file = e.dataTransfer?.files?.[0]; if (file?.type.startsWith('image/')) processFaceFile(file); });
    input.addEventListener('change', () => { const file = input.files?.[0]; if (file) processFaceFile(file); input.value = ''; });
  }

  function processFaceFile(file) {
    const reader = new FileReader();
    reader.onload = e => { S.refImages.face = e.target.result; showRefPreview('faceRefPreview', e.target.result); };
    reader.readAsDataURL(file);
  }

  function showRefPreview(previewId, base64) {
    const preview = $(previewId); if (!preview) return;
    preview.querySelector('img')?.remove();
    preview.querySelector('.upload-zone__icon')?.classList.add('hidden');
    preview.querySelector('.upload-zone__text')?.classList.add('hidden');
    const img = document.createElement('img'); img.src = base64; img.className = 'upload-preview';
    img.style = 'width:100%;height:100%;object-fit:cover;position:absolute;inset:0;border-radius:inherit;';
    preview.style.position = 'relative'; preview.appendChild(img);
  }

  // ===================== 多图合成 =====================
  function _dimsToAspect(w, h) {
    if (!w || !h) return 'auto';
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    return `${w / gcd(w, h)}:${h / gcd(w, h)}`;
  }

  function compositeImages(base64Array, autoAspect = false) {
    return new Promise((resolve, reject) => {
      const count = base64Array.length;
      const fail = () => reject(new Error('参考图加载失败'));
      if (count === 0) { resolve({ dataUrl: null, width: 1024, height: 1024 }); return; }

      let firstW = 1024, firstH = 1024;
      const loadedCount = { v: 0 };

      const tryResolve = () => {
        if (loadedCount.v < count) return;
        if (autoAspect) {
          const canvas = document.createElement('canvas'); canvas.width = firstW; canvas.height = firstH;
          const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, firstW, firstH);
          const img0 = new Image();
          img0.onload = () => {
            const scale = Math.min(firstW / img0.width, firstH / img0.height);
            const dw = img0.width * scale, dh = img0.height * scale;
            ctx.drawImage(img0, (firstW - dw) / 2, (firstH - dh) / 2, dw, dh);
            resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.92), width: firstW, height: firstH });
          };
          img0.onerror = fail; img0.src = base64Array[0];
        } else {
          const cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
          const rows = Math.ceil(count / cols); const cell = 512; const gap = 8;
          const canvas = document.createElement('canvas'); canvas.width = cols * cell; canvas.height = rows * cell;
          const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          base64Array.forEach((src, i) => {
            const img = new Image();
            img.onload = () => {
              const col = i % cols, row = Math.floor(i / cols), x = col * cell + gap, y = row * cell + gap, sz = cell - gap * 2;
              const minDim = Math.min(img.width, img.height);
              ctx.drawImage(img, (img.width - minDim) / 2, (img.height - minDim) / 2, minDim, minDim, x, y, sz, sz);
              if (i === count - 1) resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.92), width: canvas.width, height: canvas.height });
            };
            img.onerror = fail; img.src = src;
          });
        }
      };

      const img0 = new Image();
      img0.onload = () => { firstW = img0.width; firstH = img0.height; loadedCount.v++; if (loadedCount.v === count) tryResolve(); };
      img0.onerror = fail; img0.src = base64Array[0];
      for (let i = 1; i < count; i++) {
        const img = new Image();
        img.onload = () => { loadedCount.v++; if (loadedCount.v === count) tryResolve(); };
        img.onerror = fail; img.src = base64Array[i];
      }
    });
  }

  // ===================== 放大镜 =====================
  let _lightboxStoreId = null;

  function bindLightbox() {
    $('closeLightbox')?.addEventListener('click', () => { $('lightbox')?.classList.add('hidden'); _lightboxStoreId = null; });
    $('lbDownload')?.addEventListener('click', () => {
      const img = $('lightboxImg');
      if (!img) return;
      const filename = `fashion_preview_${Date.now()}.png`;
      if (_lightboxStoreId) {
        ImageStore.getOriginalBlob(_lightboxStoreId).then(blob => {
          if (blob) downloadBlob(blob, filename);
          else if (img.src) downloadImage(img.src, filename);
        }).catch(() => { if (img.src) downloadImage(img.src, filename); });
      } else if (img.src) {
        downloadImage(img.src, filename);
      }
    });
    $('lbCopy')?.addEventListener('click', () => {
      const prompt = $('lightboxImg')?.dataset.prompt || '';
      if (prompt) navigator.clipboard.writeText(prompt).then(() => showToast('Prompt 已复制', 'success')).catch(() => showToast('复制失败', 'error'));
    });
  }

  function openLightbox(url, prompt) {
    const lb = $('lightbox'); const img = $('lightboxImg');
    if (!lb || !img) return;
    img.src = url; img.dataset.prompt = prompt || ''; lb.classList.remove('hidden');
    _lightboxStoreId = null;
  }

  // ===================== 键盘 =====================
  function bindKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        $('lightbox')?.classList.add('hidden');
        $('settingsModal')?.classList.add('hidden');
        closeHistoryPanel();
        toggleSubPanel(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); generate(); }
    });
  }

  // ===================== 模板 =====================
  function loadTemplates() {
    const templates = [
      { name: '法式博主', scene: '法式', style: '法式,写真', prompt: '一位时尚博主，穿着法式碎花连衣裙，坐在巴黎咖啡馆露台，阳光透过树叶洒落，氛围感，电影感色调' },
      { name: '韩系街拍', scene: '街道', style: '韩系,街拍', prompt: '韩系时尚街拍，模特穿着宽松毛衣和直筒牛仔裤，首尔街头，暖色调，自然光线，氛围感' },
      { name: '杂志封面', scene: '室内', style: '杂志,商业', prompt: '时尚杂志封面大片，模特穿着高级定制礼服，专业摄影棚灯光，杂志级别质感，高清8K' },
      { name: '慵懒居家', scene: '居家', style: '清新,氛围感', prompt: '慵懒居家时尚，模特穿着精致睡袍，自然采光，温馨客厅背景，柔和色调，氛围感' },
      { name: '职场穿搭', scene: '室内', style: '商业,写真', prompt: '专业职场时尚穿搭，模特穿着修身西装和大衣，现代写字楼大堂，商务精英风格，自然光' },
      { name: '派对晚宴', scene: '室内', style: '商业,杂志', prompt: '派对晚宴时尚，模特穿着亮片礼服，豪华宴会厅背景，精致妆容，珠宝配饰，明星既视感' }
    ];

    const grid = $('templateBtns');
    if (!grid) return;
    grid.innerHTML = '';

    templates.forEach(t => {
      const btn = document.createElement('button'); btn.className = 'template-btn'; btn.textContent = t.name;
      btn.addEventListener('click', () => {
        $('promptInput').value = t.prompt; S.prompt = t.prompt; updatePromptCounter();
        $$('[data-scene]').forEach(b => b.classList.toggle('active', b.dataset.scene === t.scene));
        $$('[data-style]').forEach(b => { const styles = t.style.split(','); b.classList.toggle('active', styles.includes(b.dataset.style)); });
      });
      grid.appendChild(btn);
    });

    $$('[data-scene]').forEach(btn => { btn.addEventListener('click', () => btn.classList.toggle('active')); });
    $$('[data-style]').forEach(btn => { btn.addEventListener('click', () => btn.classList.toggle('active')); });

    $$('#countSelector .count-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#countSelector .count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        S.count = parseInt(btn.dataset.count);
      });
    });
  }

  // ===================== Toast =====================
  function showToast(msg, type = 'default') {
    const container = $('toastContainer'); if (!container) return;
    const el = document.createElement('div'); el.className = `toast toast--${type}`; el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => { el.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => el.remove(), 300); }, 3000);
  }

  // ===================== 启动 =====================
  document.addEventListener('DOMContentLoaded', init);
})();
