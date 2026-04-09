/**
 * FashionStudio — Prompt Agent（AI 提示词优化器）
 *
 * 通过 LLM（复用 BLOOOOM 或 DashScope 聊天接口）智能优化用户 prompt。
 * 输出结构化 JSON：{ thinking, enhanced }
 *
 * Agent 来源（优先级）：
 * 1. BLOOOOM 端点 — 走 OpenAI 兼容 chat/completions
 * 2. DashScope 端点 — 走阿里云百炼兼容接口
 */

const PROMPT_AGENT = (() => {

  // ===================== 系统提示词 =====================
  const SYSTEM_PROMPT = `你是一位顶尖的时尚摄影 AI 提示词专家。你的任务是将用户的粗略描述优化为高质量、结构化的生图提示词。

## 工作流程

1. **分析用户意图**：识别主体、服装、场景、风格、情绪
2. **识别缺失维度**：判断哪些关键维度需要补充
3. **结构化重写**：按专业摄影术语组织提示词

## 优化维度清单
- **主体描述**：年龄感、体型、肤色、发型、面部特征、表情
- **服装细节**：材质、剪裁、颜色、品牌感、穿搭层次
- **光线设计**：光源类型（自然光/影棚/窗光/霓虹）、方向（侧光/逆光/顶光）、质感（柔和/硬光/漫反射）
- **构图方式**：景别（特写/半身/全身/远景）、角度（平视/俯拍/仰拍）、构图法（三分法/居中/对角线）
- **场景氛围**：室内/室外、时间（白天/黄昏/夜晚）、环境细节
- **色调风格**：整体色调（暖色/冷色/中性）、后期风格（胶片/数码/高饱和/低饱和）
- **镜头语言**：焦段暗示（广角/标准/长焦）、景深效果（浅景深/全景深）、画面质感
- **画质要求**：分辨率感、细节精度、噪点控制

## 输出规则
- 用**与用户输入相同的语言**输出（用户输入中文就输出中文）
- 保持用户原始意图不变，不添加用户未暗示的元素
- 补充内容要具体可感知，不要用空泛形容词
- 控制总长度在 200 字以内（中文），英文 80 词以内
- 不要出现编号、markdown 格式符号
- 直接输出优化后的提示词文本

## 输出格式（严格 JSON）
{
  "thinking": "简短的思考过程，2-3句话，描述你识别到了什么、为什么这样优化（用用户语言）",
  "enhanced": "优化后的完整提示词文本（纯文本，不含引号或标记）"
}

只输出 JSON，不要输出任何其他内容。`;

  // ===================== 配置 =====================
  let agentSource = localStorage.getItem('fs_agent_source') || 'blooom'; // 'blooom' | 'dashscope'
  let customModel = localStorage.getItem('fs_agent_model') || '';        // 用户自定义模型名（可选）

  // ===================== 核心函数 =====================

  /**
   * 优化提示词
   * @param {string} prompt - 用户原始 prompt
   * @param {Object} opts
   * @param {AbortSignal} [opts.signal] - 取消信号
   * @param {Function} [opts.onThinking] - 思考过程流式回调 (text: string) => void
   * @returns {Promise<{thinking: string, enhanced: string}>}
   */
  async function optimize(prompt, { signal, onThinking } = {}) {
    if (!prompt.trim()) throw new Error('请先输入描述');

    // 选择数据源
    const source = agentSource;
    if (source === 'dashscope') {
      return optimizeViaDashScope(prompt, { signal, onThinking });
    }
    return optimizeViaBlooom(prompt, { signal, onThinking });
  }

  // ===================== BLOOOOM（OpenAI 兼容） =====================
  async function optimizeViaBlooom(prompt, { signal, onThinking } = {}) {
    const key = API_CLIENT?.getConfig?.()?.apiKey;
    if (!key) throw new Error('请先在设置中填写 BLOOOOM API Key');

    const endpoint = 'https://ai.t8star.cn/v1/chat/completions';
    const model = customModel || 'gemini-2.5-flash';

    const body = {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1024
    };

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
      throw new Error(err.error?.message || `Agent 请求失败 (${res.status})`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    return parseAgentResponse(content);
  }

  // ===================== DashScope（阿里云百炼） =====================
  async function optimizeViaDashScope(prompt, { signal, onThinking } = {}) {
    const key = WAN_API?.getKey?.();
    if (!key) throw new Error('请先在设置中填写万相 Wan API Key');

    const endpoint = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    const model = customModel || 'qwen-turbo';

    const body = {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1024
    };

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
      throw new Error(err.error?.message || `Agent 请求失败 (${res.status})`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    return parseAgentResponse(content);
  }

  // ===================== 响应解析 =====================
  function parseAgentResponse(content) {
    // 尝试从 markdown 代码块中提取 JSON
    let jsonStr = content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // 尝试直接解析
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.thinking && parsed.enhanced) {
        return {
          thinking: parsed.thinking,
          enhanced: parsed.enhanced
        };
      }
    } catch {}

    // Fallback: 尝试从非 JSON 文本中提取
    // 如果模型没有返回 JSON，把整个回复作为 enhanced
    if (content.trim().length > 10) {
      return {
        thinking: 'Agent 已完成分析',
        enhanced: content.trim().replace(/^["']|["']$/g, '')
      };
    }

    throw new Error('Agent 返回内容格式异常，请重试');
  }

  // ===================== 设置 =====================
  function setSource(source) {
    agentSource = source;
    localStorage.setItem('fs_agent_source', source);
  }

  function getSource() { return agentSource; }

  function setModel(model) {
    customModel = model;
    localStorage.setItem('fs_agent_model', model);
  }

  function getModel() { return customModel; }

  /**
   * 检查 Agent 是否可用（至少有一个 API Key）
   */
  function isReady() {
    if (agentSource === 'blooom') {
      return !!API_CLIENT?.hasKey?.();
    }
    return !!WAN_API?.hasKey?.();
  }

  /**
   * 获取当前 Agent 状态描述
   */
  function getStatus() {
    const blooomReady = !!API_CLIENT?.hasKey?.();
    const dashscopeReady = !!WAN_API?.hasKey?.();
    const model = customModel || (agentSource === 'blooom' ? 'gemini-2.5-flash' : 'qwen-turbo');
    return { blooomReady, dashscopeReady, source: agentSource, model };
  }

  // ===================== 公开 API =====================
  return {
    optimize,
    setSource,
    getSource,
    setModel,
    getModel,
    isReady,
    getStatus
  };
})();

// 挂到全局
window.PROMPT_AGENT = PROMPT_AGENT;
