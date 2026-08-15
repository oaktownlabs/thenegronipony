#ifndef TNP_TEST_AVR_WDT_H
#define TNP_TEST_AVR_WDT_H

#define WDTO_2S 0
inline void wdt_disable() {}
inline void wdt_enable(int) {}
inline void wdt_reset() {}

#endif
