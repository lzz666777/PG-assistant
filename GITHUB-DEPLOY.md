# 把项目助教放到 GitHub Pages：详细教程

> 目标：得到一个长期网址 `https://<你的用户名>.github.io/<仓库名>/`，五个人都能打开。
>
> 全程不需要买服务器；只需要 GitHub 账号、Cloudflare 账号、DeepSeek API Key。
>
> 时间：第一次约 30—40 分钟。

---

## 0. 先准备

| 东西 | 用途 | 地址 |
|---|---|---|
| GitHub 账号 | 放网页 | https://github.com/ |
| Cloudflare 账号 | 跑 Worker 代理 | https://dash.cloudflare.com/sign-up |
| DeepSeek API Key | 模型调用 | https://platform.deepseek.com/ |
| Node.js LTS | 部署 Worker | https://nodejs.org/ |

> 仓库必须是**公开（Public）**，免费版 GitHub Pages 才可用。知识库会公开，但里面没有密钥。

---

## 1. 新建 GitHub 仓库

1. 登录 GitHub，右上角 **+** → **New repository**。
2. 填写：
   - **Repository name**：`charging-project-tutor`（可换，记住它）。
   - **Description**：项目助教（可选）。
   - **Public** 选中。
   - **不要**勾选 “Add a README file”（我们有自己的 README）。
3. 点 **Create repository**。

创建后页面会显示仓库地址，例如：

```
https://github.com/你的用户名/charging-project-tutor
```

---

## 2. 上传网页文件

### 方法 A：网页上传（最简单，推荐）

1. 打开仓库首页，点 **Add file** → **Upload files**。
2. 打开电脑上的 `D:\学校文件\数据要素大赛\project-site` 文件夹。
3. **全选里面的内容**（不是选中 `project-site` 文件夹本身），拖到 GitHub 的上传区域。
   - 要包含：`index.html`、`assets`、`knowledge`、`worker`、`README.md`、`.github`、`.nojekyll`、`.gitignore`。
   - 如果拖拽不进去，点 **choose your files** 手动多选。
4. 下方 **Commit changes** 填 `init: project tutor`，点 **Commit changes**。

> 如果 `.github` 文件夹没上传成功（有些浏览器会忽略隐藏文件夹），看第 2.1 步手动补。

### 2.1 手动补 GitHub Actions 工作流

1. 仓库首页 → **Add file** → **Create new file**。
2. 文件名输入：`.github/workflows/pages.yml`（输入 `/` 会自动建文件夹）。
3. 把本地 `project-site/.github/workflows/pages.yml` 的内容整个粘贴进去。
4. **Commit changes**。

### 方法 B：GitHub Desktop（文件多时更稳）

1. 安装 GitHub Desktop：https://desktop.github.com/
2. 登录 GitHub。
3. **File → Add local repository**，选择 `D:\学校文件\数据要素大赛\project-site`。
4. 如果提示 “not a git repository”，点 **create a repository**，名字填 `charging-project-tutor`，**不要**勾选 “Initialize with README”。
5. 左下角填 commit message，点 **Commit to main**。
6. 点 **Publish repository**，**取消勾选 “Keep this code private”**，发布。

### 方法 C：命令行（已装 git）

```bash
cd "D:\学校文件\数据要素大赛\project-site"
git init
git add .
git commit -m "init: project tutor"
git branch -M main
git remote add origin https://github.com/你的用户名/charging-project-tutor.git
git push -u origin main
```

---

## 3. 开启 GitHub Pages

1. 进入仓库 → **Settings**（顶部菜单）。
2. 左侧 **Pages**。
3. **Build and deployment → Source** 选 **GitHub Actions**。
4. 不需要选主题，不需要点 Save（选了 Source 就生效）。

### 3.1 看部署是否成功

1. 仓库顶部 **Actions** 标签。
2. 应该看到一条 `Deploy to GitHub Pages` 在跑。
3. 黄色圆点＝进行中；绿色勾＝成功；红色叉＝失败。
4. 点进去看日志；成功后会显示网址。

### 3.2 你的网址

```
https://你的用户名.github.io/charging-project-tutor/
```

如果仓库名是 `你的用户名.github.io`，网址是：

```
https://你的用户名.github.io/
```

打开应该能看到“项目助教”页面。此时右上角会显示“未配置 API”，正常，继续下一步。

---

## 4. 部署 Cloudflare Worker（隐藏 API Key）

> 为什么需要它：GitHub Pages 是静态网页，把 Key 写进去会公开泄露。Worker 帮你保管 Key，网页只调用 Worker。

### 4.1 装 Node.js

1. 打开 https://nodejs.org/ ，下载 **LTS**，一路下一步安装。
2. 打开 PowerShell，检查：

```bash
node -v
npm -v
```

能显示版本号即可。

### 4.2 安装并登录 wrangler

```bash
npm install -g wrangler
wrangler login
```

浏览器会弹出 Cloudflare 授权页，点 **Allow**。

> 如果 `wrangler` 不是内部命令，关掉 PowerShell 重开；或把 npm 全局目录加到 PATH。

### 4.3 改配置

用记事本打开：

```
D:\学校文件\数据要素大赛\project-site\worker\wrangler.toml
```

把 `YOURNAME` 改成你的 GitHub 用户名：

```toml
ALLOWED_ORIGINS = "https://你的用户名.github.io,http://localhost:8000"
```

> 只写域名，不要带 `/charging-project-tutor/`，不要带末尾斜杠。

### 4.4 部署

```bash
cd "D:\学校文件\数据要素大赛\project-site\worker"
wrangler deploy
```

成功后会输出一个地址，例如：

```
https://charging-project-tutor.你的子域.workers.dev
```

把它记下来。

### 4.5 写入 DeepSeek Key

```bash
wrangler secret put DEEPSEEK_API_KEY
```

粘贴 Key（以 `sk-` 开头），回车。提示 `Success` 即可。

> Key 只存在 Cloudflare 的加密 Secret 里，不会进 GitHub，也不会出现在网页源码。

### 4.6 测试 Worker

浏览器打开：

```
https://你的-worker-地址/health
```

看到类似：

```json
{"ok":true,"model":"deepseek-chat"}
```

说明 Worker 正常。

---

## 4B. 不装 Node 的替代方案：Cloudflare 网页版

如果不想装 Node.js / wrangler，可以直接在 Cloudflare 网页上建 Worker：

1. 登录 https://dash.cloudflare.com/ 。
2. 左侧 **Workers & Pages** → **Create** → **Worker** → **Deploy**。
3. 名字填 `charging-project-tutor`，点 **Deploy**。
4. 点 **Edit code**，把本地 `worker/src/index.js` 的全部内容粘贴进去，覆盖默认代码。
5. 点右上角 **Deploy**。
6. 进入这个 Worker 的 **Settings → Variables and Secrets**，添加：
   - `DEEPSEEK_API_KEY`：类型选 **Secret**，值填你的 Key；
   - `ALLOWED_ORIGINS`：类型选 **Text**，值填 `https://你的用户名.github.io`；
   - `MODEL`：类型选 **Text**，值填 `deepseek-chat`（可选）。
7. 点 **Save and deploy**。
8. Worker 首页会显示访问地址，例如 `https://charging-project-tutor.你的子域.workers.dev`。

> 网页版和 wrangler 部署出来的效果一样；区别是以后改代码要在网页编辑器里改。

---

## 5. 把网页连到 Worker

1. 回到 GitHub 仓库，打开 `assets/config.js`。
2. 点右上角铅笔图标编辑。
3. 把 `API_BASE` 改成你的 Worker 地址：

```js
window.PROJECT_CONFIG = {
  API_BASE: "https://charging-project-tutor.你的子域.workers.dev",
  ACCESS_CODE: "",
  MODEL_LABEL: "DeepSeek",
  TOP_K: 6
};
```

4. **Commit changes**。
5. 等 1—2 分钟，Actions 重新部署完成，刷新网页。
6. 右上角变成绿色“在线”，就可以提问了。

---

## 6. 测试清单

- [ ] 网页能打开，左侧 5 个角色能切换。
- [ ] 右上角显示“在线”。
- [ ] 问一个角色问题，能返回回答。
- [ ] 回答下方有“资料n”，点开能看到原文。
- [ ] 手机打开也正常。
- [ ] 断网/Worker 停掉时，页面提示“连接失败”，不会白屏。

---

## 7. 常见问题

### 7.1 Pages 404

- 确认 `index.html` 在仓库**根目录**，不是 `project-site/index.html`。
- 确认 **Settings → Pages → Source** 是 **GitHub Actions**。
- 看 **Actions** 里最新一次是否绿色。
- 刚开启 Pages 时等 1—3 分钟。

### 7.2 Actions 失败

点进失败的 workflow，看红色步骤：
- `Configure Pages` 失败：Settings → Pages 里 Source 没选对。
- `Deploy` 失败：多半是权限；确认 workflow 文件里 `permissions` 有 `pages: write` 和 `id-token: write`。

### 7.3 网页显示“未配置 API”

`assets/config.js` 的 `API_BASE` 没填，或没重新部署。也可以在网页“设置”里临时填。

### 7.4 显示“连接失败”

- Worker 地址是否正确（不要带末尾 `/`）。
- `wrangler.toml` 的 `ALLOWED_ORIGINS` 是否包含 `https://你的用户名.github.io`。
- Worker 是否真的部署成功：打开 `/health` 测试。
- 改完 `wrangler.toml` 后有没有重新 `wrangler deploy`。

### 7.5 回答 401/403

- 设置了 `ACCESS_CODE`，但网页“设置”里没填或填错。
- `ALLOWED_ORIGINS` 不包含当前网址。

### 7.6 回答 429

- 触发了每日限额（如果绑定了 KV）。
- 或 DeepSeek 账户余额不足/频率限制。

### 7.7 手机能打开但侧栏出不来

点左上角 `☰`。如果还是不行，清缓存再试。

---

## 8. 费用与额度（重点）

- 五个人共用**同一个 Key**，所有请求都记在 Key 主人的 DeepSeek 账户。
- 在 https://platform.deepseek.com/ 的“用量/账单”里看每天花了多少。
- 模型默认 `deepseek-chat`，便宜；5 个人日常问答，一般每月几块到十几块。
- 想限额：给 Worker 绑定 KV 后，在 `wrangler.toml` 加：

```toml
RATE_LIMIT_PER_DAY = "300"
```

并在 Worker 里绑定 `RATE_LIMIT` KV（见 `wrangler.toml` 注释）。

- Key 泄露：立刻去 DeepSeek 控制台删除并重建，再 `wrangler secret put` 更新。

---

## 9. 以后怎么更新

### 改知识库
- 直接编辑 `knowledge/*.md`，Commit；
- 新增文件时，同步改 `knowledge/index.json` 的文件列表；
- Pages 会自动重新部署。

### 改页面
- 改 `index.html`、`assets/style.css`、`assets/app.js`，Commit；
- 等 Actions 绿色。

### 改 Worker
```bash
cd "D:\学校文件\数据要素大赛\project-site\worker"
wrangler deploy
```

---

## 10. 最短路径总结

1. GitHub 建公开仓库 → 上传 `project-site` 里的内容。
2. Settings → Pages → Source 选 GitHub Actions。
3. `npm i -g wrangler` → `wrangler login` → 改 `ALLOWED_ORIGINS` → `wrangler deploy` → `wrangler secret put DEEPSEEK_API_KEY`。
4. 把 Worker 地址填进 `assets/config.js` 的 `API_BASE`。
5. 打开 `https://你的用户名.github.io/charging-project-tutor/`，看到“在线”就成了。
