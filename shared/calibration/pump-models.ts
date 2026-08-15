import type { PumpReadModelV1 } from './types';

/** Product metadata only. Null curve/specimen fields are deliberate until trials exist. */
export const EMPTY_PUMP_READ_MODELS = [
  {
    pumpModelId: 'kamoer-kphm600-12b3b17',
    manufacturer: 'Kamoer',
    model: 'KPHM600-12B3B17',
    selectedSpecimenId: null,
    specimenLabel: null,
    image: {
      kind: 'schematic',
      src: '/images/pumps/kamoer-kphm600-12b3b17.svg',
      alt: 'Kamoer KPHM600-12B3B17 peristaltic pump schematic',
    },
    advertisedFlowMlMin: 600,
    acceptedCurve: null,
    missingReason: 'no_selected_specimen',
  },
  {
    pumpModelId: 'gikfun-ae1207',
    manufacturer: 'Gikfun',
    model: 'AE1207',
    selectedSpecimenId: null,
    specimenLabel: null,
    image: {
      kind: 'schematic',
      src: '/images/pumps/gikfun-ae1207.svg',
      alt: 'Gikfun AE1207 dosing pump schematic',
    },
    advertisedFlowMlMin: null,
    acceptedCurve: null,
    missingReason: 'no_selected_specimen',
  },
] as const satisfies readonly [PumpReadModelV1, PumpReadModelV1];
