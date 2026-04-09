/**
 * Fashion Studio - Agent 提示词优化模块
 * 使用 Comfly API + gemini 模型优化提示词
 */

const AGENT_API_URL = 'https://ai.t8star.cn/v1/chat/completions';
const AGENT_MODEL = 'gemini-3-flash-preview-thinking';

// Agent 系统提示词
const AGENT_SYSTEM_PROMPT = `你是一个专业的时尚图片生成提示词优化助手。

用户可能用中文口语化描述他们想要的图片，你的任务是将其转化为专业、高质量的英文图像生成提示词。

优化原则：
1. 保留用户描述的核心内容（主体、动作、场景）
2. 添加专业摄影/时尚术语（editorial, haute couture, fashion photography 等）
3. 补充细节和氛围描述（lighting, mood, style）
4. 使用行业标准标签（studio lighting, high-end fashion, 4K 等）
5. 如果用户指定了风格或品牌，保持一致

输出格式：仅输出优化后的英文提示词，不要解释，不要前缀，不要引号。
直接输出纯文本提示词即可。`;

/**
 * 优化提示词
 * @param {string} userPrompt - 用户原始输入
 * @param {string[]} referenceImages - 参考图片URL数组（可选）
 * @returns {Promise<string>} 优化后的英文提示词
 */
async function optimizePrompt(userPrompt, referenceImages = []) {
  const apiKey = getComflyAPIKey();

  if (!apiKey) {
    throw new Error('请先配置 Comfly API Key');
  }

  // 构建消息
  const messages = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ];

  try {
    const response = await fetch(AGENT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: AGENT_MODEL,
        messages: messages,
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    const optimizedPrompt = data.choices?.[0]?.message?.content?.trim();

    if (!optimizedPrompt) {
      throw new Error('未获取到优化后的提示词');
    }

    return optimizedPrompt;
  } catch (error) {
    console.error('Agent 优化失败:', error);
    throw error;
  }
}

/**
 * 批量优化多个提示词
 * @param {string[]} prompts - 提示词数组
 * @returns {Promise<string[]>}
 */
async function optimizePromptsBatch(prompts) {
  const results = [];
  for (const prompt of prompts) {
    try {
      const optimized = await optimizePrompt(prompt);
      results.push(optimized);
    } catch (error) {
      // 失败时使用原始提示词
      console.warn(`提示词优化失败，使用原始: ${prompt}`);
      results.push(prompt);
    }
  }
  return results;
}

/**
 * 获取优化状态（是否启用）
 */
function isAgentEnabled() {
  return localStorage.getItem('fs_agent_enabled') === 'true';
}

/**
 * 设置 Agent 状态
 */
function setAgentEnabled(enabled) {
  localStorage.setItem('fs_agent_enabled', enabled ? 'true' : 'false');
}

/**
 * 测试 Agent 连接
 */
async function testAgentConnection() {
  try {
    const result = await optimizePrompt('a fashion model in paris');
    return { success: true, sample: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
