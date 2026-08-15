import assert from "node:assert/strict";
import test from "node:test";

import { authorize, callQwenVision } from "../api/_shared.js";

test("authorize requires matching configured token", () => {
  const previous = process.env.AUTH_TOKEN;
  process.env.AUTH_TOKEN = "expected";
  assert.equal(authorize({ headers: { "x-auth-token": "wrong" } }).status, 401);
  assert.equal(authorize({ headers: { "x-auth-token": "expected" } }).ok, true);
  if (previous === undefined) delete process.env.AUTH_TOKEN;
  else process.env.AUTH_TOKEN = previous;
});

test("finance recognition normalizes Qwen JSON output", async () => {
  const previousKey = process.env.DASHSCOPE_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.DASHSCOPE_API_KEY = "test-key";
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.model, "qwen3-vl-flash");
    assert.equal(request.response_format.type, "json_object");
    assert.equal(request.enable_thinking, false);
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        items: [
          { pname: "纸尿裤", brand: "示例", spec: "NB", qty: "1包", amount: "89.90", category: "母婴用品" },
          { pname: "无金额项目", amount: 0, category: "其他" },
        ],
        total_amount: 89.9,
      }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await callQwenVision("data:image/jpeg;base64,dGVzdA==", "finance");
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].pname, "纸尿裤");
    assert.equal(result.items[0].amount, 89.9);
    assert.equal(result.items[0].category, "母婴用品");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.DASHSCOPE_API_KEY;
    else process.env.DASHSCOPE_API_KEY = previousKey;
  }
});

test("recognition rejects unsupported image input before calling Qwen", async () => {
  const previousKey = process.env.DASHSCOPE_API_KEY;
  process.env.DASHSCOPE_API_KEY = "test-key";
  try {
    await assert.rejects(() => callQwenVision("not-an-image", "finance"), /图片格式不支持/);
  } finally {
    if (previousKey === undefined) delete process.env.DASHSCOPE_API_KEY;
    else process.env.DASHSCOPE_API_KEY = previousKey;
  }
});
