// QA of M10 R4b3 items 1 and 3: a kitchen has two ways to be stamped. Generation spreads the request into the settings it
// builds (`stampedSettingsOf`, the depth native); a preset copy and the seeded mint stamp a design that exists, through the
// commands (`stampedDesignOf`, the depth never written). For one request they must agree on the five settings, and with the
// fixed fallbacks a generated kitchen must price and resolve as the unstamped one for every room shape.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  CurrentDesignSchema,
  DEFAULT_FINISH,
  DEFAULT_HANDLE,
  freeColourFinish,
  generateKitchen,
  KITCHEN_L_BODY_CATALOG,
  paletteFinish,
  PALETTE_ENTRY_IDS,
  priceDesign,
  resolvedFinishOf,
  SAMPLE_PRICE_BOOK,
  stampedDesignOf,
  TOP_ROW_HANDLE,
  type Design,
  type DesignRoom,
  type Handle,
  type NewKitchenSettings,
} from "../../src/index.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-11-08T10:00:00.000Z";
const HANDLES: readonly Handle[] = ["steel", "black", "push"];

const ROOMS: readonly DesignRoom[] = [
  { shape: "linear", widthMm: 3600, depthMm: 3400, heightMm: 2600 },
  { shape: "L", widthMm: 3600, depthMm: 3000, heightMm: 2600 },
  { shape: "L", widthMm: 4200, depthMm: 2800, heightMm: 2400 },
  { shape: "U", widthMm: 4200, depthMm: 3000, wallCMm: 3000, heightMm: 2600 },
];

const REQUESTS = fc.record(
  {
    materialTierId: fc.constantFrom(
      "material.melamine",
      "material.painted-mdf",
      "material.veneer",
    ),
    hardwareTierId: fc.constantFrom("hardware.standard", "hardware.premium"),
    cabinetDepthMm: fc.constantFrom(600, 700),
    finish: fc.constantFrom(
      ...PALETTE_ENTRY_IDS.map((entryId) => paletteFinish(entryId)),
      freeColourFinish("#336699"),
    ),
    handle: fc.constantFrom(...HANDLES),
    topRowHandle: fc.constantFrom(...HANDLES),
  },
  { requiredKeys: [] },
);

function generated(
  room: DesignRoom,
  newKitchenSettings: NewKitchenSettings | undefined,
): Design {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
    newKitchenSettings,
  });
  if (!result.ok) throw new Error("the room generates");
  return result.design;
}

function priceOf(design: Design) {
  return priceDesign({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK.version,
  });
}

describe("the two ways to stamp a kitchen agree", () => {
  propertyTest.prop([fc.constantFrom(...ROOMS), REQUESTS], { numRuns: 80 })(
    "gives a generated kitchen the settings the commands give the unstamped one, the depth aside",
    (room, request) => {
      const byGeneration = generated(room, request);
      const unstamped = generated(room, undefined);

      const byTheCommands = stampedDesignOf(unstamped, request);

      const { cabinetDepthMm: generatedDepth, ...generatedSettings } =
        byGeneration.settings ?? {};
      const { cabinetDepthMm: kept, ...commandSettings } =
        byTheCommands.settings ?? {};
      expect(generatedSettings).toEqual(commandSettings);
      expect(generatedDepth).toBe(request.cabinetDepthMm ?? 600);
      expect(kept).toBe(600);
    },
  );

  propertyTest.prop([fc.constantFrom(...ROOMS), REQUESTS], { numRuns: 80 })(
    "writes a document the current contract accepts, on both paths",
    (room, request) => {
      expect(
        CurrentDesignSchema.safeParse(generated(room, request)).success,
      ).toBe(true);
      expect(
        CurrentDesignSchema.safeParse(
          stampedDesignOf(generated(room, undefined), request),
        ).success,
      ).toBe(true);
    },
  );
});

describe("with nothing saved, every room shape prices and resolves as it did unstamped", () => {
  const FIXED_FALLBACKS: NewKitchenSettings = {
    materialTierId: SAMPLE_PRICE_BOOK.material.defaultTierId,
    hardwareTierId: SAMPLE_PRICE_BOOK.hardware.defaultTierId,
    cabinetDepthMm: 600,
    finish: DEFAULT_FINISH,
    handle: DEFAULT_HANDLE,
    topRowHandle: TOP_ROW_HANDLE,
  };

  propertyTest.prop([fc.constantFrom(...ROOMS)], { numRuns: ROOMS.length * 2 })(
    "gives the same lines, the same total and the same colour for every cabinet, by generation and by the commands",
    (room) => {
      const unstamped = generated(room, undefined);

      for (const stamped of [
        generated(room, FIXED_FALLBACKS),
        stampedDesignOf(unstamped, FIXED_FALLBACKS),
      ]) {
        expect(priceOf(stamped)).toEqual(priceOf(unstamped));
        expect(stamped.placements).toEqual(unstamped.placements);
        for (const placement of stamped.placements) {
          expect(resolvedFinishOf(placement, stamped)).toEqual(
            resolvedFinishOf(placement, unstamped),
          );
        }
      }
    },
  );
});
