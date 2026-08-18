#include <Arduino.h>

namespace {
constexpr unsigned long kHeartbeatIntervalMs = 2000;
unsigned long lastHeartbeatAt = 0;
}

void setup() {
  Serial.begin(115200);
  delay(1200);
  Serial.println();
  Serial.println("Whisper Hands ESP32-S3 self-test");
  Serial.println("我已开机");
  Serial.println("BOARD=ESP32-S3-N16R8");
  Serial.println("STATUS=READY");
}

void loop() {
  const unsigned long now = millis();
  if (now - lastHeartbeatAt >= kHeartbeatIntervalMs) {
    lastHeartbeatAt = now;
    Serial.printf("HEARTBEAT uptime_ms=%lu\n", now);
  }
  delay(10);
}

