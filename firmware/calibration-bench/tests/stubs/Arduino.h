#ifndef TNP_TEST_ARDUINO_H
#define TNP_TEST_ARDUINO_H

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "avr/io.h"

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2

class __FlashStringHelper;
#define F(value) reinterpret_cast<const __FlashStringHelper*>(value)

extern uint8_t mockPinModes[20];
extern uint8_t mockPinValues[20];

void pinMode(uint8_t pin, uint8_t mode);
void digitalWrite(uint8_t pin, uint8_t value);
int digitalRead(uint8_t pin);
void noInterrupts();
void interrupts();

class Print {
 public:
  virtual ~Print() {}
  virtual size_t write(uint8_t value) = 0;

  size_t print(const char* value) {
    size_t count = 0;
    while (*value != '\0') count += write(static_cast<uint8_t>(*value++));
    return count;
  }
  size_t print(const __FlashStringHelper* value) {
    return print(reinterpret_cast<const char*>(value));
  }
  size_t print(char value) { return write(static_cast<uint8_t>(value)); }
  size_t print(int value) { return printNumber("%d", value); }
  size_t print(unsigned int value) { return printNumber("%u", value); }
  size_t print(long value) { return printNumber("%ld", value); }
  size_t print(unsigned long value) { return printNumber("%lu", value); }

  size_t println(char value) {
    size_t count = print(value);
    return count + print('\n');
  }
  size_t println(const __FlashStringHelper* value) {
    size_t count = print(value);
    return count + print('\n');
  }

 private:
  template <typename T>
  size_t printNumber(const char* format, T value) {
    char buffer[24];
    const int length = snprintf(buffer, sizeof(buffer), format, value);
    return length > 0 ? print(buffer) : 0;
  }
};

class Stream : public Print {
 public:
  virtual int available() = 0;
  virtual int read() = 0;
};

class HardwareSerial : public Stream {
 public:
  void begin(unsigned long) {}
  int available() { return 0; }
  int read() { return -1; }
  size_t write(uint8_t) { return 1; }
};

extern HardwareSerial Serial;
unsigned long millis();

#endif
