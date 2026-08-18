# 归档说明

这里的内容已经退出当前烧录与路演主流程，但为了排查和恢复而保留。

| 路径 | 原因 | 恢复方式 |
|---|---|---|
| `old-docs/` | 被 `使用说明.md` 和完整交接替代的旧说明 | 仅用于追溯旧讨论 |
| `old-frontend/` | 旧版单文件完整网站（与 `studio.html` 重复）与 `server.mjs` 备份 | 仅追溯；现行前端是 `index.html` / `studio.html` / `prompt-lab.html` |
| `advanced-firmware/` | ESP32 只含应用分区的 app bin；新手主流程使用 merged bin | 高级多地址烧录时使用 |
| `build-cache/` | ESP32 PlatformIO 的 `.pio` 编译缓存 | 移回原工程命名为 `.pio`，或直接重跑 `pio run` |

当前主流程不要从本目录选烧录文件。主烧录文件只在 `firmware/*/bin/`。

