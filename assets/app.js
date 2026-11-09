import { parseDoc, retrieve } from "./rag.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const ROLES = {
  "刘子正": {
    title: "队长 · 分析/预测/智能体",
    focus:
      "刘子正是队长，人工智能专业，负责分析、预测、智能体、系统集成和答辩主陈述。回答他时，优先给模型选择、特征、回测、智能体工具、集成与答辩的具体步骤；提醒他每周 12—15 小时、不要全包。",
    questions: [
      "这周我该先做什么？",
      "LightGBM 基线怎么定？",
      "智能体先做哪 3 个工具？",
      "答辩怎么讲创新点？"
    ],
    hello: "队长好。我会先给结论，再给依据和下一步；资料里没有的我会直说。"
  },
  "李树钧": {
    title: "空间数据 · 地图可视化",
    focus:
      "李树钧是空间信息与数字技术专业，负责空间数据、GIS/POI/坐标、地图可视化、数据管道与页面。回答他时，优先给字段、坐标系、空间分析、地图交互和与队长接口的具体做法。",
    questions: [
      "空间底表要哪些字段？",
      "地图视图怎么做？",
      "POI 坐标系怎么统一？",
      "怎么和队长对接口？"
    ],
    hello: "树钧好。空间数据这块，我会尽量给到字段、坐标系和具体步骤。"
  },
  "彭加欣": {
    title: "数据工程 · 获取与清洗",
    focus:
      "彭加欣负责数据获取、清洗、数据字典和复现包，Python 基础还在补。回答他时，优先给 pandas 代码、字段清单、清洗规则、数据字典模板，步骤要小、能直接照做。",
    questions: [
      "UrbanEV 怎么清洗？",
      "数据字典要写什么？",
      "高德 POI 怎么拉？",
      "2026 四城数据怎么用？"
    ],
    hello: "加欣好。数据这块我会给具体步骤和代码，遇到不会的直接说“看不懂哪一行”。"
  },
  "韩昊峰": {
    title: "产品 · PPT 与答辩",
    focus:
      "韩昊峰负责 PPT、演示脚本、模拟答辩和用户访谈。回答他时，优先给页面结构、叙事线、3 分钟演示脚本、评委可能的问题和答法。",
    questions: [
      "PPT 第一页怎么讲？",
      "3 分钟演示脚本？",
      "评委会问什么？",
      "怎么准备模拟答辩？"
    ],
    hello: "昊峰好。PPT 和答辩的问题，我会给结构、话术和演练方法。"
  },
  "周思琪": {
    title: "报告主笔 · 数据助理",
    focus:
      "周思琪是大数据管理与应用专业，负责报告主笔、格式、引用，空闲时支援彭加欣做清洗、核对、文献。回答她时，优先给报告结构、写法、格式规范、引用方式，以及“怎么帮数据组”的具体任务。",
    questions: [
      "报告第一章写什么？",
      "怎么帮彭加欣做数据核对？",
      "参考文献怎么列？",
      "报告格式有哪些硬要求？"
    ],
    hello: "思琪好。报告和格式的问题，我会给结构、模板和检查清单。"
  }
};

const state = {
  config: { ...(window.PROJECT_CONFIG || {}) },
  docs: [],
  chunks: [],
  fact: "",
  role: "刘子正",
  history: {},
  busy: false
};

const KEY = {
  role: "tutor:role",
  settings: "tutor:settings",
  history: (r) => "tutor:history:" + r
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY.settings) || "{}");
    state.config = { ...state.config, ...saved };
  } catch (_) {}
}

function saveSettings() {
  localStorage.setItem(
    KEY.settings,
    JSON.stringify({
      API_BASE: state.config.API_BASE || "",
      ACCESS_CODE: state.config.ACCESS_CODE || ""
    })
  );
}

function apiBase() {
  return String(state.config.API_BASE || "").trim().replace(/\/+$/, "");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mdToHtml(md) {
  let s = escapeHtml(md || "");
  const blocks = [];
  s = s.replace(/```([\s\S]*?)```/g, (m, code) => {
    blocks.push(`<pre><code>${code.replace(/^\n+|\n+$/g, "")}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  const lines = s.split(/\n/);
  const out = [];
  let list = null;
  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      if (!list) list = [];
      list.push(line.replace(/^\s*[-*]\s+/, ""));
      continue;
    }
    if (list) {
      out.push("<ul>" + list.map((x) => `<li>${x}</li>`).join("") + "</ul>");
      list = null;
    }
    if (/^###\s+/.test(line)) out.push(`<h3>${line.replace(/^###\s+/, "")}</h3>`);
    else if (/^##\s+/.test(line)) out.push(`<h2>${line.replace(/^##\s+/, "")}</h2>`);
    else if (line.trim()) out.push(`<p>${line}</p>`);
  }
  if (list) out.push("<ul>" + list.map((x) => `<li>${x}</li>`).join("") + "</ul>");
  return out.join("").replace(/\u0000(\d+)\u0000/g, (m, i) => blocks[+i]);
}

function truncate(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function loadKnowledge() {
  const res = await fetch("knowledge/index.json", { cache: "no-store" });
  if (!res.ok) throw new Error("资料索引加载失败");
  const idx = await res.json();
  const docs = await Promise.all(
    (idx.files || []).map(async (file) => {
      const r = await fetch("knowledge/" + encodeURIComponent(file), { cache: "no-store" });
      const text = await r.text();
      return { file, text, chunks: parseDoc(file, text) };
    })
  );
  state.docs = docs;
  state.chunks = docs.flatMap((d) => d.chunks);
  const fact = docs.find((d) => d.file.startsWith("00-"));
  state.fact = fact ? fact.text : "";
  $("#doc-count").textContent = String(docs.length);
}

function renderRoles() {
  const box = $("#role-list");
  box.innerHTML = "";
  for (const [name, info] of Object.entries(ROLES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "role";
    btn.dataset.role = name;
    btn.innerHTML = `<strong>${name}</strong><span>${info.title}</span>`;
    btn.addEventListener("click", () => selectRole(name));
    box.appendChild(btn);
  }
}

function renderQuick() {
  const box = $("#quick-list");
  box.innerHTML = "";
  const info = ROLES[state.role];
  for (const q of info.questions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = q;
    btn.addEventListener("click", () => send(q));
    box.appendChild(btn);
  }
}

function renderDocs() {
  const box = $("#doc-list");
  box.innerHTML = "";
  for (const doc of state.docs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "doc";
    btn.textContent = doc.file.replace(/\.md$/, "");
    btn.title = doc.file;
    btn.addEventListener("click", () => openModal(doc.file.replace(/\.md$/, ""), doc.text));
    box.appendChild(btn);
  }
}

function selectRole(name, persist = true) {
  state.role = name;
  if (persist) localStorage.setItem(KEY.role, name);
  const sidebar = $("#sidebar");
  if (sidebar) sidebar.classList.remove("open");
  $$(".role").forEach((b) => b.classList.toggle("active", b.dataset.role === name));
  const info = ROLES[name];
  $("#chat-title").textContent = name + " · 项目助教";
  $("#chat-sub").textContent = info.title + " · 基于项目文档回答";
  $("#input").placeholder = `问一个${name}分工里的具体问题…`;
  renderQuick();
  loadHistory();
  renderHistory();
}

function loadHistory() {
  if (state.history[state.role]) return;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY.history(state.role)) || "[]");
    state.history[state.role] = Array.isArray(saved) ? saved : [];
  } catch (_) {
    state.history[state.role] = [];
  }
}

function saveHistory() {
  const list = state.history[state.role] || [];
  localStorage.setItem(KEY.history(state.role), JSON.stringify(list.slice(-24)));
}

function renderHistory() {
  const box = $("#messages");
  box.innerHTML = "";
  const list = state.history[state.role] || [];
  if (!list.length) {
    renderWelcome();
    return;
  }
  for (const m of list) addMessage(m.role, m.content, m.sources || [], false);
  scrollBottom();
}

function renderWelcome() {
  const box = $("#messages");
  const info = ROLES[state.role];
  const chips = info.questions.concat([
    "这个项目和 2026 赛题有什么区别？",
    "数据从哪来、合法吗？"
  ]);
  const wrap = document.createElement("div");
  wrap.className = "welcome";
  wrap.innerHTML = `
    <h2>${state.role}，今天想解决什么？</h2>
    <p>${info.hello}</p>
    <p>我会先查项目资料，再回答；每个结论尽量标出来源。</p>
    <div class="chips"></div>
  `;
  const chipBox = wrap.querySelector(".chips");
  for (const q of [...new Set(chips)]) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = q;
    b.addEventListener("click", () => send(q));
    chipBox.appendChild(b);
  }
  box.appendChild(wrap);
}

function addMessage(role, content, sources = [], animate = true) {
  const box = $("#messages");
  const welcome = box.querySelector(".welcome");
  if (welcome) welcome.remove();

  const msg = document.createElement("div");
  msg.className = "msg " + role;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "我" : "助";

  const wrap = document.createElement("div");
  wrap.className = "bubble-wrap";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = role === "user" ? `<p>${escapeHtml(content)}</p>` : mdToHtml(content);

  wrap.appendChild(bubble);

  if (role === "assistant" && sources && sources.length) {
    const srcBox = document.createElement("div");
    srcBox.className = "sources";
    sources.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "source";
      b.dataset.idx = String(i);
      b.textContent = `资料${i + 1} · ${s.heading || s.file}`;
      b.title = s.file;
      srcBox.appendChild(b);
    });
    wrap.appendChild(srcBox);
    bubble._sources = sources;
  }

  if (role === "assistant") {
    const meta = document.createElement("div");
    meta.className = "meta";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy";
    copy.textContent = "复制";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(content);
        copy.textContent = "已复制";
        setTimeout(() => (copy.textContent = "复制"), 1200);
      } catch (_) {
        copy.textContent = "复制失败";
      }
    });
    meta.appendChild(copy);
    wrap.appendChild(meta);
  }

  msg.appendChild(avatar);
  msg.appendChild(wrap);
  box.appendChild(msg);

  if (animate) scrollBottom();
  return msg;
}

function scrollBottom() {
  const box = $("#messages");
  box.scrollTop = box.scrollHeight;
}

function showTyping() {
  const box = $("#messages");
  const welcome = box.querySelector(".welcome");
  if (welcome) welcome.remove();
  const msg = document.createElement("div");
  msg.className = "msg assistant";
  msg.id = "typing";
  msg.innerHTML = `
    <div class="avatar">助</div>
    <div class="bubble-wrap"><div class="bubble"><div class="typing"><i></i><i></i><i></i></div></div></div>
  `;
  box.appendChild(msg);
  scrollBottom();
}

function removeTyping() {
  const el = $("#typing");
  if (el) el.remove();
}

function buildSystemPrompt(sources) {
  const info = ROLES[state.role];
  const ctx = sources
    .map((s, i) => `【资料${i + 1}】${s.file} · ${s.heading}\n${truncate(s.text, 1600)}`)
    .join("\n\n");
  return `你是“充电站运营可视分析”项目组的项目助教，服务五名大一队员。你的任务是基于下面的【项目资料】回答他们关于分工、方法、数据、提交和答辩的问题。

【必须遵守】
1. 只根据【项目资料】回答；资料没有的，直接说“项目资料里没有这部分”，再给一个可执行的下一步（问谁／查哪份文件／去哪找），不要编。
2. 关键结论后用 [资料n] 标注来源；来源必须来自下面列出的资料编号，不能伪造。
3. 区分“资料里写的”与“我的建议”；建议要说明依据和风险。
4. 数字、日期、分工、指标必须与资料一致；不确定就写“不确定”。
5. 回答具体、可执行：给步骤、字段、代码片段、模板；不要空话。
6. 不回答与项目无关的问题；可以一句带过。
7. 用中文，面向大一学生，术语要解释。

【当前提问者】
${state.role}（${info.title}）
${info.focus}

【项目资料】
${ctx}`;
}

async function callAPI(messages) {
  const base = apiBase();
  if (!base) {
    const err = new Error("NO_API");
    err.code = "NO_API";
    throw err;
  }
  const res = await fetch(base + "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      accessCode: state.config.ACCESS_CODE || ""
    })
  });
  let data = {};
  try {
    data = await res.json();
  } catch (_) {}
  if (!res.ok) {
    const msg = data.error || `接口返回 ${res.status}`;
    const err = new Error(msg);
    err.code = res.status;
    throw err;
  }
  if (!data.content) throw new Error("接口没有返回内容");
  return data.content;
}

async function send(text) {
  const q = String(text || "").trim();
  if (!q || state.busy) return;

  if (!apiBase()) {
    showBanner(
      "还没有配置 AI 接口。请先按 README 部署 Cloudflare Worker，把地址填到 assets/config.js 的 API_BASE，或在“设置”里填写。"
    );
    return;
  }

  state.busy = true;
  $("#send").disabled = true;

  const history = state.history[state.role] || (state.history[state.role] = []);
  history.push({ role: "user", content: q });
  addMessage("user", q);
  saveHistory();
  $("#input").value = "";
  $("#input").style.height = "auto";
  showTyping();

  try {
    const retrieved = retrieve(state.chunks, q, state.role, Number(state.config.TOP_K) || 6);
    const sources = [];
    if (state.fact) {
      sources.push({ file: "00-项目事实卡.md", heading: "项目事实卡", text: state.fact });
    }
    for (const c of retrieved) {
      if (sources.some((s) => s.file === c.file && s.heading === c.heading)) continue;
      sources.push({ file: c.file, heading: c.heading, text: c.text });
    }

    const system = buildSystemPrompt(sources);
    const messages = [
      { role: "system", content: system },
      ...history.slice(-12).map((m) => ({ role: m.role, content: m.content }))
    ];

    const answer = await callAPI(messages);
    removeTyping();
    history.push({ role: "assistant", content: answer, sources });
    saveHistory();
    addMessage("assistant", answer, sources);
  } catch (e) {
    removeTyping();
    let msg = "";
    if (e.code === "NO_API") {
      msg = "还没有配置 AI 接口，请先部署 Worker 并在设置里填写 API 地址。";
    } else if (e.code === 401 || e.code === 403) {
      msg = "接口拒绝了请求：可能是访问码不对，或 Worker 的 ALLOWED_ORIGINS 没包含当前网址。";
    } else if (e.code === 429) {
      msg = "请求太频繁了，稍等一会儿再试。";
    } else {
      msg = "调用失败：" + (e.message || "未知错误") + "。请检查 Worker 地址、API Key 和网络。";
    }
    history.push({ role: "assistant", content: msg });
    saveHistory();
    addMessage("assistant", msg, []);
  } finally {
    state.busy = false;
    $("#send").disabled = false;
    $("#input").focus();
    scrollBottom();
  }
}

function setStatus(kind, text) {
  const el = $("#status");
  el.className = "status " + kind;
  $("#status-text").textContent = text;
}

function showBanner(text) {
  const el = $("#banner");
  el.innerHTML = escapeHtml(text);
  el.classList.remove("hidden");
}

function hideBanner() {
  $("#banner").classList.add("hidden");
}

async function checkHealth() {
  const base = apiBase();
  if (!base) {
    setStatus("warn", "未配置 API");
    showBanner("未配置 AI 接口：部署 Worker 后，把地址填到 assets/config.js 的 API_BASE，或在“设置”里填写。");
    return;
  }
  setStatus("warn", "连接中");
  try {
    const res = await fetch(base + "/health", { cache: "no-store" });
    if (!res.ok) throw new Error("bad status");
    setStatus("ok", "在线");
    hideBanner();
  } catch (_) {
    setStatus("err", "连接失败");
    showBanner("连不上 Worker。检查 API_BASE 是否正确、Worker 是否已部署、ALLOWED_ORIGINS 是否包含当前网址。");
  }
}

function openModal(title, body) {
  $("#modal-title").textContent = title;
  $("#modal-body").textContent = body;
  $("#modal").classList.remove("hidden");
}

function closeModal() {
  $("#modal").classList.add("hidden");
}

function openSettings() {
  const api = apiBase();
  $("#modal-title").textContent = "设置";
  $("#modal-body").innerHTML = `
    <label>Worker 地址（API_BASE）</label>
    <input id="set-api" placeholder="https://charging-tutor.xxx.workers.dev" value="${escapeHtml(api)}" />
    <label>访问码（可选，和 Worker 的 ACCESS_CODE 一致）</label>
    <input id="set-code" placeholder="不填则不需要" value="${escapeHtml(state.config.ACCESS_CODE || "")}" />
    <p style="color:#6b7280;font-size:12px;margin-top:10px;">API Key 只放在 Worker 的 Secret 里，不要写进网页或 GitHub。</p>
    <div class="row">
      <button class="primary" id="set-save">保存</button>
      <button class="secondary" id="set-test">测试连接</button>
      <button class="danger" id="set-clear">清空全部对话</button>
    </div>
  `;
  $("#modal").classList.remove("hidden");
  $("#set-save").addEventListener("click", () => {
    state.config.API_BASE = $("#set-api").value.trim();
    state.config.ACCESS_CODE = $("#set-code").value.trim();
    saveSettings();
    closeModal();
    checkHealth();
  });
  $("#set-test").addEventListener("click", async () => {
    const base = $("#set-api").value.trim().replace(/\/+$/, "");
    if (!base) return alert("先填 Worker 地址");
    try {
      const r = await fetch(base + "/health", { cache: "no-store" });
      alert(r.ok ? "连接成功" : "连接失败：HTTP " + r.status);
    } catch (_) {
      alert("连接失败：检查地址、部署和 CORS");
    }
  });
  $("#set-clear").addEventListener("click", () => {
    if (!confirm("确定清空所有角色的对话？")) return;
    Object.keys(ROLES).forEach((r) => localStorage.removeItem(KEY.history(r)));
    state.history = {};
    closeModal();
    selectRole(state.role);
  });
}

function bindEvents() {
  $("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    send($("#input").value);
  });
  $("#input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send($("#input").value);
    }
  });
  $("#input").addEventListener("input", () => {
    const el = $("#input");
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  });
  $("#btn-settings").addEventListener("click", openSettings);
  $("#btn-clear").addEventListener("click", () => {
    if (!confirm("清空当前角色的对话？")) return;
    state.history[state.role] = [];
    saveHistory();
    renderHistory();
  });
  $("#btn-menu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal();
  });
  $("#messages").addEventListener("click", (e) => {
    const src = e.target.closest(".source");
    if (!src) return;
    const bubble = src.closest(".bubble-wrap").querySelector(".bubble");
    const sources = bubble._sources || [];
    const s = sources[Number(src.dataset.idx)];
    if (s) openModal(`${s.file} · ${s.heading}`, s.text);
  });
}

function seedDemo() {
  const demoQ = "这周我该先做什么？";
  const demoA =
    "先做三件事，别铺开：\n\n" +
    "1. **建仓库和骨架**：目录固定为 `data/ src/ notebooks/ docs/ assets/`，先把 Streamlit 三页空壳跑起来。\n" +
    "2. **做 3 张分析图**：利用率分布、24 小时曲线、Top20 站点；每张图配一句结论。\n" +
    "3. **和李树钧定接口**：把 `station_hour` 的字段、时间粒度、缺失值规则写成一页 `docs/interface.md`，再开始各做各的。\n\n" +
    "依据：P0 的任务就是“数据＋三张图＋storyline”，不要提前去卷模型。[资料1]";
  const sources = state.chunks
    .filter((c) => c.file === "07-分工与阶段计划.md" && ["P0 具体任务", "每周节奏"].includes(c.heading))
    .slice(0, 2);
  if (!sources.length && state.chunks.length) sources.push(state.chunks[0]);
  state.history[state.role] = [
    { role: "user", content: demoQ },
    { role: "assistant", content: demoA, sources }
  ];
  renderHistory();
  hideBanner();
  setStatus("ok", "演示模式");
}

async function init() {
  loadSettings();
  renderRoles();
  bindEvents();
  try {
    await loadKnowledge();
    renderDocs();
  } catch (e) {
    showBanner("项目资料加载失败：" + e.message);
  }
  const savedRole = localStorage.getItem(KEY.role);
  state.role = savedRole && ROLES[savedRole] ? savedRole : "刘子正";
  selectRole(state.role, false);
  if (new URLSearchParams(location.search).get("demo") === "1") {
    seedDemo();
    return;
  }
  checkHealth();
}

init();
