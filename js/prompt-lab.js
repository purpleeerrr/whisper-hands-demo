(() => {
  const $ = (selector) => document.querySelector(selector);
  const evidence = (id = "current-evidence") => [id];
  const base = () => ({ schemaVersion: "identity-extraction.v0.1", explicitFactCandidates: [], observations: [], threadCandidates: [], supportedExistingThreads: [], possibleContradictions: [], ambiguities: [], followUp: null, userFacingCandidates: [], kernelUpdateAllowed: false });
  const cases = [
    {
      id: "clear",
      label: "案例 1 · 清楚",
      input: "我每次走进一个空间，都会先看光落在哪里。尤其喜欢傍晚从侧面照进来的光。",
      kernel: "",
      expected: Object.assign(base(), {
        explicitFactCandidates: [
          { statement: "进入一个空间时，我通常会先注意光落在哪里。", scope: "recurring", certainty: "explicit", evidenceRefs: evidence(), needsUserConfirmation: true },
          { statement: "我尤其喜欢傍晚的侧光。", scope: "recurring", certainty: "explicit", evidenceRefs: evidence(), needsUserConfirmation: true },
        ],
        observations: [{ dimension: "attention", statement: "这次表达同时涉及光线、空间位置、时间与方向。", evidenceRefs: evidence() }],
        threadCandidates: [{ threadKey: "light_shapes_spatial_attention", statement: "我的注意力可能容易停在光如何改变空间上。", scope: "recurring", confidence: "tentative", evidenceRefs: evidence(), kernelEligible: false }],
        ambiguities: ["尚不确定真正吸引用户的是颜色、影子形状、空间变化还是时间感。"],
        followUp: { question: "傍晚侧光吸引你的，是颜色、影子的形状，还是它让空间突然有了时间感？", informationGain: "区分视觉属性、空间变化与时间联想。", requiredBeforeThreadConfirmation: true },
        userFacingCandidates: [{ statement: "我进入一个空间时，好像会先通过光来感受它。", sourceType: "fact_candidate" }],
      }),
    },
    {
      id: "ambiguous",
      label: "案例 2 · 模糊",
      input: "裂纹。",
      kernel: "",
      expected: Object.assign(base(), {
        explicitFactCandidates: [{ statement: "我会注意到裂纹。", scope: "recurring", certainty: "explicit_but_underspecified", evidenceRefs: evidence(), needsUserConfirmation: true }],
        observations: [{ dimension: "attention", statement: "用户在细节问题下提到了裂纹。", evidenceRefs: evidence() }],
        ambiguities: ["不确定用户注意的是裂纹的形状、材质、形成过程、破损含义还是个人联想。", "不确定用户喜欢裂纹，还是只是无法忽略它。"],
        followUp: { question: "你注意裂纹时，最先抓住你的是它的形状、材料破开的痕迹，还是它让你想到的别的东西？", informationGain: "区分视觉注意、材料注意与意义联想。", requiredBeforeThreadConfirmation: true },
      }),
    },
    {
      id: "tension",
      label: "案例 3 · 张力",
      input: "最近我总盯着陶器边缘崩掉的地方看，觉得它比完整的时候更有生命。",
      kernel: "我通常喜欢完整、克制、有控制感的表面。",
      expected: Object.assign(base(), {
        explicitFactCandidates: [{ statement: "最近我经常注意陶器边缘崩掉的地方。", scope: "recurring", certainty: "explicit", evidenceRefs: evidence(), needsUserConfirmation: true }],
        observations: [{ dimension: "meaning_association", statement: "用户将破损状态与生命感联系在一起。", evidenceRefs: evidence() }],
        threadCandidates: [{ threadKey: "completeness_and_liveliness_tension", statement: "我对完整与破损的感受，可能会随着材料、作品或阶段发生变化。", scope: "recurring", confidence: "tentative", evidenceRefs: evidence(), kernelEligible: false }],
        possibleContradictions: [{ existingThreadId: "kernel-1", relationship: "tension", explanation: "旧理解强调完整和控制感，新输入则在破损边缘中感受到生命感。", shouldOverwriteExisting: false }],
        ambiguities: ["不确定这是当前作品的例外、最近发生的变化，还是两种倾向一直并存。"],
        followUp: { question: "这是这件作品里的例外，还是你最近看待不完整的方式正在改变？", informationGain: "判断它属于项目例外、长期变化还是并存张力。", requiredBeforeThreadConfirmation: true },
        userFacingCandidates: [{ statement: "完整和控制感仍然重要，但这次破损的边缘反而让你觉得更有生命。", sourceType: "possible_tension" }],
      }),
    },
  ];

  const kernelStore = window.WhisperIdentityKernelLab;
  let selectedCase = cases[0];
  let currentResult = null;
  let currentEvidenceId = "";
  let currentMode = "";
  let patchApplied = false;
  const decisions = new Map();
  const caseButtons = $("#caseButtons");
  cases.forEach((testCase) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = testCase.label;
    button.addEventListener("click", () => selectCase(testCase, button));
    caseButtons.appendChild(button);
  });

  function selectCase(testCase, button) {
    selectedCase = testCase;
    [...caseButtons.children].forEach((item) => item.classList.toggle("active", item === button));
    $("#userInput").value = testCase.input;
    $("#existingKernel").value = testCase.kernel;
    $("#runStatus").textContent = "案例已载入；查看标准答案不会调用 API。";
    renderResult(null);
  }

  function kernelPayload() {
    return $("#existingKernel").value.split(/\n+/).map((statement, index) => ({ id: `kernel-${index + 1}`, statement: statement.trim(), scope: "long_term" })).filter((item) => item.statement);
  }

  function group(title, className, items, formatter) {
    if (!items?.length) return "";
    return `<section class="result-group ${className}"><h3>${title}</h3>${items.map(formatter).join("")}</section>`;
  }

  function reviewGroup(title, className, candidateType, items) {
    if (!items?.length) return "";
    return `<section class="result-group ${className}"><h3>${title}</h3>${items.map((item, index) => `<article class="review-card" data-candidate-type="${candidateType}" data-candidate-index="${index}"><textarea maxlength="1000">${escapeHtml(item.statement)}</textarea><p class="meta">${escapeHtml(candidateType === "fact" ? item.scope : item.confidence)} · 等待你的决定</p><div class="review-actions"><button type="button" data-action="confirm">确认／按我的话保存</button><button type="button" data-action="reject">这不像我</button><span class="review-decision">尚未决定</span></div></article>`).join("")}</section>`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value ?? "")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function renderResult(result, mode = "expected", usage = null) {
    currentResult = result;
    currentMode = mode;
    currentEvidenceId = result ? `lab-evidence-${stableHash(`${selectedCase?.id || "custom"}|${$("#userInput").value.trim()}`)}` : "";
    patchApplied = false;
    decisions.clear();
    updatePatchControls();
    if (!result) {
      $("#resultGroups").innerHTML = '<div class="empty-state">选择一个案例，先查看标准答案；满意后再运行 AI。</div>';
      $("#scorecard").innerHTML = "";
      $("#rawJson").textContent = "{}";
      $("#usageLabel").textContent = "0 API";
      return;
    }
    const html = [
      reviewGroup("EXPLICIT FACT CANDIDATES", "fact", "fact", result.explicitFactCandidates),
      group("OBSERVATIONS", "", result.observations, (item) => `<p>${escapeHtml(item.statement)}</p><p class="meta">${escapeHtml(item.dimension)}</p>`),
      reviewGroup("IDENTITY THREAD CANDIDATES", "thread", "thread", result.threadCandidates),
      group("POSSIBLE TENSIONS", "conflict", result.possibleContradictions, (item) => `<p>${escapeHtml(item.explanation)}</p><p class="meta">${escapeHtml(item.relationship)} · 不覆盖旧理解</p>`),
      group("AMBIGUITIES", "", result.ambiguities, (item) => `<p>${escapeHtml(item)}</p>`),
      result.followUp ? `<section class="result-group"><h3>FOLLOW-UP</h3><p>${escapeHtml(result.followUp.question)}</p><p class="meta">为什么问：${escapeHtml(result.followUp.informationGain)}</p></section>` : "",
      group("WHAT THE USER SEES", "fact", result.userFacingCandidates, (item) => `<p>${escapeHtml(item.statement)}</p>`),
    ].join("");
    $("#resultGroups").innerHTML = html || '<div class="empty-state">这次没有形成可展示的候选。</div>';
    $("#rawJson").textContent = JSON.stringify(result, null, 2);
    $("#usageLabel").textContent = mode === "ai" ? (usage?.totalTokens ? `1 API · ${usage.totalTokens} tokens` : "1 API") : "标准答案 · 0 API";
    renderChecks(result, mode);
    wireReviewControls();
  }

  function candidateFor(type, index) {
    return type === "fact" ? currentResult?.explicitFactCandidates?.[index] : currentResult?.threadCandidates?.[index];
  }

  function wireReviewControls() {
    document.querySelectorAll(".review-card").forEach((card) => {
      const type = card.dataset.candidateType;
      const index = Number(card.dataset.candidateIndex);
      const textarea = card.querySelector("textarea");
      const status = card.querySelector(".review-decision");
      const buttons = [...card.querySelectorAll("button[data-action]")];
      buttons.forEach((button) => button.addEventListener("click", () => {
        const action = button.dataset.action;
        const candidate = candidateFor(type, index);
        const key = `${type}:${index}`;
        if (!candidate) return;
        const statement = textarea.value.trim();
        if (action === "confirm" && !statement) {
          status.textContent = "请先保留或写下一句话";
          return;
        }
        decisions.set(key, {
          candidateType: type,
          candidateIndex: index,
          action,
          statement: action === "confirm" ? statement : "",
          originalStatement: candidate.statement,
          scope: candidate.scope || "moment",
          certainty: candidate.certainty || "",
          threadKey: candidate.threadKey || "",
          confidence: candidate.confidence || "tentative",
        });
        buttons.forEach((item) => item.classList.remove("active-confirm", "active-reject"));
        button.classList.add(action === "confirm" ? "active-confirm" : "active-reject");
        status.textContent = action === "confirm" ? (statement === candidate.statement ? "将确认" : "将按你的改写确认") : "将拒绝，不影响 Kernel";
        updatePatchControls();
      }));
      textarea.addEventListener("input", () => {
        const existing = decisions.get(`${type}:${index}`);
        if (existing?.action === "confirm") {
          existing.statement = textarea.value.trim();
          decisions.set(`${type}:${index}`, existing);
          status.textContent = "已修改；将按你的话确认";
        }
      });
    });
  }

  function updatePatchControls() {
    const button = $("#applyPatch");
    if (!button) return;
    button.disabled = !currentResult || !decisions.size || patchApplied;
    $("#patchStatus").textContent = patchApplied ? "Patch 已应用；AI 没有直接写入任何内容。" : decisions.size ? `已经决定 ${decisions.size} 条；应用 Patch 不会调用 API。` : "先在上面的 Fact 或 Thread 卡片中确认、改写或拒绝。";
  }

  function renderChecks(result, mode) {
    const checks = [
      [result.kernelUpdateAllowed === false, "没有自动更新 Kernel"],
      [result.explicitFactCandidates.every((item) => item.needsUserConfirmation), "Fact 都等待确认"],
      [result.threadCandidates.every((item) => item.kernelEligible === false), "Thread 没有越权晋升"],
    ];
    if (mode === "ai" && selectedCase?.id === "ambiguous") checks.push([result.threadCandidates.length === 0, "模糊输入没有硬推断"]);
    if (mode === "ai" && selectedCase?.id === "tension") checks.push([result.possibleContradictions.length > 0, "识别到旧理解的张力"]);
    $("#scorecard").innerHTML = checks.map(([pass, label]) => `<div class="check ${pass ? "pass" : "fail"}">${pass ? "✓" : "×"} ${escapeHtml(label)}</div>`).join("");
  }

  $("#showExpected").addEventListener("click", () => {
    if (!selectedCase) return;
    renderResult(selectedCase.expected, "expected");
    $("#runStatus").textContent = "正在查看人工标准答案；没有调用 API。";
  });

  $("#runAi").addEventListener("click", async () => {
    const userInput = $("#userInput").value.trim();
    if (!userInput) return $("#runStatus").textContent = "请先输入一句想测试的话。";
    const button = $("#runAi");
    button.disabled = true;
    $("#runStatus").textContent = "正在运行一次 Identity Extraction…";
    try {
      const response = await fetch("/api/identity/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: selectedCase?.id || "custom", userInput, existingKernel: kernelPayload() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Prompt Lab 暂时无法完成这次测试。");
      renderResult(data.extraction, "ai", data.usage);
      $("#runStatus").textContent = "AI 已返回；红色检查项就是下一轮 Prompt 要调整的地方。";
    } catch (error) {
      $("#resultGroups").innerHTML = `<div class="error-card">${escapeHtml(error.message)}</div>`;
      $("#runStatus").textContent = "这次没有产生可评估结果，也不会写入 Kernel。";
    } finally {
      button.disabled = false;
    }
  });

  function renderKernelStore() {
    const state = kernelStore.getState();
    $("#revisionLabel").textContent = `REVISION ${state.revision}`;
    const renderItems = (selector, items, formatter) => {
      $(selector).innerHTML = items.length ? items.map(formatter).join("") : '<p class="kernel-empty">还没有内容。</p>';
    };
    renderItems("#labFacts", state.facts, (item) => `<div class="kernel-item">${escapeHtml(item.statement)}<small>${escapeHtml(item.scope)} · 用户已确认</small></div>`);
    renderItems("#labThreads", state.threads, (item) => `<div class="kernel-item thread ${item.kernelEligible ? "" : "pending"}">${escapeHtml(item.statement)}<small>${item.supportCount} 份证据 · ${item.kernelEligible ? "已满足晋升规则" : "等待更多证据"}</small></div>`);
    renderItems("#labKernel", state.kernel, (item) => `<div class="kernel-item ${item.type === "identity_thread" ? "thread" : ""}">${escapeHtml(item.statement)}<small>${escapeHtml(item.type)} · ${escapeHtml(item.confidence)}</small></div>`);
  }

  $("#applyPatch").addEventListener("click", () => {
    if (!currentResult || !decisions.size || patchApplied) return;
    try {
      const patch = kernelStore.createPatch({ caseId: `${selectedCase?.id || "custom"}:${currentMode}`, planet: "一个总会注意到的细节", evidenceId: currentEvidenceId, decisions: [...decisions.values()] });
      kernelStore.applyPatch(patch);
      patchApplied = true;
      $("#patchJson").textContent = JSON.stringify(patch, null, 2);
      renderKernelStore();
      updatePatchControls();
    } catch (error) {
      $("#patchStatus").textContent = error.message === "PATCH_REVISION_CONFLICT" ? "Kernel 已被另一份 Patch 更新，请重新载入候选。" : "这份 Patch 暂时无法应用，请检查候选决定。";
    }
  });

  $("#resetKernel").addEventListener("click", () => {
    if (!window.confirm("只清空 Prompt Lab 的 Identity Patch、Fact、Thread 和 Lab Kernel？正式 onboarding 数据不会受影响。")) return;
    kernelStore.reset();
    $("#patchJson").textContent = "{}";
    patchApplied = false;
    decisions.clear();
    renderKernelStore();
    updatePatchControls();
  });

  renderKernelStore();
  selectCase(cases[0], caseButtons.firstElementChild);
})();
