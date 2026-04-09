/**
 * FashionStudio — API 调用封装 v3
 * 支持：BLOOOOM Gemini / Comfly Gemini / Midjourney
 *
 * v3 修复（2026-04-03）：
 * - BLOOOOM 改用 generateContent 端点，格式为 Google AI 原生
 *   { contents, generationConfig: { imageConfig: { aspectRatio, imageSize } } }
 * - aspectRatio 直接用 "1:1" / "3:4" 等比例字符串
 * - imageSize 用 "1K" / "2K" / "4K" 控制分辨率
 */

const API_CLIENT = (() => {
  // ===================== 私有变量 =====================
  // endpoint: 't8star' | 'comfly' — 保存到 localStorage
  // apiKey: 会话级内存，不持久化
  let config = {
    endpoint:    localStorage.getItem('fs_endpoint') || 't8star',
    apiKey:     '',  // 会话 key，不存 localStorage
    defaultModel: localStorage.getItem('fs_default_model') || 'flash',
    outputDir:    localStorage.getItem('fs_output_dir')   || '~/Documents/FashionStudio_Output'
  };

  // 兼容旧 localStorage key
  if (!config.endpoint) {
    const old = localStorage.getItem('fs_blooom_key');
    if (old) config.apiKey = old; // 引导旧用户
  }

  const ENDPOINTS = {
    t8star:  'https://ai.t8star.cn/v1',
    comfly:  'https://api.comfly.chat/v1'
  };
  // BLOOOOM Edits 接口：ai.comfly.chat（支持 CORS）
  const BLOOOOM_EDITS_BASE = 'https://ai.comfly.chat/v1';
  // Google AI 原生 generateContent 端点（aspectRatio 在这里生效）
  const BLOOOOM_GEMINI_ENDPOINT = 'https://ai.t8star.cn/v1beta/models/gemini-3.1-flash-image-preview:generateContent';
  const MJ_BASE        = 'https://gpt-best.apifox.cn';


  // ===================== 工具函数 =====================
  // 当前激活的 API Key（会话优先）
  function activeKey() {
    return config.apiKey;
  }

  // 其他服务的 base URL
  function baseOf(provider) {
    if (provider === 'midjourney') return MJ_BASE;
    return 'https://api.comfly.chat/v1'; // Comfly 服务（MJ / Recraft）固定走 comfly.chat
  }

  // 比例映射表 → BLOOOOM 尺寸（用于 edits 接口的 width/height 参数）
  // gemini-3.1-flash-image-preview 支持: 4:3, 3:4, 16:9, 9:16, 2:3, 3:2, 1:1, 4:5, 5:4, 21:9, 1:4, 4:1, 8:1, 1:8
  const ASPECT_RATIOS = {
    '1:1':  { width: 1024, height: 1024 },
    '4:3':  { width: 1024, height: 768  },
    '3:4':  { width: 768,  height: 1024 },
    '3:2':  { width: 1024, height: 683  },
    '2:3':  { width: 683,  height: 1024 },
    '5:4':  { width: 1024, height: 819  },
    '4:5':  { width: 819,  height: 1024 },
    '16:9': { width: 1024, height: 576  },
    '9:16': { width: 576,  height: 1024 },
    '21:9': { width: 1024, height: 438  },
    '1:4':  { width: 256,  height: 1024 },  // Gemini-Flash 支持
    '4:1':  { width: 1024, height: 256  },  // Gemini-Flash 支持
    '8:1':  { width: 2048, height: 256  },  // Gemini-Flash 支持
    '1:8':  { width: 256,  height: 2048 },  // Gemini-Flash 支持
    // 兼容旧格式
    '1024x1024': { width: 1024, height: 1024 },
    '1024x1536': { width: 1024, height: 1536 },
    '1536x1024': { width: 1536, height: 1024 },
    '768x1344':  { width: 768,  height: 1344 },
  };

  /**
   * 把 size 参数（比例名或 w/h）转换为 BLOOOOM edits 接口的 {width, height}
   * @param {string|{width:number,height:number}} size
   * @returns {{width:number, height:number}}
   */
  function normalizeSize(size) {
    if (!size || size === 'auto') return null; // Auto 模式由调用方动态决定
    if (typeof size === 'object' && size.width && size.height) return size;
    return ASPECT_RATIOS[size] || { width: 1024, height: 1024 };
  }

  // 把 "1024x1024" / "3:4" 等转换为 { aspectRatio, imageSize }
  // aspectRatio：如 "1:1"、"3:4"、"16:9"
  // imageSize：分辨率档位 "1K"/"2K"/"4K"
  function parseSizeForGenerations(size) {
    // 比例映射：key = w:h → aspectRatio string
    const RATIO_MAP = {
      '1024': '1:1',
      '1024x1024': '1:1',
      '768': '3:4',   // 768x1024
      '768x1344': '9:16',
      '576': '9:16',  // 576x1024
      '683': '2:3',   // 683x1024
      '4:3': '4:3',
      '3:4': '3:4',
      '3:2': '3:2',
      '2:3': '2:3',
      '5:4': '5:4',
      '16:9': '16:9',
      '9:16': '9:16',
      '21:9': '21:9',
      '21:9': '21:9',
    };
    // 宽高 → imageSize
    function sizeFromDims(w, h) {
      if (w >= 2048 || h >= 2048) return '4K';
      if (w >= 1024 || h >= 1024) return '2K';
      return '1K';
    }

    const s = size || '1:1';
    if (s === 'auto') return { aspectRatio: null, imageSize: '2K' };
    if (RATIO_MAP[s]) return { aspectRatio: RATIO_MAP[s], imageSize: '2K' };
    if (s.includes('x')) {
      const parts = s.split('x').map(Number);
      const ar = `${parts[0]}:${parts[1]}`;
      return { aspectRatio: ar, imageSize: sizeFromDims(parts[0], parts[1]) };
    }
    // 纯数字（兼容旧格式）
    const n = parseInt(s);
    if (!isNaN(n)) return { aspectRatio: '1:1', imageSize: sizeFromDims(n, n) };
    return { aspectRatio: s, imageSize: '2K' };
  }

  // 兼容旧接口：返回 imageSize 字符串
  function normalizeSizeForGenerations(size) {
    return parseSizeForGenerations(size).imageSize;
  }

  // BLOOOOM Gemini 模型映射
  const BLOOOM_MODELS = {
    flash:    'gemini-3.1-flash-image-preview',
    pro:      'gemini-3-pro-image-preview'
  };
  const BLOOOM_MODEL_LABELS = {
    flash:    'BLOOOOM Flash',
    pro:      'BLOOOOM Pro'
  };
  // Edits 接口支持的模型（nano-banana-2 或 gemini-3.1-flash-image-preview）
  const BLOOOM_EDIT_MODELS = {
    nano:  'nano-banana-2',
    flash: 'gemini-3.1-flash-image-preview'
  };
  const BLOOOM_EDIT_MODEL_LABELS = {
    nano:  'Nano-Banana-2（快速）',
    flash: 'Gemini-3.1-Flash（Edits兼容）'
  };

  // 当前激活的模型 ID（flash / pro）
  function activeModelId() {
    return config.defaultModel || 'flash';
  }

  // BLOOOOM Gemini 模型名（用于 generateContent）
  // @param {string} [modelId] - 可选，优先用传入的，否则用全局 defaultModel
  function blooomModel(modelId) {
    const id = modelId || activeModelId();
    return BLOOOM_MODELS[id] || BLOOOM_MODELS.flash;
  }

  // BLOOOOM generateContent 端点（固定走 t8star）
  function blooomGenerateContentEndpoint(modelId) {
    const base = 'https://ai.t8star.cn';
    return `${base}/v1beta/models/${blooomModel(modelId)}:generateContent`;
  }

  // ===================== BLOOOOM 异步任务轮询 =====================
  // 查询异步任务状态（用于 edits 等异步接口）
  async function blooomQueryTask(taskId, signal) {
    const key = activeKey();
    // Edits 接口使用 ai.comfly.chat，轮询也使用同一端点
    const res = await fetch(`${BLOOOOM_EDITS_BASE}/images/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      signal
    });
    if (!res.ok) {
      const text = await res.text();
      let errMsg = `查询失败 (${res.status})`;
      try { errMsg = JSON.parse(text)?.error?.message || errMsg; } catch {}
      throw new Error(errMsg);
    }
    return res.json();
  }

  // 轮询直到任务完成（SUCCESS / FAILURE）
  // @param {string}   taskId  - 提交后返回的 task_id
  // @param {Function} onProgress(task) - 进度回调，传入任务对象
  // @param {number}   interval - 轮询间隔（ms），默认 3000
  async function blooomPollTask(taskId, { onProgress, interval = 3000, signal } = {}) {
    const maxAttempts = 60; // 最多等 3 分钟
    for (let i = 0; i < maxAttempts; i++) {
      if (signal?.aborted) throw new signal.reason || new Error('任务已取消');

      const task = await blooomQueryTask(taskId, signal);
      onProgress?.(task);

      if (task.status === 'SUCCESS') {
        // 提取图片数据：data.data[].url / b64_json
        if (task.data?.data && task.data.data.length > 0) {
          return task.data.data.map(item => ({
            url: item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ''),
            revised_prompt: item.revised_prompt || ''
          })).filter(item => item.url);
        }
        throw new Error('任务成功但未返回图片');
      }
      if (task.status === 'FAILURE') {
        throw new Error(`图片生成失败：${task.fail_reason || '未知错误'}`);
      }
      // IN_PROGRESS，继续轮询
      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error('图片生成超时（3分钟未完成）');
  }

  // ===================== JSON 请求（BLOOOOM generateContent / Comfly）=====================
  async function _jsonRequest(provider, endpoint, body, signal) {
    const key = activeKey();
    if (!key) throw new Error('API Key 未设置，请在设置中填写。');

    // BLOOOOM JSON 请求走 t8star（generateContent 端点只在这里可用）
    const base = provider === 'blooom' ? 'https://ai.t8star.cn/v1' : baseOf(provider);
    const res = await fetch(`${base}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(err.error?.message || `请求失败 (${res.status})`);
    }
    return res.json();
  }

  // ===================== Multipart 请求（BLOOOOM edits / 异步）=====================
  async function _multipartRequest(provider, endpoint, fields, signal) {
    const key = activeKey();
    if (!key) throw new Error('API Key 未设置，请在设置中填写。');

    // BLOOOOM Edits 接口走 ai.comfly.chat（支持 CORS），GenerateContent 走 t8star
    const base = provider === 'blooom' ? BLOOOOM_EDITS_BASE : baseOf(provider);

    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      form.append(k, v);
    }

    const res = await fetch(`${base}${endpoint}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}` },
      body: form,
      signal
    });

    if (!res.ok) {
      const text = await res.text();
      let errMsg = `请求失败 (${res.status})`;
      try { errMsg = JSON.parse(text)?.error?.message || errMsg; } catch {}
      throw new Error(errMsg);
    }
    return res.json();
  }

  // ===================== 文本生图（BLOOOOM generateContent）=====================
  // 使用 Google AI 原生格式，支持 aspectRatio + imageSize 精确控制
  async function textToImage({ prompt, provider, count = 1, aspect = '1:1', quality = '1K', signal } = {}) {
    const p = provider || config.defaultModel;

    // Midjourney 走单独端点
    if (p === 'midjourney') {
      return midjourneyImagine({ prompt, count, signal });
    }

    const key = activeKey();
    if (!key) throw new Error('API Key 未设置，请在设置中填写。');

    // 构建 Google AI generateContent 请求体
    const body = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        imageConfig: {
          imageSize: quality || '1K'
        },
        responseModalities: ['IMAGE']
      }
    };

    // 有明确 aspectRatio 时加入（Auto 模式 aspect 为 null，不传）
    if (aspect && aspect !== 'auto') {
      body.generationConfig.imageConfig.aspectRatio = aspect;
    }

    const endpoint = blooomGenerateContentEndpoint(p);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(err.error?.message || `请求失败 (${res.status})`);
    }

    const data = await res.json();

    // Google AI generateContent 返回格式：
    // { candidates: [{ content: { parts: [{ inlineData: { data: base64, mimeType: "image/png" } }] } }] }
    if (data.candidates && data.candidates[0]?.content?.parts) {
      const parts = data.candidates[0].content.parts;
      return parts
        .filter(p => p.inlineData)
        .map(p => ({
          url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
          revised_prompt: prompt
        }));
    }
    throw new Error('返回数据格式异常');
  }

  // ===================== 参考图生图（BLOOOOM Edits）=====================
  // Edits 接口支持 nano-banana-2 或 gemini-3.1-flash-image-preview
  // @param {string} editModel - 'nano' | 'flash'，默认 'nano'
  async function imageToImage({ prompt, imageBase64, provider, aspect = 'auto', quality = '1K', signal, onProgress, editModel = 'nano' } = {}) {
    if (!imageBase64) throw new Error('缺少参考图');

    const imageBlob = base64ToBlob(imageBase64);
    const imageFile = new File([imageBlob], 'reference.png', { type: imageBlob.type });

    // 选择 Edits 模型：nano-banana-2 或 gemini-3.1-flash-image-preview
    const model = BLOOOM_EDIT_MODELS[editModel] || BLOOOM_EDIT_MODELS.nano;

    const fields = {
      model,                      // nano-banana-2 或 gemini-3.1-flash-image-preview
      prompt,
      response_format: 'url',
      image: imageFile
    };
    // 两个模型都支持 aspect_ratio（如 "1:1"、"3:4"、"1:4" 等）
    if (aspect && aspect !== 'auto') {
      fields.aspect_ratio = aspect;
    }
    // 两个模型都支持 image_size（1K / 2K / 4K / 512）
    if (quality) {
      fields.image_size = quality;
    }

    const data = await _multipartRequest('blooom', '/images/edits', fields, signal);

    // 异步模式：返回 task_id → 轮询拿结果
    if (data.task_id) {
      return blooomPollTask(data.task_id, { onProgress, signal });
    }

    // 同步模式：直接返回图片数据
    if (data.data) {
      return data.data.map(item => ({
        url: item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ''),
        revised_prompt: item.revised_prompt || prompt
      })).filter(item => item.url);
    }
    throw new Error('返回数据格式异常');
  }

  // ===================== 局部编辑（Edits）=====================
  // 支持 nano-banana-2 或 gemini-3.1-flash-image-preview
  // @param {string} editModel - 'nano' | 'flash'，默认 'nano'
  // @param {string|string[]} imageBase64 - 单张 base64 或多张 base64 数组（多图时每张独立 append）
  async function imageEdit({ prompt, imageBase64, maskBase64, provider, aspect = 'auto', quality = '1K', signal, onProgress, editModel = 'nano' } = {}) {
    if (!imageBase64) throw new Error('缺少原图');

    // 选择 Edits 模型：nano-banana-2 或 gemini-3.1-flash-image-preview
    const model = BLOOOM_EDIT_MODELS[editModel] || BLOOOM_EDIT_MODELS.nano;

    const fields = {
      model,                      // nano-banana-2 或 gemini-3.1-flash-image-preview
      prompt,
      response_format: 'url'
    };

    // 支持多图：imageBase64 可以是单字符串或字符串数组
    const images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];
    const fileList = [];
    images.forEach((b64, i) => {
      const blob = base64ToBlob(b64);
      fileList.push(new File([blob], `source${i}.png`, { type: blob.type }));
    });

    // 两个模型都支持 aspect_ratio（如 "1:1"、"3:4"、"1:4" 等）
    if (aspect && aspect !== 'auto') {
      fields.aspect_ratio = aspect;
    }
    // 两个模型都支持 image_size（1K / 2K / 4K / 512）
    if (quality) {
      fields.image_size = quality;
    }
    if (maskBase64) {
      const maskBlob = base64ToBlob(maskBase64);
      fields.mask = new File([maskBlob], 'mask.png', { type: maskBlob.type });
    }

    // 多图 Edits：FormData 同名字段多次 append
    const key = activeKey();
    if (!key) throw new Error('API Key 未设置，请在设置中填写。');

    const base = BLOOOOM_EDITS_BASE;
    const form = new FormData();
    // 基础字段
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      form.append(k, v);
    }
    // 多图：同名字段多次 append（multipart 标准写法）
    fileList.forEach(file => form.append('image', file));

    const res = await fetch(`${base}/images/edits`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}` },
      body: form,
      signal
    });

    if (!res.ok) {
      const text = await res.text();
      let errMsg = `请求失败 (${res.status})`;
      try { errMsg = JSON.parse(text)?.error?.message || errMsg; } catch {}
      throw new Error(errMsg);
    }

    const data = await res.json();

    // 异步模式：返回 task_id → 轮询拿结果
    if (data.task_id) {
      return blooomPollTask(data.task_id, { onProgress, signal });
    }

    // 同步模式：直接返回图片数据
    if (data.data) {
      return data.data.map(item => ({
        url: item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ''),
        revised_prompt: item.revised_prompt || prompt
      })).filter(item => item.url);
    }
    throw new Error('返回数据格式异常');
  }

  // ===================== Midjourney 专用 =====================
  async function midjourneyImagine({ prompt, base64Array = [], count = 1, signal }) {
    const key = activeKey();
    if (!key) throw new Error('Midjourney 需要 API Key，请在设置中填写。');

    const res = await fetch(`${MJ_BASE}/mj/submit/imagine`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt, base64Array }),
      signal
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `请求失败 (${res.status})`);
    }

    const data = await res.json();
    const taskId = data.result;
    if (!taskId) throw new Error('Midjourney 任务提交失败，未返回 task_id');

    return [{ taskId, prompt }];
  }

  async function midjourneyQuery(taskId, signal) {
    const key = activeKey();
    const res = await fetch(`${MJ_BASE}/mj/task/${taskId}/fetch`, {
      headers: { 'Authorization': `Bearer ${key}` },
      signal
    });
    if (!res.ok) throw new Error(`查询失败 (${res.status})`);
    return res.json();
  }

  async function midjourneyEdit({ prompt, imageBase64, action = 'imagine', signal }) {
    const key = activeKey();
    if (!key) throw new Error('Midjourney 需要 API Key');

    const res = await fetch(`${MJ_BASE}/mj/submit/edits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        base64Array: imageBase64 ? [imageBase64] : []
      }),
      signal
    });

    if (!res.ok) throw new Error(`Midjourney 编辑失败 (${res.status})`);
    const data = await res.json();
    const taskId = data.result;
    if (!taskId) throw new Error('Midjourney 任务提交失败');
    return [{ taskId, prompt }];
  }

  // ===================== 扩图（Midjourney Zoom）=====================
  async function imageZoom({ prompt, imageBase64, zoom = '1.5x', signal }) {
    return midjourneyEdit({
      prompt: `${prompt} --zoom ${zoom}`,
      imageBase64,
      action: 'imagine',
      signal
    });
  }

  // ===================== 余额查询 =====================
  async function getBalance() {
    const key = activeKey();
    if (!key) return null;
    try {
      // 余额查询走 t8star
      const res = await fetch(`https://ai.t8star.cn/v1/balance`, {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      const data = await res.json();
      return data.total_available || null;
    } catch {
      return null;
    }
  }

  // ===================== 辅助：base64 → Blob =====================
  function base64ToBlob(base64) {
    // 兼容 "data:image/png;base64,xxxx" 和纯 base64
    const raw = base64.includes(',') ? base64.split(',')[1] : base64;
    const mime = base64.match(/data:([^;]+)/)?.[1] || 'image/png';
    const binary = atob(raw);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // ===================== 智能抠图 API（通过线上 Serverless 代理） =====================
  // 端点: POST /api/remove-bg（Vercel Serverless Function）
  // 流程: 前端 → /api/remove-bg → 抠抠图异步API → 轮询 → 返回图片URL
  // 无需本地代理、无需 API Key 配置

  // 智能抠图 API 地址
  // 部署到 Cloudflare Workers 后，使用以下地址
  // Cloudflare Worker: https://fashion-studio-api.07a587f6f96d973c7b133777c5b280ed.workers.dev/api/remove-bg
  const REMOVE_BG_API = (function() {
    // 优先从 localStorage 读取（用户可自定义）
    const saved = localStorage.getItem('fs_remove_bg_api');
    if (saved) return saved;
    // 默认值：Vercel Serverless Function 代理
    return 'https://vercel-api-ebon-six.vercel.app/api/remove-bg';
  })();

  // 智能抠图主方法 - 调用线上 Serverless Function
  // @param {string} imageBase64 - 原图的 base64 data URL
  // @param {string} imageUrl - 原图的 URL
  // @param {object} signal - AbortSignal
  // @returns {Promise<Array<{url: string}>>}
  async function removeBackground({ imageBase64, imageUrl, signal, onProgress } = {}) {
    if (!imageBase64 && !imageUrl) throw new Error('缺少图片数据');

    onProgress?.({ status: 'processing', message: '正在抠图中...' });

    let processedImage = imageBase64;

    // 如果是 base64，压缩到最大 2000px 宽度
    if (imageBase64) {
      processedImage = await compressImage(imageBase64, 2000);
    }

    const body = processedImage
      ? { image: processedImage }
      : { image_url: imageUrl };

    const res = await fetch(REMOVE_BG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error || `抠图请求失败 (${res.status})`);
    }

    const data = await res.json();
    if (!data.success || !data.url) {
      throw new Error(data.error || '抠图返回异常');
    }

    onProgress?.({ status: 'succeeded' });

    return [{ url: data.url }];
  }

  // 压缩图片到指定最大宽度
  async function compressImage(dataUrl, maxWidth) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // 如果图片已经小于最大宽度，直接返回
        if (img.width <= maxWidth) {
          resolve(dataUrl);
          return;
        }

        // 计算缩放后的尺寸
        const ratio = maxWidth / img.width;
        const canvas = document.createElement('canvas');
        canvas.width = maxWidth;
        canvas.height = Math.round(img.height * ratio);

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.src = dataUrl;
    });
  }

  // ===================== 设置 =====================
  function setConfig(newConfig) {
    // endpoint 保存到 localStorage
    if (newConfig.endpoint !== undefined) {
      config.endpoint = newConfig.endpoint;
      localStorage.setItem('fs_endpoint', newConfig.endpoint);
    }
    // apiKey 仅存会话内存，不持久化
    if (newConfig.apiKey !== undefined) {
      config.apiKey = newConfig.apiKey;
    }
    if (newConfig.defaultModel !== undefined) {
      config.defaultModel = newConfig.defaultModel;
      localStorage.setItem('fs_default_model', newConfig.defaultModel);
    }
    if (newConfig.outputDir !== undefined) {
      config.outputDir = newConfig.outputDir;
      localStorage.setItem('fs_output_dir', newConfig.outputDir);
    }
  }

  function getConfig() {
    return {
      endpoint:    config.endpoint,
      apiKey:      config.apiKey,
      defaultModel: config.defaultModel,
      outputDir:    config.outputDir
    };
  }

  // 有 key 就认为就绪（会话 key 或旧 localStorage key）
  function hasKey() {
    return !!config.apiKey || !!localStorage.getItem('fs_blooom_key');
  }

  // 暴露端点切换（app.js 设置绑定用）
  function setEndpoint(ep) {
    setConfig({ endpoint: ep });
  }

  function getEndpoint() {
    return config.endpoint;
  }

  // ===================== 公开 API =====================
  return {
    textToImage,
    imageToImage,
    imageEdit,

    midjourneyImagine,
    midjourneyQuery,
    midjourneyEdit,
    imageZoom,
    getBalance,
    setConfig,
    getConfig,
    hasKey,

    // 智能抠图（通过线上 Serverless 代理）
    removeBackground
  };
})();

// 挂到全局
window.API_CLIENT = API_CLIENT;
