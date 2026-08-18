# Whisper Hands · 完整网站

这是已经拼合完成的絮手网站：从宇宙花园 onboarding 连续进入 PC 创作过程工作台。

## 文件结构

- `index.html`：页面结构、文案和各场景 DOM
- `studio.html`：后半部分创作工作台（NOW / MEMORY / REVIEW / SETTING）
- `css/styles.css`：全部视觉样式、排版、像素效果与 CSS 动画
- `js/app.js`：页面切换、Canvas 星球/星空、鼠标交互、音效、上传等脚本
- `js/stitch.js`、`js/studio-bridge.js`：前后半段转场、衔接标记和返回入口
- `js/meaning-layer.js`：onboarding 本地状态、候选确认边界与 confirmed-only Meaning Layer
- `assets/images/`：后续放图片素材的位置

Meaning Layer 的字段与隐私边界见 `MEANING-LAYER-CONTRACT.md`。

## 如何启动（真实 AI）

这个版本必须通过本地 Node 服务启动，API Key 只存在服务端，浏览器无法读取。

1. 复制 `.env.example` 为 `.env`。
2. 只在本地 `.env` 的 `AI_API_KEY=` 后粘贴主办方密钥，不要提交或发给前端。
3. 启动 Demo：

```bash
npm start
```

然后访问 `http://127.0.0.1:8000`。

Windows 也可以直接双击 `启动本地预览.bat`，它会启动服务并打开完整网站。

Prompt 调试入口：`http://127.0.0.1:8000/prompt-lab.html`。它与正式 onboarding 隔离，不写入 Meaning Layer；查看标准答案不调用 API，只有明确点击“运行一次 AI”才发送一次匿名测试请求。

当前默认配置：

- Base URL：`https://api.magikcloud.cn/v1`
- Chat Completions：`https://api.magikcloud.cn/v1/chat/completions`
- Model：`glm-5.2`

如果主办方临时更换网关或模型，只修改本地 `.env`。接口超时、返回格式异常或未配置密钥时，页面会自动切换到本地规则，保证现场流程仍能走完。

## 常用修改位置

- 改文字：优先在 `index.html` 搜索对应中文文案
- 改字号/颜色/布局：`css/styles.css`
- 改星球、花朵、星轨、转场、鼠标反馈：`js/app.js`

## 字体说明

当前像素字体通过 CSS 中的在线字体地址加载；联网时会显示 FusionPixel，离线时会自动使用系统备用字体。没有把字体文件打进压缩包。

## 数据地基检查

```bash
npm test
```

当前图片只在浏览器会话中预览；本地持久化只保存文件名、类型和大小，不保存图片本体。浏览器控制台可调用 `getWhisperHandsMeaningLayer()`，读取只含用户已确认 Meaning Slice 的对接数据。

## 当前 onboarding 理解循环

1. 用户从六类线索中选择一个入口，并留下文字或图片。
2. 服务端 AI 根据当前最小必要信息提出一个轻量追问；失败时使用本地追问。
3. 用户选择最先注意的部分和目前认同的创作方式。
4. 服务端 AI 生成最多三条 Meaning Slice 候选；失败时使用本地候选。
5. 用户可以确认、改写、拒绝或稍后处理。
6. 只有确认或改写后的内容进入 confirmed-only Meaning Layer。

AI 默认自动参与，不设置额外勾选框。界面会透明提示数据范围：当前文字、追问回答、结构化选择和最少量已确认 Meaning Slice 会发送给 AI；图片本体暂不发送。AI 结果永远先作为候选，未经用户确认不会进入 Meaning Layer。

服务端不会发送完整 Profile、原始历史故事、作品图片或 Ask Genevieve 的完整 Prompt，也不会记录 API Key 与用户原文。

## 前后半段衔接

前半段完成页上滑后，章鱼填色结束会直接进入 `studio.html` 的 NOW“正在创作”界面，不再显示中间提示页。后半段会预先载入在同一页面中，因此前半段的背景音乐可以连续播放。衔接过程只传递已确认条目和作品的数量，不复制用户原始文字或图片。工作台右下角的“宇宙花园”按钮可以回到完整网站起点。

直接双击 `index.html` 也可以体验本地规则版；需要真实 AI 时按上面的本地服务方式启动。
