// `replaceColour` and `replaceHandle` (M10 Q5a, A-16): the switched-off item replaced at every level the design stores
// it, and nothing else, as one result with one effect. The sweep over random designs is in the `.property` sibling.
import { describe, expect, it } from "vitest";

import {
  replaceColour,
  replaceHandle,
  type CommandEffect,
  type CommandResult,
  type Design,
  type Handle,
} from "../../src/index.js";
import { paletteFinish, freeColourFinish } from "../../src/materials.js";
import {
  CUSTOMISABLE_PLACEMENT_ID,
  withBodyOf,
  withSettings,
} from "../support/availability-kitchens.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";

const OCCURRED_AT = "2026-11-09T09:00:00.000Z";

const ANTRACIT = paletteFinish("pal.antracit");
const ALB = paletteFinish("pal.alb");
const HAVANNA = paletteFinish("pal.gri-havanna");

/** The seeded kitchen naming one colour at three levels: the kitchen's, one cabinet's, and a second cabinet's other one. */
function kitchenWearingAntracit(): Design {
  const [first, second] = KITCHEN_L_DESIGN.placements;
  if (!first || !second) throw new Error("the seeded kitchen has no cabinets");
  const base = withSettings({ cabinetDepthMm: 600, finish: ANTRACIT });
  return {
    ...base,
    placements: base.placements.map((placement) => {
      if (placement.id === first.id) {
        return { ...placement, body: { ...placement.body, finish: ANTRACIT } };
      }
      if (placement.id === second.id) {
        return { ...placement, body: { ...placement.body, finish: HAVANNA } };
      }
      return placement;
    }),
  };
}

function succeeded<T extends CommandEffect>(result: CommandResult<T>) {
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result;
}

describe("replaceColour", () => {
  it("rewrites the kitchen's colour and each cabinet wearing it, and no other colour", () => {
    const design = kitchenWearingAntracit();

    const { design: after, effect } = succeeded(
      replaceColour({
        design,
        from: ANTRACIT,
        to: ALB,
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(effect).toEqual({
      type: "colour_replaced",
      from: ANTRACIT,
      to: ALB,
    });
    expect(after.settings?.finish).toEqual(ALB);
    const finishes = after.placements.map((placement) => placement.body.finish);
    expect(finishes).not.toContainEqual(ANTRACIT);
    expect(finishes.filter((finish) => finish !== undefined)).toEqual([
      ALB,
      HAVANNA,
    ]);
  });

  it("leaves a cabinet's own other colour the very same object, and the rest of the document as it was", () => {
    const design = kitchenWearingAntracit();

    const { design: after } = succeeded(
      replaceColour({
        design,
        from: ANTRACIT,
        to: ALB,
        occurredAt: OCCURRED_AT,
      }),
    );

    const own = design.placements.filter(
      (placement) => placement.body.finish?.kind === "palette-entry",
    );
    const otherColour = own.find(
      (placement) => placement.body.finish === HAVANNA,
    );
    const untouched = after.placements.find(
      (placement) => placement.id === otherColour?.id,
    );
    expect(untouched).toBe(otherColour);
    expect(after).toEqual({
      ...design,
      settings: { cabinetDepthMm: 600, finish: ALB },
      placements: after.placements,
      updatedAt: OCCURRED_AT,
    });
    expect(after.createdAt).toBe(design.createdAt);
  });

  it("never gives a cabinet that chose no colour one, nor a document with no settings a settings container", () => {
    const unsettled: Design = {
      ...withBodyOf(CUSTOMISABLE_PLACEMENT_ID, { finish: ANTRACIT }),
    };
    Reflect.deleteProperty(unsettled, "settings");

    const { design: after } = succeeded(
      replaceColour({
        design: unsettled,
        from: ANTRACIT,
        to: ALB,
        occurredAt: OCCURRED_AT,
      }),
    );

    expect("settings" in after).toBe(false);
    const withAFinish = after.placements.filter(
      (placement) => "finish" in placement.body,
    );
    expect(withAFinish.map((placement) => placement.id)).toEqual([
      CUSTOMISABLE_PLACEMENT_ID,
    ]);
    expect(withAFinish[0]?.body.finish).toEqual(ALB);
  });

  it("accepts any colour under a material no code declares, since such a material offers none of its own", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.created",
      finish: ANTRACIT,
    });

    const result = replaceColour({
      design,
      from: ANTRACIT,
      to: freeColourFinish("#123456"),
      occurredAt: OCCURRED_AT,
    });

    expect(succeeded(result).design.settings?.finish).toEqual(
      freeColourFinish("#123456"),
    );
  });

  it("refuses a colour the design's material does not offer, returning the design as given", () => {
    const design = kitchenWearingAntracit();

    const result = replaceColour({
      design,
      from: ANTRACIT,
      to: paletteFinish("veneer.nuc"),
      occurredAt: OCCURRED_AT,
    });

    expect(result).toMatchObject({
      ok: false,
      reason: { code: "FINISH_NOT_OFFERED" },
    });
    expect(result.design).toBe(design);
  });

  it("refuses a malformed timestamp before it looks at the colour", () => {
    const design = kitchenWearingAntracit();

    const result = replaceColour({
      design,
      from: ANTRACIT,
      to: paletteFinish("veneer.nuc"),
      occurredAt: "yesterday",
    });

    expect(result).toMatchObject({
      ok: false,
      reason: { code: "INVALID_OCCURRED_AT" },
    });
    expect(result.design).toBe(design);
  });
});

/** The seeded kitchen naming `black` as the kitchen's handle, the top row's, one cabinet's own, and `steel` on another's. */
function kitchenWearingBlack(): Design {
  const base = withSettings({
    cabinetDepthMm: 600,
    handle: "black",
    topRowHandle: "black",
  });
  const [first, second] = base.placements;
  if (!first || !second) throw new Error("the seeded kitchen has no cabinets");
  return {
    ...base,
    placements: base.placements.map((placement) => {
      if (placement.id === first.id) {
        return { ...placement, body: { ...placement.body, handle: "black" } };
      }
      if (placement.id === second.id) {
        return { ...placement, body: { ...placement.body, handle: "steel" } };
      }
      return placement;
    }),
  };
}

describe("replaceHandle", () => {
  it("rewrites the kitchen's handle, the top row's and each cabinet wearing it, and no other handle", () => {
    const design = kitchenWearingBlack();

    const { design: after, effect } = succeeded(
      replaceHandle({
        design,
        from: "black",
        to: "push",
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(effect).toEqual({
      type: "handle_replaced",
      from: "black",
      to: "push",
    });
    expect(after.settings).toEqual({
      cabinetDepthMm: 600,
      handle: "push",
      topRowHandle: "push",
    });
    const handles = after.placements.flatMap((placement) =>
      placement.body.handle === undefined ? [] : [placement.body.handle],
    );
    expect(handles).toEqual(["push", "steel"]);
  });

  it("keeps a top-row handle that is another handle, and does not invent one that was absent", () => {
    const keeping = withSettings({
      cabinetDepthMm: 600,
      handle: "black",
      topRowHandle: "steel",
    });
    const following = withSettings({ cabinetDepthMm: 600, handle: "black" });

    const kept = succeeded(
      replaceHandle({
        design: keeping,
        from: "black",
        to: "push",
        occurredAt: OCCURRED_AT,
      }),
    );
    const absent = succeeded(
      replaceHandle({
        design: following,
        from: "black",
        to: "push",
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(kept.design.settings).toEqual({
      cabinetDepthMm: 600,
      handle: "push",
      topRowHandle: "steel",
    });
    expect(absent.design.settings).toEqual({
      cabinetDepthMm: 600,
      handle: "push",
    });
    expect(absent.design.settings).not.toHaveProperty("topRowHandle");
  });

  it("is the same design but for the timestamp when the design stores no such handle", () => {
    const design = kitchenWearingBlack();

    const { design: after } = succeeded(
      replaceHandle({
        design,
        from: "push",
        to: "steel",
        occurredAt: OCCURRED_AT,
      }),
    );

    expect(after).toEqual({ ...design, updatedAt: OCCURRED_AT });
    expect(after.settings).toEqual(design.settings);
  });

  it("refuses a handle outside the declared set, returning the design as given", () => {
    const design = kitchenWearingBlack();

    const result = replaceHandle({
      design,
      from: "black",
      to: "gold" as Handle,
      occurredAt: OCCURRED_AT,
    });

    expect(result).toMatchObject({
      ok: false,
      reason: { code: "UNKNOWN_HANDLE" },
    });
    expect(result.design).toBe(design);
  });

  it("refuses a malformed timestamp before it looks at the handle", () => {
    const design = kitchenWearingBlack();

    const result = replaceHandle({
      design,
      from: "black",
      to: "gold" as Handle,
      occurredAt: "",
    });

    expect(result).toMatchObject({
      ok: false,
      reason: { code: "INVALID_OCCURRED_AT" },
    });
    expect(result.design).toBe(design);
  });
});
