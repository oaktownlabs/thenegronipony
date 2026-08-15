#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "core/BenchCore.h"
#include "core/CommandParser.h"

namespace {

int failures = 0;

#define CHECK(expression)                                                     \
  do {                                                                        \
    if (!(expression)) {                                                      \
      fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #expression); \
      ++failures;                                                             \
    }                                                                         \
  } while (0)

tnp::CoreLimits configuredLimits() {
  const tnp::CoreLimits limits = {
      1000,   // heartbeatTimeoutMs
      500,    // sensorTimeoutMs
      5000,   // maximumTareWaitMs
      60000,  // maximumRunMs
      30000,  // maximumSettleMs
      20,     // directionDeadTimeMs
      90000,  // maximumConfiguredMassMg
      20,     // tareSpanCounts (test fixture only)
      1100};  // Kamoer minimum duty
  return limits;
}

void arm(tnp::BenchCore* core, uint32_t startMs) {
  CHECK(core->requestTare(200, 2000, startMs) == tnp::RejectCode::OK);
  tnp::SampleResult sample =
      core->onSample(1000, false, false, 0, startMs);
  CHECK(!sample.tareCompleted);
  sample = core->onSample(1004, false, false, 0, startMs + 100);
  CHECK(!sample.tareCompleted);
  sample = core->onSample(1002, false, false, 0, startMs + 200);
  CHECK(sample.tareCompleted);
  CHECK(sample.tareRaw == 1002);
  CHECK(core->state() == tnp::BenchState::ARMED);
}

tnp::StartStep testStep() {
  tnp::StartStep step = {};
  step.pump = tnp::Pump::KAMOER;
  step.direction = tnp::Direction::FORWARD;
  step.stepIndex = 3;
  step.dutyBasisPoints = 5000;
  step.warmupMs = 100;
  step.collectionMs = 200;
  step.settleMs = 100;
  step.hardStopMs = 400;
  step.maximumMassMg = 50000;
  return step;
}

void testBoundedRun() {
  tnp::BenchCore core(configuredLimits());
  core.begin(0, true);
  CHECK(core.state() == tnp::BenchState::IDLE);
  CHECK(!core.motorEnabled());
  arm(&core, 100);
  const tnp::StartStep step = testStep();
  CHECK(core.requestStart(step, true, true, 400) == tnp::RejectCode::OK);
  CHECK(core.state() == tnp::BenchState::RUNNING);
  CHECK(core.motorEnabled());
  CHECK(!core.tick(699, true));
  CHECK(core.tick(700, true));
  CHECK(core.state() == tnp::BenchState::SETTLING);
  CHECK(!core.motorEnabled());
  core.heartbeat(750);
  core.onSample(1100, false, true, 1000, 750);
  CHECK(core.tick(800, true));
  CHECK(core.state() == tnp::BenchState::COMPLETE);
  CHECK(!core.motorEnabled());
  CHECK(core.requestClear(true, 801) == tnp::RejectCode::OK);
  CHECK(core.state() == tnp::BenchState::IDLE);
}

void testFaultsFailOff() {
  tnp::BenchCore core(configuredLimits());
  core.begin(0, true);
  arm(&core, 100);
  CHECK(core.requestStart(testStep(), true, true, 400) == tnp::RejectCode::OK);
  CHECK(core.onSample(1100, false, true, 50000, 450).stateChanged);
  CHECK(core.state() == tnp::BenchState::FAULT);
  CHECK(core.fault() == tnp::FaultCode::MAXIMUM_MASS);
  CHECK(!core.motorEnabled());

  CHECK(core.requestClear(true, 500) == tnp::RejectCode::OK);
  arm(&core, 600);
  CHECK(core.requestStart(testStep(), true, true, 900) == tnp::RejectCode::OK);
  CHECK(core.tick(1900, true));
  CHECK(core.fault() == tnp::FaultCode::HEARTBEAT_TIMEOUT);
  CHECK(!core.motorEnabled());

  CHECK(core.requestClear(true, 1901) == tnp::RejectCode::OK);
  arm(&core, 2000);
  CHECK(core.requestStart(testStep(), true, true, 2300) == tnp::RejectCode::OK);
  CHECK(core.tick(2301, false));
  CHECK(core.fault() == tnp::FaultCode::E_STOP);
  CHECK(core.requestClear(false, 2302) == tnp::RejectCode::E_STOP_ACTIVE);
  CHECK(!core.motorEnabled());

  CHECK(core.requestClear(true, 2303) == tnp::RejectCode::OK);
  arm(&core, 2400);
  CHECK(core.requestStart(testStep(), true, true, 2700) == tnp::RejectCode::OK);
  CHECK(core.tick(3100, true));
  CHECK(core.fault() == tnp::FaultCode::HARD_STOP);
  CHECK(!core.motorEnabled());
}

void testCommissioningGates() {
  tnp::CoreLimits limits = configuredLimits();
  limits.tareSpanCounts = 0;
  tnp::BenchCore core(limits);
  core.begin(0, true);
  CHECK(core.requestTare(200, 2000, 100) ==
        tnp::RejectCode::TARE_STABILITY_UNCONFIGURED);

  tnp::BenchCore ready(configuredLimits());
  ready.begin(0, true);
  arm(&ready, 100);
  CHECK(ready.requestStart(testStep(), false, true, 400) ==
        tnp::RejectCode::SCALE_UNCALIBRATED);
  CHECK(ready.requestStart(testStep(), true, false, 400) ==
        tnp::RejectCode::DEVICE_ID_UNPROVISIONED);

  limits = configuredLimits();
  limits.maximumConfiguredMassMg = 0;
  tnp::BenchCore noLimit(limits);
  noLimit.begin(0, true);
  arm(&noLimit, 100);
  CHECK(noLimit.requestStart(testStep(), true, true, 400) ==
        tnp::RejectCode::SAFETY_LIMIT_UNCONFIGURED);
}

void testParser() {
  const char* run =
      "{\"v\":1,\"t\":\"run\",\"id\":\"r1\",\"n\":3,\"trial\":\"trial-1\","
      "\"step\":2,\"pump\":\"g\",\"dir\":\"r\",\"duty\":2500,\"warm\":100,"
      "\"collect\":5000,\"settle\":1000,\"hard\":6200,\"maxmg\":80000}";
  tnp::Command command;
  CHECK(tnp::parseCommand(run, &command) == tnp::ParseError::NONE);
  CHECK(command.type == tnp::CommandType::RUN);
  CHECK(command.commandNumber == 3);
  CHECK(strcmp(command.commandId, "r1") == 0);
  CHECK(strcmp(command.trialId, "trial-1") == 0);
  CHECK(command.step.pump == tnp::Pump::GIKFUN);
  CHECK(command.step.direction == tnp::Direction::REVERSE);
  CHECK(command.step.maximumMassMg == 80000);

  const uint32_t fingerprint = command.fingerprint;
  const char* reordered =
      "{ \"maxmg\":80000, \"hard\":6200, \"settle\":1000,"
      "\"collect\":5000,\"warm\":100,\"duty\":2500,\"dir\":\"r\","
      "\"pump\":\"g\",\"step\":2,\"trial\":\"trial-1\",\"n\":3,"
      "\"id\":\"r1\",\"t\":\"run\",\"v\":1 }";
  CHECK(tnp::parseCommand(reordered, &command) == tnp::ParseError::NONE);
  CHECK(command.fingerprint == fingerprint);

  CHECK(tnp::parseCommand("{\"v\":1,\"t\":\"hb\",\"id\":\"h1\"}",
                          &command) == tnp::ParseError::MISSING_FIELD);
  CHECK(tnp::parseCommand(
            "{\"v\":1,\"t\":\"hb\",\"id\":\"h1\",\"n\":1,\"x\":2}",
            &command) == tnp::ParseError::UNKNOWN_FIELD);
  CHECK(tnp::parseCommand(
            "{\"v\":1,\"t\":\"hb\",\"id\":\"bad\\nid\",\"n\":1}",
            &command) == tnp::ParseError::BAD_VALUE);
  CHECK(tnp::parseCommand(
            "{\"v\":1,\"t\":\"hb\",\"id\":\"h1\",\"n\":4294967296}",
            &command) == tnp::ParseError::NUMBER_OVERFLOW);
}

void testCommandGate() {
  tnp::CommandGate gate;
  CHECK(gate.inspect(1, 100) == tnp::GateStatus::NEW_COMMAND);
  gate.commit(1, 100, true, tnp::RejectCode::OK);
  CHECK(gate.inspect(1, 100) == tnp::GateStatus::DUPLICATE);
  CHECK(gate.inspect(1, 101) == tnp::GateStatus::CONFLICT);
  CHECK(gate.inspect(3, 300) == tnp::GateStatus::GAP);
  CHECK(gate.inspect(0, 0) == tnp::GateStatus::STALE);
  CHECK(gate.inspect(2, 200) == tnp::GateStatus::NEW_COMMAND);
}

}  // namespace

int main() {
  testBoundedRun();
  testFaultsFailOff();
  testCommissioningGates();
  testParser();
  testCommandGate();
  if (failures != 0) {
    fprintf(stderr, "%d test(s) failed\n", failures);
    return 1;
  }
  puts("All calibration-bench host tests passed.");
  return 0;
}
