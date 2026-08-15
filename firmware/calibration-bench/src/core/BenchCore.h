#ifndef TNP_BENCH_CORE_H
#define TNP_BENCH_CORE_H

#include <stddef.h>
#include <stdint.h>

namespace tnp {

enum class BenchState : uint8_t {
  BOOT = 0,
  IDLE,
  TARE,
  ARMED,
  RUNNING,
  SETTLING,
  COMPLETE,
  FAULT
};

enum class FaultCode : uint8_t {
  NONE = 0,
  E_STOP,
  HEARTBEAT_TIMEOUT,
  SENSOR_TIMEOUT,
  HX711_SATURATION,
  MASS_UNAVAILABLE,
  MAXIMUM_MASS,
  HARD_STOP,
  PROTOCOL,
  INVALID_COMMAND,
  MCU_WATCHDOG
};

enum class Pump : uint8_t {
  NONE = 0,
  KAMOER,
  GIKFUN
};

enum class Direction : uint8_t {
  FORWARD = 0,
  REVERSE
};

enum class RejectCode : uint8_t {
  OK = 0,
  BAD_STATE,
  BAD_RANGE,
  BAD_PUMP,
  BAD_DIRECTION,
  E_STOP_ACTIVE,
  SCALE_UNCALIBRATED,
  SAFETY_LIMIT_UNCONFIGURED,
  TARE_STABILITY_UNCONFIGURED,
  DEVICE_ID_UNPROVISIONED,
  DEAD_TIME,
  TRIAL_MISMATCH,
  COMMAND_SEQUENCE,
  OUTPUT_FAILURE
};

struct CoreLimits {
  uint32_t heartbeatTimeoutMs;
  uint32_t sensorTimeoutMs;
  uint32_t maximumTareWaitMs;
  uint32_t maximumRunMs;
  uint32_t maximumSettleMs;
  uint32_t directionDeadTimeMs;
  uint32_t maximumConfiguredMassMg;
  uint32_t tareSpanCounts;
  uint16_t kamoerMinimumDutyBasisPoints;
};

struct StartStep {
  Pump pump;
  Direction direction;
  uint16_t stepIndex;
  uint16_t dutyBasisPoints;
  uint32_t warmupMs;
  uint32_t collectionMs;
  uint32_t settleMs;
  uint32_t hardStopMs;
  uint32_t maximumMassMg;
};

struct SampleResult {
  bool stateChanged;
  bool tareCompleted;
  int32_t tareRaw;
};

class BenchCore {
 public:
  explicit BenchCore(const CoreLimits& limits);

  void begin(uint32_t nowMs, bool eStopHealthy);
  void heartbeat(uint32_t nowMs);
  RejectCode requestTare(uint32_t minimumStableMs, uint32_t maximumWaitMs,
                         uint32_t nowMs);
  RejectCode requestStart(const StartStep& step, bool scaleCalibrated,
                          bool deviceIdProvisioned, uint32_t nowMs);
  RejectCode requestStop(uint32_t nowMs);
  RejectCode requestClear(bool eStopHealthy, uint32_t nowMs);
  SampleResult onSample(int32_t rawAdc, bool saturated, bool massValid,
                        int32_t massMg, uint32_t nowMs);
  bool tick(uint32_t nowMs, bool eStopHealthy);
  bool raiseFault(FaultCode code, uint32_t nowMs);

  BenchState state() const { return state_; }
  FaultCode fault() const { return fault_; }
  bool motorEnabled() const { return motorEnabled_; }
  Pump pump() const { return activeStep_.pump; }
  Direction direction() const { return activeStep_.direction; }
  uint16_t dutyBasisPoints() const { return activeStep_.dutyBasisPoints; }
  uint16_t stepIndex() const { return activeStep_.stepIndex; }
  uint32_t maximumMassMg() const { return activeStep_.maximumMassMg; }

 private:
  static bool elapsed(uint32_t nowMs, uint32_t sinceMs, uint32_t durationMs);
  void setState(BenchState next, uint32_t nowMs);
  void clearStep();
  void resetTareWindow();
  bool activeNeedsHeartbeat() const;
  bool activeNeedsSensor() const;

  CoreLimits limits_;
  BenchState state_;
  FaultCode fault_;
  StartStep activeStep_;
  bool motorEnabled_;
  uint32_t stateEnteredMs_;
  uint32_t lastHeartbeatMs_;
  uint32_t lastSampleMs_;
  uint32_t motorOffMs_;
  uint32_t runStopAfterMs_;
  uint32_t hardStopAfterMs_;
  uint32_t settleAfterMs_;
  uint32_t tareMinimumStableMs_;
  uint32_t tareMaximumWaitMs_;
  uint32_t tareStableSinceMs_;
  int32_t tareMinimumRaw_;
  int32_t tareMaximumRaw_;
  int64_t tareSumRaw_;
  uint16_t tareSampleCount_;
};

const char* benchStateName(BenchState state);
const char* faultCodeName(FaultCode code);
const char* rejectCodeName(RejectCode code);
const char* pumpName(Pump pump);

}  // namespace tnp

#endif
