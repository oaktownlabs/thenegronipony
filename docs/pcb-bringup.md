# PCB Bring-Up Plan

Status: Blocked draft for Milestone 12.

PCB work starts after breadboard electronics are proven and requirements are
frozen.

## Entry Criteria

- Controller selected.
- Pump drivers selected and validated under load.
- Pump voltage/current requirements known.
- UI, screen, lighting, and connector requirements known.
- Sidecar and umbilical architecture known.
- Breadboard prototype has run pumps safely.

## Bring-Up Sequence

1. Visual inspection.
2. Continuity checks before power.
3. Power input test without loads.
4. Controller programming/debug access test.
5. Pump driver test with dummy or limited load.
6. Pump load test.
7. UI input test.
8. Lighting output test.
9. Full water-only system test.

## Do Not Assume

- Connector ratings.
- Trace widths.
- Fuse/protection choices.
- Enclosure grounding or mains strategy.
- Pump current draw beyond measured or sourced values.

