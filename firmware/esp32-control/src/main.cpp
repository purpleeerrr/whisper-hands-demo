#include <Arduino.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>

#include "event_logic.h"
#include "user_config.h"

namespace {
constexpr int kEncoderClkPin = 4;
constexpr int kEncoderDtPin = 5;
constexpr int kEncoderSwitchPin = 6;
constexpr int kKnockPin = 7;
constexpr int kRgbDataPin = 11;

constexpr unsigned long kButtonDebounceMs = 35;
constexpr unsigned long kKnockDebounceMs = 70;
constexpr unsigned long kKnockGroupMs = 650;
constexpr unsigned long kWifiRetryMs = 10000;
constexpr unsigned long kHeartbeatMs = 10000;

uint8_t selectedMode = 1;
int8_t encoderAccumulator = 0;
uint8_t previousEncoderState = 0;
bool previousButtonPressed = false;
bool previousKnockActive = false;
uint8_t knockCount = 0;
bool audioMarkActive = false;
uint32_t sequenceNumber = 0;
unsigned long lastButtonChangeAt = 0;
unsigned long lastKnockAt = 0;
unsigned long lastWifiAttemptAt = 0;
unsigned long lastHeartbeatAt = 0;
Preferences preferences;
String bridgeHost;

const char *eventName(HardwareEvent event) {
  switch (event) {
    case HardwareEvent::VideoToggle: return "VIDEO_TOGGLE";
    case HardwareEvent::Snapshot: return "SNAPSHOT";
    case HardwareEvent::VideoFinish: return "VIDEO_FINISH";
    case HardwareEvent::AudioMarkToggle: return audioMarkActive ? "AUDIO_MARK_STOP" : "AUDIO_MARK_START";
    default: return nullptr;
  }
}

void showModePreview() {
  // ESP32 Arduino 内置函数：只点亮外接 RGB 灯条第一颗，亮度保持较低。
  switch (selectedMode) {
    case 1: neopixelWrite(kRgbDataPin, 22, 0, 0); break;   // 录像：暗红
    case 2: neopixelWrite(kRgbDataPin, 18, 18, 18); break; // 截图：暗白
    case 3: neopixelWrite(kRgbDataPin, 0, 0, 22); break;   // 语音：暗蓝
    case 4: neopixelWrite(kRgbDataPin, 16, 7, 0); break;   // 结束：暗橙
  }
}

bool wifiConfigured() {
  return WH_WIFI_SSID[0] != '\0';
}

void connectWifiIfNeeded() {
  if (!wifiConfigured() || WiFi.status() == WL_CONNECTED) return;
  const unsigned long now = millis();
  if (now - lastWifiAttemptAt < kWifiRetryMs) return;
  lastWifiAttemptAt = now;
  Serial.printf("WIFI_CONNECTING ssid=%s\n", WH_WIFI_SSID);
  WiFi.disconnect();
  WiFi.begin(WH_WIFI_SSID, WH_WIFI_PASSWORD);
}

bool postEvent(const char *name, uint8_t mode = 0) {
  if (!name) return false;
  ++sequenceNumber;
  Serial.printf("EVENT name=%s seq=%lu mode=%u\n", name, static_cast<unsigned long>(sequenceNumber), mode);
  if (WiFi.status() != WL_CONNECTED || bridgeHost.isEmpty()) {
    Serial.println("EVENT_LOCAL_ONLY bridge_or_wifi_unavailable");
    return false;
  }

  WiFiClient client;
  HTTPClient http;
  const String url = String("http://") + bridgeHost + ":" + String(WH_BRIDGE_PORT) + "/api/hardware/event";
  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", "application/json");
  String body = String("{\"deviceId\":\"whisper-hands-esp32\",\"event\":\"") + name +
                "\",\"seq\":" + String(sequenceNumber) + ",\"ts\":0,\"payload\":{\"mode\":" +
                String(mode) + "}}";
  const int status = http.POST(body);
  http.end();
  Serial.printf("HTTP status=%d\n", status);
  return status >= 200 && status < 300;
}

void executeEvent(HardwareEvent event) {
  const char *name = eventName(event);
  if (!name) return;
  postEvent(name, selectedMode);
  if (event == HardwareEvent::AudioMarkToggle) audioMarkActive = !audioMarkActive;
}

void selectRelativeMode(int8_t direction) {
  int next = static_cast<int>(selectedMode) + direction;
  if (next < 1) next = 4;
  if (next > 4) next = 1;
  selectedMode = static_cast<uint8_t>(next);
  Serial.printf("MODE_SELECTED mode=%u waiting_for_press=true\n", selectedMode);
  showModePreview();
  postEvent("MODE", selectedMode);
}

void pollEncoder() {
  static constexpr int8_t transitions[16] = {
      0, -1, 1, 0,
      1, 0, 0, -1,
      -1, 0, 0, 1,
      0, 1, -1, 0,
  };
  const uint8_t state = (digitalRead(kEncoderClkPin) << 1) | digitalRead(kEncoderDtPin);
  const uint8_t index = static_cast<uint8_t>((previousEncoderState << 2) | state);
  encoderAccumulator += transitions[index];
  previousEncoderState = state;
  if (encoderAccumulator >= 4) {
    encoderAccumulator = 0;
    selectRelativeMode(1);
  } else if (encoderAccumulator <= -4) {
    encoderAccumulator = 0;
    selectRelativeMode(-1);
  }
}

void pollEncoderButton() {
  const bool pressed = digitalRead(kEncoderSwitchPin) == LOW;
  const unsigned long now = millis();
  if (pressed != previousButtonPressed && now - lastButtonChangeAt >= kButtonDebounceMs) {
    previousButtonPressed = pressed;
    lastButtonChangeAt = now;
    if (pressed) executeEvent(modeToEvent(selectedMode));
  }
}

void pollKnock() {
  const bool active = digitalRead(kKnockPin) == HIGH;
  const unsigned long now = millis();
  if (active && !previousKnockActive && now - lastKnockAt >= kKnockDebounceMs) {
    if (knockCount < 4) ++knockCount;
    lastKnockAt = now;
    Serial.printf("KNOCK count=%u waiting_for_group=true\n", knockCount);
  }
  previousKnockActive = active;
  if (knockCount > 0 && now - lastKnockAt >= kKnockGroupMs) {
    const uint8_t completedCount = knockCount;
    knockCount = 0;
    executeEvent(knockCountToEvent(completedCount));
  }
}

void pollSerialCommands() {
  if (!Serial.available()) return;
  String command = Serial.readStringUntil('\n');
  command.trim();
  command.toUpperCase();
  if (command == "1" || command == "VIDEO_TOGGLE") executeEvent(HardwareEvent::VideoToggle);
  else if (command == "2" || command == "SNAPSHOT") executeEvent(HardwareEvent::Snapshot);
  else if (command == "3" || command == "AUDIO_MARK") executeEvent(HardwareEvent::AudioMarkToggle);
  else if (command == "4" || command == "VIDEO_FINISH") executeEvent(HardwareEvent::VideoFinish);
  else if (command.startsWith("MODE:")) {
    const int value = command.substring(5).toInt();
    if (value >= 1 && value <= 4) {
      selectedMode = static_cast<uint8_t>(value);
      showModePreview();
      postEvent("MODE", selectedMode);
    }
  } else if (command.startsWith("HOST:")) {
    const String requestedHost = command.substring(5);
    if (requestedHost.length() >= 7 && requestedHost.length() <= 63) {
      bridgeHost = requestedHost;
      preferences.putString("bridge_host", bridgeHost);
      Serial.printf("BRIDGE_HOST_SAVED host=%s\n", bridgeHost.c_str());
    } else {
      Serial.println("BRIDGE_HOST_INVALID example=HOST:192.168.1.23");
    }
  } else Serial.println("COMMANDS=1,2,3,4,MODE:1..4,HOST:x.x.x.x");
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1200);
  pinMode(kEncoderClkPin, INPUT_PULLUP);
  pinMode(kEncoderDtPin, INPUT_PULLUP);
  pinMode(kEncoderSwitchPin, INPUT_PULLUP);
  pinMode(kKnockPin, INPUT_PULLDOWN);
  previousEncoderState = (digitalRead(kEncoderClkPin) << 1) | digitalRead(kEncoderDtPin);
  preferences.begin("whisperhands", false);
  bridgeHost = preferences.getString("bridge_host", WH_BRIDGE_HOST);
  WiFi.mode(WIFI_STA);
  showModePreview();
  Serial.println();
  Serial.println("Whisper Hands ESP32-S3 control");
  Serial.println("我已开机");
  Serial.println(wifiConfigured() ? "WIFI_CONFIG=READY" : "WIFI_CONFIG=EMPTY serial_and_sensor_test_only");
  Serial.printf("BRIDGE_CONFIG=%s host=%s\n", bridgeHost.isEmpty() ? "EMPTY" : "READY", bridgeHost.c_str());
  Serial.println("COMMANDS=1,2,3,4,MODE:1..4,HOST:x.x.x.x");
  lastWifiAttemptAt = millis() - kWifiRetryMs;
}

void loop() {
  connectWifiIfNeeded();
  pollEncoder();
  pollEncoderButton();
  pollKnock();
  pollSerialCommands();

  const unsigned long now = millis();
  if (now - lastHeartbeatAt >= kHeartbeatMs) {
    lastHeartbeatAt = now;
    Serial.printf("HEARTBEAT wifi=%s ip=%s mode=%u\n",
                  WiFi.status() == WL_CONNECTED ? "ONLINE" : "OFFLINE",
                  WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "-",
                  selectedMode);
    if (WiFi.status() == WL_CONNECTED) postEvent("MODE", selectedMode);
  }
  delay(2);
}
