# 固件凭据配置说明（编译/烧录前必读）

⚠️ 本仓库的固件源码**已脱敏**，WiFi 热点名/密码与 Mac 局域网 IP 不在任何被提交的文件里。
拿到本仓库后，编译「联网版固件」之前**必须手动填入凭据**，否则：

- ESP32 控制固件：以「仅串口/传感器测试」模式运行，串口打印 `WIFI_CONFIG=EMPTY`，不会联网发事件。
- T5 摄像头固件：启动时检测到空 SSID，直接报错退出（`WiFi SSID is empty...`）。

## 涉及的文件

| 固件 | 凭据文件 | 字段 |
|---|---|---|
| ESP32 控制固件 | `esp32-control/include/user_config.h` | `WH_WIFI_SSID` / `WH_WIFI_PASSWORD` / `WH_BRIDGE_HOST` / `WH_BRIDGE_PORT` |
| T5 摄像头固件 | `t5-camera/src-patch/examples/peripherals/camera/output_web/app_default.config` | `CONFIG_WH_WIFI_SSID` / `CONFIG_WH_WIFI_PASSWORD` |

## 各字段含义

- `WH_WIFI_SSID` / `WH_WIFI_PASSWORD`：现场 2.4GHz 热点的名称与密码。T5、ESP32、Mac 三者必须连**同一个**热点。
- `WH_BRIDGE_HOST`：Mac 连上热点后的局域网 IP，ESP32 把硬件事件 POST 到它。
- `WH_BRIDGE_PORT`：Mac 桥接端口，默认 `4173`（保持即可）。

## 怎么填

### ESP32 控制固件

编辑 `firmware/esp32-control/include/user_config.h`，把空字符串填上：

```cpp
#define WH_WIFI_SSID "现场热点名"
#define WH_WIFI_PASSWORD "热点密码"
#define WH_BRIDGE_HOST "Mac局域网IP"
#define WH_BRIDGE_PORT 4173
```

也可参考 `include/user_config.example.h`（带字段说明的模板）。若 Mac 重连热点后 IP 改变，
不必重新编译，在 `115200` 串口监视器发送 `HOST:新IP` 即可热更新。

### T5 摄像头固件

编辑 `t5-camera/src-patch/examples/peripherals/camera/output_web/app_default.config`：

```
CONFIG_WH_WIFI_SSID="现场热点名"
CONFIG_WH_WIFI_PASSWORD="热点密码"
```

## 本机真实凭据（切勿提交）

本机真实凭据保存在 `firmware/esp32-control/include/user_config.secret.h`，
已被 `.gitignore` 忽略。不要把它的内容复制进任何会提交的文件。

## 为什么编译产物（bin/）不进 Git

`firmware/**/bin/` 是「源码 + 热点凭据」编译出的二进制固件，凭据已固化其中、无法事后剥离，
因此不上传。仓库保留 `firmware/CHECKSUMS.sha256`（三份有效产物的 SHA-256），任何人在
本地填入凭据后重新编译，产物哈希与校验文件一致即为等价固件。烧录步骤见
[`使用说明.md`](../使用说明.md)。
