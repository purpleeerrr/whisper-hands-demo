#!/usr/bin/env python3
"""等待 ESP32 WiFi 连上，再发完整录制序列验证网页联动。"""
import serial, time

PORT = '/dev/cu.usbmodem1101'
BAUD = 115200
HOST = '<Mac局域网IP>:8000'  # 改成 Mac 实际局域网 IP

s = serial.Serial(PORT, BAUD, timeout=1)
time.sleep(0.5)

# 1. 等待 WiFi 上线
print('=== 等待 WiFi 上线 ===')
online = False
for i in range(30):
    s.reset_input_buffer()
    s.write(b'\n')
    time.sleep(1)
    txt = s.read(s.in_waiting or 4096).decode('utf-8', errors='replace')
    if 'wifi=ONLINE' in txt:
        online = True
        for l in txt.splitlines():
            if 'wifi=ONLINE' in l:
                print('   ', l.strip())
        break
    if 'wifi=OFFLINE' in txt or 'WIFI_CONNECTING' in txt:
        for l in txt.splitlines():
            if 'wifi=' in l or 'WIFI_CONNECTING' in l:
                print('   ', l.strip())
                break
print('wifi_online =', online)

if not online:
    print('!! WiFi 30 秒内未上线，检查 Mac 是否连在热点上')
    s.close()
    raise SystemExit(1)

# 2. 对准桥接
s.write(f'HOST:{HOST}\n'.encode())
time.sleep(1.5)
print('=== 发 HOST ===')
print(s.read(s.in_waiting or 4096).decode('utf-8', errors='replace').strip()[-150:])

def send(cmd, label, wait=2.5):
    s.reset_input_buffer()
    s.write((cmd + '\n').encode())
    time.sleep(wait)
    txt = s.read(s.in_waiting or 4096).decode('utf-8', errors='replace')
    lines = [l for l in txt.splitlines()
             if any(k in l for k in ('EVENT', 'HTTP', 'KNOCK', 'HOST', 'WIFI', 'MODE'))]
    print(f'--- {label} [{cmd}] ---')
    for l in lines[-8:]:
        print('   ', l)
    if not lines:
        print('   (无关键输出)')

send('1', '开始录像 VIDEO_TOGGLE')
send('2', '留一刻 SNAPSHOT')
send('2', '留一刻 SNAPSHOT')
send('3', '语音开始 AUDIO_MARK_START')
send('3', '语音结束 AUDIO_MARK_STOP')
send('1', '暂停 VIDEO_TOGGLE')
send('4', '结束录像 VIDEO_FINISH', wait=3.5)

s.close()
print('DONE')
