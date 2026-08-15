#include "Hx711.h"

#include <limits.h>

#include "BenchConfig.h"

#if defined(__AVR_ATmega328P__)
#include <avr/io.h>
#endif

namespace tnp {

Hx711::Hx711() : lastReadMs_(0), tareRaw_(0), haveTare_(false) {}

void Hx711::begin() {
  pinMode(config::HX711_DATA_PIN, INPUT);
  pinMode(config::HX711_CLOCK_PIN, OUTPUT);
  digitalWrite(config::HX711_CLOCK_PIN, LOW);
  if (config::HX711_RATE_PIN_CONNECTED) {
    pinMode(config::HX711_RATE_PIN, OUTPUT);
    digitalWrite(config::HX711_RATE_PIN, LOW);  // RATE low selects 10 SPS.
  } else {
    pinMode(config::HX711_RATE_PIN, INPUT);
    digitalWrite(config::HX711_RATE_PIN, LOW);  // Explicitly disable pull-up.
  }
}

bool Hx711::readIfReady(uint32_t nowMs, int32_t* rawAdc) {
  if (rawAdc == NULL || !ready()) return false;
  if (lastReadMs_ != 0 &&
      static_cast<uint32_t>(nowMs - lastReadMs_) <
          config::HX711_MINIMUM_READ_INTERVAL_MS) {
    return false;
  }
  *rawAdc = readRaw();
  lastReadMs_ = nowMs;
  return true;
}

bool Hx711::saturated(int32_t rawAdc) const {
  static const int32_t minimum = -8388608L;
  static const int32_t maximum = 8388607L;
  return rawAdc <= minimum +
                       static_cast<int32_t>(config::HX711_SATURATION_MARGIN_COUNTS) ||
         rawAdc >= maximum -
                       static_cast<int32_t>(config::HX711_SATURATION_MARGIN_COUNTS);
}

void Hx711::setTareRaw(int32_t rawAdc) {
  tareRaw_ = rawAdc;
  haveTare_ = true;
}

bool Hx711::calibrationFactorConfigured() const {
  return config::SCALE_CALIBRATION_PROVISIONED &&
         config::SCALE_COUNTS_PER_GRAM_NUMERATOR != 0 &&
         config::SCALE_COUNTS_PER_GRAM_DENOMINATOR != 0;
}

bool Hx711::massAvailable() const {
  return haveTare_ && calibrationFactorConfigured();
}

bool Hx711::massMg(int32_t rawAdc, int32_t* massMg) const {
  if (massMg == NULL || !massAvailable()) return false;
  const int64_t counts = static_cast<int64_t>(rawAdc) - tareRaw_;
  const int64_t numerator = counts * 1000LL *
                            config::SCALE_COUNTS_PER_GRAM_DENOMINATOR;
  // Keep the deliberately unconfigured build (numerator=0) compilable. The
  // guard above returns false; this fallback divisor is never evidence or an
  // active conversion factor.
  const int32_t divisor = config::SCALE_COUNTS_PER_GRAM_NUMERATOR == 0
                              ? 1
                              : config::SCALE_COUNTS_PER_GRAM_NUMERATOR;
  const int64_t converted = numerator / divisor;
  if (converted < INT32_MIN || converted > INT32_MAX) return false;
  *massMg = static_cast<int32_t>(converted);
  return true;
}

bool Hx711::ready() const {
  return digitalRead(config::HX711_DATA_PIN) == LOW;
}

int32_t Hx711::readRaw() {
  uint32_t value = 0;
  noInterrupts();
#if defined(__AVR_ATmega328P__)
  // D4=PD4 and D5=PD5 on the UNO R3. Direct I/O keeps the entire 25-pulse
  // transaction below one 250000-baud character time while keeping each clock
  // high pulse comfortably below the HX711's 60 us power-down threshold.
  for (uint8_t bit = 0; bit < 24; ++bit) {
    PORTD |= _BV(PD5);
    __asm__ __volatile__("nop\n\tnop\n\t");
    value = (value << 1U) | ((PIND & _BV(PD4)) != 0 ? 1U : 0U);
    PORTD &= static_cast<uint8_t>(~_BV(PD5));
    __asm__ __volatile__("nop\n\tnop\n\t");
  }
  // Pulse 25 selects channel A, gain 128 for the next conversion.
  PORTD |= _BV(PD5);
  __asm__ __volatile__("nop\n\tnop\n\t");
  PORTD &= static_cast<uint8_t>(~_BV(PD5));
#else
  for (uint8_t bit = 0; bit < 24; ++bit) {
    digitalWrite(config::HX711_CLOCK_PIN, HIGH);
    value = (value << 1U) |
            (digitalRead(config::HX711_DATA_PIN) == HIGH ? 1U : 0U);
    digitalWrite(config::HX711_CLOCK_PIN, LOW);
  }
  digitalWrite(config::HX711_CLOCK_PIN, HIGH);
  digitalWrite(config::HX711_CLOCK_PIN, LOW);
#endif
  interrupts();
  if ((value & 0x00800000UL) != 0) value |= 0xFF000000UL;
  return static_cast<int32_t>(value);
}

}  // namespace tnp
