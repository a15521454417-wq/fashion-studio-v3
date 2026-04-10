// ===================== MediaPipe 画笔涂抹抠图模块 =====================
// 基于 MediaPipe InteractiveSegmenter (magic_touch 模型)
// 用户涂抹 → 收集笔迹坐标 → 批量分割 → 返回抠图结果
// CDN: @mediapipe/tasks-vision@0.10.0
// 模型: magic_touch.tflite（约 3-5MB，CDN 自动加载）

let segmenter = null;
let segmenterReady = false;
let segmenterLoading = false;

// 模型 CDN 地址
const MP_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';

  // 初始化 MediaPipe InteractiveSegmenter
export async function initSegmenter(onProgress) {
  if (segmenterReady) return true;
  if (segmenterLoading) return false;
  segmenterLoading = true;

  try {
    // 动态导入 MediaPipe Tasks Vision（ESM from CDN）
    const mp = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/+esm');
    const { FilesetResolver, InteractiveSegmenter, InteractiveSegmenterOptions } = mp;

    if (onProgress) onProgress('加载分割模型...');

    // 创建 InteractiveSegmenter
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
    );

    const options = {
      baseOptions: {
        modelAssetPath: MP_MODEL_URL,
        delegate: 'CPU'   // CPU 兼容性最好
      },
      outputCategoryMask: true,
      outputConfidenceMask: false
    };

    segmenter = await InteractiveSegmenter.createFromOptions(vision, options);
    segmenterReady = true;
    console.log('[MediaPipe] ✅ 画笔分割模型加载完成');
    return true;
  } catch (err) {
    console.error('[MediaPipe] ❌ 模型加载失败:', err);
    segmenterLoading = false;
    return false;
  } finally {
    segmenterLoading = false;
  }
}

// 执行画笔分割
// @param {HTMLImageElement|HTMLCanvasElement} imageElement - 原图
// @param {Array<{x:number, y:number}>} paintedPoints - 像素坐标数组
// @param {Function} onProgress - 进度回调
// @returns {Promise<{url: string}>} 透明背景 PNG data URL
export async function segmentWithBrush(imageElement, paintedPoints, onProgress) {
  if (!segmenterReady) {
    await initSegmenter(onProgress);
  }

  if (!segmenter) {
    throw new Error('MediaPipe 分割器初始化失败');
  }

  onProgress?.('正在分割...');

  // 采样笔迹点（每 20px 取一个，减少点数）
  const sampledPoints = samplePoints(paintedPoints, imageElement.width, imageElement.height, 20);

  if (sampledPoints.length === 0) {
    throw new Error('请先在图上涂抹要抠出的区域');
  }

  // 构建 normalizedKeypoints（MediaPipe 接受 {x, y} 归一化坐标）
  const keypoints = sampledPoints.map(p => ({
    x: p.x / (imageElement.width || imageElement.naturalWidth),
    y: p.y / (imageElement.height || imageElement.naturalHeight)
  }));

  onProgress?.('AI 分割中...');

  // 执行分割（segment() 是同步方法）
  const result = segmenter.segment(imageElement, keypoints);

  // 从 categoryMask 生成透明背景 PNG
  const foregroundDataUrl = await applyMask(imageElement, result.categoryMask);

  return { url: foregroundDataUrl };
}

// 将蒙版应用到原图，生成透明背景 PNG
async function applyMask(imageElement, categoryMask) {
  const width = imageElement.width || imageElement.naturalWidth;
  const height = imageElement.height || imageElement.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 绘制原图
  ctx.drawImage(imageElement, 0, 0);

  // 获取原图像素数据
  const originalData = ctx.getImageData(0, 0, width, height);
  const origPixels = originalData.data;

  // 获取 mask 数据
  const maskData = categoryMask.getAsFloat32Array();

  // 应用蒙版：前景保留，背景透明
  for (let i = 0; i < maskData.length; i++) {
    const idx = i * 4;
    const isForeground = maskData[i] === 1;
    if (!isForeground) {
      origPixels[idx + 3] = 0; // 设为完全透明
    }
  }

  ctx.putImageData(originalData, 0, 0);
  return canvas.toDataURL('image/png');
}

// 对笔迹点采样（减少点数）
function samplePoints(points, imgWidth, imgHeight, minDistance) {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]];

  const sampled = [points[0]];
  let lastPoint = points[0];

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const dx = p.x - lastPoint.x;
    const dy = p.y - lastPoint.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= minDistance) {
      sampled.push(p);
      lastPoint = p;
    }
  }

  return sampled;
}

// 暴露到 window 供普通脚本调用
window.__mpInit = initSegmenter;
window.__mpSegment = segmentWithBrush;
window.__mpIsReady = () => segmenterReady;
