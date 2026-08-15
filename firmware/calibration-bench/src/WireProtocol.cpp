#include "WireProtocol.h"

#include "BenchConfig.h"

namespace tnp {

WireProtocol::WireProtocol(Stream& input, Print& output, const char* deviceId,
                           const char* bootId)
    : input_(input),
      output_(output),
      deviceId_(deviceId),
      bootId_(bootId),
      lineLength_(0),
      lineOverflow_(false),
      sequence_(1) {
  line_[0] = '\0';
}

ReadStatus WireProtocol::poll(Command* command, ParseError* error) {
  if (command == NULL || error == NULL) return ReadStatus::INVALID;
  while (input_.available() > 0) {
    const int incoming = input_.read();
    if (incoming < 0) break;
    const char byte = static_cast<char>(incoming);
    if (byte == '\r') continue;
    if (byte == '\n') {
      if (lineOverflow_) {
        lineLength_ = 0;
        lineOverflow_ = false;
        line_[0] = '\0';
        *error = ParseError::VALUE_TOO_LONG;
        return ReadStatus::INVALID;
      }
      if (lineLength_ == 0) continue;
      line_[lineLength_] = '\0';
      lineLength_ = 0;
      *error = parseCommand(line_, command);
      return *error == ParseError::NONE ? ReadStatus::COMMAND
                                        : ReadStatus::INVALID;
    }
    if (byte == '\0' || lineLength_ >= MAXIMUM_INBOUND_LINE_BYTES) {
      lineOverflow_ = true;
      continue;
    }
    if (!lineOverflow_) line_[lineLength_++] = byte;
  }
  return ReadStatus::NONE;
}

void WireProtocol::emitHello(uint32_t nowMs, uint32_t lastCommandNumber,
                             bool scaleConfigured,
                             uint32_t configuredMassLimitMg) {
  beginFrame(F("hello"), nowMs);
  output_.print(F(",\"fw\":\""));
  output_.print(F(TNP_FIRMWARE_VERSION));
  output_.print(F("\",\"baud\":"));
  output_.print(config::SERIAL_BAUD);
  output_.print(F(",\"hz\":10,\"lastn\":"));
  output_.print(lastCommandNumber);
  output_.print(F(",\"scale\":"));
  output_.print(scaleConfigured ? 1 : 0);
  output_.print(F(",\"cal\":"));
  if (scaleConfigured) {
    output_.print('"');
    output_.print(F(TNP_SCALE_CALIBRATION_ID));
    output_.print('"');
  } else {
    output_.print(F("null"));
  }
  output_.print(F(",\"caln\":"));
  if (scaleConfigured) {
    output_.print(config::SCALE_COUNTS_PER_GRAM_NUMERATOR);
  } else {
    output_.print(F("null"));
  }
  output_.print(F(",\"cald\":"));
  if (scaleConfigured) {
    output_.print(config::SCALE_COUNTS_PER_GRAM_DENOMINATOR);
  } else {
    output_.print(F("null"));
  }
  output_.print(F(",\"idok\":"));
  output_.print(config::DEVICE_ID_PROVISIONED ? 1 : 0);
  output_.print(F(",\"limitmg\":"));
  output_.print(configuredMassLimitMg);
  output_.println('}');
}

void WireProtocol::emitAck(uint32_t nowMs, const Command& command,
                           bool accepted, bool duplicate,
                           uint32_t lastCommandNumber, RejectCode result,
                           BenchState state) {
  beginFrame(F("ack"), nowMs);
  output_.print(F(",\"id\":\""));
  output_.print(command.commandId);
  output_.print(F("\",\"n\":"));
  output_.print(command.commandNumber);
  output_.print(F(",\"ok\":"));
  output_.print(accepted ? 1 : 0);
  output_.print(F(",\"dup\":"));
  output_.print(duplicate ? 1 : 0);
  output_.print(F(",\"lastn\":"));
  output_.print(lastCommandNumber);
  output_.print(F(",\"state\":\""));
  printState(state);
  output_.print(F("\",\"code\":\""));
  printReject(result);
  output_.println(F("\"}"));
}

void WireProtocol::emitState(uint32_t nowMs, BenchState state,
                             const TelemetryContext& context) {
  beginFrame(F("state"), nowMs);
  output_.print(F(",\"state\":\""));
  printState(state);
  output_.print(F("\",\"trial\":"));
  printTrial(context.trialId);
  output_.print(F(",\"step\":"));
  if (context.stepValid) output_.print(context.stepIndex);
  else output_.print(F("null"));
  output_.print(F(",\"pump\":\""));
  printPump(context.pump);
  output_.print(F("\",\"duty\":"));
  output_.print(context.dutyBasisPoints);
  output_.print(F(",\"zero\":"));
  if (context.tareValid) output_.print(context.tareRaw);
  else output_.print(F("null"));
  output_.println('}');
}

void WireProtocol::emitSample(uint32_t nowMs, BenchState state,
                              const TelemetryContext& context, int32_t rawAdc,
                              bool massValid, int32_t massMg, uint8_t flags) {
  beginFrame(F("s"), nowMs);
  output_.print(F(",\"trial\":"));
  printTrial(context.trialId);
  output_.print(F(",\"step\":"));
  if (context.stepValid) output_.print(context.stepIndex);
  else output_.print(F("null"));
  output_.print(F(",\"state\":\""));
  printState(state);
  output_.print(F("\",\"pump\":\""));
  printPump(context.pump);
  output_.print(F("\",\"raw\":"));
  output_.print(rawAdc);
  output_.print(F(",\"mg\":"));
  if (massValid) output_.print(massMg);
  else output_.print(F("null"));
  output_.print(F(",\"duty\":"));
  output_.print(context.dutyBasisPoints);
  output_.print(F(",\"tc\":"));
  output_.print(context.dutyTimerCount);
  output_.print(F(",\"flags\":"));
  output_.print(flags);
  output_.println('}');
}

void WireProtocol::emitHeartbeat(uint32_t nowMs, BenchState state,
                                 uint32_t lastCommandNumber) {
  beginFrame(F("hb"), nowMs);
  output_.print(F(",\"state\":\""));
  printState(state);
  output_.print(F("\",\"lastn\":"));
  output_.print(lastCommandNumber);
  output_.println('}');
}

void WireProtocol::emitFault(uint32_t nowMs, FaultCode code) {
  beginFrame(F("fault"), nowMs);
  output_.print(F(",\"state\":\"fault\",\"code\":\""));
  printFault(code);
  output_.println(F("\"}"));
}

void WireProtocol::beginFrame(const __FlashStringHelper* type,
                              uint32_t nowMs) {
  output_.print(F("{\"v\":1,\"t\":\""));
  output_.print(type);
  output_.print(F("\",\"dev\":\""));
  output_.print(deviceId_);
  output_.print(F("\",\"boot\":\""));
  output_.print(bootId_);
  output_.print(F("\",\"seq\":"));
  output_.print(sequence_++);
  output_.print(F(",\"ms\":"));
  output_.print(nowMs);
}

void WireProtocol::printState(BenchState state) {
  switch (state) {
    case BenchState::BOOT: output_.print(F("boot")); break;
    case BenchState::IDLE: output_.print(F("idle")); break;
    case BenchState::TARE: output_.print(F("tare")); break;
    case BenchState::ARMED: output_.print(F("armed")); break;
    case BenchState::RUNNING: output_.print(F("running")); break;
    case BenchState::SETTLING: output_.print(F("settling")); break;
    case BenchState::COMPLETE: output_.print(F("complete")); break;
    case BenchState::FAULT: output_.print(F("fault")); break;
  }
}

void WireProtocol::printPump(Pump pump) {
  switch (pump) {
    case Pump::NONE: output_.print(F("none")); break;
    case Pump::KAMOER: output_.print(F("k")); break;
    case Pump::GIKFUN: output_.print(F("g")); break;
  }
}

void WireProtocol::printFault(FaultCode fault) {
  switch (fault) {
    case FaultCode::NONE: output_.print(F("none")); break;
    case FaultCode::E_STOP: output_.print(F("e_stop")); break;
    case FaultCode::HEARTBEAT_TIMEOUT:
      output_.print(F("heartbeat_timeout")); break;
    case FaultCode::SENSOR_TIMEOUT: output_.print(F("sensor_timeout")); break;
    case FaultCode::HX711_SATURATION:
      output_.print(F("hx711_saturation")); break;
    case FaultCode::MASS_UNAVAILABLE:
      output_.print(F("mass_unavailable")); break;
    case FaultCode::MAXIMUM_MASS: output_.print(F("maximum_mass")); break;
    case FaultCode::HARD_STOP: output_.print(F("hard_stop")); break;
    case FaultCode::PROTOCOL: output_.print(F("protocol")); break;
    case FaultCode::INVALID_COMMAND:
      output_.print(F("invalid_command")); break;
    case FaultCode::MCU_WATCHDOG:
      output_.print(F("mcu_watchdog")); break;
  }
}

void WireProtocol::printReject(RejectCode reject) {
  switch (reject) {
    case RejectCode::OK: output_.print(F("ok")); break;
    case RejectCode::BAD_STATE: output_.print(F("bad_state")); break;
    case RejectCode::BAD_RANGE: output_.print(F("bad_range")); break;
    case RejectCode::BAD_PUMP: output_.print(F("bad_pump")); break;
    case RejectCode::BAD_DIRECTION: output_.print(F("bad_direction")); break;
    case RejectCode::E_STOP_ACTIVE:
      output_.print(F("e_stop_active")); break;
    case RejectCode::SCALE_UNCALIBRATED:
      output_.print(F("scale_uncalibrated")); break;
    case RejectCode::SAFETY_LIMIT_UNCONFIGURED:
      output_.print(F("safety_limit_unconfigured")); break;
    case RejectCode::TARE_STABILITY_UNCONFIGURED:
      output_.print(F("tare_stability_unconfigured")); break;
    case RejectCode::DEVICE_ID_UNPROVISIONED:
      output_.print(F("device_id_unprovisioned")); break;
    case RejectCode::DEAD_TIME: output_.print(F("dead_time")); break;
    case RejectCode::TRIAL_MISMATCH:
      output_.print(F("trial_mismatch")); break;
    case RejectCode::COMMAND_SEQUENCE:
      output_.print(F("command_sequence")); break;
    case RejectCode::OUTPUT_FAILURE:
      output_.print(F("output_failure")); break;
  }
}

void WireProtocol::printTrial(const char* trialId) {
  if (trialId == NULL || trialId[0] == '\0') {
    output_.print(F("null"));
    return;
  }
  output_.print('"');
  output_.print(trialId);
  output_.print('"');
}

}  // namespace tnp
