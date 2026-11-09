// Cloudflare Worker：项目助教的 API 代理
// 作用：隐藏 API Key、限制来源、转发到 DeepSeek（OpenAI 兼容接口）
// 部署：wrangler deploy；密钥：wrangler secret put DEEPSEEK_API_KEY

const MAX_MESSAGES = 30;
const MAX_TOTAL_CHARS = 30000;

function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ok = allowed.includes("*") || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin || "*" : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
  });
}

function validate(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "messages 不能为空";
  if (messages.length > MAX_MESSAGES) return "对话太长，请新开一轮";
  let total = 0;
  for (const m of messages) {
    if (!m || typeof m.content !== "string") return "消息格式不对";
    if (!["system", "user", "assistant"].includes(m.role)) return "消息角色不对";
    total += m.content.length;
  }
  if (total > MAX_TOTAL_CHARS) return "内容太长，请精简后重试";
  return "";
}

async function rateLimited(env, ip) {
  if (!env.RATE_LIMIT) return false;
  const limit = Number(env.RATE_LIMIT_PER_DAY || 300);
  const day = new Date().toISOString().slice(0, 10);
  const key = `rl:${ip}:${day}`;
  const current = Number((await env.RATE_LIMIT.get(key)) || 0);
  if (current >= limit) return true;
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 90000 });
  return false;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, model: env.MODEL || "deepseek-chat" }, 200, cors);
    }

    if (request.method !== "POST" || url.pathname !== "/chat") {
      return json({ error: "Not found" }, 404, cors);
    }

    // 来源校验：没配置 ALLOWED_ORIGINS 时只允许 *（方便本地调试，生产请配置）
    const allowed = String(env.ALLOWED_ORIGINS || "*")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!allowed.includes("*") && origin && !allowed.includes(origin)) {
      return json({ error: "Origin not allowed" }, 403, cors);
    }

    if (!env.DEEPSEEK_API_KEY) {
      return json({ error: "服务端未配置 DEEPSEEK_API_KEY" }, 500, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch (_) {
      return json({ error: "请求不是合法 JSON" }, 400, cors);
    }

    if (env.ACCESS_CODE && String(body.accessCode || "") !== String(env.ACCESS_CODE)) {
      return json({ error: "访问码不正确" }, 401, cors);
    }

    const err = validate(body.messages);
    if (err) return json({ error: err }, 400, cors);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (await rateLimited(env, ip)) {
      return json({ error: "今天问得太多了，明天再来" }, 429, cors);
    }

    const payload = {
      model: env.MODEL || "deepseek-chat",
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: 0.2,
      max_tokens: 1400,
      stream: false
    };

    let upstream;
    try {
      upstream = await fetch(
        (env.DEEPSEEK_BASE || "https://api.deepseek.com") + "/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
          },
          body: JSON.stringify(payload)
        }
      );
    } catch (e) {
      return json({ error: "上游请求失败：" + e.message }, 502, cors);
    }

    let data;
    try {
      data = await upstream.json();
    } catch (_) {
      return json({ error: "上游返回不是 JSON" }, 502, cors);
    }

    if (!upstream.ok) {
      const msg = data?.error?.message || `上游返回 ${upstream.status}`;
      return json({ error: msg }, upstream.status, cors);
    }

    const content = data?.choices?.[0]?.message?.content || "";
    if (!content) return json({ error: "上游没有返回内容" }, 502, cors);

    return json(
      {
        content,
        usage: data.usage || null,
        model: data.model || payload.model
      },
      200,
      cors
    );
  }
};
