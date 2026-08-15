import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("inline scripts compile", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((script) => script.trim());
  assert.ok(scripts.length > 0);
  for (const script of scripts) assert.doesNotThrow(() => new Function(script));
});

test("mobile cloud login supports in-app verification", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="cloudOtp"/);
  assert.match(html, /id="cloudMagicLink"/);
  assert.match(html, /supabaseClient\.auth\.verifyOtp\(verifyArgs\)/);
  assert.match(html, /发送次数已达上限，请查看已收到的邮件/);
});

test("first cloud upload requires explicit device confirmation", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /!cloudSyncReady/);
  assert.match(html, /openCloudFirstUpload\(\)/);
  assert.match(html, /确认，用本设备建立云端/);
});
