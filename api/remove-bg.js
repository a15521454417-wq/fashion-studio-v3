/**
 * 抠抠图异步 API 代理（Vercel Serverless Function）
 * 
 * 流程：
 *   1. 前端 POST /api/remove-bg → 此函数
 *   2. 调用 async.koukoutu.com/v1/create 创建任务
 *   3. 轮询 async.koukoutu.com/v1/query 获取结果
 *   4. 返回抠图后的图片 URL
 */

const KOUKOUTU_CREATE_URL = 'https://async.koukoutu.com/v1/create';
const KOUKOUTU_QUERY_URL = 'https://async.koukoutu.com/v1/query';
const KOUKOUTU_API_KEY = 'AkAyySgsXwX5tVYhHI9pYH2VWPndopzM';

// 最大轮询次数和间隔
const MAX_POLLS = 30;      // 最多轮询30次
const POLL_INTERVAL = 1500; // 每1.5秒查一次（约45秒超时）

/**
 * 发送 FormData 请求
 */
async function postFormData(url, formData) {
  const res = await fetch(url, {
    method: 'POST',
    body: formData,
  });
  return res;
}

/**
 * 创建抠图任务
 */
async function createTask(imageData) {
  const form = new FormData();
  form.append('model_key', 'background-removal');
  form.append('output_format', 'png');
  
  if (imageData.startsWith('http')) {
    form.append('image_url', imageData);
  } else {
    // base64 data URL → 需要作为文件上传
    // 提取纯 base64 数据
    const base64 = imageData.split(',')[1];
    // 将 base64 转 Buffer
    const binary = Buffer.from(base64, 'base64');
    const blob = new Blob([binary], { type: 'image/png' });
    form.append('image', blob, 'upload.png');
  }

  const res = await postFormData(KOUKOUTU_CREATE_URL, form);
  const json = await res.json();

  if (json.code !== 200) {
    throw new Error(json.message || `创建任务失败: ${JSON.stringify(json)}`);
  }

  return json.data.task_id;
}

/**
 * 查询任务结果
 */
async function queryTask(taskId) {
  const form = new FormData();
  form.append('task_id', String(taskId));
  form.append('response', 'url');

  const res = await postFormData(KOUKOUTU_QUERY_URL, form);
  const json = await res.json();

  if (json.code !== 200) {
    throw new Error(json.message || `查询失败: ${JSON.stringify(json)}`);
  }

  return json.data;
}

/**
 * 等待任务完成
 */
async function waitForResult(taskId) {
  for (let i = 0; i < MAX_POLLS; i++) {
    const data = await queryTask(taskId);
    
    // state: 0=处理中, 1=完成, 2=失败
    if (data.state === 1) {
      return data.result_file; // 图片 URL
    }
    
    if (data.state === 2) {
      throw new Error('抠图处理失败');
    }

    // 继续等待
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }

  throw new Error('抠图超时，请重试');
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: '缺少图片数据' });
    }

    // 1. 创建任务
    const taskId = await createTask(image);

    // 2. 轮询结果
    const imageUrl = await waitForResult(taskId);

    // 3. 返回
    return res.status(200).json({
      success: true,
      url: imageUrl,
    });

  } catch (err) {
    console.error('[remove-bg]', err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
