// Listed preset offers for the DOM tests of Step 1's preset screens (M8D). Built from the seeded L kitchen's own room
// and name facts, so a card draws what a real offer would. Nothing here fetches, adapts or evaluates.
import {
  KITCHEN_L_DESIGN,
  presetNameFactsOf,
  presetRoomOf,
  type PresetAdaptationChanges,
} from "@lemnaria/configurator-domain";

import type { ListedPresetOffer } from "@/room/preset-offers";

const UNCHANGED: PresetAdaptationChanges = {
  removed: [],
  added: [],
  droppedCornerPieceCount: 0,
  isUnchanged: true,
};

const ADJUSTED: PresetAdaptationChanges = {
  ...UNCHANGED,
  droppedCornerPieceCount: 1,
  isUnchanged: false,
};

export interface OfferFixture {
  readonly id: string;
  /** The owner's typed name; absent means the app renders the generated name. */
  readonly typedName?: string;
  readonly isAdjusted?: boolean;
}

export function listedOfferOf(fixture: OfferFixture): ListedPresetOffer {
  const { shape, walls, heightMm } = presetRoomOf(KITCHEN_L_DESIGN);
  return {
    preset: {
      id: fixture.id,
      shape,
      walls,
      heightMm,
      ...(fixture.typedName === undefined
        ? {}
        : { typedName: fixture.typedName }),
      nameFacts: presetNameFactsOf(KITCHEN_L_DESIGN),
      imageUrl: `/api/presets/${fixture.id}/image`,
      design: { ...KITCHEN_L_DESIGN, presetId: null },
    },
    design: { ...KITCHEN_L_DESIGN, presetId: null },
    changes: fixture.isAdjusted === true ? ADJUSTED : UNCHANGED,
  };
}

/** `count` offers named "Preset 1" … "Preset count", ids "preset-1" …, none adjusted. */
export function numberedOffers(count: number): readonly ListedPresetOffer[] {
  return Array.from({ length: count }, (_, position) =>
    listedOfferOf({
      id: `preset-${String(position + 1)}`,
      typedName: `Preset ${String(position + 1)}`,
    }),
  );
}
