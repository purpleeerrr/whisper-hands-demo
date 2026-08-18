# ESP32-S3 交互控制固件

目标板：`ESP32-S3 N16R8`，PlatformIO 板型：`esp32-s3-devkitc-1`。

## 功能边界

- 旋钮旋转：只选择 1–4 模式，不立即执行。
- 旋钮按下：执行当前模式。
- 敲 1/2/3/4 下：分别触发录像切换、截图、重点语音切换、结束录像。
- 串口输入 `1`、`2`、`3`、`4` 也能触发四项功能，便于在传感器没接好前验收 Wi‑Fi 链路。
- 通过 HTTP POST 发往 Mac 的 `/api/hardware/event`。ESP32 不直接控制 T5。

## 编译前的联网参数

在 `include/user_config.h` 填入路演临时 2.4GHz 热点、Mac 连上该热点后的局域网 IP。参数留空时仍可编译，且可做串口和传感器单板测试。

```cpp
#define WH_WIFI_SSID "路演热点名"
#define WH_WIFI_PASSWORD "路演热点密码"
#define WH_BRIDGE_HOST "Mac局域网IP"
```

如果 Mac 重连热点后 IP 变了，在 `115200` 串口监视器发送：

```text
HOST:192.168.1.23
```

板子会把新地址存入本地，以后重启仍然使用，无需重新编译。
