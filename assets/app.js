import { parseDoc, retrieve } from "./rag.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const ROLES = {
  "刘子正": {
    title: "队长 · 总体/价格/智能体",
    focus:
      "刘子正是队长，人工智能专业，负责项目总体、价格与占位分析、预测、智能体、系统集成和答辩主陈述。回答他时，优先给四条主线的优先级、指标口径、模型/仿真、集成与答辩步骤；提醒他每周 12—15 小时、不要全包。",
    questions: [
      "这周四条线先做哪条？",
      "价格偏差和全成本怎么算？",
      "占位费怎么仿真？",
      "答辩怎么讲创新点？"
    ],
    hello: "队长好。我会先给结论，再给依据和下一步；项目资料优先，项目外的问题也会直接答。"
  },
  "李树钧": {
    title: "空间数据 · 地图/前端",
    focus:
      "李树钧是空间信息与数字技术专业，负责空间数据、GIS/POI/坐标、地图可视化、前端页面和反馈系统。回答他时，优先给字段、坐标系、图层、交互和与队长的接口。",
    questions: [
      "价格地图要哪些图层？",
      "站点账单页怎么排？",
      "反馈入口怎么防刷？",
      "POI 坐标怎么统一？"
    ],
    hello: "树钧好。空间数据和页面这块，我会尽量给到字段、坐标系和具体步骤。"
  },
  "彭加欣": {
    title: "数据工程 · 价格审计",
    focus:
      "彭加欣负责数据获取、清洗、数据字典、价格审计和反馈数据，Python 基础还在补。回答他时，优先给 pandas 代码、字段清单、清洗规则、价格审计表和记录模板，步骤要小、能直接照做。",
    questions: [
      "20 站价格审计怎么做？",
      "电网归属字段怎么填？",
      "数据字典要哪些字段？",
      "平台价和实付价怎么对比？"
    ],
    hello: "加欣好。数据这块我会给具体步骤和代码，遇到不会的直接说“看不懂哪一行”。"
  },
  "韩昊峰": {
    title: "实地 · PPT/答辩",
    focus:
      "韩昊峰负责实地踩点、访谈、PPT、演示脚本、模拟答辩和反馈运营。回答他时，优先给踩点分工、记录表、页面结构、3 分钟演示脚本、评委问题和答法。",
    questions: [
      "实地踩点怎么分工？",
      "PPT 第一页怎么讲？",
      "评委问“和高德区别”怎么答？",
      "3 分钟演示脚本？"
    ],
    hello: "昊峰好。实地、PPT 和答辩的问题，我会给结构、话术和演练方法。"
  },
  "周思琪": {
    title: "报告 · 政策/质量",
    focus:
      "周思琪是大数据管理与应用专业，负责报告主笔、格式、引用、电网电价政策库和质量把控。回答她时，优先给报告结构、写法、格式规范、政策引用方式，以及“怎么帮数据组”的具体任务。",
    questions: [
      "报告新增哪几章？",
      "电网电价政策怎么引用？",
      "价格透明度怎么写？",
      "分工表怎么落到报告？"
    ],
    hello: "思琪好。报告、政策和格式的问题，我会给结构、模板和检查清单。"
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
  $("#chat-sub").textContent = info.title + " · 项目资料优先，也能答通用问题";
  $("#input").placeholder = `问一个${name}的问题，或任何技术/学习问题…`;
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
  for (const m of list) addMessage(m.role, m.content, m.sources || [], false, m.usage || null);
  scrollBottom();
}

function renderWelcome() {
  const box = $("#messages");
  const info = ROLES[state.role];
  const chips = info.questions.concat([
    "这个项目和高德有什么区别？",
    "Python 怎么读 CSV？",
    "Git 提交失败怎么办？"
  ]);
  const wrap = document.createElement("div");
  wrap.className = "welcome";
  wrap.innerHTML = `
    <h2>${state.role}，今天想解决什么？</h2>
    <p>${info.hello}</p>
    <p>项目资料优先；项目外的问题也可以问，我会说明“这是通用建议，不是项目资料”。</p>
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

function addMessage(role, content, sources = [], animate = true, usage = null) {
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
    if (usage && usage.prompt_tokens != null) {
      const u = document.createElement("span");
      u.textContent = `tokens 输入 ${usage.prompt_tokens} / 输出 ${usage.completion_tokens ?? "?"}`;
      meta.appendChild(u);
    }
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

function buildSystemPrompt(sources, projectMode) {
  const info = ROLES[state.role];
  const ctx = sources
    .map((s, i) => `【资料${i + 1}】${s.file} · ${s.heading}\n${truncate(s.text, 1600)}`)
    .join("\n\n");
  const modeText = projectMode
    ? "本轮是项目问题：优先用【项目资料】回答；关键结论标 [资料n]；资料没有就说“项目资料里没有”，再给通用建议。"
    : "本轮是通用问题：正常回答，不要硬套项目资料；下面资料相关才引用，不相关就忽略。";
  return `你是“桩尽其用”项目组的 AI 助手，也是五名队员的通用技术助手。你既懂这个项目，也能回答编程、Git、Streamlit、Office、学习方法等通用问题。

【本轮模式】
${modeText}

【回答规则】
1. 项目问题：优先用【项目资料】；关键结论后用 [资料n] 标注来源，来源必须是下面列出的编号，不能伪造。资料没有就直说，再给可执行的下一步。
2. 通用问题：正常回答，不要求项目资料；如果用了通用知识，说明“以下是通用建议，不是项目资料”。不要因为问题与项目无关就拒绝。
3. 不编项目数字、日期、分工、指标；不确定就写“不确定”。项目资料与通用知识冲突时，项目问题以资料为准。
4. 先给结论，再给步骤或理由；给代码、命令、模板、字段；不要空话。
5. 用中文，面向大一学生，术语要解释；代码和变量名保持英文。
6. 可以回答项目外的问题，但涉及违法、危险、隐私、冒充他人时要拒绝或提醒风险。

【当前提问者】
${state.role}（${info.title}）
${info.focus}

【项目资料】
${ctx || "（本轮没有检索到项目资料）"}`;
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
  return data;
}

const PROJECT_HINTS =
  /项目|充电|电站|电网|电价|电费|服务费|停车费|占位|排队|价格|审计|反馈|站点|城市|赛|答辩|报告|分工|数据|指标|可视化|智能体|用户|运营商|政府|长沙|深圳|北京|上海|重庆|郴州|UrbanEV|特来电|星星|小桔|高德|百度|2026|2027/i;
const PROJECT_STRONG =
  /项目|充电|电桩|电站|电网|电价|电费|服务费|停车费|占位|排队|价格|审计|反馈|赛|答辩|分工|报告|站点|城市|运营商|政府|长沙|深圳|北京|上海|重庆|郴州|UrbanEV|特来电|星星|小桔|高德|百度/i;
const TECH_HINTS =
  /python|pandas|streamlit|plotly|git|github|vscode|vs code|代码|报错|函数|库|路径|图标|emoji|material|svg|docx|excel|word/i;

function isProjectQuestion(text) {
  const q = String(text || "");
  if (TECH_HINTS.test(q) && !PROJECT_STRONG.test(q)) return false;
  return PROJECT_HINTS.test(q);
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
    const projectMode = isProjectQuestion(q);
    const retrieved = retrieve(state.chunks, q, state.role, Number(state.config.TOP_K) || 6);
    const sources = [];
    if (projectMode && state.fact) {
      sources.push({ file: "00-项目事实卡.md", heading: "项目事实卡", text: state.fact });
    }
    for (const c of retrieved) {
      if (!projectMode && Number(c.score) < 6) continue;
      if (sources.some((s) => s.file === c.file && s.heading === c.heading)) continue;
      sources.push({ file: c.file, heading: c.heading, text: c.text, score: c.score });
    }
    if (!projectMode && sources.length > 4) sources.length = 4;

    const system = buildSystemPrompt(sources, projectMode);
    const messages = [
      { role: "system", content: system },
      ...history.slice(-12).map((m) => ({ role: m.role, content: m.content }))
    ];

    const data = await callAPI(messages);
    const answer = data.content;
    const usage = data.usage || null;
    removeTyping();
    history.push({ role: "assistant", content: answer, sources, usage });
    saveHistory();
    addMessage("assistant", answer, sources, true, usage);
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
  const demoQ = "这周四条线先做哪条？";
  const demoA =
    "先做“能拿证据”的两条，不要先卷模型：\n\n" +
    "1. **价格审计 + 电网政策**：彭加欣建价格审计表，周思琪收国网/南网/地方电网的代理购电与峰谷公告；先做 20 个站。\n" +
    "2. **20 站实地踩点**：韩昊峰排路线，拍价格牌、现场小程序价、实付账单，记录占位/坏桩。\n" +
    "3. **三页骨架**：李树钧把“价格地图 / 站点账单 / 治理沙盘”空壳跑起来，先用小样本。\n" +
    "4. **占位机制一页纸**：刘子正把“预约 + 10 分钟插枪 + 宽限 + 阶梯占用费 + 申诉”写成可讨论的方案。\n\n" +
    "依据：P0 的目标是“数据 + 证据 + 原型”，不是完整系统。[资料1]";
  const sources = state.chunks
    .filter((c) => c.file === "07-分工与阶段计划.md" && ["P0 四周任务", "每周节奏"].includes(c.heading))
    .slice(0, 2);
  if (!sources.length && state.chunks.length) sources.push(state.chunks[0]);
  state.history[state.role] = [
    { role: "user", content: demoQ },
    {
      role: "assistant",
      content: demoA,
      sources,
      usage: { prompt_tokens: 3860, completion_tokens: 420 }
    }
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
