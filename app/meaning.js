// app/meaning.js
// Meaning Adapter —— 创作意义候选生成
// 负责人：芮瑄
// 说明：输入当前创作会话 + 用户已确认原则，返回一条意义候选供用户确认/修改/拒绝
//
// ⚠️ 可能变动（紫涵 8/13 同步）：
//   1. 入参可能新增 interview 字段（前期 onboarding 回答 + 上传作品信息）
//   2. timeline 每项可能新增字段（项目详情页相关）
//   3. 出参字段以紫涵确认为准，当前版本按 8/13 沟通格式
//   以上变动不影响函数签名，只改内部逻辑

/**
 * 演示用 Profile（紫涵软件搭好后会给真实匿名数据，替换此常量）
 * confirmedPrinciples: 用户已确认的创作原则，用于约束 AI 不脱离用户自身经验
 */
const DEMO_PROFILE = {
  confirmedPrinciples: [
    '我会先用更小的变量变化验证材料边界',
    '我会警惕作品过早显得完整'
  ]
};

/**
 * 生成意义候选
 * @param {Object} session - 当前创作会话
 * @param {string} session.projectName - 作品名，如 "拼贴实验 01"
 * @param {string} session.sessionId - 会话 ID
 * @param {Array}  session.timeline - 时间线节点
 * @param {string} session.timeline[].timestamp - ISO 时间戳
 * @param {number} session.timeline[].elapsedSeconds - 相对创作开始的秒数
 * @param {string} session.timeline[].visualChange - 视觉变化描述（客观）
 * @param {string} session.timeline[].transcript - 用户语音转写
 * @param {boolean} session.timeline[].userMarker - 是否用户手动标记
 * @param {string[]} session.confirmedPrinciples - 用户已确认的创作原则
 * @param {Object} [profile=DEMO_PROFILE] - 用户 Profile（可选，默认演示数据）
 * @returns {Promise<Object>} MeaningCandidate
 */
export async function generateMeaningCandidate(session, profile = DEMO_PROFILE) {
  // TODO: 接 LLM API（豆包/DeepSeek），prompt 里带上 timeline + confirmedPrinciples
  // TODO: 加降级：API 失败时 return mock 结果，保证演示不中断
  // TODO: 对紫涵的 AI 评测表调 prompt：不超过度推断、不强行励志、必须引用证据

  const timeline = session.timeline || [];
  const principles = profile.confirmedPrinciples || session.confirmedPrinciples || [];
  const latestNode = timeline[timeline.length - 1] || {};

  // ---- observation: 只说事实，不写情绪/动机/人格判断 ----
  let observation;
  if (timeline.length === 0) {
    observation = '本次创作尚未记录到明显变化。';
  } else if (timeline.length === 1) {
    observation = latestNode.visualChange
      ? `你在本次创作中：${latestNode.visualChange}。`
      : '你在本次创作中做了调整。';
  } else {
    const firstChange = timeline[0].visualChange || '开始创作';
    const lastChange = latestNode.visualChange || '继续调整';
    observation = `你从"${firstChange}"开始，过程中${lastChange}。`;
  }

  // ---- reflectionQuestion: 开放式问题，不引导单一答案 ----
  let reflectionQuestion;
  if (latestNode.transcript && latestNode.transcript.includes('太完整')) {
    reflectionQuestion = '你当时是在修正技术问题，还是在让作品从"太完整"变得更有呼吸？';
  } else if (principles.some(p => p.includes('材料边界'))) {
    reflectionQuestion = '这一步是在验证材料的边界，还是在追求某种你想要的感觉？';
  } else {
    reflectionQuestion = '你当时是在修正技术问题，还是在追求某种你想要的感觉？';
  }

  // ---- candidateMeaning: 允许用户确认/修改/拒绝的解释候选 ----
  // 必须用"可能"，不能用"就是"；必须引用证据，不能凭空推断
  let candidateMeaning;
  if (latestNode.transcript && latestNode.transcript.includes('太完整')) {
    candidateMeaning = '这可能不是简单的调整，而是你对"完成感"的一次抵抗。';
  } else if (principles.some(p => p.includes('材料边界'))) {
    candidateMeaning = '这可能不是随机的尝试，而是你在用更小的变量试探材料的边界。';
  } else {
    candidateMeaning = '这可能不是简单的调整，而是你对材料边界的一次试探。';
  }

  // ---- evidence: 引用 timeline 中的实际节点 ----
  const evidence = timeline
    .filter(node => node.visualChange || node.transcript)
    .map(node => ({
      timestamp: node.timestamp || '',
      visualChange: node.visualChange || '',
      transcript: node.transcript || ''
    }));

  return {
    observation,
    reflectionQuestion,
    candidateMeaning,
    evidence,
    privacyLevel: 'private',
    confirmationStatus: 'awaiting_confirmation'
  };
}

/**
 * 手动触发意义生成（用户在 PC 端点"AI 帮我看看"时调用）
 * 与自动生成逻辑相同，保留独立入口以便后续区分触发来源
 */
export async function triggerMeaningOnDemand(session, profile) {
  return generateMeaningCandidate(session, profile);
}