# Whisper Hands ｜ 絮手

> Most creative tools care about what you make. Whisper Hands cares about what happens to you while you are making it.
>
> 大多数创作工具关心你做出了什么；Whisper Hands 关心的是，你在创作过程中经历了什么。

Whisper Hands（絮手）是一个陪伴女性创作者穿过「卡住的时刻」的桌面创作伙伴：它观察过程、理解状态，在恰当的时候给予轻微而不过度的回应。

硬件 Demo 由四部分组成：**T5 摄像头**（桌面画面）+ **ESP32-S3 控制板**（旋钮/敲击/按键事件）+ **Mac 桥接**（收音、存档、转发）+ **本地 Web**（onboarding 宇宙花园 + studio 创作工作台）。

## 团队

| 成员 | 角色 |
|---|---|
| 樊芮瑄（芮瑄） | 算法后端 |
| 紫人 | 硬件实现 / Amazon 市场调研 |
| Nicole | 软件 UI 与 UX 设计 |
| 流星雨（星雨） | 商务增长 |
| Genevieve（紫涵） | onboarding 交互 / 硬件外观设计 |

成员背景与现场分工见 [`docs/team/团队与分工.md`](./docs/team/团队与分工.md)，产品理念与路演文案见 [`docs/product/产品理念与路演文案.md`](./docs/product/产品理念与路演文案.md)。

## 当前进度（2026-08-16）

- **路演已提交**。
- 实机验证通过：T5 出流 ✅、ESP32 敲击传感器 `knock=1` ✅、3D 打印外观 demo（卡扣契合）✅。
- 待完成：双板媒体闭环、Chrome WebM 实机验收、队友后端接入等，见 [`docs/project/项目待办.md`](./docs/project/项目待办.md)。

## 目录导航

| 路径 | 内容 |
|---|---|
| `index.html` / `studio.html` / `prompt-lab.html` | 前端页面（onboarding 入口 / 创作工作台 / Prompt Lab） |
| `js/` / `css/` | 前端脚本与样式 |
| `app/` | 软硬件接入：事件协议、录像/语音标记、本地记录、路演整合 |
| `server.mjs` | Mac 本地桥接服务（AI 端点 + 硬件端点） |
| `backend/kb-and-analyse/` | 队友知识库与分析模块（已合并，尚未接入运行链路） |
| `firmware/` | ESP32/T5 固件源码（脱敏）与校验值 |
| `hardware/docs/` | 主板事实表、接线方案、物料清单、外观设计 |
| `hardware/assets/` | 硬件外观布局图 |
| `docs/project/` | 整体执行计划与当前待办 |
| `docs/team/` · `docs/product/` | 团队分工 · 产品理念 |
| `handoff/` | 当前进度、完整交接与节点快照 |
| `test/` · `tests-onboarding/` | Node 自动测试（63 项） |

## 快速开始

需要 Node.js ≥ 22.13。

```bash
cp .env.example .env   # 填入 AI Key（未配置时走本地 fallback）
npm install
npm start
```

访问 `http://127.0.0.1:8000`。若需让 ESP32 从局域网连到桥接，用 `HOST=0.0.0.0 npm start`。

运行测试：`npm test`（当前 63 项）。

## 烧录与固件

⚠️ **固件源码已脱敏**，编译联网版固件前必须填入热点凭据，详见 [`firmware/WIFI-CREDENTIALS.md`](./firmware/WIFI-CREDENTIALS.md)。留空则 ESP32 以串口测试模式运行、T5 启动即退出。

- 烧录与双板联调步骤见 [`使用说明.md`](./使用说明.md)。
- T5 固件源码改动见 [`firmware/t5-camera/src-patch/README.md`](./firmware/t5-camera/src-patch/README.md)。
- 编译产物 `firmware/**/bin/`（含热点凭据）不入库，仓库保留 [`firmware/CHECKSUMS.sha256`](./firmware/CHECKSUMS.sha256) 供重编后校验。

## 文档地图

1. [`handoff/00_先读_当前进度.md`](./handoff/00_先读_当前进度.md) —— 当前进度唯一入口
2. [`docs/project/整体执行计划与里程碑.md`](./docs/project/整体执行计划与里程碑.md) —— 计划与里程碑
3. [`hardware/docs/NICEMCU-T5-DEV_V1.2_主板事实表.md`](./hardware/docs/NICEMCU-T5-DEV_V1.2_主板事实表.md) —— T5 引脚与板载器件
4. [`firmware/WIFI-CREDENTIALS.md`](./firmware/WIFI-CREDENTIALS.md) —— 固件凭据配置
5. [`backend/kb-and-analyse/技术交接文档_知识库模块.md`](./backend/kb-and-analyse/技术交接文档_知识库模块.md) —— 队友后端接入

## 安全边界

- 真实 WiFi 凭据、Tuya 授权码、`.env` 均不入库；本地凭据留档见 `firmware/esp32-control/include/user_config.secret.h`（已忽略）。
- `hardware/local-tuyaopen/`（约 4GB SDK）、`hardware/private/`、`firmware/**/bin/` 由 `.gitignore` 排除。
- 旧选题、市场调研、旧架构与合并前备份位于本地 `99_归档/`（211MB，未上传）。
- 上传、推送或发布前需团队明确确认。
