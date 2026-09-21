// **Frame 1F's six rows, proven without a browser** — M7 wave 7F4a slice 1, criteria 30, 31 and 32,
// and wave 7D5b slice SW, criteria W1–W5 (the dishwasher row, ADR 0110 Amendment M3).
//
// The model is pure, so everything here is a fold over a `GenerationLog`. Two of the logs are
// **really generated**, through the domain's own `generateKitchen` and this app's fake probe, because
// the claims about storage and about a dropped role are claims about what the engine actually
// produces for a room the owner ruled on — a hand-written log would prove the fold and not the fact.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  generateKitchen,
  GENERATION_PRIORITIES,
  type DesignRoom,
  type GenerationLog,
  type GenerationStep,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  droppedRolesIn,
  GENERATION_ROW_MESSAGE_KEY,
  GENERATION_STATUS_MESSAGE_KEY,
  pendingGenerationRows,
  resolveGenerationRows,
  type GenerationRow,
  type GenerationRowId,
} from "@/room/generation-model";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { REJECTION_CODES } from "../i18n/golden-output-fixtures";
import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-09-14T09:00:00.000Z";

/** The smallest room ADR 0108 Amendment E accepts, and the one the owner ruled the storage row on:
 *  two required bodies fit and nothing is left over for storage. */
const SMALLEST_ACCEPTED_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 900,
  depthMm: 2200,
  heightMm: 2200,
};

/** A room with room to spare, so storage is planned and every core priority is kept. */
const ROOMY_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 4200,
  depthMm: 3000,
  heightMm: 2500,
};

function logFor(room: DesignRoom): GenerationLog {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  return result.log;
}

function rowFor(
  rows: readonly GenerationRow[],
  rowId: GenerationRowId,
): GenerationRow {
  const row = rows.find((candidate) => candidate.id === rowId);
  if (row === undefined) throw new Error(`the list draws no ${rowId} row`);
  return row;
}

describe("the row set, before any log exists (criterion 29)", () => {
  it("draws one row per priority, then the dishwasher, then the storage row, in the domain's order", () => {
    expect(pendingGenerationRows().map((row) => row.id)).toEqual([
      ...GENERATION_PRIORITIES.map((priority) => priority.role),
      "dishwasher",
      "storage",
    ]);
  });

  it("shows each priority's declared width and never a number for storage", () => {
    const rows = pendingGenerationRows();

    expect(rowFor(rows, "sink").extent).toEqual({
      kind: "width",
      millimetres: GENERATION_PRIORITIES.find(
        (priority) => priority.role === "sink",
      )?.widthMm,
    });
    expect(rowFor(rows, "storage").extent).toEqual({ kind: "restOfWall" });
  });

  it("starts every row pending, so nothing resolves before the log does", () => {
    expect(
      pendingGenerationRows().every((row) => row.status === "pending"),
    ).toBe(true);
  });
});

describe("the resolved row set (criteria 30, 31, 32)", () => {
  it("keeps the pending list's roles and extents exactly, so no row moves when the log lands", () => {
    const resolved = resolveGenerationRows(logFor(ROOMY_ROOM));

    expect(resolved.map((row) => ({ id: row.id, extent: row.extent }))).toEqual(
      pendingGenerationRows().map((row) => ({
        id: row.id,
        extent: row.extent,
      })),
    );
  });

  it("resolves every row of a roomy kitchen as placed", () => {
    const rows = resolveGenerationRows(logFor(ROOMY_ROOM));

    expect(rows.map((row) => row.status)).toEqual(rows.map(() => "placed"));
  });

  it("draws the storage row as not placed when the room left nothing over", () => {
    const log = logFor(SMALLEST_ACCEPTED_ROOM);
    // The guard the assertion below would otherwise pass over: this room is only the owner's case
    // while the engine plans no storage for it.
    expect(log.steps.some((step) => step.role === "storage")).toBe(false);

    const rows = resolveGenerationRows(log);

    expect(rowFor(rows, "storage").status).toBe("not_placed");
    expect(rows).toHaveLength(pendingGenerationRows().length);
  });

  it("draws a dropped priority as not placed rather than removing its row", () => {
    const log = logFor(SMALLEST_ACCEPTED_ROOM);
    expect(droppedRolesIn(log)).toContain("fridge");

    expect(rowFor(resolveGenerationRows(log), "fridge").status).toBe(
      "not_placed",
    );
  });

  it("gives no row to an upper or a hood, however many the log carries", () => {
    const log = logFor(ROOMY_ROOM);
    expect(
      log.steps.filter((step) => step.role === "upper" || step.role === "hood")
        .length,
    ).toBeGreaterThan(0);

    expect(resolveGenerationRows(log)).toHaveLength(
      GENERATION_PRIORITIES.length + 2,
    );
  });
});

describe("a not-placed row is absent from the design (criterion 31)", () => {
  // The smallest accepted room rather than a comfortable one, because a comfortable one refuses
  // nothing and the assertion would sweep an empty set — the vacuous pass this file's guard below
  // exists to refuse.
  it("puts no refused step's body into the design that is handed on", () => {
    const result = generateKitchen({
      room: SMALLEST_ACCEPTED_ROOM,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
    });
    if (!result.ok) throw new Error("the owner's smallest room was refused");
    const refusedBuildIds = new Set(
      result.log.steps
        .filter((step) => step.status === "not_placed")
        .map((step) => step.buildId),
    );
    expect(refusedBuildIds.size).toBeGreaterThan(0);

    expect(
      result.design.placements.filter((placement) =>
        refusedBuildIds.has(placement.body.buildId),
      ),
    ).toEqual([]);
  });

  it("places every step it logged as placed, and reports the id it placed it at", () => {
    const result = generateKitchen({
      room: ROOMY_ROOM,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
    });
    if (!result.ok) throw new Error("a roomy L was refused");
    // **Containment, not equality, and the difference is the shell.** `buildLShellDesign` seeds the
    // corner's structural pieces before any command runs (`shell-design.ts:136`), so the design
    // legitimately carries three placements no step reports. What the log must account for is every
    // placement it *claims*.
    const placedIds = result.log.steps
      .filter((step) => step.status === "placed")
      .map((step) => step.placementId);
    const designIds = new Set(
      result.design.placements.map((placement) => placement.id),
    );

    expect(placedIds.filter((id) => !designIds.has(id))).toEqual([]);
  });
});

describe("every row the model draws is named in both catalogues (criterion 30)", () => {
  it.each(Object.entries(GENERATION_ROW_MESSAGE_KEY))(
    "resolves %s to a leaf that exists",
    (_role, key) => {
      expect(leafAt(roMessages, key)).toBeTypeOf("string");
      expect(leafAt(ruMessages, key)).toBeTypeOf("string");
    },
  );

  it.each(Object.entries(GENERATION_STATUS_MESSAGE_KEY))(
    "resolves the %s status to a leaf that exists",
    (_status, key) => {
      expect(leafAt(roMessages, key)).toBeTypeOf("string");
      expect(leafAt(ruMessages, key)).toBeTypeOf("string");
    },
  );
});

/** A catalogue leaf by its dotted key, returning `undefined` rather than throwing — the assertions
 *  above are what report a missing leaf, and they name the key when they do. */
function leafAt(catalogue: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (branch, segment) =>
        typeof branch === "object" && branch !== null
          ? (branch as Record<string, unknown>)[segment]
          : undefined,
      catalogue,
    );
}

/** Every role a `GenerationStep` can carry, including the two the model draws no row for. Spelled as
 *  a `satisfies` over the domain's own union so a role added there fails to compile here rather than
 *  quietly leaving the sweep one case short. */
const EVERY_STEP_ROLE = [
  "fridge",
  "sink",
  "preparation",
  "hob",
  "storage",
  "upper",
  "hood",
] as const satisfies readonly GenerationStep["role"][];

/** Every reason a step can be refused for: the engine's three planning reasons, plus the rejection
 *  codes the catalogue carries copy for — `golden-output-fixtures.ts`' list, which is itself held to
 *  the domain's union by a `satisfies` and a reverse exhaustiveness check. */
const EVERY_REFUSAL_CODE = [
  "DROPPED_FOR_FIT",
  "MINIMUM_NOT_MET",
  "BASE_NOT_PLACED",
  ...REJECTION_CODES,
] as const;

type RefusedStep = Extract<GenerationStep, { readonly status: "not_placed" }>;

/**
 * A refused step carrying one named code.
 *
 * **The one cast in this file, and what it stands in for.** `RejectionReason` pairs each code with
 * its own params — `WIDTH_TOO_LARGE` carries a fit, `BAND_MISMATCH` a band — so a faithful table of
 * all thirty-eight would be a second copy of the domain's union maintained here. The model under test
 * **never reads `params`**: it asks whether a step placed, and a refused step did not. The cast
 * therefore asserts exactly what the property sweeps — the code — and invents nothing else. If the
 * model ever starts reading a reason, this is the line that has to be replaced first.
 */
function refusedStep(
  role: GenerationStep["role"],
  code: (typeof EVERY_REFUSAL_CODE)[number],
): GenerationStep {
  return {
    id: `${role}:${code}`,
    role,
    buildId: "base-cabinet",
    status: "not_placed",
    reason: { code, params: {} } as unknown as RefusedStep["reason"],
    commands: [],
  };
}

function placedStep(role: GenerationStep["role"]): GenerationStep {
  return {
    id: `${role}:placed`,
    role,
    buildId: "base-cabinet",
    status: "placed",
    placementId: `placement:${role}`,
    commands: [],
  };
}

/** A log holding exactly the steps it is handed. The plan is the refusal plan's shape — no bases,
 *  nothing dropped — because the property sweeps the *steps* and the fold reads no plan. */
function logOf(steps: readonly GenerationStep[]): GenerationLog {
  return {
    occurredAt: OCCURRED_AT,
    plan: {
      room: SMALLEST_ACCEPTED_ROOM,
      bases: [],
      floorWidthsMm: { A: [], B: [] },
      dropped: [],
      minimumMet: false,
      remainderMm: { A: 0, B: 0 },
    },
    steps,
    commands: [],
  };
}

describe("the fold is total over every role and every reason (criterion 30)", () => {
  const anyStep = fc.oneof(
    fc
      .constantFrom(...EVERY_STEP_ROLE)
      .map((role): GenerationStep => placedStep(role)),
    fc
      .tuple(
        fc.constantFrom(...EVERY_STEP_ROLE),
        fc.constantFrom(...EVERY_REFUSAL_CODE),
      )
      .map(([role, code]): GenerationStep => refusedStep(role, code)),
  );

  propertyTest.prop([fc.array(anyStep, { maxLength: 24 })])(
    "answers with the same six rows, in the same order, for any log",
    (steps) => {
      const rows = resolveGenerationRows(logOf(steps));

      expect(rows.map((row) => row.id)).toEqual(
        pendingGenerationRows().map((row) => row.id),
      );
      expect(
        rows.every(
          (row) => row.status === "placed" || row.status === "not_placed",
        ),
      ).toBe(true);
    },
  );

  propertyTest.prop([
    fc.constantFrom(...EVERY_STEP_ROLE),
    fc.constantFrom(...EVERY_REFUSAL_CODE),
  ])(
    "reads a role's row as placed exactly when a step for it placed",
    (role, code) => {
      const placedRows = resolveGenerationRows(logOf([placedStep(role)]));
      const refusedRows = resolveGenerationRows(
        logOf([refusedStep(role, code)]),
      );

      const drawnRows = new Set<string>(placedRows.map((row) => row.id));
      const isDrawn = drawnRows.has(role);
      expect(
        placedRows
          .filter((row) => row.status === "placed")
          .map((row) => row.id),
      ).toEqual(isDrawn ? [role] : []);
      expect(refusedRows.every((row) => row.status === "not_placed")).toBe(
        true,
      );
    },
  );
});

/**
 * **Wave 7D5b slice SW: the dishwasher row** (ADR 0110 Amendment M3), over the plan's own witness
 * rooms, each really generated. The body and its width are spelled here as literals rather than
 * imported, because they are the expectation (ADR 0121 decision 4); criterion W5 bars them from
 * `apps/web/src` only.
 */
describe("the dishwasher row (7D5b SW, criteria W1–W4)", () => {
  const DISHWASHER_BODY = "base-dishwasher";
  const DISHWASHER_WIDTH_MM = 600;

  /** Criterion 1's witness for M1 across the corner, and W3's: its dishwasher is its only
   *  storage-role body. */
  const CONVERTED_ACROSS_THE_CORNER: DesignRoom = {
    shape: "L",
    widthMm: 1500,
    depthMm: 2800,
    heightMm: 2600,
  };
  /** Criterion 1's witness for (e), the drawer swap: *sink · dishwasher · pan-drawer · hob*. */
  const DRAWER_SWAPPED: DesignRoom = {
    shape: "L",
    widthMm: 900,
    depthMm: 3400,
    heightMm: 2600,
  };
  /** Criterion 2's witness: a door cabinet stands, but not beside the sink, so no dishwasher. */
  const DOOR_CABINET_ELSEWHERE: DesignRoom = {
    shape: "L",
    widthMm: 1500,
    depthMm: 3500,
    heightMm: 2600,
  };

  function placedSteps(log: GenerationLog): readonly GenerationStep[] {
    return log.steps.filter((step) => step.status === "placed");
  }

  function holdsPlacedDishwasher(log: GenerationLog): boolean {
    return placedSteps(log).some((step) => step.buildId === DISHWASHER_BODY);
  }

  it("draws six rows in the plan's order, pending and resolved alike (W1)", () => {
    const expectedOrder = [
      "fridge",
      "sink",
      "preparation",
      "hob",
      "dishwasher",
      "storage",
    ];

    expect(pendingGenerationRows().map((row) => row.id)).toEqual(expectedOrder);
    expect(
      resolveGenerationRows(logFor(CONVERTED_ACROSS_THE_CORNER)).map(
        (row) => row.id,
      ),
    ).toEqual(expectedOrder);
  });

  it("shows the dishwasher at 600 mm before and after the log lands (W1)", () => {
    const expected = { kind: "width", millimetres: DISHWASHER_WIDTH_MM };

    expect(rowFor(pendingGenerationRows(), "dishwasher").extent).toEqual(
      expected,
    );
    expect(
      rowFor(resolveGenerationRows(logFor(DRAWER_SWAPPED)), "dishwasher")
        .extent,
    ).toEqual(expected);
  });

  it.each([
    ["an M1 conversion across the corner", CONVERTED_ACROSS_THE_CORNER],
    ["an (e) drawer swap", DRAWER_SWAPPED],
  ])(
    "reads placed where the plan holds a dishwasher: %s (W2)",
    (_case, room) => {
      const log = logFor(room);
      expect(holdsPlacedDishwasher(log)).toBe(true);

      expect(rowFor(resolveGenerationRows(log), "dishwasher").status).toBe(
        "placed",
      );
    },
  );

  it("reads not placed where the plan holds none, though storage stands (W2)", () => {
    const log = logFor(DOOR_CABINET_ELSEWHERE);
    // Both guards make this room discriminating: a row keyed on role `storage` would read placed here.
    expect(holdsPlacedDishwasher(log)).toBe(false);
    expect(placedSteps(log).some((step) => step.role === "storage")).toBe(true);

    expect(rowFor(resolveGenerationRows(log), "dishwasher").status).toBe(
      "not_placed",
    );
  });

  it("keys the row on the body, so renaming the step id leaves it placed (W2 (b))", () => {
    const renamed: GenerationStep = {
      id: "renamed-by-a-later-planner",
      role: "storage",
      buildId: DISHWASHER_BODY,
      status: "placed",
      placementId: "placement:renamed",
      commands: [],
    };

    expect(
      rowFor(resolveGenerationRows(logOf([renamed])), "dishwasher").status,
    ).toBe("placed");
  });

  it("leaves Depozitare not placed where the dishwasher is the only storage-role body (W3)", () => {
    const log = logFor(CONVERTED_ACROSS_THE_CORNER);
    const storageRoleBodies = placedSteps(log)
      .filter((step) => step.role === "storage")
      .map((step) => step.buildId);
    // The discriminating guard: the room is W3's case only while this is its whole storage.
    expect(storageRoleBodies).toEqual([DISHWASHER_BODY]);

    expect(rowFor(resolveGenerationRows(log), "storage").status).toBe(
      "not_placed",
    );
  });

  it("keeps Blat de lucru placed in an (e) room, and never names the dishwasher as dropped (W4)", () => {
    const log = logFor(DRAWER_SWAPPED);

    expect(rowFor(resolveGenerationRows(log), "preparation").status).toBe(
      "placed",
    );
    expect(droppedRolesIn(log)).not.toContain("dishwasher");
  });
});
