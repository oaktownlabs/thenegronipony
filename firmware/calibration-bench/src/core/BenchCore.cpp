#include "BenchCore.h"

#include <limits.h>
#include <string.h>

namespace tnp {
namespace {

StartStep emptyStep() {
  StartStep step;
  memset(&step, 0, sizeof(step));
  step.pump = Pump::NONE;
  step.direction = Direction::FORWARD;
  return step;
}

bool addWouldOverflow(uint32_t a, uint32_t b) {
  return a > UINT32_MAX - b;
}

}  // namespace

BenchCore::BenchCore(const CoreLimits& limits)
    : limits_(limits),
      state_(BenchState::BOOT),
      fault_(FaultCode::NONE),
      activeStep_(emptyStep()),
      motorEnabled_(false),
      stateEnteredMs_(0),
      lastHeartbeatMs_(0),
      lastSampleMs_(0),
      motorOffMs_(0),
      runStopAfterMs_(0),
      hardStopAfterMs_(0),
      settleAfterMs_(0),
      tareMinimumStableMs_(0),
      tareMaximumWaitMs_(0),
      tareStableSinceMs_(0),
      tareMinimumRaw_(0),
      tareMaximumRaw_(0),
      tareSumRaw_(0),
      tareSampleCount_(0) {}

void BenchCore::begin(uint32_t nowMs, bool eStopHealthy) {
  state_ = BenchState::BOOT;
  fault_ = FaultCode::NONE;
  motorEnabled_ = false;
  stateEnteredMs_ = nowMs;
  lastHeartbeatMs_ = nowMs;
  lastSampleMs_ = nowMs;
  motorOffMs_ = nowMs;
  clearStep();
  resetTareWindow();
  if (eStopHealthy) {
    setState(BenchState::IDLE, nowMs);
  } else {
    raiseFault(FaultCode::E_STOP, nowMs);
  }
}

void BenchCore::heartbeat(uint32_t nowMs) { lastHeartbeatMs_ = nowMs; }

RejectCode BenchCore::requestTare(uint32_t minimumStableMs,
                                  uint32_t maximumWaitMs, uint32_t nowMs) {
  if (state_ != BenchState::IDLE) {
    return RejectCode::BAD_STATE;
  }
  if (limits_.tareSpanCounts == 0) {
    return RejectCode::TARE_STABILITY_UNCONFIGURED;
  }
  if (minimumStableMs == 0 || maximumWaitMs < minimumStableMs ||
      maximumWaitMs > limits_.maximumTareWaitMs) {
    return RejectCode::BAD_RANGE;
  }

  clearStep();
  tareMinimumStableMs_ = minimumStableMs;
  tareMaximumWaitMs_ = maximumWaitMs;
  resetTareWindow();
  lastHeartbeatMs_ = nowMs;
  lastSampleMs_ = nowMs;
  setState(BenchState::TARE, nowMs);
  return RejectCode::OK;
}

RejectCode BenchCore::requestStart(const StartStep& step,
                                   bool scaleCalibrated,
                                   bool deviceIdProvisioned,
                                   uint32_t nowMs) {
  if (state_ != BenchState::ARMED) {
    return RejectCode::BAD_STATE;
  }
  if (!scaleCalibrated) {
    return RejectCode::SCALE_UNCALIBRATED;
  }
  if (!deviceIdProvisioned) {
    return RejectCode::DEVICE_ID_UNPROVISIONED;
  }
  if (limits_.maximumConfiguredMassMg == 0) {
    return RejectCode::SAFETY_LIMIT_UNCONFIGURED;
  }
  if (step.pump != Pump::KAMOER && step.pump != Pump::GIKFUN) {
    return RejectCode::BAD_PUMP;
  }
  if (step.direction != Direction::FORWARD &&
      step.direction != Direction::REVERSE) {
    return RejectCode::BAD_DIRECTION;
  }
  if (step.dutyBasisPoints == 0 || step.dutyBasisPoints > 10000 ||
      (step.pump == Pump::KAMOER &&
       step.dutyBasisPoints < limits_.kamoerMinimumDutyBasisPoints)) {
    return RejectCode::BAD_RANGE;
  }
  if (step.collectionMs == 0 || step.hardStopMs == 0 ||
      step.hardStopMs > limits_.maximumRunMs ||
      step.settleMs > limits_.maximumSettleMs ||
      addWouldOverflow(step.warmupMs, step.collectionMs) ||
      step.warmupMs + step.collectionMs >= step.hardStopMs ||
      step.maximumMassMg == 0 ||
      step.maximumMassMg > limits_.maximumConfiguredMassMg) {
    return RejectCode::BAD_RANGE;
  }
  if (!elapsed(nowMs, motorOffMs_, limits_.directionDeadTimeMs)) {
    return RejectCode::DEAD_TIME;
  }

  activeStep_ = step;
  motorEnabled_ = true;
  lastHeartbeatMs_ = nowMs;
  lastSampleMs_ = nowMs;
  runStopAfterMs_ = step.warmupMs + step.collectionMs;
  hardStopAfterMs_ = step.hardStopMs;
  settleAfterMs_ = step.settleMs;
  setState(BenchState::RUNNING, nowMs);
  return RejectCode::OK;
}

RejectCode BenchCore::requestStop(uint32_t nowMs) {
  if (state_ == BenchState::BOOT || state_ == BenchState::FAULT) {
    return RejectCode::BAD_STATE;
  }
  motorEnabled_ = false;
  motorOffMs_ = nowMs;
  clearStep();
  setState(BenchState::IDLE, nowMs);
  return RejectCode::OK;
}

RejectCode BenchCore::requestClear(bool eStopHealthy, uint32_t nowMs) {
  if (state_ != BenchState::FAULT && state_ != BenchState::COMPLETE) {
    return RejectCode::BAD_STATE;
  }
  if (!eStopHealthy) {
    return RejectCode::E_STOP_ACTIVE;
  }
  motorEnabled_ = false;
  motorOffMs_ = nowMs;
  fault_ = FaultCode::NONE;
  clearStep();
  setState(BenchState::IDLE, nowMs);
  return RejectCode::OK;
}

SampleResult BenchCore::onSample(int32_t rawAdc, bool saturated,
                                 bool massValid, int32_t massMg,
                                 uint32_t nowMs) {
  SampleResult result = {false, false, 0};
  lastSampleMs_ = nowMs;

  if (saturated) {
    result.stateChanged = raiseFault(FaultCode::HX711_SATURATION, nowMs);
    return result;
  }

  if (state_ == BenchState::RUNNING) {
    if (!massValid) {
      result.stateChanged = raiseFault(FaultCode::MASS_UNAVAILABLE, nowMs);
      return result;
    }
    if (massMg >= 0 && static_cast<uint32_t>(massMg) >= activeStep_.maximumMassMg) {
      result.stateChanged = raiseFault(FaultCode::MAXIMUM_MASS, nowMs);
      return result;
    }
  }

  if (state_ != BenchState::TARE) {
    return result;
  }

  if (tareSampleCount_ == 0) {
    tareStableSinceMs_ = nowMs;
    tareMinimumRaw_ = rawAdc;
    tareMaximumRaw_ = rawAdc;
    tareSumRaw_ = rawAdc;
    tareSampleCount_ = 1;
    return result;
  }

  if (rawAdc < tareMinimumRaw_) tareMinimumRaw_ = rawAdc;
  if (rawAdc > tareMaximumRaw_) tareMaximumRaw_ = rawAdc;
  const int64_t span = static_cast<int64_t>(tareMaximumRaw_) - tareMinimumRaw_;
  if (span > limits_.tareSpanCounts) {
    tareStableSinceMs_ = nowMs;
    tareMinimumRaw_ = rawAdc;
    tareMaximumRaw_ = rawAdc;
    tareSumRaw_ = rawAdc;
    tareSampleCount_ = 1;
    return result;
  }

  tareSumRaw_ += rawAdc;
  if (tareSampleCount_ < UINT16_MAX) ++tareSampleCount_;
  if (tareSampleCount_ >= 3 &&
      elapsed(nowMs, tareStableSinceMs_, tareMinimumStableMs_)) {
    result.tareCompleted = true;
    result.tareRaw = static_cast<int32_t>(tareSumRaw_ / tareSampleCount_);
    setState(BenchState::ARMED, nowMs);
    result.stateChanged = true;
  }
  return result;
}

bool BenchCore::tick(uint32_t nowMs, bool eStopHealthy) {
  if (!eStopHealthy) {
    return raiseFault(FaultCode::E_STOP, nowMs);
  }
  if (state_ == BenchState::FAULT || state_ == BenchState::BOOT) {
    return false;
  }
  if (activeNeedsHeartbeat() &&
      elapsed(nowMs, lastHeartbeatMs_, limits_.heartbeatTimeoutMs)) {
    return raiseFault(FaultCode::HEARTBEAT_TIMEOUT, nowMs);
  }
  if (activeNeedsSensor() &&
      elapsed(nowMs, lastSampleMs_, limits_.sensorTimeoutMs)) {
    return raiseFault(FaultCode::SENSOR_TIMEOUT, nowMs);
  }
  if (state_ == BenchState::TARE &&
      elapsed(nowMs, stateEnteredMs_, tareMaximumWaitMs_)) {
    return raiseFault(FaultCode::SENSOR_TIMEOUT, nowMs);
  }
  if (state_ == BenchState::RUNNING) {
    if (elapsed(nowMs, stateEnteredMs_, hardStopAfterMs_)) {
      return raiseFault(FaultCode::HARD_STOP, nowMs);
    }
    if (elapsed(nowMs, stateEnteredMs_, runStopAfterMs_)) {
      motorEnabled_ = false;
      motorOffMs_ = nowMs;
      setState(BenchState::SETTLING, nowMs);
      return true;
    }
  }
  if (state_ == BenchState::SETTLING &&
      elapsed(nowMs, stateEnteredMs_, settleAfterMs_)) {
    setState(BenchState::COMPLETE, nowMs);
    return true;
  }
  return false;
}

bool BenchCore::raiseFault(FaultCode code, uint32_t nowMs) {
  const bool changed = state_ != BenchState::FAULT || fault_ != code;
  motorEnabled_ = false;
  motorOffMs_ = nowMs;
  fault_ = code;
  setState(BenchState::FAULT, nowMs);
  return changed;
}

bool BenchCore::elapsed(uint32_t nowMs, uint32_t sinceMs,
                        uint32_t durationMs) {
  return static_cast<uint32_t>(nowMs - sinceMs) >= durationMs;
}

void BenchCore::setState(BenchState next, uint32_t nowMs) {
  state_ = next;
  stateEnteredMs_ = nowMs;
}

void BenchCore::clearStep() { activeStep_ = emptyStep(); }

void BenchCore::resetTareWindow() {
  tareStableSinceMs_ = 0;
  tareMinimumRaw_ = 0;
  tareMaximumRaw_ = 0;
  tareSumRaw_ = 0;
  tareSampleCount_ = 0;
}

bool BenchCore::activeNeedsHeartbeat() const {
  return state_ == BenchState::TARE || state_ == BenchState::ARMED ||
         state_ == BenchState::RUNNING || state_ == BenchState::SETTLING;
}

bool BenchCore::activeNeedsSensor() const {
  return state_ == BenchState::TARE || state_ == BenchState::ARMED ||
         state_ == BenchState::RUNNING || state_ == BenchState::SETTLING;
}

const char* benchStateName(BenchState state) {
  switch (state) {
    case BenchState::BOOT: return "boot";
    case BenchState::IDLE: return "idle";
    case BenchState::TARE: return "tare";
    case BenchState::ARMED: return "armed";
    case BenchState::RUNNING: return "running";
    case BenchState::SETTLING: return "settling";
    case BenchState::COMPLETE: return "complete";
    case BenchState::FAULT: return "fault";
  }
  return "unknown";
}

const char* faultCodeName(FaultCode code) {
  switch (code) {
    case FaultCode::NONE: return "none";
    case FaultCode::E_STOP: return "e_stop";
    case FaultCode::HEARTBEAT_TIMEOUT: return "heartbeat_timeout";
    case FaultCode::SENSOR_TIMEOUT: return "sensor_timeout";
    case FaultCode::HX711_SATURATION: return "hx711_saturation";
    case FaultCode::MASS_UNAVAILABLE: return "mass_unavailable";
    case FaultCode::MAXIMUM_MASS: return "maximum_mass";
    case FaultCode::HARD_STOP: return "hard_stop";
    case FaultCode::PROTOCOL: return "protocol";
    case FaultCode::INVALID_COMMAND: return "invalid_command";
    case FaultCode::MCU_WATCHDOG: return "mcu_watchdog";
  }
  return "unknown";
}

const char* rejectCodeName(RejectCode code) {
  switch (code) {
    case RejectCode::OK: return "ok";
    case RejectCode::BAD_STATE: return "bad_state";
    case RejectCode::BAD_RANGE: return "bad_range";
    case RejectCode::BAD_PUMP: return "bad_pump";
    case RejectCode::BAD_DIRECTION: return "bad_direction";
    case RejectCode::E_STOP_ACTIVE: return "e_stop_active";
    case RejectCode::SCALE_UNCALIBRATED: return "scale_uncalibrated";
    case RejectCode::SAFETY_LIMIT_UNCONFIGURED:
      return "safety_limit_unconfigured";
    case RejectCode::TARE_STABILITY_UNCONFIGURED:
      return "tare_stability_unconfigured";
    case RejectCode::DEVICE_ID_UNPROVISIONED:
      return "device_id_unprovisioned";
    case RejectCode::DEAD_TIME: return "dead_time";
    case RejectCode::TRIAL_MISMATCH: return "trial_mismatch";
    case RejectCode::COMMAND_SEQUENCE: return "command_sequence";
    case RejectCode::OUTPUT_FAILURE: return "output_failure";
  }
  return "unknown";
}

const char* pumpName(Pump pump) {
  switch (pump) {
    case Pump::NONE: return "none";
    case Pump::KAMOER: return "k";
    case Pump::GIKFUN: return "g";
  }
  return "none";
}

}  // namespace tnp
