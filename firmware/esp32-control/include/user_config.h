#pragma once

// ⚠️ 部署前必读：../../WIFI-CREDENTIALS.md 与 ../README.md
// 默认留空 → 固件以「仅串口/传感器测试」模式运行（串口打印 WIFI_CONFIG=EMPTY）。
// 路演联网版由编译者填入临时 2.4GHz 热点与 Mac 局域网 IP 后重新编译。
// 真实凭据保存在 git 忽略的 include/user_config.secret.h，绝不提交。
#define WH_WIFI_SSID ""
#define WH_WIFI_PASSWORD ""
#define WH_BRIDGE_HOST ""
#define WH_BRIDGE_PORT 4173
