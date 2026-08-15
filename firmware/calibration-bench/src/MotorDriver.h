#ifndef TNP_MOTOR_DRIVER_H
#define TNP_MOTOR_DRIVER_H

#include <Arduino.h>
#include <stdint.h>

#include "core/BenchCore.h"

namespace tnp {

class MotorDriver {
 public:
  MotorDriver();
  void begin();
  void forceOff();
  bool start(Pump pump, Direction direction, uint16_t dutyBasisPoints);
  bool isOn() const { return on_; }
  Pump pump() const { return pump_; }
  uint16_t timerCount() const { return timerCount_; }

 private:
  uint16_t basisPointsToTimerCount(uint16_t dutyBasisPoints) const;
  void attachChannelA(uint16_t timerCount);
  void attachChannelB(uint16_t timerCount);

  bool on_;
  Pump pump_;
  uint16_t timerCount_;
};

}  // namespace tnp

#endif
