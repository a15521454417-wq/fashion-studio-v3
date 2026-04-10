// ===================== imgly/background-removal ESM 模块 =====================
// 通过 CDN 加载，模型自动缓存到 IndexedDB，离线可用
// 首次加载约 20-30MB，后续秒开
// 暴露 window.__imglyRemoveBg 供普通脚本调用

let imglyRemoveBackground = null;
let imglyReady = false;
let imglyLoadError = null;

// 主动预加载（用户开始抠图前调用）
export async function preloadImgly() {
  if (imglyReady) return true;
  if (imglyLoadError) return false;

  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm');
    imglyRemoveBackground = mod.removeBackground;

    await mod.preload({
      device: 'cpu',
      model: 'isnet_fp16',
      progress: (key, current, total) => {
        console.log(`[imgly] ${key}: ${current}/${total}`);
      }
    });

    imglyReady = true;
    console.log('[imgly] ✅ 抠图模型加载完成（完全离线可用）');
    return true;
  } catch (err) {
    imglyLoadError = err;
    console.error('[imgly] ❌ 模型加载失败:', err.message);
    return false;
  }
}

// 抠图主方法 - 暴露到 window 供 api_client.js 调用
export async function removeBackground(imageSource, onProgress) {
  if (!imglyReady) {
    await preloadImgly();
  }

  if (!imglyRemoveBackground) {
    throw new Error('imgly 模型加载失败');
  }

  const blob = await imglyRemoveBackground(imageSource, {
    device: 'cpu',
    model: 'isnet_fp16',
    output: {
      format: 'image/png',
      quality: 1.0,
      type: 'foreground'
    },
    progress: (key, current, total) => {
      const label = {
        'decode': '加载模型',
        'inference': 'AI 推理',
        'mask': '生成蒙版',
        'encode': '合成图像'
      }[key] || key;
      if (onProgress) {
        onProgress({ status: 'processing', message: `抠图中... ${label}` });
      }
    }
  });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve({ url: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// 暴露到 window，供普通 <script> 调用
window.__imglyRemoveBg = removeBackground;
window.__imglyPreload = preloadImgly;
window.__imglyIsReady = () => imglyReady;
window.__imglyGetError = () => imglyLoadError;

// 自动预加载（页面加载时静默准备模型）
preloadImgly().catch(() => {});
