// app/meaning.js

// 输入：一条已确认的事实记录
// 输出：MeaningCandidate

export async function generateMeaningCandidate(record) {
  // TODO: 接 LLM API，现在先返回 mock
  return {
    id: "mc_" + Date.now(),
    record_id: record.id,
    observation: `你记录了${record.fields.observation || "一次观察"}。`,
    question: "这次实验里，你最想验证的是什么？",
    candidate_meaning: "你在用更小的变量变化来试探材料的边界。",
    evidence: [
      { type: "field", ref: "observation", text: record.fields.observation },
      { type: "voice", ref: record.audio_id, text: record.transcript }
    ],
    status: "AWAITING_CONFIRMATION",
    created_at: new Date().toISOString()
  };
}

