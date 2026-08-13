# Whisper Hands 四层网页

这是当前 PC 端四层结构视觉原型的可编辑源码。

## 目录

- `index.html`：页面结构
- `css/styles.css`：视觉样式、动画与字体声明
- `js/app.js`：交互、拖拽、文件夹与详情逻辑
- `assets/fonts/`：中英文字体文件

## 后续接后端

当前页面仍是前端原型，数据主要保存在浏览器运行时/本地逻辑中。后续开发可以在 `js/app.js` 中把记录读取、保存、搜索、文件夹管理等逻辑替换为 API 请求，不需要重做视觉层。建议后端接入时再逐步拆分 `app.js` 为 `api.js`、`storage.js`、`records.js` 等模块。

## 说明

本目录保留当前视觉和四层交互，不使用压缩补丁或 Base64 字体内嵌，便于 GitHub 上继续维护、Code Review 与后端联调。
