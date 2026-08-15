#ifndef TNP_COMMAND_PARSER_H
#define TNP_COMMAND_PARSER_H

#include <stddef.h>
#include <stdint.h>

#include "BenchCore.h"

namespace tnp {

static const size_t COMMAND_ID_CAPACITY = 17;
static const size_t TRIAL_ID_CAPACITY = 25;

enum class CommandType : uint8_t {
  NONE = 0,
  HELLO,
  HEARTBEAT,
  TARE,
  RUN,
  STOP,
  CLEAR
};

enum class ParseError : uint8_t {
  NONE = 0,
  SYNTAX,
  UNKNOWN_FIELD,
  DUPLICATE_FIELD,
  MISSING_FIELD,
  BAD_VERSION,
  BAD_TYPE,
  BAD_VALUE,
  VALUE_TOO_LONG,
  NUMBER_OVERFLOW
};

struct Command {
  CommandType type;
  char commandId[COMMAND_ID_CAPACITY];
  char trialId[TRIAL_ID_CAPACITY];
  uint32_t commandNumber;
  uint32_t minimumStableMs;
  uint32_t maximumWaitMs;
  StartStep step;
  uint32_t fingerprint;
};

ParseError parseCommand(const char* line, Command* output);
const char* parseErrorName(ParseError error);

enum class GateStatus : uint8_t {
  NEW_COMMAND = 0,
  DUPLICATE,
  STALE,
  GAP,
  CONFLICT,
  EXHAUSTED
};

class CommandGate {
 public:
  CommandGate();
  GateStatus inspect(uint32_t number, uint32_t fingerprint) const;
  void commit(uint32_t number, uint32_t fingerprint, bool accepted,
              RejectCode result);
  uint32_t lastNumber() const { return lastNumber_; }
  bool cachedAccepted() const { return cachedAccepted_; }
  RejectCode cachedResult() const { return cachedResult_; }

 private:
  uint32_t lastNumber_;
  uint32_t lastFingerprint_;
  bool cachedAccepted_;
  RejectCode cachedResult_;
};

}  // namespace tnp

#endif
