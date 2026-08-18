#!/usr/bin/env python3
"""敲击传感器本地单点测试：不依赖 WiFi/桥接，只看 ESP32 串口的 KNOCK/EVENT 本地输出。

用法：python3 scripts/test-knock-local.py
敲击传感器，观察实时输出。Ctrl+C 退出。
"""
import serial, time, sys

PORT = '/dev/cu.usbmodem1101'
BAUD = 115200

try:
    s = serial.Serial(PORT, BAUD, timeout=1)
except Exception as e:
    print(f'!! 打不开串口 {PORT}: {e}')
    print('   请确认 ESP32 已插上（ls /dev/cu.usbmodem*）')
    sys.exit(1)

time.sleep(0.5)
s.reset_input_buffer()

print('=' * 60)
print('敲击传感器本地单点测试（不依赖 WiFi）')
print(f'串口 {PORT} @ {BAUD}')
print()
print('期望输出：')
print('  敲 1 下     → KNOCK count=1  → EVENT VIDEO_TOGGLE')
print('  快速敲 2 下 → KNOCK count=1,2 → EVENT SNAPSHOT')
print('  敲 3 下     → EVENT AUDIO_MARK_START/STOP')
print('  敲 4 下     → EVENT VIDEO_FINISH')
print()
print('现在开始敲击传感器，观察下方输出。Ctrl+C 退出。')
print('=' * 60)

try:
    while True:
        line = s.readline().decode('utf-8', errors='replace').strip()
        if not line:
            continue
        # 只打印关键行，滤掉心跳噪音
        if any(k in line for k in ('KNOCK', 'EVENT', 'MODE', 'WIFI', 'COMMAND')):
            ts = time.strftime('%H:%M:%S')
            print(f'[{ts}] {line}')
except KeyboardInterrupt:
    print('\n测试结束。')
    s.close()
