/**
 * FashionStudio — Wan 2.7 API 封装
 * 阿里云百炼 DashScope 协议（非 OpenAI 兼容）
 *
 * 图像：同步请求，直接返回结果
 * 视频：异步请求，提交任务 → 轮询 task_id → 拿结果
 */

const WAN_API = (() => {
  // DashScope 端点（北京）
  const IMAGE_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
  const VIDEO_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis';
  const TASK_QUERY     = 'https://dashscope.aliyuncs.com/api/v1/tasks/';

  // 模型名
  const IMAGE_MODEL_PRO   = 'wan2.7-image-pro';
  const IMAGE_MODEL_STD   = 'wan2.7-image';
  const VIDEO_MODEL       = 'wan2.7-t2v';

  // Wan API Key（会话级，不持久化）
  let wanApiKey = localStorage.getItem('fs_wan_key') || '';

  // ===================== 配置 =====================
  function setKey(key) {
    wanApiKey = key;
    if (key) localStorage.setItem('fs_wan_key', key);
    else localStorage.removeItem('fs_wan_key');
  }

  function getKey() { return wanApiKey; }
  function hasKey() { return !!wanApiKey; }

  // ===================== 工具函数 =====================
  // base64 → Blob
  function base64ToBlob(base64) {
    const raw = base64.includes(',') ? base64.split(',')[1] : base64;
    const mime = base64.match(/data:([^;]+)/)?.[1] || 'image/png';
    const binary = atob(raw);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // ===================== 图像生成（同步）=====================
  /**
   * Wan 2.7 文生图
   * @param {Object} opts
   * @param {string} opts.prompt - 提示词（最多 5000 字符）
   * @param {string} [opts.negativePrompt] - 反向提示词
   * @param {string} [opts.model='wan2.7-image'] - 'wan2.7-image' | 'wan2.7-image-pro'
   * @param {string} [opts.size='1024*1024'] - 分辨率，如 '1024*1024', '2048*2048'(Pro only)
   * @param {number} [opts.n=1] - 生成数量 1~12
   * @param {boolean} [opts.thinkingMode=true] - 思维模式
   * @param {Array} [opts.refImages] - 参考图 base64 数组（最多 9 张）
   * @param {string} [opts.refPrompt] - 参考图对应的提示词
   * @param {AbortSignal} [opts.signal] - 取消信号
   * @returns {Promise<Array<{url: string, revised_prompt: string}>>}
   */
  async function textToImage({
    prompt,
    negativePrompt,
    model = IMAGE_MODEL_STD,
    size = '1024*1024',
    n = 1,
    thinkingMode = true,
    refImages = [],
    refPrompt = '',
    signal
  } = {}) {
    if (!wanApiKey) throw new Error('Wan API Key 未设置');

    // 构建 messages
    const messages = [];

    // 如果有参考图，用多模态消息
    if (refImages.length > 0) {
      const content = [];
      refImages.forEach(b64 => {
        const raw = b64.includes(',') ? b64.split(',')[1] : b64;
        const mime = b64.match(/data:([^;]+)/)?.[1] || 'image/png';
        content.push({ image: `data:${mime};base64,${raw}` });
      });
      content.push({ text: refPrompt || prompt });
      messages.push({ role: 'user', content });
    } else {
      messages.push({ role: 'user', content: [{ text: prompt }] });
    }

    const body = {
      model,
      input: { messages },
      parameters: {
        n,
        size,
        thinking_mode: thinkingMode
      }
    };

    if (negativePrompt) body.input.negative_prompt = negativePrompt;

    const res = await fetch(IMAGE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${wanApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `Wan 图像请求失败 (${res.status})`);
    }

    const data = await res.json();

    // DashScope 同步返回格式：
    // { output: { choices: [{ message: { content: [{ image: "data:image/png;base64,..." }] } }] } }
    // 或者异步返回：{ output: { task_id: "...", task_status: "PENDING" } }
    if (data.output?.task_id) {
      // 异步模式，轮询拿结果
      return pollImageTask(data.output.task_id, { signal });
    }

    // 同步模式，直接提取
    const choices = data.output?.choices || [];
    const results = [];
    choices.forEach(choice => {
      const parts = choice.message?.content || [];
      parts.forEach(part => {
        if (part.image) {
          results.push({
            url: part.image,
            revised_prompt: prompt
          });
        }
      });
    });

    if (results.length === 0) throw new Error('Wan 图像生成未返回结果');
    return results;
  }

  // ===================== 图像异步轮询 =====================
  async function pollImageTask(taskId, { signal, interval = 3000 } = {}) {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      if (signal?.aborted) throw new DOMException('已取消', 'AbortError');

      const res = await fetch(`${TASK_QUERY}${taskId}`, {
        headers: { 'Authorization': `Bearer ${wanApiKey}` },
        signal
      });
      if (!res.ok) throw new Error(`查询任务失败 (${res.status})`);

      const task = await res.json();
      const status = task.output?.task_status;

      if (status === 'SUCCEEDED') {
        const results = [];
        const choices = task.output?.choices || [];
        choices.forEach(choice => {
          const parts = choice.message?.content || [];
          parts.forEach(part => {
            if (part.image) results.push({ url: part.image, revised_prompt: '' });
          });
        });
        if (results.length > 0) return results;
        throw new Error('任务成功但未返回图片');
      }
      if (status === 'FAILED') {
        throw new Error(`图像生成失败：${task.output?.message || '未知错误'}`);
      }

      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error('图像生成超时（3分钟）');
  }

  // ===================== 视频生成（异步）=====================
  /**
   * Wan 2.7 文生视频
   * @param {Object} opts
   * @param {string} opts.prompt - 提示词（最多 5000 字符）
   * @param {string} [opts.negativePrompt] - 反向提示词（最多 500 字符）
   * @param {string} [opts.resolution='1080P'] - '720P' | '1080P'
   * @param {string} [opts.ratio='16:9'] - '16:9' | '9:16' | '1:1' | '4:3' | '3:4'
   * @param {number} [opts.duration=5] - 时长 2~15 秒
   * @param {string} [opts.seed] - 随机种子
   * @param {AbortSignal} [opts.signal] - 取消信号
   * @param {Function} [opts.onProgress] - 进度回调 (status, elapsedSec)
   * @returns {Promise<{url: string, duration: number}>}
   */
  async function textToVideo({
    prompt,
    negativePrompt,
    resolution = '1080P',
    ratio = '16:9',
    duration = 5,
    seed,
    signal,
    onProgress
  } = {}) {
    if (!wanApiKey) throw new Error('Wan API Key 未设置');

    const body = {
      model: VIDEO_MODEL,
      input: {
        prompt,
      },
      parameters: {
        resolution,
        ratio,
        duration,
        prompt_extend: true
      }
    };

    if (negativePrompt) body.input.negative_prompt = negativePrompt;
    if (seed !== undefined) body.parameters.seed = seed;

    const res = await fetch(VIDEO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${wanApiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable'
      },
      body: JSON.stringify(body),
      signal
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `Wan 视频请求失败 (${res.status})`);
    }

    const data = await res.json();
    const taskId = data.output?.task_id;
    if (!taskId) throw new Error('Wan 视频任务提交失败');

    // 开始轮询
    return pollVideoTask(taskId, { signal, onProgress });
  }

  // ===================== 视频轮询 =====================
  async function pollVideoTask(taskId, { signal, onProgress, interval = 15000 } = {}) {
    const maxAttempts = 120; // 最多 30 分钟
    const startTime = Date.now();

    for (let i = 0; i < maxAttempts; i++) {
      if (signal?.aborted) throw new DOMException('已取消', 'AbortError');

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      onProgress?.('PENDING', elapsed);

      const res = await fetch(`${TASK_QUERY}${taskId}`, {
        headers: { 'Authorization': `Bearer ${wanApiKey}` },
        signal
      });
      if (!res.ok) throw new Error(`查询视频任务失败 (${res.status})`);

      const task = await res.json();
      const status = task.output?.task_status;

      onProgress?.(status, elapsed);

      if (status === 'SUCCEEDED') {
        const videoUrl = task.output?.video_url;
        if (!videoUrl) throw new Error('视频任务成功但未返回视频地址');
        return {
          url: videoUrl,
          duration: task.output?.duration || 5
        };
      }
      if (status === 'FAILED') {
        throw new Error(`视频生成失败：${task.output?.message || '未知错误'}`);
      }

      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error('视频生成超时（30分钟）');
  }

  // ===================== 图生视频（异步）=====================
  /**
   * Wan 2.7 图生视频
   * @param {Object} opts
   * @param {string} opts.prompt - 提示词
   * @param {string} opts.imageBase64 - 首帧图片 base64
   * @param {string} [opts.resolution='1080P']
   * @param {string} [opts.ratio='16:9']
   * @param {number} [opts.duration=5]
   * @param {AbortSignal} [opts.signal]
   * @param {Function} [opts.onProgress]
   */
  async function imageToVideo({
    prompt,
    imageBase64,
    resolution = '1080P',
    ratio = '16:9',
    duration = 5,
    signal,
    onProgress
  } = {}) {
    if (!wanApiKey) throw new Error('Wan API Key 未设置');
    if (!imageBase64) throw new Error('缺少首帧图片');

    // DashScope 图生视频用异步接口，图片需要通过 base64 传入
    const raw = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const mime = imageBase64.match(/data:([^;]+)/)?.[1] || 'image/png';

    const body = {
      model: VIDEO_MODEL,
      input: {
        prompt,
      },
      parameters: {
        resolution,
        ratio,
        duration,
        prompt_extend: true
      }
    };

    // 阿里云图生视频 API：图片放在 input 中
    // 使用 i2v 端点
    const I2V_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis';

    // 参考官方文档，图生视频用同一端点但传入图片
    body.input.image_url = `data:${mime};base64,${raw}`;

    const res = await fetch(I2V_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${wanApiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable'
      },
      body: JSON.stringify(body),
      signal
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `Wan 图生视频请求失败 (${res.status})`);
    }

    const data = await res.json();
    const taskId = data.output?.task_id;
    if (!taskId) throw new Error('Wan 图生视频任务提交失败');

    return pollVideoTask(taskId, { signal, onProgress });
  }

  // ===================== 公开 API =====================
  return {
    textToImage,
    textToVideo,
    imageToVideo,
    setKey,
    getKey,
    hasKey,
    // 常量
    IMAGE_MODEL_STD,
    IMAGE_MODEL_PRO,
    VIDEO_MODEL
  };
})();

window.WAN_API = WAN_API;
