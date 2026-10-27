// **Wave H2 QA (M10): what a new kitchen is stamped with is judged once, accepted as the schema accepts it, and stable.**
//
// The implementer's file checks each default is written and a malformed one is refused. This file attacks the seams the
// stamp crosses: (1) a value that is absent in the words of the type must not be accepted in the words of JSON
// (`null`), as the wire the dashboard's defaults arrive on carries it, (2) the depth is judged exactly as the schema
// judges it, (3) everything the stamp accepts comes back from the write seam and the load seam byte-identical, and
// (4) the stamp is a fixed point: stamping what was stamped changes nothing.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  canonicalSerializeDesign,
  CURRENT_SCHEMA_VERSION,
  CurrentDesignSchema,
  DesignSchema,
  DesignSettingsSchema,
  fatalDesignValidationIssues,
  freeColourFinish,
  generateKitchen,
  MATERIALS,
  migrateDesign,
  NewKitchenSettingsError,
  PALETTE_ENTRY_IDS,
  paletteFinish,
  setHardwareTier,
  setKitchenHandle,
  stampedSettingsOf,
  validateDesignForCatalog,
  type DesignRoom,
  type Handle,
  type NewKitchenSettings,
} from "../../src/index.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-10-27T09:30:00.000Z";
const L_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 3600,
  depthMm: 3000,
  heightMm: 2600,
};
const ROOMS: readonly DesignRoom[] = [
  L_ROOM,
  { shape: "linear", widthMm: 3200, depthMm: 2400, heightMm: 2600 },
  { shape: "U", widthMm: 4200, depthMm: 3600, heightMm: 2600, wallCMm: 3000 },
];
const EVERY_HANDLE: readonly Handle[] = ["steel", "black", "push"];

function generate(room: DesignRoom, newKitchenSettings?: NewKitchenSettings) {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
    ...(newKitchenSettings === undefined ? {} : { newKitchenSettings }),
  });
  if (!result.ok) throw new Error(`room refused: ${result.reason.code}`);
  return result;
}

describe("a value the type calls absent is absent in JSON too: `null` is refused, not read as 'use the reference'", () => {
  const KEYS = [
    "materialTierId",
    "hardwareTierId",
    "cabinetDepthMm",
    "finish",
    "handle",
    "topRowHandle",
  ] as const;

  it.each(KEYS)(
    "refuses a null %s the way it refuses a null in any other key",
    (key) => {
      const request = { [key]: null } as unknown as NewKitchenSettings;

      expect(() => stampedSettingsOf(request)).toThrow(NewKitchenSettingsError);
    },
  );
});

describe("the depth is judged as the schema judges it", () => {
  const DEPTHS: readonly unknown[] = [
    0,
    1,
    479,
    480,
    500,
    599,
    601,
    650,
    699,
    701,
    800,
    600.5,
    -600,
    -0,
    NaN,
    Infinity,
    -Infinity,
    "600",
    "700",
    true,
    [],
    {},
    6e2,
    7e2 + 1e-9,
  ];

  it("accepts a depth exactly where a design may hold it", () => {
    for (const depth of DEPTHS) {
      const storable = DesignSettingsSchema.safeParse({
        cabinetDepthMm: depth,
      }).success;
      const request = {
        cabinetDepthMm: depth,
      } as unknown as NewKitchenSettings;

      if (storable) {
        expect(stampedSettingsOf(request).cabinetDepthMm).toBe(depth);
      } else {
        expect(() => stampedSettingsOf(request), String(depth)).toThrow(
          NewKitchenSettingsError,
        );
      }
    }
  });

  it("offers exactly the declared depths: 600 and 700 stamp, and the 100 mm between them does not", () => {
    expect(stampedSettingsOf({ cabinetDepthMm: 600 }).cabinetDepthMm).toBe(600);
    expect(stampedSettingsOf({ cabinetDepthMm: 700 }).cabinetDepthMm).toBe(700);
    for (let depth = 601; depth <= 699; depth += 1) {
      expect(
        () => stampedSettingsOf({ cabinetDepthMm: depth }),
        String(depth),
      ).toThrow(NewKitchenSettingsError);
    }
  });
});

describe("whatever the stamp accepts survives the write seam and the load seam unchanged", () => {
  const FINISHES = fc.oneof(
    fc.constantFrom(...PALETTE_ENTRY_IDS).map((id) => paletteFinish(id)),
    fc
      .array(fc.constantFrom(..."0123456789abcdefABCDEF".split("")), {
        minLength: 6,
        maxLength: 6,
      })
      .map((digits) => freeColourFinish(`#${digits.join("")}`)),
  );
  const REQUESTS = fc.record(
    {
      materialTierId: fc.constantFrom(
        ...MATERIALS.map((material) => material.materialId),
        "material.not-in-this-build",
      ),
      hardwareTierId: fc.constantFrom(
        "hardware-standard",
        "hardware-premium",
        "x",
      ),
      cabinetDepthMm: fc.constantFrom(600, 700),
      finish: FINISHES,
      handle: fc.constantFrom(...EVERY_HANDLE),
      topRowHandle: fc.constantFrom(...EVERY_HANDLE),
    },
    { requiredKeys: [] },
  );

  propertyTest.prop([REQUESTS, fc.constantFrom(...ROOMS)], { numRuns: 60 })(
    "is storable, validator-clean, and reloads to the same bytes",
    (request, room) => {
      const { design } = generate(room, request);

      const wire: unknown = JSON.parse(canonicalSerializeDesign(design));
      expect(CurrentDesignSchema.safeParse(wire).success).toBe(true);
      expect(DesignSchema.safeParse(wire).success).toBe(true);
      expect(
        fatalDesignValidationIssues(
          validateDesignForCatalog(
            design,
            buildKitchenLBodyCatalog(design.settings?.cabinetDepthMm ?? 600),
          ),
        ),
      ).toEqual([]);
      expect(
        canonicalSerializeDesign(migrateDesign(CURRENT_SCHEMA_VERSION, wire)),
      ).toBe(canonicalSerializeDesign(design));
    },
  );

  propertyTest.prop([REQUESTS], { numRuns: 200 })(
    "is a fixed point: stamping a stamped container changes nothing",
    (request) => {
      const once = stampedSettingsOf(request);

      expect(stampedSettingsOf(once)).toStrictEqual(once);
      expect(Object.keys(once)).toEqual(Object.keys(stampedSettingsOf(once)));
    },
  );

  propertyTest.prop([REQUESTS], { numRuns: 200 })(
    "keeps every key the request defines (but the colour, which the material may reset), and invents none",
    (request) => {
      const stamped = stampedSettingsOf(request);

      for (const key of Object.keys(stamped)) {
        expect([...Object.keys(request), "cabinetDepthMm"]).toContain(key);
      }
      for (const [key, value] of Object.entries(request)) {
        if (key === "finish") continue;
        expect(stamped[key as keyof typeof stamped], key).toEqual(value);
      }
    },
  );
});

describe("a stamped kitchen is an ordinary kitchen to the commands that edit its settings", () => {
  it("keeps every stamped key through a hardware-tier change and a kitchen-handle change", () => {
    const stampedRequest: NewKitchenSettings = {
      materialTierId: "material.veneer",
      hardwareTierId: "hardware-premium",
      cabinetDepthMm: 700,
      finish: paletteFinish("veneer.nuc"),
      handle: "black",
      topRowHandle: "steel",
    };
    const { design } = generate(L_ROOM, stampedRequest);

    const handled = setKitchenHandle({
      design,
      handle: "push",
      occurredAt: OCCURRED_AT,
    });
    if (!handled.ok) throw new Error("setKitchenHandle refused");
    const tiered = setHardwareTier({
      design: handled.design,
      tierId: "hardware-standard",
      availableTierIds: ["hardware-standard", "hardware-premium"],
      occurredAt: OCCURRED_AT,
    });
    if (!tiered.ok) throw new Error("setHardwareTier refused");

    expect(tiered.design.settings).toEqual({
      ...design.settings,
      handle: "push",
      hardwareTierId: "hardware-standard",
    });
  });
});

describe("a refused room still logs the defaults it was asked for", () => {
  it("carries newKitchenSettings in the log of a refusal, and none when the request named none", () => {
    const tooSmall: DesignRoom = {
      shape: "L",
      widthMm: 1000,
      depthMm: 1000,
      heightMm: 2600,
    };
    const asked = generateKitchen({
      room: tooSmall,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
      newKitchenSettings: { cabinetDepthMm: 700, handle: "black" },
    });
    const unasked = generateKitchen({
      room: tooSmall,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
    });

    expect(asked.ok).toBe(false);
    expect(unasked.ok).toBe(false);
    expect(asked.log.newKitchenSettings).toEqual({
      cabinetDepthMm: 700,
      handle: "black",
    });
    expect("newKitchenSettings" in unasked.log).toBe(false);
  });
});
