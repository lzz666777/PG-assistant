// 轻量检索：按 Markdown 的 ## 小节切块，用中文 bigram + 英文词做关键词打分
export function parseDoc(file, text) {
  const lines = text.split(/\r?\n/);
  const chunks = [];
  let heading = "概述";
  let buf = [];
  const flush = () => {
    const body = buf.join("\n").trim();
    if (body.length > 20) chunks.push({ file, heading, text: body });
    buf = [];
  };
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      flush();
      heading = line.replace(/^##\s+/, "").trim();
    } else if (/^#\s+/.test(line)) {
      // 文档标题不进正文
    } else {
      buf.push(line);
    }
  }
  flush();
  return chunks;
}

const STOP = new Set([
  "的", "了", "是", "在", "和", "与", "及", "或", "把", "被", "对", "为", "从", "到",
  "有", "这", "那", "我", "你", "他", "她", "它", "们", "一个", "怎么", "如何", "什么",
  "为什么", "可以", "需要", "应该", "项目", "问题", "工作", "一下", "现在", "然后",
  "就是", "不是", "还是", "但是", "因为", "所以", "如果", "这个", "那个", "我们",
  "你们", "他们", "以及", "进行", "通过", "关于", "对于", "主要", "相关"
]);

export function tokenize(query) {
  const s = String(query || "")
    .toLowerCase()
    .replace(/[^\u4e00-\u9fffa-z0-9]+/g, " ")
    .trim();
  const toks = new Set();
  for (const w of s.split(/\s+/)) {
    if (!w) continue;
    if (/^[a-z0-9]+$/.test(w)) {
      if (w.length > 1) toks.add(w);
    } else {
      for (let i = 0; i < w.length - 1; i++) {
        const bg = w.slice(i, i + 2);
        if (!STOP.has(bg)) toks.add(bg);
      }
      if (w.length === 1) toks.add(w);
    }
  }
  return [...toks];
}

export function scoreChunk(chunk, toks) {
  const head = chunk.heading.toLowerCase();
  const body = chunk.text.toLowerCase();
  let score = 0;
  for (const t of toks) {
    if (head.includes(t)) score += 3;
    let idx = body.indexOf(t);
    let n = 0;
    while (idx !== -1 && n < 5) {
      score += 1;
      n++;
      idx = body.indexOf(t, idx + t.length);
    }
  }
  return score;
}

const EXPAND = [
  [/这周|本周|现在|下一步|先做|该做|优先/, "P0 具体任务 本周计划 优先级"],
  [/字段|表结构|数据字典|字段名/, "字段建议 数据字典 station_hour"],
  [/分工|谁做|负责|角色/, "五个角色 分工"],
  [/来源|哪来|合法|合规/, "数据方案 数据来源 合规"],
  [/答辩|评委|提问/, "答辩 模拟答辩 Q&A"],
  [/报告|第一章|写法|格式/, "报告结构 格式审查 交付物"],
  [/可视化|大屏|视图/, "可视化系统 三个视图"],
  [/智能体|agent/i, "智能体 工具 防幻觉"]
];

const ROLE_FILES = {
  "刘子正": ["04-数据分析方法.md", "05-智能体.md", "00-项目事实卡.md"],
  "李树钧": ["06-数据方案.md", "03-可视化系统.md"],
  "彭加欣": ["06-数据方案.md", "00-项目事实卡.md"],
  "韩昊峰": ["03-可视化系统.md", "09-交付物与提交.md", "08-常见问题.md"],
  "周思琪": ["09-交付物与提交.md", "07-分工与阶段计划.md", "08-常见问题.md"]
};

export function retrieve(chunks, query, role, topK = 6) {
  let expanded = String(query || "");
  for (const [re, extra] of EXPAND) {
    if (re.test(expanded)) expanded += " " + extra;
  }
  const toks = tokenize(expanded);
  const roleFiles = ROLE_FILES[role] || [];
  const scored = chunks
    .map((c) => ({
      ...c,
      score: scoreChunk(c, toks) + (roleFiles.includes(c.file) ? 2 : 0)
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  const out = [];
  const cutoff = Math.max(3, (scored[0]?.score || 0) * 0.35);
  for (const c of scored) {
    if (c.score < cutoff) break;
    const key = c.file + "|" + c.heading;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= topK) break;
  }
  return out;
}
