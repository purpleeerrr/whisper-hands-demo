# 絮手 Whisper Hands · Onboarding 前端交接

交付日期：2026-08-15

## 当前已完成

- 硬件连接引导与完整 onboarding 场景
- 每颗星球保存后立即进入该星球自己的 AI 追问；回答或跳过后返回六星球页面
- 星球页不显示勾选与填写进度，以轻微提亮区分已填写星球；向左滑动直接进入星星选择页
- 六类星球分别进入审美、关系意义、场景记忆、创作材料、注意方式与语言表达维度；仅“总会注意的细节”进入 Creator Identity 提取
- 已删除中间 AI 候选确认页；选择创作方式后直接进入仙女棒过渡
- Creator Identity Kernel：Fact / Observation / Identity Thread 分层
- 作品上传、本地视觉信号分析、逐件 AI 作品解读及确认/拒绝
- 作品宇宙补充了明确标注的预设交互示例；示例不会进入 Meaning Layer、确认作品数量或持久化数据
- Onboarding 总结页仅保留大标题，并通过“上滑开始创作”进入章鱼加载交接页
- 章鱼从无色逐渐填满颜色，完成后触发 `whisper:handoff-ready` 并兼容 `window.startWhisperSecondHalf()`
- 首页右侧星球与文案整体上移；总结页大标题缩小，改善宽屏上的阅读比例
- 顶部导航仅保留“关于絮手”，并将背景音乐与交互音效拆为独立开关
- 作品宇宙固定加入 12 个明确标注的交互示例
- confirmed-only Meaning Layer 与作品解读导出接口

## 本地启动

需要 Node.js 22.13 或更高版本。

```bash
cp .env.example .env
npm start
```

访问：`http://127.0.0.1:8000`

真实 AI Key 不在交付包中，请通过安全渠道单独获得并填入 `.env`。未配置 Key 时仍可使用本地 fallback 完成流程。

## 给知识库队友的接口

浏览器控制台可读取：

```js
getWhisperHandsMeaningLayer()
getWhisperHandsConfirmedWorks()
```

只使用上述 confirmed-only 输出。不要直接读取浏览器内部 state，也不要把未确认的 AI 推断写入知识库。

字段与隐私边界见 `MEANING-LAYER-CONTRACT.md`。

## 验证

```bash
npm test
```

当前应通过 38 项测试。

## 安全边界

- 包内不含 `.env`、API Key、私人 Profile 或 Ask Genevieve 主项目内容。
- AI inference 不等于事实，必须经过用户确认。
- 被拒绝或未确认的内容不得进入长期 Kernel 或外部知识库。
- 作品图片目前仅用于浏览器会话预览，不进入 confirmed-only 导出。
