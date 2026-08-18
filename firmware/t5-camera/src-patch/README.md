# T5 摄像头固件源码补丁（Whisper Hands）

T5 摄像头固件基于 [TuyaOpen SDK](https://github.com/tuya/tuyaopen) 的
`examples/peripherals/camera/output_web` 示例修改而来。完整 SDK 约 4GB（本地保留、
git 忽略），本目录只收录**相对上游改动的文件**，足以重建同一固件。

## 相对上游的改动清单

| 文件 | 改动 |
|---|---|
| `examples/peripherals/camera/output_web/src/example_camera_web.c` | ① WiFi 凭据从硬编码改为 Kconfig 注入（`WH_WIFI_SSID` / `WH_WIFI_PASSWORD`）；② 新增 `CAMERA_NAME` 宏默认值；③ 新增 `GET /snapshot` 端点（返回单帧 JPEG，供诊断）；④ 启动时检查 SSID 为空则报错退出 |
| `examples/peripherals/camera/output_web/Kconfig` | 新增 `WH_WIFI_SSID` / `WH_WIFI_PASSWORD` 配置项（默认空） |
| `examples/peripherals/camera/output_web/app_default.config` | 板型选择 + 热点参数（**已脱敏**，SSID/密码置空） |
| `boards/T5AI/SPARKLEIOT_T5AI_DEV/board_com_api.c` | 摄像头注册改为 `WH_CAMERA_OV2640` 条件编译，支持 OV2640 / GC2145 二选一；新增 `CAMERA_NAME` 宏默认值 |
| `apps/tuya_cloud/switch_demo/app_default.config` | 板型选择（SPARKLEIOT_T5AI_DEV） |

## 如何重建固件

1. 克隆 TuyaOpen SDK 到本地（约 4GB），切换到本补丁对应的基线提交。
2. 将本目录下的文件**按相对路径覆盖**到 SDK 对应位置。
3. 填入热点凭据：编辑 `examples/peripherals/camera/output_web/app_default.config`，
   设置 `CONFIG_WH_WIFI_SSID` 与 `CONFIG_WH_WIFI_PASSWORD`（见 `../../WIFI-CREDENTIALS.md`）。
4. 按 TuyaOpen 构建流程编译：`cd examples/peripherals/camera/output_web && tos.py build`。
5. 产物应为 `WhisperHands_T5_camera_QIO_1.0.0.bin`（QIO 版本），SHA-256 见 `../../CHECKSUMS.sha256`。

## 硬件事实（实测）

- 主控：NICEMCU-T5-DEV V1.2（T5AI / 涂鸦 XH-WB5E，非 ESP32）。
- 摄像头：GC2145（默认，非 OV2640）；`WH_CAMERA_OV2640` 用于切换 OV2640。
- 监视波特率：460800（T5AI 平台标准）。
- 完整引脚/板载器件见 `../../hardware/docs/NICEMCU-T5-DEV_V1.2_主板事实表.md`。
