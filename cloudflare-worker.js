/**
 * Fashion Studio - 智能抠图 API 代理
 * 部署到 Cloudflare Workers（免费）
 * 
 * 用法：
 *   1. 登录 https://dash.cloudflare.com → Workers & Pages
 *   2. 创建 Worker，粘贴此代码
 *   3. 部署后获得 URL 如 https://fashion-studio-api.xxx.workers.dev
 *   4. 将前端 api_client.js 中 REMOVE_BG_API 改为此 URL
 */

const KOUKOUTU_CREATE_URL = 'https://async.koukoutu.com/v1/create';
const KOUKOUTU_QUERY_URL = 'https://async.koukoutu.com/v1/query';
const KOUKOUTU_API_KEY = 'AkAyySgsXwX5tVYhHI9pYH2VWPndopzM';

const MAX_POLLS = 30;
const POLL_INTERVAL_MS = 1500;

export default {
  async fetch(request) {
    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    if (request.method !== 'POST' || !new URL(request.url).pathname.startsWith('/api/remove-bg')) {
      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
    }

    try {
      const body = await request.json();
      const image = body?.image;

      if (!image) {
        return json({ error: '缺少图片数据', success: false }, 400);
      }

      // 1. 创建抠图任务
      const taskId = await createTask(image);

      // 2. 轮询结果
      const imageUrl = await waitForResult(taskId);

      // 3. 返回图片 URL
      return json({ success: true, url: imageUrl });

    } catch (err) {
      console.error('[remove-bg]', err);
      return json({ error: err.message, success: false }, 500);
    }
  },
};

// ====== 内部函数 ======

async function createTask(imageData) {
  const form = new FormData();
  form.append('model_key', 'background-removal');
  form.append('output_format', 'png');

  if (imageData.startsWith('http')) {
    form.append('image_url', imageData);
  } else {
    // base64 data URL → 提取并转文件
    const base64 = imageData.split(',')[1];
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    form.append('image', new Blob([bytes], { type: 'image/png' }), 'upload.png');
  }

  const res = await fetch(KOUKOUTU_CREATE_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KOUKOUTU_API_KEY}` },
    body: form,
  });

  const json = await res.json();
  if (json.code !== 200) throw new Error(json.message || '创建任务失败');
  return json.data.task_id;
}

async function queryTask(taskId) {
  const form = new FormData();
  form.append('task_id', String(taskId));
  form.append('response', 'url');

  const res = await fetch(KOUKOUTU_QUERY_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KOUKOUTU_API_KEY}` },
    body: form,
  });

  const json = await res.json();
  if (json.code !== 200) throw new Error(json.message || '查询失败');
  return json.data;
}

async function waitForResult(taskId) {
  for (let i = 0; i < MAX_POLLS; i++) {
    const data = await queryTask(taskId);

    if (data.state === 1) return data.result_file; // 完成，返回URL
    if (data.state === 2) throw new Error('抠图处理失败');

    // 继续等待
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('抠图超时，请重试');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
