// M10 Q5a QA: counterexample hunting against `replaceColour` and `replaceHandle` (A-16, ADR 0057 decision 2, ADR 0078
// decision 5, H1-b, H2-b).
//
// The implementer's suites pin examples where the stored value and `from` are the very same constant object, and one
// sweep of designs that name declared materials. These attack what that leaves open:
//
//   - `from` as a structurally equal but distinct object (a value read off the wire is never the constant);
//   - an oracle that walks the whole document for every `finish` / `handle` / `topRowHandle` key at any depth and
//     rewrites the ones equal to `from`, so the command is compared with "exactly the stored values equal to `from`"
//     and not with itself, over colours drawn from every palette, free colours and absence;
//   - identity: a refusal returns the design given, a cabinet or the settings nothing reached is the same object, the
//     input is deep-frozen and still answers;
//   - the two commands touch disjoint keys, so they commute;
//   - values the types forbid: a `from` that is not a Finish or a Handle (the command validates `to` only).
//
// Behaviours the commands leave to the caller (H-4: availability is the caller's) are pinned by name at the end, each
// saying what it is, so the next wave that changes one does so on purpose.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  DesignSchema,
  replaceColour,
  replaceHandle,
  type CommandEffect,
  type CommandResult,
  type Design,
  type Handle,
} from "../../src/index.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import {
  freeColourFinish,
  paletteFinish,
  PALETTE_ENTRY_IDS,
  type Finish,
} from "../../src/materials.js";
import {
  CUSTOMISABLE_PLACEMENT_ID,
  PLAIN_PLACEMENT_ID,
  withBodyOf,
  withSettings,
} from "../support/availability-kitchens.js";

const OCCURRED_AT = "2026-11-09T09:00:00.000Z";
const LATER = "2026-11-09T10:30:00.000Z";
const UNDECLARED_MATERIAL = "material.created";

const ANTRACIT = paletteFinish("pal.antracit");
const ALB = paletteFinish("pal.alb");
const HAVANNA = paletteFinish("pal.gri-havanna");
const HANDLES: readonly Handle[] = ["steel", "black", "push"];

/** The same value, a different object: what a Finish read off a request body is. */
/** `JSON.stringify` answers undefined for undefined, whatever its declared type says. */
function labelOf(value: unknown): string {
  const text = JSON.stringify(value) as string | undefined;
  return text ?? "undefined";
}

function copyOf<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

function succeeded<T extends CommandEffect>(result: CommandResult<T>) {
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result;
}

function placementOf(design: Design, placementId: string) {
  const found = design.placements.find(({ id }) => id === placementId);
  if (!found) throw new Error(`no placement ${placementId}`);
  return found;
}

// ---------------------------------------------------------------------------------------------------------------
// The oracle: a walk of the whole document, written without reading the command

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** The document with every property named in `keys` that equals `from` replaced by `to`, found at any depth. */
function oracleRewrite(
  document: Json,
  keys: readonly string[],
  from: Json,
  to: Json,
): Json {
  if (Array.isArray(document)) {
    return document.map((item) => oracleRewrite(item, keys, from, to));
  }
  if (typeof document === "object" && document !== null) {
    return Object.fromEntries(
      Object.entries(document).map(([key, value]) => [
        key,
        keys.includes(key) && JSON.stringify(value) === JSON.stringify(from)
          ? copyOf(to)
          : oracleRewrite(value, keys, from, to),
      ]),
    );
  }
  return document;
}

function expectedAfter(
  design: Design,
  keys: readonly string[],
  from: Json,
  to: Json,
): Json {
  const rewritten = oracleRewrite(copyOf(design) as Json, keys, from, to);
  return { ...(rewritten as Record<string, Json>), updatedAt: OCCURRED_AT };
}

// ---------------------------------------------------------------------------------------------------------------
// Generated designs: the seeded kitchen with colours and handles dealt at every level, some absent

const maybe = <T>(arbitrary: fc.Arbitrary<T>) =>
  fc.option(arbitrary, { nil: undefined });

const PLACEMENT_COUNT = KITCHEN_L_DESIGN.placements.length;
const ALL_COLOURS: readonly Finish[] = [
  ...PALETTE_ENTRY_IDS.map(paletteFinish),
  freeColourFinish("#336699"),
  freeColourFinish("#eceeeb"),
];
const PAL_COLOURS: readonly Finish[] = PALETTE_ENTRY_IDS.filter((entryId) =>
  entryId.startsWith("pal."),
).map(paletteFinish);

interface Deal {
  readonly materialTierId: string;
  readonly colours: readonly Finish[];
  readonly kitchenColour: Finish | undefined;
  readonly kitchenHandle: Handle | undefined;
  readonly topRowHandle: Handle | undefined;
  readonly ownColours: readonly (Finish | undefined)[];
  readonly ownHandles: readonly (Handle | undefined)[];
}

function dealt(deal: Deal): Design {
  const placements = KITCHEN_L_DESIGN.placements.map((placement, index) => {
    const finish = deal.ownColours[index];
    const handle = deal.ownHandles[index];
    return {
      ...placement,
      body: {
        ...placement.body,
        ...(finish ? { finish: copyOf(finish) } : {}),
        ...(handle ? { handle } : {}),
      },
    };
  });
  return {
    ...KITCHEN_L_DESIGN,
    placements,
    settings: {
      cabinetDepthMm: 600,
      materialTierId: deal.materialTierId,
      ...(deal.kitchenColour ? { finish: copyOf(deal.kitchenColour) } : {}),
      ...(deal.kitchenHandle ? { handle: deal.kitchenHandle } : {}),
      ...(deal.topRowHandle ? { topRowHandle: deal.topRowHandle } : {}),
    },
  };
}

/** A material no code declares offers every schema-valid colour, so any pair of colours is replaceable under it; PAL
 *  offers its own six only. */
const aDeal: fc.Arbitrary<Deal> = fc
  .constantFrom(
    { materialTierId: UNDECLARED_MATERIAL, colours: ALL_COLOURS },
    { materialTierId: "material.melamine", colours: PAL_COLOURS },
  )
  .chain(({ materialTierId, colours }) => {
    const aColour = fc.constantFrom(...colours);
    const aHandle = fc.constantFrom(...HANDLES);
    return fc.record({
      materialTierId: fc.constant(materialTierId),
      colours: fc.constant(colours),
      kitchenColour: maybe(aColour),
      kitchenHandle: maybe(aHandle),
      topRowHandle: maybe(aHandle),
      ownColours: fc.array(maybe(aColour), {
        minLength: PLACEMENT_COUNT,
        maxLength: PLACEMENT_COUNT,
      }),
      ownHandles: fc.array(maybe(aHandle), {
        minLength: PLACEMENT_COUNT,
        maxLength: PLACEMENT_COUNT,
      }),
    });
  });

describe("replaceColour against an oracle that walks the whole document", () => {
  it("rewrites exactly the stored `finish` values equal to `from`, at every depth, and nothing else", () => {
    let rewrites = 0;
    fc.assert(
      fc.property(aDeal, fc.nat(), fc.nat(), (deal, fromPick, toPick) => {
        const design = dealt(deal);
        const from = copyOf(deal.colours[fromPick % deal.colours.length]);
        const to = copyOf(deal.colours[toPick % deal.colours.length]);
        if (from === undefined || to === undefined) return;

        const result = succeeded(
          replaceColour({ design, from, to, occurredAt: OCCURRED_AT }),
        );

        expect(result.design).toEqual(
          expectedAfter(design, ["finish"], from, to),
        );
        expect(result.effect).toEqual({ type: "colour_replaced", from, to });
        expect(DesignSchema.safeParse(result.design).success).toBe(true);
        if (JSON.stringify(from) !== JSON.stringify(to)) {
          expect(
            JSON.stringify(result.design).includes(JSON.stringify(from)),
          ).toBe(false);
        }
        if (JSON.stringify(design).includes(JSON.stringify(from))) {
          rewrites += 1;
        }
      }),
      { numRuns: 600 },
    );
    expect(rewrites).toBeGreaterThan(100);
  });

  it("hands back the very same cabinet and settings objects wherever nothing matched, and never touches a handle", () => {
    fc.assert(
      fc.property(aDeal, fc.nat(), fc.nat(), (deal, fromPick, toPick) => {
        const design = dealt(deal);
        const from = copyOf(deal.colours[fromPick % deal.colours.length]);
        const to = copyOf(deal.colours[toPick % deal.colours.length]);
        if (from === undefined || to === undefined) return;

        const { design: after } = succeeded(
          replaceColour({ design, from, to, occurredAt: OCCURRED_AT }),
        );

        design.placements.forEach((placement, index) => {
          const own = placement.body.finish;
          const matched =
            own !== undefined && JSON.stringify(own) === JSON.stringify(from);
          const afterPlacement = after.placements[index];
          if (!matched) expect(afterPlacement).toBe(placement);
          expect(afterPlacement?.body.handle).toBe(placement.body.handle);
        });
        const settingsMatched =
          design.settings?.finish !== undefined &&
          JSON.stringify(design.settings.finish) === JSON.stringify(from);
        if (!settingsMatched) expect(after.settings).toBe(design.settings);
        expect(after.settings?.handle).toBe(design.settings?.handle);
        expect(after.settings?.topRowHandle).toBe(
          design.settings?.topRowHandle,
        );
      }),
      { numRuns: 300 },
    );
  });
});

describe("replaceHandle against an oracle that walks the whole document", () => {
  it("rewrites exactly the stored `handle` and `topRowHandle` values equal to `from`, and nothing else", () => {
    let rewrites = 0;
    fc.assert(
      fc.property(
        aDeal,
        fc.constantFrom(...HANDLES),
        fc.constantFrom(...HANDLES),
        (deal, from, to) => {
          const design = dealt(deal);

          const result = succeeded(
            replaceHandle({ design, from, to, occurredAt: OCCURRED_AT }),
          );

          expect(result.design).toEqual(
            expectedAfter(design, ["handle", "topRowHandle"], from, to),
          );
          expect(result.effect).toEqual({ type: "handle_replaced", from, to });
          expect(DesignSchema.safeParse(result.design).success).toBe(true);
          if (JSON.stringify(design).includes(`"${from}"`)) rewrites += 1;
        },
      ),
      { numRuns: 600 },
    );
    expect(rewrites).toBeGreaterThan(300);
  });

  it("hands back the very same cabinet and settings objects wherever nothing matched, and never touches a colour", () => {
    fc.assert(
      fc.property(
        aDeal,
        fc.constantFrom(...HANDLES),
        fc.constantFrom(...HANDLES),
        (deal, from, to) => {
          const design = dealt(deal);

          const { design: after } = succeeded(
            replaceHandle({ design, from, to, occurredAt: OCCURRED_AT }),
          );

          design.placements.forEach((placement, index) => {
            const afterPlacement = after.placements[index];
            if (placement.body.handle !== from) {
              expect(afterPlacement).toBe(placement);
            }
            expect(afterPlacement?.body.finish).toBe(placement.body.finish);
          });
          if (
            design.settings?.handle !== from &&
            design.settings?.topRowHandle !== from
          ) {
            expect(after.settings).toBe(design.settings);
          }
          expect(after.settings?.finish).toBe(design.settings?.finish);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("the two commands, together", () => {
  it("commute: a colour and a handle replaced in either order give the same document", () => {
    fc.assert(
      fc.property(
        aDeal,
        fc.nat(),
        fc.nat(),
        fc.constantFrom(...HANDLES),
        fc.constantFrom(...HANDLES),
        (deal, fromPick, toPick, fromHandle, toHandle) => {
          const design = dealt(deal);
          const fromColour = deal.colours[fromPick % deal.colours.length];
          const toColour = deal.colours[toPick % deal.colours.length];
          if (fromColour === undefined || toColour === undefined) return;
          const colour = (input: Design) =>
            succeeded(
              replaceColour({
                design: input,
                from: fromColour,
                to: toColour,
                occurredAt: OCCURRED_AT,
              }),
            ).design;
          const handle = (input: Design) =>
            succeeded(
              replaceHandle({
                design: input,
                from: fromHandle,
                to: toHandle,
                occurredAt: OCCURRED_AT,
              }),
            ).design;

          expect(handle(colour(design))).toEqual(colour(handle(design)));
        },
      ),
      { numRuns: 200 },
    );
  });

  it("answer a deep-frozen document exactly as they answer a mutable one, and are deterministic", () => {
    fc.assert(
      fc.property(aDeal, fc.constantFrom(...HANDLES), (deal, from) => {
        const design = dealt(deal);
        const frozen = deepFreeze(copyOf(design));
        const [fromColour, toColour] = [deal.colours[0], deal.colours[1]];
        if (fromColour === undefined || toColour === undefined) return;

        const frozenColour = replaceColour({
          design: frozen,
          from: fromColour,
          to: toColour,
          occurredAt: OCCURRED_AT,
        });
        const frozenHandle = replaceHandle({
          design: frozen,
          from,
          to: "push",
          occurredAt: OCCURRED_AT,
        });

        expect(frozenColour).toEqual(
          replaceColour({
            design,
            from: fromColour,
            to: toColour,
            occurredAt: OCCURRED_AT,
          }),
        );
        expect(frozenHandle).toEqual(
          replaceHandle({ design, from, to: "push", occurredAt: OCCURRED_AT }),
        );
        expect(frozen).toEqual(design);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Each level alone: one stored value, from a distinct but equal object

describe("replaceColour reaches each level it is stored at, one level at a time, by value", () => {
  const to = paletteFinish("pal.alb");

  it("reaches settings.finish when only the settings carry it, `from` being a copy of the stored value", () => {
    const design = withSettings({ cabinetDepthMm: 600, finish: ANTRACIT });

    const { design: after } = succeeded(
      replaceColour({
        design,
        from: copyOf(ANTRACIT),
        to,
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(after.settings).toEqual({ cabinetDepthMm: 600, finish: to });
    expect(after.placements).toEqual(design.placements);
    design.placements.forEach((placement, index) => {
      expect(after.placements[index]).toBe(placement);
    });
  });

  it("reaches body.finish when only one cabinet carries it, `from` being a copy, and no other cabinet moves", () => {
    const design = withBodyOf(CUSTOMISABLE_PLACEMENT_ID, {
      finish: copyOf(ANTRACIT),
    });

    const { design: after } = succeeded(
      replaceColour({
        design,
        from: copyOf(ANTRACIT),
        to,
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(placementOf(after, CUSTOMISABLE_PLACEMENT_ID).body.finish).toEqual(
      to,
    );
    design.placements
      .filter(({ id }) => id !== CUSTOMISABLE_PLACEMENT_ID)
      .forEach((placement) => {
        expect(placementOf(after, placement.id)).toBe(placement);
      });
    expect(after.settings).toBe(design.settings);
  });

  it("matches a free colour by its value, and never a palette entry for a free colour or the other way round", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: UNDECLARED_MATERIAL,
      finish: freeColourFinish("#336699"),
    });
    const withPalette = withBodyOf(
      CUSTOMISABLE_PLACEMENT_ID,
      { finish: ANTRACIT },
      design,
    );

    const { design: after } = succeeded(
      replaceColour({
        design: withPalette,
        from: copyOf(freeColourFinish("#336699")),
        to,
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(after.settings?.finish).toEqual(to);
    expect(placementOf(after, CUSTOMISABLE_PLACEMENT_ID).body.finish).toEqual(
      ANTRACIT,
    );
  });

  it("matches on a body that takes no colour at all, since equality is the one rule, and the scene never reads it", () => {
    const design = withBodyOf(PLAIN_PLACEMENT_ID, { finish: ANTRACIT });

    const { design: after } = succeeded(
      replaceColour({ design, from: ANTRACIT, to, occurredAt: OCCURRED_AT }),
    );

    expect(placementOf(after, PLAIN_PLACEMENT_ID).body.finish).toEqual(to);
  });
});

describe("replaceHandle reaches each level it is stored at, one level at a time", () => {
  it("reaches settings.handle alone, leaving an absent topRowHandle absent", () => {
    const design = withSettings({ cabinetDepthMm: 600, handle: "black" });

    const { design: after } = succeeded(
      replaceHandle({
        design,
        from: "black",
        to: "push",
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(after.settings).toEqual({ cabinetDepthMm: 600, handle: "push" });
    expect(Object.keys(after.settings ?? {})).not.toContain("topRowHandle");
  });

  it("reaches settings.topRowHandle alone, leaving an absent handle absent", () => {
    const design = withSettings({ cabinetDepthMm: 600, topRowHandle: "black" });

    const { design: after } = succeeded(
      replaceHandle({
        design,
        from: "black",
        to: "steel",
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(after.settings).toEqual({
      cabinetDepthMm: 600,
      topRowHandle: "steel",
    });
    expect(Object.keys(after.settings ?? {})).not.toContain("handle");
  });

  it("reaches body.handle alone, on a cabinet and on a body that takes no handle", () => {
    const design = withBodyOf(
      PLAIN_PLACEMENT_ID,
      { handle: "black" },
      withBodyOf(CUSTOMISABLE_PLACEMENT_ID, { handle: "black" }),
    );

    const { design: after } = succeeded(
      replaceHandle({
        design,
        from: "black",
        to: "push",
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(placementOf(after, CUSTOMISABLE_PLACEMENT_ID).body.handle).toBe(
      "push",
    );
    expect(placementOf(after, PLAIN_PLACEMENT_ID).body.handle).toBe("push");
    expect(after.settings).toBe(design.settings);
  });

  it("never gives an absent handle one, at any level, however many cabinets and levels hold none", () => {
    const design = withSettings({ cabinetDepthMm: 600 });

    const { design: after } = succeeded(
      replaceHandle({
        design,
        from: "black",
        to: "push",
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(after.settings).toBe(design.settings);
    for (const placement of after.placements) {
      expect(Object.keys(placement.body)).not.toContain("handle");
    }
  });

  it("never gives a document with no settings container one, whether the cabinets wear the item or not", () => {
    const withoutSettings = (design: Design): Design => {
      const copy = { ...design };
      Reflect.deleteProperty(copy, "settings");
      return copy;
    };
    const wearing = withoutSettings(
      withBodyOf(CUSTOMISABLE_PLACEMENT_ID, {
        finish: ANTRACIT,
        handle: "black",
      }),
    );
    const bare = withoutSettings(KITCHEN_L_DESIGN);

    for (const design of [wearing, bare]) {
      const colour = succeeded(
        replaceColour({
          design,
          from: ANTRACIT,
          to: ALB,
          occurredAt: OCCURRED_AT,
        }),
      ).design;
      const handle = succeeded(
        replaceHandle({
          design,
          from: "black",
          to: "push",
          occurredAt: OCCURRED_AT,
        }),
      ).design;

      expect(Object.keys(colour)).not.toContain("settings");
      expect(Object.keys(handle)).not.toContain("settings");
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Refusals

describe("a refusal returns the design it was given, by identity, and the first failing check names it", () => {
  const BAD_TIMESTAMPS: readonly string[] = [
    "",
    "yesterday",
    "2026-11-09",
    "2026-11-09T09:00:00Z",
    "2026-11-09T09:00:00.000",
    "2026-13-45T09:00:00.000Z",
    " 2026-11-09T09:00:00.000Z",
  ];
  const design = withSettings({
    cabinetDepthMm: 600,
    materialTierId: "material.melamine",
    finish: ANTRACIT,
    handle: "black",
  });

  it.each(BAD_TIMESTAMPS)(
    "INVALID_OCCURRED_AT for %j, before the colour or the handle is looked at",
    (occurredAt) => {
      const colour = replaceColour({
        design,
        from: ANTRACIT,
        to: { kind: "palette-entry", entryId: "veneer.nuc" },
        occurredAt,
      });
      const handle = replaceHandle({
        design,
        from: "black",
        to: "gold" as Handle,
        occurredAt,
      });

      for (const result of [colour, handle]) {
        expect(result).toMatchObject({
          ok: false,
          reason: { code: "INVALID_OCCURRED_AT", params: {} },
        });
        expect(result.design).toBe(design);
      }
    },
  );

  it("INVALID_OCCURRED_AT even when nothing would have changed, so a no-op does not stamp a bad clock", () => {
    const result = replaceColour({
      design,
      from: HAVANNA,
      to: ALB,
      occurredAt: "nope",
    });

    expect(result).toMatchObject({
      ok: false,
      reason: { code: "INVALID_OCCURRED_AT" },
    });
    expect(result.design).toBe(design);
  });

  it("INVALID_OCCURRED_AT for a timestamp that is no string at all, without throwing", () => {
    for (const occurredAt of [undefined, null, 0, {}] as unknown as string[]) {
      const result = replaceHandle({
        design,
        from: "black",
        to: "push",
        occurredAt,
      });

      expect(result).toMatchObject({
        ok: false,
        reason: { code: "INVALID_OCCURRED_AT" },
      });
      expect(result.design).toBe(design);
    }
  });

  const NOT_A_FINISH: readonly unknown[] = [
    undefined,
    null,
    "pal.alb",
    {},
    { kind: "palette-entry" },
    { kind: "palette-entry", entryId: "__proto__" },
    { kind: "palette-entry", entryId: "constructor" },
    { kind: "palette-entry", entryId: "pal.nope" },
    { kind: "free-colour", value: "red" },
    { kind: "free-colour", value: "#12345" },
    { kind: "free-colour", value: "#1234567" },
    { kind: "free-colour" },
    { ...ALB, extra: 1 },
    { kind: "__proto__", entryId: "pal.alb" },
  ];

  it.each(NOT_A_FINISH.map((value) => [labelOf(value), value] as const))(
    "FINISH_NOT_OFFERED for a `to` of %s, under a declared material and under one no code declares",
    (_label, value) => {
      const undeclared = withSettings({
        cabinetDepthMm: 600,
        materialTierId: UNDECLARED_MATERIAL,
        finish: ANTRACIT,
      });

      for (const given of [design, undeclared]) {
        const result = replaceColour({
          design: given,
          from: ANTRACIT,
          to: value as Finish,
          occurredAt: OCCURRED_AT,
        });

        expect(result).toMatchObject({
          ok: false,
          reason: { code: "FINISH_NOT_OFFERED", params: {} },
        });
        expect(result.design).toBe(given);
      }
    },
  );

  const NOT_A_HANDLE: readonly unknown[] = [
    undefined,
    null,
    "",
    "STEEL",
    "gold",
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    0,
    ["push"],
    { handle: "push" },
  ];

  it.each(NOT_A_HANDLE.map((value) => [labelOf(value), value] as const))(
    "UNKNOWN_HANDLE for a `to` of %s",
    (_label, value) => {
      const result = replaceHandle({
        design,
        from: "black",
        to: value as Handle,
        occurredAt: OCCURRED_AT,
      });

      expect(result).toMatchObject({
        ok: false,
        reason: { code: "UNKNOWN_HANDLE", params: {} },
      });
      expect(result.design).toBe(design);
    },
  );

  it("refuses a colour the material does not offer even when `from` is not stored, since validity is judged first", () => {
    const result = replaceColour({
      design,
      from: freeColourFinish("#010203"),
      to: paletteFinish("veneer.stejar"),
      occurredAt: OCCURRED_AT,
    });

    expect(result).toMatchObject({
      ok: false,
      reason: { code: "FINISH_NOT_OFFERED" },
    });
    expect(result.design).toBe(design);
  });

  it("answers a refusal with no effect and leaves the prototype chain alone", () => {
    const result = replaceHandle({
      design,
      from: "black",
      to: "__proto__" as Handle,
      occurredAt: OCCURRED_AT,
    });

    expect(result).not.toHaveProperty("effect");
    expect(({} as Record<string, unknown>)["handle"]).toBeUndefined();
    expect(Object.keys(Object.prototype)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// A `from` the types forbid. `Finish` is an inferred type, so a malformed value type-checks and must still be refused
// at the commands (ADR 0078 decision 6; `designOffersFinish`'s doc), yet only `to` is validated here. Whether Q5b hands
// a `from` through unparsed is an inference until that wave exists; the command is the seam that does not depend on it.

describe("a `from` that is no Finish and no Handle never writes a value the design did not hold", () => {
  const design = withBodyOf(
    CUSTOMISABLE_PLACEMENT_ID,
    { finish: ANTRACIT },
    withSettings({
      cabinetDepthMm: 600,
      materialTierId: UNDECLARED_MATERIAL,
      finish: ALB,
    }),
  );

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a bare string", "pal.alb"],
    ["an empty object", {}],
  ])(
    "replaceHandle with a `from` of %s changes no stored handle, absent ones included",
    (_label, from) => {
      const result = replaceHandle({
        design,
        from: from as unknown as Handle,
        to: "push",
        occurredAt: OCCURRED_AT,
      });

      const handlesAfter =
        (result.design.settings?.handle ?? "absent") +
        result.design.placements
          .map(({ body }) => body.handle ?? "absent")
          .join();
      const handlesBefore =
        (design.settings?.handle ?? "absent") +
        design.placements.map(({ body }) => body.handle ?? "absent").join();
      expect(handlesAfter).toBe(handlesBefore);
      expect(result.design.settings).not.toHaveProperty("topRowHandle");
    },
  );

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a bare string", "pal.antracit"],
    ["an empty object", {}],
  ])(
    "replaceColour with a `from` of %s answers with a result and not a TypeError",
    (_label, from) => {
      expect(() =>
        replaceColour({
          design,
          from: from as unknown as Finish,
          to: ALB,
          occurredAt: OCCURRED_AT,
        }),
      ).not.toThrow();
    },
  );
});

// ---------------------------------------------------------------------------------------------------------------
// Pinned: what the commands leave to the caller (H-4). Each says what it is and decides nothing.

describe("PINNED CURRENT BEHAVIOUR: the commands judge validity, not availability or need (H-4)", () => {
  it("from == to succeeds, emits its effect and stamps updatedAt: a no-op is not a refusal and is not the design given", () => {
    const design = withSettings({ cabinetDepthMm: 600, finish: ANTRACIT });

    const result = succeeded(
      replaceColour({
        design,
        from: ANTRACIT,
        to: ANTRACIT,
        occurredAt: LATER,
      }),
    );

    expect(result.effect).toEqual({
      type: "colour_replaced",
      from: ANTRACIT,
      to: ANTRACIT,
    });
    expect(result.design).not.toBe(design);
    expect(result.design.updatedAt).toBe(LATER);
    expect({ ...result.design, updatedAt: design.updatedAt }).toEqual(design);
  });

  it("a `from` the design never stores succeeds the same way: a new document, a new clock, nothing rewritten", () => {
    const design = withSettings({ cabinetDepthMm: 600, handle: "steel" });

    const result = succeeded(
      replaceHandle({ design, from: "black", to: "push", occurredAt: LATER }),
    );

    expect(result.design).not.toBe(design);
    expect(result.design.updatedAt).toBe(LATER);
    expect(result.design.settings).toBe(design.settings);
    result.design.placements.forEach((placement, index) => {
      expect(placement).toBe(design.placements[index]);
    });
  });

  it("a `from` that is not switched off, and a `to` that is, both succeed: availability is the caller's", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.melamine",
      finish: ANTRACIT,
    });

    const result = succeeded(
      replaceColour({
        design,
        from: ANTRACIT,
        to: HAVANNA,
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(result.design.settings?.finish).toEqual(HAVANNA);
  });

  it("merges into a `to` the design already stores: the rewritten values and the existing ones then agree", () => {
    const design = withBodyOf(
      CUSTOMISABLE_PLACEMENT_ID,
      { finish: HAVANNA },
      withSettings({ cabinetDepthMm: 600, finish: ANTRACIT }),
    );

    const { design: after } = succeeded(
      replaceColour({
        design,
        from: ANTRACIT,
        to: HAVANNA,
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(after.settings?.finish).toEqual(HAVANNA);
    expect(placementOf(after, CUSTOMISABLE_PLACEMENT_ID)).toBe(
      placementOf(design, CUSTOMISABLE_PLACEMENT_ID),
    );
  });

  it("under a material no code declares, a `to` from another material's palette is accepted: the schema is the only gate", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: UNDECLARED_MATERIAL,
      finish: ANTRACIT,
    });

    const result = succeeded(
      replaceColour({
        design,
        from: ANTRACIT,
        to: paletteFinish("veneer.nuc"),
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(result.design.settings?.finish).toEqual(paletteFinish("veneer.nuc"));
  });

  it("writes the caller's `to` object itself at every level, so the levels share one reference", () => {
    const to = copyOf(ALB);
    const design = withBodyOf(
      CUSTOMISABLE_PLACEMENT_ID,
      { finish: ANTRACIT },
      withSettings({ cabinetDepthMm: 600, finish: ANTRACIT }),
    );

    const { design: after } = succeeded(
      replaceColour({ design, from: ANTRACIT, to, occurredAt: OCCURRED_AT }),
    );

    expect(after.settings?.finish).toBe(to);
    expect(placementOf(after, CUSTOMISABLE_PLACEMENT_ID).body.finish).toBe(to);
  });

  it("a hostile document key named __proto__ survives a rewrite as data and pollutes nothing", () => {
    const hostile = JSON.parse(
      `{"kind":"palette-entry","entryId":"pal.antracit","__proto__":{"handle":"push"}}`,
    ) as Finish;
    const design = withSettings({ cabinetDepthMm: 600, handle: "black" });

    succeeded(
      replaceHandle({
        design,
        from: "black",
        to: "push",
        occurredAt: OCCURRED_AT,
      }),
    );
    const refused = replaceColour({
      design,
      from: ANTRACIT,
      to: hostile,
      occurredAt: OCCURRED_AT,
    });

    expect(refused.ok).toBe(false);
    expect(({} as Record<string, unknown>)["handle"]).toBeUndefined();
  });
});
