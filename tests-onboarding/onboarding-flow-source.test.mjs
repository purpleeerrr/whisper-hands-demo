import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");

test("each saved planet gets its own follow-up, then returns to the planet scene", () => {
  assert.doesNotMatch(html, /clueProgress|clueContinue|已填写\s*\d/u);
  assert.doesNotMatch(css, /clue\.completed::after|content:\s*["']✓/u);
  assert.match(html, /向左滑动进入下一页/u);
  assert.match(app, /setTimeout\(beginFollowUp,260\)/u);
  assert.match(app, /state\.clueEntries\[state\.clue\].*followUpQuestion/u);
  assert.match(app, /function finishFollowUp[\s\S]*?go\('clue','fade'/u);
  assert.match(app, /active==='clue'&&dx<-24\)goStars/u);
});

test("planet inputs keep distinct meaning dimensions and only detail uses identity extraction", () => {
  for (const dimension of ["aesthetic", "meaning_association", "making_process", "attention", "language_voice"]) {
    assert.match(app, new RegExp(`dimension:'${dimension}'`, "u"));
  }
  assert.match(app, /一个总会注意的细节'\s*,\{dimension:'attention',identity:true\}/u);
  assert.equal((app.match(/identity:true/gu) || []).length, 1);
  assert.match(app, /function isIdentityPlanet\(\)\{return IDENTITY_PLANETS\.has\(state\.clue\)\}/u);
});

test("preset works demonstrate interaction without entering saved user works", () => {
  assert.match(app, /const presetWorks=\[/u);
  assert.match(app, /蓝釉流动测试/u);
  assert.match(app, /isPreset:true/u);
  assert.equal((app.match(/isPreset:true/gu) || []).length, 12);
  assert.match(app, /function displayWorks\(\)\{return\[\.\.\.\(state\.works\|\|\[\]\),\.\.\.presetWorks\]\}/u);
  assert.match(app, /示例 · \$\{w\.title\}/u);
  assert.match(app, /for\(let i=0;i<state\.works\.length;i\+=1\)/u);
  assert.match(app, /meaningStore\?\.saveWorks\(state\.works\)/u);
  assert.doesNotMatch(app, /saveWorks\(displayWorks\(\)\)|saveWorks\(presetWorks/u);
});

test("intro layout and independent music/effect controls match the revised header", () => {
  assert.doesNotMatch(html, /进入花园<\/button>|创作流程<\/button>|id="soundBtn"/u);
  assert.match(html, /关于絮手/u);
  assert.match(html, /id="musicBtn"[^>]*>MUSIC ON/u);
  assert.match(html, /id="fxBtn"[^>]*>FX ON/u);
  assert.match(app, /let ac=null,master=null,musicBus=null,fxBus=null,music=true,fx=true/u);
  assert.match(app, /if\(!music\)return; initAudio/u);
  assert.match(app, /if\(!fx\)return;initAudio/u);
  assert.match(css, /hero-right\{[^}]*top:49vh/u);
  assert.match(css, /completion-minimal \.completion-head h2\{font-size:clamp\(34px,4\.5vw,72px\)/u);
});

test("candidate confirmation and obsolete reflection scenes are removed", () => {
  assert.doesNotMatch(html, /candidateScene|meaningCandidateList|reflectScene|reflectText|reflectSkip/u);
  assert.doesNotMatch(app, /goCandidateReview|candidateContinue|makeMirror|mirrorLines|reflectScene/u);
  assert.match(app, /waySkip'\)\.addEventListener\('click',goMagic\)/u);
  assert.doesNotMatch(html, /magic-hint/u);
});

test("minimal completion swipes into a color-filling octopus handoff", () => {
  assert.match(html, /继续探索/u);
  assert.match(html, /上滑开始创作/u);
  assert.match(html, /id="handoffOctopus"/u);
  assert.doesNotMatch(html, /completionKernelCount|completionThreadCount|completionWorkCount|completionItems|completeEnter/u);
  assert.match(app, /active==='complete'&&dy<-24\)startHandoff/u);
  assert.match(app, /drawHandoffOctopus\(1-Math\.pow/u);
  assert.match(app, /whisper:handoff-ready/u);
  assert.match(app, /window\.startWhisperSecondHalf/u);
});
