#include <Arduino.h>
#include <EEPROM.h>
#include <avr/wdt.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "src/BenchConfig.h"
#include "src/Hx711.h"
#include "src/MotorDriver.h"
#include "src/WireProtocol.h"
#include "src/core/BenchCore.h"
#include "src/core/CommandParser.h"

#if defined(__AVR__)
volatile uint8_t g_resetCause __attribute__((section(".noinit")));
void captureResetCause(void)
    __attribute__((used, naked, section(".init3")));
#else
volatile uint8_t g_resetCause = 0;
void captureResetCause(void);
#endif
void captureResetCause(void) {
  g_resetCause = MCUSR;
  MCUSR = 0;
  wdt_disable();
}

namespace {

const tnp::CoreLimits CORE_LIMITS = {
    tnp::config::HEARTBEAT_TIMEOUT_MS,
    tnp::config::HX711_READY_TIMEOUT_MS,
    tnp::config::MAXIMUM_TARE_WAIT_MS,
    tnp::config::MAXIMUM_RUN_MS,
    tnp::config::MAXIMUM_SETTLE_MS,
    tnp::config::DIRECTION_DEAD_TIME_MS,
    tnp::config::MAXIMUM_CONFIGURED_LIQUID_MASS_MG,
    tnp::config::TARE_STABILITY_SPAN_COUNTS,
    tnp::config::KAMOER_MINIMUM_DUTY_BASIS_POINTS};

tnp::BenchCore bench(CORE_LIMITS);
tnp::CommandGate commandGate;
tnp::Hx711 scale;
tnp::MotorDriver motors;
char bootId[9] = "00000000";
tnp::WireProtocol wire(Serial, Serial, TNP_DEVICE_ID, bootId);
char activeTrial[tnp::TRIAL_ID_CAPACITY] = {0};
uint32_t lastDeviceHeartbeatMs = 0;
uint32_t lastControlWatchdogToggleMs = 0;
bool controlWatchdogLevel = false;

struct __attribute__((packed)) BootRecord {
  uint16_t magic;
  uint32_t counter;
  uint32_t inverse;
};

const uint16_t BOOT_RECORD_MAGIC = 0x544EU;
const uint8_t BOOT_RECORD_SLOTS = 8;

bool validBootRecord(const BootRecord& record) {
  return record.magic == BOOT_RECORD_MAGIC &&
         record.inverse == static_cast<uint32_t>(~record.counter) &&
         record.counter != 0;
}

BootRecord readBootRecord(uint8_t slot) {
  BootRecord record;
  const int base = static_cast<int>(slot) * sizeof(BootRecord);
  uint8_t* bytes = reinterpret_cast<uint8_t*>(&record);
  for (size_t index = 0; index < sizeof(BootRecord); ++index) {
    bytes[index] = EEPROM.read(base + index);
  }
  return record;
}

void writeBootRecord(uint8_t slot, uint32_t counter) {
  BootRecord record = {BOOT_RECORD_MAGIC, counter,
                       static_cast<uint32_t>(~counter)};
  const int base = static_cast<int>(slot) * sizeof(BootRecord);
  const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&record);
  // Invalidate first, write payload, then commit the magic last. A reset during
  // the write leaves the preceding slot valid.
  EEPROM.update(base, 0);
  EEPROM.update(base + 1, 0);
  for (size_t index = sizeof(record.magic); index < sizeof(BootRecord); ++index) {
    EEPROM.update(base + index, bytes[index]);
  }
  EEPROM.update(base, bytes[0]);
  EEPROM.update(base + 1, bytes[1]);
}

uint32_t nextBootCounter() {
  bool found = false;
  uint32_t bestCounter = 0;
  uint8_t bestSlot = 0;
  for (uint8_t slot = 0; slot < BOOT_RECORD_SLOTS; ++slot) {
    const BootRecord record = readBootRecord(slot);
    if (!validBootRecord(record)) continue;
    if (!found || static_cast<int32_t>(record.counter - bestCounter) > 0) {
      found = true;
      bestCounter = record.counter;
      bestSlot = slot;
    }
  }
  uint32_t next = found ? bestCounter + 1U : 1U;
  if (next == 0) next = 1U;
  const uint8_t nextSlot = found ? (bestSlot + 1U) % BOOT_RECORD_SLOTS : 0;
  writeBootRecord(nextSlot, next);
  return next;
}

void formatHex8(uint32_t value, char* destination) {
  static const char digits[] = "0123456789abcdef";
  for (int8_t index = 7; index >= 0; --index) {
    destination[index] = digits[value & 0x0FU];
    value >>= 4U;
  }
  destination[8] = '\0';
}

bool eStopHealthy() {
  return digitalRead(tnp::config::E_STOP_SENSE_PIN) ==
         tnp::config::E_STOP_HEALTHY_LEVEL;
}

void serviceControlWatchdog(uint32_t nowMs) {
  const bool permitted = eStopHealthy() &&
                         bench.state() != tnp::BenchState::BOOT &&
                         bench.state() != tnp::BenchState::FAULT;
  if (!permitted) {
    controlWatchdogLevel = false;
    digitalWrite(tnp::config::CONTROL_WATCHDOG_PIN, LOW);
    lastControlWatchdogToggleMs = nowMs;
    return;
  }
  if (static_cast<uint32_t>(nowMs - lastControlWatchdogToggleMs) <
      tnp::config::CONTROL_WATCHDOG_TOGGLE_MS) {
    return;
  }
  controlWatchdogLevel = !controlWatchdogLevel;
  digitalWrite(tnp::config::CONTROL_WATCHDOG_PIN,
               controlWatchdogLevel ? HIGH : LOW);
  lastControlWatchdogToggleMs = nowMs;
}

void clearTrial() { activeTrial[0] = '\0'; }

void setTrial(const char* trialId) {
  strncpy(activeTrial, trialId, sizeof(activeTrial) - 1U);
  activeTrial[sizeof(activeTrial) - 1U] = '\0';
}

tnp::TelemetryContext telemetryContext() {
  tnp::TelemetryContext context;
  context.trialId = activeTrial;
  const bool active = activeTrial[0] != '\0';
  context.stepIndex = active ? bench.stepIndex() : 0;
  context.stepValid = active && bench.pump() != tnp::Pump::NONE;
  context.pump = active ? bench.pump() : tnp::Pump::NONE;
  context.dutyBasisPoints = active ? bench.dutyBasisPoints() : 0;
  context.dutyTimerCount = active ? motors.timerCount() : 0;
  context.tareValid = scale.haveTare();
  context.tareRaw = scale.tareRaw();
  return context;
}

bool synchronizeMotor(uint32_t nowMs) {
  if (!bench.motorEnabled()) {
    if (motors.isOn()) motors.forceOff();
    return true;
  }
  if (motors.isOn()) return true;
  if (motors.start(bench.pump(), bench.direction(), bench.dutyBasisPoints())) {
    return true;
  }
  motors.forceOff();
  bench.raiseFault(tnp::FaultCode::INVALID_COMMAND, nowMs);
  return false;
}

void emitCurrentState(uint32_t nowMs) {
  const tnp::BenchState state = bench.state();
  // Emit the terminal state with the still-active trial context before making
  // later 10 SPS telemetry anonymous. This gives the host one finite terminal
  // marker without leaving an endless trial-tagged sample tail in its spool.
  wire.emitState(nowMs, state, telemetryContext());
  if (state == tnp::BenchState::FAULT) {
    wire.emitFault(nowMs, bench.fault());
  }
  if (state == tnp::BenchState::COMPLETE ||
      state == tnp::BenchState::FAULT) {
    clearTrial();
  }
}

void failProtocol(uint32_t nowMs) {
  motors.forceOff();
  if (bench.fault() != tnp::FaultCode::E_STOP) {
    bench.raiseFault(tnp::FaultCode::PROTOCOL, nowMs);
  }
  emitCurrentState(nowMs);
}

void rejectSequence(const tnp::Command& command, uint32_t nowMs) {
  motors.forceOff();
  if (bench.fault() != tnp::FaultCode::E_STOP) {
    bench.raiseFault(tnp::FaultCode::PROTOCOL, nowMs);
  }
  wire.emitAck(nowMs, command, false, false, commandGate.lastNumber(),
               tnp::RejectCode::COMMAND_SEQUENCE, bench.state());
  emitCurrentState(nowMs);
}

void processCommand(const tnp::Command& command, uint32_t nowMs) {
  if (command.type == tnp::CommandType::HELLO) {
    wire.emitHello(nowMs, commandGate.lastNumber(),
                   scale.calibrationFactorConfigured(),
                   tnp::config::MAXIMUM_CONFIGURED_LIQUID_MASS_MG);
    return;
  }

  const tnp::GateStatus gate =
      commandGate.inspect(command.commandNumber, command.fingerprint);
  if (gate == tnp::GateStatus::DUPLICATE) {
    wire.emitAck(nowMs, command, commandGate.cachedAccepted(), true,
                 commandGate.lastNumber(), commandGate.cachedResult(),
                 bench.state());
    return;
  }
  if (gate != tnp::GateStatus::NEW_COMMAND) {
    rejectSequence(command, nowMs);
    return;
  }

  const tnp::BenchState previousState = bench.state();
  const tnp::FaultCode previousFault = bench.fault();
  tnp::RejectCode result = tnp::RejectCode::OK;
  switch (command.type) {
    case tnp::CommandType::HEARTBEAT:
      bench.heartbeat(nowMs);
      break;
    case tnp::CommandType::TARE:
      result = bench.requestTare(command.minimumStableMs,
                                 command.maximumWaitMs, nowMs);
      if (result == tnp::RejectCode::OK) {
        scale.clearTare();
        setTrial(command.trialId);
      }
      break;
    case tnp::CommandType::RUN:
      if (strcmp(activeTrial, command.trialId) != 0) {
        result = tnp::RejectCode::TRIAL_MISMATCH;
      } else {
        result = bench.requestStart(command.step, scale.massAvailable(),
                                    tnp::config::DEVICE_ID_PROVISIONED, nowMs);
      }
      break;
    case tnp::CommandType::STOP:
      result = bench.requestStop(nowMs);
      if (result == tnp::RejectCode::OK) {
        scale.clearTare();
      }
      break;
    case tnp::CommandType::CLEAR:
      result = bench.requestClear(eStopHealthy(), nowMs);
      if (result == tnp::RejectCode::OK) {
        scale.clearTare();
        clearTrial();
      }
      break;
    case tnp::CommandType::HELLO:
    case tnp::CommandType::NONE:
      result = tnp::RejectCode::BAD_STATE;
      break;
  }

  bool accepted = result == tnp::RejectCode::OK;
  if (!accepted) {
    motors.forceOff();
    if (bench.state() != tnp::BenchState::FAULT) {
      bench.raiseFault(tnp::FaultCode::INVALID_COMMAND, nowMs);
    }
  } else if (!synchronizeMotor(nowMs)) {
    accepted = false;
    result = tnp::RejectCode::OUTPUT_FAILURE;
  }
  commandGate.commit(command.commandNumber, command.fingerprint, accepted,
                     result);
  wire.emitAck(nowMs, command, accepted, false, commandGate.lastNumber(), result,
               bench.state());
  if (bench.state() != previousState || bench.fault() != previousFault) {
    emitCurrentState(nowMs);
  }
  // STOP is a deliberate terminal boundary even though the core returns to
  // IDLE. Preserve its trial through the acknowledgment/state transition, then
  // make every subsequent sample finite and anonymous.
  if (accepted && command.type == tnp::CommandType::STOP) clearTrial();
}

void readScale(uint32_t nowMs) {
  int32_t rawAdc = 0;
  if (!scale.readIfReady(nowMs, &rawAdc)) return;
  int32_t massMg = 0;
  const bool massValid = scale.massMg(rawAdc, &massMg);
  const tnp::SampleResult sample = bench.onSample(
      rawAdc, scale.saturated(rawAdc), massValid, massMg, nowMs);
  if (sample.tareCompleted) scale.setTareRaw(sample.tareRaw);
  if (sample.stateChanged) synchronizeMotor(nowMs);

  uint8_t flags = 0;
  if (motors.isOn()) flags |= 1U << 0;
  if (massValid) flags |= 1U << 1;
  if (!eStopHealthy()) flags |= 1U << 2;
  wire.emitSample(nowMs, bench.state(), telemetryContext(), rawAdc, massValid,
                  massMg, flags);
  if (sample.stateChanged) emitCurrentState(nowMs);
}

}  // namespace

void setup() {
  // Write the off level before changing the data direction so D8 never emits
  // a deliberate high during initialization. An external pull-down covers the
  // bootloader and unpowered states that firmware cannot control.
  digitalWrite(tnp::config::CONTROL_WATCHDOG_PIN, LOW);
  pinMode(tnp::config::CONTROL_WATCHDOG_PIN, OUTPUT);
  pinMode(tnp::config::E_STOP_SENSE_PIN, INPUT_PULLUP);
  motors.begin();
  scale.begin();
  Serial.begin(tnp::config::SERIAL_BAUD);

  formatHex8(nextBootCounter(), bootId);
  const uint32_t nowMs = millis();
  bench.begin(nowMs, eStopHealthy());
  if ((g_resetCause & _BV(WDRF)) != 0) {
    bench.raiseFault(tnp::FaultCode::MCU_WATCHDOG, nowMs);
  }
  motors.forceOff();
  lastControlWatchdogToggleMs = nowMs;
  serviceControlWatchdog(nowMs);
  wire.emitHello(nowMs, commandGate.lastNumber(),
                 scale.calibrationFactorConfigured(),
                 tnp::config::MAXIMUM_CONFIGURED_LIQUID_MASS_MG);
  emitCurrentState(nowMs);
  lastDeviceHeartbeatMs = nowMs;
  wdt_enable(WDTO_2S);
}

void loop() {
  wdt_reset();
  const uint32_t nowMs = millis();

  if (bench.tick(nowMs, eStopHealthy())) {
    synchronizeMotor(nowMs);
    emitCurrentState(nowMs);
  }

  tnp::Command command;
  tnp::ParseError parseError = tnp::ParseError::NONE;
  const tnp::ReadStatus readStatus = wire.poll(&command, &parseError);
  if (readStatus == tnp::ReadStatus::INVALID) {
    failProtocol(nowMs);
  } else if (readStatus == tnp::ReadStatus::COMMAND) {
    processCommand(command, nowMs);
  }

  readScale(nowMs);
  if (static_cast<uint32_t>(nowMs - lastDeviceHeartbeatMs) >=
      tnp::config::DEVICE_HEARTBEAT_INTERVAL_MS) {
    wire.emitHeartbeat(nowMs, bench.state(), commandGate.lastNumber());
    lastDeviceHeartbeatMs = nowMs;
  }
  serviceControlWatchdog(nowMs);
  wdt_reset();
}
