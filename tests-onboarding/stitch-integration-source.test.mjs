import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stitch = await readFile(new URL("../js/stitch.js", import.meta.url), "utf8");
const bridge = await readFile(new URL("../js/studio-bridge.js", import.meta.url), "utf8");
const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");

test("handoff opens the preloaded NOW studio without an intermediate prompt", () => {
  assert.match(stitch, /document\.createElement\("iframe"\)/u);
  assert.match(stitch, /studio\.html\?embedded=1/u);
  assert.match(stitch, /whisper-studio-open/u);
  // 不注入「跳过」按钮，onboarding 每次完整展示
  assert.match(stitch, /whisper-hands:site-handoff:v1/u);
  assert.doesNotMatch(stitch, /whSkipOnboarding/u);
  assert.ok(!stitch.includes("location.replace"));
  assert.doesNotMatch(bridge, /whSiteArrival|arrival-card|进入正在创作/u);
});

test("the original corner octopus stays intact while parent audio keeps running", () => {
  assert.doesNotMatch(stitch, /current\.replaceWith\(host\)/u);
  assert.match(app, /paintHandoffOctopus/u);
  assert.match(app, /tone\(300\+soundStep\*66/u);
  assert.match(app, /tone\(880/u);
});
