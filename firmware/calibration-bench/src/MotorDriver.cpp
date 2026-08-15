#include "MotorDriver.h"

#include <avr/io.h>

#include "BenchConfig.h"

namespace tnp {

MotorDriver::MotorDriver() : on_(false), pump_(Pump::NONE), timerCount_(0) {}

void MotorDriver::begin() {
  pinMode(config::KAMOER_PWM_PIN, OUTPUT);
  pinMode(config::GIKFUN_PWM_PIN, OUTPUT);
  pinMode(config::KAMOER_DIRECTION_PIN, OUTPUT);
  pinMode(config::GIKFUN_DIRECTION_PIN, OUTPUT);
  digitalWrite(config::KAMOER_PWM_PIN, LOW);
  digitalWrite(config::GIKFUN_PWM_PIN, LOW);
  digitalWrite(config::KAMOER_DIRECTION_PIN, LOW);
  digitalWrite(config::GIKFUN_DIRECTION_PIN, LOW);

  // Fast PWM mode 14, TOP=ICR1, prescaler=1. Compare outputs stay detached
  // until a validated command selects exactly one pump.
  TCCR1A = _BV(WGM11);
  TCCR1B = _BV(WGM13) | _BV(WGM12) | _BV(CS10);
  TCNT1 = 0;
  ICR1 = config::TIMER1_TOP;
  OCR1A = 0;
  OCR1B = 0;
  forceOff();
}

void MotorDriver::forceOff() {
  TCCR1A &= static_cast<uint8_t>(~(_BV(COM1A1) | _BV(COM1A0) |
                                   _BV(COM1B1) | _BV(COM1B0)));
  OCR1A = 0;
  OCR1B = 0;
  digitalWrite(config::KAMOER_PWM_PIN, LOW);
  digitalWrite(config::GIKFUN_PWM_PIN, LOW);
  // Preserve direction while stopping. A later direction change is therefore
  // made only after BenchCore has enforced the motor-off dead time.
  on_ = false;
  pump_ = Pump::NONE;
  timerCount_ = 0;
}

bool MotorDriver::start(Pump pump, Direction direction,
                        uint16_t dutyBasisPoints) {
  forceOff();
  if ((pump != Pump::KAMOER && pump != Pump::GIKFUN) ||
      dutyBasisPoints == 0 || dutyBasisPoints > 10000) {
    return false;
  }

  if (pump == Pump::KAMOER) {
    // The reviewed external open-drain stage grounds green F/R when this GPIO
    // is HIGH (forward) and releases it when LOW (reverse).
    digitalWrite(config::KAMOER_DIRECTION_PIN,
                 direction == Direction::FORWARD ? HIGH : LOW);
  } else {
    // This assumes a reviewed PWM/DIR driver adapter, not a bare motor lead.
    digitalWrite(config::GIKFUN_DIRECTION_PIN,
                 direction == Direction::REVERSE ? HIGH : LOW);
  }

  const uint16_t timerCount = basisPointsToTimerCount(dutyBasisPoints);
  if (pump == Pump::KAMOER) attachChannelA(timerCount);
  else attachChannelB(timerCount);
  on_ = true;
  pump_ = pump;
  timerCount_ = timerCount;
  return true;
}

uint16_t MotorDriver::basisPointsToTimerCount(
    uint16_t dutyBasisPoints) const {
  const uint32_t periodCounts = static_cast<uint32_t>(config::TIMER1_TOP) + 1U;
  uint16_t count = static_cast<uint16_t>(
      (periodCounts * dutyBasisPoints + 5000UL) / 10000UL);
  if (dutyBasisPoints > 0 && count == 0) count = 1;
  return count;
}

void MotorDriver::attachChannelA(uint16_t timerCount) {
  if (timerCount >= config::TIMER1_TOP + 1U) {
    digitalWrite(config::KAMOER_PWM_PIN, HIGH);
    return;
  }
  OCR1A = timerCount;
  TCCR1A = static_cast<uint8_t>((TCCR1A & ~_BV(COM1A0)) | _BV(COM1A1));
}

void MotorDriver::attachChannelB(uint16_t timerCount) {
  if (timerCount >= config::TIMER1_TOP + 1U) {
    digitalWrite(config::GIKFUN_PWM_PIN, HIGH);
    return;
  }
  OCR1B = timerCount;
  TCCR1A = static_cast<uint8_t>((TCCR1A & ~_BV(COM1B0)) | _BV(COM1B1));
}

}  // namespace tnp
