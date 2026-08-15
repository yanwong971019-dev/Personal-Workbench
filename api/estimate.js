import { applyCors, authorize, callQwenEstimate, readJsonBody } from "./_shared.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "只支持 POST 请求" });

  const auth = authorize(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  try {
    const body = await readJsonBody(req);
    if (!String(body.food || "").trim()) return res.status(400).json({ error: "请填写食物名称" });
    return res.status(200).json(await callQwenEstimate(body.food, body.amount || ""));
  } catch (error) {
    console.error("[estimate]", error instanceof Error ? error.message : "unknown error");
    const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return res.status(isTimeout ? 504 : error.status || 500).json({
      error: isTimeout ? "AI 估算超时，请稍后重试" : error.message || "AI 估算暂时失败",
    });
  }
}
