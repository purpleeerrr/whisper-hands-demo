(function attachWhisperCompletionSummary(root) {
  "use strict";

  const clean = (value, max = 1000) => String(value ?? "").replaceAll("\u0000", "").trim().slice(0, max);

  function buildCompletionSummary({ creatorState, creatorKernel, confirmedWorks } = {}) {
    const state = creatorState && typeof creatorState === "object" ? creatorState : {};
    const kernelItems = Array.isArray(creatorKernel?.items) ? creatorKernel.items : [];
    const stableStatements = new Set(kernelItems.map((item) => clean(item?.statement)).filter(Boolean));
    const items = [];
    const add = (item) => {
      const statement = clean(item?.statement, 700);
      if (!statement || items.some((existing) => existing.statement === statement) || items.length >= 5) return;
      items.push({ statement, type: item.type, maturity: item.maturity, label: item.label });
    };

    kernelItems.forEach((item) => add({
      statement: item.statement,
      type: item.type === "explicit_fact" ? "fact" : "thread",
      maturity: "stable",
      label: item.type === "explicit_fact" ? "已确认事实 · 稳定" : "Identity Thread · 已有多份证据",
    }));
    (Array.isArray(state.facts) ? state.facts : []).filter((fact) => fact?.status === "confirmed" && !stableStatements.has(clean(fact.statement))).forEach((fact) => add({ statement: fact.statement, type: "fact", maturity: "growing", label: `已确认事实 · ${clean(fact.scope, 40) || "moment"}` }));
    (Array.isArray(state.threads) ? state.threads : []).filter((thread) => thread?.status === "confirmed" && !stableStatements.has(clean(thread.statement))).forEach((thread) => add({ statement: thread.statement, type: "thread", maturity: "growing", label: `Identity Thread · ${Math.max(1, Number(thread.supportCount) || 1)} 份证据` }));

    const confirmedWorkList = Array.isArray(confirmedWorks?.works) ? confirmedWorks.works : [];
    const pendingThreads = (Array.isArray(state.threads) ? state.threads : []).filter((thread) => thread?.status === "confirmed" && !thread.kernelEligible).length;
    return {
      schemaVersion: "onboarding-completion-summary.v0.1",
      rawMaterialIncluded: false,
      items,
      counts: {
        stableKernelItems: kernelItems.length,
        growingThreads: pendingThreads,
        confirmedWorks: confirmedWorkList.length,
      },
      message: items.length ? "我好像开始知道，你的眼睛会在哪里停下来了。" : "我们已经留下一些起点；更多理解会从之后的创作里慢慢长出来。",
    };
  }

  root.WhisperCompletionSummary = { buildCompletionSummary };
})(typeof window !== "undefined" ? window : globalThis);
