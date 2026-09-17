// **Adversarial QA for M7 wave 7F4a — does a row ever lie about the kitchen behind it?**
//
// `generation-model.test.ts` proves the fold is *total* (criterion 30) and checks two hand-picked
// rooms against the real engine. What it does not do is ask, over **many** rooms, whether the five
// words the customer reads are true of the design they are about to be handed. That is this file:
// every claim below is checked against a genuinely generated log and its design, swept across the
// approved L rectangle rather than sampled at two points.
//
// The probe is `createFakeProbeFactory` — the same one the wave's own model tests use. Criterion 34
// is what runs the real adapter kit, in `packages/three-adapter/tests`; nothing here is a claim about
// measured carcasses.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildLShellDesign,
  generateKitchen,
  GENERATION_PRIORITIES,
  type DesignRoom,
  type GenerateKitchenResult,
  type GenerationBaseRole,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  pendingGenerationRows,
  resolveGenerationRows,
  type GenerationRow,
} from "@/room/generation-model";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-09-14T09:00:00.000Z";

/** `APPROVED_ROOM_POLICY`'s own L bounds, as the numbers a customer may type. Spelled rather than
 *  read off the policy so a policy that widens does not silently widen this sweep's claims too —
 *  and moved here deliberately when M7 7A3 applied the owner's 6000 mm per wall (ADR 0120 B2). */
const APPROVED_L = {
  wallAMm: { min: 900, max: 6000 },
  wallBMm: { min: 1000, max: 6000 },
  heightMm: { min: 2200, max: 3900 },
} as const;

/** Keeps the sweep inside a few seconds: each run builds a shell, a catalogue and up to two dozen
 *  commands through the real void engine. */
const SWEEP_RUNS = 40;

const anyApprovedRoom = fc
  .record({
    widthMm: fc.integer(APPROVED_L.wallAMm),
    depthMm: fc.integer(APPROVED_L.wallBMm),
    heightMm: fc.integer(APPROVED_L.heightMm),
  })
  .map(
    (lengths): DesignRoom => ({
      shape: "L",
      ...lengths,
    }),
  );

function generateFor(room: DesignRoom): GenerateKitchenResult {
  return generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

function statusOf(
  rows: readonly GenerationRow[],
  role: GenerationBaseRole,
): string {
  const row = rows.find((candidate) => candidate.role === role);
  if (row === undefined) throw new Error(`the list draws no ${role} row`);
  return row.status;
}

/** The placement ids the log claims it created, and the ids the design actually holds. A row's word
 *  is only worth anything if these two agree. */
function placementLedgerFor(result: GenerateKitchenResult): {
  readonly claimed: readonly string[];
  readonly present: readonly string[];
} {
  const claimed = result.log.steps
    .filter((step) => step.status === "placed")
    .map((step) => step.placementId);
  const present = result.ok
    ? result.design.placements.map((placement) => placement.id)
    : [];
  return { claimed, present };
}

describe("a row's word against the design behind it, swept over the approved rectangle", () => {
  propertyTest.prop([anyApprovedRoom], { numRuns: SWEEP_RUNS })(
    "puts every body the design holds behind exactly one placed step, or behind the shell that preceded them",
    (room) => {
      const result = generateFor(room);
      fc.pre(result.ok);
      const { claimed, present } = placementLedgerFor(result);
      // **The corner bodies are the shell's, not a step's, and this is the reason the claim is not a
      // plain bijection.** `buildLShellDesign` seats `base-corner-x-900`, `base-corner-return-320`
      // and `wall-corner-return-570` before the first command runs, so a design that generated
      // nothing at all still holds three placements. Rebuilt here from the log's own plan — exactly
      // as `replayGenerationLog` rebuilds it — rather than pattern-matched on an id prefix.
      const shell = buildLShellDesign({
        room,
        occurredAt: OCCURRED_AT,
        compositionPlan: { floorWidthsMm: result.log.plan.floorWidthsMm },
      });
      const fromTheShell = shell.placements.map((placement) => placement.id);

      // A bijection over what generation added. An inclusion in either direction alone would let the
      // log carry a placement the design never received (a row reading *inclus* over nothing) or the
      // design carry a generated body no row accounts for.
      expect([...present].sort()).toEqual([...claimed, ...fromTheShell].sort());
    },
  );

  propertyTest.prop([anyApprovedRoom], { numRuns: SWEEP_RUNS })(
    "reads a row as placed exactly when the design holds a body that step created",
    (room) => {
      const result = generateFor(room);
      const rows = resolveGenerationRows(result.log);
      const present = new Set(placementLedgerFor(result).present);

      for (const row of rows) {
        const anyBodyReachedTheDesign = result.log.steps.some(
          (step) =>
            step.role === row.role &&
            step.status === "placed" &&
            present.has(step.placementId),
        );
        expect(
          row.status === "placed",
          `${row.role} in ${String(room.widthMm)} × ${String(room.depthMm)}`,
        ).toBe(result.ok && anyBodyReachedTheDesign);
      }
    },
  );

  propertyTest.prop([anyApprovedRoom], { numRuns: SWEEP_RUNS })(
    "never hands on a kitchen whose sink or hob row reads not placed",
    (room) => {
      const result = generateFor(room);
      fc.pre(result.ok);
      const rows = resolveGenerationRows(result.log);

      // The two `required: true` priorities. A design handed to the editor without one of them is a
      // kitchen the engine's own minimum says cannot exist, and the customer would have read the
      // refusal on the way there.
      expect(statusOf(rows, "sink")).toBe("placed");
      expect(statusOf(rows, "hob")).toBe("placed");
    },
  );

  propertyTest.prop([anyApprovedRoom], { numRuns: SWEEP_RUNS })(
    "shows each resolved row at its declared width, whatever width the room made it",
    (room) => {
      const resolved = resolveGenerationRows(generateFor(room).log);

      // **Asserted against `GENERATION_PRIORITIES` and not against `pendingGenerationRows()`.** Both
      // row sets come out of the same private builder, so comparing them to each other is satisfied
      // by construction and would stay green with every width replaced by the same wrong number —
      // measured, by replacing storage's *restul peretelui* with a 600 and watching that comparison
      // pass. Criterion 29's claim is that a **resolved** row shows the declared width, and the
      // declaration lives in the domain.
      expect(resolved.map((row) => [row.role, row.extent])).toEqual([
        ...GENERATION_PRIORITIES.map((priority) => [
          priority.role,
          { kind: "width", millimetres: priority.widthMm },
        ]),
        ["storage", { kind: "restOfWall" }],
      ]);
      expect(resolved.map((row) => row.extent)).toEqual(
        pendingGenerationRows().map((row) => row.extent),
      );
    },
  );
});

describe("the storage row's aggregate, at the transition rather than at a sample", () => {
  /** Wall B at the smallest accepted length, with wall A stepped in 50 mm increments across the
   *  point where the leftover rule first has room for a storage cabinet. A discrete pair of examples
   *  would sit on one side of this and never see it move. */
  const SWEPT_WALL_A_MM = Array.from(
    { length: 41 },
    (_, index) => 900 + index * 50,
  );

  it.each(SWEPT_WALL_A_MM.map((wallAMm) => [wallAMm]))(
    "reads placed at wall A = %i mm exactly when a storage body is in the design",
    (wallAMm) => {
      const result = generateFor({
        shape: "L",
        widthMm: wallAMm,
        depthMm: 2200,
        heightMm: 2200,
      });
      const rows = resolveGenerationRows(result.log);
      const present = new Set(placementLedgerFor(result).present);
      const storageBodiesInTheDesign = result.log.steps.filter(
        (step) =>
          step.role === "storage" &&
          step.status === "placed" &&
          present.has(step.placementId),
      );

      expect(statusOf(rows, "storage") === "placed").toBe(
        storageBodiesInTheDesign.length > 0,
      );
      // R11's aggregate: however many cabinets the leftover rule planned, there is one row.
      expect(rows.filter((row) => row.role === "storage")).toHaveLength(1);
    },
  );

  it("crosses the transition at least once, so the sweep above is not one-sided", () => {
    const storagePlacedAt = SWEPT_WALL_A_MM.map(
      (wallAMm) =>
        statusOf(
          resolveGenerationRows(
            generateFor({
              shape: "L",
              widthMm: wallAMm,
              depthMm: 2200,
              heightMm: 2200,
            }).log,
          ),
          "storage",
        ) === "placed",
    );

    expect(new Set(storagePlacedAt)).toEqual(new Set([false, true]));
  });
});

describe("the five rows are the priorities and the aggregate, and nothing the log invents", () => {
  propertyTest.prop([anyApprovedRoom], { numRuns: SWEEP_RUNS })(
    "draws no row for a role the frame has none for, however many the log carries",
    (room) => {
      const rows = resolveGenerationRows(generateFor(room).log);

      expect(rows.map((row) => row.role)).toEqual([
        ...GENERATION_PRIORITIES.map((priority) => priority.role),
        "storage",
      ]);
    },
  );
});
