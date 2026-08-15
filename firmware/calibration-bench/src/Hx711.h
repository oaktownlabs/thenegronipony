#ifndef TNP_HX711_H
#define TNP_HX711_H

#include <Arduino.h>
#include <stdint.h>

namespace tnp {

class Hx711 {
 public:
  Hx711();
  void begin();
  bool readIfReady(uint32_t nowMs, int32_t* rawAdc);
  bool saturated(int32_t rawAdc) const;
  void setTareRaw(int32_t rawAdc);
  void clearTare() { haveTare_ = false; }
  bool haveTare() const { return haveTare_; }
  int32_t tareRaw() const { return tareRaw_; }
  bool calibrationFactorConfigured() const;
  bool massAvailable() const;
  bool massMg(int32_t rawAdc, int32_t* massMg) const;

 private:
  bool ready() const;
  int32_t readRaw();

  uint32_t lastReadMs_;
  int32_t tareRaw_;
  bool haveTare_;
};

}  // namespace tnp

#endif
