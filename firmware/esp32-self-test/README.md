# ESP32-S3 首次上电自检

这个工程只验证三件事：板型能编译、USB 能烧录、串口能输出。它不连 Wi‑Fi，也不需要接任何传感器。

烧录后打开 `115200` 波特率的串口监视器，应当看到：

```text
Whisper Hands ESP32-S3 self-test
我已开机
BOARD=ESP32-S3-N16R8
STATUS=READY
HEARTBEAT uptime_ms=...
```

