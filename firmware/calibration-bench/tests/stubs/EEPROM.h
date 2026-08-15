#ifndef TNP_TEST_EEPROM_H
#define TNP_TEST_EEPROM_H

#include <stdint.h>

class EEPROMClass {
 public:
  uint8_t read(int) const { return 0xFF; }
  void update(int, uint8_t) {}
};

extern EEPROMClass EEPROM;

#endif
