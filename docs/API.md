# Meaning Adapter 接口文档

> 版本：v0.1（2026-08-13）
> 负责人：芮瑄
> 模块文件：`app/meaning.js`

## 概述

Meaning Adapter 接收当前创作会话数据和用户已确认的创作原则，返回一条**意义候选**（MeaningCandidate），由用户确认、修改或拒绝。AI 只提供候选，不替用户下结论。

## 调用方式

​```javascript
import { generateMeaningCandidate } from './meaning.js';

const result = await generateMeaningCandidate(session, profile);
​```

## 入参

### session（必填）

| 字段 | 类型 | 说明 |
|---|---|---|
| projectName | string | 作品名，如 `"拼贴实验 01"` |
| sessionId | string | 会话 ID |
| timeline | array | 时间线节点列表，见下方 |
| confirmedPrinciples | string[] | 用户已确认的创作原则（可选，profile 里有就不用传） |

### timeline[] 每项

| 字段 | 类型 | 说明 |
|---|---|---|
| timestamp | string | ISO 时间戳 |
| elapsedSeconds | number | 相对创作开始的秒数 |
| visualChange | string | 视觉变化的客观描述 |
| transcript | string | 用户语音转写文字 |
| userMarker | boolean | 是否用户手动标记 |

### profile（可选）

| 字段 | 类型 | 说明 |
|---|---|---|
| confirmedPrinciples | string[] | 用户已确认的创作原则 |

不传时使用内置 DEMO_PROFILE。

## 返回值

| 字段 | 类型 | 说明 |
|---|---|---|
| observation | string | 客观事实复述，只描述证据中实际发生的变化 |
| reflectionQuestion | string | 开放式复盘问题 |
| candidateMeaning | string | 意义解释候选，用"可能"不用"就是" |
| evidence | array | 支撑该候选的证据节点列表 |
| privacyLevel | string | 隐私级别，当前固定 `"private"` |
| confirmationStatus | string | 确认状态，当前固定 `"awaiting_confirmation"` |

## 设计约束

1. 观察不等于意义：observation 只说事实
2. AI 理解只能是候选：用"可能"，不替用户下结论
3. 必须引用证据
4. 不强行励志
5. 不超过度推断

## 可能变动

1. interview 字段（onboarding 回答+上传作品）可能加入入参
2. timeline 可能新增字段（项目详情页）
3. confirmedPrinciples 来源可能变化（AI 个人实验库）

以上不影响函数签名和返回格式。

## 降级

LLM API 失败时自动返回 mock 结果，前端不需要处理错误。