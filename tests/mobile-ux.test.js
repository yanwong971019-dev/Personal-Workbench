import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("mobile dashboard puts quick recording before stats and charts", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const quick = html.indexOf('class="card home-quick"');
  const stats = html.indexOf('id="dashboardStats"');
  const charts = html.indexOf('id="dashWeightChart"');
  assert.ok(quick > 0);
  assert.ok(quick < stats);
  assert.ok(stats < charts);
  assert.match(html, /home-quick-actions/);
  assert.match(html, /todayDietItems\.length\?todayCal/);
  assert.match(html, /todayExerciseItems\.length\?todayExCal/);
});

test("mobile more menu prioritizes daily modules and cloud sync", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const start = html.indexOf('id="mobileMoreMenu"');
  const end = html.indexOf("<!--", start);
  const menu = html.slice(start, end);
  assert.match(menu, /switchToPage\('pregnancy'\)/);
  assert.match(menu, /switchToPage\('exercise'\)/);
  assert.match(menu, /openCloudSync\(\)/);
  assert.doesNotMatch(menu, /manualSync\(\)/);
  assert.doesNotMatch(menu, /openSyncSettings\(\)/);
});

test("frequent mobile forms keep optional fields collapsed", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<details class="advanced-fields"><summary>[^<]*身高和孕前体重/);
  assert.match(html, /<details class="advanced-fields"><summary>[^<]*份量、分类和营养标签/);
  assert.match(html, /<details class="advanced-fields" id="finItemFields">/);
  for (const id of ["heightValue", "prePregWeightValue", "dietCategory", "dietNote", "finPname", "finBrand", "finSpec", "finQty", "finNote"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("PWA offers an explicit safe update action", async () => {
  const [html, worker] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /function showAppUpdatePrompt\(registration\)/);
  assert.match(html, /type:'SKIP_WAITING'/);
  assert.match(html, /registerAppServiceWorker\(\)/);
  assert.match(html, /不会清除本地记录或云端数据/);
  assert.match(worker, /event\.data\?\.type === 'SKIP_WAITING'/);
  assert.match(worker, /life-workbench-shell-v20260815-3/);
});
