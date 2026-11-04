// A new kitchen is stamped with the dashboard's defaults, explicitly, and an old one never reads them. The
// generation request takes `newKitchenSettings`; the shell writes each of the six into the design's own `settings`;
// a colour the stamped material does not offer becomes that material's default (ADR 0057, ADR 0071's table of
// defaults); a request without them is the kitchen generation has always made, byte for byte.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  buildLinearShellDesign,
  buildLShellDesign,
  buildUShellDesign,
  cabinetDepthMmOf,
  canonicalSerializeDesign,
  CURRENT_SCHEMA_VERSION,
  CurrentDesignSchema,
  fatalDesignValidationIssues,
  freeColourFinish,
  generateKitchen,
  MATERIALS,
  migrateDesign,
  NewKitchenSettingsError,
  PALETTE_ENTRY_IDS,
  paletteFinish,
  replayGenerationLog,
  setCabinetDepth,
  stampedSettingsOf,
  validateDesignForCatalog,
  validateRoomInput,
  type Design,
  type DesignRoom,
  type Finish,
  type Handle,
  type NewKitchenSettings,
  type RoomInput,
} from "../../src/index.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-10-27T12:00:00.000Z";
const L_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 3600,
  depthMm: 3000,
  heightMm: 2600,
};
const LINEAR_ROOM: DesignRoom = {
  shape: "linear",
  widthMm: 3200,
  depthMm: 2400,
  heightMm: 2600,
};
const U_ROOM: DesignRoom = {
  shape: "U",
  widthMm: 4200,
  depthMm: 3600,
  heightMm: 2600,
  wallCMm: 3000,
};
const ROOMS: readonly DesignRoom[] = [L_ROOM, LINEAR_ROOM, U_ROOM];
const EVERY_HANDLE: readonly Handle[] = ["steel", "black", "push"];

const FULL_DEFAULTS: NewKitchenSettings = {
  materialTierId: "material.painted-mdf",
  hardwareTierId: "hardware-premium",
  cabinetDepthMm: 700,
  finish: freeColourFinish("#336699"),
  handle: "black",
  topRowHandle: "steel",
};

/** ADR 0071 written out, not read from `materials.ts`: PAL makes its six decors, MDF any free colour, veneer its two
 *  woods; what each falls back to is Alb, white and Stejar. */
const MATERIAL_RULES: Readonly<
  Record<
    string,
    { readonly makes: (finish: Finish) => boolean; readonly fallback: Finish }
  >
> = {
  "material.melamine": {
    makes: (finish) =>
      finish.kind === "palette-entry" && finish.entryId.startsWith("pal."),
    fallback: { kind: "palette-entry", entryId: "pal.alb" },
  },
  "material.painted-mdf": {
    makes: (finish) => finish.kind === "free-colour",
    fallback: { kind: "free-colour", value: "#eceeeb" },
  },
  "material.veneer": {
    makes: (finish) =>
      finish.kind === "palette-entry" && finish.entryId.startsWith("veneer."),
    fallback: { kind: "palette-entry", entryId: "veneer.stejar" },
  },
};

/** What `settings` must be for this request, from the rule's words. */
function expectedStamp(request: NewKitchenSettings): object {
  const rule = MATERIAL_RULES[request.materialTierId ?? "material.melamine"];
  const finish =
    request.finish === undefined || rule === undefined
      ? request.finish
      : rule.makes(request.finish)
        ? request.finish
        : rule.fallback;
  return { ...request, cabinetDepthMm: request.cabinetDepthMm ?? 600, finish };
}

function generated(room: DesignRoom, newKitchenSettings?: NewKitchenSettings) {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
    ...(newKitchenSettings === undefined ? {} : { newKitchenSettings }),
  });
  if (!result.ok) throw new Error(`room refused: ${result.reason.code}`);
  return result;
}

function everyFinish(): readonly Finish[] {
  return [
    ...PALETTE_ENTRY_IDS.map((entryId) => paletteFinish(entryId)),
    freeColourFinish("#eceeeb"),
    freeColourFinish("#336699"),
    freeColourFinish("#000000"),
  ];
}

function fatalIssuesOf(design: Design): readonly string[] {
  return fatalDesignValidationIssues(
    validateDesignForCatalog(
      design,
      buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    ),
  ).map((issue) => issue.code);
}

function isStorable(design: Design): boolean {
  return CurrentDesignSchema.safeParse(
    JSON.parse(canonicalSerializeDesign(design)),
  ).success;
}

describe("a request that names no defaults makes the kitchen it always made (byte for byte)", () => {
  it.each(ROOMS)(
    "stamps the reference settings and nothing else in a %o room, and logs no defaults",
    (room) => {
      const result = generated(room);

      expect(result.design.settings).toStrictEqual({ cabinetDepthMm: 600 });
      expect(Object.keys(result.log)).toEqual([
        "occurredAt",
        "plan",
        "steps",
        "commands",
      ]);
    },
  );

  it.each(ROOMS)(
    "is identical, key order included, whether the field is left out or passed as undefined in a %o room",
    (room) => {
      const left = generated(room);
      const passed = generateKitchen({
        room,
        occurredAt: OCCURRED_AT,
        probeAt: createFakeProbeFactory(),
        newKitchenSettings: undefined,
      });

      expect(JSON.stringify(passed)).toBe(JSON.stringify(left));
    },
  );

  it("is the settings the three shell builders always wrote", () => {
    const shells = [
      buildLShellDesign({ room: L_ROOM, occurredAt: OCCURRED_AT }),
      buildLinearShellDesign({ room: LINEAR_ROOM, occurredAt: OCCURRED_AT }),
      buildUShellDesign({ room: U_ROOM, occurredAt: OCCURRED_AT }),
    ];

    for (const shell of shells) {
      expect(shell.settings).toStrictEqual({ cabinetDepthMm: 600 });
    }
  });

  it("does not stamp a handle, which the handle sweeps rely on", () => {
    for (const room of ROOMS) {
      const { settings } = generated(room).design;

      expect(settings?.handle).toBeUndefined();
      expect(settings?.topRowHandle).toBeUndefined();
    }
  });
});

describe("a request that names the defaults has them stamped explicitly (H2-a)", () => {
  it.each(ROOMS)(
    "writes material, hardware, depth, colour, handle and top-row handle in a %o room",
    (room) => {
      const { design } = generated(room, FULL_DEFAULTS);

      expect(design.settings).toStrictEqual(FULL_DEFAULTS);
      expect(Object.keys(design.settings ?? {})).toEqual([
        "materialTierId",
        "hardwareTierId",
        "cabinetDepthMm",
        "finish",
        "handle",
        "topRowHandle",
      ]);
    },
  );

  const SINGLE_KEYS: readonly [string, NewKitchenSettings][] = [
    ["material", { materialTierId: "material.veneer" }],
    ["hardware", { hardwareTierId: "hardware-standard" }],
    ["colour", { finish: paletteFinish("pal.antracit") }],
    ["handle", { handle: "push" }],
    ["top-row handle", { topRowHandle: "black" }],
    ["depth", { cabinetDepthMm: 700 }],
  ];

  it.each(SINGLE_KEYS)(
    "stamps the %s alone and invents no other key",
    (_name, request) => {
      for (const room of ROOMS) {
        expect(generated(room, request).design.settings).toEqual({
          cabinetDepthMm: 600,
          ...request,
        });
      }
    },
  );

  it("puts no choice on any placement: the structural pieces carry no colour and no handle of their own", () => {
    for (const room of ROOMS) {
      const { design } = generated(room, FULL_DEFAULTS);

      expect(
        design.placements.filter(
          (placement) =>
            placement.body.finish !== undefined ||
            placement.body.handle !== undefined,
        ),
      ).toEqual([]);
    }
  });

  it("shares no object with the caller: editing the request afterwards changes neither the design nor the replay", () => {
    const request = { ...FULL_DEFAULTS, finish: freeColourFinish("#336699") };
    const result = generated(L_ROOM, request);
    const designBefore = canonicalSerializeDesign(result.design);

    (request.finish as { value: string }).value = "#000000";

    expect(result.design.settings?.finish).toEqual(freeColourFinish("#336699"));
    expect(
      canonicalSerializeDesign(
        replayGenerationLog({
          log: result.log,
          probeAt: createFakeProbeFactory(),
        }),
      ),
    ).toBe(designBefore);
  });

  it("does not write the request: a frozen one stamps", () => {
    const frozen = Object.freeze({ ...FULL_DEFAULTS });

    expect(stampedSettingsOf(frozen)).toStrictEqual(FULL_DEFAULTS);
  });

  it("refuses a container a design may not hold, before anything is built", () => {
    const refused: NewKitchenSettings[] = [
      { cabinetDepthMm: 650 },
      { cabinetDepthMm: 0 },
      { cabinetDepthMm: null as unknown as number },
      { colour: "white" } as unknown as NewKitchenSettings,
      { materialTierId: "" },
      { handle: "gold" as Handle },
      { topRowHandle: null as unknown as Handle },
      { finish: { kind: "free-colour", value: "blue" } },
    ];

    for (const request of refused) {
      expect(() => generated(L_ROOM, request)).toThrow(NewKitchenSettingsError);
      expect(() =>
        buildLShellDesign({
          room: L_ROOM,
          occurredAt: OCCURRED_AT,
          newKitchenSettings: request,
        }),
      ).toThrow(NewKitchenSettingsError);
    }
  });
});

describe("a colour the default material does not offer resets to that material's default (ADR 0057, the D9B note)", () => {
  it("is the material's offer or its default, for every material and every colour the product declares", () => {
    let resets = 0;
    let kept = 0;
    for (const material of MATERIALS) {
      const rule = MATERIAL_RULES[material.materialId];
      if (rule === undefined)
        throw new Error(`no rule for ${material.materialId}`);
      for (const finish of everyFinish()) {
        const stamped = stampedSettingsOf({
          materialTierId: material.materialId,
          finish,
        });

        if (rule.makes(finish)) {
          kept += 1;
          expect(stamped.finish).toEqual(finish);
        } else {
          resets += 1;
          expect(stamped.finish).toEqual(rule.fallback);
        }
      }
    }

    expect(Object.keys(MATERIAL_RULES)).toHaveLength(MATERIALS.length);
    expect(resets).toBeGreaterThan(MATERIALS.length * 5);
    expect(kept).toBeGreaterThan(MATERIALS.length);
  });

  it("resets a PAL decor under MDF to MDF's white, and an MDF colour under veneer to Stejar", () => {
    expect(
      stampedSettingsOf({
        materialTierId: "material.painted-mdf",
        finish: paletteFinish("pal.alb"),
      }).finish,
    ).toEqual({ kind: "free-colour", value: "#eceeeb" });
    expect(
      stampedSettingsOf({
        materialTierId: "material.veneer",
        finish: freeColourFinish("#336699"),
      }).finish,
    ).toEqual({ kind: "palette-entry", entryId: "veneer.stejar" });
  });

  it("reads an absent material as PAL, as every reader does", () => {
    expect(
      stampedSettingsOf({ finish: freeColourFinish("#336699") }).finish,
    ).toEqual({ kind: "palette-entry", entryId: "pal.alb" });
    expect(
      stampedSettingsOf({ finish: paletteFinish("pal.antracit") }).finish,
    ).toEqual({ kind: "palette-entry", entryId: "pal.antracit" });
  });

  it("resets nothing under a material no book declares, and invents no colour when none is named", () => {
    const colour = freeColourFinish("#336699");

    expect(
      stampedSettingsOf({
        materialTierId: "material.not-in-this-build",
        finish: colour,
      }).finish,
    ).toEqual(colour);
    expect(
      "finish" in stampedSettingsOf({ materialTierId: "material.veneer" }),
    ).toBe(false);
  });

  it.each(MATERIALS.map((material) => material.materialId))(
    "yields a design the write seam stores under %s, for a colour that material does not make",
    (materialTierId) => {
      const request: NewKitchenSettings = {
        materialTierId,
        finish:
          materialTierId === "material.painted-mdf"
            ? paletteFinish("pal.alb")
            : freeColourFinish("#336699"),
      };
      const { design } = generated(L_ROOM, request);

      expect(fatalIssuesOf(design)).toEqual([]);
      expect(isStorable(design)).toBe(true);
    },
  );

  it("is what the validator would otherwise refuse: the same stamp written without the reset is a fatal issue", () => {
    const { design } = generated(L_ROOM);
    const unreset: Design = {
      ...design,
      settings: {
        ...design.settings,
        materialTierId: "material.painted-mdf",
        finish: paletteFinish("pal.alb"),
      },
    };

    expect(fatalIssuesOf(unreset)).not.toEqual([]);
  });
});

describe("a stamped depth is the depth the kitchen is planned, built and probed at", () => {
  it.each(ROOMS)(
    "generates a storable 700 mm kitchen in a %o room, replayable from its log",
    (room) => {
      const result = generated(room, { cabinetDepthMm: 700 });

      expect(cabinetDepthMmOf(result.design)).toBe(700);
      expect(fatalIssuesOf(result.design)).toEqual([]);
      expect(isStorable(result.design)).toBe(true);
      expect(
        replayGenerationLog({
          log: result.log,
          probeAt: createFakeProbeFactory(),
        }),
      ).toEqual(result.design);
    },
  );

  it("replays every stamped default, not only the depth", () => {
    for (const room of ROOMS) {
      const result = generated(room, FULL_DEFAULTS);

      expect(result.log.newKitchenSettings).toEqual(FULL_DEFAULTS);
      expect(
        replayGenerationLog({
          log: result.log,
          probeAt: createFakeProbeFactory(),
        }),
      ).toEqual(result.design);
    }
  });

  it("builds the 700 mm kitchen deeper than the 600 mm one, on every wall it fills", () => {
    const deepestRecordedColumnMm = (design: Design) =>
      Math.max(
        ...[
          ...(design.emptyColumns ?? []),
          ...(design.columnExtents ?? []),
        ].map((column) => column.depthMm),
      );

    for (const room of ROOMS) {
      const shallow = generated(room).design;
      const deep = generated(room, { cabinetDepthMm: 700 }).design;

      expect(deepestRecordedColumnMm(deep)).toBeGreaterThan(
        deepestRecordedColumnMm(shallow),
      );
    }
  });

  it("is refused at 700 exactly where it is refused at 600, over a sweep of rooms of every shape", () => {
    const rooms = approvedRoomsOnASweep();
    const outcomeAt = (room: DesignRoom, cabinetDepthMm: number) => {
      const result = generateKitchen({
        room,
        occurredAt: OCCURRED_AT,
        probeAt: createFakeProbeFactory(),
        newKitchenSettings: { cabinetDepthMm },
      });
      if (result.ok) {
        expect(fatalIssuesOf(result.design), JSON.stringify(room)).toEqual([]);
      }
      return result.ok;
    };

    const disagreements = rooms.filter(
      (room) => outcomeAt(room, 600) !== outcomeAt(room, 700),
    );
    const generatedAt700 = rooms.filter((room) => outcomeAt(room, 700));

    expect(disagreements).toEqual([]);
    for (const shape of ["linear", "L", "U"] as const) {
      expect(
        generatedAt700.filter((room) => room.shape === shape).length,
        shape,
      ).toBeGreaterThanOrEqual(10);
    }
  });
});

/** Rooms the approved policy accepts, on a coarse grid of the three shapes at the three ceilings. */
function approvedRoomsOnASweep(): DesignRoom[] {
  const accepted: DesignRoom[] = [];
  const keep = (input: RoomInput) => {
    const result = validateRoomInput(input, APPROVED_ROOM_POLICY);
    if (result.ok) accepted.push(result.room);
  };
  for (const heightMm of [2200, 2600, 3900]) {
    for (const wallAMm of [900, 1500, 2400, 3600, 6000]) {
      keep({ shape: "linear", wallAMm, heightMm });
      for (const wallBMm of [1000, 2000, 3250, 6000]) {
        keep({
          shape: "L",
          wallAMm,
          wallBMm,
          heightMm,
          cornerDirection: "left",
        });
        for (const wallCMm of [2000, 3600]) {
          keep({
            shape: "U",
            wallAMm,
            wallBMm,
            wallCMm,
            heightMm,
            cornerDirection: "left",
          });
        }
      }
    }
  }
  return accepted;
}

describe("changing the defaults never changes a kitchen that already exists (H2-a)", () => {
  const SETTINGS = fc.record(
    {
      materialTierId: fc.constantFrom(
        ...MATERIALS.map((material) => material.materialId),
      ),
      hardwareTierId: fc.constantFrom("hardware-standard", "hardware-premium"),
      cabinetDepthMm: fc.constantFrom(600, 700),
      finish: fc.constantFrom(...everyFinish()),
      handle: fc.constantFrom(...EVERY_HANDLE),
      topRowHandle: fc.constantFrom(...EVERY_HANDLE),
    },
    { requiredKeys: [] },
  );

  // The load path takes no defaults, so reloading under other ones is a guard against one being threaded in, not a
  // proof; the proof is the next test, where two defaults visibly make two kitchens.
  propertyTest.prop([SETTINGS, SETTINGS], { numRuns: 12 })(
    "a stamped design reloads unchanged, and each generation carries its own defaults' stamp",
    (first, second) => {
      const original = generated(L_ROOM, first).design;
      const stored: unknown = JSON.parse(canonicalSerializeDesign(original));

      const reloaded = migrateDesign(CURRENT_SCHEMA_VERSION, stored);
      const other = generated(L_ROOM, second).design;

      expect(canonicalSerializeDesign(reloaded)).toBe(
        canonicalSerializeDesign(original),
      );
      expect(reloaded.settings).toEqual(expectedStamp(first));
      expect(other.settings).toEqual(expectedStamp(second));
    },
  );

  it("is a real comparison: two different defaults make two different kitchens", () => {
    const one = generated(L_ROOM, { handle: "black", cabinetDepthMm: 700 });
    const other = generated(L_ROOM, { handle: "push" });

    expect(canonicalSerializeDesign(one.design)).not.toBe(
      canonicalSerializeDesign(other.design),
    );
    expect(
      canonicalSerializeDesign(
        migrateDesign(
          CURRENT_SCHEMA_VERSION,
          JSON.parse(canonicalSerializeDesign(one.design)),
        ),
      ),
    ).toBe(canonicalSerializeDesign(one.design));
  });

  it("a stored document that names no tier, no colour and no handle keeps none of them on reload", () => {
    const legacy = generated(L_ROOM).design;

    const reloaded = migrateDesign(
      CURRENT_SCHEMA_VERSION,
      JSON.parse(canonicalSerializeDesign(legacy)),
    );

    expect(reloaded.settings).toStrictEqual({ cabinetDepthMm: 600 });
  });
});

describe("a shell stamped at 700 mm is the shell `setCabinetDepth` makes from the 600 mm one, nothing excluded", () => {
  const shellOf = (
    room: DesignRoom,
    newKitchenSettings?: NewKitchenSettings,
  ) => {
    const input = {
      room,
      occurredAt: OCCURRED_AT,
      ...(newKitchenSettings === undefined ? {} : { newKitchenSettings }),
    };
    if (room.shape === "linear") return buildLinearShellDesign(input);
    return room.shape === "L"
      ? buildLShellDesign(input)
      : buildUShellDesign(input);
  };

  /** The free ground per wall, row, ceiling and clearance, as merged [start, end) spans: every recorded column counts. */
  const freeGroundOf = (design: Design) => {
    const spansByKey = new Map<string, [number, number][]>();
    for (const column of design.emptyColumns ?? []) {
      const key = `${column.wall}|${String(column.y0Mm)}-${String(column.topMm)}|${String(column.depthMm)}`;
      const half = column.widthMm / 2;
      spansByKey.set(key, [
        ...(spansByKey.get(key) ?? []),
        [column.alongMm - half, column.alongMm + half],
      ]);
    }
    return [...spansByKey.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, spans]) => {
        const merged: [number, number][] = [];
        for (const [start, end] of [...spans].sort((a, b) => a[0] - b[0])) {
          const last = merged[merged.length - 1];
          if (last !== undefined && start <= last[1]) {
            last[1] = Math.max(last[1], end);
          } else merged.push([start, end]);
        }
        return [key, merged];
      });
  };

  const structuralPiecesOf = (design: Design) =>
    design.placements
      .map(({ id, wall, alongMm, y0Mm, body }) => ({
        id,
        wall,
        alongMm,
        y0Mm,
        buildId: body.buildId,
        widthMm: body.widthMm,
        heightMm: body.heightMm,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));

  it("has the same structural pieces and the same free ground, with no corner strip left out, in L and U rooms", () => {
    const rooms = approvedRoomsOnASweep().filter(
      (room) => room.shape !== "linear",
    );
    const compared: Record<string, number> = { L: 0, U: 0 };
    for (const room of rooms) {
      const moved = setCabinetDepth({
        design: shellOf(room),
        catalogAt: buildKitchenLBodyCatalog,
        cabinetDepthMm: 700,
        probeAt: createFakeProbeFactory(),
        occurredAt: OCCURRED_AT,
      });
      if (!moved.ok) continue;
      const native = shellOf(room, { cabinetDepthMm: 700 });

      expect(structuralPiecesOf(native), JSON.stringify(room)).toEqual(
        structuralPiecesOf(moved.design),
      );
      expect(freeGroundOf(native), JSON.stringify(room)).toEqual(
        freeGroundOf(moved.design),
      );
      compared[room.shape] = (compared[room.shape] ?? 0) + 1;
    }

    expect(compared["L"]).toBeGreaterThan(20);
    expect(compared["U"]).toBeGreaterThan(20);
  });
});
