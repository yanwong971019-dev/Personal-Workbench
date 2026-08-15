import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function extractNamedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} is incomplete`);
}

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
  assert.match(html, /id="cloudVerifyStep" style="display:block/);
  assert.match(html, /parseCloudEmailLoginLink\(pastedLink\)/);
  assert.match(html, /isTrustedQqMailSafetyLink\(pastedLink\)/);
  assert.match(html, /confirmQqMailSafetyNavigation\(pastedLink, email\)/);
  assert.match(html, /loginUrl\.searchParams\.values\(\)/);
  assert.match(html, /loginUrl\.hostname === expectedHost/);
  assert.match(html, /supabaseClient\.auth\.verifyOtp\(verifyArgs\)/);
  assert.match(html, /发送次数已达上限，请查看已收到的邮件/);
});

test("QQ Mail safety wrapper reveals the Supabase sign-in link", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const functionSource = extractNamedFunction(html, "parseCloudEmailLoginLink");
  const parseLink = new Function(
    "SUPABASE_URL",
    `${functionSource}; return parseCloudEmailLoginLink;`,
  )("https://cavceofkizstabmohbti.supabase.co");
  const signInLink = "https://cavceofkizstabmohbti.supabase.co/auth/v1/verify?token_hash=test-token&type=magiclink";
  const qqWrappedLink = `https://wx.mail.qq.com/xmspamcheck/xmsafejump?fun=xm_readhtml_html_parseurl&url=${encodeURIComponent(signInLink)}`;

  assert.deepEqual(parseLink(qqWrappedLink), { token_hash: "test-token", type: "magiclink" });
  assert.equal(parseLink("https://example.com/?token_hash=test-token&type=magiclink"), null);
});

test("encrypted QQ Mail links are accepted only from the trusted safety page", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const functionSource = extractNamedFunction(html, "isTrustedQqMailSafetyLink");
  const isTrustedLink = new Function(`${functionSource}; return isTrustedQqMailSafetyLink;`)();

  assert.equal(isTrustedLink("https://wx.mail.qq.com/xmspamcheck/xmsafejump?func=1&key=encrypted"), true);
  assert.equal(isTrustedLink("http://wx.mail.qq.com/xmspamcheck/xmsafejump?key=encrypted"), false);
  assert.equal(isTrustedLink("https://wx.mail.qq.com.evil.example/xmspamcheck/xmsafejump?key=encrypted"), false);
});

test("first cloud upload requires explicit device confirmation", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /!cloudSyncReady/);
  assert.match(html, /openCloudFirstUpload\(\)/);
  assert.match(html, /确认，用本设备建立云端/);
  assert.match(html, /id="cloudResumeFirstUpload"/);
  assert.match(html, /继续检查并建立云端备份/);
  assert.match(html, /getSession\(\)/);
  assert.match(html, /setTimeout\(\(\) => pullCloudSnapshot\(\), 0\)/);
});

test("cloud sync checks for updates while a device remains open", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /const CLOUD_PULL_INTERVAL_MS = 12000/);
  assert.match(html, /const CLOUD_READ_TIMEOUT_MS = 8000/);
  assert.match(html, /function startCloudPolling\(\)/);
  assert.match(html, /pullCloudSnapshot\(\{ quiet: true \}\)/);
  assert.match(html, /cloudPullInFlight/);
  assert.match(html, /cloudHasLocalChanges/);
  assert.match(html, /正在读取云端备份/);
});

test("cloud sync carries deletion markers across devices", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const recordSyncKey = extractNamedFunction(html, "recordSyncKey");
  const mergeData = extractNamedFunction(html, "mergeData");
  const merge = new Function("MERGEABLE_ARRAYS", `${recordSyncKey}; ${mergeData}; return mergeData;`)(["finances"]);
  const deleted = merge(
    { finances: [{ id: 1, _id: "finance_1", _updatedAt: 10 }], _deletedItems: {} },
    { finances: [], _deletedItems: { finance_1: 20 } },
    false,
  );
  assert.deepEqual(deleted.finances, []);
  const recreated = merge(
    { finances: [], _deletedItems: { finance_1: 20 } },
    { finances: [{ id: 1, _id: "finance_1", _updatedAt: 30 }], _deletedItems: {} },
    false,
  );
  assert.equal(recreated.finances.length, 1);
});

test("edits keep their record identity for cross-device sync", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /const existing=data\.weights\.find\(w=>w\.date===date\)/);
  assert.match(html, /existing\._updatedAt=Date\.now\(\)/);
  assert.match(html, /f\._updatedAt = Date\.now\(\)/);
  assert.match(html, /data\._updatedAt = Date\.now\(\)/);
});
