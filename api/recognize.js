import { applyCors, authorize, callQwenVision, readJsonBody } from "./_shared.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "只支持 POST 请求" });

  const auth = authorize(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  try {
    const body = await readJsonBody(req);
    const type = body.type === "finance" ? "finance" : "diet";
    return res.status(200).json(await callQwenVision(body.image, type));
  } catch (error) {
    console.error("[recognize]", error instanceof Error ? error.message : "unknown error");
    const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return res.status(isTimeout ? 504 : error.status || 500).json({
      error: isTimeout ? "AI 识别超时，请重试或手动录入" : error.message || "AI 识别暂时失败",
    });
  }
}
