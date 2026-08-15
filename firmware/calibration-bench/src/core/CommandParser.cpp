#include "CommandParser.h"

#include <ctype.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>

namespace tnp {
namespace {

enum FieldBit : uint16_t {
  FIELD_V = 1U << 0,
  FIELD_T = 1U << 1,
  FIELD_ID = 1U << 2,
  FIELD_N = 1U << 3,
  FIELD_TRIAL = 1U << 4,
  FIELD_STABLE = 1U << 5,
  FIELD_WAIT = 1U << 6,
  FIELD_STEP = 1U << 7,
  FIELD_PUMP = 1U << 8,
  FIELD_DIR = 1U << 9,
  FIELD_DUTY = 1U << 10,
  FIELD_WARM = 1U << 11,
  FIELD_COLLECT = 1U << 12,
  FIELD_SETTLE = 1U << 13,
  FIELD_HARD = 1U << 14,
  FIELD_MAXMG = 1U << 15
};

struct Cursor {
  const char* p;
};

void initialize(Command* command) {
  memset(command, 0, sizeof(*command));
  command->type = CommandType::NONE;
  command->step.pump = Pump::NONE;
  command->step.direction = Direction::FORWARD;
}

void skipWhitespace(Cursor* cursor) {
  while (*cursor->p == ' ' || *cursor->p == '\t') ++cursor->p;
}

bool take(Cursor* cursor, char expected) {
  skipWhitespace(cursor);
  if (*cursor->p != expected) return false;
  ++cursor->p;
  return true;
}

bool validIdentifierCharacter(char c) {
  return isalnum(static_cast<unsigned char>(c)) || c == '-' || c == '_' ||
         c == '.' || c == ':';
}

ParseError parseString(Cursor* cursor, char* destination, size_t capacity,
                       bool identifier) {
  skipWhitespace(cursor);
  if (*cursor->p != '"') return ParseError::SYNTAX;
  ++cursor->p;
  size_t length = 0;
  while (*cursor->p != '"') {
    const char c = *cursor->p;
    if (c == '\0' || c == '\\' ||
        static_cast<unsigned char>(c) < 0x20 ||
        (identifier && !validIdentifierCharacter(c))) {
      return ParseError::BAD_VALUE;
    }
    if (length + 1 >= capacity) return ParseError::VALUE_TOO_LONG;
    destination[length++] = c;
    ++cursor->p;
  }
  ++cursor->p;
  destination[length] = '\0';
  return length == 0 ? ParseError::BAD_VALUE : ParseError::NONE;
}

ParseError parseUnsigned(Cursor* cursor, uint32_t* value) {
  skipWhitespace(cursor);
  if (!isdigit(static_cast<unsigned char>(*cursor->p))) {
    return ParseError::BAD_VALUE;
  }
  uint32_t parsed = 0;
  do {
    const uint8_t digit = static_cast<uint8_t>(*cursor->p - '0');
    if (parsed > (UINT32_MAX - digit) / 10U) {
      return ParseError::NUMBER_OVERFLOW;
    }
    parsed = parsed * 10U + digit;
    ++cursor->p;
  } while (isdigit(static_cast<unsigned char>(*cursor->p)));
  *value = parsed;
  return ParseError::NONE;
}

uint32_t fnvByte(uint32_t hash, uint8_t value) {
  hash ^= value;
  return hash * 16777619UL;
}

uint32_t fnvData(uint32_t hash, const void* data, size_t length) {
  const uint8_t* bytes = static_cast<const uint8_t*>(data);
  for (size_t index = 0; index < length; ++index) {
    hash = fnvByte(hash, bytes[index]);
  }
  return hash;
}

uint32_t fingerprint(const Command& command) {
  uint32_t hash = 2166136261UL;
  hash = fnvByte(hash, static_cast<uint8_t>(command.type));
  hash = fnvData(hash, command.commandId, strlen(command.commandId) + 1U);
  hash = fnvData(hash, command.trialId, strlen(command.trialId) + 1U);
  hash = fnvData(hash, &command.commandNumber, sizeof(command.commandNumber));
  hash = fnvData(hash, &command.minimumStableMs,
                 sizeof(command.minimumStableMs));
  hash = fnvData(hash, &command.maximumWaitMs,
                 sizeof(command.maximumWaitMs));
  hash = fnvByte(hash, static_cast<uint8_t>(command.step.pump));
  hash = fnvByte(hash, static_cast<uint8_t>(command.step.direction));
  hash = fnvData(hash, &command.step.stepIndex,
                 sizeof(command.step.stepIndex));
  hash = fnvData(hash, &command.step.dutyBasisPoints,
                 sizeof(command.step.dutyBasisPoints));
  hash = fnvData(hash, &command.step.warmupMs,
                 sizeof(command.step.warmupMs));
  hash = fnvData(hash, &command.step.collectionMs,
                 sizeof(command.step.collectionMs));
  hash = fnvData(hash, &command.step.settleMs,
                 sizeof(command.step.settleMs));
  hash = fnvData(hash, &command.step.hardStopMs,
                 sizeof(command.step.hardStopMs));
  hash = fnvData(hash, &command.step.maximumMassMg,
                 sizeof(command.step.maximumMassMg));
  return hash;
}

ParseError fieldForKey(const char* key, FieldBit* field) {
  if (strcmp(key, "v") == 0) *field = FIELD_V;
  else if (strcmp(key, "t") == 0) *field = FIELD_T;
  else if (strcmp(key, "id") == 0) *field = FIELD_ID;
  else if (strcmp(key, "n") == 0) *field = FIELD_N;
  else if (strcmp(key, "trial") == 0) *field = FIELD_TRIAL;
  else if (strcmp(key, "stable") == 0) *field = FIELD_STABLE;
  else if (strcmp(key, "wait") == 0) *field = FIELD_WAIT;
  else if (strcmp(key, "step") == 0) *field = FIELD_STEP;
  else if (strcmp(key, "pump") == 0) *field = FIELD_PUMP;
  else if (strcmp(key, "dir") == 0) *field = FIELD_DIR;
  else if (strcmp(key, "duty") == 0) *field = FIELD_DUTY;
  else if (strcmp(key, "warm") == 0) *field = FIELD_WARM;
  else if (strcmp(key, "collect") == 0) *field = FIELD_COLLECT;
  else if (strcmp(key, "settle") == 0) *field = FIELD_SETTLE;
  else if (strcmp(key, "hard") == 0) *field = FIELD_HARD;
  else if (strcmp(key, "maxmg") == 0) *field = FIELD_MAXMG;
  else return ParseError::UNKNOWN_FIELD;
  return ParseError::NONE;
}

ParseError parseFieldValue(Cursor* cursor, FieldBit field, Command* command,
                           uint32_t* version, char* type, char* pump,
                           char* direction) {
  uint32_t value = 0;
  ParseError error = ParseError::NONE;
  switch (field) {
    case FIELD_T:
      return parseString(cursor, type, 10, true);
    case FIELD_ID:
      return parseString(cursor, command->commandId, COMMAND_ID_CAPACITY, true);
    case FIELD_TRIAL:
      return parseString(cursor, command->trialId, TRIAL_ID_CAPACITY, true);
    case FIELD_PUMP:
      return parseString(cursor, pump, 2, true);
    case FIELD_DIR:
      return parseString(cursor, direction, 2, true);
    default:
      error = parseUnsigned(cursor, &value);
      if (error != ParseError::NONE) return error;
      break;
  }

  switch (field) {
    case FIELD_V: *version = value; break;
    case FIELD_N: command->commandNumber = value; break;
    case FIELD_STABLE: command->minimumStableMs = value; break;
    case FIELD_WAIT: command->maximumWaitMs = value; break;
    case FIELD_STEP:
      if (value > UINT16_MAX) return ParseError::BAD_VALUE;
      command->step.stepIndex = static_cast<uint16_t>(value);
      break;
    case FIELD_DUTY:
      if (value > UINT16_MAX) return ParseError::BAD_VALUE;
      command->step.dutyBasisPoints = static_cast<uint16_t>(value);
      break;
    case FIELD_WARM: command->step.warmupMs = value; break;
    case FIELD_COLLECT: command->step.collectionMs = value; break;
    case FIELD_SETTLE: command->step.settleMs = value; break;
    case FIELD_HARD: command->step.hardStopMs = value; break;
    case FIELD_MAXMG: command->step.maximumMassMg = value; break;
    default: break;
  }
  return ParseError::NONE;
}

bool maskEquals(uint16_t seen, uint16_t required) { return seen == required; }

}  // namespace

ParseError parseCommand(const char* line, Command* output) {
  if (line == NULL || output == NULL) return ParseError::BAD_VALUE;
  initialize(output);
  Cursor cursor = {line};
  uint16_t seen = 0;
  uint32_t version = 0;
  char type[10] = {0};
  char pump[2] = {0};
  char direction[2] = {0};

  if (!take(&cursor, '{')) return ParseError::SYNTAX;
  skipWhitespace(&cursor);
  if (*cursor.p == '}') return ParseError::MISSING_FIELD;

  while (true) {
    char key[9] = {0};
    ParseError error = parseString(&cursor, key, sizeof(key), true);
    if (error != ParseError::NONE) return error;
    FieldBit field = FIELD_V;
    error = fieldForKey(key, &field);
    if (error != ParseError::NONE) return error;
    if ((seen & field) != 0) return ParseError::DUPLICATE_FIELD;
    seen = static_cast<uint16_t>(seen | field);
    if (!take(&cursor, ':')) return ParseError::SYNTAX;
    error = parseFieldValue(&cursor, field, output, &version, type, pump,
                            direction);
    if (error != ParseError::NONE) return error;
    skipWhitespace(&cursor);
    if (*cursor.p == '}') {
      ++cursor.p;
      break;
    }
    if (*cursor.p != ',') return ParseError::SYNTAX;
    ++cursor.p;
  }
  skipWhitespace(&cursor);
  if (*cursor.p != '\0') return ParseError::SYNTAX;
  if (version != 1) return ParseError::BAD_VERSION;

  const uint16_t base = FIELD_V | FIELD_T | FIELD_ID;
  const uint16_t sequenced = base | FIELD_N;
  uint16_t required = base;
  if (strcmp(type, "hello") == 0) {
    output->type = CommandType::HELLO;
    required = base;
  } else if (strcmp(type, "hb") == 0) {
    output->type = CommandType::HEARTBEAT;
    required = sequenced;
  } else if (strcmp(type, "tare") == 0) {
    output->type = CommandType::TARE;
    required = sequenced | FIELD_TRIAL | FIELD_STABLE | FIELD_WAIT;
  } else if (strcmp(type, "run") == 0) {
    output->type = CommandType::RUN;
    required = sequenced | FIELD_TRIAL | FIELD_STEP | FIELD_PUMP | FIELD_DIR |
               FIELD_DUTY | FIELD_WARM | FIELD_COLLECT | FIELD_SETTLE |
               FIELD_HARD | FIELD_MAXMG;
  } else if (strcmp(type, "stop") == 0) {
    output->type = CommandType::STOP;
    required = sequenced;
  } else if (strcmp(type, "clear") == 0) {
    output->type = CommandType::CLEAR;
    required = sequenced;
  } else {
    return ParseError::BAD_TYPE;
  }
  if (!maskEquals(seen, required)) return ParseError::MISSING_FIELD;
  if (output->type != CommandType::HELLO && output->commandNumber == 0) {
    return ParseError::BAD_VALUE;
  }
  if (output->type == CommandType::RUN) {
    if (pump[0] == 'k') output->step.pump = Pump::KAMOER;
    else if (pump[0] == 'g') output->step.pump = Pump::GIKFUN;
    else return ParseError::BAD_VALUE;
    if (direction[0] == 'f') output->step.direction = Direction::FORWARD;
    else if (direction[0] == 'r') output->step.direction = Direction::REVERSE;
    else return ParseError::BAD_VALUE;
  }
  output->fingerprint = fingerprint(*output);
  return ParseError::NONE;
}

const char* parseErrorName(ParseError error) {
  switch (error) {
    case ParseError::NONE: return "none";
    case ParseError::SYNTAX: return "syntax";
    case ParseError::UNKNOWN_FIELD: return "unknown_field";
    case ParseError::DUPLICATE_FIELD: return "duplicate_field";
    case ParseError::MISSING_FIELD: return "missing_field";
    case ParseError::BAD_VERSION: return "bad_version";
    case ParseError::BAD_TYPE: return "bad_type";
    case ParseError::BAD_VALUE: return "bad_value";
    case ParseError::VALUE_TOO_LONG: return "value_too_long";
    case ParseError::NUMBER_OVERFLOW: return "number_overflow";
  }
  return "unknown";
}

CommandGate::CommandGate()
    : lastNumber_(0),
      lastFingerprint_(0),
      cachedAccepted_(false),
      cachedResult_(RejectCode::OK) {}

GateStatus CommandGate::inspect(uint32_t number, uint32_t fingerprint) const {
  if (lastNumber_ == UINT32_MAX) return GateStatus::EXHAUSTED;
  if (number == lastNumber_) {
    return fingerprint == lastFingerprint_ ? GateStatus::DUPLICATE
                                           : GateStatus::CONFLICT;
  }
  if (number < lastNumber_) return GateStatus::STALE;
  if (number != lastNumber_ + 1U) return GateStatus::GAP;
  return GateStatus::NEW_COMMAND;
}

void CommandGate::commit(uint32_t number, uint32_t fingerprint, bool accepted,
                         RejectCode result) {
  lastNumber_ = number;
  lastFingerprint_ = fingerprint;
  cachedAccepted_ = accepted;
  cachedResult_ = result;
}

}  // namespace tnp
