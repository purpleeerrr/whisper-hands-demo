import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/completion-summary.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const { buildCompletionSummary } = context.WhisperCompletionSummary;

{
  const summary = buildCompletionSummary({
    creatorKernel: {
      items: [{ statement: "我会注意光如何改变空间。", type: "identity_thread", privateStory: "不要输出" }],
    },
    creatorState: {
      facts: [
        { statement: "我尤其喜欢傍晚的侧光。", status: "confirmed", scope: "recurring", rawInput: "私人原始输入" },
        { statement: "被拒绝的事实", status: "rejected" },
      ],
      threads: [
        { statement: "我会注意光如何改变空间。", status: "confirmed", supportCount: 2, kernelEligible: true },
        { statement: "我的注意力可能停在材料留下的痕迹上。", status: "confirmed", supportCount: 1, kernelEligible: false },
      ],
      rejectedCandidates: [{ statement: "被拒绝的推断" }],
    },
    confirmedWorks: {
      works: [{ title: "作品一", imageDataUrl: "data:image/jpeg;base64,private" }],
    },
  });

  assert.equal(summary.schemaVersion, "onboarding-completion-summary.v0.1");
  assert.equal(summary.rawMaterialIncluded, false);
  assert.equal(summary.items.length, 3);
  assert.equal(summary.items[0].maturity, "stable");
  assert.equal(summary.counts.stableKernelItems, 1);
  assert.equal(summary.counts.growingThreads, 1);
  assert.equal(summary.counts.confirmedWorks, 1);

  const output = JSON.stringify(summary);
  for (const privateValue of ["不要输出", "私人原始输入", "被拒绝的事实", "被拒绝的推断", "data:image"]) {
    assert.equal(output.includes(privateValue), false);
  }
}

{
  const summary = buildCompletionSummary();
  assert.deepEqual(Array.from(summary.items), []);
  assert.equal(summary.counts.stableKernelItems, 0);
  assert.equal(summary.counts.growingThreads, 0);
  assert.equal(summary.counts.confirmedWorks, 0);
}

console.log("completion-summary tests passed");
