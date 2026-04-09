/**
 * FashionStudio — 预设提示词库
 * 对应预设提示词库_时尚电商.md
 */

const PRESET_PROMPTS = {

  // ============================================================
  // 1. 万物穿戴
  // ============================================================
  wearables: {
    bag: {
      prompt: `保留图中人物的整体形象、姿势、面部不变。
在人物手上或肩上添加/替换为指定包包，保持光影自然，
材质质感逼真（皮革/帆布/金属），与人物风格统一。
不要改变人物的手部结构。`
    },
    hat: {
      prompt: `保留图中人物的整体形象、面部、发型不变。
在人物头部添加/替换为指定帽子，角度、比例自然，
与脸型、发际线贴合，不遮挡面部特征。
保持原图的灯光和背景不变。`
    },
    accessory: {
      prompt: `保留图中人物的整体形象和姿势不变。
添加/替换指定配饰（项链/耳环/围巾/腰带/手表），材质光影自然，
比例协调，与人物穿搭风格统一。
保持原图光线和背景不变。`
    },
    glasses: {
      prompt: `保留图中人物的面部、发型、姿势完全不变。
替换/添加指定眼镜或墨镜，角度与面部贴合，
镜片反光自然，镜框与脸型协调。
保持原图光影和背景不变。`
    },
    top: {
      prompt: `保留图中人物的姿势、面部、发型、背景、光影完全不变。
将上身服装替换为指定款式（T恤/衬衫/卫衣/外套/毛衣等），
保持服装垂感、褶皱、材质光影自然。
不改变人物体型和手部结构。`
    },
    bottom: {
      prompt: `保留图中人物的姿势、面部、上身服装、鞋子、背景、光影完全不变。
将下身替换为指定款式（牛仔裤/休闲裤/裙子/短裤等），
保持裤型/裙型自然，褶皱、材质质感逼真。
不改变人物站姿和比例。`
    },
    shoes: {
      prompt: `保留图中人物的整体形象、姿势、服装、面部、背景完全不变。
将脚上的鞋子替换为指定款式，保持角度、比例自然，
与整体穿搭风格协调，鞋履光影与原图统一。`
    },
    custom: {
      prompt: `图中有两张参考图：第一张是人物原图，第二张是目标服装或单品。
请将第二张图中的服装单品穿到第一张图的人物身上，
保持人物的姿势、面部、发型、肤色、背景完全不变，
服装的材质、褶皱、光影自然逼真，与人物融为一体。
不要改变人物的形象特征、体型和肤色。`
    }
  },

  // ============================================================
  // 2. 模特修整
  // ============================================================
  model: {
    face: {
      prompt: `将图中人物的面部替换为参考图中的人物面部，
保留原图人物的发型、身体、服装、姿势、光影完全不变。
面部角度、肤色、表情自然过渡。`
    },
    model: {
      prompt: `将图中人物/模特整体替换为参考图中的模特，
保留原图的姿势、服装搭配、背景、光影不变。
人物比例、服装细节自然协调。`
    },
    background: {
      prompt: `保留图中人物的姿势、面部、服装完全不变，
仅将背景替换为指定场景，保持人物光影与新背景融合自然。
`
    }
  },

  // ============================================================
  // 3. 商品精修
  // ============================================================
  retouch: {
    refine: {
      prompt: `对图中商品进行专业精修：去除表面瑕疵、褶皱抚平、颜色校正、
材质增强（皮革光泽/棉麻纹理/金属质感）。
保持商品原有轮廓和结构不变，保留细节真实感。
电商白底/棚拍风格。`
    },
    '3d': {
      prompt: `将平铺拍摄的服装转化为立体3D效果：模拟真人穿戴形态，
呈现自然垂感、褶皱、光影。
保留服装原有颜色和材质细节，
看上去像专业棚拍模特图。`
    }
  },

  // ============================================================
  // 4. 智能抠图
  // ============================================================
  cutout: {
    white: {
      prompt: `将图中商品完整抠出，边缘清晰干净，发丝/毛边/透明材质
处理精准。输出纯白背景，保留商品原有颜色和质感。
适用于电商主图、详情页使用。`
    },
    scene: {
      prompt: `将图中商品/人物完整抠出，边缘处理精细，发丝、毛边、
半透明区域保留完整。
为商品替换背景准备高质量素材。`
    }
  },

  // ============================================================
  // 5. 商品换背景
  // ============================================================
  background: {
    indoor: {
      prompt: `将商品置于优雅室内场景：现代客厅、自然采光、简洁墙面。
保持商品比例、光影、色调自然协调。
电商模特图风格。`
    },
    outdoor: {
      prompt: `将商品置于自然外景：街头/公园/建筑。
保持商品颜色和质感不变，光影与新背景融合自然。`
    },
    solid: {
      prompt: `将商品置于纯色背景（指定颜色），保持商品原有
质感、光影、颜色不变，边缘过渡自然。
适用于电商详情页套图。`
    }
  },

  // ============================================================
  // 6. 图片编辑
  // ============================================================
  edit: {
    recolor: {
      prompt: `保留图中人物的姿势、面部、发型、背景完全不变。
仅改变服装的颜色为指定色，保留服装的款式、材质、
褶皱、光影效果不变。`
    },
    expand: {
      prompt: `智能扩展图片边界，填充内容与原图风格、光影、色调统一，
边缘过渡自然无缝。保持原图主体内容不变。`
    },
    erase: {
      prompt: `从图中自然移除指定物体/人物，智能填充移除区域，
使填充内容与周围背景光影、纹理自然融合，不留痕迹。`
    },
    upscale: {
      prompt: `对图中进行高清修复：提升清晰度、增强细节、还原质感。
噪点去除、画面干净、保留原有风格和色调。
使低分辨率图片达到商业级高清质量。`
    }
  }
};

// ============================================================
// Tab 功能说明文本
// ============================================================
const TAB_INFO = {
  creative: {
    title: '创意生图',
    subtitle: '输入你想象中的画面，AI 为你生成时尚大片',
    content: `<p><strong>使用方式：</strong>在下方输入描述，选择模特场景和风格标签，点击「生成图片」。</p>
<p><strong>技巧：</strong>描述越具体效果越好，如：包含人物、穿着、场景、光线、氛围等细节。</p>
<p><strong>参考图：</strong>上传参考图可以让 AI 更好地理解你想要的风格和构图。</p>`
  },
  wearables: {
    title: '万物穿戴',
    subtitle: '为模特添加或替换各类穿戴单品',
    content: `<p><strong>使用方式：</strong>选择穿戴类型，描述要穿戴的物品，上传带人物的参考图，点击生成。</p>
<p><strong>适用场景：</strong>电商模特图换款、搭配方案展示、多款试穿效果对比。</p>
<p><strong>支持类型：</strong>包包、帽子、配饰（项链/耳环/围巾/腰带/手表）、眼镜、上衣、裤子/裙子、鞋子。</p>`
  },
  model: {
    title: '模特修整',
    subtitle: '换脸、换模特、换背景，一键完成',
    content: `<p><strong>换脸：</strong>上传需要换脸的人物图，以及提供面部参考图。</p>
<p><strong>换模特：</strong>保留原图穿搭和姿势，替换为不同模特形象。</p>
<p><strong>换背景：</strong>保留人物不变，为其更换室内/室外/纯色背景。</p>`
  },
  retouch: {
    title: '商品精修',
    subtitle: '专业级商品图片精修，提升电商展示效果',
    content: `<p><strong>服装精修：</strong>去除褶皱、瑕疵，校正颜色，增强材质质感（皮革光泽/棉麻纹理/金属质感）。</p>
<p><strong>平铺转3D：</strong>将平铺的服装图转化为立体穿戴效果，模拟专业棚拍模特图。</p>`
  },
  cutout: {
    title: '智能抠图',
    subtitle: '一键提取商品主体，边缘处理干净精准',
    content: `<p><strong>白底抠图：</strong>输出纯白背景，适用电商主图、详情页。</p>
<p><strong>场景抠图：</strong>保留完整边缘细节，为换背景准备高质量素材。</p>
<p><strong>支持：</strong>服装、包包、鞋子、人物等各种商品类别。</p>`
  },
  background: {
    title: '商品换背景',
    subtitle: '将商品置于任意场景，快速生成电商场景图',
    content: `<p><strong>室内场景：</strong>现代客厅、咖啡馆、书房等室内环境。</p>
<p><strong>外景/自然：</strong>街头、公园、海边等户外场景。</p>
<p><strong>纯色背景：</strong>选择指定颜色，适合电商详情页套图。</p>`
  },
  edit: {
    title: '图片编辑',
    subtitle: 'AI 驱动的精准图片编辑能力',
    content: `<p><strong>AI换色：</strong>仅改变服装颜色，保持款式和光影不变。</p>
<p><strong>AI扩图：</strong>智能扩展图片边界，填充内容自然融合。</p>
<p><strong>消除笔：</strong>移除图片中不需要的物体/人物，智能填充背景。</p>
<p><strong>高清修复：</strong>提升清晰度、增强质感，商业级输出质量。</p>`
  },
  lighting: {
    title: '光影工坊',
    subtitle: '12种专业打光预设，一键提升画面质感',
    content: `<p><strong>使用方式：</strong>在右侧选项面板选择打光风格，描述主体内容，上传参考图（可选），点击「光影生成」。</p>
<p><strong>光影矫正：</strong>上传已有图片，AI 自动优化光影效果。</p>
<p><strong>智能打光：</strong>上传暗图或光线不佳的图片，AI 智能重新布光。</p>
<p><strong>支持 12 种预设：</strong>伦勃朗光、蝴蝶光、分割光、背光/轮廓光、底光、顶光、黄金时刻、蓝调时刻、赛博朋克、自然光、棚拍标准、胶片质感。</p>`
  },
  grid: {
    title: '宫格生成',
    subtitle: '一键生成多角度/多场景组合图',
    content: `<p><strong>多机位九宫格：</strong>9种不同机位角度（正面/侧45°/俯拍/仰拍/特写等），一次生成全面展示。</p>
<p><strong>剧情四宫格：</strong>起承转合四帧故事化展示，适合社交媒体和宣传素材。</p>
<p><strong>25宫格分镜：</strong>25帧连贯动作分解，适合视频分镜和产品细节展示。</p>
<p><strong>使用方式：</strong>选择宫格类型，描述主体内容，上传参考图（可选），点击「批量生成」。</p>`
  },
  multiangle: {
    title: '多角度',
    subtitle: '角色三视图/360度环绕/全视角生成',
    content: `<p><strong>角色三视图：</strong>正面 + 左侧面 + 背面，适合角色设计和服装展示。</p>
<p><strong>8方向环绕：</strong>水平360度旋转，每45度一张，适合产品全方位展示。</p>
<p><strong>15角度全视角：</strong>8水平 + 4垂直 + 3景别，最全面的视角覆盖。</p>
<p><strong>使用方式：</strong>选择视角方案，描述角色/产品，点击「批量生成」。</p>`
  },
  camera_view: {
    title: '相机视角',
    subtitle: '三维相机视角球，精确控制拍摄角度',
    content: `<p><strong>三维视角球：</strong>拖动旋转球体或使用滑块，精确设置相机位置。</p>
<p><strong>预设视角：</strong>正面、前右、侧面、前左、高位、低位，快速切换常用角度。</p>
<p><strong>额外提示词：</strong>可添加镜头效果描述，如鱼眼、广角、浅景深等。</p>
<p><strong>使用方式：</strong>调整视角参数后，复制提示词到其他 Tab 使用。</p>`
  }
};

// ============================================================
// 导出
// ============================================================
window.PRESET_PROMPTS = PRESET_PROMPTS;
window.TAB_INFO = TAB_INFO;

// ============================================================
// 7. 光影工坊预设
// ============================================================
const LIGHTING_PRESETS = {
  rembrandt: {
    name: '伦勃朗光',
    icon: '🖼️',
    desc: '经典三角光，油画般质感',
    prompt: 'Rembrandt lighting, classic triangle light on cheek, dramatic chiaroscuro, oil painting texture, warm amber tones, shallow depth of field, fine art photography, baroque aesthetic, rich shadows and highlights'
  },
  butterfly: {
    name: '蝴蝶光',
    icon: '🦋',
    desc: '正面顶光，突出五官立体感',
    prompt: 'Butterfly lighting (paramount lighting), top-down front light creating butterfly shadow under nose, even illumination on cheekbones, glamorous Hollywood golden age style, high key lighting, porcelain skin, elegant beauty photography'
  },
  split: {
    name: '分割光',
    icon: '🌗',
    desc: '一半亮一半暗，戏剧张力',
    prompt: 'Split lighting, dramatic half-face illumination, one side fully lit, other side in deep shadow, chiaroscuro effect, film noir aesthetic, high contrast, mysterious mood, cinematic tension, Edward Hopper style atmosphere'
  },
  backlight: {
    name: '背光/轮廓光',
    icon: '✨',
    desc: '主体背光，发丝发光轮廓',
    prompt: 'Backlighting with strong rim light, hair glowing with light outline, subject in silhouette or semi-silhouette, golden hour atmosphere, lens flare, ethereal glow around hair and shoulders, dreamy bokeh background, natural light photography'
  },
  bottom: {
    name: '底光',
    icon: '🔦',
    desc: '从下往上打光，诡异/前卫感',
    prompt: 'Under lighting from below, dramatic uplight creating horror/thriller atmosphere, unusual shadows on face, avant-garde fashion photography, editorial magazine style, eerie yet artistic, high fashion editorial, boundary-pushing aesthetics'
  },
  top: {
    name: '顶光',
    icon: '💡',
    desc: '从正上方打光，静谧/神性感',
    prompt: 'Top down overhead lighting, zen-like serene atmosphere, divine ethereal quality, deep eye shadows, angelic mood, minimalist fashion, clean composition, museum-like setting, spiritual tranquility, high art editorial photography'
  },
  golden: {
    name: '黄金时刻',
    icon: '🌅',
    desc: '日落前1小时，暖色自然光',
    prompt: 'Golden hour lighting, warm amber tones, soft natural sunlight 1 hour before sunset, long shadows, sun-kissed skin glow, dreamy warm color grading, outdoor natural portrait, romantic atmosphere, cinematic color palette'
  },
  blue: {
    name: '蓝调时刻',
    icon: '🌊',
    desc: '日落后30分钟，冷蓝调',
    prompt: 'Blue hour lighting, cool blue tones, twilight atmosphere 30 minutes after sunset, urban cinematic mood, neon reflections on wet surfaces, melancholic beauty, cold color temperature, moody urban night photography, Blade Runner inspired'
  },
  cyberpunk: {
    name: '赛博朋克',
    icon: '🌆',
    desc: '霓虹色彩，高饱和未来感',
    prompt: 'Cyberpunk lighting, neon pink and cyan color scheme, high saturation, rain-slicked streets reflecting neon signs, holographic light effects, futuristic dystopian city, edgy fashion, dramatic color contrast, sci-fi editorial photography'
  },
  natural: {
    name: '自然光',
    icon: '☀️',
    desc: '柔和对光，真实自然',
    prompt: 'Natural soft window light, diffused daylight, gentle shadows, true-to-life colors, clean minimal aesthetic, lifestyle photography, organic feel, no harsh contrasts, fresh and authentic, daylight balanced'
  },
  studio: {
    name: '棚拍标准',
    icon: '📷',
    desc: '专业三灯布光，电商标准',
    prompt: 'Professional studio three-point lighting setup, key light at 45 degrees, fill light softening shadows, rim light separating subject from background, commercial e-commerce standard, even illumination, clean product photography, neutral color balance'
  },
  film: {
    name: '胶片质感',
    icon: '🎞️',
    desc: '复古胶片，颗粒感',
    prompt: 'Film photography lighting, vintage film grain texture, analog color science, Kodak Portra 400 color palette, soft natural light with slight warmth, nostalgic mood, slight light leaks, organic imperfections, medium format aesthetic, retro editorial'
  }
};

// ============================================================
// 8. 宫格生成预设
// ============================================================
const GRID_PRESETS = {
  nine: {
    name: '多机位九宫格',
    icon: '🎯',
    desc: '9种不同机位角度，全面展示',
    angles: [
      { label: '正面/中景', prompt: 'front view, medium shot, eye-level angle, direct gaze, centered composition' },
      { label: '左侧45°', prompt: 'left 45-degree angle view, three-quarter profile, medium shot, dynamic pose' },
      { label: '右侧45°', prompt: 'right 45-degree angle view, three-quarter profile, medium shot, confident stance' },
      { label: '俯拍', prompt: 'high angle shot looking down, overhead perspective, bird\'s eye view, dramatic composition' },
      { label: '仰拍', prompt: 'low angle shot looking up, heroic perspective, imposing presence, dramatic framing' },
      { label: '特写', prompt: 'extreme close-up shot, face and shoulders only, intimate framing, shallow depth of field' },
      { label: '全身/远景', prompt: 'full body wide shot, environmental portrait, showing entire outfit and setting' },
      { label: '过肩/背面', prompt: 'over-the-shoulder shot from behind, showing back of subject, mysterious mood' },
      { label: '侧面/轮廓', prompt: 'pure side profile view, silhouette emphasizing outline, architectural composition' }
    ]
  },
  story4: {
    name: '剧情四宫格',
    icon: '📖',
    desc: '起承转合，故事化展示',
    stages: [
      { label: '起-开场', prompt: 'opening scene, character introduction, establishing shot, calm atmosphere, neutral colors' },
      { label: '承-发展', prompt: 'developing scene, character in motion, walking forward, slight tension, dynamic energy' },
      { label: '转-高潮', prompt: 'climax moment, dramatic pose, intense expression, peak action, high contrast lighting' },
      { label: '合-结局', prompt: 'resolution scene, serene expression, relaxed posture, warm golden light, satisfying conclusion' }
    ]
  },
  storyboard25: {
    name: '25宫格分镜',
    icon: '🎬',
    desc: '25帧连贯动作分解',
    steps: 25
  }
};

// ============================================================
// 9. 多角度生成预设
// ============================================================
const MULTIANGLE_PRESETS = {
  triview: {
    name: '角色三视图',
    icon: '📐',
    desc: '正面 + 侧面 + 背面',
    angles: [
      { label: '正面', prompt: 'front view, facing camera directly, standing straight, full body visible, symmetrical composition' },
      { label: '左侧面', prompt: 'left side view, profile facing left, standing straight, full body visible from side' },
      { label: '背面', prompt: 'back view, facing away from camera, standing straight, full back visible' }
    ]
  },
  surround8: {
    name: '8方向环绕',
    icon: '🔄',
    desc: '水平360度旋转展示',
    angles: [
      { label: '正面 0°', prompt: 'front view, facing camera, 0 degrees' },
      { label: '右前 45°', prompt: 'front-right 45 degree angle view' },
      { label: '右侧面 90°', prompt: 'right side profile view, 90 degrees' },
      { label: '右后 135°', prompt: 'back-right 135 degree angle view' },
      { label: '背面 180°', prompt: 'back view, facing away, 180 degrees' },
      { label: '左后 225°', prompt: 'back-left 225 degree angle view' },
      { label: '左侧面 270°', prompt: 'left side profile view, 270 degrees' },
      { label: '左前 315°', prompt: 'front-left 315 degree angle view' }
    ]
  },
  multi15: {
    name: '15角度全视角',
    icon: '🌐',
    desc: '8水平 + 4垂直 + 3景别',
    angles: [
      { label: '正面', prompt: 'front view, eye level' },
      { label: '右前45°', prompt: 'front-right 45 degree view' },
      { label: '右侧', prompt: 'right side view' },
      { label: '右后45°', prompt: 'back-right 45 degree view' },
      { label: '背面', prompt: 'back view' },
      { label: '左后45°', prompt: 'back-left 45 degree view' },
      { label: '左侧', prompt: 'left side view' },
      { label: '左前45°', prompt: 'front-left 45 degree view' },
      { label: '俯拍30°', prompt: 'high angle, looking down 30 degrees' },
      { label: '俯拍60°', prompt: 'high angle, looking down 60 degrees' },
      { label: '仰拍30°', prompt: 'low angle, looking up 30 degrees' },
      { label: '仰拍60°', prompt: 'low angle, looking up 60 degrees' },
      { label: '面部特写', prompt: 'extreme close-up, face only' },
      { label: '半身中景', prompt: 'medium shot, waist up' },
      { label: '全身远景', prompt: 'full body wide shot' }
    ]
  }
};

window.LIGHTING_PRESETS = LIGHTING_PRESETS;
window.GRID_PRESETS = GRID_PRESETS;
window.MULTIANGLE_PRESETS = MULTIANGLE_PRESETS;
