# Electronics Plan

Status: Draft for Milestone 5. Hardware choices are not final.

## Functional Blocks

- Controller.
- Three pump drivers.
- Pump power supply.
- Recipe selector input.
- PONY POUR button input.
- Small display.
- Lake/status lighting output.
- Debug/programming connection.
- Umbilical connection between horse/lake module and sidecar.

## Unknowns

- Controller model.
- Pump voltage and current requirements.
- Driver topology.
- Power budget.
- Connector choices.
- Whether controls terminate in the horse/lake module or through an intermediate
  sidecar board.

## Safety Notes

- Keep power electronics away from liquid paths.
- Add strain relief for all umbilical wiring.
- Do not assume pump current draw until measured or sourced from a datasheet.
- Separate low-voltage controls from any mains-powered supply enclosure.

