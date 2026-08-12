# Whisper Hands｜模板化知识库 Demo 技术规格 v0.2

## 1. 当前 Demo 做什么

本地单用户 Demo 跑通以下路径：选择「陶艺釉料测试」模板 → 短按硬件留下画面 → 长按硬件录制语音观察 → 原始声音、转写、画面进入私密过程收件箱 → 用户确认事实候选 → 记录进入个人实验库 → 用户可主动调用 Meaning Layer 并确认意义候选 → 下一次选择同一釉料时出现有理由的回顾卡。

水彩配色实验与玻璃烧制记录作为可选择、可查看、可复制修改的模板展示。自由语音入口允许用户跳过字段配置，直接口述完整记录，再复核系统整理出的候选结构并保存为模板。

系统不做账户、云同步、连续录像、自动动作识别、AI 工艺诊断或公共社区。自由语音整理在 Demo 中使用本地规则；由外部模型动态生成专业模板字段留到后续版本。

## 2. 架构原则

1. 专业模板可以预先决定字段、阶段和回顾条件；自由语音入口允许先采集、后整理。设备只负责发出“留一刻”和语音事件及即时反馈。
2. 原始过程素材、AI 候选、用户确认记录、公共参考资料使用不同数据对象和页面。
3. 所有主动回顾都显示触发原因，且由用户选择、模板字段或用户设置时间触发。
4. 个人实验库只存用户确认内容；公共参考不写入个人记录，也不作为 AI 诊断依据。
5. 网页模拟按钮与实体键发送同一种意图事件。短按对应画面标记，长按开始语音、松开结束语音。
6. 摄像头、麦克风、语音转写与 Meaning Layer 均可替换或失效降级；原始事实记录可以独立完成。
7. Meaning Layer 只接受已确认事实记录，并由用户主动调用。每条输出保留证据引用、状态和最终决定。

## 3. 系统结构

```text
网页模拟按钮 / AI Keyboard / Tuya 板
       │ MARK_PRESSED / VOICE_CAPTURE_STARTED / VOICE_CAPTURE_STOPPED
                 ▼
        Workbench + Capture Service
                 │
                 ▼
          Process Inbox（私密原始素材）
                 │ 用户选择“整理”
                 ▼
       Factual Candidate（模板填充 / 自由语音整理）
                 │ 用户编辑确认
                 ▼
      Personal Practice Library（个人实验库）
          ┌──────────────┼───────────────────┐
          ▼              ▼                   ▼
 Meaning Adapter   Template Registry    Reference Shelf
 用户主动调用       官方模板 / 用户副本   有来源的公共参考卡
          │
          ▼
 Meaning Candidate（问题 + 候选意义 + 证据）
          │ 用户保留 / 修改 / 稍后 / 放弃
          ▼
 Confirmed Principle（个人创作原则）
                         │
                         ▼
          Template-aware Recall Engine
       材料选择 / 项目打开 / 用户设定时间
                         ▼
          可查看、忽略、稍后、关闭的提示卡
```

## 4. 核心数据对象

| 对象 | 作用 | 何时产生 | 是否参与主动回顾 |
|---|---|---|---|
| Template | 官方结构、用户副本或由候选结构保存的模板 | 安装种子数据、用户复制或确认候选结构 | 提供字段与规则 |
| ProcessInboxItem | 一次按键产生的原始图片、音频、文字、时间 | 用户按“留一刻”时 | 否 |
| AudioEvidence | 原始声音、转写、采集来源和转写状态 | 长按开始、松开结束并完成转写时 | 否 |
| CandidateRecord | AI 或规则按模板整理出的事实候选字段 | 用户主动整理收件箱时 | 否 |
| ConfirmedRecord | 用户确认后的个人经验 | 用户点击确认时 | 是 |
| MeaningCandidate | 一个反思问题、一条候选意义、证据引用和确认状态 | 用户在已确认事实记录上主动调用 | 否 |
| ConfirmedPrinciple | 用户确认后的个人创作原则 | 用户保留或修改意义候选后确认 | 可选参与 |
| ReferenceCard | 有来源的公共专业资料 | 官方模板种子数据 | 只作参考显示 |
| RecallNotification | 一次可解释的回顾提示 | 满足模板回顾条件时 | 记录用户动作 |

### Template 定义

Demo 用 JSON 保存模板定义，便于复制和修改，无需在黑客松实现复杂表单设计器。每份模板至少包含：

```json
{
  "name": "陶艺釉料测试",
  "fields": [
    {"key": "clay_body", "label": "泥料", "type": "text", "required": true},
    {"key": "glaze", "label": "釉料", "type": "text", "required": true, "recall_key": true},
    {"key": "coats", "label": "施釉层数", "type": "number"},
    {"key": "firing", "label": "烧制条件", "type": "text"},
    {"key": "observation", "label": "观察", "type": "textarea"},
    {"key": "result", "label": "结果", "type": "choice", "options": ["等待结果", "符合预期", "需要调整"]}
  ],
  "stages": ["上釉", "等待烧制", "记录结果"],
  "recall": {"on_field_change": ["glaze"], "max_once_per_session": true}
}
```

用户复制模板后可改名称、字段名、字段类型、选项、阶段和回顾字段；不可编辑官方模板原件。自由语音入口在采集前保持空字段，整理后生成可编辑候选结构，用户可将其保存为新模板。模板升级以新副本保存，旧记录继续绑定原版本。

## 5. Demo 页面

| 页面 | 用户看到什么 | 必须完成的动作 |
|---|---|---|
| 模板页 | 自由语音入口、陶艺／水彩／玻璃模板卡、复制模板入口 | 直接开始说，或选择／复制专业模板 |
| 工作台 | 当前项目、模板字段、镜头、按键状态、语音录制状态 | 短按留画面；长按说观察；松开结束 |
| 过程收件箱 | 原始声音播放器、转写、图片／视频、采集来源、时间 | 重录或修改转写；发起事实整理 |
| 事实候选页 | 模板字段、原始证据、AI/规则候选、编辑与确认 | 修改并确认一条事实记录 |
| 我的实验库 | 事实记录、创作原则、找回线索三层；原则回链事实 | 查看事实与原则来源；用材料、画面或时间找回 |
| 意义复核卡 | 一个反思问题、一条意义候选、证据引用、决定按钮 | 保留、修改、稍后或放弃 |
| 参考架 | 参考卡标题、摘要、来源、适用范围 | 查看陶艺测试记录说明 |
| 回顾提示卡 | “为什么出现”、个人历史摘要、查看／忽略／关闭 | 查看一条同釉料的历史记录 |

## 6. API 与事件边界

| 方法 | 路径 | Demo 行为 |
|---|---|---|
| GET | `/api/templates` | 返回官方模板与用户模板副本 |
| POST | `/api/templates/{id}/fork` | 复制官方模板，返回可编辑用户模板 |
| POST | `/api/templates/from-candidate` | 把自由语音整理出的候选结构保存为用户模板 |
| PATCH | `/api/templates/{id}` | 更新用户模板定义 |
| POST | `/api/projects` | 用模板创建项目 |
| POST | `/api/device-events` | 接收 `MARK_PRESSED`、`VOICE_CAPTURE_STARTED`、`VOICE_CAPTURE_STOPPED` |
| GET | `/api/inbox` | 读取过程收件箱 |
| POST | `/api/inbox/{id}/shape` | 用规则或 AI 生成候选记录 |
| PATCH | `/api/candidates/{id}` | 编辑候选记录字段 |
| POST | `/api/candidates/{id}/confirm` | 生成个人实验库记录 |
| POST | `/api/records/{id}/meaning-candidates` | 对已确认事实记录主动调用 Meaning Layer |
| PATCH | `/api/meaning-candidates/{id}` | 修改候选意义或处理状态 |
| POST | `/api/meaning-candidates/{id}/confirm` | 保存个人创作原则 |
| GET | `/api/records` | 按模板和字段筛选已确认记录 |
| POST | `/api/context` | 更新当前项目／模板字段，检查回顾条件 |
| GET | `/api/recalls/pending` | 获取待展示的回顾提示 |
| POST | `/api/recalls/{id}/action` | 查看、忽略、稍后或关闭 |
| GET | `/api/references?template_id=` | 读取模板参考架 |

设备只发送意图事件。短按示例：

```json
{
  "schema_version": "1.0",
  "event_id": "evt_demo_001",
  "device_id": "web-demo",
  "type": "MARK_PRESSED",
  "occurred_at": "2026-08-14T10:15:00+08:00",
  "payload": {"project_id": "proj_blue_cup", "template_id": "tpl_ceramic_glaze_v1"}
}
```

长按语音示例：

```json
{"event_id":"evt_voice_001","type":"VOICE_CAPTURE_STARTED","occurred_at":"2026-08-14T10:15:05+08:00"}
{"event_id":"evt_voice_002","type":"VOICE_CAPTURE_STOPPED","occurred_at":"2026-08-14T10:15:11+08:00"}
```

板载麦克风通过真机验证前，事件来源标记为 AI Keyboard，声音来源标记为电脑／USB 麦克风。浏览器演示使用 F8 短按模拟留画面，按住 F9 模拟开始说观察，松开 F9 模拟结束。

## 7. 陶艺 Demo 数据

### 官方模板

`tpl_ceramic_glaze_v1`：陶艺釉料测试。字段为泥料、釉料、施釉方式、层数、烧制条件、观察、结果、下次实验。

### 演示项目与过程记录

| 数据 | 演示内容 |
|---|---|
| 项目 | 蓝色杯子试片 |
| 泥料 | 白色石器泥 |
| 釉料 | 深海蓝透明釉 |
| 当前阶段 | 上釉 |
| 原始记录 | 一张杯沿出现釉料堆积的演示图；原始语音与转写：“第三层釉料在杯沿堆积，下次先试两层。” |
| 候选记录 | 层数 3；观察为杯沿堆积；结果为等待烧制；下次实验为尝试 2 层 |
| 意义候选 | 反思问题：“你为什么决定先减少层数？”；候选意义：“我会先用更小的变量变化验证材料边界。”；证据引用本次确认事实和语音 |
| 已确认旧记录 | 同一釉料、2 层、烧制后颜色均匀的虚构历史记录 |
| 回顾触发 | 工作台再次选择“深海蓝透明釉” |

### 参考架种子卡

1. `记录釉料开发`：说明试验记录、编号和变量对照的重要性；来源为 [Ceramic Arts Network：Recording Glaze Development](https://ceramicartsnetwork.org/pottery-making-illustrated/pottery-making-illustrated-article/Recording-Glaze-Development)。
2. `管理釉料测试记录`：说明测试记录可以关联配方、泥料、施釉与烧制条件；来源为 [Ceramic Arts Network：Data Management](https://ceramicartsnetwork.org/ceramics-monthly/ceramics-monthly-article/tips-and-tools-data-management)。

参考卡展示来源链接和“供记录参考，不能代替工艺判断”的边界。Demo 不生成化学、安全、配方或食品安全建议。

## 8. 状态与故障

```text
语音：IDLE → RECORDING → TRANSCRIBING → REVIEW_READY
                                  └→ FAILED / TEXT_FALLBACK

收件箱：CAPTURED → READY_TO_SHAPE → CANDIDATE_READY → CONFIRMED
                                 └→ PARTIAL / NEEDS_INPUT / DISCARDED

意义：NOT_REQUESTED → GENERATING → AWAITING_CONFIRMATION
                                ├→ CONFIRMED
                                ├→ DEFERRED
                                └→ DISCARDED

回顾：QUEUED → PRESENTED → OPENED
                       ├→ DISMISSED
                       ├→ SNOOZED
                       └→ DISABLED
```

| 情况 | 应有行为 |
|---|---|
| 图片、音频或 AI 失败 | 原始事件继续存在于收件箱；用户可补文字、重试或手工确认 |
| 用户未确认候选 | 保留在收件箱；不可出现在实验库或回顾中 |
| 麦克风权限被拒绝 | 保留短按画面和项目快照；开放手动文字输入 |
| 转写失败 | 保留原始声音；允许重试转写或手工补文字 |
| Meaning Layer 失败或超时 | 已确认事实记录保持可用；用户可稍后重试 |
| 未确认的事实记录请求 Meaning Layer | 拒绝请求，不生成意义候选 |
| 用户关闭模板回顾 | 只关闭该模板的该字段规则；不删除个人记录 |
| 相同材料连续触发 | 单个工作台会话最多提示一次 |
| 用户复制模板 | 新模板和旧模板记录独立；原模板不被改动 |

## 9. 验收标准

1. 用户可以选择陶艺模板并复制修改字段，也可以直接进入自由语音记录而无需预设字段；
2. 短按网页／硬件入口后，收件箱生成且只生成一条画面记录；
3. 长按入口开始录音，松开结束；收件箱展示原始声音、转写和采集来源；
4. 记录可在没有图片、没有音频、没有转写或没有 AI 的情况下继续被手工确认；
5. Meaning Layer 在事实确认前不可调用；确认后由用户主动调用并生成带证据的候选；
6. 用户确认后的事实记录进入实验库事实层；用户确认后的意义进入原则层并回链事实；
7. 用户再次选择同一釉料时，出现一条带触发原因的回顾提示；
8. 水彩和玻璃模板可以打开并展示不同字段；
9. 公共参考卡、个人事实和个人创作原则在界面中有明确来源标识；
10. 90 秒内可完成陶艺模板的“记录 → 事实确认 → 可选意义确认 → 回顾”路径，连续演示 3 次成功。

