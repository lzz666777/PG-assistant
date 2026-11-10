# 项目助教 · 充电站运营可视分析

给五个人做的一个内部问答网页：基于项目文档回答分工、方法、数据、提交和答辩问题；每个回答尽量标来源，资料没有就直说。

- 前端：纯静态 HTML/CSS/JS，部署在 GitHub Pages。
- 知识库：`knowledge/*.md`，按 `##` 小节切块，前端做轻量检索。
- AI：Cloudflare Worker 代理 DeepSeek API，API Key 只存在 Worker 的 Secret 里。
- 网址：`https://<你的用户名>.github.io/<仓库名>/`（仓库公开、Pages 开启后长期有效）。

> 重要：GitHub Pages 是静态托管，**不能**把 API Key 写进网页。必须用 Worker 之类的服务端做代理；否则 Key 会公开泄露。
>
> **第一次部署，建议直接看 [GITHUB-DEPLOY.md](GITHUB-DEPLOY.md)**：从建仓库、上传文件、开 Pages，到部署 Worker、填 Key，一步一步带截图式说明。

---

## 一、先准备三样东西

1. GitHub 账号（仓库要公开，Pages 才能免费用）。
2. DeepSeek API Key：https://platform.deepseek.com/ （充一点点钱即可，5 个人用不了多少）。
3. 电脑上装 Node.js（部署 Worker 用）：https://nodejs.org/ ，装 LTS 版。

---

## 二、把网页放到 GitHub Pages

### 1. 建仓库
在 GitHub 新建一个公开仓库，例如 `PG-assistant`。

### 2. 上传文件
把本文件夹里的所有内容上传到仓库根目录（不要多套一层文件夹）。可以用：
- GitHub 网页的 “Add file → Upload files”，把文件夹里的内容拖进去；
- 或 GitHub Desktop；
- 或用 git 命令。

确保根目录能看到 `index.html`、`assets/`、`knowledge/`、`.github/`。

### 3. 开启 Pages
仓库 → **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
仓库里的 `.github/workflows/pages.yml` 会在每次 push 后自动部署。

### 4. 拿到网址
等 Actions 跑完（约 1 分钟），网址是：

```
https://<你的用户名>.github.io/PG-assistant/
```

如果仓库名是 `<你的用户名>.github.io`，网址就是 `https://<你的用户名>.github.io/`。

---

## 三、部署 Worker（隐藏 API Key）

### 1. 安装 wrangler
在电脑上打开终端（PowerShell）：

```bash
npm install -g wrangler
wrangler login
```

浏览器会弹出 GitHub 授权，点同意。

### 2. 改配置
打开 `worker/wrangler.toml`，把 `ALLOWED_ORIGINS` 里的 `YOURNAME` 改成你的 GitHub 用户名：

```toml
ALLOWED_ORIGINS = "https://你的用户名.github.io,http://localhost:8000"
```

### 3. 部署
在 `worker` 目录下执行：

```bash
cd worker
wrangler deploy
```

成功后终端会给你一个地址，例如：

```
https://charging-project-tutor.你的子域.workers.dev
```

### 4. 写入 API Key
```bash
wrangler secret put DEEPSEEK_API_KEY
```
粘贴你的 DeepSeek Key，回车。**不要把 Key 写进任何文件或 GitHub。**

### 5. 可选：访问码
如果想只让五个人用，在 `wrangler.toml` 里加：

```toml
[vars]
ACCESS_CODE = "team2027"
```

重新 `wrangler deploy`，然后在网页“设置”里填同样的访问码。

> 访问码是前端校验，只能挡一下路人，不是强安全措施；真正的安全靠 Worker 的 Key 和限额。

---

## 四、把网页连到 Worker

打开 `assets/config.js`，把 `API_BASE` 改成 Worker 地址：

```js
window.PROJECT_CONFIG = {
  API_BASE: "https://charging-project-tutor.你的子域.workers.dev",
  ACCESS_CODE: "",
  MODEL_LABEL: "DeepSeek",
  TOP_K: 6
};
```

提交后等 Pages 重新部署，打开网页，右上角显示“在线”即成功。

也可以不提交，直接在网页“设置”里填 Worker 地址（存在浏览器 localStorage，只对当前浏览器有效）。

---

## 五、怎么用

- 左侧选“我是谁”，常问问题会变；
- 直接问，例如：
  - 刘子正：“这周我该先做什么？”
  - 李树钧：“空间底表要哪些字段？”
  - 彭加欣：“UrbanEV 怎么清洗？”
  - 韩昊峰：“3 分钟演示脚本？”
  - 周思琪：“报告第一章写什么？”
- 回答下方的“资料n”可以点开看原文；
- 每条回答下方会显示本次输入/输出 tokens，方便估费用；
- “设置”里可以改 Worker 地址、访问码、清空对话。
- 没有 API 时，打开 `?demo=1` 可以看界面预览（不会真的调用模型），例如：`https://你的用户名.github.io/PG-assistant/?demo=1`。

---

## 六、为什么答案相对可靠

1. **知识库**：`knowledge/` 里是项目的事实卡、7 个分析问题、数据方案、分工计划、FAQ、交付要求。
2. **检索**：每次提问先按关键词从知识库找最相关的 6 段，连同“项目事实卡”一起给模型。
3. **系统提示**：明确要求“只根据资料回答；资料没有就说没有；关键结论标 [资料n]；不确定就写不确定；给步骤不给空话”。
4. **低温度**：`temperature: 0.2`，减少发挥。
5. **可核对**：回答下方保留来源，点开能看原文；重要结论请回到 Word 文档核对。

它仍然可能出错：**数字、日期、分工、竞赛规则以原始文件为准**。

---

## 七、改知识库

直接编辑 `knowledge/*.md`，然后更新 `knowledge/index.json` 的文件列表。
建议：
- 一个 `##` 小节只讲一件事，方便检索；
- 事实卡（`00-项目事实卡.md`）保持简短、只放最关键的结论；
- 新决策写进事实卡，避免和旧文档冲突。

`prompts/system.md` 是系统提示的备份，改完记得同步 `assets/app.js` 里的 `buildSystemPrompt`。

---

## 八、常见问题

**Q：网页显示“未配置 API”？**
A：`assets/config.js` 的 `API_BASE` 没填，或没重新部署 Pages；也可以直接在“设置”里填。

**Q：显示“连接失败”？**
A：检查 Worker 是否部署、地址是否正确、`ALLOWED_ORIGINS` 是否包含 `https://你的用户名.github.io`。

**Q：回答 401/403？**
A：访问码不对，或 Worker 的 `ALLOWED_ORIGINS` 没包含当前网址。

**Q：回答 429？**
A：触发了每日限额（如果绑定了 KV），或 DeepSeek 余额/频率限制。

**Q：DeepSeek 收费吗？**
A：按 token 收费，很便宜；5 个人日常问答一个月通常几块钱到十几块钱。五个人共用同一个 Key，费用都记在 Key 主人的 DeepSeek 账户；可在 https://platform.deepseek.com/ 的“用量/账单”查看，并可用 Worker 的 `RATE_LIMIT_PER_DAY` 限额。

**Q：一定要用 Cloudflare 吗？**
A：不一定。你也可以把 `worker/src/index.js` 的逻辑搬到 Vercel/Netlify 的 Serverless Function；或者用 Coze/Dify 建一个知识库机器人，把分享链接嵌进 Pages。核心是：**Key 不能放前端**。

**Q：能只用 GitHub Pages 吗？**
A：不能直接调大模型（Key 会暴露）。可以做一个“离线知识库搜索”，但没有 AI 问答。

---

## 九、目录说明

```
index.html                 页面
assets/style.css           样式
assets/app.js              对话、检索、渲染
assets/rag.js              轻量检索
assets/config.js           Worker 地址等配置
knowledge/*.md             项目知识库
knowledge/index.json       知识库文件列表
worker/src/index.js        Cloudflare Worker 代理
worker/wrangler.toml       Worker 配置
.github/workflows/pages.yml  GitHub Pages 自动部署
prompts/system.md          系统提示备份
```

---

## 十、安全提醒

- API Key 只放 Worker Secret，永远不要写进 `config.js`、README 或聊天记录。
- 仓库公开没关系，但不要把 `.dev.vars`、`.env`、密钥文件传上去。
- 如果 Key 泄露，立刻去 DeepSeek 控制台删除并重新生成。
- 访问码只是门槛，不是保险；要更强控制就给 Worker 加登录（Cloudflare Access）或限额。
