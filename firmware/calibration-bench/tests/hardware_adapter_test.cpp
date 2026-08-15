#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <string>

#include "Arduino.h"
#include "Hx711.h"
#include "MotorDriver.h"
#include "WireProtocol.h"
#include "avr/io.h"

uint8_t mockPinModes[20] = {0};
uint8_t mockPinValues[20] = {0};
volatile uint8_t TCCR1A = 0;
volatile uint8_t TCCR1B = 0;
volatile uint16_t TCNT1 = 0;
volatile uint16_t ICR1 = 0;
volatile uint16_t OCR1A = 0;
volatile uint16_t OCR1B = 0;
volatile uint8_t PORTD = 0;
volatile uint8_t PIND = 0;

void pinMode(uint8_t pin, uint8_t mode) { mockPinModes[pin] = mode; }
void digitalWrite(uint8_t pin, uint8_t value) {
  mockPinValues[pin] = value;
  if (pin == 5) {
    if (value == HIGH) PORTD |= _BV(PD5);
    else PORTD &= static_cast<uint8_t>(~_BV(PD5));
  }
}
int digitalRead(uint8_t pin) { return mockPinValues[pin]; }
void noInterrupts() {}
void interrupts() {}

namespace {

int failures = 0;

#define CHECK(expression)                                                     \
  do {                                                                        \
    if (!(expression)) {                                                      \
      fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #expression); \
      ++failures;                                                             \
    }                                                                         \
  } while (0)

class BufferStream : public Stream {
 public:
  explicit BufferStream(const char* input = "") : input_(input), cursor_(0) {}
  int available() { return cursor_ < input_.size() ? 1 : 0; }
  int read() {
    return cursor_ < input_.size()
               ? static_cast<unsigned char>(input_[cursor_++])
               : -1;
  }
  size_t write(uint8_t value) {
    output_.push_back(static_cast<char>(value));
    return 1;
  }
  const std::string& output() const { return output_; }

 private:
  std::string input_;
  size_t cursor_;
  std::string output_;
};

void testMotorAdapter() {
  tnp::MotorDriver motor;
  motor.begin();
  CHECK(ICR1 == 799);
  CHECK((TCCR1B & (_BV(WGM13) | _BV(WGM12) | _BV(CS10))) ==
        (_BV(WGM13) | _BV(WGM12) | _BV(CS10)));
  CHECK(!motor.isOn());
  CHECK(motor.start(tnp::Pump::KAMOER, tnp::Direction::FORWARD, 5000));
  CHECK(motor.timerCount() == 400);
  CHECK(OCR1A == 400);
  CHECK((TCCR1A & _BV(COM1A1)) != 0);
  CHECK((TCCR1A & _BV(COM1B1)) == 0);
  CHECK(mockPinValues[6] == HIGH);
  motor.forceOff();
  CHECK(!motor.isOn());
  CHECK((TCCR1A & (_BV(COM1A1) | _BV(COM1B1))) == 0);
  CHECK(mockPinValues[6] == HIGH);  // Direction is preserved until dead time.

  CHECK(motor.start(tnp::Pump::GIKFUN, tnp::Direction::REVERSE, 1));
  CHECK(motor.timerCount() == 1);
  CHECK(OCR1B == 1);
  CHECK((TCCR1A & _BV(COM1B1)) != 0);
  CHECK((TCCR1A & _BV(COM1A1)) == 0);
  CHECK(mockPinValues[11] == HIGH);

  CHECK(motor.start(tnp::Pump::GIKFUN, tnp::Direction::FORWARD, 10000));
  CHECK(motor.timerCount() == 800);
  CHECK(mockPinValues[10] == HIGH);
  CHECK((TCCR1A & _BV(COM1B1)) == 0);
}

void testHx711Adapter() {
  tnp::Hx711 scale;
  mockPinValues[4] = LOW;
  PIND = 0;
  scale.begin();
  int32_t raw = 99;
  CHECK(scale.readIfReady(100, &raw));
  CHECK(raw == 0);
  CHECK(!scale.readIfReady(150, &raw));
  CHECK(scale.readIfReady(200, &raw));
  CHECK(!scale.calibrationFactorConfigured());
  CHECK(!scale.massAvailable());
  CHECK(scale.saturated(8388607));
  CHECK(scale.saturated(-8388608L));
  CHECK(!scale.saturated(0));
  CHECK(PORTD == 0);
}

void testWireAdapter() {
  BufferStream input("{\"v\":1,\"t\":\"hb\",\"id\":\"h1\",\"n\":1}\n");
  BufferStream output;
  tnp::WireProtocol protocol(input, output, "test-bench", "00000001");
  tnp::Command command;
  tnp::ParseError error = tnp::ParseError::NONE;
  CHECK(protocol.poll(&command, &error) == tnp::ReadStatus::COMMAND);
  CHECK(command.type == tnp::CommandType::HEARTBEAT);
  CHECK(command.commandNumber == 1);
  protocol.emitHello(42, 0, false, 0);
  CHECK(output.output().find("\"baud\":250000") != std::string::npos);
  CHECK(output.output().find("\"scale\":0,\"cal\":null") !=
        std::string::npos);
  CHECK(output.output().find("\"idok\":0,\"limitmg\":0") !=
        std::string::npos);
  CHECK(output.output().find("\"seq\":1,\"ms\":42") != std::string::npos);

  tnp::TelemetryContext terminal = {
      "trial-terminal", 7, true, tnp::Pump::KAMOER, 5000, 400,
      true, 12345};
  protocol.emitState(43, tnp::BenchState::COMPLETE, terminal);
  tnp::TelemetryContext released = {
      "", 0, false, tnp::Pump::NONE, 0, 0, true, 12345};
  protocol.emitSample(44, tnp::BenchState::COMPLETE, released, 12400,
                      true, 55, 2);
  CHECK(output.output().find(
            "\"state\":\"complete\",\"trial\":\"trial-terminal\","
            "\"step\":7,\"pump\":\"k\",\"duty\":5000") !=
        std::string::npos);
  CHECK(output.output().find(
            "\"trial\":null,\"step\":null,\"state\":\"complete\","
            "\"pump\":\"none\",\"raw\":12400,\"mg\":55,\"duty\":0,"
            "\"tc\":0") != std::string::npos);

  terminal.trialId = "trial-fault";
  terminal.pump = tnp::Pump::GIKFUN;
  protocol.emitState(45, tnp::BenchState::FAULT, terminal);
  protocol.emitSample(46, tnp::BenchState::FAULT, released, 12401,
                      true, 56, 2);
  CHECK(output.output().find(
            "\"state\":\"fault\",\"trial\":\"trial-fault\","
            "\"step\":7,\"pump\":\"g\"") != std::string::npos);
  CHECK(output.output().find(
            "\"trial\":null,\"step\":null,\"state\":\"fault\","
            "\"pump\":\"none\"") != std::string::npos);
}

}  // namespace

int main() {
  testMotorAdapter();
  testHx711Adapter();
  testWireAdapter();
  if (failures != 0) {
    fprintf(stderr, "%d adapter test(s) failed\n", failures);
    return 1;
  }
  puts("All calibration-bench adapter tests passed.");
  return 0;
}
