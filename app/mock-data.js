// mock-data.js — 测试用假数据
// 前端联调时 import 这个文件，调一次 seedMockData() 就能在时光库看到数据
//
// 用法：
//   import { seedMockData, clearMockData } from "./mock-data.js";
//   await seedMockData();   // 填充3条假项目
//   await clearMockData();  // 清空

import { saveSession } from "./storage.js";
import { embedSession } from "./semantic-search.js";

export async function seedMockData() {
  const now = Date.now();
  const day = 86400000;

  const sessions = [
    {
      id: "mock_001",
      name: "粘土手作",
      tags: ["陶艺", "手作", "探索"],
      mode: "explore",
      createdAt: now - 2 * 3600000,
      updatedAt: now - 3600000,
      embedding: null,
      summary: "你在尝试不同材质的粘土，过程中多次推翻重来，最终找到了满意的质感。",
      principles: ["我会先用更小的变量变化验证材料边界"],
      files: [
        {
          id: "f1", type: "image", blob: null,
          timestamp: now - 2 * 3600000, elapsedSeconds: 60,
          note: "开始揉泥", transcript: "", visualChange: "画面中间发生了变化（变化率15%）",
          mode: "explore"
        },
        {
          id: "f2", type: "marker", blob: null,
          timestamp: now - 1.5 * 3600000, elapsedSeconds: 1800,
          note: "这个纹理有意思", transcript: "", visualChange: "",
          mode: "explore"
        },
        {
          id: "f3", type: "audio", blob: null,
          timestamp: now - 3600000, elapsedSeconds: 3600,
          note: "", transcript: "换成更轻的纸，粘土太厚重了", visualChange: "",
          mode: "explore"
        }
      ]
    },
    {
      id: "mock_002",
      name: "拼贴实验 01",
      tags: ["拼贴", "创作"],
      mode: "create",
      createdAt: now - 3 * day,
      updatedAt: now - 3 * day + 2 * 3600000,
      embedding: null,
      summary: "你在保留结构的同时替换了颜色，这可能是对完成感的一次抵抗。",
      principles: ["我会警惕作品过早显得完整"],
      files: [
        {
          id: "f4", type: "image", blob: null,
          timestamp: now - 3 * day, elapsedSeconds: 120,
          note: "", transcript: "", visualChange: "画面左侧发生了变化（变化率23%）",
          mode: "create"
        },
        {
          id: "f5", type: "audio", blob: null,
          timestamp: now - 3 * day + 1800000, elapsedSeconds: 1920,
          note: "", transcript: "结构可以，但它现在太完整了", visualChange: "",
          mode: "create"
        }
      ]
    },
    {
      id: "mock_003",
      name: "银戒指蜡模",
      tags: ["首饰", "金工", "执行"],
      mode: "execute",
      createdAt: now - 10 * day,
      updatedAt: now - 10 * day + 4 * 3600000,
      embedding: null,
      summary: "",
      principles: [],
      files: [
        {
          id: "f6", type: "image", blob: null,
          timestamp: now - 10 * day, elapsedSeconds: 300,
          note: "蜡模初版", transcript: "", visualChange: "画面中间发生了变化（变化率18%）",
          mode: "execute"
        },
        {
          id: "f7", type: "video", blob: null,
          timestamp: now - 10 * day + 3600000, elapsedSeconds: 3900,
          note: "", transcript: "", visualChange: "",
          mode: "execute"
        }
      ]
    }
  ];

  for (const s of sessions) {
    await saveSession(s);
    try {
      await embedSession(s);
      await saveSession(s);
    } catch (e) {
      // 模型没加载好也没关系，降级模式下关键词搜索也能用
    }
  }

  console.log(`[Mock] 已填充 ${sessions.length} 条测试数据`);
}

export async function clearMockData() {
  const { deleteSession, getAllSessions } = await import("./storage.js");
  const all = await getAllSessions();
  for (const s of all) {
    if (s.id.startsWith("mock_")) await deleteSession(s.id);
  }
  console.log("[Mock] 已清空测试数据");
}
