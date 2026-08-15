# Calibration Bench Electronics BOM and Selection Gates

Status: Milestone 2 design input. This is not an instruction to energize the
bench. This is a fail-off custom prototype, not a safety-rated or
functionally-safe control system. Ratings marked **measure first** cannot be
selected from a marketplace title.

## Identified supplied equipment

| Qty used | Equipment | Verified listing facts | Remaining physical gate |
| ---: | --- | --- | --- |
| 1 of 4 | SazkJere `SJ18` 1 kg beam cell from ASIN [`B0B9Y584JR`](https://www.amazon.com/dp/B0B9Y584JR) | The listing describes a four-lead cantilever cell and maps red to `E+`, black to `E-`, green to `A+`, and white to `A-`. | Photograph the received label, cable, and loading arrow; confirm the four wires and board terminal labels before applying excitation. Do not assume sensitivity, accuracy, or the color map if the received part differs. |
| 1 of 4 | HX711 module from the same kit | The listing states 2.6–5.5 V operation and selectable 10/80 SPS conversion. | Photograph both sides and trace `RATE`. V1 uses its as-received 10 SPS state; no trace is cut and no MCU pin drives `RATE` until the board connection is reviewed. |
| 1 | Elegoo UNO R3 | ATmega328P, 5 V logic, 16 MHz, 32 KB flash, 2 KB SRAM, USB serial. | Photograph the exact revision and record the USB VID/PID and bridge identity. Prove 250000-baud operation and the Timer1 outputs on the received board. |
| 1 | WANPTEK POWER `DPS3010U`, ASIN [`B0CN989377`](https://www.amazon.com/dp/B0CN989377) | Marketplace listing: adjustable 0–30 V, 0–10 A, 300 W switching supply with CV/CC operation and OCP/short-circuit shutdown. | Photograph the rating/rear labels. Confirm protective-earth marking, received input-voltage revision, output-negative-to-earth relationship, current-limit behavior, and 12 V accuracy with external instruments. The listing does not establish a recognized NRTL mark. |
| 1 | Qesdaoxu 100 mL cylinder from ASIN [`B0BLHDVC1N`](https://www.amazon.com/dp/B0BLHDVC1N) | Nominal 100 mL, 3.3 borosilicate glass, plastic base/bumper. | Weigh the selected cylinder and platform; measure its footprint/height and a conservative working fill line. No published tolerance/class makes it a catch vessel, not the volume reference. |
| 1 each | Kamoer KPHM600-12B3B17 and Gikfun AE1207 specimens | See the harness source notes. | Photograph received labels/connectors and measure startup and primed-running current. |

## Recommended procurement baseline

These are purchasable preferred parts, not generic placeholders. Do not
substitute a carrier, relay, contactor, socket, or contact block without
rechecking the wiring and ratings.

| Qty | Reference / orderable part | Purpose and accepted limit |
| ---: | --- | --- |
| 1 | [Pololu DRV8874 carrier #4035](https://www.pololu.com/product/4035) | Preferred Gikfun PH/EN driver: 4.5–37 V, 20 kHz capable, current sense and adjustable regulation. Pololu rates its carrier for about 2.1 A continuous under its test conditions; the shipped roughly 4.4 A current-limit setting is **not accepted** for this pump. Fit a reviewed VREF resistor only after current measurement and closed-enclosure thermal testing. If the measured operating envelope does not fit, stop and select a larger documented driver rather than defeating the limit. |
| 1 each | TI `SN74AHCT125N`, TI `SN74HC14N`, and [TI `CD74HC123E`](https://www.ti.com/product/CD74HC123) | Four-channel 5 V command gate, Schmitt logic, and external main-loop heartbeat watchdog. The `125` output-enable net has a 2.2 kOhm pull-up, so boot, broken enable wiring, or a dropped K1 relay makes every output high-impedance; pump-side pull-downs then establish OFF. The lower pull-up also gives the K1 logic contact about 2.3 mA at 5 V instead of an unreliable ultra-dry load. The `HC14` creates `DRV_WAKE`, the command-low re-arm delay, and the D8 inversion that holds the `HC123` trailing-edge input HIGH at boot. The retriggerable `HC123` must expire if D8 stalls HIGH or LOW; use a 470 kOhm / 1.0 uF timing network as the initial roughly 0.21 s design and verify its worst-case window and stop latency on the assembled board. Use 100 nF at every IC and tie every unused CMOS input to a defined level. |
| 3 / 1 | 3x onsemi `2N7000TA` (or documented through-hole `2N7000`); 1x onsemi `PN2222ATA` | Q-ARM, Q-RC, Kamoer open-drain F/R, and the K1 coil sink respectively. Every MOSFET gate and the PN2222 base-emitter path has a local pull-down. Confirm the received Kamoer F/R input current before connecting Q-DIR. |
| 2 | `1N4148` plus one 100 kOhm / 10 uF X7R delay network | Diode-OR D9 and D10 into `ANY_RUN`; Q-RC discharges the timing capacitor on every PWM pulse. The two-stage `HC14` output must remain high only after both run-producing outputs have stayed low continuously. The nominal delay is not a calibrated safety time; verify a worst-case delay of at least 250 ms on the assembled board. |
| 1 | [Omron `MY4-GS-R DC12`](https://www.ia.omron.com/products/family/3440/lineup.html), [socket `PYFZ-14-E`](https://industrial.omron.co.uk/en/products/PYFZ-14-E), `PYC-A1` hold-down | K1 non-latching 4PDT control relay. This variant has an indicator but no latching/test lever. Pole 1 seals only after physical ARM; pole 2 enables the command gate; pole 3 drives K2; pole 4 is spare for reviewed armed-state feedback. Add an external `1N4007` across the DC coil, cathode toward coil positive. |
| 1 | [Schneider `XB5AS8444`](https://iportal2.schneider-electric.com/Contents/docs/0100CT1501_SEC-19.PDF) | 22 mm, 40 mm red trigger-action, turn-release E-stop with two NC contacts. NC1 interrupts both relay/contactor coil feeds; isolated NC2 is the D7 healthy-loop contact. No pump current passes through the operator switch. |
| 1 | [Schneider `XB5AA31`](https://www.se.com/us/en/product/XB5AA31/) | Green 22 mm momentary 1NO physical ARM button. It can energize K1 only through Q-ARM after D9 and D10 have been continuously low and while the `CD74HC123E` Q output keeps the PN2222 coil sink alive. |
| 1 | [Schneider `LC1D09JD`](https://www.se.com/us/en/product/LC1D09JD/) | Preferred K2 pump-bus disconnect, DIN/screw terminal, 12 VDC coil with integral bidirectional suppression. Use one power pole; never parallel poles. Schneider's DC table is a screening input, not approval for the driver-input capacitance or motor inrush. Final acceptance remains **measure first**. |
| 4 | Littelfuse `0FHM0001SXJ` sealed MINI holders plus Littelfuse 297-series 32 V MINI fuses | F0 master, FC control, FK Kamoer, and FG Gikfun. Buy holders now; select the four fuse ampere values only from measured legitimate startup/inrush, wire/terminal limits, driver limit, K2 DC-use rating, relay/contactor coil demand, and the published 297 time-current curve. Never exceed the holder's 20 A limit. |
| as laid out | [Phoenix Contact `PT 2,5` 3209510](https://www.phoenixcontact.com/en-gb/products/feed-through-terminal-block-pt-25-3209510), `D-ST 2,5` 3030417, `CLIPFIX 35` 3022218, `NS 35/7,5` 1206421 | Locking DIN feed-through terminals, end cover, end brackets, and 35 mm rail. Use blue/identified terminals for 0 V, label every conductor, and select ferrules/wire from the final fuse values. |
| 1 each | [Hammond `PCJ12106CCLF`](https://www.hammfg.com/part/PCJ12106CCLF) and inner panel `PCJR1109` | 12 x 10 x 6 inch polycarbonate Type 4X/IP66 control enclosure and panel. Confirm the received K2, bend radius, heat dissipation, glands, and wet/dry mounting layout on a full-size paper layout before drilling. |
| 1 set + 1 check | Rice Lake Class 4 satin weights `13289` 50 g, `13271` 100 g, and `13273` 200 g, plus a second serialized `13271` 100 g | Order each with Rice Lake's **Accredited Certificate of Weight Calibration** option. Combine the fit-set masses for points through the actual intended span; reserve the second 100 g mass exclusively as the independent check. Add `13275` 500 g only if the measured fixture/span requires it and total load remains safely below the cell rating. |
| 1 | [ThermoWorks Reference Thermapen `THS-222-215`](https://www.thermoworks.com/products/reference-thermapen) | Immersion/contact thermometer with supplied UKAS certificate. Record water temperature at trial start/end; do not use an uncalibrated infrared reading as the density input. |
| 1 | Rigid scale sub-base, isolated top plate, adjustable overload stop, fixed nozzle, removable wet tray, and splash barrier | Dimension only after measuring the received beam and vessel. No tubing, tray, nozzle, cable, or shield may touch the live platform. |

### Items whose exact rating remains measurement-gated

- F0, FC, FK, and FG fuse amperages; power/control wire gauge; ferrules; cable
  glands; branch connectors; and K2 final DC-use approval.
- The DRV8874 VREF resistor/current ceiling and any required heat sink or forced
  air. The carrier's default limit is not a commissioning value.
- Driver bulk capacitance, reverse-polarity protection, and 12 V TVS part/value.
  Choose these from the selected wire length, supply behavior, driver data sheet,
  and captured rail transients.
- The current probe or shunt range. The instrument must resolve startup time and
  peak without replacing the WANPTEK current limit; its burden voltage and
  bandwidth become trial metadata.
- Food-contact tubing and glands. Water commissioning may use the received wet
  path only after inspection; ingredient use waits for chemical-compatibility
  evidence.

## Point-to-point control and power net table

This table is the design-review netlist. An experienced builder can use it only
after the received terminal markings and the measurement-gated ratings above
are closed. Build it on a soldered PCB/perfboard and DIN terminals, never a
plug-in breadboard. Verify every relay/socket terminal against the diagram
printed on the received part before landing a conductor.

| Net | Point-to-point connections | Required off-state / check |
| --- | --- | --- |
| `0V_STAR` | WANPTEK output negative, UNO GND, U1/U2/U3 GND, DRV8874 GND, Kamoer black, transistor sources/emitter, and HX711 GND each return separately to one labelled terminal group. | Do not bond to protective earth until the received WANPTEK output-to-earth relationship is measured. Motor current must not share the HX711 return conductor. |
| `+5V_LOGIC` | UNO 5 V to U1 `SN74AHCT125N` pin 14, U2 `SN74HC14N` pin 14, U3 `CD74HC123E` pin 16, HX711 VCC, logic pull-ups, and RC networks. U1/U2/U3 grounds are pins 7/7/7. Put 100 nF from each logic IC VCC to GND at the pins. | USB powers logic only. Do not power the Uno from the WANPTEK USB/Type-C ports or feed 12 V into 5 V. |
| `+12_RAW` | WANPTEK positive to F0. F0 output splits to K2 `1L1` and FC; FC output is `+12_CTRL`. | F0 and FC values TBD. Confirm polarity and CC setting before connection. Include the LC1D09JD's approximately 5.4 W DC-coil demand in the control-branch measurement and wire/fuse review. |
| `+12_PUMP_SW` | K2 `2T1` to FK and FG inputs; FK output to Kamoer red; FG output to DRV8874 VIN. Leave K2's other power poles unused. | K2 open means both pump branches are dead. Do not parallel contactor poles. |
| `ESTOPPED_12V` | `+12_CTRL` through E-stop NC1 to this net. Feed both K1 coil positive and K2 A1 from it. | Pressing the E-stop removes both coil feeds even if a K1 control contact welds. Releasing it restores no sealed circuit because K1 has already dropped. |
| `K2_COIL` | `ESTOPPED_12V` to K2 A1; K2 A2 through K1 pole-3 COM/NO to `0V_STAR`. | K1 drop de-energizes K2. LC1D09JD already has integral bidirectional coil suppression; do not add an unreviewed second suppressor. |
| `K1_COIL_LOW` | `ESTOPPED_12V` to K1 coil positive; K1 coil negative to this node. Put `1N4007` across the K1 coil, cathode at positive. K1 pole-1 COM connects here; its NO connects to `PERMIT_DRAIN`. In parallel with that pole, connect ARM NO and Q-ARM drain/source **in series** between this node and `PERMIT_DRAIN` for initial pickup. | The button only starts K1. Once K1 drops, its NO seal opens, so releasing the E-stop cannot restart it. Confirm diode polarity and use no relay with a manual test/latch lever. |
| `CONTROL_WATCHDOG` | Put 100 kOhm from UNO D8 to GND. Feed D8 to U2 4A pin 9; U2 4Y pin 8 is `WD_A`. Put 10 kOhm from `WD_A` to +5 V and connect it to U3 `1A` pin 1. Hold U3 `1B` pin 2 HIGH. Make `WD_RST_RC` with 100 kOhm to +5 V and 100 nF to GND; connect it to U2 5A pin 11, connect 5Y pin 10 to 6A pin 13, and connect 6Y pin 12 to U3 `1R` pin 3. Connect 470 kOhm from +5 V to `1RxCx` pin 15, 1.0 uF film/low-leakage capacitor between `1Cx` pin 14 and pin 15, and use `1Q` pin 4 through 1 kOhm to PN2222 base with 10 kOhm base-emitter pull-down. PN2222 emitter to GND and collector to `PERMIT_DRAIN`. Tie unused channel-2 `2A`/`2B`/`2R` pins 9/10/11 LOW and leave its timing pins 6/8 unconnected per the TI data sheet. | D8 starts LOW, so inverter 4 holds trailing-edge input `1A` HIGH when reset rises, preventing the `HC123` reset-release trigger condition. Firmware toggles D8 every 25 ms from the main loop only; each rising D8 edge becomes a falling `1A` edge, nominally every 50 ms. Loss of edges lets Q expire and opens K1. Scope power-up/reset plus HIGH/LOW stalls and qualify the actual timeout; clearing a fault cannot reseal K1 without ARM. |
| `ANY_RUN` | UNO D9 and D10 each through a `1N4148` (anode at UNO, cathodes common) to Q-RC gate; 100 kOhm from gate to GND. Q-RC source to GND, drain to `SAFE_RC`. | Any high PWM pulse rapidly discharges `SAFE_RC`; verify this at the minimum accepted duty and 20 kHz. |
| `RUN_LOW_STABLE` | 100 kOhm from +5 V to `SAFE_RC`, 10 uF X7R from `SAFE_RC` to GND; connect `SAFE_RC` to U2 2A pin 3, connect 2Y pin 4 to 3A pin 5, and use 3Y pin 6 as `RUN_LOW_STABLE`. Feed that net through 1 kOhm to Q-ARM gate with 100 kOhm gate pull-down. | Q-ARM may close only after both PWM pins have remained low for at least the verified delay. USB loss makes Q-ARM off. |
| `DISABLE` | 2.2 kOhm pull-up to +5 V; K1 pole-2 COM to `DISABLE`, its NO to `0V_STAR`; connect U1 `/OE` pins 1, 4, 10, and 13 together to this net. | HIGH disables all U1 outputs. A dropped K1, open/broken wire, or boot therefore fails off. Verify the received relay's minimum switching-load requirement against the approximately 2.3 mA wetting current. |
| `K_SP` | D9 to U1 1A pin 2; U1 1Y pin 3 to Kamoer white SP; 10 kOhm from SP to GND at the pump-side connector. | With `DISABLE` high or USB absent, measured pump-side SP is LOW. Qualify 0–5 V, 20 kHz before attaching the pump. |
| `K_DIR` | D6 to U1 4A pin 12; U1 4Y pin 11 through 1 kOhm to Q-DIR gate; 100 kOhm gate pull-down. Q-DIR source to GND and drain to Kamoer green F/R. | Open-drain only: no Uno/logic output drives the Kamoer wire high. Leave disconnected until received input mapping/current is confirmed. |
| `G_EN` | D10 to U1 2A pin 5; U1 2Y pin 6 to DRV8874 EN; 10 kOhm EN pull-down at the carrier. | LOW means brake-low only while the awake driver is in PH/EN mode; unarmed SLEEP LOW makes the bridge high-impedance/coast. Verify 20 kHz response. |
| `G_PH` | D11 to U1 3A pin 9; U1 3Y pin 8 to DRV8874 PH; 10 kOhm PH pull-down at the carrier. | Direction cannot energize the bridge while EN and SLEEP are low. |
| `G_PMODE` | DRV8874 PMODE directly to driver GND. | PMODE must be LOW before SLEEP rises so the carrier latches PH/EN control. Never leave it floating for this firmware contract. |
| `DRV_WAKE` | `DISABLE` to U2 1A pin 1; U2 1Y pin 2 to DRV8874 SLEEP with a 4.7 kOhm pull-down at the carrier. | Dropped K1/unpowered logic forces SLEEP LOW and the outputs high-impedance. Confirm the exact carrier pin names before wiring. |
| `G_MOTOR` | DRV8874 OUT1/OUT2 to the two Gikfun leads through a locking two-pole connector. | Swap OUT1/OUT2 only to correct recorded direction. Never add a single diode across an H-bridge motor. |
| `ESTOP_SENSE` | E-stop NC2 between UNO D7 and `0V_STAR`; configure D7 `INPUT_PULLUP`. No other circuit shares NC2. | Healthy is LOW. Pressed contact or a broken sense wire reads HIGH and faults. Never place 12 V on D7. |
| `SCALE` | Cell red/black/green/white to HX711 E+/E-/A+/A- only after received inspection; HX711 DOUT to D4 and SCK to D5. | RATE remains as received at verified 10 SPS. Keep this cable away from motor/relay wiring and connect no B+/B- lead. |

## Power boundaries

- Power the Uno from the computer's data-capable USB connection. Do not use the
  DPS3010U quick-charge ports for the controller.
- The DPS3010U is characterization equipment until its received label and
  grounding behavior are verified. It does not replace the downstream E-stop,
  command inhibit, branch fuses, or permanent enclosed supply review.
- Set a conservative CC limit before the first motor connection. OCP shutdown
  and CV/CC limiting are distinct modes; record which mode is used.
- Keep mains equipment outside the wet bench and connect it only to a properly
  grounded receptacle.

## Firmware-facing pin contract

| Uno R3 pin | Contract |
| --- | --- |
| D4 | HX711 `DOUT`; input, no pull-up. |
| D5 | HX711 `SCK`; output low whenever idle or faulted. |
| D6 | Kamoer `F/R` open-drain control; never drive the pump wire high. |
| D7 | Isolated/dry-contact E-stop sense; hard stop remains independent of firmware. |
| D8 | Main-loop control-watchdog toggle to `CD74HC123E`; 25 ms half-cycle while healthy/non-faulted, LOW through boot and fault. Never connect directly to a relay coil. |
| D9 / OC1A | Kamoer `SP`, Timer1 20 kHz through the hardware inhibit and pump-side pull-down. |
| D10 / OC1B | Gikfun PWM command, Timer1 20 kHz through the hardware inhibit. |
| D11 | Gikfun direction/static H-bridge command through the hardware inhibit. |
| D2 | Kamoer `FG` only after its interface is scoped and conditioned. |
| D3 | Reserved for a future reviewed HX711 `RATE` connection; V1 does not connect it. |

Timer0 remains owned by the Arduino timebase. Timer1 owns both 20 kHz channels;
libraries that reconfigure Timer1, including the standard Servo library, are not
compatible with this bench firmware.
