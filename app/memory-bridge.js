// memory-bridge.js — 把 NOW 页保存的 SessionRecord 同步到队友知识库 kb.js
// 方案 A 最小侵入:NOW 现有 SessionStore 不动,只在 NOW 完成一次创作后,
// 把同一份数据写一份给 kb.js,让 MEMORY 页可以用 searchProjects/exportMarkdown。
//
// 红线:
// - 不改 kb.js / storage.js / semantic-search.js / desk-layer-analyzer.js
// - 所有调用 try/catch,失败 console.error,不影响 NOW 主流程
// - 数据落 IndexedDB,禁无痕模式

import {
  initKB,
  isKBReady,
  createSession,
  saveSnapshot,
} from './kb.js';

/**
 * 判断 kb.js 是否可用(IndexedDB 隐私模式等场景会失败)
 * 调用方在每次同步前都问一次,失败就跳过,绝不抛错。
 */
export async function isMemoryBridgeAvailable() {
  try {
    await initKB();
    return isKBReady();
  } catch (error) {
    console.warn('[MemoryBridge] kb.js 不可用,本次跳过同步', error);
    return false;
  }
}

/**
 * 把 NOW 完成的一次创作镜像到 kb.js
 * @param {object} record — buildSessionRecord 的产物:
 *   { sessionId, title, startedAt, durationMs, videoBlob,
 *     snapshots:[{id,atMs,blob}], audioMarks, transcript:[{...}], events, templateId }
 * @returns {string|null} kb.js 侧的 sessionId,失败返回 null
 */
export async function mirrorRecordToKB(record) {
  if (!record || !record.videoBlob) {
    console.warn('[MemoryBridge] record 无效,跳过');
    return null;
  }
  try {
    const ready = await isMemoryBridgeAvailable();
    if (!ready) return null;

    // 在 kb.js 里建一条对应会话,带上原 sessionId 作为 tag,方便后期反查
    const sessionName = record.title || '未命名创作';
    const tags = ['mirror', `src:${record.sessionId}`, `template:${record.templateId || 'default'}`];
    const session = await createSession(sessionName, 'create', tags);
    const kbSessionId = session.id;

    // 1) 主录像
    await saveSnapshot(kbSessionId, {
      type: 'video',
      blob: record.videoBlob,
      note: `完整录像 · ${Math.round((record.durationMs || 0) / 1000)}s`,
    });

    // 2) 留一刻截图
    if (Array.isArray(record.snapshots)) {
      for (const shot of record.snapshots) {
        if (!shot?.blob) continue;
        await saveSnapshot(kbSessionId, {
          type: 'image',
          blob: shot.blob,
          note: `留一刻 @ ${formatMs(shot.atMs)}`,
        });
      }
    }

    // 3) 语音转写(transcript 是按段文字,逐条 marker 存,方便搜索)
    if (Array.isArray(record.transcript)) {
      for (const seg of record.transcript) {
        const text = (seg?.text || '').trim();
        if (!text) continue;
        await saveSnapshot(kbSessionId, {
          type: 'marker',
          transcript: text,
          note: seg?.priority ? '重点语音' : '普通转写',
        });
      }
    }

    console.log(`[MemoryBridge] 已镜像到 kb.js: ${kbSessionId}`);
    return kbSessionId;
  } catch (error) {
    console.error('[MemoryBridge] 镜像失败,NOW 主流程不受影响', error);
    return null;
  }
}

function formatMs(ms) {
  const sec = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}
