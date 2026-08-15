const DEFAULT_QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_QWEN_MODEL = "qwen3-vl-flash";
const ALLOWED_ORIGINS = new Set([
  "https://yanwong971019-dev.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const VERCEL_WORKBENCH_ORIGIN = /^https:\/\/personal-workbench(?:-[a-z0-9-]+)?\.vercel\.app$/;

export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.has(origin) || VERCEL_WORKBENCH_ORIGIN.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Auth-Token");
  res.setHeader("Cache-Control", "no-store");
}

export function authorize(req) {
  const expected = process.env.AUTH_TOKEN || "";
  const received = req.headers["x-auth-token"] || "";
  if (!expected) return { ok: false, status: 503, error: "AI 服务尚未配置访问密码" };
  if (received !== expected) return { ok: false, status: 401, error: "AI 访问密码不正确" };
  return { ok: true };
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function stripJsonFence(content) {
  return content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeFinance(result) {
  const allowedCategories = new Set([
    "餐饮", "生鲜食材", "零食饮料", "日用家居", "个护美容", "母婴用品",
    "服饰鞋包", "数码电器", "AI软件", "住房物业", "交通出行", "通讯网络",
    "文教娱乐", "医疗健康", "人情社交", "金融保险", "其他支出",
  ]);
  const items = Array.isArray(result.items) ? result.items.slice(0, 30) : [];
  return {
    items: items.map((item) => ({
      pname: String(item.pname || item.name || "消费").trim().slice(0, 80),
      brand: String(item.brand || "").trim().slice(0, 50),
      spec: String(item.spec || "").trim().slice(0, 50),
      qty: String(item.qty || item.quantity || "").trim().slice(0, 30),
      amount: asNumber(item.amount),
      category: allowedCategories.has(item.category) ? item.category : "其他支出",
    })).filter((item) => item.pname && item.amount > 0),
    total_amount: asNumber(result.total_amount),
  };
}

function normalizeDiet(result) {
  const allowedCategories = new Set(["主食", "蛋白质", "蔬菜", "水果", "乳制品", "零食", "饮品", "其他"]);
  const allowedTags = new Set(["高糖", "高脂", "高纤维", "高蛋白", "低卡", "控糖友好"]);
  const items = Array.isArray(result.items) ? result.items.slice(0, 12) : [];
  return {
    items: items.map((item) => ({
      food: String(item.food || item.name || "未知食物").trim().slice(0, 80),
      calories: Math.round(asNumber(item.calories)),
      category: allowedCategories.has(item.category) ? item.category : "其他",
      tags: Array.isArray(item.tags) ? item.tags.filter((tag) => allowedTags.has(tag)) : [],
    })).filter((item) => item.food),
    advice: String(result.advice || "照片识别仅为估算，请确认食物和份量。").trim().slice(0, 200),
  };
}

export async function callQwenVision(image, type) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    const error = new Error("千问 API Key 尚未配置");
    error.status = 503;
    throw error;
  }
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) {
    const error = new Error("图片格式不支持，请使用 JPEG、PNG 或 WebP");
    error.status = 400;
    throw error;
  }
  if (image.length > 4_000_000) {
    const error = new Error("图片过大，请重新拍照或压缩后再试");
    error.status = 413;
    throw error;
  }

  const financePrompt = `请识别这张购物小票、订单截图、支付截图或商品照片，提取实际购买项目。只返回 JSON：
{"items":[{"pname":"产品名称","brand":"品牌","spec":"规格","qty":"数量","amount":0,"category":"分类"}],"total_amount":0}
amount 是该项目实付小计，不是单价。分类只能选择：餐饮、生鲜食材、零食饮料、日用家居、个护美容、母婴用品、服饰鞋包、数码电器、AI软件、住房物业、交通出行、通讯网络、文教娱乐、医疗健康、人情社交、金融保险、其他支出。不要把合计、优惠、运费、支付方式重复识别成商品。看不清的字段用空字符串，不要猜测金额。`;
  const dietPrompt = `请识别这张餐食照片中的食物并估算每项热量。只返回 JSON：
{"items":[{"food":"食物名称","calories":0,"category":"分类","tags":[]}],"advice":"照片识别仅为估算，请确认食物和份量。"}
分类只能选择：主食、蛋白质、蔬菜、水果、乳制品、零食、饮品、其他。标签只能选择：高糖、高脂、高纤维、高蛋白、低卡、控糖友好。不要输出诊断、治疗或个体化孕产饮食处方。`;

  const baseUrl = (process.env.DASHSCOPE_BASE_URL || DEFAULT_QWEN_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.QWEN_VISION_MODEL || DEFAULT_QWEN_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: image } },
          { type: "text", text: type === "finance" ? financePrompt : dietPrompt },
        ],
      }],
      response_format: { type: "json_object" },
      enable_thinking: false,
    }),
    signal: AbortSignal.timeout(50_000),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `千问服务返回 ${response.status}`;
    const error = new Error(message);
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    const error = new Error("千问没有返回可解析的识别结果");
    error.status = 422;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    const error = new Error("千问返回格式异常，请重试或手动录入");
    error.status = 422;
    throw error;
  }
  return type === "finance" ? normalizeFinance(parsed) : normalizeDiet(parsed);
}

export async function callQwenEstimate(food, amount) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    const error = new Error("千问 API Key 尚未配置");
    error.status = 503;
    throw error;
  }
  const baseUrl = (process.env.DASHSCOPE_BASE_URL || DEFAULT_QWEN_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.QWEN_TEXT_MODEL || DEFAULT_QWEN_MODEL,
      messages: [{ role: "user", content: `估算“${String(food).slice(0, 80)}”，份量“${String(amount).slice(0, 50)}”的热量。只返回 JSON：{"calories":0,"category":"其他","tags":[],"advice":"估算仅供记录参考"}` }],
      response_format: { type: "json_object" },
      enable_thinking: false,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || payload?.message || "千问估算失败");
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }
  const content = payload?.choices?.[0]?.message?.content;
  try {
    const parsed = JSON.parse(stripJsonFence(content));
    return {
      calories: Math.round(asNumber(parsed.calories)),
      category: String(parsed.category || "其他"),
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      advice: String(parsed.advice || "估算仅供记录参考").slice(0, 200),
    };
  } catch {
    const error = new Error("千问返回格式异常");
    error.status = 422;
    throw error;
  }
}
