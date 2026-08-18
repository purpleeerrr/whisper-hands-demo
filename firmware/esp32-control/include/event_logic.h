#pragma once

#include <stdint.h>

enum class HardwareEvent : uint8_t {
  None = 0,
  VideoToggle,
  Snapshot,
  AudioMarkToggle,
  VideoFinish,
};

inline HardwareEvent modeToEvent(uint8_t mode) {
  switch (mode) {
    case 1: return HardwareEvent::VideoToggle;
    case 2: return HardwareEvent::Snapshot;
    case 3: return HardwareEvent::AudioMarkToggle;
    case 4: return HardwareEvent::VideoFinish;
    default: return HardwareEvent::None;
  }
}

inline HardwareEvent knockCountToEvent(uint8_t count) {
  if (count == 0) return HardwareEvent::None;
  if (count >= 4) return HardwareEvent::VideoFinish;
  return modeToEvent(count);
}

