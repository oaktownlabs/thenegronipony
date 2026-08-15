#ifndef TNP_WIRE_PROTOCOL_H
#define TNP_WIRE_PROTOCOL_H

#include <Arduino.h>
#include <stddef.h>
#include <stdint.h>

#include "core/BenchCore.h"
#include "core/CommandParser.h"

namespace tnp {

static const size_t MAXIMUM_INBOUND_LINE_BYTES = 191;

enum class ReadStatus : uint8_t {
  NONE = 0,
  COMMAND,
  INVALID
};

struct TelemetryContext {
  const char* trialId;
  uint16_t stepIndex;
  bool stepValid;
  Pump pump;
  uint16_t dutyBasisPoints;
  uint16_t dutyTimerCount;
  bool tareValid;
  int32_t tareRaw;
};

class WireProtocol {
 public:
  WireProtocol(Stream& input, Print& output, const char* deviceId,
               const char* bootId);

  ReadStatus poll(Command* command, ParseError* error);
  void emitHello(uint32_t nowMs, uint32_t lastCommandNumber,
                 bool scaleConfigured, uint32_t configuredMassLimitMg);
  void emitAck(uint32_t nowMs, const Command& command, bool accepted,
               bool duplicate, uint32_t lastCommandNumber,
               RejectCode result, BenchState state);
  void emitState(uint32_t nowMs, BenchState state,
                 const TelemetryContext& context);
  void emitSample(uint32_t nowMs, BenchState state,
                  const TelemetryContext& context, int32_t rawAdc,
                  bool massValid, int32_t massMg, uint8_t flags);
  void emitHeartbeat(uint32_t nowMs, BenchState state,
                     uint32_t lastCommandNumber);
  void emitFault(uint32_t nowMs, FaultCode code);

  uint32_t nextSequence() const { return sequence_; }

 private:
  void beginFrame(const __FlashStringHelper* type, uint32_t nowMs);
  void printState(BenchState state);
  void printPump(Pump pump);
  void printFault(FaultCode fault);
  void printReject(RejectCode reject);
  void printTrial(const char* trialId);

  Stream& input_;
  Print& output_;
  const char* deviceId_;
  const char* bootId_;
  char line_[MAXIMUM_INBOUND_LINE_BYTES + 1U];
  size_t lineLength_;
  bool lineOverflow_;
  uint32_t sequence_;
};

}  // namespace tnp

#endif
