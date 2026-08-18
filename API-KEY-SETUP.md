# API Key 本地配置

不要把真实 API Key 发到聊天、截图或交付压缩包中。

1. 在项目根目录复制 `.env.example`，并将副本命名为 `.env`。
2. 用记事本打开 `.env`，只在本机填写：

```env
AI_CHAT_COMPLETIONS_URL=https://api.magikcloud.cn/v1/chat/completions
AI_MODEL=glm-5.2
AI_API_KEY=在这里填写真实密钥
AI_TIMEOUT_MS=15000
```

3. 保存后重新启动本地预览服务。
4. 启动信息显示 `AI adapter: enabled` 即表示服务器已读取配置。

`.env` 已被 `.gitignore` 排除。打包或转交项目时，仍需人工确认压缩包中没有 `.env`。
