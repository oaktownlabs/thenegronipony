#ifndef TNP_TEST_AVR_IO_H
#define TNP_TEST_AVR_IO_H

#include <stdint.h>

#define _BV(bit) (1U << (bit))

enum {
  WGM11 = 1,
  WGM12 = 3,
  WGM13 = 4,
  CS10 = 0,
  COM1A0 = 6,
  COM1A1 = 7,
  COM1B0 = 4,
  COM1B1 = 5,
  PD4 = 4,
  PD5 = 5,
  WDRF = 3
};

extern volatile uint8_t TCCR1A;
extern volatile uint8_t TCCR1B;
extern volatile uint16_t TCNT1;
extern volatile uint16_t ICR1;
extern volatile uint16_t OCR1A;
extern volatile uint16_t OCR1B;
extern volatile uint8_t PORTD;
extern volatile uint8_t PIND;
extern volatile uint8_t MCUSR;

#endif
