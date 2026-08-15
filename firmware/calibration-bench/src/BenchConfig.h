#ifndef TNP_BENCH_CONFIG_H
#define TNP_BENCH_CONFIG_H

#include <stdint.h>

// Provision a distinct identifier on every physical controller. Keep it within
// [A-Za-z0-9_.:-] because the fixed-buffer protocol deliberately has no JSON
// escape machinery.
#define TNP_DEVICE_ID "tnp-bench-unprovisioned"
#define TNP_FIRMWARE_VERSION "0.1.0-avr"
#define TNP_SCALE_CALIBRATION_ID ""

namespace tnp {
namespace config {

static const bool DEVICE_ID_PROVISIONED = false;

static const uint32_t SERIAL_BAUD = 250000UL;
static const uint16_t TIMER1_TOP = 799U;  // 16 MHz / (799 + 1) = 20 kHz.
static const uint16_t PWM_FREQUENCY_HZ = 20000U;

static const uint8_t HX711_DATA_PIN = 4;
static const uint8_t HX711_CLOCK_PIN = 5;
static const uint8_t HX711_RATE_PIN = 3;
// Leave false until the exact HX711 board trace proves D3 reaches RATE safely.
static const bool HX711_RATE_PIN_CONNECTED = false;
static const uint16_t HX711_MINIMUM_READ_INTERVAL_MS = 90U;
static const uint32_t HX711_SATURATION_MARGIN_COUNTS = 256UL;

static const uint8_t KAMOER_DIRECTION_PIN = 6;
static const uint8_t E_STOP_SENSE_PIN = 7;
// Main-loop heartbeat for the external retriggerable monostable. This is not a
// free-running timer output: either a HIGH or LOW software stall must let the
// external pulse expire and drop the control relay.
static const uint8_t CONTROL_WATCHDOG_PIN = 8;
static const uint16_t CONTROL_WATCHDOG_TOGGLE_MS = 25U;
static const uint8_t KAMOER_PWM_PIN = 9;   // OC1A.
static const uint8_t GIKFUN_PWM_PIN = 10;  // OC1B.
static const uint8_t GIKFUN_DIRECTION_PIN = 11;

// The NC E-stop auxiliary loop grounds D7 when healthy. INPUT_PULLUP means an
// open wire and a pressed E-stop both read HIGH and fail off.
static const uint8_t E_STOP_HEALTHY_LEVEL = 0;  // LOW without Arduino.h here.

static const uint32_t HEARTBEAT_TIMEOUT_MS = 1500UL;
static const uint32_t HX711_READY_TIMEOUT_MS = 750UL;
static const uint32_t MAXIMUM_TARE_WAIT_MS = 60000UL;
static const uint32_t MAXIMUM_RUN_MS = 60000UL;
static const uint32_t MAXIMUM_SETTLE_MS = 30000UL;
static const uint32_t DIRECTION_DEAD_TIME_MS = 20UL;
// Zero is deliberately unconfigured: tare commands fail until a threshold is
// derived from recorded zero-load data and reviewed for this exact scale.
static const uint32_t TARE_STABILITY_SPAN_COUNTS = 0UL;
static const uint16_t KAMOER_MINIMUM_DUTY_BASIS_POINTS = 1100U;

// Safety-critical commissioning values. Zero intentionally disables physical
// runs. Replace only with reviewed values derived from a real scale calibration
// and the measured safe fill of the actual vessel/fixture.
static const int32_t SCALE_COUNTS_PER_GRAM_NUMERATOR = 0;
static const int32_t SCALE_COUNTS_PER_GRAM_DENOMINATOR = 1;
static const bool SCALE_CALIBRATION_PROVISIONED = false;
static const uint32_t MAXIMUM_CONFIGURED_LIQUID_MASS_MG = 0UL;

static const uint32_t DEVICE_HEARTBEAT_INTERVAL_MS = 500UL;

}  // namespace config
}  // namespace tnp

#endif
