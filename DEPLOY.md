# Fashion Studio - 部署指南（GitHub Pages + Cloudflare Workers）

## 架构

```
用户浏览器
    ↓ 访问
GitHub Pages (免费托管前端)
    ↓ /api/remove-bg 调用
Cloudflare Workers (免费 API 代理)
    ↓ 
async.koukoutu.com (抠图服务)
    ↓ 返回图片 URL
前端显示抠图结果
```

## 部署步骤（3步，约5分钟）

### 第 1 步：推送代码到 GitHub

```bash
cd fashion-studio
git remote add origin https://github.com/你的用户名/fashion-studio.git
git push -u origin main
```

### 第 2 步：开启 GitHub Pages + Actions

1. 打开仓库 → **Settings** → **Pages**
2. **Source** 选 **GitHub Actions**
3. 选择 **deploy.yml** workflow
4. 点 **Configure** 或自动检测到 `.github/workflows/deploy.yml`
5. **Actions** 标签页会自动开始部署
6. 等待完成（约1-2分钟）
7. **Settings → Pages** 会显示你的站点地址：
   `https://你的用户名.github.io/fashion-studio`

### 第 3 步：部署 Cloudflare Worker（API 代理）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单 → **Workers & Pages**
3. 点 **Create** → **Create Worker**
4. 名字填：`fashion-studio-api`（或自定义）
5. **Editor** 里粘贴 [`cloudflare-worker.js`](./cloudflare-worker.js) 的全部内容
6. 点 **Deploy**
7. 部署成功后得到地址如：`https://fashion-studio-api.xxx.workers.dev`

### 第 4 步：配置前端连接 Worker

打开你的 Fashion Studio 网站设置，或直接在浏览器控制台执行：

```javascript
localStorage.setItem('fs_remove_bg_api', 'https://你的Worker域名.workers.dev/api/remove-bg');
location.reload();
```

然后智能抠图功能就可以用了！

## 费用

| 服务 | 费用 | 额度 |
|------|------|------|
| GitHub Pages | **永久免费** | 无限静态带宽 |
| Cloudflare Workers | **免费** | 10万次请求/天 |
| 抠扣图 API | **免费** | 每日有免费额度 |

总计：**$0**

## 更新代码

每次 `git push` 到 main 分支会自动重新部署。

---

_最后更新: 2026-04-09_
