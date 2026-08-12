# 技术协作说明

## 流程和数据对象

```text
Template / 自由语音 → Project → DeviceEvent → InboxItem → CandidateRecord → ConfirmedRecord
                                                                         ↓
                          ConfirmedPrinciple ← MeaningCandidate ← 用户主动调用
                                                                         ↓
                    ReferenceCard ← RecallNotification ← 材料／画面／时间线索
```

| 对象 | 关键内容 |
|---|---|
| `Template` | 官方模板、用户副本或从候选结构保存的新模板 |
| `Project` | 当前选用模板及字段值 |
| `DeviceEvent` | `event_id`、`template_id`、`project_id`、按键类型、发生时间 |
| `InboxItem` | 私密原始过程记录，可附图、音频、文字 |
| `CandidateRecord` | AI／规则提出的结构化候选，需用户确认 |
| `ConfirmedRecord` | 进入个人实验库，可搜索和参与回顾 |
| `RecallNotification` | 由模板字段匹配生成，用户可查看、忽略或关闭 |
| `MediaEvidence` | 图片或短视频，与一次“留一刻”同时入箱 |
| `AudioEvidence` | 原始录音、可编辑转写、真实采集来源和状态 |
| `MeaningCandidate` | 已确认事实之上的反思问题与意义候选，需用户复核 |
| `ConfirmedPrinciple` | 用户确认的创作原则，保留对应事实回链 |
| `Reminder` | 由用户设定的回看时间触发 |
| `VisualMatch` | 查询图与已确认图片的本地相似度结果 |

## P0 交接：独立个人实验库（当前未完成）

当前主页里的“事实记录／创作原则／找回线索”只承担信息架构预览。它还不能作为完整的个人实验库交付。

完整版本需要拆成独立页面，并形成三层结构：

1. **实验库列表**：展示所有已确认记录，支持关键词搜索，并可按模板／创作门类、材料、日期、结果、媒体类型和 Meaning 状态筛选；
2. **记录详情**：保留原始语音、转写、图片／视频、确认后的事实字段、模板、时间和来源；
3. **单条记录提炼工作区**：对这一条记录单独生成反思问题、意义候选和证据，用户可编辑、确认、稍后或丢弃；确认后的原则继续回链原始事实和证据。

主页只保留最近记录、数量摘要和“进入个人实验库”入口。未确认的收件箱内容不能出现在实验库搜索结果中。

建议路由：`library.html` 或 `#/library`；记录详情使用 `#/library/{record_id}`。所有入口与资源继续使用相对路径，保证 GitHub 下载后可直接运行。

验收标准：

- 至少准备 10 条跨多次实验的演示记录，可独立浏览；
- 搜索“蓝釉”能返回相关事实、原则和找回线索，并解释命中原因；
- 点击搜索结果可以进入记录详情；
- 每条记录都有独立提炼板块，原则可回到对应事实、语音或画面证据；
- 刷新独立页面后状态可以恢复，直接访问路由不会空白；
- 主页不再承担完整实验库的列表、检索和提炼操作。

## 最小接口

- `GET /templates`：列出官方和用户模板；
- `POST /templates/{id}/fork`：复制模板；
- `POST /templates/from-candidate`：把自由语音整理出的候选结构保存为模板；
- `POST /projects`：建立项目；
- `POST /device-events`：接收网页或硬件“留一刻”事件；
- `GET /inbox-items`：展示过程收件箱；
- `POST /inbox-items/{id}/shape`：生成候选记录；
- `POST /candidate-records/{id}/confirm`：确认入库；
- `POST /records/{id}/meaning-candidates`：对已确认事实主动生成意义候选；
- `POST /meaning-candidates/{id}/confirm`：保存用户确认的创作原则；
- `POST /context/changed`：当前字段改变时检查回顾；
- `POST /recalls/{id}/action`：查看、忽略或关闭。

## 实现约束

- 网页按钮与 AI Keyboard 发送同一套 `DeviceEvent`：`MARK_PRESSED`、`VOICE_CAPTURE_STARTED`、`VOICE_CAPTURE_STOPPED`；
- `event_id` 全局去重，避免按键重发导致重复记录；
- 先保存事件与收件箱，再处理可选媒体；
- 个人记录和公共参考资料分表保存；
- 黑客松可以用本地 SQLite 或浏览器本地存储，账户和云同步不在本轮。
- 当前视觉检索使用 64-bit dHash，只作为本地 Demo 的图像相似度基线。
- 浏览器端已支持 F8、F9 和 Web Serial。原始录音保存在浏览器本地；可选浏览器转写会先询问用户。开发板固件、键位引脚、板载麦克风和声光回执需真机验收。详见 [硬件交互说明](./HARDWARE_INTEGRATION.md)。

设备事件 JSON 参考：

```json
{
  "event_id": "evt_demo_001",
  "type": "mark_pressed",
  "occurred_at": "2026-08-14T10:00:00Z",
  "payload": {
    "template_id": "tpl_ceramic_glaze_v1",
    "project_id": "project_blue_cup",
    "press_duration_ms": 180
  }
}
```
