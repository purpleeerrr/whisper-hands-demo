#include <unity.h>

#include "event_logic.h"

void setUp() {}
void tearDown() {}

void test_rotary_modes_map_to_four_product_events() {
  TEST_ASSERT_EQUAL_UINT8(static_cast<uint8_t>(HardwareEvent::VideoToggle), static_cast<uint8_t>(modeToEvent(1)));
  TEST_ASSERT_EQUAL_UINT8(static_cast<uint8_t>(HardwareEvent::Snapshot), static_cast<uint8_t>(modeToEvent(2)));
  TEST_ASSERT_EQUAL_UINT8(static_cast<uint8_t>(HardwareEvent::AudioMarkToggle), static_cast<uint8_t>(modeToEvent(3)));
  TEST_ASSERT_EQUAL_UINT8(static_cast<uint8_t>(HardwareEvent::VideoFinish), static_cast<uint8_t>(modeToEvent(4)));
}

void test_invalid_mode_does_nothing() {
  TEST_ASSERT_EQUAL_UINT8(static_cast<uint8_t>(HardwareEvent::None), static_cast<uint8_t>(modeToEvent(0)));
  TEST_ASSERT_EQUAL_UINT8(static_cast<uint8_t>(HardwareEvent::None), static_cast<uint8_t>(modeToEvent(5)));
}

void test_four_or_more_knocks_finish_video() {
  TEST_ASSERT_EQUAL_UINT8(static_cast<uint8_t>(HardwareEvent::VideoFinish), static_cast<uint8_t>(knockCountToEvent(4)));
  TEST_ASSERT_EQUAL_UINT8(static_cast<uint8_t>(HardwareEvent::VideoFinish), static_cast<uint8_t>(knockCountToEvent(7)));
}

int main(int argc, char **argv) {
  UNITY_BEGIN();
  RUN_TEST(test_rotary_modes_map_to_four_product_events);
  RUN_TEST(test_invalid_mode_does_nothing);
  RUN_TEST(test_four_or_more_knocks_finish_video);
  return UNITY_END();
}

