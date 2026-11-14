// M12 wave W2 (owner feedback 2026-11-14, item 3; ADR 0183 decisions 1-3): generation hangs one wall cabinet over
// every placed freestanding fridge wherever the insert succeeds, and changes nothing else.
//
// **The oracle for "nothing else" is the generator as it stood before ADR 0183** (`support/before-adr-0183.ts`): the
// declaration read as absent, so the step is never attempted. The recordings in `qa-u3a-u-plan` and `qa-h2-…` show
// that switch reproduces the old kitchens byte for byte.
//
// This file sweeps round-number GRIDS of rooms (placement, the ceiling bands, what is not owed a cabinet, the step's
// role); `qa-m12-w2-over-the-fridge.adversarial.test.ts` owns the SEEDED odd-millimetre rooms and, over them, the
// switch at the lowest ceiling that fits, the replay and the "only an addition" comparison with the earlier generator.
//
// Every sweep keeps a floor per arm, so a grid that stopped reaching an arm fails instead of passing empty.
import { describe, expect, it, vi } from "vitest";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  GENERATION_PRIORITIES,
  isAWallBodyOwedOver,
  type BodyCatalog,
  type DesignRoom,
  type GenerateKitchenResult,
} from "../../src/index.js";
import { APPROVED_ROOM_POLICY } from "../../src/index.js";
import { beforeAdr0183 } from "../support/before-adr-0183.js";
import {
  DEPTHS_MM,
  FRIDGE_BUILD_ID,
  FRIDGE_STEP_ID,
  FRIDGE_TOP_MM,
  generate,
  HIGHEST_SHORTENED_CEILING_MM,
  LOWEST_CEILING_THAT_FITS_MM,
  MIDDLE_SHORTENED_CEILING_MM,
  NO_OPENING_THROUGH_MM,
  OPENING_TOP_MM,
  OVER_BODY_ROLE,
  OVER_BODY_STEP_ID,
  placementOf,
  Reach,
  spansOverlap,
  stepNamed,
  WALL_CABINET_BUILD_ID,
} from "../support/over-the-fridge.js";

vi.mock("../../src/wall-body-over-it.js", async (importOriginal) => {
  const { withTheDeclarationSwitchable } = await import(
    "../support/before-adr-0183.js"
  );
  return withTheDeclarationSwitchable(await importOriginal());
});

const WALL_ROW_FLOOR_MM = 1500;
const OVEN_BUILD_IDS: ReadonlySet<string> = new Set([
  "base-hob-oven",
  "tall-oven-tower",
]);
const STEP_ONE_ROLES: ReadonlySet<string> = new Set([
  ...GENERATION_PRIORITIES.map((priority) => priority.role),
  "storage",
]);

type Shape = DesignRoom["shape"];
type Generated = Extract<GenerateKitchenResult, { ok: true }>;

const WIDTHS_MM = [2400, 2800, 3200, 3600, 4000, 4400, 4800, 5200, 5600, 6000];
const DEPTHS_ROOM_MM = [1800, 2200, 2800, 3000, 3400, 3800, 4200, 4600, 5000];
const U_WIDTHS_MM = [2400, 3200, 4000, 4800, 5600];
const U_SIDES_MM = [1800, 2800, 3400, 4200, 5000];
/** Ceilings that get a shortened cabinet, ceilings at and above the grid's last level, and two well above it. */
const CEILINGS_MM = [
  LOWEST_CEILING_THAT_FITS_MM,
  MIDDLE_SHORTENED_CEILING_MM,
  HIGHEST_SHORTENED_CEILING_MM,
  OPENING_TOP_MM,
  OPENING_TOP_MM + 200,
  OPENING_TOP_MM + 400,
];

function roomsAt(heightMm: number): DesignRoom[] {
  const rooms: DesignRoom[] = [];
  for (const widthMm of WIDTHS_MM) {
    for (const depthMm of DEPTHS_ROOM_MM) {
      rooms.push({ shape: "L", widthMm, depthMm, heightMm });
    }
    rooms.push({ shape: "linear", widthMm, depthMm: 3400, heightMm });
  }
  for (const widthMm of U_WIDTHS_MM) {
    for (const depthMm of U_SIDES_MM) {
      for (const wallCMm of U_SIDES_MM) {
        rooms.push({ shape: "U", widthMm, depthMm, wallCMm, heightMm });
      }
    }
  }
  return rooms;
}

/** The generator before ADR 0183, or `undefined` where it throws (a room it never generated). */
function generateBefore(room: DesignRoom, cabinetDepthMm: number) {
  try {
    return beforeAdr0183(() => generate(room, cabinetDepthMm));
  } catch {
    return undefined;
  }
}

function overBodyStepsOf(result: GenerateKitchenResult) {
  return result.log.steps.filter((step) => step.role === OVER_BODY_ROLE);
}

describe("a body over the freestanding fridge is owed by its catalogue row (W2-1 declaration)", () => {
  it("is declared on both freestanding fridge rows and on no other row", () => {
    const catalog = buildKitchenLBodyCatalog(600);
    const declaring = [...catalog]
      .filter(([, definition]) => isAWallBodyOwedOver(definition))
      .map(([buildId, definition]) => [buildId, definition.kind]);

    expect(declaring).toEqual([
      ["fridge-free-700", "fridge_freestanding"],
      [FRIDGE_BUILD_ID, "fridge_freestanding"],
    ]);
  });

  it("reads an absent declaration and an absent row as none owed", () => {
    expect(isAWallBodyOwedOver(undefined)).toBe(false);
    expect(isAWallBodyOwedOver({})).toBe(false);
  });
});

describe("from the lowest ceiling that fits, one wall cabinet stands over the fridge (W2-1)", () => {
  const reach = new Reach();

  for (const cabinetDepthMm of DEPTHS_MM) {
    it(`over L, straight and U rooms at ${String(cabinetDepthMm)} mm, on the fridge's wall, span and top`, () => {
      for (const heightMm of CEILINGS_MM) {
        for (const room of roomsAt(heightMm)) {
          const result = generate(room, cabinetDepthMm);
          if (!result.ok) continue;
          const fridgeStep = stepNamed(result, FRIDGE_STEP_ID);
          if (fridgeStep?.status !== "placed") continue;
          const fridge = placementOf(result.design, fridgeStep);
          const fridgeTopMm = fridge.y0Mm + FRIDGE_TOP_MM;
          const over = result.design.placements.filter(
            (placement) =>
              spansOverlap(placement, fridge) &&
              placement.y0Mm >= fridgeTopMm &&
              placement.id !== fridge.id,
          );

          // A large U's back wall carries no generated wall-row body (ADR 0110 N3 revised 11): the fridge stands on a side
          // wall of a U, so the cabinet over it never breaks that rule.
          if (room.shape === "U") expect(fridge.wall).not.toBe("A");
          expect(over, JSON.stringify(room)).toHaveLength(1);
          const [cabinet] = over;
          expect(cabinet?.body.buildId).toBe(WALL_CABINET_BUILD_ID);
          expect(cabinet?.wall).toBe(fridge.wall);
          expect(cabinet?.alongMm).toBe(fridge.alongMm);
          expect(cabinet?.body.widthMm).toBe(fridge.body.widthMm);
          expect(cabinet?.y0Mm).toBe(fridgeTopMm);
          expect(cabinet?.body.heightMm).toBe(
            Math.min(room.heightMm, OPENING_TOP_MM) - fridgeTopMm,
          );
          expect(
            overBodyStepsOf(result).map(({ id, status }) => [id, status]),
          ).toEqual([[OVER_BODY_STEP_ID, "placed"]]);
          reach.note(`${room.shape}@${String(cabinetDepthMm)}`);
          reach.note(`ceiling ${String(heightMm)}`);
        }
      }
    });
  }

  it("reached every shape at both depths and every ceiling, so the sweep above is not vacuous", () => {
    for (const shape of [
      "L",
      "linear",
      "U",
    ] as const satisfies readonly Shape[]) {
      for (const cabinetDepthMm of DEPTHS_MM) {
        expect(
          reach.of(`${shape}@${String(cabinetDepthMm)}`),
          `${shape} at ${String(cabinetDepthMm)}`,
        ).toBeGreaterThanOrEqual(20);
      }
    }
    for (const heightMm of CEILINGS_MM) {
      expect(reach.of(`ceiling ${String(heightMm)}`)).toBeGreaterThanOrEqual(
        20,
      );
    }
  });

  it("never logs the step as refused at or above the lowest ceiling that fits, whichever room is generated", () => {
    let attempted = 0;
    for (const heightMm of [
      LOWEST_CEILING_THAT_FITS_MM,
      HIGHEST_SHORTENED_CEILING_MM,
      OPENING_TOP_MM,
    ]) {
      for (const room of roomsAt(heightMm)) {
        const result = generate(room, 600);
        if (!result.ok) continue;
        for (const step of overBodyStepsOf(result)) {
          attempted += 1;
          expect(step.status, JSON.stringify(room)).toBe("placed");
        }
      }
    }
    expect(attempted).toBeGreaterThanOrEqual(300);
  });
});

describe("below the lowest ceiling that fits, the step is not placed, nothing throws and nothing else changes (W2-2)", () => {
  const SIZES: readonly DesignRoom[] = [
    { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: 0 },
    { shape: "L", widthMm: 6000, depthMm: 5000, heightMm: 0 },
    { shape: "L", widthMm: 2400, depthMm: 1800, heightMm: 0 },
    { shape: "linear", widthMm: 4200, depthMm: 3400, heightMm: 0 },
    { shape: "linear", widthMm: 2400, depthMm: 3400, heightMm: 0 },
    { shape: "U", widthMm: 4000, depthMm: 3000, wallCMm: 2800, heightMm: 0 },
    { shape: "U", widthMm: 5600, depthMm: 5000, wallCMm: 5000, heightMm: 0 },
  ];
  const MIN_CEILING_MM = APPROVED_ROOM_POLICY.heightBounds.minMm;
  const TIGHT_FROM_MM = LOWEST_CEILING_THAT_FITS_MM - 110;

  /** Every ceiling within 110 mm of the lowest that fits, and every tenth one below it. */
  function ceilingsBelowTheLine(): number[] {
    const ceilings: number[] = [];
    for (let mm = MIN_CEILING_MM; mm < LOWEST_CEILING_THAT_FITS_MM; mm += 1) {
      if (mm >= TIGHT_FROM_MM || mm % 10 === 0) ceilings.push(mm);
    }
    return ceilings;
  }

  it("logs the step not placed by the engine's own refusal or by no opening, and equals the earlier generator's design", () => {
    const reach = new Reach();
    for (const cabinetDepthMm of DEPTHS_MM) {
      for (const size of SIZES) {
        for (const heightMm of ceilingsBelowTheLine()) {
          const room = { ...size, heightMm };
          const before = generateBefore(room, cabinetDepthMm);
          if (before === undefined) {
            reach.note("the earlier generator throws");
            continue;
          }
          const now = generate(room, cabinetDepthMm);
          expect(now, JSON.stringify(room)).toBeDefined();
          if (!before.ok) {
            expect(now.ok).toBe(false);
            continue;
          }
          if (!now.ok) throw new Error(`${JSON.stringify(room)} was refused`);
          expect(now.design).toStrictEqual(before.design);
          const fridgeStep = stepNamed(now, FRIDGE_STEP_ID);
          if (fridgeStep?.status !== "placed") {
            expect(overBodyStepsOf(now)).toEqual([]);
            continue;
          }
          const [overStep, ...more] = overBodyStepsOf(now);
          expect(more).toEqual([]);
          expect(overStep?.status, JSON.stringify(room)).toBe("not_placed");
          if (overStep?.status !== "not_placed") continue;
          // A refusal is logged with its insert (as an upper's is) and a missing opening attempts none; either way
          // the command changes nothing, which the equal design above shows.
          const refusal = overStep.reason.code;
          expect(["OPENING_TOO_SHORT", "NO_OPENING"]).toContain(refusal);
          expect(overStep.commands).toHaveLength(
            refusal === "NO_OPENING" ? 0 : 1,
          );
          expect(now.log.commands).toStrictEqual([
            ...before.log.commands,
            ...overStep.commands,
          ]);
          reach.note(refusal);
          expect(
            now.log.steps.filter((step) => step.role !== OVER_BODY_ROLE),
          ).toStrictEqual(before.log.steps);
          reach.note(`checked ${room.shape}`);
        }
      }
    }
    for (const shape of ["L", "linear", "U"]) {
      expect(reach.of(`checked ${shape}`)).toBeGreaterThanOrEqual(50);
    }
    expect(reach.of("OPENING_TOO_SHORT")).toBeGreaterThanOrEqual(100);
  });

  // The approved policy's lowest ceiling is above the band where no void exists, but `generateKitchen` takes any room:
  // through `NO_OPENING_THROUGH_MM` there is no void over the fridge at all.
  it("logs no opening, and throws nowhere the earlier generator did not, in a room too low for any void over the fridge", () => {
    let checked = 0;
    for (const heightMm of [
      FRIDGE_TOP_MM + 50,
      NO_OPENING_THROUGH_MM - 150,
      NO_OPENING_THROUGH_MM,
    ]) {
      for (const size of SIZES) {
        const room = { ...size, heightMm };
        const before = generateBefore(room, 600);
        if (!before?.ok) continue;
        const now = generate(room, 600);
        if (!now.ok) throw new Error(`${JSON.stringify(room)} was refused`);
        expect(now.design).toStrictEqual(before.design);
        const [overStep] = overBodyStepsOf(now);
        if (overStep === undefined) continue;
        checked += 1;
        expect(overStep).toEqual({
          id: OVER_BODY_STEP_ID,
          role: OVER_BODY_ROLE,
          buildId: WALL_CABINET_BUILD_ID,
          status: "not_placed",
          reason: { code: "NO_OPENING", params: {} },
          commands: [],
        });
        expect(now.log.commands).toStrictEqual(before.log.commands);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(6);
  });

  it("stands nothing over the shortened cabinet, where no top row is generated", () => {
    let checked = 0;
    for (const room of roomsAt(MIDDLE_SHORTENED_CEILING_MM)) {
      const result = generate(room, 600);
      if (!result.ok) continue;
      const [overStep] = overBodyStepsOf(result);
      if (overStep?.status !== "placed") continue;
      const cabinet = placementOf(result.design, overStep);
      checked += 1;
      expect(
        result.design.placements.filter(
          (other) =>
            other.id !== cabinet.id &&
            spansOverlap(other, cabinet) &&
            other.y0Mm >= cabinet.y0Mm,
        ),
      ).toEqual([]);
      expect(result.log.steps.some((step) => step.role === "top")).toBe(false);
    }
    expect(checked).toBeGreaterThanOrEqual(100);
  });
});

describe("what is not owed a cabinet stays as it was (W2-4)", () => {
  it("attempts no top over the cabinet, and nothing over an oven tower, pantry or fridge housing", () => {
    const reach = new Reach();
    for (const cabinetDepthMm of DEPTHS_MM) {
      for (const room of roomsAt(OPENING_TOP_MM + 200)) {
        const result = generate(room, cabinetDepthMm);
        if (!result.ok) continue;
        const catalog = buildKitchenLBodyCatalog(
          cabinetDepthMmOf(result.design),
        );
        const topSteps = result.log.steps.filter((step) => step.role === "top");
        expect(
          topSteps.filter((step) => step.id.includes(OVER_BODY_ROLE)),
        ).toEqual([]);
        for (const step of topSteps) {
          const upperId = step.id.replace(/^top:/, "");
          const upper = result.log.steps.find(({ id }) => id === upperId);
          expect(["upper", "hood"]).toContain(upper?.role);
        }
        reach.note(`top steps ${topSteps.length > 0 ? "some" : "none"}`);
        expectNothingOverAnythingButTheFridge(result, catalog, reach);
        expect(
          result.design.placements.filter((placement) =>
            OVEN_BUILD_IDS.has(placement.body.buildId),
          ),
        ).toHaveLength(1);
      }
    }
    for (const buildId of ["tall-oven-tower", "tall-pantry"]) {
      expect(
        reach.of(`tall body ${buildId}, nothing over it`),
        buildId,
      ).toBeGreaterThanOrEqual(10);
    }
    expect(reach.of("top steps some")).toBeGreaterThanOrEqual(20);
  });

  it("gives a room whose fridge was dropped no step over a fridge, and generates it byte for byte as before", () => {
    let withoutAFridge = 0;
    for (const room of roomsAt(OPENING_TOP_MM + 200)) {
      const result = generate(room, 600);
      if (!result.ok || !result.log.plan.dropped.includes("fridge")) continue;
      withoutAFridge += 1;
      expect(overBodyStepsOf(result)).toEqual([]);
      expect(stepNamed(result, FRIDGE_STEP_ID)?.status).toBe("not_placed");
      expect(result).toStrictEqual(generateBefore(room, 600));
    }
    expect(withoutAFridge).toBeGreaterThanOrEqual(1);
  });
});

/** Nothing stands over a full-height body that declares no cabinet owed, read from the catalogue's declared top. */
function expectNothingOverAnythingButTheFridge(
  result: Generated,
  catalog: BodyCatalog,
  reach: Reach,
): void {
  const { placements } = result.design;
  for (const body of placements) {
    const definition = catalog.get(body.body.buildId);
    if (definition?.nominalHeightMm === undefined) continue;
    const topMm = body.y0Mm + definition.nominalHeightMm;
    if (body.y0Mm !== 0 || topMm <= WALL_ROW_FLOOR_MM) continue;
    if (isAWallBodyOwedOver(definition)) continue;
    const standingOver = placements.filter(
      (other) =>
        other !== body && spansOverlap(other, body) && other.y0Mm >= topMm,
    );
    expect(
      standingOver.map(({ id }) => id),
      `${body.body.buildId} ${body.id}`,
    ).toEqual([]);
    reach.note(`tall body ${body.body.buildId}, nothing over it`);
  }
}

describe("the Step 1 list does not count the step (W2-6)", () => {
  it("carries a role no Step 1 row names, a stable id, and a body that is not the dishwasher", () => {
    let seen = 0;
    for (const room of roomsAt(OPENING_TOP_MM + 200)) {
      const result = generate(room, 600);
      if (!result.ok) continue;
      for (const step of overBodyStepsOf(result)) {
        seen += 1;
        expect(STEP_ONE_ROLES.has(step.role)).toBe(false);
        expect(step.id).toBe(OVER_BODY_STEP_ID);
        expect(step.buildId).toBe(WALL_CABINET_BUILD_ID);
      }
      const stepOneRows = result.log.steps.filter((step) =>
        STEP_ONE_ROLES.has(step.role),
      );
      expect(stepOneRows.map((step) => step.id)).not.toContain(
        OVER_BODY_STEP_ID,
      );
    }
    expect(seen).toBeGreaterThanOrEqual(100);
  });

  it("logs the step after the uppers and before the top row, and the id set is unique", () => {
    const result = generate(
      { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: OPENING_TOP_MM },
      600,
    );
    if (!result.ok) throw new Error("the reference L was refused");
    const roles = result.log.steps.map((step) => step.role);

    expect(roles.indexOf(OVER_BODY_ROLE)).toBeGreaterThan(
      roles.lastIndexOf("upper"),
    );
    expect(roles.indexOf(OVER_BODY_ROLE)).toBeLessThan(roles.indexOf("top"));
    expect(new Set(result.log.steps.map(({ id }) => id)).size).toBe(
      result.log.steps.length,
    );
  });
});
